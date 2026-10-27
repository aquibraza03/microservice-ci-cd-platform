const assert = require('node:assert/strict');
const { workerReady } = require('../../src/worker/readiness');
describe('staging worker dependency readiness', () => {
  it('fails during a transient database error and succeeds after the dependency recovers', async () => {
    let unavailable = true;
    const dependencies = { pool: { query: async () => { if (unavailable) throw new Error('offline'); } }, queue: { depth: async () => ({}) }, worker: { isRunning: () => true } };
    assert.equal(await workerReady(dependencies), false);
    unavailable = false;
    assert.equal(await workerReady(dependencies), true);
  });
  it('rejects an unavailable queue or a closing worker despite a healthy database', async () => {
    const dependencies = { pool: { query: async () => ({}) }, queue: { depth: async () => { throw new Error('offline'); } }, worker: { isRunning: () => true } };
    assert.equal(await workerReady(dependencies), false);
    dependencies.queue.depth = async () => ({});
    dependencies.worker.closing = Promise.resolve();
    assert.equal(await workerReady(dependencies), false);
  });
});
