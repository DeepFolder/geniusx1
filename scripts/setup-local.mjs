import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcrypt from 'bcrypt';
import { assertLocalDatabase, startLocalDatabase } from './local-database.mjs';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
if (Number(process.versions.node.split('.')[0]) !== 24) {
  throw new Error('Install Node.js 24 before running setup.');
}
if (process.env.NODE_ENV === 'production') {
  throw new Error('This command is only for a local development database.');
}

const randomSecret = () => randomBytes(32).toString('hex');
if (!existsSync('.env')) {
  const password = randomSecret();
  const values = {
    DATABASE_URL: `postgresql://geniusx1:${password}@127.0.0.1:55432/geniusx1`,
    SESSION_SECRET: randomSecret(),
    JWT_SECRET: randomSecret(),
    POSTGRES_PASSWORD: password,
    POSTGRES_PORT: '55432',
    HOST: '127.0.0.1',
    ENABLE_STARTUP_AI_JOBS: 'false',
    LOCAL_DATABASE_DRIVER: process.argv.includes('--docker') ? 'docker' : 'native',
  };
  let env = readFileSync('.env.example', 'utf8');
  for (const [key, value] of Object.entries(values)) {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    env = pattern.test(env) ? env.replace(pattern, `${key}=${value}`) : `${env}\n${key}=${value}\n`;
  }
  writeFileSync('.env', env, { flag: 'wx', mode: 0o600 });
  console.log('Created .env with unique local database and signing secrets.');
}
loadEnvFile('.env');
process.env.NODE_ENV = 'development';

// Never redirect an existing checkout's custom/remote database into Docker or seed it.
assertLocalDatabase();
if (!process.env.LOCAL_DATABASE_DRIVER) {
  process.env.LOCAL_DATABASE_DRIVER = process.argv.includes('--docker') ? 'docker' : 'native';
  writeFileSync('.env', `${readFileSync('.env', 'utf8')}\nLOCAL_DATABASE_DRIVER=${process.env.LOCAL_DATABASE_DRIVER}\n`, { mode: 0o600 });
}
if (!process.env.SESSION_SECRET || !process.env.JWT_SECRET) {
  throw new Error('Set separate SESSION_SECRET and JWT_SECRET values in .env.');
}

function run(command, args, timeout = 300000) {
  const result = spawnSync(command, args, { stdio: 'inherit', timeout, windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed. ${result.error?.message || 'See the output above.'}`);
  }
}

const driver = process.env.LOCAL_DATABASE_DRIVER || 'native';
if (!['native', 'docker'].includes(driver)) throw new Error('LOCAL_DATABASE_DRIVER must be native or docker.');
let localDatabase;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  if (driver === 'native') {
    localDatabase = await startLocalDatabase();
  } else {
    const docker = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
      encoding: 'utf8', timeout: 20000, windowsHide: true,
    });
    if (docker.error || docker.status !== 0) {
      throw new Error('Docker is not ready. Open Docker Desktop, wait until its engine is running, then run npm run setup again.');
    }
    run('docker', ['compose', 'up', '-d', '--wait', '--wait-timeout', '90', 'db']);
  }
  run(process.execPath, ['--env-file=.env', 'node_modules/drizzle-kit/bin.cjs', 'push']);
  const email = 'admin@geniusx1.local';
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount === 0) {
    const password = randomBytes(18).toString('base64url');
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (id, email, first_name, last_name, role, password_hash, is_active, approval_status)
       VALUES ($1, $2, 'Local', 'Developer', 'admin', $3, true, 'approved')`,
      [randomUUID(), email, hash],
    );
    mkdirSync('.local', { recursive: true });
    writeFileSync('.local/login.txt', `Local development only\nEmail: ${email}\nPassword: ${password}\n`, { mode: 0o600 });
    console.log('Created local admin account. Its random password is in .local/login.txt (ignored by Git).');
  } else {
    console.log('Preserved the existing local admin account and its password.');
  }
} finally {
  await pool.end();
  if (localDatabase) await localDatabase.stop();
}

console.log('Database ready. Run npm run dev, then open http://localhost:5000.');
if (!process.env.OPENAI_API_KEY?.trim()) {
  console.log('AI generation is disabled until you add OPENAI_API_KEY to .env and restart the app.');
}
