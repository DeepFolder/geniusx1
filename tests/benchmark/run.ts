#!/usr/bin/env tsx
/**
 * DeepSearch Benchmark Runner
 *
 * Standalone Node script (tsx) — NOT a Vitest file.
 *
 * For each prompt fixture:
 *   1. Calls classifyQuery() directly (stage timer + token usage)
 *   2. Calls discoverManufacturers() directly (stage timer + token usage)
 *   3. POSTs to /api/openai/agent-search-stream on a local Express instance,
 *      collects all NDJSON events and per-event timings (first status,
 *      first token, first product card, total stream).
 *   4. Scores the response via scorer.ts
 *   5. Captures structured error records when a stage throws or the stream
 *      emits an error event.
 *   6. Writes a JSON report to benchmark-results/run-<timestamp>.json and
 *      persists to the local + production benchmark database.
 *
 * IMPORTANT: All measurement is local to this script — no hooks are added to
 * the agent runtime. The agent is only contacted over its HTTP boundary.
 *
 * Usage:
 *   npm run benchmark
 *
 * Auto-skips (exits 0) when OPENAI_API_KEY is not set.
 */

import { createServer } from 'http';
import { AddressInfo } from 'net';
import express from 'express';
import { PROMPT_FIXTURES, type PromptFixture } from '../fixtures/prompts.js';
import { parseNdjson, validateStreamShape } from '../e2e/stream-validator.js';
import { timed } from './timer.js';
import { scoreResponse } from './scorer.js';
import { classifyQuery } from '../../server/features/hybrid-search/agents/query-classifier.js';
import {
  discoverManufacturers,
  detectDomainHeuristic,
} from '../../server/features/hybrid-search/agents/manufacturer-discovery.js';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(__dirname, '../../benchmark-results');

// ────────────────────────────────────────────────────────────────────────────
// Guard: skip if no API key
// ────────────────────────────────────────────────────────────────────────────
if (!process.env.OPENAI_API_KEY) {
  console.log('[Benchmark] OPENAI_API_KEY not set — skipping benchmark run.');
  process.exit(0);
}

// ────────────────────────────────────────────────────────────────────────────
// Minimal Express server for HTTP-based streaming measurements
// ────────────────────────────────────────────────────────────────────────────
async function startLocalServer(): Promise<{ port: number; close: () => void }> {
  const app = express();
  app.use(express.json());

  const { default: hybridSearchRouter } = await import(
    '../../server/features/hybrid-search/backend/routes.js'
  );
  app.use('/api/openai', hybridSearchRouter);

  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        close: () => server.close(),
      });
    });
    server.once('error', reject);
  });
}

// ────────────────────────────────────────────────────────────────────────────
// HTTP streaming helper: collect all NDJSON events + per-event timings
// ────────────────────────────────────────────────────────────────────────────
interface StreamRunResult {
  events: ReturnType<typeof parseNdjson>;
  totalMs: number;
  firstTokenMs: number | null;
  firstStatusMs: number | null;
  firstProductCardMs: number | null;
  rawBody: string;
  streamError: { message: string; stackSnippet?: string } | null;
  streamTokens: { total: number | null; prompt: number | null; completion: number | null; apiCalls: number | null };
}

