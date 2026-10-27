async function workerReady({ pool, queue, worker }) {
  try {
    if (!worker.isRunning() || worker.closing) return false;
    await pool.query('SELECT 1');
    await queue.depth();
    return true;
  } catch {
    return false;
  }
}
module.exports = { workerReady };
