'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { expected: target } = require('./safety.cjs');
const { approved, digest, validateAbsence, loadRecords, archiveRecords } = require('./stale-ownership.cjs');
const root = path.resolve(__dirname, '../..');
const local = path.join(root, '.local/phase2-staging');
const mode = process.argv[2];
assert.ok(['check', 'apply'].includes(mode) && process.argv.length === 3, 'Usage: reconcile-stale.cjs check|apply');
assert.ok(fs.realpathSync(local).startsWith(fs.realpathSync(root) + path.sep), 'Ownership directory outside workspace');
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${mode}`;
const relative = `artifacts/staging/reconciliation/${approved.deploymentId}/${runId}`;
const dir = path.join(root, relative); fs.mkdirSync(dir, { recursive: true });
const commands = [];
const write = (name, data) => fs.writeFileSync(path.join(dir, name), JSON.stringify(data, null, 2) + '\n');
function docker(args, allowAbsent = false) {
  const start = Date.now();
  const r = spawnSync('docker', args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  const record = { command: 'docker', args, startedAt: new Date(start).toISOString(), endedAt: new Date().toISOString(), durationMs: Date.now() - start, exitCode: r.status, errorCode: r.error?.code, stdout: r.stdout || '', stderr: r.stderr || '' };
  commands.push(record); write('commands.json', commands);
  if (!allowAbsent) assert.equal(r.status, 0, `Read-only Docker command unavailable: ${args.slice(0, 2).join(' ')}`);
  return record;
}
const lines = s => s.trim().split(/\r?\n/).filter(Boolean);
function snapshot() {
  const s = { timestamp: new Date().toISOString(), context: docker(['context', 'show']).stdout.trim() };
  assert.equal(s.context, 'desktop-linux');
  s.endpoint = JSON.parse(docker(['context', 'inspect', 'desktop-linux', '--format', '{{json .Endpoints.docker.Host}}']).stdout);
  assert.equal(s.endpoint, 'npipe:////./pipe/dockerDesktopLinuxEngine');
  assert.ok(!process.env.DOCKER_HOST || process.env.DOCKER_HOST === s.endpoint);
  s.daemon = JSON.parse(docker(['info', '--format', '{"id":{{json .ID}},"name":{{json .Name}},"os":{{json .OSType}}}']).stdout);
  assert.equal(s.daemon.id, approved.daemonId);
  const ids = lines(docker(['ps', '-aq', '--no-trunc']).stdout).sort();
  const format = '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Config.Image}},"imageId":{{json .Image}},"running":{{.State.Running}},"status":{{json .State.Status}},"startedAt":{{json .State.StartedAt}},"finishedAt":{{json .State.FinishedAt}},"restartCount":{{.RestartCount}},"cluster":{{json (index .Config.Labels "io.x-k8s.kind.cluster")}},"owner":{{json (index .Config.Labels "phase2.deployment")}},"mounts":{{json .Mounts}},"networks":{{json .NetworkSettings.Networks}}}';
  s.containers = ids.length ? lines(docker(['inspect', '--format', format, ...ids]).stdout).map(JSON.parse).sort((a,b) => a.id.localeCompare(b.id)) : [];
  const nets = lines(docker(['network', 'ls', '-q', '--no-trunc']).stdout).sort();
  s.networks = nets.length ? lines(docker(['network', 'inspect', '--format', '{"id":{{json .Id}},"name":{{json .Name}},"owner":{{json (index .Labels "phase2.deployment")}},"containers":{{json .Containers}}}', ...nets]).stdout).map(JSON.parse).sort((a,b) => a.id.localeCompare(b.id)) : [];
  s.volumes = lines(docker(['volume', 'ls', '--format', '{{.Name}}']).stdout).sort();
  s.kindClusters = [...new Set(s.containers.map(c => c.cluster).filter(Boolean))].sort(); // No Kind command is executed.
  s.settingsHashes = {};
  for (const f of [path.join(os.homedir(), '.wslconfig'), path.join(process.env.APPDATA, 'Docker/settings-store.json'), path.join(process.env.APPDATA, 'Docker/settings.json')]) s.settingsHashes[f] = fs.existsSync(f) ? digest(fs.readFileSync(f)) : null;
  s.absence = [
    ['node-name', ['inspect', `${approved.cluster}-control-plane`, '--format', '{{.Id}}']],
    ['node-id', ['inspect', approved.nodeId, '--format', '{{.Id}}']],
    ['network-name', ['network', 'inspect', approved.cluster, '--format', '{{.Id}}']],
    ['network-id', ['network', 'inspect', approved.networkId, '--format', '{{.Id}}']],
    ['volume-id', ['volume', 'inspect', approved.volumeId, '--format', '{{.Name}}']],
  ].map(([key, args]) => ({ key, ...docker(args, true) }));
  // Detect inventory races rather than treating a partial scan as absence.
  assert.deepEqual(lines(docker(['ps', '-aq', '--no-trunc']).stdout).sort(), ids);
  assert.deepEqual(lines(docker(['network', 'ls', '-q', '--no-trunc']).stdout).sort(), nets);
  assert.deepEqual(lines(docker(['volume', 'ls', '--format', '{{.Name}}']).stdout).sort(), s.volumes);
  s.fullStatePresent = fs.existsSync(path.join(local, 'state.json'));
  s.complete = true;
  return s;
}
function invariant(s) { return { context:s.context, endpoint:s.endpoint, daemon:s.daemon, containers:s.containers, networks:s.networks, volumes:s.volumes, kindClusters:s.kindClusters, settingsHashes:s.settingsHashes }; }
function main() {
  const records = loadRecords(local);
  const historyFile = 'artifacts/staging/qualification/2026-09-27T08-53-20-302Z/retained-node.json';
  const historicalBytes = fs.readFileSync(path.join(root, historyFile));
  const historical = JSON.parse(historicalBytes.toString('utf8').replace(/^\uFEFF/, ''));
  const before = snapshot(); write('protected-before.json', before);
  validateAbsence(target, records.bootstrap, records.pending, historical, before);
  write('ownership-proof.json', { approved, target, bootstrap: records.bootstrap, pending: records.pending, hashes: records.hashes, historicalVolumeEvidence: { file: historyFile, sha256: digest(historicalBytes) }, namespaceUid: null, originalCreatedAt: records.bootstrap.createdAt, priorLifecycle: 'failed-bootstrap; resources absent; no registered namespace', alreadyReconciled: records.already });
  // A second read-only scan immediately before the metadata transition must agree.
  const precommit = snapshot(); write('precommit.json', precommit);
  validateAbsence(target, records.bootstrap, records.pending, historical, precommit);
  assert.deepEqual(invariant(precommit), invariant(before), 'Protected resource changed before transition');
  const result = mode === 'check' ? 'ELIGIBLE' : archiveRecords(local, records, relative);
  const after = snapshot(); write('protected-after.json', after);
  validateAbsence(target, records.bootstrap, records.pending, historical, after);
  assert.deepEqual(invariant(after), invariant(before), 'SAFETY FAILURE: protected resources changed');
  const final = loadRecords(local);
  if (mode === 'apply') assert.equal(final.already, true);
  assert.deepEqual(final.hashes, records.hashes);
  write('result.json', { timestamp:new Date().toISOString(), result, activeOwnership:final.already?'CLEAN':'STALE', safety:'PASS', protectedResources:'UNCHANGED', archive:path.relative(root,records.archive), hashes:records.hashes, metadataPreserved:true, foundation:'NOT RUN', kindCommandsExecuted:0, dockerMutations:0, evidence:relative });
  console.log(JSON.stringify({ result, activeOwnership:final.already?'CLEAN':'STALE', safety:'PASS', evidence:relative }));
}
try { main(); } catch (error) { write('result.json', { timestamp:new Date().toISOString(), result:'BLOCKED', error:error.message, foundation:'NOT RUN', evidence:relative }); console.error(error.message); process.exitCode = 1; }
