'use strict';
const assert = require('node:assert/strict');
const { expected: target, validateState } = require('./safety.cjs');
function validateBootstrap(state, daemonId, node, network) {
  validateState(target,state,daemonId);
  assert.equal(state.scope,'bootstrap-only');
  assert.equal(node.Id,state.nodeId);
  assert.equal(node.Name,`/${target.cluster}-control-plane`);
  assert.equal(node.Config.Labels['io.x-k8s.kind.cluster'],target.cluster);
  assert.equal(network.Id,state.networkId);
  assert.equal(network.Name,target.network);
  assert.equal(network.Labels['phase2.deployment'],state.deploymentId);
  assert.deepEqual(Object.keys(node.NetworkSettings.Networks),[target.network]);
  assert.deepEqual(Object.keys(network.Containers || {}),[state.nodeId]);
  assert.ok(!state.before.containers.some(x=>x.includes(target.cluster)));
  assert.ok(!state.before.networks.some(x=>x.endsWith(` ${target.network}`)));
  for(const m of node.Mounts.filter(x=>x.Type==='volume')) assert.ok(!state.before.volumes.includes(m.Name));
}
function validateSample(sample, previous) {
  assert.equal(sample.readyz.trim(),'ok');
  assert.equal(sample.nodes.items.length,1);
  assert.ok(sample.nodes.items[0].status.conditions.some(c=>c.type==='Ready' && c.status==='True'));
  for(const component of ['kube-apiserver','etcd','kube-scheduler','kube-controller-manager']) {
    const pod=sample.pods.items.find(p=>p.metadata.labels?.component===component);
    assert.ok(pod,`Missing ${component}`);
    assert.ok(pod.status.containerStatuses?.length,`${component} has no status`);
    for(const c of pod.status.containerStatuses) {
      assert.ok(c.ready && c.state.running,`${component} is not running and Ready`);
      if(previous) {
        const old=previous.pods.items.find(p=>p.metadata.uid===pod.metadata.uid)?.status.containerStatuses?.find(x=>x.name===c.name);
        assert.ok(old,`${component} identity changed during stability observation`);
        assert.equal(c.restartCount,old.restartCount,`${component} restarted during stability observation`);
      }
    }
  }
}
module.exports={validateBootstrap,validateSample};
