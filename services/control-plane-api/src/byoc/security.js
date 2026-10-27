const crypto = require("crypto");
const dns = require("dns").promises;
const net = require("net");
const { ControlPlaneError } = require("../errors");
function encryptionKey(value) {
  let key;
  try {
    key = Buffer.from(String(value || ""), "base64");
  } catch {
    key = Buffer.alloc(0);
  }
  if (key.length !== 32)
    throw new ControlPlaneError(
      500,
      "CREDENTIAL_ENCRYPTION_KEY_INVALID",
      "Credential encryption is unavailable",
    );
  return key;
}
function encryptCredential(value, keyValue) {
  const key = encryptionKey(keyValue),
    iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", key, iv),
    ciphertext = Buffer.concat([
      cipher.update(String(value), "utf8"),
      cipher.final(),
    ]);
  return {
    algorithm: "A256GCM",
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}
function decryptCredential(value, keyValue) {
  const key = encryptionKey(keyValue),
    decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(value.iv, "base64"),
    );
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
function privateAddress(address) {
  if (net.isIPv4(address)) {
    const p = address.split(".").map(Number);
    return (
      p[0] === 10 ||
      p[0] === 127 ||
      p[0] === 0 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      p[0] >= 224
    );
  }
  const a = address.toLowerCase();
  return (
    a === "::1" ||
    a === "::" ||
    a.startsWith("fc") ||
    a.startsWith("fd") ||
    a.startsWith("fe8") ||
    a.startsWith("fe9") ||
    a.startsWith("fea") ||
    a.startsWith("feb") ||
    a.startsWith("::ffff:127.")
  );
}
async function validateApiServerOrigin(
  value,
  { production = true, allowPrivateNetworks = false, lookup = dns.lookup } = {},
) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ControlPlaneError(
      400,
      "KUBERNETES_API_ORIGIN_INVALID",
      "Kubernetes API server origin is invalid",
    );
  }
  if (
    (production && url.protocol !== "https:") ||
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname && url.pathname !== "/")
  )
    throw new ControlPlaneError(
      400,
      "KUBERNETES_API_ORIGIN_INVALID",
      "Kubernetes API server origin is not permitted",
    );
  if (
    !url.hostname ||
    ["localhost", "metadata.google.internal"].includes(
      url.hostname.toLowerCase(),
    )
  )
    throw new ControlPlaneError(
      400,
      "KUBERNETES_API_SSRF_BLOCKED",
      "Kubernetes API server address is not permitted",
    );
  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  if (port < 1 || port > 65535 || (production && ![443, 6443].includes(port)))
    throw new ControlPlaneError(
      400,
      "KUBERNETES_API_PORT_BLOCKED",
      "Kubernetes API server port is not permitted",
    );
  let records;
  try {
    records = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new ControlPlaneError(
      422,
      "KUBERNETES_API_DNS_FAILED",
      "Kubernetes API server DNS resolution failed",
    );
  }
  if (
    !records.length ||
    (!allowPrivateNetworks && records.some((x) => privateAddress(x.address)))
  )
    throw new ControlPlaneError(
      400,
      "KUBERNETES_API_SSRF_BLOCKED",
      "Kubernetes API server resolved to a prohibited address",
    );
  return {
    origin: `${url.protocol}//${url.host}`,
    addresses: records.map((x) => x.address),
  };
}
module.exports = {
  encryptCredential,
  decryptCredential,
  validateApiServerOrigin,
  privateAddress,
};
