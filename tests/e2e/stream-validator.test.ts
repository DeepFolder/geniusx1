/**
 * Unit tests for the stream shape validator.
 *
 * Lives in tests/e2e/ so it runs under vitest.e2e.config.ts (no server mocks).
 * Like all e2e tests, the entire suite is gated on OPENAI_API_KEY so that
 * `npm run test:e2e` exits with all tests skipped when the key is absent.
 *
 * These are pure in-memory unit tests — no network or LLM calls are made.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { parseNdjson, validateStreamShape, type StreamEvent } from './stream-validator.js';

const HAS_API_KEY = Boolean(process.env.OPENAI_API_KEY);
const maybeDescribe = HAS_API_KEY ? describe : describe.skip;

// ─────────────────────────────────────────────────────────────────────────────
// parseNdjson
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('parseNdjson', () => {
  it('parses valid NDJSON lines', () => {
    const raw =
      '{"type":"status","message":"thinking"}\n{"type":"token","delta":"hello"}\n{"type":"result","data":{}}\n';
    const events = parseNdjson(raw);
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe('status');
    expect(events[1].type).toBe('token');
    expect(events[2].type).toBe('result');
  });

  it('silently skips invalid JSON lines', () => {
    const raw = '{"type":"status"}\nNOT_JSON\n{"type":"result","data":{}}\n';
    const events = parseNdjson(raw);
    expect(events).toHaveLength(2);
  });

  it('ignores blank lines', () => {
    const raw = '\n\n{"type":"token","delta":"x"}\n\n';
    const events = parseNdjson(raw);
    expect(events).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateStreamShape — valid sequences
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('validateStreamShape — valid sequences', () => {
  function makeValidEvents(extras: StreamEvent[] = []): StreamEvent[] {
    return [
      { type: 'status', message: 'Thinking...' },
      { type: 'token', delta: 'Hello' },
      { type: 'token', delta: ' world' },
      ...extras,
      { type: 'result', data: { summary: 'done' } },
    ];
  }

  it('accepts a well-formed sequence', () => {
    const result = validateStreamShape(makeValidEvents(), false);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts sequence with product cards', () => {
    const events = makeValidEvents([{ type: 'product_card', index: 0, data: { product_name: 'Bolt A' } }]);
    const result = validateStreamShape(events, true);
    expect(result.valid).toBe(true);
    expect(result.stats.productCardCount).toBe(1);
  });

  it('accepts multiple status events before first token', () => {
    const events: StreamEvent[] = [
      { type: 'status', message: 'S1' },
      { type: 'status', message: 'S2' },
      { type: 'token', delta: 'x' },
      { type: 'result', data: { ok: true } },
    ];
    const result = validateStreamShape(events, false);
    expect(result.valid).toBe(true);
  });

  it('stats: firstStatusIndex is index 0 when status comes first', () => {
    const events = makeValidEvents();
    const result = validateStreamShape(events, false);
    expect(result.stats.firstStatusIndex).toBe(0);
    expect(result.stats.firstTokenIndex).toBe(1);
    expect(result.stats.lastEventType).toBe('result');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateStreamShape — invariant 1: status BEFORE first token
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('validateStreamShape — invariant 1: status before token', () => {
  it('fails when token arrives with no prior status event', () => {
    const events: StreamEvent[] = [
      { type: 'token', delta: 'x' },
      { type: 'status', message: 'late' },
      { type: 'result', data: {} },
    ];
    const result = validateStreamShape(events, false);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('No status event arrived before'))).toBe(true);
  });

  it('fails when status arrives AFTER the first token', () => {
    const events: StreamEvent[] = [
      { type: 'token', delta: 'x' },
      { type: 'status', message: 'late' },
      { type: 'result', data: {} },
    ];
    const result = validateStreamShape(events, false);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('passes when status is at index 0 and token is at index 1', () => {
    const events: StreamEvent[] = [
      { type: 'status', message: 'ok' },
      { type: 'token', delta: 'x' },
      { type: 'result', data: {} },
    ];
    const result = validateStreamShape(events, false);
    expect(result.valid).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateStreamShape — invariant 2: at least one token
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('validateStreamShape — invariant 2: at least one token', () => {
  it('fails when no token events are present', () => {
    const events: StreamEvent[] = [
      { type: 'status', message: 'thinking' },
      { type: 'result', data: {} },
    ];
    const result = validateStreamShape(events, false);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('no token events'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateStreamShape — invariant 3: result as TERMINAL event
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('validateStreamShape — invariant 3: result must be the terminal event', () => {
  it('fails when result event is missing entirely', () => {
    const events: StreamEvent[] = [
      { type: 'status', message: 'thinking' },
      { type: 'token', delta: 'x' },
    ];
    const result = validateStreamShape(events, false);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('result event'))).toBe(true);
  });

  it('fails when result is present but is NOT the last event', () => {
    const events: StreamEvent[] = [
      { type: 'status', message: 'thinking' },
      { type: 'token', delta: 'x' },
      { type: 'result', data: {} },
      { type: 'status', message: 'trailing status after result' },
    ];
    const result = validateStreamShape(events, false);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('did not terminate with a result event')),
    ).toBe(true);
  });

  it('fails when a token follows the result event', () => {
    const events: StreamEvent[] = [
      { type: 'status', message: 'thinking' },
      { type: 'token', delta: 'x' },
      { type: 'result', data: {} },
      { type: 'token', delta: 'stray' },
    ];
    const result = validateStreamShape(events, false);
    expect(result.valid).toBe(false);
    expect(result.stats.lastEventType).toBe('token');
  });

  it('fails when stream contains an error event', () => {
    const events: StreamEvent[] = [
      { type: 'status', message: 'thinking' },
      { type: 'error', error: 'something went wrong' },
      { type: 'result', data: {} },
    ];
    const result = validateStreamShape(events, false);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('error event'))).toBe(true);
  });

  it('correctly identifies lastEventType', () => {
    const events: StreamEvent[] = [
      { type: 'status', message: 'ok' },
      { type: 'token', delta: 'x' },
      { type: 'result', data: { x: 1 } },
    ];
    const r = validateStreamShape(events, false);
    expect(r.stats.lastEventType).toBe('result');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateStreamShape — invariant 4: product query result has non-empty data
// ─────────────────────────────────────────────────────────────────────────────
maybeDescribe('validateStreamShape — invariant 4: non-empty result data for product queries', () => {
  it('fails when expectsProductCards and result data is empty object', () => {
    const events: StreamEvent[] = [
      { type: 'status', message: 'ok' },
      { type: 'token', delta: 'x' },
      { type: 'result', data: {} },
    ];
    const result = validateStreamShape(events, true);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('result event data is empty'))).toBe(true);
  });

  it('passes when expectsProductCards and result data is non-empty', () => {
    const events: StreamEvent[] = [
      { type: 'status', message: 'ok' },
      { type: 'token', delta: 'x' },
      { type: 'result', data: { product_cards: [{ name: 'Bolt A' }] } },
    ];
    const result = validateStreamShape(events, true);
    expect(result.valid).toBe(true);
  });

  it('passes when expectsProductCards is false even if result data is empty', () => {
    const events: StreamEvent[] = [
      { type: 'status', message: 'ok' },
      { type: 'token', delta: 'x' },
      { type: 'result', data: {} },
    ];
    const result = validateStreamShape(events, false);
    expect(result.valid).toBe(true);
  });
});
