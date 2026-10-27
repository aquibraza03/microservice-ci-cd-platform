// All destructive legacy database tests run only inside this newly created database.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { Pool } = require('pg');
const { migrate } = require('../src/database/migrate');

async function main() {
  if (!process.env.DATABASE_URL && fs.existsSync('.env')) process.loadEnvFile('.env');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const source = new URL(process.env.DATABASE_URL);
  const adminUrl = new URL(source); adminUrl.pathname = '/postgres';
  const database = `cp_part1_test_${process.pid}_${Date.now()}`;
  if (!/^cp_part1_test_\d+_\d+$/.test(database)) throw new Error('Invalid disposable database name');
  const admin = new Pool({ connectionString: adminUrl.toString() });
  admin.on('error', error => console.error('Admin connection error:', error.code));
  let created = false, pool;
  try {
    await admin.query(`CREATE DATABASE ${database}`); created = true;
    console.log(JSON.stringify({ environment: 'disposable-test', host: source.hostname, port: source.port, database }));
    const target = new URL(source); target.pathname = `/${database}`;
    pool = new Pool({ connectionString: target.toString() });
    pool.on('error', error => console.error('Test connection error:', error.code));
    try { await migrate(pool); await migrate(pool); }
    catch (error) { console.error('Migration error:', error.code, error.message); throw error; }
    await pool.end(); pool = null;
    const tests = process.argv.slice(2);
    const result = spawnSync(process.execPath, [path.join(__dirname, '../node_modules/mocha/bin/mocha.js'), ...(tests.length ? tests : ['test/integration/durable-stores.real.test.js']), '--timeout', '20000', '--reporter', 'spec'], {
      stdio: 'inherit', env: { ...process.env, DATABASE_URL: target.toString(), POSTGRES_ADMIN_URL: adminUrl.toString(), DURABILITY_DISPOSABLE_DATABASE: database },
    });
    if (result.error) throw result.error;
    process.exitCode = result.status === null ? 1 : result.status;
  } finally {
    if (pool) await pool.end();
    if (created) {
      // Only this run's database is eligible for cleanup. Never target the source URL.
      await admin.query(`DROP DATABASE ${database} WITH (FORCE)`);
    }
    await admin.end();
  }
}
main().catch(error => { console.error('Durability test runner failed:', error.code || error.name); process.exitCode = 1; });
