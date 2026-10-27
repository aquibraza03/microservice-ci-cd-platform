const crypto = require("crypto");
const { domainToASCII } = require("url");
const { ControlPlaneError } = require("../errors");
const RESERVED = new Set([
    "www",
    "api",
    "admin",
    "root",
    "mail",
    "smtp",
    "status",
    "support",
    "dashboard",
  ]),
  LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function normalizeHostname(value, { allowWildcard = false } = {}) {
  let raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (
    /[/:?#@\s]/.test(raw) ||
    raw.includes("[") ||
    raw.includes("]") ||
    raw.includes("\\")
  )
    throw new ControlPlaneError(
      400,
      "DOMAIN_INVALID",
      "Domain name is invalid",
    );
  if (raw.startsWith("*.")) {
    if (!allowWildcard)
      throw new ControlPlaneError(
        400,
        "WILDCARD_DOMAIN_FORBIDDEN",
        "Wildcard domains are not supported",
      );
    raw = raw.slice(2);
  }
  const ascii = domainToASCII(raw);
  if (
    !ascii ||
    ascii.length > 253 ||
    ascii.includes("..") ||
    ascii.split(".").some((x) => !LABEL.test(x))
  )
    throw new ControlPlaneError(
      400,
      "DOMAIN_INVALID",
      "Domain name is invalid",
    );
  if (RESERVED.has(ascii.split(".")[0]))
    throw new ControlPlaneError(
      400,
      "DOMAIN_RESERVED",
      "Reserved hostnames cannot be claimed",
    );
  return ascii;
}
function safeLabel(value) {
  const cleaned =
    String(value)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 35) || "preview";
  return cleaned;
}
function previewHostname({ organizationId, serviceId, prNumber, baseDomain }) {
  const hash = crypto
      .createHash("sha256")
      .update(`${organizationId}:${serviceId}:${prNumber ?? "manual"}`)
      .digest("hex")
      .slice(0, 10),
    label =
      `${safeLabel(serviceId).slice(0, 24)}-${prNumber ? `pr-${prNumber}` : "manual"}-${hash}`
        .slice(0, 63)
        .replace(/-$/g, "");
  return normalizeHostname(`${label}.${baseDomain}`);
}
function isolationKey(input) {
  return `pv-${crypto
    .createHash("sha256")
    .update(
      `${input.organizationId}:${input.serviceId}:${input.prNumber ?? input.commitSha}`,
    )
    .digest("hex")
    .slice(0, 20)}`;
}
module.exports = { normalizeHostname, previewHostname, isolationKey, RESERVED };
