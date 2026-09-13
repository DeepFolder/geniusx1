const mode = process.argv[2];
if (!['development', 'production'].includes(mode)) {
  throw new Error('Choose development or production. Use npm run dev or npm start.');
}
if (Number(process.versions.node.split('.')[0]) !== 24) {
  throw new Error('Genius X1 requires Node.js 24. Check node --version and restart your terminal after installing it.');
}
process.env.NODE_ENV = mode;
let localDatabase;
if (mode === 'development' && process.env.LOCAL_DATABASE_DRIVER === 'native') {
  const { startLocalDatabase } = await import('./local-database.mjs');
  localDatabase = await startLocalDatabase();
}
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  if (localDatabase) await localDatabase.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
try {
  await import(mode === 'production' ? '../dist/index.js' : '../server/index.ts');
} catch (error) {
  if (localDatabase) await localDatabase.stop();
  throw error;
}
