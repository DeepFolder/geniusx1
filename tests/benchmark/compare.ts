#!/usr/bin/env tsx
/**
 * DeepSearch Benchmark Comparison
 *
 * Reads benchmark-results/baseline.json and the most-recent
 * benchmark-results/run-*.json file, diffs EVERY metric in the report,
 * and prints a markdown table with delta and pass/fail per metric.
 *
 * Usage:
 *   npm run benchmark:compare
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, '../../benchmark-results');
const BASELINE_PATH = path.join(RESULTS_DIR, 'baseline.json');

// ────────────────────────────────────────────────────────────────────────────
// Load files
// ────────────────────────────────────────────────────────────────────────────
if (!existsSync(BASELINE_PATH)) {
  console.error(`[Compare] baseline.json not found at ${BASELINE_PATH}`);
  console.error('  Run "npm run benchmark" once and rename the output to baseline.json');
  process.exit(1);
}

const runFiles = readdirSync(RESULTS_DIR)
  .filter((f) => f.startsWith('run-') && f.endsWith('.json'))
  .sort();

if (runFiles.length === 0) {
  console.error('[Compare] No run-*.json files found in benchmark-results/');
  console.error('  Run "npm run benchmark" first to generate a report.');
  process.exit(1);
}

// ────────────────────────────────────────────────────────────────────────────
// Report types (must match benchmark/run.ts output schema exactly)
// ────────────────────────────────────────────────────────────────────────────
interface StageStats {
  durationMs?: number;
  tokens?: number;
  intent?: string;
  domain?: string;
  confidence?: number;
  manufacturerCount?: number;
}

interface StreamStats {
  totalEvents: number;
  statusCount: number;
  tokenCount: number;
  productCardCount: number;
  hasResult: boolean;
  hasError: boolean;
}

interface QualityScore {
  intentMatch: number;
  domainMatch: number;
  hasExpectedSections: number;
  noHallucination: number;
  total: number;
}

interface FixtureReport {
  id: string;
  prompt: string;
  expectedIntent: string;
  expectedDomain: string;
  stages: {
    classify: StageStats | null;
    manufacturerDiscovery: StageStats | null;
    agent: { durationMs?: number } | null;
    streamToFirstToken: { durationMs?: number } | null;
  };
  streamStats: StreamStats;
  streamValid: boolean;
  streamErrors: string[];
  quality: QualityScore;
  error?: string;
}

interface AggregateStats {
  avgQualityScore?: number;
  avgStreamToFirstTokenMs?: number;
  validStreamCount?: number;
  errorCount?: number;
  intentAccuracy?: number;
  domainAccuracy?: number;
}

interface BenchmarkReport {
  runAt?: string;
  fixtureCount?: number;
  aggregate?: AggregateStats;
  fixtures?: FixtureReport[];
}

const latestRunPath = path.join(RESULTS_DIR, runFiles[runFiles.length - 1]);
const baseline: BenchmarkReport = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'));
const latest: BenchmarkReport = JSON.parse(readFileSync(latestRunPath, 'utf-8'));

console.log(`\n=== DeepSearch Benchmark Comparison ===`);
console.log(`  Baseline: benchmark-results/baseline.json  (${baseline.runAt ?? 'unknown'})`);
console.log(`  Latest:   ${runFiles[runFiles.length - 1]}  (${latest.runAt ?? 'unknown'})`);

// ────────────────────────────────────────────────────────────────────────────
// Metric row types
// ────────────────────────────────────────────────────────────────────────────
interface MetricRow {
  metric: string;
  baseline: string;
  latest: string;
  delta: string;
  status: '✅' | '⚠️' | '❌';
}

/** Compare numeric metric, returning a diff row with pass/warn/fail status. */
function numDiff(
  metricName: string,
  baseVal: number | undefined,
  latestVal: number | undefined,
  opts: {
    higherIsBetter: boolean;
    warnThreshold: number;
    failThreshold: number;
    format?: (v: number) => string;
  },
): MetricRow {
  const bv = baseVal ?? 0;
  const lv = latestVal ?? 0;
  const fmt = opts.format ?? ((v: number) => v.toFixed(3));
  const delta = lv - bv;
  const pctChange = bv !== 0 ? ` (${((delta / bv) * 100).toFixed(1)}%)` : '';
  const deltaStr = (delta >= 0 ? '+' : '') + fmt(delta) + pctChange;

  let status: MetricRow['status'];
  const absDelta = Math.abs(delta);
  if (opts.higherIsBetter) {
    status = delta >= -opts.warnThreshold ? '✅' : delta >= -opts.failThreshold ? '⚠️' : '❌';
  } else {
    status = delta <= opts.warnThreshold ? '✅' : delta <= opts.failThreshold ? '⚠️' : '❌';
  }

  return {
    metric: metricName,
    baseline: fmt(bv),
    latest: fmt(lv),
    delta: deltaStr,
    status,
  };
}

