'use strict';
// Runs inside the staging verifier with generated credentials, never prints secrets.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const env = process.env;
let stage = 'postgres';
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
async function request(url, options = {}) {
  const { timeout = 5000, ...fetchOptions } = options;
  return fetch(url, { ...fetchOptions, signal: AbortSignal.timeout(timeout) });
}
async function object(method, path, body = '') {
  const url = new URL(path, env.OBJECT_STORAGE_ENDPOINT);
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = date.slice(0, 8), payload = digest(body), scope = `${day}/us-east-1/s3/aws4_request`;
  const canonical = `${method}\n${url.pathname}\n\nhost:${url.host}\nx-amz-content-sha256:${payload}\nx-amz-date:${date}\n\nhost;x-amz-content-sha256;x-amz-date\n${payload}`;
  const key = hmac(hmac(hmac(hmac(`AWS4${env.MINIO_ROOT_PASSWORD}`, day), 'us-east-1'), 's3'), 'aws4_request');
  const signature = hmac(key, `AWS4-HMAC-SHA256\n${date}\n${scope}\n${digest(canonical)}`).toString('hex');
  return request(url, { method, headers: { 'x-amz-content-sha256': payload, 'x-amz-date': date,
    authorization: `AWS4-HMAC-SHA256 Credential=${env.MINIO_ROOT_USER}/${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}` }, ...(method === 'PUT' ? { body } : {}) });
}
async function main() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  const result = { postgres: (await pool.query('SHOW server_version')).rows[0].server_version };
  await pool.end();
  stage = 'redis';
  const { Queue } = require('bullmq');
  const queue = new Queue(env.DEPLOYMENT_QUEUE_NAME, { connection: { url: env.REDIS_URL, connectTimeout: 5000, retryStrategy: () => null } });
  await queue.getJobCounts();
  const client = await queue.client;
  assert.equal(await client.ping(), 'PONG');
  result.redis = (await client.info('server')).match(/redis_version:([^\r]+)/)[1];
  await queue.close();
  stage = 'application-health-and-metrics';
  for (const [service, port, paths] of [['api',3000,['/api/v1/health','/api/v1/ready']],['worker',3002,['/health','/ready']]]) {
    for (const path of paths) assert.equal((await request(`http://${service}:${port}${path}`)).status, 200);
    const metricsUrl = `http://${service}:${port}${service === 'api' ? '/api/v1/internal/metrics' : '/metrics'}`;
    assert.equal((await request(metricsUrl)).status, 404);
    assert.equal((await request(metricsUrl,{headers:{'x-metrics-token':env.METRICS_TOKEN}})).status, 200);
    result[service] = 'healthy';
  }
  stage = 'object-storage';
  const bucket = `/${env.OBJECT_STORAGE_BUCKET}`;
  assert.ok([200,409].includes((await object('PUT',bucket)).status));
  const objectPath = `${bucket}/phase2-health-${crypto.randomUUID()}`;
  assert.equal((await object('PUT',objectPath,'phase2-isolated-storage')).status, 200);
  assert.equal(await (await object('GET',objectPath)).text(), 'phase2-isolated-storage');
  assert.equal((await object('DELETE',objectPath)).status, 204);
  assert.equal((await request(`${env.OBJECT_STORAGE_ENDPOINT}${bucket}`)).status, 403);
  result.objectStorage = 'authenticated PUT/GET/DELETE; anonymous denied';
  stage = 'registry';
  const endpoint = env.REGISTRY_ENDPOINT, repo = env.REGISTRY_REPOSITORY;
  const headers = { authorization: `Basic ${Buffer.from(`${env.REGISTRY_USER}:${env.REGISTRY_PASSWORD}`).toString('base64')}` };
  assert.equal((await request(`${endpoint}/v2/`)).status, 401);
  assert.equal((await request(`${endpoint}/v2/`,{ headers })).status, 200);
  const config = JSON.stringify({ architecture: 'amd64', os: 'linux', rootfs: { type: 'layers', diff_ids: [] }, config: {} });
  const configDigest = `sha256:${digest(config)}`;
  const upload = await request(`${endpoint}/v2/${repo}/blobs/uploads/`, { method:'POST', headers });
  assert.equal(upload.status, 202);
  const location = new URL(upload.headers.get('location'), endpoint); location.searchParams.set('digest',configDigest);
  assert.equal((await request(location,{ method:'PUT',headers:{...headers,'content-type':'application/octet-stream'},body:config })).status,201);
  const manifest = JSON.stringify({ schemaVersion:2,mediaType:'application/vnd.oci.image.manifest.v1+json',config:{mediaType:'application/vnd.oci.image.config.v1+json',digest:configDigest,size:Buffer.byteLength(config)},layers:[] });
  assert.equal((await request(`${endpoint}/v2/${repo}/manifests/smoke`,{method:'PUT',headers:{...headers,'content-type':'application/vnd.oci.image.manifest.v1+json'},body:manifest})).status,201);
  const pulled = await request(`${endpoint}/v2/${repo}/manifests/smoke`,{headers:{...headers,accept:'application/vnd.oci.image.manifest.v1+json'}});
  assert.equal(pulled.status,200); assert.equal(digest(await pulled.text()),digest(manifest));
  assert.equal(digest(await (await request(`${endpoint}/v2/${repo}/blobs/${configDigest}`,{headers,timeout:120000})).text()),digest(config));
  result.registry = { authenticatedPushPull: true, anonymousRejected: true, syntheticImage: `sha256:${digest(manifest)}` };
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error(`Staging dependency smoke failed at ${stage} (credentials suppressed)`); process.exit(1); });
