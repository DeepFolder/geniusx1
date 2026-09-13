/**
 * DeepSearch E2E Tests
 *
 * Boots the real Express hybrid-search router on a random port (via supertest)
 * and exercises the /api/openai/agent-search-stream endpoint with the full
 * prompt fixture library.
 *
 * Auto-skip: if OPENAI_API_KEY is absent, all tests are skipped and the
 * suite exits 0 — it never blocks `npm test`.
 *
 * Non-disruption guarantee: zero changes to server/, client/, or shared/.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { createServer } from 'http';
import type { Server } from 'http';
import { buildE2EApp } from './app.js';
import { parseNdjson, validateStreamShape } from './stream-validator.js';
import { PROMPT_FIXTURES } from '../fixtures/prompts.js';
import { scoreResponse } from '../benchmark/scorer.js';
import { mintTestToken } from '../helpers/auth.js';

// Keep-alive guard: pg/drizzle must never be imported at module scope here.
// They are imported lazily inside beforeAll (and in the DB persistence test)
// so that their internal timers don't prevent vitest from exiting cleanly
// when OPENAI_API_KEY is absent and all tests are skipped.
type AnyPool = { end(): Promise<void> };

const HAS_API_KEY = Boolean(process.env.OPENAI_API_KEY);
const HAS_DB = Boolean(process.env.DATABASE_URL);
const maybeDescribe = HAS_API_KEY ? describe : describe.skip;

// ─────────────────────────────────────────────────────────────────────────────
// Shared server + DB connection
// ─────────────────────────────────────────────────────────────────────────────
let server: Server;
let request: ReturnType<typeof supertest>;
let pool: AnyPool | null = null;

beforeAll(async () => {
  if (!HAS_API_KEY) return;

  const app = await buildE2EApp();
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  request = supertest(server);
}, 30_000);

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (pool) await pool.end();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper: POST to agent-search-stream and collect all NDJSON events
// ─────────────────────────────────────────────────────────────────────────────
interface StreamCallOptions {
  chatHistory?: Array<{ role: string; content: string }>;
  sessionId?: number;
  token?: string;
}

async function callStream(prompt: string, opts: StreamCallOptions = {}) {
  const { chatHistory = [], sessionId, token } = opts;

  let req = request
    .post('/api/openai/agent-search-stream')
    .set('Content-Type', 'application/json');

  if (token) {
    req = req.set('Authorization', `Bearer ${token}`);
  }

  const response = await req
    .send({
      query: prompt,
      mode: 'hybrid',
      chatHistory,
      ...(sessionId !== undefined ? { sessionId } : {}),
    })
    .buffer(true)
    .parse((res, callback) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => callback(null, data));
    });

  const rawBody: string = typeof response.body === 'string' ? response.body : '';
  const events = parseNdjson(rawBody);
  return { response, events, rawBody };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream shape invariants — one test per fixture
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('DeepSearch stream shape invariants — all fixtures', () => {
  for (const fixture of PROMPT_FIXTURES) {
    it(
      `[${fixture.id}] status before token, result closure, no error`,
      async () => {
        const { events } = await callStream(fixture.prompt, {
          chatHistory: fixture.chatHistory ?? [],
        });

        expect(events.length).toBeGreaterThan(0);

        // Invariant 1: at least one status event must arrive before first token
        const firstStatusIdx = events.findIndex((e) => e.type === 'status');
        const firstTokenIdx = events.findIndex((e) => e.type === 'token');
        expect(firstStatusIdx).toBeGreaterThanOrEqual(0);
        if (firstTokenIdx >= 0) {
          expect(firstStatusIdx).toBeLessThan(firstTokenIdx);
        }

        // Invariant 2: at least one token event
        // Exception: blocked/off-topic flows legitimately emit zero tokens —
        // they emit decision_summary + result only. Skip this check for those fixtures.
        const tokenEvents = events.filter((e) => e.type === 'token');
        if (!fixture.expectsBlock) {
          expect(tokenEvents.length).toBeGreaterThan(0);
        }

        // Invariant 3: stream must close with a result event
        const resultEvent = events.find((e) => e.type === 'result');
        expect(resultEvent).toBeDefined();

        // Invariant 4: no error events for successful pipelines
        const errorEvent = events.find((e) => e.type === 'error');
        expect(errorEvent).toBeUndefined();
      },
      120_000,
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// F01 — Simple product lookup
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('F01 — Simple product lookup', () => {
  it('returns product cards for stainless steel M6 bolts', async () => {
    const fixture = PROMPT_FIXTURES.find((f) => f.id === 'F01_simple_lookup')!;
    const { events } = await callStream(fixture.prompt);

    const productCards = events.filter((e) => e.type === 'product_card');
    const resultEvent = events.find((e) => e.type === 'result');

    expect(resultEvent).toBeDefined();
    expect(productCards.length).toBeGreaterThan(0);

    const validation = validateStreamShape(events, fixture.expectsProductCards);
    expect(validation.valid).toBe(true);
  }, 120_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// F02 — BOM / build request
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('F02 — BOM build request', () => {
  it('returns a bom_table event for gaming PC build', async () => {
    const fixture = PROMPT_FIXTURES.find((f) => f.id === 'F02_bom_build')!;
    const { events } = await callStream(fixture.prompt);

    const bomEvent = events.find((e) => e.type === 'bom_table');
    const resultEvent = events.find((e) => e.type === 'result');

    expect(resultEvent).toBeDefined();
    expect(bomEvent).toBeDefined();

    // BOM data must be non-empty
    if (bomEvent) {
      expect(Array.isArray(bomEvent.data)).toBe(true);
      expect((bomEvent.data as unknown[]).length).toBeGreaterThan(0);
    }
  }, 120_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// F03 — Engineering calculation
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('F03 — Engineering calculation', () => {
  it('returns a calculation_section and/or product_cards for motor sizing', async () => {
    const fixture = PROMPT_FIXTURES.find((f) => f.id === 'F03_engineering_calc')!;
    const { events } = await callStream(fixture.prompt);

    const calcEvent = events.find((e) => e.type === 'calculation_section');
    const productCards = events.filter((e) => e.type === 'product_card');
    const resultEvent = events.find((e) => e.type === 'result');

    expect(resultEvent).toBeDefined();
    // Must return at least one of: calculation section or product cards
    const hasExpectedOutput = calcEvent !== undefined || productCards.length > 0;
    expect(hasExpectedOutput).toBe(true);
  }, 120_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// F04 — Product comparison
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('F04 — Product comparison', () => {
  it('returns result for SKF vs NSK bearing comparison', async () => {
    const fixture = PROMPT_FIXTURES.find((f) => f.id === 'F04_comparison')!;
    const { events } = await callStream(fixture.prompt);

    const resultEvent = events.find((e) => e.type === 'result');
    expect(resultEvent).toBeDefined();

    // Comparison must produce some product information
    const productCards = events.filter((e) => e.type === 'product_card');
    const comparisonTable = events.find((e) => e.type === 'comparison_table');
    const hasProductInfo = productCards.length > 0 || comparisonTable !== undefined;
    expect(hasProductInfo).toBe(true);
  }, 120_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// F05 — Multi-turn follow-up
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('F05 — Multi-turn follow-up', () => {
  it('handles follow-up query with chat history and returns product results', async () => {
    const fixture = PROMPT_FIXTURES.find((f) => f.id === 'F05_multi_turn_follow_up')!;
    const { events } = await callStream(fixture.prompt, {
      chatHistory: fixture.chatHistory ?? [],
    });

    const resultEvent = events.find((e) => e.type === 'result');
    const tokenEvents = events.filter((e) => e.type === 'token');

    expect(resultEvent).toBeDefined();
    expect(tokenEvents.length).toBeGreaterThan(0);

    // Follow-up on a product search should still return product cards
    const productCards = events.filter((e) => e.type === 'product_card');
    expect(productCards.length).toBeGreaterThan(0);
  }, 120_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// F06 — Datasheet spec query
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('F06 — Datasheet spec query', () => {
  it('answers spec question with substantive token output', async () => {
    const fixture = PROMPT_FIXTURES.find((f) => f.id === 'F06_datasheet_spec_query')!;
    const { events } = await callStream(fixture.prompt, {
      chatHistory: fixture.chatHistory ?? [],
    });

    const resultEvent = events.find((e) => e.type === 'result');
    const tokenEvents = events.filter((e) => e.type === 'token');

    expect(resultEvent).toBeDefined();
    // Explanation should produce substantive token content (not just a status message)
    expect(tokenEvents.length).toBeGreaterThan(5);
  }, 120_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// F07 — Manufacturer discovery
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('F07 — Manufacturer discovery', () => {
  it('returns product cards for servo drive manufacturers in Europe', async () => {
    const fixture = PROMPT_FIXTURES.find((f) => f.id === 'F07_manufacturer_discovery')!;
    const { events } = await callStream(fixture.prompt);

    const productCards = events.filter((e) => e.type === 'product_card');
    const resultEvent = events.find((e) => e.type === 'result');

    expect(resultEvent).toBeDefined();
    expect(productCards.length).toBeGreaterThan(0);
  }, 120_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// F08 — Ambiguous query
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('F08 — Ambiguous query', () => {
  it('returns a clarification or generic response — never hangs', async () => {
    const fixture = PROMPT_FIXTURES.find((f) => f.id === 'F08_ambiguous_query')!;
    const { events } = await callStream(fixture.prompt);

    const resultEvent = events.find((e) => e.type === 'result');
    const tokenEvents = events.filter((e) => e.type === 'token');

    // Must terminate with a result event even for ambiguous queries
    expect(resultEvent).toBeDefined();
    // Must produce some token output (explanation or clarification request)
    expect(tokenEvents.length).toBeGreaterThan(0);
  }, 120_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// F09 — Off-topic query
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('F09 — Off-topic query', () => {
  it('blocks or redirects off-topic query: returns result, no product cards', async () => {
    const fixture = PROMPT_FIXTURES.find((f) => f.id === 'F09_off_topic')!;
    const { events } = await callStream(fixture.prompt);

    const resultEvent = events.find((e) => e.type === 'result');
    expect(resultEvent).toBeDefined();

    // Off-topic must NOT produce product cards
    const productCards = events.filter((e) => e.type === 'product_card');
    expect(productCards.length).toBe(0);
  }, 120_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// F10 — Long multi-constraint query
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('F10 — Long multi-constraint query', () => {
  it('handles long constrained query and returns product cards', async () => {
    const fixture = PROMPT_FIXTURES.find((f) => f.id === 'F10_long_multi_constraint')!;
    const { events } = await callStream(fixture.prompt);

    const productCards = events.filter((e) => e.type === 'product_card');
    const resultEvent = events.find((e) => e.type === 'result');

    expect(resultEvent).toBeDefined();
    expect(productCards.length).toBeGreaterThan(0);

    const quality = scoreResponse(fixture, events);
    expect(quality.total).toBeGreaterThan(0.3);
  }, 180_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// DB persistence — verify message is saved after stream completion
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('DB persistence — message saved after stream', () => {
  it(
    'creates a completed assistant message in DB when sessionId is provided',
    async () => {
      if (!HAS_DB) {
        console.warn('[DB persistence] DATABASE_URL not set — skipping');
        return;
      }

      // All DB imports are local to this test so pg keep-alive timers only
      // start when this test actually runs (OPENAI_API_KEY + DATABASE_URL both set).
      const { Pool } = await import('pg');
      const { drizzle } = await import('drizzle-orm/node-postgres');
      const { eq } = await import('drizzle-orm');
      const schema = await import('../../shared/schema.js');
      const { users, aiChatSessions, aiChatSessionMessages } = schema;

      const testPool = new Pool({ connectionString: process.env.DATABASE_URL!, max: 2 });
      const testDb = drizzle({ client: testPool });

      const testUserId = `e2e-persist-test-${Date.now()}`;
      const testToken = mintTestToken('public', testUserId);

      try {
        // Seed user and session directly in the real DB
        await testDb
          .insert(users)
          .values({
            id: testUserId,
            email: `${testUserId}@e2e.test`,
            role: 'public',
            isActive: true,
          })
          .onConflictDoNothing();

        const [session] = await testDb
          .insert(aiChatSessions)
          .values({ userId: testUserId, title: 'E2E Persist Test', isPinned: false })
          .returning();

        // Run the stream with real auth so the route resolves userId and creates a placeholder
        const { events } = await callStream('stainless steel M6 bolts DIN 933', {
          sessionId: session.id,
          token: testToken,
        });

        // Stream must complete successfully
        const resultEvent = events.find((e) => e.type === 'result');
        expect(resultEvent).toBeDefined();

        // Placeholder message ID is emitted as an early stream event
        const placeholderEvent = events.find((e) => e.type === 'message_placeholder');
        expect(placeholderEvent).toBeDefined();

        if (placeholderEvent) {
          const payload = placeholderEvent.payload as { messageId?: number } | undefined;
          const messageId = payload?.messageId;
          expect(typeof messageId).toBe('number');

          if (typeof messageId === 'number') {
            // Verify the message row is persisted in DB with completed status
            const [savedMessage] = await testDb
              .select()
              .from(aiChatSessionMessages)
              .where(eq(aiChatSessionMessages.id, messageId))
              .limit(1);

            expect(savedMessage).toBeDefined();
            expect(savedMessage.sessionId).toBe(session.id);
            expect(savedMessage.isUser).toBe(false);
            expect(savedMessage.status).toBe('complete');
          }
        }

        // Cleanup session data
        await testDb
          .delete(aiChatSessionMessages)
          .where(eq(aiChatSessionMessages.sessionId, session.id));
        await testDb
          .delete(aiChatSessions)
          .where(eq(aiChatSessions.id, session.id));
      } finally {
        // Always clean up the user row and close the local pool
        await testDb.delete(users).where(eq(users.id, testUserId));
        await testPool.end();
      }
    },
    180_000,
  );
});
