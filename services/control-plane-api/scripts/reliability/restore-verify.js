#!/usr/bin/env node
const fs = require("fs");
const fsp = fs.promises;
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const { decryptFile, run, sha256 } = require("./backup");

const CRITICAL_TABLES = [
  "organizations",
  "organization_members",
  "projects",
  "deployments",
  "deployment_events",
  "enterprise_audit_events",
  "audit_chain_heads",
];

async function verifyRestore({
  manifestPath,
  encryptedPath,
  recoveryDatabaseUrl,
  encryptionKey,
  appCommit = "unknown",
  runner = run,
  poolFactory = (url) => new Pool({ connectionString: url }),
}) {
  const started = Date.now();
  const manifest = JSON.parse(await fsp.readFile(manifestPath, "utf8"));
  if (!manifest.complete || manifest.uploadStatus === "incomplete")
    throw new Error("Backup manifest is incomplete");
  if ((await sha256(encryptedPath)) !== manifest.sha256)
    throw new Error("Backup checksum mismatch");
  if (!/(_recovery|_restore|localhost|127\.0\.0\.1)/i.test(recoveryDatabaseUrl))
    throw new Error("Recovery database is not clearly isolated");
  const directory = await fsp.mkdtemp(
    path.join(os.tmpdir(), "platform-restore-"),
  );
  const dumpPath = path.join(directory, "restore.dump");
  const evidence = {
    schemaVersion: 1,
    restoreId: crypto.randomUUID(),
    backupId: manifest.backupId,
    backupCreatedAt: manifest.createdAt,
    appCommit,
    startedAt: new Date(started).toISOString(),
    checks: [],
    classification: "local-integration",
  };
  let pool;
  try {
    await decryptFile(
      encryptedPath,
      dumpPath,
      encryptionKey,
      manifest.encryption,
    );
    await runner("pg_restore", [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-acl",
      `--dbname=${recoveryDatabaseUrl}`,
      dumpPath,
    ]);
    pool = poolFactory(recoveryDatabaseUrl);
    const migration = await pool.query(
      "SELECT name,checksum FROM schema_migrations ORDER BY name",
    );
    evidence.checks.push({
      name: "schema_compatibility",
      passed: migration.rowCount > 0,
      count: migration.rowCount,
    });
    for (const table of CRITICAL_TABLES) {
      const result = await pool.query(
        `SELECT COUNT(*)::bigint AS count FROM ${table}`,
      );
      evidence.checks.push({
        name: `row_count:${table}`,
        passed: true,
        count: Number(result.rows[0].count),
      });
    }
    const tenantLeak = await pool.query(
      "SELECT COUNT(*)::bigint AS count FROM projects p LEFT JOIN organizations o ON o.id=p.organization_id WHERE o.id IS NULL",
    );
    evidence.checks.push({
      name: "tenant_relationships",
      passed: tenantLeak.rows[0].count === "0",
    });
    const deploymentLeak = await pool.query(
      "SELECT COUNT(*)::bigint AS count FROM deployment_events e LEFT JOIN deployments d ON d.id=e.deployment_id WHERE d.id IS NULL",
    );
    evidence.checks.push({
      name: "deployment_history",
      passed: deploymentLeak.rows[0].count === "0",
    });
    evidence.actualRecoveryPoint = manifest.createdAt;
    evidence.actualDataLossSeconds = Math.max(
      0,
      (started - Date.parse(manifest.createdAt)) / 1000,
    );
    evidence.status = evidence.checks.every((check) => check.passed)
      ? "passed"
      : "failed";
  } finally {
    if (pool) await pool.end();
    await fsp.rm(directory, { recursive: true, force: true });
    evidence.completedAt = new Date().toISOString();
    evidence.restoreDurationSeconds = (Date.now() - started) / 1000;
  }
  return evidence;
}

if (require.main === module) {
  const key = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY || "", "base64");
  verifyRestore({
    manifestPath: process.argv[2],
    encryptedPath: process.argv[3],
    recoveryDatabaseUrl: process.env.RECOVERY_DATABASE_URL,
    encryptionKey: key,
    appCommit: process.env.APP_COMMIT || "unknown",
  })
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result.status !== "passed") process.exitCode = 1;
    })
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
module.exports = { CRITICAL_TABLES, verifyRestore };
