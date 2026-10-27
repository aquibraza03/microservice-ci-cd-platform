'use strict';
// Read-only capture. Never reads Kubernetes Secret contents or kubeconfig data.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { expected: target, validateState } = require('./staging/safety.cjs');
const root = path.resolve(__dirname,'..');
const local = path.join(root,'.local/phase2-staging');
const state = JSON.parse(fs.readFileSync(path.join(local,'state.json')));
const commands = [];
function run(command,args) {
  const r=spawnSync(command,args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:4*1024*1024});
  const result={command,args,exitCode:r.status,stdout:(r.stdout||'').trim(),stderr:(r.stderr||'').trim()}; commands.push(result); return result;
}
const daemon=run('docker',['info','--format','{{.ID}}']).stdout;
validateState(target,state,daemon);
const k=args=>run('kubectl',['--kubeconfig',path.join(local,'kubeconfig'),'--context',target.context,...args]);
const ns=['-n',target.namespace];
const parsed=result=>{try{return JSON.parse(result.stdout);}catch{return null;}};
const pods=parsed(k(['get','pods','-A','-o','json']));
// Only safe runtime status and image references are persisted from pod objects.
const statuses=pods?.items.map(p=>({namespace:p.metadata.namespace,name:p.metadata.name,phase:p.status.phase,node:p.spec.nodeName,
  containers:p.status.containerStatuses?.map(c=>({name:c.name,image:c.image,imageId:c.imageID,ready:c.ready,restarts:c.restartCount,state:c.state,lastState:c.lastState}))}));
commands[commands.length-1].stdout=JSON.stringify(statuses);
const versions={docker:run('docker',['version','--format','{{.Server.Version}}']).stdout,kind:run('kind',['version']).stdout,kubernetes:parsed(k(['version','-o','json']))?.serverVersion?.gitVersion};
const services=parsed(k([...ns,'get','services','-o','json']));
const nodePorts=parsed(run('docker',['inspect',`${target.cluster}-control-plane`,'--format','{{json .NetworkSettings.Ports}}']));
for(const [name,binary] of [['postgres','postgres'],['redis','redis-server'],['object-storage','minio'],['registry','registry']]) {
  const result=k([...ns,'exec',`deployment/${name}`,'--',binary,'--version']); versions[name]=result.exitCode===0?result.stdout:null;
}
k([...ns,'get','events','--field-selector','type=Warning','--sort-by=.lastTimestamp']);
k(['logs','-n','kube-system',`kube-scheduler-${target.cluster}-control-plane`,'--tail=35']);
run('docker',['stats','--no-stream','--format','{{.Name}} {{.CPUPerc}} {{.MemUsage}}']);
run('docker',['exec',`${target.cluster}-control-plane`,'cat','/proc/pressure/memory','/proc/pressure/cpu','/proc/meminfo']);
const rbac=[];
for(const sa of ['api','worker','postgres','redis','object-storage','registry','gateway','verifier','untrusted']) {
  for(const [verb,resource,scope] of [['get','secrets',ns],['create','deployments',ns],['get','nodes',[]],['delete','namespaces',[]]]) {
    const result=k(['auth','can-i',verb,resource,...scope,`--as=system:serviceaccount:${target.namespace}:${sa}`]);
    rbac.push({serviceAccount:sa,verb,resource,result:result.stdout,exitCode:result.exitCode});
  }
}
const dir=path.join(root,'artifacts/staging',state.fingerprint);fs.mkdirSync(dir,{recursive:true});
const manifest={fingerprint:state.fingerprint,environmentType:'disposable-local-kind-staging',target,sourceRevision:state.sourceRevision,infrastructureVersion:target.infrastructureVersion,
  configurationVersion:target.configurationVersion,verificationTimestamp:new Date().toISOString(),healthGate:'BLOCKED',
  note:'Read-only diagnostic capture; this file is not a successful health-gate or reproducibility claim.',versions,pods:statuses,services,nodePorts,rbac,commands};
fs.writeFileSync(path.join(dir,'diagnostics.json'),JSON.stringify(manifest,null,2)+'\n');
if(!fs.existsSync(path.join(dir,'manifest.json'))) fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(`Diagnostic evidence: artifacts/staging/${state.fingerprint}/diagnostics.json`);
