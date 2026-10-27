#!/usr/bin/env node
const fs = require("fs");
const crypto = require("crypto");
const { validateTarget } = require("./safety");

const EXPERIMENTS = Object.freeze({
  api_restart: {
    blastRadius: "one test API instance",
    duration: 30,
    destructive: false,
  },
  worker_termination: {
    blastRadius: "one test worker",
    duration: 60,
    destructive: false,
  },
  queue_consumer_restart: {
    blastRadius: "one test consumer",
    duration: 60,
    destructive: false,
  },
  redis_interruption: {
    blastRadius: "test Redis network only",
    duration: 30,
    destructive: false,
  },
  postgres_interruption: {
    blastRadius: "test DB network only",
    duration: 30,
    destructive: false,
  },
  git_timeout: {
    blastRadius: "provider stub",
    duration: 20,
    destructive: false,
  },
  git_rate_limit: {
    blastRadius: "provider stub",
    duration: 20,
    destructive: false,
  },
  registry_timeout: {
    blastRadius: "provider stub",
    duration: 20,
    destructive: false,
  },
  kubernetes_timeout: {
    blastRadius: "provider stub",
    duration: 20,
    destructive: false,
  },
  build_timeout: {
    blastRadius: "one synthetic build",
    duration: 60,
    destructive: false,
  },
  dns_failure: {
    blastRadius: "provider stub",
    duration: 20,
    destructive: false,
  },
  certificate_failure: {
    blastRadius: "provider stub",
    duration: 20,
    destructive: false,
  },
  secret_failure: {
    blastRadius: "provider stub",
    duration: 20,
    destructive: false,
  },
  duplicate_webhook: {
    blastRadius: "one synthetic delivery",
    duration: 10,
    destructive: false,
  },
  duplicate_queue_delivery: {
    blastRadius: "one synthetic job",
    duration: 10,
    destructive: false,
  },
  out_of_order_events: {
    blastRadius: "one synthetic deployment",
    duration: 10,
    destructive: false,
  },
  credential_revocation: {
    blastRadius: "one synthetic credential",
    duration: 20,
    destructive: false,
  },
  kubernetes_pod_loss: {
    blastRadius: "one owned test pod",
    duration: 60,
    destructive: true,
  },
  network_latency: {
    blastRadius: "one test process",
    duration: 60,
    destructive: false,
  },
  telemetry_outage: {
    blastRadius: "test collector",
    duration: 60,
    destructive: false,
  },
  backup_interruption: {
    blastRadius: "one synthetic backup",
    duration: 20,
    destructive: false,
  },
});

async function authorizeExperiment(config, name, dependencies = {}) {
  const experiment = EXPERIMENTS[name];
  if (!experiment) throw new Error("Unknown failure experiment");
  const target = await validateTarget(config, dependencies);
  if (experiment.destructive && config.environment !== "local")
    throw new Error("Destructive experiments are local-only");
  if (
    config.environment === "staging" &&
    config.confirmation !== `CONFIRM:${config.testId}:${name}`
  )
    throw new Error("Staging operator confirmation is required");
  if (!config.killSwitchPath || !fs.existsSync(config.killSwitchPath))
    throw new Error("Kill switch is not armed");
  if (experiment.duration > config.maxDurationSeconds)
    throw new Error("Experiment exceeds duration limit");
  return {
    experiment,
    target,
    evidenceId: crypto.randomUUID(),
    authorizedAt: new Date().toISOString(),
  };
}

async function runExperiment(config, name, adapter, dependencies = {}) {
  const authorization = await authorizeExperiment(config, name, dependencies);
  const evidence = {
    schemaVersion: 1,
    testId: config.testId,
    operator: config.operator,
    name,
    environmentFingerprint: authorization.target.fingerprint,
    blastRadius: authorization.experiment.blastRadius,
    startedAt: new Date().toISOString(),
    status: "running",
    checks: [],
  };
  try {
    if (!fs.existsSync(config.killSwitchPath))
      throw new Error("Kill switch disarmed");
    await adapter.inject({
      durationSeconds: authorization.experiment.duration,
      evidence,
    });
    evidence.checks.push(await adapter.verifyRecovery());
    evidence.status = evidence.checks.every((x) => x.passed)
      ? "recovered"
      : "failed";
  } catch (error) {
    evidence.status = "safety_abort";
    evidence.safeError = String(
      error.code || error.message || "experiment failed",
    ).slice(0, 120);
  } finally {
    await adapter.cleanup();
    evidence.completedAt = new Date().toISOString();
  }
  return evidence;
}

module.exports = { EXPERIMENTS, authorizeExperiment, runExperiment };
