const { ControlPlaneError } = require("../errors");

const DEFAULT_POLICY = Object.freeze({
  enabledEnvironments: ["development", "staging", "production", "preview"],
  approvalRequiredEnvironments: ["production"],
  databaseCompatibilityMode: "warn",
  lockTimeoutSeconds: 900,
});

function migrations(snapshot) {
  const value = snapshot?.database?.migrations;
  return Array.isArray(value) ? value.map(String).sort() : [];
}

function compatibility(current, target, policy = DEFAULT_POLICY) {
  const currentMigrations = migrations(current.configurationSnapshot),
    targetMigrations = migrations(target.configurationSnapshot),
    removed = currentMigrations.filter((x) => !targetMigrations.includes(x)),
    explicitlyCompatible =
      current.configurationSnapshot?.database?.backwardCompatible === true ||
      current.configurationSnapshot?.database?.backwardCompatibleTargets?.includes(
        target.commitSha,
      ),
    proven = removed.length === 0 || Boolean(explicitlyCompatible),
    mode = policy.databaseCompatibilityMode || "warn";
  return {
    currentMigrations,
    targetMigrations,
    removedByRollback: removed,
    proven,
    mode,
    blocked: mode === "block" && !proven,
    warning: proven
      ? null
      : "Database backward compatibility is not proven; migrations will not be reversed.",
  };
}

function assertDigest(digest) {
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest || ""))
    throw new ControlPlaneError(
      409,
      "ROLLBACK_DIGEST_MISSING",
      "Rollback target has no immutable image digest",
    );
}

function diffObjects(current = {}, target = {}, prefix = "") {
  const out = [],
    keys = new Set([
      ...Object.keys(current || {}),
      ...Object.keys(target || {}),
    ]);
  for (const key of [...keys].sort()) {
    const path = prefix ? `${prefix}.${key}` : key,
      a = current?.[key],
      b = target?.[key];
    if (key.toLowerCase().includes("secret")) {
      const names = (v) =>
        Array.isArray(v)
          ? v.map((x) => String(x?.name || x)).sort()
          : Object.keys(v || {}).sort();
      if (JSON.stringify(names(a)) !== JSON.stringify(names(b)))
        out.push({ path, current: names(a), target: names(b), redacted: true });
    } else if (
      a &&
      b &&
      typeof a === "object" &&
      typeof b === "object" &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    )
      out.push(...diffObjects(a, b, path));
    else if (JSON.stringify(a) !== JSON.stringify(b))
      out.push({
        path,
        current: a ?? null,
        target: b ?? null,
        redacted: false,
      });
  }
  return out;
}

module.exports = { DEFAULT_POLICY, compatibility, assertDigest, diffObjects };
