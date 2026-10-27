const { createPool } = require('../../src/database/pool');
const { migrate } = require('../../src/database/migrate');
const { withTransaction } = require('../../src/database/transaction');
const { graph } = require('./phase3-fixtures');
const { PostgresUsageLedger, PostgresQuotaManager, PostgresEntitlementService } = require('../../src/billing/postgres');
const { PostgresPreviewStore } = require('../../src/previews/postgres-store');
const pool = createPool(process.env);
pool.on('error', () => {});
const queries = [];
const waits = new Map();
process.on('message', m => { if (m.release) { waits.get(m.release)?.(); waits.delete(m.release); } });
const pause = key => new Promise(resolve => { waits.set(key, resolve); process.send({ barrier: key, pid: process.pid }); });
const instrument = client => {
  if (client.phase3Instrumented) return client;
  client.phase3Instrumented = true;
  const original = client.query.bind(client);
  client.query = async (sql, values) => {
    const text = typeof sql === 'string' ? sql : sql.text;
    const record = { sql: text, migration: Array.isArray(values) && /schema_migrations/.test(text) ? values[0] : undefined, startedAt: new Date().toISOString() };
    queries.push(record);
    try {
      if (process.env.PHASE3_PAUSE_MIGRATION && /^INSERT INTO schema_migrations/.test(text) && String(values?.[0]).startsWith(process.env.PHASE3_PAUSE_MIGRATION)) await pause('ddl-locks');
      const result = await original(sql, values);
      record.rows = result.rowCount; record.status = 'PASS';
      if (client === pool && process.env.PHASE3_BASELINE_BARRIER === '1' && /^SELECT checksum FROM schema_migrations/.test(text) && String(values?.[0]).startsWith('001') && !result.rowCount) await pause('unapplied-001');
      return result;
    } catch (error) { record.status = 'FAIL'; record.code = error.code; throw error; }
    finally { record.endedAt = new Date().toISOString(); record.durationMs = Date.parse(record.endedAt) - Date.parse(record.startedAt); }
  };
  return client;
};
if (process.env.PHASE3_ACTION === 'migrate') {
  instrument(pool);
  const connect = pool.connect.bind(pool);
  // Preserve pg's callback API used internally by pool.query as well as promises.
  pool.connect = callback => callback ? connect(callback) : connect().then(instrument);
}
process.send({ ready: true, pid: process.pid });
process.once('message', async input => {
  if (input.release) return;
  const start = Date.now(); let result, error, backendPid;
  try {
    const identity = (await pool.query("SELECT current_database() AS database,current_setting('phase3.run_id') AS marker,pg_backend_pid() AS pid")).rows[0];
    if (identity.marker !== process.env.PHASE3_RUN_ID || identity.database !== process.env.PHASE3_DATABASE) throw Error('Disposable database identity mismatch');
    backendPid = identity.pid;
    if (input.action === 'migrate') { await migrate(pool); result = { migrated: true }; }
    else {
      const s = graph(pool, process.env.PHASE3_AUDIT_KEY, process.env.PHASE3_ENCRYPTION_KEY);
      s.quota = new PostgresQuotaManager(pool, { auditService: s.audit });
      s.usage = new PostgresUsageLedger(pool, { auditService: s.audit });
      s.plans = new PostgresEntitlementService(pool, { auditService: s.audit });
      if (input.action === 'quota') result = await withTransaction(pool, async () => {
        const reservation = await s.quota.reserve(input.reservation);
        const consumed = await s.quota.consume(reservation.reservationId, input.reservation.organizationId);
        const usage = await s.usage.append(input.usage);
        if (input.injectFailure) throw Object.assign(Error('controlled rollback'), { code: 'PHASE3_INJECTED' });
        return { reservationId: reservation.reservationId, consumed: consumed.consumed, eventId: usage.event.eventId, duplicate: usage.duplicate };
      });
      if (input.action === 'usage') result = await s.usage.append(input.usage);
      if (input.action === 'decide') result = await s.approvals.decide(input.actor, input.org, input.id, input.decision);
      if (input.action === 'preview') result = await new PostgresPreviewStore(s.repo).create(input.actor, input.org, input.input, input.key);
      if (input.action === 'audit') result = await s.audit.append(input.event);
    }
  } catch (e) { error = { code: e.code || e.name, message: e.message }; }
  finally {
    await pool.end();
    process.send({ finished: true, pid: process.pid, backendPid, startedAt: new Date(start).toISOString(), endedAt: new Date().toISOString(), durationMs: Date.now() - start, result, error, queries }, () => process.disconnect());
    process.exitCode = error ? 1 : 0;
  }
});
