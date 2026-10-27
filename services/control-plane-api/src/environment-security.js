const weak = /(?:change[_-]?me|default|demo|password|local_dev|local-development|example|phase2-staging)/i;
function environmentIssues(value) {
  const issues = [];
  const issue = (name, message) => issues.push({ name, message });
  if (value.NODE_ENV === 'staging' || value.PLATFORM_ENVIRONMENT === 'staging') {
    if (value.NODE_ENV !== 'staging' || value.PLATFORM_ENVIRONMENT !== 'staging') issue('PLATFORM_ENVIRONMENT', 'staging identity requires explicit staging runtime mode');
    if (value.CONTROL_PLANE_STORAGE !== 'postgres') issue('CONTROL_PLANE_STORAGE', 'staging requires durable PostgreSQL');
    if (value.AUTH_MODE !== 'jwt' || value.SESSION_VALIDATION !== 'required') issue('AUTH_MODE', 'staging requires verified JWT and tracked sessions');
    for (const [name, hostname, pathname] of [['DATABASE_URL','postgres','/phase2_staging'],['REDIS_URL','redis','']]) {
      try {
        const url = new URL(value[name]);
        if (url.hostname !== hostname || url.pathname !== pathname || decodeURIComponent(url.password).length < 32 || weak.test(decodeURIComponent(url.password))) throw new Error();
      } catch { issue(name, 'staging dependency must use the approved private target and generated credential'); }
    }
    for (const name of ['CREDENTIAL_ENCRYPTION_KEY','AUDIT_INTEGRITY_KEY']) {
      if (!value[name] || Buffer.from(value[name],'base64').length !== 32 || new Set(Buffer.from(value[name],'base64')).size < 8) issue(name, 'staging requires an independent generated 32-byte key');
    }
    if (!value.METRICS_TOKEN || value.METRICS_TOKEN.length < 32 || weak.test(value.METRICS_TOKEN)) issue('METRICS_TOKEN', 'staging requires a generated telemetry credential');
    if (value.REGISTRY_PROVIDER !== 'local' || value.LOCAL_REGISTRY_HOST !== 'registry:5000' || value.KUBERNETES_CONTEXT !== 'kind-phase2-staging' || value.DEPLOYMENT_QUEUE_NAME !== 'phase2-staging') issue('KUBERNETES_CONTEXT', 'staging runtime target is not allowlisted');
  }
  if (value.NODE_ENV !== 'production') return issues;
  if (value.PLATFORM_ENVIRONMENT === 'staging') issue('PLATFORM_ENVIRONMENT', 'production cannot use a staging identity');
  for (const name of ['DATABASE_URL', 'REDIS_URL']) {
    if (!value[name]) continue;
    try {
      const url = new URL(value[name]);
      const password = decodeURIComponent(url.password);
      if (!password || password.length < 24 || weak.test(password)) issue(name, 'production rejects missing, default/demo or weak credentials');
      if (/staging|phase2|platform.local/i.test(`${url.hostname}${url.pathname}${url.username}`)) issue(name, 'production rejects staging dependency targets');
    } catch { issue(name, 'production dependency URL is invalid'); }
  }
  for (const name of ['GHCR_TOKEN','GITHUB_OAUTH_CLIENT_SECRET','GITHUB_APP_WEBHOOK_SECRET','METRICS_TOKEN','CREDENTIAL_ENCRYPTION_KEY','AUDIT_INTEGRITY_KEY']) {
    if (value[name] && weak.test(value[name])) issue(name, 'production rejects default/demo credentials');
  }
  for (const name of ['CREDENTIAL_ENCRYPTION_KEY','AUDIT_INTEGRITY_KEY']) {
    if (value[name] && new Set(Buffer.from(value[name],'base64')).size < 8) issue(name, 'production rejects deterministic placeholder keys');
  }
  return issues;
}
module.exports = { environmentIssues };
