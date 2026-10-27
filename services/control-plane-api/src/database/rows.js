// Only top-level SQL column names are converted; JSON payload keys are preserved.
function row(value) {
  if (!value) return null;
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [
    key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
    v instanceof Date ? v.toISOString() :
      /^(version|.*_version)$/.test(key) && v !== null ? Number(v) : v,
  ]));
}
module.exports = { row };
