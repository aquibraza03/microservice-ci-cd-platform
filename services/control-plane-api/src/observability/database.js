function instrumentPool(pool, metrics) {
  if (!pool || pool.observabilityInstrumented) return pool;
  const originalQuery = pool.query.bind(pool);
  pool.query = async (...args) => {
    const text =
      typeof args[0] === "string" ? args[0] : args[0]?.text || "unknown";
    const operation =
      String(text)
        .trim()
        .split(/\s+/, 1)[0]
        .toLowerCase()
        .replace(/[^a-z]/g, "") || "unknown";
    const started = process.hrtime.bigint();
    let result = "success";
    try {
      return await originalQuery(...args);
    } catch (error) {
      result = "failure";
      throw error;
    } finally {
      metrics.observe(
        "database_operation_duration_seconds",
        { operation, result },
        Number(process.hrtime.bigint() - started) / 1e9,
      );
      metrics.set(
        "database_pool_connections",
        { state: "total" },
        pool.totalCount || 0,
      );
      metrics.set(
        "database_pool_connections",
        { state: "idle" },
        pool.idleCount || 0,
      );
      metrics.set(
        "database_pool_connections",
        { state: "waiting" },
        pool.waitingCount || 0,
      );
    }
  };
  pool.observabilityInstrumented = true;
  return pool;
}
module.exports = { instrumentPool };
