const assert = require('node:assert/strict');
const { createApplication } = require('../../src/server');
const { runtimeConfig, requireDurableOverrides } = require('../../src/production');
const { PostgresRepository } = require('../../src/domain/postgres-repository');
const { MemoryRepository } = require('../../src/domain/repositories');

const { productionEnv } = require('../helpers/production-config');
describe('Part 2 production fail-closed composition', () => {
  it('validates the production fixture and revalidates parsed config', () => {
    const config = runtimeConfig({ env: productionEnv() });
    assert.equal(runtimeConfig({ config }).NODE_ENV, 'production');
  });
  for (const name of ['DATABASE_URL','CREDENTIAL_ENCRYPTION_KEY','AUDIT_INTEGRITY_KEY']) {
    it(`rejects missing ${name} even through options.config`, () => {
      const config = productionEnv(); delete config[name];
      assert.throws(() => createApplication({ config }), new RegExp(name));
    });
  }
  for (const name of ['repository','deploymentStore','configurationStore','previewStore','byocStore','secretStore','approvalStore','policyExceptionStore','auditService','usageLedger','entitlements','quotaManager','deploymentQueue']) {
    it(`rejects injected memory ${name} at startup`, () => {
      assert.throws(() => createApplication({ env: productionEnv(), [name]: new MemoryRepository() }), new RegExp(`durable ${name}`));
    });
  }
  it('rejects a real memory repository and null overrides rather than ignoring them', () => {
    const config = runtimeConfig({ env: productionEnv() });
    assert.throws(() => requireDurableOverrides(config, { repository: new MemoryRepository() }, { repository: PostgresRepository }), /durable repository/);
    assert.throws(() => requireDurableOverrides(config, { repository: null }, { repository: PostgresRepository }), /durable repository/);
  });
  for (const AUTH_MODE of ['test','demo']) it(`rejects ${AUTH_MODE} authentication`, () => {
    assert.throws(() => createApplication({ config: { ...productionEnv(), AUTH_MODE } }), /forbidden/);
  });
  it('worker rejects memory repository, store and queue overrides before connecting', async () => {
    const { startWorker } = require('../../src/worker/main');
    for (const name of ['repository','store','queue'])
      await assert.rejects(startWorker({ env: productionEnv(), [name]: new MemoryRepository() }), new RegExp(`durable ${name}`));
  });
});
module.exports = { productionEnv };
