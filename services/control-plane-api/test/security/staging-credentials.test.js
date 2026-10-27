const assert = require('node:assert/strict');
const { loadConfig } = require('../../src/config');
const { productionEnv } = require('../helpers/production-config');
describe('Phase 2 production credential boundary', () => {
  function stagingEnv() {
    const { randomBytes } = require('node:crypto');
    return { ...productionEnv(), NODE_ENV: 'staging', PLATFORM_ENVIRONMENT: 'staging',
      DATABASE_URL: `postgres://phase2_staging:${randomBytes(32).toString('hex')}@postgres:5432/phase2_staging`,
      REDIS_URL: `redis://:${randomBytes(32).toString('hex')}@redis:6379`,
      REGISTRY_PROVIDER: 'local', LOCAL_REGISTRY_HOST: 'registry:5000', KUBERNETES_CONTEXT: 'kind-phase2-staging', DEPLOYMENT_QUEUE_NAME: 'phase2-staging' };
  }
  it('accepts an explicitly isolated staging configuration', () => assert.equal(loadConfig(stagingEnv()).NODE_ENV, 'staging'));
  for (const change of [{ CONTROL_PLANE_STORAGE: 'memory' }, { DATABASE_URL: 'postgres://production/db' }, { REDIS_URL: 'redis://customer-cache:6379' }, { KUBERNETES_CONTEXT: 'kind-platform-local' }, { AUTH_MODE: 'demo' }]) {
    it(`rejects unsafe staging ${Object.keys(change)[0]}`, () => assert.throws(() => loadConfig({ ...stagingEnv(), ...change })));
  }
  for (const password of ['password', 'local_dev_pg_7f3c_change_me', 'demo-password-for-production']) {
    it(`rejects synthetic default database credential ${password}`, () => {
      assert.throws(() => loadConfig({ ...productionEnv(), DATABASE_URL: `postgres://user:${password}@db/control_plane` }), /default\/demo/);
    });
  }
  it('rejects a staging identity even with otherwise valid production configuration', () => {
    assert.throws(() => loadConfig({ ...productionEnv(), PLATFORM_ENVIRONMENT: 'staging' }), /staging identity/);
  });
  it('rejects staging dependency targets', () => {
    assert.throws(() => loadConfig({ ...productionEnv(), DATABASE_URL: 'postgres://user@db/phase2_staging' }), /staging dependency/);
  });
  it('rejects deterministic placeholder integrity keys', () => {
    assert.throws(() => loadConfig({ ...productionEnv(), AUDIT_INTEGRITY_KEY: Buffer.alloc(32, 9).toString('base64') }), /placeholder/);
  });
  it('rejects missing Redis configuration and passwordless database credentials in production', () => {
    assert.throws(() => loadConfig({ ...productionEnv(), REDIS_URL: undefined }), /missing, default/);
    assert.throws(() => loadConfig({ ...productionEnv(), DATABASE_URL: 'postgres://user@db/database' }), /missing, default/);
  });
});
