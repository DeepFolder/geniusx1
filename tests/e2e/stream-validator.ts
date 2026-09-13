/**
 * Streaming shape validator for the DeepSearch NDJSON stream.
 *
 * Validates the invariants the pipeline must uphold for every query:
 *   1. At least one `status` event arrives BEFORE the first `token` event.
 *   2. The stream contains at least one `token` event.
 *   3. The stream closes with a `result` event as the terminal event
 *      (it must be the last event, and no error events may be present).
 *   4. For product queries, the `result` event has non-empty data.
 *
 * Reusable across E2E tests and the benchmark runner.
 */

export interface StreamEvent {
  type: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  stats: {
    totalEvents: number;
    statusCount: number;
    tokenCount: number;
    productCardCount: number;
    hasResult: boolean;
    hasError: boolean;
    firstTokenIndex: number | null;
    firstStatusIndex: number | null;
    lastEventType: string | null;
  };
}

/**
 * Parse a raw NDJSON buffer into an array of typed events.
 * Lines that fail JSON.parse are silently skipped.
 */
export function parseNdjson(rawBody: string): StreamEvent[] {
  return rawBody
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as StreamEvent];
      } catch {
        return [];
      }
    });
}

/**
 * Validate the event sequence from a DeepSearch NDJSON stream.
 *
 * @param events             Parsed event objects from the stream
 * @param expectsProductCards  Whether this fixture expects product cards in the result
 */
export function validateStreamShape(
  events: StreamEvent[],
  expectsProductCards: boolean,
): ValidationResult {
  const errors: string[] = [];

  let statusCount = 0;
  let tokenCount = 0;
  let productCardCount = 0;
  let hasResult = false;
  let hasError = false;
  let firstTokenIndex: number | null = null;
  let firstStatusIndex: number | null = null;
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const lastEventType = lastEvent?.type ?? null;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    switch (ev.type) {
      case 'status':
        statusCount++;
        if (firstStatusIndex === null) {
          firstStatusIndex = i;
        }
        break;
      case 'token':
        tokenCount++;
        if (firstTokenIndex === null) {
          firstTokenIndex = i;
        }
        break;
      case 'product_card':
        productCardCount++;
        break;
      case 'result':
        hasResult = true;
        break;
      case 'error':
        hasError = true;
        break;
    }
  }

  // Rule 1: at least one status event must arrive BEFORE the first token event.
  // This means firstStatusIndex must exist and be strictly less than firstTokenIndex.
  if (tokenCount > 0) {
    const hasStatusBeforeFirstToken =
      firstStatusIndex !== null &&
      firstTokenIndex !== null &&
      firstStatusIndex < firstTokenIndex;

    if (!hasStatusBeforeFirstToken) {
      errors.push('No status event arrived before the first token event');
    }
  }

  // Rule 2: at least one token event
  if (tokenCount === 0) {
    errors.push('Stream produced no token events');
  }

  // Rule 3a: no error events — their presence means the pipeline failed
  if (hasError) {
    errors.push('Stream contained an error event — pipeline failure');
  }

  // Rule 3b: stream must close with a result event as the TERMINAL event
  if (!hasResult) {
    errors.push('Stream did not contain a result event');
  }
  if (lastEventType !== 'result') {
    errors.push(
      `Stream did not terminate with a result event (last event was "${lastEventType}")`,
    );
  }

  // Rule 4: for product queries, result data must be non-empty
  if (expectsProductCards && hasResult) {
    const resultEvent = events.find((e) => e.type === 'result');
    const data = resultEvent?.data as Record<string, unknown> | undefined;
    if (!data || Object.keys(data).length === 0) {
      errors.push('result event data is empty for a product query');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      totalEvents: events.length,
      statusCount,
      tokenCount,
      productCardCount,
      hasResult,
      hasError,
      firstTokenIndex,
      firstStatusIndex,
      lastEventType,
    },
  };
}
