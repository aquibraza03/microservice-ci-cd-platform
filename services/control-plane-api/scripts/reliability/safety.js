const dns = require("dns").promises;
const net = require("net");
const crypto = require("crypto");

const PRIVATE = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
];

function isSafeLocalAddress(address) {
  if (net.isIPv6(address))
    return (
      address === "::1" || address.startsWith("fd") || address.startsWith("fc")
    );
  return PRIVATE.some((pattern) => pattern.test(address));
}

async function validateTarget(config, { resolver = dns.lookup } = {}) {
  if (!config.testId || !config.operator)
    throw new Error("Test ID and operator are required");
  if (!new Set(["local", "staging"]).has(config.environment))
    throw new Error("Production and unknown environments are refused");
  if (config.customerOwnedTarget)
    throw new Error("Customer-owned targets are refused");
  if (config.productionCredentials)
    throw new Error("Production credentials are refused");
  if (!(config.maxDurationSeconds > 0 && config.maxDurationSeconds <= 3600))
    throw new Error("Maximum duration must be between 1 and 3600 seconds");
  if (!(config.maxRequestRate > 0 && config.maxRequestRate <= 500))
    throw new Error("Maximum request rate must be between 1 and 500");
  if (!(config.maxVirtualUsers > 0 && config.maxVirtualUsers <= 200))
    throw new Error("Maximum virtual users must be between 1 and 200");
  const target = new URL(config.targetOrigin);
  if (
    !new Set(["http:", "https:"]).has(target.protocol) ||
    target.username ||
    target.password
  )
    throw new Error("Target origin is invalid");
  if (target.pathname !== "/" || target.search || target.hash)
    throw new Error("Target must be an origin without path, query or fragment");
  const allowlist = new Set(config.allowedOrigins || []);
  if (!allowlist.has(target.origin))
    throw new Error("Target origin is not allowlisted");
  const records = await resolver(target.hostname, { all: true });
  if (!records.length) throw new Error("Target did not resolve");
  if (
    config.environment === "local" &&
    records.some((record) => !isSafeLocalAddress(record.address))
  )
    throw new Error(
      "Local test target resolved outside local/private address space",
    );
  return {
    target,
    addresses: records.map((record) => record.address).sort(),
    fingerprint: crypto
      .createHash("sha256")
      .update(
        `${config.environment}|${target.origin}|${records
          .map((x) => x.address)
          .sort()
          .join(",")}`,
      )
      .digest("hex"),
  };
}

async function safeFetch(url, target, options = {}) {
  const requested = new URL(url, target.origin);
  if (requested.origin !== target.origin)
    throw new Error("Request escaped approved origin");
  const response = await fetch(requested, { ...options, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    const next = new URL(response.headers.get("location"), requested);
    if (next.origin !== target.origin)
      throw new Error("Redirect escaped approved origin");
  }
  return response;
}

module.exports = { isSafeLocalAddress, safeFetch, validateTarget };
