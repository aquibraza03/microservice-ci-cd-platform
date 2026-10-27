'use strict';
// Versioned manifest generator; emits Kubernetes JSON (also valid YAML).
function manifests(t, state, image) {
  const ns = t.namespace, fp = state.fingerprint;
  const labels = { 'phase2.environment': t.environmentId, 'phase2.fingerprint': fp.slice(0, 63) };
  const meta = name => ({ name, namespace: ns, labels });
  const all = [{ apiVersion: 'v1', kind: 'Namespace', metadata: { name: ns, labels: { ...labels, 'pod-security.kubernetes.io/enforce': 'baseline' }, annotations: { 'phase2.fingerprint': fp } } },
    { apiVersion: 'v1', kind: 'ConfigMap', metadata: meta('fingerprint'), data: { fingerprint: fp, environment: 'staging', deploymentId: state.deploymentId } }];
  const env = [ { configMapRef: { name: 'runtime' } }, { secretRef: { name: 'runtime' } } ];
  const secrets = (...names) => names.map(name => ({ name, valueFrom: { secretKeyRef: { name: 'runtime', key: name } } }));
  const httpProbe = (path, port) => ({ httpGet: { path, port }, periodSeconds: 5, timeoutSeconds: 3, failureThreshold: 6 });
  const execProbe = command => ({ exec: { command: ['sh', '-ec', command] }, periodSeconds: 5, timeoutSeconds: 3, failureThreshold: 6 });
  function workload(name, img, port, options = {}) {
    all.push({ apiVersion: 'v1', kind: 'ServiceAccount', metadata: meta(name), automountServiceAccountToken: false });
    if (options.storage) all.push({ apiVersion: 'v1', kind: 'PersistentVolumeClaim', metadata: meta(name), spec: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: options.storage } } } });
    const c = { name, image: img, imagePullPolicy: 'IfNotPresent', ports: port ? [{ containerPort: port }] : [],
      resources: { requests: { cpu: options.cpu || '50m', memory: options.memory || '64Mi' }, limits: { cpu: options.maxCpu || '500m', memory: options.maxMemory || '256Mi' } },
      securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ['ALL'] }, ...(options.root ? {} : { runAsNonRoot: true, runAsUser: options.uid || 1000 }) },
      ...options.container };
    if (options.probe) { c.readinessProbe = options.probe; c.livenessProbe = { ...(options.live || options.probe), failureThreshold: 12 }; c.startupProbe = { ...options.probe, failureThreshold: 60 }; }
    if (options.mount) c.volumeMounts = [{ name: 'data', mountPath: options.mount }];
    all.push({ apiVersion: 'apps/v1', kind: 'Deployment', metadata: meta(name), spec: { replicas: 1, strategy: { type: 'Recreate' }, selector: { matchLabels: { app: name } }, template: { metadata: { labels: { ...labels, app: name } }, spec: {
      serviceAccountName: name, automountServiceAccountToken: false, securityContext: { seccompProfile: { type: 'RuntimeDefault' }, ...(options.root ? {} : { fsGroup: options.uid || 1000 }) },
      containers: [c], ...(options.storage ? { volumes: [{ name: 'data', persistentVolumeClaim: { claimName: name } }] } : {}), ...options.pod } } } });
    if (port) all.push({ apiVersion: 'v1', kind: 'Service', metadata: meta(name), spec: { selector: { app: name }, ports: [{ port, targetPort: port }], type: 'ClusterIP' } });
  }
  workload('postgres', t.images.postgres, 5432, { uid: 70, memory: '128Mi', maxMemory: '384Mi', storage: '1Gi', mount: '/var/lib/postgresql/data',
    probe: execProbe('pg_isready -U phase2_staging -d phase2_staging'), container: { env: [...secrets('POSTGRES_PASSWORD'), {name:'POSTGRES_USER',value:'phase2_staging'}, {name:'POSTGRES_DB',value:t.database}, { name: 'PGDATA', value: '/var/lib/postgresql/data/pgdata' }] } });
  workload('redis', t.images.redis, 6379, { uid: 999, storage: '256Mi', mount: '/data', probe: execProbe('REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping | grep -qx PONG'),
    container: { env: secrets('REDIS_PASSWORD'), command: ['sh', '-ec', 'exec redis-server --appendonly yes --requirepass "$REDIS_PASSWORD"'] } });
  workload('object-storage', t.images.objectStorage, 9000, { memory: '128Mi', maxMemory: '512Mi', storage: '1Gi', mount: '/data',
    probe: httpProbe('/minio/health/ready', 9000), live: httpProbe('/minio/health/live', 9000), container: { env: secrets('MINIO_ROOT_USER','MINIO_ROOT_PASSWORD'), args: ['server', '/data', '--console-address', ':9001'] } });
  workload('registry', t.images.registry, 5000, { storage: '1Gi', mount: '/var/lib/registry', probe: execProbe('wget -qO- http://127.0.0.1:5001/debug/health'),
    container: { env: [{ name: 'REGISTRY_AUTH', value: 'htpasswd' }, { name: 'REGISTRY_AUTH_HTPASSWD_REALM', value: 'Phase2' }, { name: 'REGISTRY_AUTH_HTPASSWD_PATH', value: '/auth/htpasswd' }, { name: 'REGISTRY_HTTP_DEBUG_ADDR', value: ':5001' }, { name: 'REGISTRY_HEALTH_STORAGEDRIVER_ENABLED', value: 'true' }],
      volumeMounts: [{ name: 'data', mountPath: '/var/lib/registry' }, { name: 'auth', mountPath: '/auth', readOnly: true }] },
    pod: { volumes: [{ name: 'data', persistentVolumeClaim: { claimName: 'registry' } }, { name: 'auth', secret: { secretName: 'registry-auth' } }] } });
  // workload() assigns data mount; explicitly preserve the additional registry auth mount.
  all.find(x => x.kind === 'Deployment' && x.metadata.name === 'registry').spec.template.spec.containers[0].volumeMounts.push({ name: 'auth', mountPath: '/auth', readOnly: true });
  workload('api', image, 3000, { memory: '96Mi', maxMemory: '256Mi', probe: httpProbe('/api/v1/ready', 3000), live: httpProbe('/api/v1/health', 3000), container: { envFrom: env } });
  workload('worker', image, 3002, { memory: '96Mi', maxMemory: '256Mi', probe: httpProbe('/ready', 3002), live: httpProbe('/health', 3002), container: { envFrom: env, command: ['node', 'src/worker/main.js'] } });
  const gateway = `require('http').createServer(async(q,s)=>{if(!['/api/v1/health','/api/v1/ready'].includes(q.url)){s.writeHead(404);return s.end();}try{const r=await fetch('http://api:3000'+q.url,{signal:AbortSignal.timeout(3000)});s.writeHead(r.status);s.end(await r.text());}catch{s.writeHead(503);s.end();}}).listen(8080)`;
  workload('gateway', image, 8080, { probe: httpProbe('/api/v1/health', 8080), container: { command: ['node', '-e', gateway] } });
  const gatewayService = all.find(x => x.kind === 'Service' && x.metadata.name === 'gateway');
  gatewayService.spec.type = 'NodePort'; gatewayService.spec.ports[0].nodePort = 31082;
  workload('verifier', image, null, { container: { envFrom: env, command: ['node', '-e', 'setInterval(()=>{},60000)'] } });
  workload('untrusted', image, null, { container: { command: ['node', '-e', 'setInterval(()=>{},60000)'] } });
  all.push({ apiVersion: 'v1', kind: 'ConfigMap', metadata: meta('runtime'), data: {
    NODE_ENV: 'staging', PLATFORM_ENVIRONMENT: 'staging', AUTH_MODE: 'jwt', CONTROL_PLANE_STORAGE: 'postgres',
    POSTGRES_USER: 'phase2_staging', POSTGRES_DB: t.database, DEPLOYMENT_QUEUE_NAME: 'phase2-staging',
    JWT_ISSUER: 'http://localhost:31082', JWT_AUDIENCE: 'phase2-staging', SESSION_VALIDATION: 'required', CORS_ALLOWED_ORIGINS: 'http://localhost:31082',
    GIT_PROVIDER_MODE: 'github', REGISTRY_PROVIDER: 'local', LOCAL_REGISTRY_HOST: 'registry:5000',
    PREVIEW_BASE_DOMAIN: 'localhost', CERT_MANAGER_CLUSTER_ISSUER: 'phase2-unused', KUBERNETES_CONTEXT: t.context,
    OBJECT_STORAGE_ENDPOINT: 'http://object-storage:9000', OBJECT_STORAGE_BUCKET: t.bucket,
    REGISTRY_ENDPOINT: 'http://registry:5000', REGISTRY_REPOSITORY: t.registryRepository,
  } });
  const policy = (name, selector, spec) => all.push({ apiVersion: 'networking.k8s.io/v1', kind: 'NetworkPolicy', metadata: meta(name), spec: { podSelector: selector, ...spec } });
  policy('default-deny', {}, { policyTypes: ['Ingress', 'Egress'] });
  policy('dns', {}, { policyTypes: ['Egress'], egress: [{ to: [{ namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'kube-system' } }, podSelector: { matchLabels: { 'k8s-app': 'kube-dns' } } }], ports: [{ protocol: 'UDP', port: 53 }, { protocol: 'TCP', port: 53 }] }] });
  const flows = { postgres: [5432, ['api','worker','verifier','migrate']], redis: [6379, ['api','worker','verifier']], 'object-storage': [9000, ['api','worker','verifier']], registry: [5000, ['api','worker','verifier']], api: [3000, ['gateway','verifier']], worker: [3002, ['verifier']] };
  for (const [dest, [port, sources]] of Object.entries(flows)) {
    policy(`ingress-${dest}`, { matchLabels: { app: dest } }, { policyTypes: ['Ingress'], ingress: [{ from: sources.map(app => ({ podSelector: { matchLabels: { app } } })), ports: [{ protocol: 'TCP', port }] }] });
    for (const src of sources) policy(`${src}-to-${dest}`, { matchLabels: { app: src } }, { policyTypes: ['Egress'], egress: [{ to: [{ podSelector: { matchLabels: { app: dest } } }], ports: [{ protocol: 'TCP', port }] }] });
  }
  // NodePort is loopback-published only; no other container port is published.
  policy('gateway-route', { matchLabels: { app: 'gateway' } }, { policyTypes: ['Ingress'], ingress: [{ ports: [{ protocol: 'TCP', port: 8080 }] }] });
  all.push({ apiVersion: 'batch/v1', kind: 'Job', metadata: meta('migrate'), spec: { backoffLimit: 0, template: { metadata: { labels: { ...labels, app: 'migrate' } }, spec: { restartPolicy: 'Never', serviceAccountName: 'api', automountServiceAccountToken: false, securityContext: { runAsNonRoot: true, runAsUser: 1000, seccompProfile: { type: 'RuntimeDefault' } }, containers: [{ name: 'migrate', image, command: ['node', 'src/database/migrate.js'], envFrom: env, securityContext: { allowPrivilegeEscalation: false, capabilities: { drop: ['ALL'] } }, resources: { requests: { cpu: '50m', memory: '64Mi' }, limits: { cpu: '500m', memory: '256Mi' } } }] } } } });
  return all;
}
module.exports = { manifests };
