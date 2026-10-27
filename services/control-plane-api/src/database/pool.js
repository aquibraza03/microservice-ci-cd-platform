const { Pool } = require("pg");
const { bindTransactions } = require('./transaction');

function createPool(config = process.env) {
  if (!config.DATABASE_URL) return null;
  return bindTransactions(new Pool({
    connectionString: config.DATABASE_URL,
    max: Number(config.DB_POOL_MAX || 10),
    application_name: "control-plane-api",
    connectionTimeoutMillis: 5000,
  }));
}

async function checkDatabase(pool) {
  if (!pool) return { configured: false, ok: false };
  await pool.query("SELECT 1");
  return { configured: true, ok: true };
}

module.exports = { createPool, checkDatabase };
