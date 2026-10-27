const PATTERNS = [
  /(authorization\s*[:=]\s*(?:bearer|basic)\s+)[^\s]+/gi,
  /(https?:\/\/)[^\s:@/]+:[^\s@/]+@/g,
  /\b(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+)\b/g,
  /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
  /\b(AWS_SECRET_ACCESS_KEY|TOKEN|PASSWORD|SECRET|API_KEY|PRIVATE_KEY|CLIENT_SECRET|KUBECONFIG)\s*[:=]\s*(?:["']?)[^\s,"'}]+/gi,
  /(?:postgres(?:ql)?|redis):\/\/[^\s]+/gi,
];
function variants(secret) {
  const raw = String(secret);
  return new Set(
    [raw, raw.replace(/\r?\n/g, ""), raw.replace(/\s+/g, "")].filter(
      (x) => x.length >= 8,
    ),
  );
}
function redact(value, secrets = []) {
  let text = String(value);
  for (const secret of secrets.filter((s) => typeof s === "string"))
    for (const candidate of variants(secret))
      text = text.split(candidate).join("[REDACTED]");
  for (const pattern of PATTERNS)
    text = text.replace(pattern, (match, prefix) =>
      prefix ? `${prefix}[REDACTED]` : "[REDACTED]",
    );
  return text;
}
function redactValue(value, secrets = []) {
  if (typeof value === "string") return redact(value, secrets);
  if (Array.isArray(value)) return value.map((x) => redactValue(x, secrets));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) =>
        /authorization|token|password|secret|credential|private.?key|api.?key|database.?url|redis.?url|kubeconfig/i.test(
          key,
        )
          ? [key, "[REDACTED]"]
          : [key, redactValue(item, secrets)],
      ),
    );
  return value;
}
module.exports = { redact, redactValue };
