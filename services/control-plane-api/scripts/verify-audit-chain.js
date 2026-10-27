#!/usr/bin/env node
const fs = require("fs");
const crypto = require("crypto");
const { canonical } = require("../src/audit/schema");

const ZERO = "0".repeat(64);
const file = process.argv[2];
const key = process.env.AUDIT_INTEGRITY_KEY_V1;

if (!file || !key) {
  console.error(
    "usage: AUDIT_INTEGRITY_KEY_V1=<base64> verify-audit-chain.js <audit.jsonl>",
  );
  process.exit(2);
}

const rows = fs
  .readFileSync(file, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const failures = [];
let previous = process.env.AUDIT_CHECKPOINT_HASH || ZERO;
let priorSequence = Number(process.env.AUDIT_CHECKPOINT_SEQUENCE || 0);

for (const event of rows) {
  const { integrity, ...base } = event;
  if (!integrity || integrity.previousHash !== previous)
    failures.push({
      sequence: event.sequence,
      code: "CHAIN_CONTINUITY_BROKEN",
    });
  if (event.sequence !== priorSequence + 1)
    failures.push({
      sequence: event.sequence,
      code: "SEQUENCE_GAP_OR_REORDER",
    });
  const expected = crypto
    .createHmac("sha256", Buffer.from(key, "base64"))
    .update(`${integrity?.previousHash || ""}\n${canonical(base)}`)
    .digest("hex");
  if (expected !== integrity?.hash)
    failures.push({ sequence: event.sequence, code: "EVENT_HASH_MISMATCH" });
  previous = integrity?.hash;
  priorSequence = event.sequence;
}

const result = {
  valid: failures.length === 0,
  checkedEvents: rows.length,
  checkpointSequence: priorSequence,
  checkpointHash: previous,
  failures,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failures.length) process.exitCode = 1;
