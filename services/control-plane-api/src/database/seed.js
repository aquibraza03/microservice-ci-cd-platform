const { Client } = require("pg");

async function seed() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Development seed is forbidden in production");
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required to seed development data");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    const userId = "00000000-0000-4000-8000-000000000001";
    const organizationId = "00000000-0000-4000-8000-000000000002";
    const projectId = "00000000-0000-4000-8000-000000000003";
    await client.query(
      "INSERT INTO users (id, external_subject, email, display_name) VALUES ($1, 'demo-user', 'demo@example.test', 'Demo User') ON CONFLICT (external_subject) DO NOTHING",
      [userId],
    );
    await client.query(
      "INSERT INTO organizations (id, name, slug, display_name) VALUES ($1, 'Development Organization', 'development', 'Development Organization') ON CONFLICT (slug) DO NOTHING",
      [organizationId],
    );
    await client.query(
      "INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING",
      [organizationId, userId],
    );
    await client.query(
      "INSERT INTO projects (id, organization_id, name, slug, description) VALUES ($1, $2, 'Control Plane', 'control-plane', 'Development seed project') ON CONFLICT (organization_id, slug) DO NOTHING",
      [projectId, organizationId],
    );
    await client.query(
      "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING",
      [projectId, userId],
    );
    await client.query("COMMIT");
    console.log(
      JSON.stringify({ level: "info", message: "Development seed applied" }),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module)
  seed().catch((error) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Seed failed",
        error: error.message,
      }),
    );
    process.exitCode = 1;
  });
module.exports = { seed };
