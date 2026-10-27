const fs = require("fs");
const fsp = fs.promises;
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { expect } = require("chai");
const {
  validateTarget,
  safeFetch,
} = require("../../scripts/reliability/safety");
const { generateDataset } = require("../../scripts/reliability/dataset");
const {
  EXPERIMENTS,
  authorizeExperiment,
  runExperiment,
} = require("../../scripts/reliability/failure-harness");
const {
  createBackup,
  decryptFile,
} = require("../../scripts/reliability/backup");
const { CRITICAL_TABLES } = require("../../scripts/reliability/restore-verify");

const base = {
  testId: "test-1",
  operator: "operator@example.invalid",
  environment: "local",
  targetOrigin: "http://127.0.0.1:3001",
  allowedOrigins: ["http://127.0.0.1:3001"],
  maxDurationSeconds: 120,
  maxRequestRate: 50,
  maxVirtualUsers: 20,
  customerOwnedTarget: false,
  productionCredentials: false,
};
const resolver = async () => [{ address: "127.0.0.1", family: 4 }];

describe("Phase 4 Part 2 reliability safety", () => {
  it("rejects production, customer targets, credentials and unrecognized origins", async () => {
    for (const input of [
      { environment: "production" },
      { customerOwnedTarget: true },
      { productionCredentials: true },
      { targetOrigin: "http://other.invalid" },
    ]) {
      try {
        await validateTarget({ ...base, ...input }, { resolver });
        expect.fail("expected rejection");
      } catch (error) {
        expect(error.message).to.match(/refused|allowlisted/);
      }
    }
  });
  it("fingerprints the environment deterministically", async () => {
    const first = await validateTarget(base, { resolver });
    const second = await validateTarget(base, { resolver });
    expect(first.fingerprint).to.equal(second.fingerprint).and.have.length(64);
  });
  it("prevents redirect and direct origin escape", async () => {
    const original = global.fetch;
    global.fetch = async () => ({
      status: 302,
      headers: { get: () => "https://evil.invalid/path" },
    });
    try {
      await safeFetch("/ok", new URL(base.targetOrigin));
      expect.fail("redirect accepted");
    } catch (error) {
      expect(error.message).to.include("Redirect escaped");
    }
    try {
      await safeFetch("https://evil.invalid", new URL(base.targetOrigin));
      expect.fail("escape accepted");
    } catch (error) {
      expect(error.message).to.include("escaped");
    }
    global.fetch = original;
  });
  it("generates deterministic materially described datasets", () => {
    const first = generateDataset({
      seed: "same",
      organizations: 2,
      projectsPerOrganization: 3,
      deploymentsPerProject: 4,
      auditsPerOrganization: 5,
      users: 6,
    });
    expect(first).to.deep.equal(
      generateDataset({
        seed: "same",
        organizations: 2,
        projectsPerOrganization: 3,
        deploymentsPerProject: 4,
        auditsPerOrganization: 5,
        users: 6,
      }),
    );
    expect(first.summary).to.include({
      organizations: 2,
      projects: 6,
      deployments: 24,
      auditEvents: 10,
      users: 6,
    });
  });
  it("requires an armed kill switch and confirmation for staging", async () => {
    const directory = await fsp.mkdtemp(
      path.join(os.tmpdir(), "failure-safe-"),
    );
    const killSwitchPath = path.join(directory, "armed");
    await fsp.writeFile(killSwitchPath, "armed");
    const config = { ...base, killSwitchPath };
    expect(
      (await authorizeExperiment(config, "telemetry_outage", { resolver }))
        .target.fingerprint,
    ).to.have.length(64);
    try {
      await authorizeExperiment(
        { ...config, environment: "staging" },
        "telemetry_outage",
        { resolver },
      );
      expect.fail("confirmation accepted");
    } catch (error) {
      expect(error.message).to.include("confirmation");
    }
    await fsp.rm(directory, { recursive: true, force: true });
  });
  it("always cleans up failure experiments", async () => {
    const directory = await fsp.mkdtemp(
      path.join(os.tmpdir(), "failure-cleanup-"),
    );
    const killSwitchPath = path.join(directory, "armed");
    await fsp.writeFile(killSwitchPath, "armed");
    let cleaned = false;
    const result = await runExperiment(
      { ...base, killSwitchPath },
      "redis_interruption",
      {
        inject: async () => {
          throw new Error("synthetic interruption");
        },
        verifyRecovery: async () => ({ passed: false }),
        cleanup: async () => {
          cleaned = true;
        },
      },
      { resolver },
    );
    expect(result.status).to.equal("safety_abort");
    expect(cleaned).to.equal(true);
    await fsp.rm(directory, { recursive: true, force: true });
  });
  it("defines all required controlled failures without public endpoints", () => {
    expect(Object.keys(EXPERIMENTS)).to.include.members([
      "worker_termination",
      "postgres_interruption",
      "redis_interruption",
      "duplicate_queue_delivery",
      "out_of_order_events",
      "credential_revocation",
      "telemetry_outage",
      "backup_interruption",
    ]);
  });
});

describe("Phase 4 Part 2 backup contracts", () => {
  it("encrypts complete backups and decrypts only with the authorized key", async () => {
    const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "backup-test-"));
    const key = crypto.randomBytes(32);
    const result = await createBackup({
      databaseUrl: "postgres://synthetic.invalid/test",
      outputDirectory: directory,
      encryptionKey: key,
      backupId: "backup-1",
      dump: async (_command, args) => {
        const file = args.find((x) => x.startsWith("--file=")).slice(7);
        await fsp.writeFile(file, "synthetic-postgres-custom-dump");
      },
    });
    expect(result.manifest.complete).to.equal(true);
    expect(result.manifest.encryption.algorithm).to.equal("AES-256-GCM");
    const restored = path.join(directory, "restored.dump");
    await decryptFile(
      result.encryptedPath,
      restored,
      key,
      result.manifest.encryption,
    );
    expect(await fsp.readFile(restored, "utf8")).to.equal(
      "synthetic-postgres-custom-dump",
    );
    expect(JSON.stringify(result.manifest)).not.to.include(
      key.toString("base64"),
    );
    await fsp.rm(directory, { recursive: true, force: true });
  });
  it("does not publish a success manifest for interrupted backups", async () => {
    const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "backup-fail-"));
    try {
      await createBackup({
        databaseUrl: "postgres://synthetic.invalid/test",
        outputDirectory: directory,
        encryptionKey: crypto.randomBytes(32),
        backupId: "interrupted",
        dump: async () => {
          throw new Error("interrupted");
        },
      });
      expect.fail("backup passed");
    } catch (error) {
      expect(error.message).to.equal("interrupted");
    }
    expect(
      (await fsp.readdir(directory)).some((name) => name.includes("manifest")),
    ).to.equal(false);
    await fsp.rm(directory, { recursive: true, force: true });
  });
  it("covers critical restore verification tables", () => {
    expect(CRITICAL_TABLES).to.include.members([
      "organizations",
      "organization_members",
      "deployments",
      "enterprise_audit_events",
      "audit_chain_heads",
    ]);
  });
});
