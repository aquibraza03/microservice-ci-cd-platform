'use strict';
// Read existing evidence only; this summary never promotes a run to foundation PASS.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const [qualification,deployment]=process.argv.slice(2);
assert.match(qualification||'',/^[0-9TZ-]+$/);assert.match(deployment||'',/^[a-f0-9-]{36}$/);
const relative=`artifacts/staging/qualification/${qualification}`,boot=`artifacts/staging/bootstrap/${deployment}`;
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const before=read(`${relative}/before.json`),during=read(`${relative}/during.json`),after=read(`${relative}/after.json`);
const cleanupFile=fs.existsSync(path.join(root,boot,'cleanup.json'))?'cleanup.json':'cleanup-failure.json';
const result=read(`${boot}/result.json`),diag=read(`${boot}/diagnostics.json`),cleanup=read(`${boot}/${cleanupFile}`),safety=read(`${relative}/safety.json`);
assert.equal(result.deploymentId,deployment);assert.equal(diag.identity.deploymentId,deployment);
assert.notEqual(result.exitCode,0,'This summarizer describes failed bootstrap only');
const containers=JSON.parse(diag.records.find(r=>r.args.includes('ps')&&r.args.includes('crictl')).stdout).containers.filter(c=>/^(etcd|kube-apiserver|kube-scheduler|kube-controller-manager)$/.test(c.metadata.name));
const metricRecord=diag.records.find(r=>r.args.some(a=>a.includes('2381/metrics')));
function histogram(prefix){
 const lines=metricRecord.stdout.split('\n');
 const value=suffix=>Number(lines.find(l=>l.startsWith(prefix+suffix+' '))?.split(' ').at(-1));
 const count=value('_count'),sum=value('_sum');
 const buckets=lines.filter(l=>l.startsWith(prefix+'_bucket')).map(l=>({upper:Number(l.match(/le="([^"]+)"/)[1].replace('+Inf','Infinity')),count:Number(l.split(' ').at(-1))}));
 const i=buckets.findIndex(b=>b.count>=count*.99);
 return {count,sumSeconds:sum,meanSeconds:sum/count,p99BucketSeconds:{lowerExclusive:i>0?buckets[i-1].upper:0,upperInclusive:buckets[i]?.upper}};
}
const output={status:'FOUNDATION BLOCKED',rootCause:'NOT ISOLATED',qualificationId:qualification,deploymentId:deployment,identity:diag.identity,namespaceUid:null,
 foundation:{kindExitCode:result.exitCode,kindErrorCode:result.errorCode||null,gateReached:false,samples:[],requiredSamples:3,requiredIntervalSeconds:30,reason:result.errorCode==='ETIMEDOUT'?'Kind creation did not exit successfully within the existing command timeout':'Kind creation failed; see bootstrap result for the observed failure'},
 timeline:[{at:before.startedAt,event:'Baseline started'},{at:before.endedAt,event:'Baseline ended'},{at:diag.identity.createdAt,event:'Disposable bootstrap registered'},{at:result.timestamp,event:'Kind creation returned unsuccessfully'},{at:during.startedAt,event:'During capture started'},{at:during.endedAt,event:'During capture ended'},{at:diag.timestamp,event:'Retained-node diagnostic snapshot'},{at:cleanup.timestamp,event:'Guarded cleanup',result:cleanup.result},{at:after.endedAt,event:'After capture complete',result:safety.result}],
 coreContainers:containers.map(c=>({name:c.metadata.name,id:c.id,attempt:c.metadata.attempt,state:c.state,createdAt:new Date(Number(BigInt(c.createdAt)/1000000n)).toISOString()})),
 etcd:{backendCommit:histogram('etcd_disk_backend_commit_duration_seconds'),walFsync:histogram('etcd_disk_wal_fsync_duration_seconds')},
 safety:{...safety,collectorResult:safety.result,result:safety.result==='PASS'&&cleanup.result==='PASS'?'PASS':'FAIL'},cleanupResult:cleanup.result,baselineCounts:{containers:before.containers.length,running:before.containers.filter(c=>c.running).length,volumes:before.volumes.length,networks:before.networks.length},
 evidence:{before:`${relative}/before.json`,during:`${relative}/during.json`,after:`${relative}/after.json`,result:`${boot}/result.json`,diagnostics:`${boot}/diagnostics.json`,cleanup:`${boot}/${cleanupFile}`,safety:`${relative}/safety.json`,tests:fs.existsSync(path.join(root,relative,'tests.json'))?`${relative}/tests.json`:`${relative}/safety-tests.log`},
 applicationLayer:'NOT TOUCHED',phase3And4:'NOT RUN',limitations:['No successful foundation samples; no namespace registered','Host pressure is observed; CPU, paging and storage causal contributions are not isolated','Post-deadline running containers do not establish readiness or stability']};
output.timeline.sort((a,b)=>a.at.localeCompare(b.at));
if(fs.existsSync(path.join(root,relative,'comparison.json'))) {
 output.comparison=read(`${relative}/comparison.json`);
 output.evidence.comparison=`${relative}/comparison.json`;
}
fs.writeFileSync(path.join(root,relative,'summary.json'),JSON.stringify(output,null,2)+'\n');
console.log(`${relative}/summary.json: ${output.status}; safety ${output.safety.result}`);