async function runStreamRequest(
  port: number,
  fixture: PromptFixture,
): Promise<StreamRunResult> {
  const body = JSON.stringify({
    query: fixture.prompt,
    mode: 'hybrid',
    chatHistory: fixture.chatHistory ?? [],
  });

  const start = Date.now();
  let firstTokenMs: number | null = null;
  let firstStatusMs: number | null = null;
  let firstProductCardMs: number | null = null;
  let rawBody = '';

  const response = await fetch(`http://127.0.0.1:${port}/api/openai/agent-search-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No readable body on response');

  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    rawBody += chunk;
    buf += chunk;

    // Process complete lines for accurate per-event timings.
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const now = Date.now() - start;
      // Cheap shape probe to avoid full JSON.parse cost on every line.
      if (firstStatusMs === null && line.includes('"type":"status"')) firstStatusMs = now;
      if (firstTokenMs === null && line.includes('"type":"token"')) firstTokenMs = now;
      if (firstProductCardMs === null && line.includes('"type":"product_card"')) firstProductCardMs = now;
    }
  }

  const totalMs = Date.now() - start;
  const events = parseNdjson(rawBody);

  // Surface stream-level error events as a structured error record.
  let streamError: StreamRunResult['streamError'] = null;
  const errEv = events.find((e) => e.type === 'error');
  if (errEv) {
    const msg = typeof errEv.error === 'string'
      ? errEv.error
      : typeof (errEv as any).message === 'string'
        ? String((errEv as any).message)
        : 'Stream emitted error event';
    streamError = { message: msg };
  }

  // Extract streaming agent token usage from the terminal `result` event.
  // The hybrid-search pipeline attaches `usage: { api_calls, total_tokens, total_duration_ms }`
  // where `total_tokens` is itself a TokenUsage object {prompt_tokens, completion_tokens, total_tokens}.
  let streamTokens: StreamRunResult['streamTokens'] = { total: null, prompt: null, completion: null, apiCalls: null };
  const resultEv = events.find((e) => e.type === 'result');
  if (resultEv) {
    const resultData = (resultEv as any).data ?? resultEv;
    const usage = resultData?.usage;
    if (usage) {
      const tt = usage.total_tokens;
      if (tt && typeof tt === 'object') {
        streamTokens = {
          total: typeof tt.total_tokens === 'number' ? tt.total_tokens : null,
          prompt: typeof tt.prompt_tokens === 'number' ? tt.prompt_tokens : null,
          completion: typeof tt.completion_tokens === 'number' ? tt.completion_tokens : null,
          apiCalls: typeof usage.api_calls === 'number' ? usage.api_calls : null,
        };
      } else if (typeof tt === 'number') {
        streamTokens = { total: tt, prompt: null, completion: null, apiCalls: typeof usage.api_calls === 'number' ? usage.api_calls : null };
      }
    }
  }

  return { events, totalMs, firstTokenMs, firstStatusMs, firstProductCardMs, rawBody, streamError, streamTokens };
}

// ────────────────────────────────────────────────────────────────────────────
// Per-fixture benchmark
// ────────────────────────────────────────────────────────────────────────────
type ErrorStage = 'classify' | 'discovery' | 'stream' | 'scorer';

interface ErrorRecord {
  stage: ErrorStage;
  message: string;
  stackSnippet?: string;
}

interface MatchOutcome<T = string | undefined> {
  predicted: T;
  expected: T;
  match: boolean | null; // null = not applicable (no expected value)
}

interface FixtureReport {
  id: string;
  prompt: string;
  expectedIntent: string;
  expectedDomain: string;
  expectedFollowUpAnswerType?: string;
  expectedCalculationMode?: string;
  stages: {
    classify: {
      durationMs: number;
      tokens: number | null;
      promptTokens: number | null;
      completionTokens: number | null;
      intent: string;
      domain: string;
      confidence: number;
      follow_up_answer_type?: string;
      calculation_mode?: string;
    } | null;
    manufacturerDiscovery: {
      durationMs: number;
      tokens: number | null;
      promptTokens: number | null;
      completionTokens: number | null;
      manufacturerCount: number;
    } | null;
    agent: {
      durationMs: number;
      tokens: number | null;
      promptTokens: number | null;
      completionTokens: number | null;
      apiCalls: number | null;
    } | null;
    streamToFirstToken: { durationMs: number } | null;
    streamToFirstStatus: { durationMs: number } | null;
    streamToFirstProductCard: { durationMs: number } | null;
  };
  totalDurationMs: number;
  totalTokens: number | null;
  /** Stream throughput in completion tokens per second (output tokens / stream duration). */
  throughputTokensPerSec: number | null;
  /** Time-to-first-token latency in milliseconds (first user-visible content). */
  latencyMs: number | null;
  streamStats: {
    totalEvents: number;
    statusCount: number;
    tokenCount: number;
    productCardCount: number;
    hasResult: boolean;
    hasError: boolean;
    endedWith: 'result' | 'error' | 'none';
  };
  streamValid: boolean;
  streamErrors: string[];
  outcomes: {
    intent: MatchOutcome;
    domain: MatchOutcome;
    followUpAnswerType: MatchOutcome;
    calculationMode: MatchOutcome;
  };
  quality: {
    intentMatch: number;
    domainMatch: number;
    hasExpectedSections: number;
    noHallucination: number;
    calculationMode: number;
    followUpAnswerTypeMatch: number;
    total: number;
  };
  errorRecord?: ErrorRecord;
  error?: string;
}

function snippet(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  return stack.split('\n').slice(0, 4).join('\n');
}

function sumTokens(...vals: Array<number | null | undefined>): number | null {
  let total = 0;
  let any = false;
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      total += v;
      any = true;
    }
  }
  return any ? total : null;
}

async function benchmarkFixture(port: number, fixture: PromptFixture): Promise<FixtureReport> {
  console.log(`\n[${fixture.id}] ${fixture.prompt.slice(0, 60)}...`);

  const fixtureStart = Date.now();

  const report: FixtureReport = {
    id: fixture.id,
    prompt: fixture.prompt,
    expectedIntent: fixture.expectedIntent,
    expectedDomain: fixture.expectedDomain,
    stages: {
      classify: null,
      manufacturerDiscovery: null,
      agent: null,
      streamToFirstToken: null,
      streamToFirstStatus: null,
      streamToFirstProductCard: null,
    },
    totalDurationMs: 0,
    totalTokens: null,
    throughputTokensPerSec: null,
    latencyMs: null,
    streamStats: {
      totalEvents: 0,
      statusCount: 0,
      tokenCount: 0,
      productCardCount: 0,
      hasResult: false,
      hasError: false,
      endedWith: 'none',
    },
    streamValid: false,
    streamErrors: [],
    outcomes: {
      intent: { predicted: undefined, expected: fixture.expectedIntent, match: null },
      domain: { predicted: undefined, expected: fixture.expectedDomain, match: null },
      followUpAnswerType: { predicted: undefined, expected: fixture.expectedFollowUpAnswerType, match: null },
      calculationMode: { predicted: undefined, expected: fixture.expectedCalculationMode, match: null },
    },
    quality: { intentMatch: 0, domainMatch: 0, hasExpectedSections: 0, noHallucination: 0, calculationMode: 1, followUpAnswerTypeMatch: 1, total: 0 },
  };
  if (fixture.expectedFollowUpAnswerType) report.expectedFollowUpAnswerType = fixture.expectedFollowUpAnswerType;
  if (fixture.expectedCalculationMode) report.expectedCalculationMode = fixture.expectedCalculationMode;

  // Stage 1: Classifier
  try {
    const classifyRun = await timed(() =>
      classifyQuery(fixture.prompt, fixture.chatHistory ?? [], 10000),
    );
    const classifyUsage = (classifyRun.result as any)._usage;
    const cTotal = classifyRun.tokens?.total_tokens ?? classifyUsage?.total_tokens ?? null;
    const cPrompt = classifyRun.tokens?.prompt_tokens ?? classifyUsage?.prompt_tokens ?? null;
    const cCompletion = classifyRun.tokens?.completion_tokens ?? classifyUsage?.completion_tokens ?? null;
    report.stages.classify = {
      durationMs: classifyRun.durationMs,
      tokens: cTotal,
      promptTokens: cPrompt,
      completionTokens: cCompletion,
      intent: classifyRun.result.intent,
      domain: classifyRun.result.domain,
      confidence: classifyRun.result.classification_confidence,
      ...(classifyRun.result.follow_up_answer_type
        ? { follow_up_answer_type: classifyRun.result.follow_up_answer_type }
        : {}),
      ...(classifyRun.result.strategy?.calculation_mode
        ? { calculation_mode: classifyRun.result.strategy.calculation_mode }
        : {}),
    };
    report.outcomes.intent = {
      predicted: classifyRun.result.intent,
      expected: fixture.expectedIntent,
      match: classifyRun.result.intent === fixture.expectedIntent,
    };
    report.outcomes.domain = {
      predicted: classifyRun.result.domain,
      expected: fixture.expectedDomain,
      match: classifyRun.result.domain === fixture.expectedDomain,
    };
    if (fixture.expectedFollowUpAnswerType) {
      report.outcomes.followUpAnswerType = {
        predicted: classifyRun.result.follow_up_answer_type,
        expected: fixture.expectedFollowUpAnswerType,
        match: classifyRun.result.follow_up_answer_type === fixture.expectedFollowUpAnswerType,
      };
    }
    if (fixture.expectedCalculationMode) {
      report.outcomes.calculationMode = {
        predicted: classifyRun.result.strategy?.calculation_mode,
        expected: fixture.expectedCalculationMode,
        match: classifyRun.result.strategy?.calculation_mode === fixture.expectedCalculationMode,
      };
    }
    console.log(
      `  classify: ${classifyRun.durationMs}ms  intent=${classifyRun.result.intent}  confidence=${classifyRun.result.classification_confidence}`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    report.errorRecord = { stage: 'classify', message, stackSnippet: snippet(err instanceof Error ? err.stack : undefined) };
    report.error = message;
    console.error(`  classify ERROR: ${message}`);
    report.totalDurationMs = Date.now() - fixtureStart;
    return report;
  }

  // Stage 2: Manufacturer discovery
  try {
    const domain = detectDomainHeuristic(fixture.prompt);
    const discoveryRun = await timed(() =>
      discoverManufacturers(fixture.prompt, domain, undefined, undefined, fixture.chatHistory ?? []),
    );
    const discoveryUsage = (discoveryRun.result as any)._usage;
    const dTotal = discoveryRun.tokens?.total_tokens ?? discoveryUsage?.total_tokens ?? null;
    const dPrompt = discoveryRun.tokens?.prompt_tokens ?? discoveryUsage?.prompt_tokens ?? null;
    const dCompletion = discoveryRun.tokens?.completion_tokens ?? discoveryUsage?.completion_tokens ?? null;
    report.stages.manufacturerDiscovery = {
      durationMs: discoveryRun.durationMs,
      tokens: dTotal,
      promptTokens: dPrompt,
      completionTokens: dCompletion,
      manufacturerCount: discoveryRun.result.manufacturers.length,
    };
    console.log(
      `  discovery: ${discoveryRun.durationMs}ms  manufacturers=${discoveryRun.result.manufacturers.length}`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    report.errorRecord = { stage: 'discovery', message, stackSnippet: snippet(err instanceof Error ? err.stack : undefined) };
    report.error = message;
    console.error(`  discovery ERROR: ${message}`);
    // Continue to stream stage — agent runs independently of the discovery probe.
  }

  // Stage 3+4: Full streaming pipeline
  try {
    const streamRun = await runStreamRequest(port, fixture);
    report.stages.agent = {
      durationMs: streamRun.totalMs,
      tokens: streamRun.streamTokens.total,
      promptTokens: streamRun.streamTokens.prompt,
      completionTokens: streamRun.streamTokens.completion,
      apiCalls: streamRun.streamTokens.apiCalls,
    };
    if (streamRun.firstTokenMs !== null) {
      report.stages.streamToFirstToken = { durationMs: streamRun.firstTokenMs };
    }
    if (streamRun.firstStatusMs !== null) {
      report.stages.streamToFirstStatus = { durationMs: streamRun.firstStatusMs };
    }
    if (streamRun.firstProductCardMs !== null) {
      report.stages.streamToFirstProductCard = { durationMs: streamRun.firstProductCardMs };
    }

    // Stream validation
    const validation = validateStreamShape(streamRun.events, fixture.expectsProductCards);
    report.streamValid = validation.valid;
    report.streamErrors = validation.errors;
    const lastType = validation.stats.lastEventType;
    report.streamStats = {
      totalEvents: validation.stats.totalEvents,
      statusCount: validation.stats.statusCount,
      tokenCount: validation.stats.tokenCount,
      productCardCount: validation.stats.productCardCount,
      hasResult: validation.stats.hasResult,
      hasError: validation.stats.hasError,
      endedWith: lastType === 'result' ? 'result' : lastType === 'error' ? 'error' : 'none',
    };

    if (streamRun.streamError && !report.errorRecord) {
      report.errorRecord = { stage: 'stream', message: streamRun.streamError.message, stackSnippet: streamRun.streamError.stackSnippet };
    }

    // Quality score
    try {
      report.quality = scoreResponse(fixture, streamRun.events);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      report.errorRecord = { stage: 'scorer', message, stackSnippet: snippet(err instanceof Error ? err.stack : undefined) };
      console.error(`  scorer ERROR: ${message}`);
    }

    console.log(
      `  agent: ${streamRun.totalMs}ms  first-token: ${streamRun.firstTokenMs ?? 'n/a'}ms  ` +
        `first-card: ${streamRun.firstProductCardMs ?? 'n/a'}ms  ` +
        `cards=${validation.stats.productCardCount}  quality=${report.quality.total.toFixed(2)}`,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    report.errorRecord = { stage: 'stream', message, stackSnippet: snippet(err instanceof Error ? err.stack : undefined) };
    report.error = message;
    console.error(`  stream ERROR: ${message}`);
  }

  report.totalDurationMs = Date.now() - fixtureStart;
  report.totalTokens = sumTokens(
    report.stages.classify?.tokens,
    report.stages.manufacturerDiscovery?.tokens,
    report.stages.agent?.tokens,
  );

  // Latency = time-to-first-token (the user-visible "responsiveness" of the stream).
  report.latencyMs = report.stages.streamToFirstToken?.durationMs ?? null;

  // Throughput = completion tokens per second over the streaming step. Falls back
  // to total stream tokens if the agent only reports an aggregate.
  const agentMs = report.stages.agent?.durationMs ?? 0;
  const outTok = report.stages.agent?.completionTokens ?? report.stages.agent?.tokens ?? null;
  if (agentMs > 0 && outTok !== null && outTok > 0) {
    report.throughputTokensPerSec = parseFloat(((outTok / agentMs) * 1000).toFixed(2));
  }

  return report;
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== DeepSearch Benchmark Runner ===');
  console.log(`Running ${PROMPT_FIXTURES.length} fixtures...\n`);

  const { port, close } = await startLocalServer();
  console.log(`Local server listening on port ${port}`);

  const reports: FixtureReport[] = [];
  for (const fixture of PROMPT_FIXTURES) {
    const report = await benchmarkFixture(port, fixture);
    reports.push(report);
  }

  close();

  // Aggregate stats
  const avgQuality =
    reports.reduce((acc, r) => acc + r.quality.total, 0) / reports.length;
  const reportsWithFirstToken = reports.filter((r) => r.stages.streamToFirstToken !== null);
  const avgFirstToken =
    reportsWithFirstToken.length > 0
      ? reportsWithFirstToken.reduce(
          (acc, r) => acc + (r.stages.streamToFirstToken?.durationMs ?? 0),
          0,
        ) / reportsWithFirstToken.length
      : 0;

  const reportsWithFirstCard = reports.filter((r) => r.stages.streamToFirstProductCard !== null);
  const avgFirstProductCard =
    reportsWithFirstCard.length > 0
      ? reportsWithFirstCard.reduce(
          (acc, r) => acc + (r.stages.streamToFirstProductCard?.durationMs ?? 0),
          0,
        ) / reportsWithFirstCard.length
      : 0;

  const reportsWithTotal = reports.filter((r) => r.totalDurationMs > 0);
  const avgTotalDuration =
    reportsWithTotal.length > 0
      ? reportsWithTotal.reduce((acc, r) => acc + r.totalDurationMs, 0) / reportsWithTotal.length
      : 0;

  const reportsWithTokens = reports.filter((r) => typeof r.totalTokens === 'number');
  const avgTotalTokens =
    reportsWithTokens.length > 0
      ? reportsWithTokens.reduce((acc, r) => acc + (r.totalTokens ?? 0), 0) / reportsWithTokens.length
      : null;

  const withClassify = reports.filter((r) => r.stages.classify !== null);
  const intentAccuracy =
    withClassify.length > 0
      ? withClassify.filter((r) => r.stages.classify?.intent === r.expectedIntent).length / withClassify.length
      : 0;
  const domainAccuracy =
    withClassify.length > 0
      ? withClassify.filter((r) => r.stages.classify?.domain === r.expectedDomain).length / withClassify.length
      : 0;

  const followUpFixtures = reports.filter((r) => r.expectedFollowUpAnswerType !== undefined);
  const followUpAnswerTypeAccuracy =
    followUpFixtures.length > 0
      ? followUpFixtures.filter(
          (r) => r.stages.classify?.follow_up_answer_type === r.expectedFollowUpAnswerType,
        ).length / followUpFixtures.length
      : null;

  // Per-stage error counts.
  const perStageErrors = { classify: 0, discovery: 0, stream: 0, scorer: 0 };
  for (const r of reports) {
    if (r.errorRecord) perStageErrors[r.errorRecord.stage]++;
  }
  const errorCount = reports.filter((r) => r.errorRecord !== undefined).length;
  const errorRate = reports.length > 0 ? errorCount / reports.length : 0;

  const reportsWithThroughput = reports.filter((r) => typeof r.throughputTokensPerSec === 'number');
  const avgThroughput =
    reportsWithThroughput.length > 0
      ? reportsWithThroughput.reduce((a, r) => a + (r.throughputTokensPerSec ?? 0), 0) / reportsWithThroughput.length
      : null;
  const reportsWithLatency = reports.filter((r) => typeof r.latencyMs === 'number');
  const avgLatency =
    reportsWithLatency.length > 0
      ? reportsWithLatency.reduce((a, r) => a + (r.latencyMs ?? 0), 0) / reportsWithLatency.length
      : null;

  const fullReport = {
    runAt: new Date().toISOString(),
    fixtureCount: PROMPT_FIXTURES.length,
    aggregate: {
      avgQualityScore: parseFloat(avgQuality.toFixed(3)),
      avgStreamToFirstTokenMs: Math.round(avgFirstToken),
      avgStreamToFirstProductCardMs: avgFirstProductCard > 0 ? Math.round(avgFirstProductCard) : null,
      avgTotalDurationMs: Math.round(avgTotalDuration),
      avgTotalTokens: avgTotalTokens !== null ? Math.round(avgTotalTokens) : null,
      validStreamCount: reports.filter((r) => r.streamValid).length,
      errorCount,
      errorRate: parseFloat(errorRate.toFixed(3)),
      perStageErrors,
      avgThroughputTokensPerSec: avgThroughput !== null ? parseFloat(avgThroughput.toFixed(2)) : null,
      avgLatencyMs: avgLatency !== null ? Math.round(avgLatency) : null,
      intentAccuracy: parseFloat(intentAccuracy.toFixed(3)),
      domainAccuracy: parseFloat(domainAccuracy.toFixed(3)),
      followUpAnswerTypeAccuracy: followUpAnswerTypeAccuracy !== null
        ? parseFloat(followUpAnswerTypeAccuracy.toFixed(3))
        : null,
      followUpFixtureCount: followUpFixtures.length > 0 ? followUpFixtures.length : null,
    },
    fixtures: reports,
  };

  // Write report to filesystem
  if (!existsSync(RESULTS_DIR)) {
    await mkdir(RESULTS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(RESULTS_DIR, `run-${timestamp}.json`);
  await writeFile(outPath, JSON.stringify(fullReport, null, 2), 'utf-8');

  // Persist to local dev database
  if (process.env.DATABASE_URL) {
    try {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      });
      await pool.query(
        `INSERT INTO benchmark_runs (run_at, fixture_count, aggregate, fixtures)
         VALUES ($1, $2, $3, $4)`,
        [
          new Date(fullReport.runAt),
          fullReport.fixtureCount,
          JSON.stringify(fullReport.aggregate),
          JSON.stringify(fullReport.fixtures),
        ],
      );
      await pool.end();
      console.log('  Saved to dev database.');
    } catch (dbErr) {
      console.warn('  Warning: could not save to dev database:', (dbErr as Error).message);
    }
  }

  // Publish only when an explicit destination was configured for this run.
  const prodUrl = process.env.BENCHMARK_PRODUCTION_URL;
  if (prodUrl) try {
    const pushRes = await fetch(prodUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullReport),
    });
    if (pushRes.ok) {
      console.log('  Pushed to production.');
    } else {
      console.warn('  Warning: production push returned', pushRes.status);
    }
  } catch (pushErr) {
    console.warn('  Warning: could not push to production:', (pushErr as Error).message);
  }

  console.log(`\n=== Benchmark Complete ===`);
  console.log(`  Fixtures:          ${PROMPT_FIXTURES.length}`);
  console.log(`  Avg quality score: ${avgQuality.toFixed(3)}`);
  console.log(`  Avg first-token:   ${Math.round(avgFirstToken)}ms`);
  console.log(`  Avg first-card:    ${avgFirstProductCard > 0 ? Math.round(avgFirstProductCard) + 'ms' : 'n/a'}`);
  console.log(`  Avg total dur:     ${Math.round(avgTotalDuration)}ms`);
  console.log(`  Avg total tokens:  ${avgTotalTokens !== null ? Math.round(avgTotalTokens) : 'n/a'}`);
  console.log(`  Valid streams:     ${fullReport.aggregate.validStreamCount}/${PROMPT_FIXTURES.length}`);
  console.log(`  Errors:            ${errorCount} (classify=${perStageErrors.classify} discovery=${perStageErrors.discovery} stream=${perStageErrors.stream} scorer=${perStageErrors.scorer})`);
  console.log(`  Avg throughput:    ${avgThroughput !== null ? avgThroughput.toFixed(2) + ' tok/s' : 'n/a'}`);
  console.log(`  Avg latency (TTFT):${avgLatency !== null ? ' ' + Math.round(avgLatency) + 'ms' : ' n/a'}`);
  console.log(`  Intent accuracy:   ${(intentAccuracy * 100).toFixed(0)}%`);
  console.log(`  Domain accuracy:   ${(domainAccuracy * 100).toFixed(0)}%`);
  if (followUpAnswerTypeAccuracy !== null) {
    console.log(`  Follow-up sub-type accuracy: ${(followUpAnswerTypeAccuracy * 100).toFixed(0)}% (${followUpFixtures.length} fixtures)`);
  }
  console.log(`  Report written to: ${outPath}\n`);
}

main().catch((err: unknown) => {
  console.error('[Benchmark] Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
