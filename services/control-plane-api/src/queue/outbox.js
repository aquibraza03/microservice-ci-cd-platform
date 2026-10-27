// At-least-once publication. Network I/O is deliberately outside DB transactions.
// A crash after enqueue leaves the row pending; BullMQ's deployment ID deduplicates it.
async function dispatchDeploymentOutbox(pool, queue, store, limit = 100) {
  const pending = await pool.query('SELECT * FROM deployment_outbox WHERE delivered_at IS NULL ORDER BY created_at,id LIMIT $1', [limit]);
  for (const row of pending.rows) {
    const deployment = await store.getInternal(row.deployment_id, row.organization_id);
    if (['queued', 'rollback_queued'].includes(deployment.currentState)) await queue.enqueue(deployment);
    await pool.query('UPDATE deployment_outbox SET delivered_at=NOW() WHERE id=$1 AND delivered_at IS NULL', [row.id]);
  }
  return pending.rowCount;
}
module.exports = { dispatchDeploymentOutbox };
