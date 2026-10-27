'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { expected, fingerprint } = require('./safety.cjs');
const { approved:a, validateAbsence, loadRecords, archiveRecords } = require('./stale-ownership.cjs');
function fixture() {
  const pending = { deploymentId:a.deploymentId, daemonId:a.daemonId, sourceRevision:'source-sha256:fixture', createdAt:'2026-09-27T08:55:03.453Z', before:{containers:[], networks:[], volumes:[]} };
  const bootstrap = { ...pending, scope:'bootstrap-only', nodeId:a.nodeId, networkId:a.networkId };
  bootstrap.fingerprint = fingerprint(expected, bootstrap);
  const historicalNode = { Id:a.nodeId, Cluster:a.cluster, Networks:{[a.cluster]:{NetworkID:a.networkId}}, Mounts:[{Type:'volume',Name:a.volumeId}] };
  const snapshot = { context:'desktop-linux', endpoint:'npipe:////./pipe/dockerDesktopLinuxEngine', daemon:{id:a.daemonId,name:'docker-desktop',os:'linux'}, complete:true, fullStatePresent:false, containers:[], networks:[], volumes:[], absence:['node-name','node-id','network-name','network-id','volume-id'].map(key=>({key,exitCode:1,stderr:'Error: No such object: recorded identity'})) };
  return { target:structuredClone(expected), pending, bootstrap, historicalNode, snapshot };
}
const validate = x => validateAbsence(x.target,x.bootstrap,x.pending,x.historicalNode,x.snapshot);
test('exact absent deployment and matching fingerprint are eligible',()=>assert.equal(validate(fixture()),true));
const container = changes => ({ id:'unrelated-id',name:'/unrelated',cluster:'',owner:'',mounts:[],networks:{},...changes });
const cases = {
  'wrong daemon': x=>{x.snapshot.daemon.id='other';},
  'existing recorded node with mismatched identity': x=>{x.snapshot.containers.push(container({id:a.nodeId,name:'/foreign',cluster:'foreign'}));},
  'existing network with foreign attachment': x=>{x.snapshot.networks.push({id:a.networkId,name:a.cluster,owner:a.deploymentId,containers:{foreign:{}}});},
  'existing volume with unexpected consumer': x=>{x.snapshot.volumes.push(a.volumeId);x.snapshot.containers.push(container({mounts:[{Type:'volume',Name:a.volumeId}]}));},
  'consumer despite missing volume listing': x=>{x.snapshot.containers.push(container({mounts:[{Type:'volume',Name:a.volumeId}]}));},
  'network reference despite missing network listing': x=>{x.snapshot.containers.push(container({networks:{foreign:{NetworkID:a.networkId}}}));},
  'deployment UUID mismatch': x=>{x.pending.deploymentId='00000000-0000-0000-0000-000000000000';},
  'fingerprint mismatch': x=>{x.bootstrap.fingerprint='wrong';},
  'production target': x=>{x.target.cluster='production';},
  'customer target': x=>{x.target.cluster='customer';},
  'replacement cluster label': x=>{x.snapshot.containers.push(container({cluster:a.cluster}));},
  'reused container name with different ID': x=>{x.snapshot.containers.push(container({name:'/'+a.cluster+'-control-plane'}));},
  'reused network name with different ID': x=>{x.snapshot.networks.push({id:'replacement',name:a.cluster,owner:'other',containers:{}});},
  'diagnostic timeout is not absence': x=>{x.snapshot.absence[0].exitCode=null;x.snapshot.absence[0].errorCode='ETIMEDOUT';},
  'permission denied is not absence': x=>{x.snapshot.absence[0].stderr='permission denied';},
  'successful inspect is not absence': x=>{x.snapshot.absence[0].exitCode=0;},
  'missing direct absence check': x=>{x.snapshot.absence.pop();},
  'incomplete scan': x=>{x.snapshot.complete=false;},
  'registered environment': x=>{x.snapshot.fullStatePresent=true;},
  'wrong historical volume provenance': x=>{x.historicalNode.Mounts[0].Name='foreign';},
  'wrong historical node': x=>{x.historicalNode.Id='foreign';},
  'remote endpoint': x=>{x.snapshot.endpoint='tcp://remote:2375';},
  'remaining deployment label': x=>{x.snapshot.containers.push(container({owner:a.deploymentId}));},
};
for (const [name, mutate] of Object.entries(cases)) test(`refuse ${name}`,()=>{const x=fixture();mutate(x);assert.throws(()=>validate(x));});
function localFixture(t) {
  const base=fs.realpathSync(os.tmpdir());
  const local=fs.mkdtempSync(path.join(base,'phase2-stale-test-'));
  t.after(()=>{assert.equal(path.dirname(fs.realpathSync(local)),base);assert.ok(path.basename(local).startsWith('phase2-stale-test-'));fs.rmSync(local,{recursive:true});});
  const x=fixture();
  fs.writeFileSync(path.join(local,'bootstrap-state.json'),JSON.stringify(x.bootstrap,null,2)+'\n');
  fs.writeFileSync(path.join(local,'pending.json'),JSON.stringify(x.pending,null,2)+'\n');
  return {local,x};
}
test('archive preserves exact bytes; second invocation performs no metadata mutation',t=>{
  const {local,x}=localFixture(t);validate(x);
  const first=loadRecords(local),bytes=first.bytes;
  assert.equal(archiveRecords(local,first,'fixture-evidence'),'RECONCILED');
  for(const n of Object.keys(bytes)){assert.equal(fs.existsSync(path.join(local,n)),false);assert.deepEqual(fs.readFileSync(path.join(first.archive,n)),bytes[n]);}
  const receipt=fs.readFileSync(path.join(first.archive,'receipt.json'));
  const second=loadRecords(local);validateAbsence(x.target,second.bootstrap,second.pending,x.historicalNode,x.snapshot);
  assert.equal(archiveRecords(local,second,'second-evidence'),'ALREADY_RECONCILED');
  assert.deepEqual(fs.readFileSync(path.join(first.archive,'receipt.json')),receipt);
});
test('changed active metadata is refused before archive creation',t=>{
  const {local}=localFixture(t),records=loadRecords(local);
  fs.appendFileSync(path.join(local,'pending.json'),' ');
  assert.throws(()=>archiveRecords(local,records,'fixture'));
  assert.equal(fs.existsSync(records.archive),false);
});
test('partial archive is refused without discarding remaining active metadata',t=>{
  const {local}=localFixture(t),records=loadRecords(local);
  fs.mkdirSync(records.archive);fs.renameSync(path.join(local,'pending.json'),path.join(records.archive,'pending.json'));
  assert.throws(()=>loadRecords(local));assert.ok(fs.existsSync(path.join(local,'bootstrap-state.json')));
});
test('tampered archived metadata fails idempotency validation',t=>{
  const {local}=localFixture(t),records=loadRecords(local);archiveRecords(local,records,'fixture');
  fs.appendFileSync(path.join(records.archive,'pending.json'),' ');assert.throws(()=>loadRecords(local));
});
test('new active deployment blocks already-reconciled branch',t=>{
  const {local}=localFixture(t),records=loadRecords(local);archiveRecords(local,records,'fixture');
  fs.writeFileSync(path.join(local,'state.json'),'{}');assert.throws(()=>loadRecords(local));
});
test('live replacement still blocks after metadata was archived',t=>{
  const {local,x}=localFixture(t),records=loadRecords(local);archiveRecords(local,records,'fixture');
  const archived=loadRecords(local);x.snapshot.containers.push(container({cluster:a.cluster}));
  assert.throws(()=>validateAbsence(x.target,archived.bootstrap,archived.pending,x.historicalNode,x.snapshot));
});
