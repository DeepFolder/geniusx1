export const DEFAULT_GENIUS_DECIMALS = 2;
export const MAX_GENIUS_DECIMALS = 8;

const NUMERIC_VALUE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const DECIMAL_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};

export function normalizeGeniusDecimals(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_GENIUS_DECIMALS;
  return Math.min(MAX_GENIUS_DECIMALS, Math.max(0, Math.trunc(value!)));
}

/**
 * Formats displayed engineering values with no unnecessary trailing zeros.
 * Tiny non-zero values receive only the extra places needed to avoid becoming 0.
 */
export function formatGeniusNumber(
  value: string | number,
  maxDecimals = DEFAULT_GENIUS_DECIMALS,
): string {
  const raw = typeof value === "string" ? value.trim() : String(value);
  if (!NUMERIC_VALUE.test(raw)) return raw;

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return raw;
  if (numeric === 0 || Object.is(numeric, -0)) return "0";

  const decimals = normalizeGeniusDecimals(maxDecimals);
  const rounded = Number(numeric.toFixed(decimals));
  if (rounded !== 0) return String(rounded);

  // A strict decimal limit would turn a real, small engineering value into 0.
  // Retain just enough precision for a useful non-zero display.
  const neededDecimals = Math.min(
    12,
    Math.max(decimals, Math.ceil(-Math.log10(Math.abs(numeric))) + 2),
  );
  const smallRounded = Number(numeric.toFixed(neededDecimals));
  if (smallRounded !== 0) return String(smallRounded);

  return numeric
    .toExponential(2)
    .replace(/\.?0+e/i, "e")
    .replace(/e\+/, "e");
}

/**
 * Detects an explicit display-precision request in a user message.
 * "More decimals" without a number advances by two places, to at least four.
 */
export function requestedGeniusDecimals(
  text: string,
  current = DEFAULT_GENIUS_DECIMALS,
): number | undefined {
  const normalized = text.toLowerCase();
  const explicit = normalized.match(
    /\b(\d+|zero|one|two|three|four|five|six|seven|eight)\s+(?:decimal(?:\s+places?)?|decimals?|digits?\s+after\s+the\s+decimal(?:\s+point)?)\b/,
  );
  if (explicit) {
    const parsed = /^\d+$/.test(explicit[1])
      ? Number(explicit[1])
      : DECIMAL_WORDS[explicit[1]];
    return normalizeGeniusDecimals(parsed);
  }

  if (/\b(?:default|standard)\s+(?:decimal(?:s|\s+places?)?|precision)\b/.test(normalized)) {
    return DEFAULT_GENIUS_DECIMALS;
  }

  if (/\b(?:more|extra|additional)\s+(?:decimal(?:s|\s+places?)?|precision)\b/.test(normalized)) {
    return normalizeGeniusDecimals(Math.max(4, current + 2));
  }

  return undefined;
}