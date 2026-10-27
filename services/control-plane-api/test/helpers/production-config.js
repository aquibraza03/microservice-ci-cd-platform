const { randomBytes } = require('crypto');
function productionEnv() {
  return {
    NODE_ENV: 'production', AUTH_MODE: 'jwt', CONTROL_PLANE_STORAGE: 'postgres',
    DATABASE_URL: process.env.DATABASE_URL || `postgres://fixture:${randomBytes(32).toString('hex')}@localhost/unreachable_fixture`,
    REDIS_URL: `redis://:${randomBytes(32).toString('hex')}@localhost:56379`,
    JWT_ISSUER: 'https://identity.example.test', JWT_AUDIENCE: 'test',
    JWT_JWKS: JSON.stringify({ keys: [{ kty: 'RSA', kid: 'test', alg: 'RS256', n: 'AQAB', e: 'AQAB' }] }),
    SESSION_VALIDATION: 'required', CORS_ALLOWED_ORIGINS: 'https://app.example.test',
    CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'), AUDIT_INTEGRITY_KEY: randomBytes(32).toString('base64'),
    GITHUB_APP_ID: '1', GITHUB_APP_SLUG: 'fixture', GITHUB_APP_PRIVATE_KEY: randomBytes(48).toString('base64'),
    GITHUB_APP_WEBHOOK_SECRET: randomBytes(32).toString('hex'), GITHUB_APP_CALLBACK_URL: 'https://app.example.test/callback',
    GHCR_OWNER: 'fixture', GHCR_USERNAME: 'fixture', GHCR_TOKEN: randomBytes(32).toString('hex'),
    COSIGN_KEY_PATH: '/fixture/test-key', AWS_PLATFORM_PRINCIPAL_ARN: 'arn:aws:iam::999999999999:role/fixture', METRICS_TOKEN: randomBytes(32).toString('hex'),
  };
}
module.exports = { productionEnv };
