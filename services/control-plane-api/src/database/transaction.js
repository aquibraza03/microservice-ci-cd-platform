const { AsyncLocalStorage } = require('node:async_hooks');
const transactions = new AsyncLocalStorage();
const originals = new WeakMap();

// Queries on a bound pool join only this async operation's transaction.
// Other requests and other pools retain independent connections.
function bindTransactions(pool) {
  if (!pool || originals.has(pool)) return pool;
  const query = pool.query.bind(pool);
  originals.set(pool, query);
  pool.query = (...args) => {
    const active = transactions.getStore();
    return active?.pool === pool ? active.client.query(...args) : query(...args);
  };
  return pool;
}
async function withTransaction(pool, work) {
  if (!pool) throw new Error("Database pool is not configured");
  const active = transactions.getStore();
  if (active?.pool === pool) return work(active.client);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await transactions.run({ pool, client }, () => work(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
module.exports = { withTransaction, bindTransactions };
