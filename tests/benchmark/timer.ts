/**
 * Stage timer utility for the DeepSearch benchmark runner.
 *
 * Pure test-side helper — never touches production code.
 * Wraps any async function, measures wall-clock duration, and extracts
 * OpenAI usage metadata when the result exposes a _usage field.
 */

/** Shape of the _usage field attached to classifier / discovery results */
interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  duration_ms?: number;
}

/** Any value that may carry an optional _usage field */
interface WithUsage {
  _usage?: UsageInfo;
}

export interface TimedResult<T> {
  result: T;
  durationMs: number;
  tokens: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
}

function hasUsage(value: unknown): value is WithUsage {
  if (value === null || typeof value !== 'object') return false;
  const u = (value as WithUsage)._usage;
  return u !== undefined && typeof u === 'object' && u !== null;
}

/**
 * Execute `fn`, measure how long it takes, and return result + timing.
 *
 * If the returned value has a `_usage` property with token counts, those
 * are extracted and included in the timing result.
 */
export async function timed<T>(fn: () => Promise<T>): Promise<TimedResult<T>> {
  const start = Date.now();
  const result = await fn();
  const durationMs = Date.now() - start;

  let tokens: TimedResult<T>['tokens'] = null;
  if (hasUsage(result) && result._usage) {
    const u = result._usage;
    if (typeof u.total_tokens === 'number') {
      tokens = {
        prompt_tokens: u.prompt_tokens ?? 0,
        completion_tokens: u.completion_tokens ?? 0,
        total_tokens: u.total_tokens,
      };
    }
  }

  return { result, durationMs, tokens };
}
