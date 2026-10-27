#!/usr/bin/env node
const fs = require("fs");
const { performance } = require("perf_hooks");
const { validateTarget, safeFetch } = require("./safety");

const SCENARIOS = Object.freeze({
  baseline: { model: "open", rate: 5, duration: 10, path: "/api/v1/health" },
  expected_peak: {
    model: "open",
    rate: 25,
    duration: 60,
    path: "/api/v1/health",
  },
  burst: { model: "open", rate: 100, duration: 15, path: "/api/v1/health" },
  sustained: { model: "open", rate: 20, duration: 300, path: "/api/v1/health" },
  soak: { model: "open", rate: 10, duration: 1800, path: "/api/v1/health" },
  queue_saturation: {
    model: "open",
    rate: 50,
    duration: 120,
    path: "/api/v1/deployments",
  },
  worker_saturation: {
    model: "closed",
    users: 20,
    duration: 120,
    path: "/api/v1/deployments",
  },
  connection_saturation: {
    model: "closed",
    users: 100,
    duration: 120,
    path: "/api/v1/deployments/synthetic/events",
  },
  noisy_neighbour: {
    model: "open",
    rate: 40,
    duration: 120,
    path: "/api/v1/organizations/synthetic/projects",
  },
  recovery: {
    model: "open",
    rate: 50,
    duration: 60,
    path: "/api/v1/health",
    recoverySeconds: 60,
  },
});

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)
  ];
}

async function runLoad(config, scenarioName = "baseline") {
  const scenario = { ...SCENARIOS[scenarioName], ...(config.scenario || {}) };
  const safe = await validateTarget(config);
  if (
    scenario.rate > config.maxRequestRate ||
    (scenario.users || 1) > config.maxVirtualUsers ||
    scenario.duration > config.maxDurationSeconds
  )
    throw new Error("Scenario exceeds approved safety envelope");
  const latencies = [];
  let errors = 0,
    timeouts = 0,
    issued = 0,
    aborted = false;
  const controller = new AbortController();
  const start = performance.now();
  const deadline = start + scenario.duration * 1000;
  const pending = new Set();
  const issue = () => {
    issued++;
    const began = performance.now();
    const promise = safeFetch(scenario.path, safe.target, {
      signal: controller.signal,
      headers: { "x-load-test-id": config.testId, ...(config.headers || {}) },
    })
      .then((response) => {
        if (response.status >= 500) errors++;
        return response.arrayBuffer();
      })
      .catch((error) => {
        errors++;
        if (error.name === "AbortError") timeouts++;
      })
      .finally(() => {
        latencies.push(performance.now() - began);
        pending.delete(promise);
      });
    pending.add(promise);
  };
  if (scenario.model === "open") {
    const interval = 1000 / scenario.rate;
    let next = performance.now();
    while (performance.now() < deadline) {
      if (performance.now() >= next) {
        issue();
        next += interval;
      } else
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(5, next - performance.now())),
        );
      if (issued >= 20 && errors / issued > (config.abortErrorRate || 0.05)) {
        aborted = true;
        break;
      }
    }
  } else {
    const users = Array.from({ length: scenario.users }, async () => {
      while (performance.now() < deadline && !aborted) {
        issue();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    await Promise.all(users);
  }
  if (aborted) controller.abort();
  await Promise.allSettled([...pending]);
  const elapsedSeconds = (performance.now() - start) / 1000;
  return {
    schemaVersion: 1,
    testId: config.testId,
    operator: config.operator,
    environment: config.environment,
    targetOrigin: safe.target.origin,
    environmentFingerprint: safe.fingerprint,
    scenario: scenarioName,
    workloadModel: scenario.model,
    tool: `node/${process.version}`,
    startedAt: new Date(Date.now() - elapsedSeconds * 1000).toISOString(),
    durationSeconds: elapsedSeconds,
    requests: issued,
    throughputRps: issued / elapsedSeconds,
    errorRate: issued ? errors / issued : 0,
    timeoutRate: issued ? timeouts / issued : 0,
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
    },
    aborted,
    configuration: scenario,
  };
}

if (require.main === module) {
  const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  runLoad(config, process.argv[3])
    .then((result) =>
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
    )
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
module.exports = { SCENARIOS, percentile, runLoad };