/** Compare boolean metric. */
function boolDiff(metricName: string, baseVal: boolean, latestVal: boolean): MetricRow {
  const status: MetricRow['status'] = latestVal === baseVal ? '✅' : baseVal && !latestVal ? '❌' : '⚠️';
  return {
    metric: metricName,
    baseline: String(baseVal),
    latest: String(latestVal),
    delta: latestVal === baseVal ? '—' : baseVal ? '-1 regression' : '+1 recovery',
    status,
  };
}

const msFormat = (v: number) => `${Math.round(v)}ms`;
const pctFormat = (v: number) => `${(v * 100).toFixed(1)}%`;
const countFormat = (v: number) => String(Math.round(v));

// ────────────────────────────────────────────────────────────────────────────
// 1. Aggregate metrics
// ────────────────────────────────────────────────────────────────────────────
const ba = baseline.aggregate ?? {};
const la = latest.aggregate ?? {};

const aggregateRows: MetricRow[] = [
  numDiff('Avg quality score',         ba.avgQualityScore,         la.avgQualityScore,         { higherIsBetter: true,  warnThreshold: 0.05, failThreshold: 0.10 }),
  numDiff('Intent accuracy',           ba.intentAccuracy,          la.intentAccuracy,          { higherIsBetter: true,  warnThreshold: 0.10, failThreshold: 0.20 }),
  numDiff('Domain accuracy',           ba.domainAccuracy,          la.domainAccuracy,          { higherIsBetter: true,  warnThreshold: 0.10, failThreshold: 0.20 }),
  numDiff('Avg stream-to-first-token', ba.avgStreamToFirstTokenMs, la.avgStreamToFirstTokenMs, { higherIsBetter: false, warnThreshold: 500,  failThreshold: 2000, format: msFormat }),
  numDiff('Valid stream count',        ba.validStreamCount,        la.validStreamCount,        { higherIsBetter: true,  warnThreshold: 1,    failThreshold: 2,    format: countFormat }),
  numDiff('Error count',               ba.errorCount,              la.errorCount,              { higherIsBetter: false, warnThreshold: 0,    failThreshold: 1,    format: countFormat }),
  numDiff('Fixture count',             baseline.fixtureCount,      latest.fixtureCount,        { higherIsBetter: true,  warnThreshold: 0,    failThreshold: 1,    format: countFormat }),
];

// ────────────────────────────────────────────────────────────────────────────
// 2. Per-fixture: quality scores
// ────────────────────────────────────────────────────────────────────────────
const baselineByFixture: Record<string, FixtureReport> = {};
for (const f of (baseline.fixtures ?? [])) {
  baselineByFixture[f.id] = f;
}

const fixtureQualityRows: MetricRow[] = [];
const fixtureStageRows: MetricRow[] = [];
const fixtureStreamRows: MetricRow[] = [];

