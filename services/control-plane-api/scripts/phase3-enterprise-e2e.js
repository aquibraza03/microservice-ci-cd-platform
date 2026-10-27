#!/usr/bin/env node
const { spawnSync } = require("child_process");

const checks = [
  ["enterprise-security", "npm", ["run", "test:security"]],
  ["byoc", "npm", ["run", "test:byoc"]],
  ["deployments", "npm", ["run", "test:deployments"]],
  ["previews", "npm", ["run", "test:previews"]],
  ["migration-contract", "npm", ["run", "test:migration:contract"]],
];
const results = [];
for (const [name, command, args] of checks) {
  const run = spawnSync(command, args, { stdio: "inherit", shell: false });
  results.push({ name, classification: "integration-tests-with-mocks", passed: run.status === 0 });
  if (run.status !== 0) break;
}
const output = { generatedAt: new Date().toISOString(), liveInfrastructure: false, results };
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (results.some((result) => !result.passed)) process.exitCode = 1;
