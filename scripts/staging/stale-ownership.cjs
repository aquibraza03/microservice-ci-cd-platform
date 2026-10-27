'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateTarget, validateState } = require('./safety.cjs');

// Deliberately limited to the operator-authorized historical deployment.
const approved = Object.freeze({
  deploymentId: 'e1fa939b-5894-470b-91f4-c574e119d90f',
  daemonId: '999fd370-edd4-42cc-b047-589d7adcf226',
  nodeId: 'f69dc40a1e59c62fb501a961be5a3900973dc09707c6a1f434c07a52cf1e09d3',
  networkId: '985f2e508c038f9081bc28a088cef88e4cad25980dc4e776ed10d012b65ace22',
  volumeId: '84d80134dc40906591585cd5f41aff85958c6080b290572ffc4b810d5ca06326',
  cluster: 'phase2-staging',
});
const names = ['bootstrap-state.json', 'pending.json'];
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function validateAbsence(target, bootstrap, pending, historicalNode, snapshot) {
  validateTarget(target);
  assert.equal(target.cluster, approved.cluster);
  assert.equal(target.network, approved.cluster);
  assert.equal(target.namespace, approved.cluster);
  assert.equal(snapshot.context, 'desktop-linux');
  assert.equal(snapshot.endpoint, 'npipe:////./pipe/dockerDesktopLinuxEngine');
  assert.equal(snapshot.daemon.id, approved.daemonId);
  assert.equal(snapshot.daemon.name, 'docker-desktop');
  assert.equal(snapshot.daemon.os, 'linux');
  validateState(target, bootstrap, snapshot.daemon.id);
  for (const key of ['deploymentId', 'daemonId', 'nodeId', 'networkId']) assert.equal(bootstrap[key], approved[key], key);
  assert.equal(bootstrap.scope, 'bootstrap-only');
  assert.equal(bootstrap.namespaceUid, undefined, 'Registered namespace cannot use stale bootstrap reconciliation');
  const originalPending = Object.fromEntries(Object.entries(bootstrap).filter(([key]) => !['scope', 'nodeId', 'networkId', 'fingerprint'].includes(key)));
  assert.deepEqual(pending, originalPending, 'Pending and bootstrap records disagree');
  assert.ok(Number.isFinite(Date.parse(bootstrap.createdAt)));
  assert.equal(historicalNode.Id, approved.nodeId);
  assert.equal(historicalNode.Cluster, approved.cluster);
  assert.equal(historicalNode.Networks[approved.cluster].NetworkID, approved.networkId);
  assert.deepEqual(historicalNode.Mounts.filter(m => m.Type === 'volume').map(m => m.Name), [approved.volumeId]);
  assert.ok(!bootstrap.before.volumes.includes(approved.volumeId), 'Historical volume predates this deployment');
  assert.equal(snapshot.complete, true, 'Incomplete inventory is not absence');
  assert.equal(snapshot.fullStatePresent, false);
  for (const list of ['containers', 'networks', 'volumes', 'absence']) assert.ok(Array.isArray(snapshot[list]));
  const required = ['node-name', 'node-id', 'network-name', 'network-id', 'volume-id'];
  assert.deepEqual(snapshot.absence.map(a => a.key).sort(), required.sort());
  for (const check of snapshot.absence) {
    assert.equal(check.exitCode, 1, `Not absent: ${check.key}`);
    assert.ok(!check.errorCode, `Diagnostic unavailable: ${check.key}`);
    assert.match(check.stderr, /No such (?:object|container|network|volume)|(?:network|volume) .+ not found/i);
  }
  const ids = [...snapshot.containers.map(c => c.id), ...snapshot.networks.map(n => n.id), ...snapshot.volumes];
  for (const id of [approved.nodeId, approved.networkId, approved.volumeId]) assert.ok(!ids.includes(id), `Recorded ID still exists: ${id}`);
  for (const c of snapshot.containers) {
    assert.ok(!c.name.replace(/^\//, '').startsWith(approved.cluster), 'Reused staging container name');
    assert.notEqual(c.cluster, approved.cluster, 'Replacement Kind cluster exists');
    assert.notEqual(c.owner, approved.deploymentId, 'Deployment-labeled resource exists');
    assert.ok(!Object.keys(c.networks).includes(approved.cluster), 'Staging network reference exists');
    assert.ok(!Object.values(c.networks).some(n => n.NetworkID === approved.networkId), 'Recorded network has a consumer');
    assert.ok(!c.mounts.some(m => m.Name === approved.volumeId || String(m.Source).replace(/\\/g, '/').includes(`/${approved.volumeId}/`)), 'Recorded volume has a consumer');
  }
  for (const n of snapshot.networks) {
    assert.notEqual(n.name, approved.cluster, 'Reused staging network name');
    assert.notEqual(n.owner, approved.deploymentId, 'Deployment-owned network exists');
    assert.ok(!Object.keys(n.containers || {}).includes(approved.nodeId), 'Recorded node is referenced by a network');
  }
  assert.ok(!snapshot.volumes.some(v => v.startsWith(approved.cluster)), 'Staging workload volume exists');
  return true;
}

function regular(file) {
  const stat = fs.lstatSync(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), `Not a regular file: ${file}`);
}
function loadRecords(local) {
  assert.ok(!fs.existsSync(path.join(local, 'state.json')), 'Full active environment exists');
  const archive = path.join(local, `reconciled-stale-${approved.deploymentId}`);
  if (fs.existsSync(archive)) assert.ok(fs.lstatSync(archive).isDirectory() && !fs.lstatSync(archive).isSymbolicLink());
  const active = names.map(n => fs.existsSync(path.join(local, n)));
  const archived = names.map(n => fs.existsSync(path.join(archive, n)));
  const already = active.every(x => !x) && archived.every(Boolean);
  assert.ok(already || (active.every(Boolean) && archived.every(x => !x)), 'Partial or conflicting ownership archive: stop for review');
  const source = already ? archive : local;
  const bytes = Object.fromEntries(names.map(n => { const f = path.join(source, n); regular(f); return [n, fs.readFileSync(f)]; }));
  const hashes = Object.fromEntries(names.map(n => [n, digest(bytes[n])]));
  if (already) {
    const receiptFile = path.join(archive, 'receipt.json'); regular(receiptFile);
    const receipt = JSON.parse(fs.readFileSync(receiptFile));
    assert.equal(receipt.status, 'RECONCILED');
    assert.deepEqual(receipt.approved, approved);
    assert.deepEqual(receipt.hashes, hashes, 'Archived metadata changed');
  } else assert.ok(!fs.existsSync(archive), 'Existing incomplete archive: stop for review');
  return { archive, already, bytes, hashes, bootstrap: JSON.parse(bytes[names[0]]), pending: JSON.parse(bytes[names[1]]) };
}
function archiveRecords(local, records, evidence) {
  // Called only after fresh absence validation. No resource deletion exists here.
  if (records.already) return 'ALREADY_RECONCILED';
  const current = loadRecords(local);
  assert.deepEqual(current.hashes, records.hashes, 'Metadata changed after validation');
  fs.mkdirSync(records.archive); // Exclusive directory creation; never merge/overwrite.
  fs.writeFileSync(path.join(records.archive, 'intent.json'), JSON.stringify({ approved, hashes: records.hashes, evidence, createdAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
  // Keep bootstrap-state (the existing lifecycle's creation interlock) until last.
  for (const name of [...names].reverse()) fs.renameSync(path.join(local, name), path.join(records.archive, name));
  for (const name of names) assert.equal(digest(fs.readFileSync(path.join(records.archive, name))), records.hashes[name]);
  fs.writeFileSync(path.join(records.archive, 'receipt.json'), JSON.stringify({ status: 'RECONCILED', approved, hashes: records.hashes, evidence, reconciledAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
  return 'RECONCILED';
}
module.exports = { approved, digest, validateAbsence, loadRecords, archiveRecords };