for (const lf of (latest.fixtures ?? [])) {
  const bf = baselineByFixture[lf.id];
  if (!bf) continue;

  // Quality sub-scores
  fixtureQualityRows.push(numDiff(`  [${lf.id}] total`,              bf.quality?.total,              lf.quality?.total,              { higherIsBetter: true,  warnThreshold: 0.10, failThreshold: 0.20 }));
  fixtureQualityRows.push(numDiff(`  [${lf.id}] intentMatch`,        bf.quality?.intentMatch,        lf.quality?.intentMatch,        { higherIsBetter: true,  warnThreshold: 0.10, failThreshold: 0.20 }));
  fixtureQualityRows.push(numDiff(`  [${lf.id}] domainMatch`,        bf.quality?.domainMatch,        lf.quality?.domainMatch,        { higherIsBetter: true,  warnThreshold: 0.10, failThreshold: 0.20 }));
  fixtureQualityRows.push(numDiff(`  [${lf.id}] hasExpectedSections`,bf.quality?.hasExpectedSections,lf.quality?.hasExpectedSections,{ higherIsBetter: true,  warnThreshold: 0.10, failThreshold: 0.20 }));
  fixtureQualityRows.push(numDiff(`  [${lf.id}] noHallucination`,    bf.quality?.noHallucination,    lf.quality?.noHallucination,    { higherIsBetter: true,  warnThreshold: 0.05, failThreshold: 0.10 }));

  // Stage durations and tokens
  if (bf.stages.classify && lf.stages.classify) {
    fixtureStageRows.push(numDiff(`  [${lf.id}] classify.durationMs`,    bf.stages.classify.durationMs,    lf.stages.classify.durationMs,    { higherIsBetter: false, warnThreshold: 500,  failThreshold: 2000, format: msFormat }));
    fixtureStageRows.push(numDiff(`  [${lf.id}] classify.tokens`,        bf.stages.classify.tokens,        lf.stages.classify.tokens,        { higherIsBetter: false, warnThreshold: 200,  failThreshold: 1000, format: countFormat }));
    fixtureStageRows.push(numDiff(`  [${lf.id}] classify.confidence`,    bf.stages.classify.confidence,    lf.stages.classify.confidence,    { higherIsBetter: true,  warnThreshold: 0.10, failThreshold: 0.20 }));
  }
  if (bf.stages.manufacturerDiscovery && lf.stages.manufacturerDiscovery) {
    fixtureStageRows.push(numDiff(`  [${lf.id}] discovery.durationMs`,   bf.stages.manufacturerDiscovery.durationMs, lf.stages.manufacturerDiscovery.durationMs, { higherIsBetter: false, warnThreshold: 500,  failThreshold: 2000, format: msFormat }));
    fixtureStageRows.push(numDiff(`  [${lf.id}] discovery.tokens`,       bf.stages.manufacturerDiscovery.tokens,     lf.stages.manufacturerDiscovery.tokens,     { higherIsBetter: false, warnThreshold: 200,  failThreshold: 1000, format: countFormat }));
    fixtureStageRows.push(numDiff(`  [${lf.id}] discovery.mfrs`,         bf.stages.manufacturerDiscovery.manufacturerCount, lf.stages.manufacturerDiscovery.manufacturerCount, { higherIsBetter: true, warnThreshold: 1,  failThreshold: 3, format: countFormat }));
  }
  if (bf.stages.agent && lf.stages.agent) {
    fixtureStageRows.push(numDiff(`  [${lf.id}] agent.durationMs`,       bf.stages.agent.durationMs,       lf.stages.agent.durationMs,       { higherIsBetter: false, warnThreshold: 2000, failThreshold: 10000, format: msFormat }));
  }
  if (bf.stages.streamToFirstToken && lf.stages.streamToFirstToken) {
    fixtureStageRows.push(numDiff(`  [${lf.id}] firstToken.durationMs`,  bf.stages.streamToFirstToken.durationMs, lf.stages.streamToFirstToken.durationMs, { higherIsBetter: false, warnThreshold: 500, failThreshold: 2000, format: msFormat }));
  }

  // Stream stats
  fixtureStreamRows.push(numDiff(`  [${lf.id}] totalEvents`,        bf.streamStats?.totalEvents,    lf.streamStats?.totalEvents,    { higherIsBetter: true,  warnThreshold: 5,   failThreshold: 15,   format: countFormat }));
  fixtureStreamRows.push(numDiff(`  [${lf.id}] tokenCount`,         bf.streamStats?.tokenCount,     lf.streamStats?.tokenCount,     { higherIsBetter: true,  warnThreshold: 5,   failThreshold: 15,   format: countFormat }));
  fixtureStreamRows.push(numDiff(`  [${lf.id}] productCardCount`,   bf.streamStats?.productCardCount,lf.streamStats?.productCardCount,{ higherIsBetter: true,  warnThreshold: 1,   failThreshold: 3,    format: countFormat }));
  fixtureStreamRows.push(boolDiff(`  [${lf.id}] streamValid`,       bf.streamValid,                 lf.streamValid));
  fixtureStreamRows.push(boolDiff(`  [${lf.id}] hasResult`,         bf.streamStats?.hasResult,      lf.streamStats?.hasResult));
  fixtureStreamRows.push(boolDiff(`  [${lf.id}] hasError`,          bf.streamStats?.hasError,       lf.streamStats?.hasError));
}

