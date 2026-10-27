'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { expected: target, hash, fingerprint, validateState, validateLive } = require('./safety.cjs');
const { manifests } = require('./manifests.cjs');
const { validateBootstrap, validateSample } = require('./foundation.cjs');
const root = path.resolve(__dirname, '../..');
const local = path.join(root, '.local/phase2-staging');
const statePath = path.join(local, 'state.json');
const kubeconfig = path.join(local, 'kubeconfig');
fs.mkdirSync(local, { recursive: true });
const commandLog = [];
const runId = `${new Date().toISOString().replace(/[:.]/g,'-')}-${process.argv[2] || 'invalid'}`;
function run(command, args, options = {}) {
  // Secrets are passed over stdin only. Do not log stdin or child errors.
  const record = { command, args, time: new Date().toISOString() }; commandLog.push(record);
  const r = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: options.timeout || 180000,
    maxBuffer: 16 * 1024 * 1024, windowsHide: true, env: { ...process.env, KIND_EXPERIMENTAL_DOCKER_NETWORK: target.network }, input: options.input });
  record.exitCode = r.status; record.errorCode = r.error?.code;
  if (r.status !== 0 && !options.allowFailure) throw new Error(`${command} ${args.slice(0,3).join(' ')} failed (exit ${r.status}; output suppressed)`);
  return options.result ? r : (r.stdout || '').trim();
}
const docker = args => run('docker', args);
const daemon = () => {
  const context = docker(['context','show']);
  const endpoint = JSON.parse(docker(['context','inspect','--format','{{json .Endpoints.docker.Host}}']));
  const localDesktop = endpoint === 'npipe:////./pipe/dockerDesktopLinuxEngine' || /^unix:\/\/\/.+\/\.docker\/(?:desktop|run)\/docker\.sock$/.test(endpoint);
  assert.ok(context === 'desktop-linux' && localDesktop, 'Unregistered Docker endpoint: only local Docker Desktop Linux is approved');
  assert.ok(!process.env.DOCKER_HOST || process.env.DOCKER_HOST === endpoint, 'Docker host override does not match the approved local endpoint');
  const [id,name,os] = docker(['info','--format','{{.ID}}|{{.Name}}|{{.OSType}}']).split('|');
  assert.equal(name,'docker-desktop'); assert.equal(os,'linux');
  return id;
};
const kubectl = (args, options) => run('kubectl', ['--kubeconfig', kubeconfig, '--context', target.context, ...args], options);
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value,null,2)+'\n', { mode: 0o600 });
const readState = () => JSON.parse(fs.readFileSync(statePath));
const snapshot = () => ({ containers: docker(['ps','-a','--format','{{.ID}} {{.Names}}']).split('\n').filter(Boolean).sort(), volumes: docker(['volume','ls','--format','{{.Name}}']).split('\n').filter(Boolean).sort(), networks: docker(['network','ls','--format','{{.ID}} {{.Name}}']).split('\n').filter(Boolean).sort() });
function seal(state) { delete state.fingerprint; state.fingerprint = fingerprint(target, state); json(statePath,state); return state; }
function live(state) {
  validateState(target,state,daemon());
  const node = JSON.parse(docker(['inspect',`${target.cluster}-control-plane`]))[0];
  const network = JSON.parse(docker(['network','inspect',target.network]))[0];
  assert.equal(network.Labels['phase2.deployment'],state.deploymentId);
  assert.deepEqual(Object.keys(node.NetworkSettings.Networks),[target.network]);
  const namespace = JSON.parse(kubectl(['get','namespace',target.namespace,'-o','json']));
  validateLive(target,state,{ daemonId: state.daemonId, nodeId: node.Id, cluster: node.Config.Labels['io.x-k8s.kind.cluster'], network: target.network,
    namespace: namespace.metadata.name, namespaceUid: namespace.metadata.uid, fingerprint: namespace.metadata.annotations['phase2.fingerprint'] });
  const nodes = JSON.parse(kubectl(['get','nodes','-o','json']));
  assert.equal(nodes.items.length,1); assert.equal(nodes.items[0].metadata.name,`${target.cluster}-control-plane`);
}
function sourceRevision(imageOnly = false) {
  const paths = ['services/control-plane-api/src','services/control-plane-api/migrations',...(imageOnly ? [] : ['scripts/staging','deploy/staging'])];
  const entries = [];
  function walk(dir) { for (const item of fs.readdirSync(path.join(root,dir),{withFileTypes:true})) { const p = `${dir}/${item.name}`; if(item.isDirectory()) walk(p); else entries.push([p,hash(fs.readFileSync(path.join(root,p)).toString())]); } }
  paths.forEach(walk);
  for(const file of ['package-lock.json','package.json','openapi.yaml']) entries.push([file,hash(fs.readFileSync(path.join(root,'services/control-plane-api',file)).toString())]);
  if(imageOnly) for(const file of ['scripts/staging/smoke.cjs','deploy/staging/Dockerfile','deploy/staging/Dockerfile.dockerignore']) entries.push([file,hash(fs.readFileSync(path.join(root,file)).toString())]);
  return `source-sha256:${hash(entries.sort())}`;
}
function apply(items) { kubectl(['apply','-f','-'], { input: JSON.stringify({ apiVersion:'v1', kind:'List', items }) }); }
async function provision(bootstrapOnly = false) {
  let state;
  if (fs.existsSync(statePath)) {
    state = readState(); live(state);
    console.log('Verified existing staging identity; reconciling without replacement');
  } else {
    assert.ok(!fs.existsSync(path.join(local,'bootstrap-state.json')),'Retained bootstrap requires diagnosis and guarded cleanup-bootstrap');
    const before = snapshot();
    assert.ok(!before.containers.some(v => v.includes(target.cluster)),'Cluster name already occupied');
    assert.ok(!before.networks.some(v => v.endsWith(` ${target.network}`)),'Network name already occupied');
    state = { daemonId: daemon(), deploymentId: crypto.randomUUID(), sourceRevision:sourceRevision(), createdAt:new Date().toISOString(), before };
    // Pending state cannot authorize cluster teardown; only an empty owned network.
    json(path.join(local,'pending.json'),state);
    docker(['network','create','--driver','bridge','--label',`phase2.deployment=${state.deploymentId}`,target.network]);
    const config = { kind:'Cluster', apiVersion:'kind.x-k8s.io/v1alpha4', name:target.cluster,
      networking:{apiServerAddress:'127.0.0.1'},
      nodes:[{
        role:'control-plane',
        image:target.images.node,
        kubeadmConfigPatches:[
          `apiVersion: kubeadm.k8s.io/v1beta4\nkind: InitConfiguration\nnodeRegistration:\n  kubeletExtraArgs:\n    fail-swap-on: "false"`,
          `apiVersion: kubelet.config.k8s.io/v1beta1\nkind: KubeletConfiguration\nfailSwapOn: false`
        ],
        extraPortMappings:[{containerPort:31082,hostPort:target.hostPort,listenAddress:'127.0.0.1',protocol:'TCP'}]
      }]
    };
    json(path.join(local,'kind.json'),config);
    console.log('Creating the dedicated Phase 2 Kind cluster');
    const bootstrap = run('kind',['create','cluster','--config',path.join(local,'kind.json'),'--kubeconfig',kubeconfig,'--wait','180s','--retain'],{timeout:300000,allowFailure:true,result:true});
    const bootstrapDir = path.join(root,'artifacts/staging/bootstrap',state.deploymentId); fs.mkdirSync(bootstrapDir,{recursive:true});
    // No application credentials exist yet; Kind bootstrap diagnostics are safe to retain.
    json(path.join(bootstrapDir,'result.json'),{deploymentId:state.deploymentId,sourceRevision:state.sourceRevision,timestamp:new Date().toISOString(),exitCode:bootstrap.status,errorCode:bootstrap.error?.code,stdout:bootstrap.stdout,stderr:bootstrap.stderr});
    const retained = run('docker',['inspect',`${target.cluster}-control-plane`],{allowFailure:true,result:true});
    if(retained.status===0) {
      const node=JSON.parse(retained.stdout)[0], network=JSON.parse(docker(['network','inspect',target.network]))[0];
      const identity={...state,scope:'bootstrap-only',nodeId:node.Id,networkId:network.Id};
      identity.fingerprint=fingerprint(target,identity);
      validateBootstrap(identity,daemon(),node,network);
      json(path.join(local,'bootstrap-state.json'),identity);
      if(bootstrap.status!==0) diagnoseBootstrap();
    }
    assert.equal(bootstrap.status,0,`Kind bootstrap failed; see artifacts/staging/bootstrap/${state.deploymentId}/result.json`);
    state.nodeId = JSON.parse(docker(['inspect',`${target.cluster}-control-plane`]))[0].Id;
    kubectl(['create','namespace',target.namespace]);
    state.namespaceUid = JSON.parse(kubectl(['get','namespace',target.namespace,'-o','json'])).metadata.uid;
    state = seal(state);
    kubectl(['annotate','namespace',target.namespace,`phase2.fingerprint=${state.fingerprint}`]);
    fs.renameSync(path.join(local,'bootstrap-state.json'),path.join(local,`registered-bootstrap-${state.deploymentId}.json`));
    fs.renameSync(path.join(local,'pending.json'),path.join(local,`registered-pending-${state.deploymentId}.json`));
  }
  live(state);
  if (state.sourceRevision !== sourceRevision()) {
    state.sourceRevision = sourceRevision(); state = seal(state);
    kubectl(['annotate','namespace',target.namespace,`phase2.fingerprint=${state.fingerprint}`,'--overwrite']);
  }
  await foundationGate(state);
  if(bootstrapOnly) { console.log('Control-plane-only gate PASS; no application workloads deployed'); return; }
  const image = `phase2-staging/platform:${sourceRevision(true).slice(-16)}`;
  console.log('Building the foundation image from current source');
  run('docker',['build','-f','deploy/staging/Dockerfile','-t',image,'.'],{timeout:600000});
  for (const ref of Object.values(target.images).filter(x => x !== target.images.node)) {
    const inspect = run('docker',['image','inspect',ref],{allowFailure:true,result:true});
    if(inspect.status !== 0) run('docker',['pull',ref],{timeout:300000});
  }
  console.log('Loading exact images into staging');
  const objectImage = `phase2-staging/object-storage:${target.images.objectStorage.split('sha256:')[1].slice(0,16)}`;
  docker(['tag',target.images.objectStorage,objectImage]);
  // Docker Desktop's containerd store may retain multi-platform indexes without
  // every platform blob. Export only this cluster's linux/amd64 platform.
  const archive = path.join(local,'images.tar');
  const refs = [image,target.images.postgres,target.images.redis,objectImage,target.images.registry];
  const loaded = JSON.parse(docker(['exec',`${target.cluster}-control-plane`,'crictl','images','-o','json'])).images.flatMap(x=>x.repoTags || []);
  const normalized = ref => ref.includes('/') ? `docker.io/${ref}` : `docker.io/library/${ref}`;
  const missing = refs.filter(ref=>!loaded.includes(normalized(ref)));
  if (missing.length) {
    run('docker',['image','save','--platform','linux/amd64','--output',archive,...missing],{timeout:600000});
    run('kind',['load','image-archive','--name',target.cluster,archive],{timeout:600000});
  }
  // Only a successful NotFound response permits generation; API errors must not
  // rotate credentials underneath an existing persistent database.
  const secretExists = Boolean(kubectl(['-n',target.namespace,'get','secret','runtime','--ignore-not-found','-o','name']));
  if (!secretExists) {
    const random = () => crypto.randomBytes(32).toString('hex');
    const pg = random(), redis = random(), registry = random();
    const publicKey = crypto.generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({format:'jwk'});
    const data = { POSTGRES_PASSWORD:pg, REDIS_PASSWORD:redis, DATABASE_URL:`postgres://phase2_staging:${pg}@postgres:5432/${target.database}`,REDIS_URL:`redis://:${redis}@redis:6379`,
      MINIO_ROOT_USER:'phase2-staging',MINIO_ROOT_PASSWORD:random(),REGISTRY_USER:'phase2-staging',REGISTRY_PASSWORD:registry,
      CREDENTIAL_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64'),AUDIT_INTEGRITY_KEY:crypto.randomBytes(32).toString('base64'),METRICS_TOKEN:random(),
      JWT_JWKS:JSON.stringify({keys:[{...publicKey,kid:state.deploymentId,alg:'RS256',use:'sig'}]}) };
    const htpasswd = run('docker',['run','--rm','-i','--network','none','httpd:2.4.65-alpine','htpasswd','-niB','phase2-staging'],{input:registry+'\n',timeout:300000});
    apply([{apiVersion:'v1',kind:'Secret',metadata:{name:'runtime',namespace:target.namespace},stringData:data},
      {apiVersion:'v1',kind:'Secret',metadata:{name:'registry-auth',namespace:target.namespace},stringData:{htpasswd}}]);
  }
  const items = manifests({...target,images:{...target.images,objectStorage:objectImage}},state,image);
  const dir = path.join(root,'artifacts/staging',state.fingerprint); fs.mkdirSync(dir,{recursive:true});
  json(path.join(dir,'deployment.json'),{apiVersion:'v1',kind:'List',items});
  kubectl(['apply','--dry-run=server','-f','-'], { input: JSON.stringify({ apiVersion:'v1',kind:'List',items:items.filter(x=>x.kind!=='Job') }) });
  // Apply dependencies/policies before application deployment; migration is the existing Phase 1 runner.
  const applications = new Set(['api','worker','gateway','verifier','untrusted']);
  apply(items.filter(x => !(x.kind === 'Deployment' && applications.has(x.metadata.name)) && x.kind !== 'Job'));
  for (const name of ['postgres','redis','object-storage','registry']) kubectl(['-n',target.namespace,'rollout','status',`deployment/${name}`,'--timeout=180s'],{timeout:200000});
  const job = items.find(x=>x.kind==='Job');
  if(!kubectl(['-n',target.namespace,'get','job','migrate','--ignore-not-found','-o','name'])) apply([job]);
  kubectl(['-n',target.namespace,'wait','--for=condition=complete','job/migrate','--timeout=120s']);
  apply(items.filter(x=>x.kind==='Deployment' && applications.has(x.metadata.name)));
  for (const name of applications) kubectl(['-n',target.namespace,'rollout','status',`deployment/${name}`,'--timeout=180s'],{timeout:200000});
  console.log('Staging provisioned; run verify for acceptance evidence');
}
async function verify() {
  const state = readState(); live(state);
  assert.equal(state.sourceRevision,sourceRevision(),'Source changed since provisioning; run up before collecting release evidence');
  const ns = ['-n',target.namespace];
  const systemPods = JSON.parse(kubectl(['-n','kube-system','get','pods','-o','json']));
  for(const pod of systemPods.items) {
    if(pod.status.phase === 'Succeeded') continue;
    assert.ok(pod.status.containerStatuses?.length && pod.status.containerStatuses.every(c=>c.ready),`${pod.metadata.name} control-plane/networking pod not Ready`);
  }
  const deployments = JSON.parse(kubectl([...ns,'get','deployments','-o','json']));
  assert.equal(deployments.items.length,9);
  for (const d of deployments.items) assert.equal(d.status.readyReplicas,1,`${d.metadata.name} not Ready`);
  for (const d of deployments.items) {
    const spec=d.spec.template.spec;
    assert.equal(spec.automountServiceAccountToken,false); assert.ok(!spec.hostNetwork);
    for(const c of spec.containers) {
      for(const type of ['requests','limits']) for(const resource of ['cpu','memory']) assert.ok(c.resources[type][resource]);
      assert.equal(c.securityContext.allowPrivilegeEscalation,false);
      if(!['verifier','untrusted'].includes(d.metadata.name)) for(const probe of ['startupProbe','readinessProbe','livenessProbe']) assert.ok(c[probe]);
    }
  }
  const services = JSON.parse(kubectl([...ns,'get','services','-o','json']));
  for (const s of services.items) { assert.equal(s.spec.type,s.metadata.name==='gateway'?'NodePort':'ClusterIP'); assert.ok(!s.spec.externalIPs?.length); }
  const node = JSON.parse(docker(['inspect',`${target.cluster}-control-plane`]))[0];
  for(const bindings of Object.values(node.NetworkSettings.Ports)) for(const b of bindings || []) assert.equal(b.HostIp,'127.0.0.1');
  for(const account of ['api','worker','postgres','redis','object-storage','registry','gateway','verifier','untrusted']) {
    for(const [verb,resource,scope] of [['get','secrets',ns],['create','deployments',ns],['get','nodes',[]],['delete','namespaces',[]]]) {
      assert.equal(kubectl(['auth','can-i',verb,resource,...scope,`--as=system:serviceaccount:${target.namespace}:${account}`],{allowFailure:true}),'no');
    }
  }
  const dependencies = JSON.parse(kubectl([...ns,'exec','deployment/verifier','--','node','staging-smoke.cjs']));
  const appConnectivity = `const a=require('assert/strict');(async()=>{a.equal(process.env.NODE_ENV,'staging');a.notEqual(process.env.CREDENTIAL_ENCRYPTION_KEY,process.env.AUDIT_INTEGRITY_KEY);a.equal((await fetch(process.env.OBJECT_STORAGE_ENDPOINT+'/minio/health/ready',{signal:AbortSignal.timeout(5000)})).status,200);a.equal((await fetch(process.env.REGISTRY_ENDPOINT+'/v2/',{headers:{authorization:'Basic '+Buffer.from(process.env.REGISTRY_USER+':'+process.env.REGISTRY_PASSWORD).toString('base64')},signal:AbortSignal.timeout(5000)})).status,200);console.log('staging-connectivity-pass')})().catch(()=>process.exit(1))`;
  for(const app of ['api','worker']) assert.equal(kubectl([...ns,'exec',`deployment/${app}`,'--','node','-e',appConnectivity]),'staging-connectivity-pass');
  const negative = kubectl([...ns,'exec','deployment/verifier','--','node','-e',"process.env.DATABASE_URL='postgres://invalid.invalid/unreachable';require('./staging-smoke.cjs')"],{allowFailure:true,result:true});
  assert.notEqual(negative.status,0,'Unavailable dependency must fail the smoke gate');
  const forbidden = `const net=require('net');(async()=>{for(const [host,port] of [['postgres',5432],['redis',6379],['object-storage',9000],['registry',5000],['api',3000],['worker',3002]])await new Promise((ok,bad)=>{let s=net.connect({host,port});s.setTimeout(2000);s.on('connect',()=>{s.destroy();bad(Error('forbidden connection'))});s.on('timeout',()=>{s.destroy();ok()});s.on('error',e=>{if(e.code==='ENOTFOUND')bad(e);else ok()})});console.log('denied:6')})().catch(()=>process.exit(1))`;
  assert.equal(kubectl([...ns,'exec','deployment/untrusted','--','node','-e',forbidden]),'denied:6');
  const dns = await require('node:dns').promises.lookup(target.hostname); assert.ok(['127.0.0.1','::1'].includes(dns.address));
  for(const route of ['/api/v1/health','/api/v1/ready']) assert.equal((await fetch(`http://${target.hostname}:${target.hostPort}${route}`,{signal:AbortSignal.timeout(5000)})).status,200);
  for(const route of ['/api/v1/internal/metrics','/metrics','/admin']) assert.equal((await fetch(`http://${target.hostname}:${target.hostPort}${route}`,{signal:AbortSignal.timeout(5000)})).status,404);
  const pods = JSON.parse(kubectl([...ns,'get','pods','-o','json']));
  const versions = { docker:docker(['version','--format','{{.Server.Version}}']),kind:run('kind',['version']),kubernetes:JSON.parse(kubectl(['version','-o','json'])).serverVersion.gitVersion,
    postgres:dependencies.postgres,redis:dependencies.redis,objectStorage:kubectl([...ns,'exec','deployment/object-storage','--','minio','--version']),registry:kubectl([...ns,'exec','deployment/registry','--','registry','--version']) };
  const evidence = { fingerprint:state.fingerprint,environmentType:'disposable-local-kind-staging',target,sourceRevision:state.sourceRevision,infrastructureVersion:target.infrastructureVersion,configurationVersion:target.configurationVersion,
    manifestRevision:hash(fs.readFileSync(path.join(root,'artifacts/staging',state.fingerprint,'deployment.json')).toString()),verificationTimestamp:new Date().toISOString(),healthGate:'PASS',versions,dependencies,
    images:[...pods.items,...systemPods.items].flatMap(p=>(p.status.containerStatuses||[]).map(c=>({pod:p.metadata.name,image:c.image,imageId:c.imageID,restarts:c.restartCount}))),networkPolicy:{allowed:'dependency smoke plus API/worker storage and registry connectivity passed',forbidden:'6 connections denied'},negativeDependencyGate:'PASS',rbac:'36 denials',commands:commandLog };
  json(path.join(root,'artifacts/staging',state.fingerprint,'manifest.json'),evidence);
  console.log(`Health gate PASS: artifacts/staging/${state.fingerprint}/manifest.json`);
}
function teardown() {
  const state = readState(); live(state);
  const evidenceDir = path.join(root,'artifacts/staging',state.fingerprint); fs.mkdirSync(evidenceDir,{recursive:true});
  const network = JSON.parse(docker(['network','inspect',target.network]))[0];
  assert.deepEqual(Object.keys(network.Containers || {}),[state.nodeId],'Unexpected container attached: abort');
  const node = JSON.parse(docker(['inspect',`${target.cluster}-control-plane`]))[0];
  const ownedVolumes = node.Mounts.filter(m=>m.Type==='volume').map(m=>m.Name);
  for(const volume of ownedVolumes) assert.ok(!state.before.volumes.includes(volume),'Node uses a pre-existing volume: abort');
  const before = snapshot();
  run('kind',['delete','cluster','--name',target.cluster,'--kubeconfig',kubeconfig]);
  docker(['network','rm',target.network]);
  const after = snapshot();
  for(const item of state.before.containers) assert.ok(after.containers.includes(item),`Unrelated container missing: ${item}`);
  for(const item of before.volumes.filter(v=>!ownedVolumes.includes(v))) assert.ok(after.volumes.includes(item),`Unrelated volume missing: ${item}`);
  for(const volume of ownedVolumes) assert.ok(!after.volumes.includes(volume),'Staging node volume remains after Kind teardown');
  for(const item of state.before.networks) assert.ok(after.networks.includes(item),`Unrelated network missing: ${item}`);
  assert.ok(!after.containers.some(v=>v.includes(target.cluster))); assert.ok(!after.networks.some(v=>v.endsWith(` ${target.network}`)));
  json(path.join(evidenceDir,'teardown.json'),{timestamp:new Date().toISOString(),result:'PASS',ownedVolumes,before,after,commands:commandLog});
  fs.renameSync(statePath,path.join(local,`removed-${state.deploymentId}.json`));
  console.log('Exact staging cluster/network removed; unrelated resources preserved');
}
function diagnoseBootstrap() {
  const bootstrapState=fs.existsSync(path.join(local,'bootstrap-state.json')) ? path.join(local,'bootstrap-state.json') : path.join(local,`registered-bootstrap-${readState().deploymentId}.json`);
  const state=JSON.parse(fs.readFileSync(bootstrapState));
  const node=JSON.parse(docker(['inspect',`${target.cluster}-control-plane`]))[0];
  const network=JSON.parse(docker(['network','inspect',target.network]))[0];
  validateBootstrap(state,daemon(),node,network);
  const dir=path.join(root,'artifacts/staging/bootstrap',state.deploymentId); fs.mkdirSync(dir,{recursive:true});
  if(fs.existsSync(path.join(dir,'diagnostics.json'))) fs.copyFileSync(path.join(dir,'diagnostics.json'),path.join(dir,`diagnostics-before-${runId}.json`));
  const records=[];
  const capture=(command,args)=>{ const r=run(command,args,{allowFailure:true,result:true,timeout:30000}); const record={command,args,exitCode:r.status,errorCode:r.error?.code,stdout:r.stdout,stderr:r.stderr};records.push(record);json(path.join(dir,'diagnostics.json'),{timestamp:new Date().toISOString(),identity:state,node:{Id:node.Id,State:node.State,ports:node.NetworkSettings.Ports},network,records});return r; };
  const exec=args=>capture('docker',['exec',node.Id,...args]);
  capture('docker',['stats','--no-stream','--format','{{.Name}} {{.CPUPerc}} {{.MemUsage}}']);
  exec(['cat','/proc/meminfo','/proc/pressure/memory','/proc/pressure/cpu','/proc/pressure/io']);
  exec(['cat','/sys/fs/cgroup/cpu.max','/sys/fs/cgroup/cpu.stat','/sys/fs/cgroup/memory.events']);
  exec(['sh','-c','curl -fsS http://127.0.0.1:2381/metrics | grep -E "etcd_disk_(wal_fsync|backend_commit)_duration_seconds_(sum|count|bucket)|etcd_server_(has_leader|proposals_pending|leader_changes_seen_total)"']);
  exec(['df','-h','/var']); exec(['ip','route']); exec(['ss','-lnt']);
  exec(['journalctl','-u','kubelet','--no-pager','-n','180']);
  exec(['journalctl','-k','--no-pager','-n','80']);
  const containers=exec(['crictl','ps','-a','-o','json']);
  if(containers.status===0) for(const c of JSON.parse(containers.stdout).containers.filter(c=>/^(etcd|kube-apiserver|kube-scheduler|kube-controller-manager)$/.test(c.metadata.name)).slice(0,12)) exec(['crictl','logs','--tail=100',c.id]);
  console.log(`Bootstrap diagnostics saved: artifacts/staging/bootstrap/${state.deploymentId}/diagnostics.json`);
}
async function foundationGate(state) {
  const dir=path.join(root,'artifacts/staging',state.fingerprint); fs.mkdirSync(dir,{recursive:true});
  const evidence={timestamp:new Date().toISOString(),fingerprint:state.fingerprint,result:'BLOCKED',samples:[]};
  try {
    kubectl(['wait','--for=condition=Ready','node',`${target.cluster}-control-plane`,'--timeout=90s'],{timeout:100000});
    for(let i=0;i<3;i++) {
      const sample={timestamp:new Date().toISOString(),readyz:kubectl(['get','--raw=/readyz','--request-timeout=10s']),nodes:JSON.parse(kubectl(['get','nodes','-o','json','--request-timeout=10s'])),pods:JSON.parse(kubectl(['-n','kube-system','get','pods','-o','json','--request-timeout=10s']))};
      evidence.samples.push(sample); validateSample(sample,evidence.samples[i-1]);
      console.log(`Control-plane stability sample ${i+1}/3 passed`);
      // Bounded observation for restart/leader failures, not a bootstrap delay or retry.
      if(i<2) await new Promise(resolve=>setTimeout(resolve,30000));
    }
    evidence.result='PASS';
  } finally { json(path.join(dir,`foundation-${runId}.json`),evidence); }
}
function cleanupBootstrap() {
  assert.ok(!fs.existsSync(statePath),'Registered namespace requires guarded down');
  const file=path.join(local,'bootstrap-state.json'), state=JSON.parse(fs.readFileSync(file));
  const node=JSON.parse(docker(['inspect',`${target.cluster}-control-plane`]))[0];
  const network=JSON.parse(docker(['network','inspect',target.network]))[0];
  validateBootstrap(state,daemon(),node,network);
  const dir=path.join(root,'artifacts/staging/bootstrap',state.deploymentId);
  assert.ok(fs.existsSync(path.join(dir,'diagnostics.json')),'Capture diagnostics before destructive recovery');
  const before=snapshot(),ownedVolumes=node.Mounts.filter(m=>m.Type==='volume').map(m=>m.Name);
  run('kind',['delete','cluster','--name',target.cluster,'--kubeconfig',kubeconfig]);
  docker(['network','rm',network.Id]);
  const after=snapshot();
  for(const category of ['containers','volumes','networks']) for(const item of before[category]) {
    if(category==='containers' && item===`${node.Id.slice(0,12)} ${target.cluster}-control-plane`) continue;
    if(category==='networks' && item.endsWith(` ${target.network}`)) continue;
    if(category==='volumes' && ownedVolumes.includes(item)) continue;
    assert.ok(after[category].includes(item),`Unrelated ${category} missing`);
  }
  for(const category of ['containers','volumes','networks']) for(const item of state.before[category]) assert.ok(after[category].includes(item));
  assert.ok(!after.containers.some(x=>x.includes(target.cluster)));
  assert.ok(!after.networks.some(x=>x.endsWith(` ${target.network}`)));
  for(const volume of ownedVolumes) assert.ok(!after.volumes.includes(volume));
  json(path.join(dir,'cleanup.json'),{timestamp:new Date().toISOString(),result:'PASS',scope:'registered-bootstrap-only',identity:state,ownedVolumes,before,after,commands:commandLog});
  fs.renameSync(file,path.join(local,`removed-bootstrap-${state.deploymentId}.json`));
  fs.renameSync(path.join(local,'pending.json'),path.join(local,`removed-pending-${state.deploymentId}.json`));
  console.log('Registered bootstrap removed; unrelated inventories preserved');
}
function cleanupPending() {
  assert.ok(!fs.existsSync(statePath),'Registered environment requires guarded down');
  const pendingPath = path.join(local,'pending.json');
  const pending = JSON.parse(fs.readFileSync(pendingPath));
  assert.equal(pending.daemonId,daemon(),'Pending record belongs to another Docker daemon');
  assert.match(pending.deploymentId,/^[a-f0-9-]{36}$/);
  assert.match(pending.sourceRevision,/^source-sha256:[a-f0-9]{64}$/);
  assert.ok(!pending.before.containers.some(v=>v.includes(target.cluster)));
  assert.ok(!pending.before.networks.some(v=>v.endsWith(` ${target.network}`)));
  const before = snapshot();
  assert.ok(!before.containers.some(v=>v.includes(target.cluster)),'Cluster container exists; pending cleanup cannot delete it');
  assert.ok(!run('kind',['get','clusters']).split(/\s+/).includes(target.cluster),'Kind cluster exists');
  const network = JSON.parse(docker(['network','inspect',target.network]))[0];
  assert.equal(network.Name,target.network);
  assert.equal(network.Labels['phase2.deployment'],pending.deploymentId,'Network owner mismatch');
  assert.deepEqual(Object.keys(network.Containers || {}),[],'Network is in use');
  const dir = path.join(root,'artifacts/staging/bootstrap',pending.deploymentId); fs.mkdirSync(dir,{recursive:true});
  docker(['network','rm',network.Id]);
  const after = snapshot();
  for(const category of ['containers','volumes','networks']) {
    for(const item of before[category]) {
      if(category==='networks' && item.endsWith(` ${target.network}`)) continue;
      assert.ok(after[category].includes(item),`Unrelated ${category} changed`);
    }
    for(const item of pending.before[category]) assert.ok(after[category].includes(item),`Baseline ${category} missing`);
  }
  assert.ok(!after.networks.some(v=>v.endsWith(` ${target.network}`)));
  assert.ok(!after.containers.some(v=>v.includes(target.cluster)));
  json(path.join(dir,'cleanup.json'),{timestamp:new Date().toISOString(),result:'PASS',scope:'empty-owned-bootstrap-network-only',pending,networkId:network.Id,before,after,commands:commandLog});
  fs.renameSync(pendingPath,path.join(local,`removed-pending-${pending.deploymentId}.json`));
  console.log('Empty owned bootstrap network removed; unrelated inventories preserved');
}
async function main() {
  const action = process.argv[2];
  if(action==='up') await provision(); else if(action==='bootstrap') await provision(true); else if(action==='diagnose-bootstrap') diagnoseBootstrap(); else if(action==='cleanup-bootstrap') cleanupBootstrap(); else if(action==='verify') await verify(); else if(action==='down') teardown(); else if(action==='cleanup-pending') cleanupPending();
  else throw new Error('Usage: node scripts/staging/main.cjs up|bootstrap|diagnose-bootstrap|cleanup-bootstrap|verify|down|cleanup-pending');
}
main().catch(error=>{ console.error(error.message); process.exitCode=1; }).finally(()=>{
  json(path.join(local,'last-commands.json'),commandLog);
  const runs = path.join(root,'artifacts/staging/runs'); fs.mkdirSync(runs,{recursive:true});
  json(path.join(runs,`${runId}.json`),{timestamp:new Date().toISOString(),action:process.argv[2],exitCode:process.exitCode || 0,commands:commandLog});
});
