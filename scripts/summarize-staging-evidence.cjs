'use strict';
// Consolidate a blocked foundation investigation. Never infer application acceptance.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {expected:target,hash,validateState}=require('./staging/safety.cjs');
const root=path.resolve(__dirname,'..'),base='artifacts/staging';
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const parse=file=>JSON.parse(read(file));
const write=(file,value)=>fs.writeFileSync(path.join(root,file),JSON.stringify(value,null,2)+'\n');
const foundations=[];
for(const dir of fs.readdirSync(path.join(root,base))) {
  if(!/^[a-f0-9]{64}$/.test(dir)) continue;
  for(const name of fs.readdirSync(path.join(root,base,dir))) if(/^foundation-.*\.json$/.test(name)) {
    const file=`${base}/${dir}/${name}`; foundations.push({file,data:parse(file)});
  }
}
foundations.sort((a,b)=>a.data.timestamp.localeCompare(b.data.timestamp));
const latest=foundations.at(-1); assert.ok(latest,'No foundation evidence');
assert.equal(latest.data.result,'BLOCKED','This report builder cannot certify a successful lifecycle sequence');
const fp=latest.data.fingerprint,dir=`${base}/${fp}`;
const teardown=parse(`${dir}/teardown.json`); assert.equal(teardown.result,'PASS');
const stateFiles=fs.readdirSync(path.join(root,'.local/phase2-staging')).filter(x=>/^removed-[a-f0-9-]{36}\.json$/.test(x));
const state=stateFiles.map(x=>parse(`.local/phase2-staging/${x}`)).find(x=>x.fingerprint===fp);assert.ok(state);
validateState(target,state,state.daemonId);
const bootstrapDir=`${base}/bootstrap/${state.deploymentId}`;
const bootstrap=parse(`${bootstrapDir}/result.json`),diagnostics=parse(`${bootstrapDir}/diagnostics.json`);
assert.equal(bootstrap.deploymentId,state.deploymentId);
assert.equal(diagnostics.identity.nodeId,state.nodeId);
assert.ok(!fs.existsSync(path.join(root,'.local/phase2-staging/state.json')),'Environment still registered');
assert.ok(!fs.existsSync(path.join(root,'.local/phase2-staging/pending.json')),'Unresolved pending creation');
assert.ok(!fs.existsSync(path.join(root,'.local/phase2-staging/bootstrap-state.json')),'Retained bootstrap remains');
const acceptance=read('docs/phase2-staging-report.md').split(/\r?\n/).filter(x=>/^\| \d+ \|/.test(x)).map(line=>{
  const [number,requirement,evidence,status]=line.split('|').slice(1,5).map(x=>x.trim());return {number:Number(number),requirement,evidence,status};
});
assert.equal(acceptance.length,43); assert.ok(acceptance.every(x=>['PASS','BLOCKED','N/A'].includes(x.status)));
const counts=acceptance.reduce((out,x)=>(out[x.status]=(out[x.status]||0)+1,out),{}); assert.ok(counts.BLOCKED>0);
const sample=latest.data.samples.at(-1);
const sourceFiles=['scripts/staging/main.cjs','scripts/staging/foundation.cjs','scripts/staging/safety.test.cjs','scripts/summarize-staging-evidence.cjs','docs/phase2-staging-runbook.md','docs/phase2-staging-report.md'];
const manifest={
  fingerprint:fp,deploymentId:state.deploymentId,target,environmentType:'disposable-local-kind-staging',
  sourceRevision:state.sourceRevision,infrastructureVersion:target.infrastructureVersion,configurationVersion:target.configurationVersion,
  dockerIdentity:state.daemonId,nodeId:state.nodeId,namespaceUid:state.namespaceUid,
  bootstrapIdentity:diagnostics.identity,bootstrapExitCode:bootstrap.exitCode,
  verificationTimestamp:latest.data.timestamp,healthGate:'BLOCKED',foundationGate:'BLOCKED',
  applicationDeploymentPerformed:false,manifestRevision:null,
  applicationVersions:{postgres:null,redis:null,objectStorage:null,registry:null},
  observedNodeInfo:sample?.nodes.items.map(x=>({name:x.metadata.name,nodeInfo:x.status.nodeInfo})),
  images:sample?.pods.items.flatMap(p=>(p.status.containerStatuses||[]).map(c=>({pod:p.metadata.name,image:c.image,imageId:c.imageID,ready:c.ready,restarts:c.restartCount}))),
  rbac:{expectedChecks:36,attempted:0,result:'BLOCKED',reason:'Application identities not deployed'},
  networkPolicy:{requiredTraffic:'NOT EXECUTED',forbiddenTraffic:'NOT EXECUTED',result:'BLOCKED'},
  dependencies:{result:'BLOCKED',reason:'Foundation gate failed before any application provisioning'},
  evidence:{foundation:latest.file,bootstrap:`${bootstrapDir}/result.json`,diagnostics:`${bootstrapDir}/diagnostics.json`,teardown:`${dir}/teardown.json`,tests:`${base}/resolution-tests.json`,commands:`${base}/runs`},
  teardown:'PASS',finalEnvironmentState:'EMPTY',finalInventoryTimestamp:teardown.timestamp,
  unrelatedInventoryPreserved:{containers:state.before.containers.length,volumes:state.before.volumes.length,networks:state.before.networks.length},
  diagnosticAndReportingFileHashes:Object.fromEntries(sourceFiles.map(file=>[file,hash(read(file))])),
  note:'Later diagnostic/reporting changes were not the bootstrap source revision. No application release or successful reproducibility claim.'
};
write(`${dir}/manifest.json`,manifest);
write(`${base}/summary.json`,{finalStatus:'PHASE 2 — BLOCKED',generatedAt:new Date().toISOString(),...manifest,
  tests:parse(`${base}/resolution-tests.json`),
  proofSequence:{firstHealthGate:'BLOCKED',unchangedReconcile:'BLOCKED',guardedCleanup:'PASS',cleanRecreationAfterSuccessfulReconcile:'BLOCKED',secondHealthGate:'BLOCKED'},
  report:'docs/phase2-staging-report.md',counts,acceptance});
console.log(JSON.stringify({finalStatus:'PHASE 2 — BLOCKED',counts,manifest:`${dir}/manifest.json`,finalEnvironmentState:'EMPTY'}));