// ────────────────────────────────────────────────────────────────────────────
// Render helpers
// ────────────────────────────────────────────────────────────────────────────
function renderTable(title: string, tableRows: MetricRow[]) {
  if (tableRows.length === 0) return;
  console.log(`\n### ${title}\n`);
  const colWidths = {
    metric:   Math.max(6,  ...tableRows.map((r) => r.metric.length)),
    baseline: Math.max(8,  ...tableRows.map((r) => r.baseline.length)),
    latest:   Math.max(6,  ...tableRows.map((r) => r.latest.length)),
    delta:    Math.max(5,  ...tableRows.map((r) => r.delta.length)),
  };

  const pad = (s: string, w: number) => s.padEnd(w);
  const header =
    `| ${pad('Metric', colWidths.metric)} | ${pad('Baseline', colWidths.baseline)} | ` +
    `${pad('Latest', colWidths.latest)} | ${pad('Delta', colWidths.delta)} | Status |`;
  const sep =
    `| ${'-'.repeat(colWidths.metric)} | ${'-'.repeat(colWidths.baseline)} | ` +
    `${'-'.repeat(colWidths.latest)} | ${'-'.repeat(colWidths.delta)} | ------ |`;

  console.log(header);
  console.log(sep);
  for (const row of tableRows) {
    console.log(
      `| ${pad(row.metric, colWidths.metric)} | ${pad(row.baseline, colWidths.baseline)} | ` +
        `${pad(row.latest, colWidths.latest)} | ${pad(row.delta, colWidths.delta)} | ${row.status}     |`,
    );
  }
}

renderTable('Aggregate Metrics', aggregateRows);
renderTable('Per-Fixture Quality Scores', fixtureQualityRows);
renderTable('Per-Fixture Stage Latency & Tokens', fixtureStageRows);
renderTable('Per-Fixture Stream Stats', fixtureStreamRows);

// ────────────────────────────────────────────────────────────────────────────
// Final verdict
// ────────────────────────────────────────────────────────────────────────────
const allRows = [...aggregateRows, ...fixtureQualityRows, ...fixtureStageRows, ...fixtureStreamRows];
const allPass = allRows.every((r) => r.status !== '❌');
const anyWarn = allRows.some((r) => r.status === '⚠️');
const failCount = allRows.filter((r) => r.status === '❌').length;
const warnCount = allRows.filter((r) => r.status === '⚠️').length;

console.log('\n---');
console.log(`Total metrics compared: ${allRows.length} | Failures: ${failCount} | Warnings: ${warnCount}`);

if (allPass && !anyWarn) {
  console.log('✅  All metrics within acceptable range vs baseline.');
} else if (allPass) {
  console.log('⚠️  Some metrics degraded slightly vs baseline — review before merging.');
} else {
  console.log(`❌  ${failCount} metric(s) regressed significantly vs baseline.`);
  process.exit(1);
}
