import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { assertLocalDatabase, startLocalDatabase } from './local-database.mjs';

assertLocalDatabase();
let database;
if (process.env.LOCAL_DATABASE_DRIVER === 'native') database = await startLocalDatabase();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const name = `geniusx1_test_${randomBytes(8).toString('hex')}`;
const url = new URL(process.env.DATABASE_URL);
url.pathname = `/${name}`;
const env = {
  ...process.env,
  DATABASE_URL: url.href,
  NEON_DATABASE_URL: '',
  NODE_ENV: 'test',
  OPENAI_API_KEY: 'mocked-test-key',
  ENABLE_STARTUP_AI_JOBS: 'false',
};
let created = false;
let exitCode = 1;
try {
  await pool.query(`CREATE DATABASE "${name}"`);
  created = true;
  const schema = spawnSync(process.execPath, ['node_modules/drizzle-kit/bin.cjs', 'push'], {
    env, stdio: 'inherit', windowsHide: true,
  });
  if (schema.error || schema.status !== 0) throw new Error('Could not prepare the isolated test database.');
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2)], {
    env, stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw result.error;
  exitCode = result.status ?? 1;
} finally {
  if (created) await pool.query(`DROP DATABASE "${name}" WITH (FORCE)`);
  await pool.end();
  if (database) await database.stop();
}
process.exitCode = exitCode;
