const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { expected, fingerprint, validateTarget, validateState, validateLive } = require('./safety.cjs');
const { environmentIssues } = require('../../services/control-plane-api/src/environment-security');
const { validateBootstrap,validateSample } = require('./foundation.cjs');
for (const [name, change] of Object.entries({ unknown:{cluster:'unknown'},production:{cluster:'production'},customer:{cluster:'customer-cluster'},namespace:{namespace:'default'},account:{account:'unregistered'},dns:{dnsZone:'production.example'},invalid:{hostPort:0} })) {
  test(`reject ${name} target before infrastructure calls`,()=>assert.throws(()=>validateTarget({...expected,...change})));
}
function state() { const s = {daemonId:'daemon-one',deploymentId:crypto.randomUUID(),sourceRevision:'source-sha256:fixture',nodeId:'node-one',namespaceUid:'uid-one'}; return {...s,fingerprint:fingerprint(expected,s)}; }
test('wrong fingerprint rejected',()=>assert.throws(()=>validateState(expected,{...state(),fingerprint:'wrong'},'daemon-one')));
test('wrong daemon rejected',()=>assert.throws(()=>validateState(expected,state(),'daemon-two')));
test('unsafe teardown/replaced cluster rejected',()=>{const s=state();assert.throws(()=>validateLive(expected,s,{daemonId:s.daemonId,nodeId:'replaced',cluster:expected.cluster,namespace:expected.namespace,network:expected.network,fingerprint:s.fingerprint,namespaceUid:s.namespaceUid}));});
test('valid registered live identity accepted',()=>{const s=state();validateLive(expected,s,{daemonId:s.daemonId,nodeId:s.nodeId,cluster:expected.cluster,namespace:expected.namespace,network:expected.network,fingerprint:s.fingerprint,namespaceUid:s.namespaceUid});});
for (const password of ['password','local_dev_pg_7f3c_change_me','demo-credential-long-enough-but-invalid']) test(`production rejects synthetic credential ${password}`,()=>assert.ok(environmentIssues({NODE_ENV:'production',DATABASE_URL:`postgres://user:${password}@db/db`}).length));
test('production rejects staging identity and endpoints',()=>{for(const value of [{PLATFORM_ENVIRONMENT:'staging'},{DATABASE_URL:'postgres://phase2_staging:random@postgres/phase2_staging'},{REDIS_URL:'redis://phase2-staging:6379'}])assert.ok(environmentIssues({NODE_ENV:'production',...value}).length);});
test('production rejects known deterministic integrity key',()=>assert.ok(environmentIssues({NODE_ENV:'production',AUDIT_INTEGRITY_KEY:Buffer.alloc(32,9).toString('base64')}).length));
function bootstrapFixture() {
  const s={daemonId:'daemon-one',deploymentId:crypto.randomUUID(),sourceRevision:'source-sha256:fixture',scope:'bootstrap-only',nodeId:'node-one',networkId:'network-one',before:{containers:[],networks:[],volumes:[]}};
  s.fingerprint=fingerprint(expected,s);
  const node={Id:s.nodeId,Name:`/${expected.cluster}-control-plane`,Config:{Labels:{'io.x-k8s.kind.cluster':expected.cluster}},NetworkSettings:{Networks:{[expected.network]:{}}},Mounts:[{Type:'volume',Name:'new-volume'}]};
  const network={Id:s.networkId,Name:expected.network,Labels:{'phase2.deployment':s.deploymentId},Containers:{[s.nodeId]:{}}};
  return {s,node,network};
}
test('valid registered bootstrap ownership accepted',()=>{const {s,node,network}=bootstrapFixture();validateBootstrap(s,s.daemonId,node,network);});
for(const [name,mutate] of Object.entries({replacement:x=>{x.node.Id='different';},foreignNetwork:x=>{x.network.Labels['phase2.deployment']='foreign';},attachedContainer:x=>{x.network.Containers.other={};},preexistingVolume:x=>{x.node.Mounts[0].Name='old';x.s.before.volumes.push('old');x.s.fingerprint=fingerprint(expected,Object.fromEntries(Object.entries(x.s).filter(([k])=>k!=='fingerprint')));},wrongCluster:x=>{x.node.Config.Labels['io.x-k8s.kind.cluster']='platform-local';}})) {
  test(`bootstrap cleanup rejects ${name}`,()=>{const x=bootstrapFixture();mutate(x);assert.throws(()=>validateBootstrap(x.s,x.s.daemonId,x.node,x.network));});
}
function sample() { return {readyz:'ok',nodes:{items:[{status:{conditions:[{type:'Ready',status:'True'}]}}]},pods:{items:['kube-apiserver','etcd','kube-scheduler','kube-controller-manager'].map(component=>({metadata:{uid:component,labels:{component}},status:{containerStatuses:[{name:component,ready:true,restartCount:0,state:{running:{}}}]}}))}}; }
test('stable control-plane samples accepted',()=>validateSample(sample(),sample()));
test('control-plane restart blocks application deployment',()=>{const current=sample();current.pods.items[2].status.containerStatuses[0].restartCount=1;assert.throws(()=>validateSample(current,sample()));});
test('control-plane missing or unready component rejected',()=>{const current=sample();current.pods.items.pop();assert.throws(()=>validateSample(current));});
