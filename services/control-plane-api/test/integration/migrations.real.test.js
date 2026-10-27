const { Pool } = require("pg");
const { expect } = require("chai");
const { migrate } = require("../../src/database/migrate");
describe("migrations on a database", () => {
  let admin;
  let created = false;
  const database = `cp_migration_${process.pid}`;
  before(async () => {
    admin = new Pool({
      connectionString:
        process.env.POSTGRES_ADMIN_URL ||
        "postgres://control_plane:testpass@127.0.0.1:5432/postgres",
    });
    await admin.query(`CREATE DATABASE ${database}`);
    created = true;
  });
  after(async () => {
    if (admin && created) {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1",
        [database],
      );
      await admin.query(`DROP DATABASE ${database}`);
    }
    if (admin) await admin.end();
  });
  it("applies from empty and is repeatable", async () => {
    const target = new URL(
      process.env.POSTGRES_ADMIN_URL ||
        "postgres://control_plane:testpass@127.0.0.1:5432/postgres",
    );
    target.pathname = `/${database}`;
    const pool = new Pool({ connectionString: target.toString() });
    await migrate(pool);
    await migrate(pool);
    const applied = await pool.query(
      "SELECT name FROM schema_migrations ORDER BY name",
    );
    expect(applied.rows.map((r) => r.name)).to.deep.equal([
      "001_control_plane_foundation.sql",
      "002_identity_organizations_rbac.sql",
      "003_github_repository_onboarding.sql",
      "004_deployment_pipeline.sql",
      "005_registry_kubernetes.sql",
      "006_service_detection_configuration.sql",
      "007_deployment_observability.sql",
      "008_previews_domains_tls.sql",
      "009_safe_rollback.sql",
      "010_byoc_foundation.sql",
      "011_enterprise_rbac_managed_secrets.sql",
      "012_approval_policy_kyverno_drift.sql",
      "013_enterprise_audit.sql",
      "014_usage_billing_quotas.sql",
      "015_durable_component_state.sql",
      "016_persistence_hardening.sql",
      "017_system_audit_scope.sql",
    ]);
    const tables = await pool.query(
      "SELECT to_regclass('public.user_sessions') AS sessions",
    );
    expect(tables.rows[0].sessions).to.equal("user_sessions");
    await pool.end();
  });
});
