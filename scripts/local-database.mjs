import { existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

export function assertLocalDatabase() {
  const expected = `postgresql://geniusx1:${process.env.POSTGRES_PASSWORD}@127.0.0.1:${process.env.POSTGRES_PORT || '55432'}/geniusx1`;
  if (process.env.NODE_ENV === 'production' || !process.env.POSTGRES_PASSWORD || process.env.DATABASE_URL !== expected) {
    throw new Error('Automatic database setup is restricted to the generated local development database.');
  }
}

export async function startLocalDatabase() {
  assertLocalDatabase();
  const probe = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1500 });
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    return null;
  } catch (error) {
    if (!['ECONNREFUSED', '3D000'].includes(error.code)) throw error;
  } finally {
    await probe.end();
  }

  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const databaseDir = path.resolve('.local/postgres');
  const database = new EmbeddedPostgres({
    databaseDir,
    user: 'geniusx1',
    password: process.env.POSTGRES_PASSWORD,
    port: Number(process.env.POSTGRES_PORT || 55432),
    persistent: true,
    authMethod: 'scram-sha-256',
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-h', '127.0.0.1'],
    onLog: () => {},
    onError: (message) => console.error(String(message)),
  });
  if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) await database.initialise();
  await database.start();
  const client = database.getPgClient();
  try {
    await client.connect();
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = 'geniusx1'");
    if (!result.rowCount) await database.createDatabase('geniusx1');
  } catch (error) {
    await database.stop();
    throw error;
  } finally {
    await client.end();
  }
  console.log('Local PostgreSQL is running; data is kept in .local/postgres.');
  return database;
}
