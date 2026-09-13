import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { db } from '../../../../db';
import { benchmarkRuns } from '@shared/schema';
import { desc, and, gte, lte, sql } from 'drizzle-orm';

const router = Router();
const OVERRIDE_PATH = resolve(process.cwd(), 'benchmark-prompts-override.json');

const VALID_TRUNC = ['day', 'week', 'month'] as const;
type TruncUnit = typeof VALID_TRUNC[number];

interface ActiveJob {
  id: string;
  done: boolean;
  exitCode: number | null;
  logs: string[];
  listeners: Set<(line: string) => void>;
}
let activeJob: ActiveJob | null = null;

// POST /admin/benchmark/trigger
router.post('/benchmark/trigger', (req: Request, res: Response) => {
  if (activeJob && !activeJob.done) {
    return res.status(409).json({ error: 'Already running', jobId: activeJob.id });
  }
  const jobId = `bm-${Date.now()}`;
  activeJob = { id: jobId, done: false, exitCode: null, logs: [], listeners: new Set() };

  const emit = (line: string) => {
    if (!activeJob) return;
    activeJob.logs.push(line);
    for (const l of activeJob.listeners) l(line);
  };

  const child = spawn('npm', ['run', 'benchmark'], { cwd: process.cwd(), env: process.env as NodeJS.ProcessEnv });
  child.stdout?.on('data', (d: Buffer) => d.toString().split('\n').filter(Boolean).forEach(emit));
  child.stderr?.on('data', (d: Buffer) => d.toString().split('\n').filter(Boolean).forEach(l => emit(`[err] ${l}`)));
  child.on('close', (code) => { if (activeJob) { activeJob.done = true; activeJob.exitCode = code; emit(`[done] exit ${code}`); } });

  res.json({ jobId });
});

// GET /admin/benchmark-status
router.get('/benchmark-status', (_req: Request, res: Response) => {
  res.json({ running: !!(activeJob && !activeJob.done), jobId: activeJob?.id ?? null, exitCode: activeJob?.exitCode ?? null });
});

