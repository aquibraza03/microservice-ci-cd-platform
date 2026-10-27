'use strict';
const crypto = require('node:crypto');
const expected = require('../../deploy/staging/target.json');
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
function validateTarget(target) {
  // Exact allowlist, including all provider, namespace, network and DNS fields.
  if (canonical(target) !== canonical(expected)) throw new Error('Target is not the registered Phase 2 staging target');
  return target;
}
function fingerprint(target, identity) {
  validateTarget(target);
  return hash({ target, ...identity });
}
function validateState(target, state, daemonId) {
  validateTarget(target);
  if (!state || state.daemonId !== daemonId || !/^[a-f0-9-]{36}$/.test(state.deploymentId) || !state.sourceRevision)
    throw new Error('Staging ownership or Docker account identity mismatch');
  const { fingerprint: actual, ...identity } = state;
  if (actual !== fingerprint(target, identity)) throw new Error('Environment fingerprint mismatch');
}
function validateLive(target, state, live) {
  validateState(target, state, live.daemonId);
  if (live.nodeId !== state.nodeId || live.cluster !== target.cluster || live.network !== target.network ||
      live.namespace !== target.namespace || live.fingerprint !== state.fingerprint || live.namespaceUid !== state.namespaceUid)
    throw new Error('Live staging identity mismatch; refusing infrastructure operation');
}
module.exports = { expected, canonical, hash, validateTarget, fingerprint, validateState, validateLive };
