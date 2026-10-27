const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createPool } = require("./pool");

// Database-local session lock covers discovery, DDL and history, including the
// first CREATE TABLE. It must stay on the same connection across transactions.
const MIGRATION_LOCK = [735303, 1];
function migrationBody(sql) {
  const body = sql.replace(/^\s*BEGIN;\s*/i, "")
    .replace(/\bCOMMIT;\s*((?:--[^\n]*(?:\n|$)\s*)*)$/i, "$1");
  if (/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im.test(body))
    throw new Error("Unsupported migration transaction boundary");
  return body;
}

async function migrate(poolOverride) {
  const pool = poolOverride || createPool(process.env);
  if (!pool) throw new Error("DATABASE_URL is required to run migrations");
  const ownPool = !poolOverride;
  let client, failure, cleanupFailure, locked = false;
  try {
    client = await pool.connect();
    const previousTimeout = (await client.query("SHOW lock_timeout")).rows[0].lock_timeout;
    // A competing migration or production DDL must fail visibly rather than wait
    // forever. This is a new bounded lock wait, not a retry or timeout increase.
    await client.query("SET lock_timeout = '30s'");
    await client.query("SELECT pg_advisory_lock($1::int,$2::int)", MIGRATION_LOCK);
    locked = true;
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    );
    const directory = path.join(__dirname, "..", "..", "migrations");
    const files = fs
      .readdirSync(directory)
      .filter((name) => /^\d+.*\.sql$/.test(name))
      .sort();
    for (const name of files) {
      const sql = fs.readFileSync(path.join(directory, name), "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const applied = await client.query(
        "SELECT checksum FROM schema_migrations WHERE name=$1",
        [name],
      );
      if (applied.rowCount) {
        if (applied.rows[0].checksum !== checksum)
          throw new Error(`Applied migration was modified: ${name}`);
        continue;
      }
      const startedAt = new Date().toISOString();
      await client.query("BEGIN");
      try {
        await client.query(migrationBody(sql));
        await client.query(
          "INSERT INTO schema_migrations (name,checksum) VALUES ($1,$2)",
          [name, checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
      console.log(
        JSON.stringify({
          level: "info",
          message: "Migration applied",
          migration: name,
          startedAt,
          endedAt: new Date().toISOString(),
          durationMs: Date.now() - Date.parse(startedAt),
        }),
      );
    }
    await client.query("SELECT set_config('lock_timeout',$1,false)", [previousTimeout]);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (client) {
      try { if (locked) await client.query("SELECT pg_advisory_unlock($1::int,$2::int)", MIGRATION_LOCK); }
      catch (error) { cleanupFailure = error; }
      // Discard a failed connection, ensuring session locks/settings cannot leak
      // back to an application pool, including connection-loss error paths.
      client.release(failure || cleanupFailure);
    }
    if (ownPool) await pool.end();
  }
  if (cleanupFailure) throw cleanupFailure;
}

if (require.main === module)
  migrate().catch((error) => {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Migration failed",
        error: error.message,
      }),
    );
    process.exitCode = 1;
  });
module.exports = { migrate, migrationBody, MIGRATION_LOCK };