// GET /admin/benchmark/stream/:jobId  (SSE)
router.get('/benchmark/stream/:jobId', (req: Request, res: Response) => {
  if (!activeJob || activeJob.id !== req.params.jobId) return res.status(404).json({ error: 'Job not found' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (line: string) => res.write(`data: ${JSON.stringify({ log: line })}\n\n`);
  activeJob.logs.forEach(send);
  if (activeJob.done) { res.write(`data: ${JSON.stringify({ done: true, exitCode: activeJob.exitCode })}\n\n`); return res.end(); }

  activeJob.listeners.add(send);
  const poll = setInterval(() => {
    if (activeJob?.done) { clearInterval(poll); res.write(`data: ${JSON.stringify({ done: true, exitCode: activeJob.exitCode })}\n\n`); res.end(); }
  }, 500);
  req.on('close', () => { clearInterval(poll); activeJob?.listeners.delete(send); });
});

// GET /admin/benchmarks?page&perPage&fixtureId&dateFrom&dateTo
router.get('/benchmarks', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const perPage = Math.min(100, Math.max(1, Number(req.query.perPage ?? 25)));
    const { fixtureId, dateFrom, dateTo } = req.query as Record<string, string>;

    const conds: any[] = [];
    if (dateFrom) conds.push(gte(benchmarkRuns.runAt, new Date(dateFrom)));
    if (dateTo) conds.push(lte(benchmarkRuns.runAt, new Date(dateTo)));
    if (fixtureId) conds.push(sql`${benchmarkRuns.fixtures} @> ${JSON.stringify([{ id: fixtureId }])}::jsonb`);
    const where = conds.length ? and(...conds) : undefined;

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(benchmarkRuns).where(where).orderBy(desc(benchmarkRuns.runAt)).limit(perPage).offset((page - 1) * perPage),
      db.select({ total: sql<number>`COUNT(*)::int` }).from(benchmarkRuns).where(where),
    ]);
    res.json({ runs: rows, total, page, perPage, totalPages: Math.ceil(total / perPage) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// POST /admin/benchmarks – save a run (called by runner after each run)
router.post('/benchmarks', async (req: Request, res: Response) => {
  try {
    const { runAt, fixtureCount, aggregate, fixtures } = req.body;
    if (!runAt || !fixtureCount || !aggregate || !fixtures) return res.status(400).json({ error: 'Missing fields' });
    const [row] = await db.insert(benchmarkRuns).values({ runAt: new Date(runAt), fixtureCount, aggregate, fixtures }).returning({ id: benchmarkRuns.id });
    res.json({ ok: true, id: row.id });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /admin/benchmark-chart?fixtureId&dateFrom&dateTo&groupBy
router.get('/benchmark-chart', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { fixtureId, dateFrom, dateTo } = req.query as Record<string, string>;
    const groupByParam = (req.query.groupBy as string) ?? 'auto';

    const conds: any[] = [];
    if (dateFrom) conds.push(gte(benchmarkRuns.runAt, new Date(dateFrom)));
    if (dateTo) conds.push(lte(benchmarkRuns.runAt, new Date(dateTo)));
    if (fixtureId) conds.push(sql`${benchmarkRuns.fixtures} @> ${JSON.stringify([{ id: fixtureId }])}::jsonb`);
    const where = conds.length ? and(...conds) : undefined;

    let trunc: TruncUnit = 'day';
    if (VALID_TRUNC.includes(groupByParam as TruncUnit)) {
      trunc = groupByParam as TruncUnit;
    } else {
      const fromMs = dateFrom ? new Date(dateFrom).getTime() : Date.now() - 90 * 86400000;
      const days = (Date.now() - fromMs) / 86400000;
      trunc = days > 365 ? 'month' : days > 90 ? 'week' : 'day';
    }
    const t = sql.raw(`'${trunc}'`);
    const expr = sql`DATE_TRUNC(${t}, run_at AT TIME ZONE 'UTC')`;

    const points = await db.select({
      period: sql<string>`${expr}::text`,
      avgQuality: sql<number>`ROUND(AVG((aggregate->>'avgQualityScore')::float)::numeric, 3)`,
      avgIntent: sql<number>`ROUND(AVG((aggregate->>'intentAccuracy')::float)::numeric, 3)`,
      avgDomain: sql<number>`ROUND(AVG((aggregate->>'domainAccuracy')::float)::numeric, 3)`,
      avgFollowUp: sql<number | null>`ROUND(AVG(NULLIF((aggregate->>'followUpAnswerTypeAccuracy')::float, 'NaN'))::numeric, 3)`,
      avgFirstToken: sql<number>`ROUND(AVG((aggregate->>'avgStreamToFirstTokenMs')::float))::int`,
      avgTotalDuration: sql<number | null>`ROUND(AVG(NULLIF((aggregate->>'avgTotalDurationMs')::float, 'NaN')))::int`,
      avgTotalTokens: sql<number | null>`ROUND(AVG(NULLIF((aggregate->>'avgTotalTokens')::float, 'NaN')))::int`,
      errorRate: sql<number | null>`ROUND(AVG(NULLIF((aggregate->>'errorRate')::float, 'NaN'))::numeric, 3)`,
      avgThroughput: sql<number | null>`ROUND(AVG(NULLIF((aggregate->>'avgThroughputTokensPerSec')::float, 'NaN'))::numeric, 2)`,
      avgLatency: sql<number | null>`ROUND(AVG(NULLIF((aggregate->>'avgLatencyMs')::float, 'NaN')))::int`,
      runCount: sql<number>`COUNT(*)::int`,
      followUpFixtureCount: sql<number | null>`SUM(NULLIF((aggregate->>'followUpFixtureCount')::int, 0))`,
    }).from(benchmarkRuns).where(where).groupBy(expr).orderBy(expr);

    res.json({ points, groupBy: trunc });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// GET /admin/benchmark-prompts
router.get('/benchmark-prompts', (_req: Request, res: Response) => {
  if (existsSync(OVERRIDE_PATH)) {
    try { return res.json({ prompts: JSON.parse(readFileSync(OVERRIDE_PATH, 'utf-8')), isOverride: true }); } catch {}
  }
  res.json({ prompts: null, isOverride: false });
});

// PUT /admin/benchmark-prompts
router.put('/benchmark-prompts', (req: Request, res: Response) => {
  try {
    const { prompts } = req.body;
    if (!Array.isArray(prompts)) return res.status(400).json({ error: 'prompts must be array' });
    writeFileSync(OVERRIDE_PATH, JSON.stringify(prompts, null, 2), 'utf-8');
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// DELETE /admin/benchmark-prompts (reset to defaults)
router.delete('/benchmark-prompts', (_req: Request, res: Response) => {
  try {
    if (existsSync(OVERRIDE_PATH)) require('fs').unlinkSync(OVERRIDE_PATH);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
