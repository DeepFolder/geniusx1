/**
 * Canonical unit pipeline — shared between server and client.
 *
 * One source of truth that converts every variant the agent emits
 * (Nm / N·m / N\cdot m / N\\cdot m / \text{N}·\text{m} / m/s^{2} / m/s² …)
 * into a single Unicode form for display.
 *
 * Three concerns kept strictly separate:
 *   1. numeric values   — never touched here
 *   2. units            — canonicalized here for DISPLAY
 *   3. math expressions — handled by normalizeMathString in agent-search.ts
 *
 * Display vs matching: callers that need to compare units against
 * datasheet text should keep the original raw string alongside the
 * canonical one (`unit_raw`). This module is for display.
 *
 * Pure TypeScript — zero Node.js dependencies, safe to import in the browser.
 */

const SUP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻',
};

const SUB: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
};

// ASCII digit form of any incoming Unicode super/sub character.
// Used to detect already-canonical inputs and to normalize them idempotently.
const FROM_SUP: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-',
};
const FROM_SUB: Record<string, string> = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
};

// Small explicit allowlist of "two SI symbols glued together" that should
// be rewritten with a middle dot. Keep tiny and explicit — anything not on
// the list passes through unchanged so legitimate units like "mm", "cm",
// "kg", "Hz", "Pa" are never mangled into "m·m", "k·g", etc.
const COMPOUND_GLUED: Record<string, string> = {
  Nm: 'N·m',
  Nms: 'N·m·s',
  Pas: 'Pa·s',
  Wh: 'W·h',
  Vs: 'V·s',
  Am: 'A·m',
  kgm: 'kg·m',
  kgms: 'kg·m/s',
};

// Units that have a canonical casing.
const CASING: Record<string, string> = {
  rpm: 'RPM',
  RPM: 'RPM',
  hz: 'Hz',
  HZ: 'Hz',
  Hz: 'Hz',
  khz: 'kHz',
  KHz: 'kHz',
  KHZ: 'kHz',
  mhz: 'MHz',
  MHZ: 'MHz',
  ghz: 'GHz',
  GHZ: 'GHz',
};

// AI-generated worksheets commonly spell a pure ratio as "dimensionless".
// Treat it exactly like the existing empty/`1` representation, while keeping
// unfamiliar physical units reviewable rather than silently guessing.
const EMPTY_TOKENS = new Set([
  '', '-', '–', '—', 'none', 'None', 'null', 'NULL', 'n/a', 'N/A', '1',
  'dimensionless', 'Dimensionless', 'DIMENSIONLESS', 'unitless', 'Unitless', 'UNITLESS',
]);

/**
 * Canonicalize a single unit string into its display form.
 *
 * Examples:
 *   canonicalUnit('Nm')             → 'N·m'
 *   canonicalUnit('N\\cdot m')      → 'N·m'
 *   canonicalUnit('m/s^{2}')        → 'm/s²'
 *   canonicalUnit('kg/m^3')         → 'kg/m³'
 *   canonicalUnit('\\text{N}')      → 'N'
 *   canonicalUnit('degC')           → '°C'
 *   canonicalUnit('um')             → 'µm'
 *   canonicalUnit('ohm')            → 'Ω'
 *   canonicalUnit('')               → ''
 *
 * Idempotent — running it on its own output returns the same string.
 */
export function canonicalUnit(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  let s = String(raw).trim();
  if (!s) return '';

  // Step 1: collapse double-escaped backslashes so JSON-encoded payloads
  // like "N\\cdot m" become "N\cdot m" before LaTeX command processing.
  s = s.replace(/\\\\/g, '\\');

  // Step 1b: strip math delimiters and LaTeX whitespace commands.
  s = s.replace(/\\\(|\\\)|\\\[|\\\]/g, '');
  s = s.replace(/\\,|\\;|\\:|\\!/g, ' ');
  s = s.replace(/\\\s/g, ' ');

  // Step 2: unwrap any \text{...} segments (possibly several in a row).
  s = s.replace(/\\text\{([^}]*)\}/g, '$1');
  s = s.replace(/\\mathrm\{([^}]*)\}/g, '$1');

  // Step 3: replace LaTeX commands with Unicode glyphs.
  // Order matters — multi-letter commands first so e.g. \Omega is matched
  // before \O is even considered.
  s = s.replace(/\\Omega\b/g, 'Ω');
  s = s.replace(/\\omega\b/g, 'ω');
  s = s.replace(/\\Delta\b/g, 'Δ');
  s = s.replace(/\\delta\b/g, 'δ');
  s = s.replace(/\\alpha\b/g, 'α');
  s = s.replace(/\\beta\b/g, 'β');
  s = s.replace(/\\gamma\b/g, 'γ');
  s = s.replace(/\\theta\b/g, 'θ');
  s = s.replace(/\\rho\b/g, 'ρ');
  s = s.replace(/\\eta\b/g, 'η');
  s = s.replace(/\\tau\b/g, 'τ');
  s = s.replace(/\\pi\b/g, 'π');
  s = s.replace(/\\mu\b/g, 'µ');
  s = s.replace(/\\circ\s*|\\degree\s*/g, '°');
  // \cdot and \times can be followed directly by another LaTeX command
  // (e.g. "\cdot\text{m}") with no intervening word boundary, so we must
  // not anchor on \b. Strip surrounding whitespace too — middle-dot
  // shouldn't carry padding.
  s = s.replace(/\s*\\cdot\s*/g, '·');
  s = s.replace(/\s*\\times\s*/g, '·');
  s = s.replace(/\\%/g, '%');

  // Step 3b: glue Greek/degree prefixes that LaTeX commands left whitespace
  // around (e.g. "\mu m" → "µ m" → "µm", "\degree C" → "° C" → "°C",
  // "\Delta p" → "Δ p" → "Δp").
  s = s.replace(/([µ°ΩωΔδαβγθρητπ])\s+([A-Za-z])/g, '$1$2');

  // Step 4: superscript/subscript LaTeX → Unicode.
  s = s.replace(/\^\{([^}]+)\}/g, (_m, g) => mapChars(g, SUP, '^'));
  s = s.replace(/_\{([^}]+)\}/g, (_m, g) => mapChars(g, SUB, '_'));
  s = s.replace(/\^([0-9+\-])/g, (_m, c) => SUP[c] ?? `^${c}`);
  s = s.replace(/_([0-9])/g, (_m, c) => SUB[c] ?? `_${c}`);

  // Step 5: drop any remaining backslash commands (best effort).
  s = s.replace(/\\([a-zA-Z]+)\s*/g, '$1');

  // Step 6: collapse whitespace before token-level rewrites.
  s = s.replace(/\s+/g, ' ').trim();
  if (!s || EMPTY_TOKENS.has(s)) return '';

  // Step 7: ASCII spellings → Unicode where unambiguous.
  s = s.replace(/\bdeg\s*C\b/g, '°C');
  s = s.replace(/\bdeg\s*F\b/g, '°F');
  s = s.replace(/\bdeg\s*K\b/g, 'K');
  // Bearing catalogues conventionally quote ISO 281 rating life in millions
  // of revolutions. Keep one compact, parseable display spelling.
  s = s.replace(/\b(?:million\s+(?:revolutions?|revs?)|10(?:\^?6|⁶)\s*(?:revolutions?|revs?))\b/gi, 'Mrev');
  s = s.replace(/\bdegrees?\b/gi, '°');
  // 'um' (micrometer) but only when standalone or before another unit token,
  // never inside words like 'aluminum'.
  s = s.replace(/(^|[\s/(·])um(\b|[0-9²³])/g, '$1µm$2');
  s = s.replace(/(^|[\s/(·])uF(\b|[0-9²³])/g, '$1µF$2');
  s = s.replace(/(^|[\s/(·])uA(\b|[0-9²³])/g, '$1µA$2');
  s = s.replace(/(^|[\s/(·])uV(\b|[0-9²³])/g, '$1µV$2');
  s = s.replace(/(^|[\s/(·])us(\b|[0-9²³])/g, '$1µs$2');
  s = s.replace(/\b[oO]hm(s)?\b/g, 'Ω');

  // Step 8: ASCII exponent forms after a unit letter → Unicode super.
  // 'm/s2' → 'm/s²', 'kg/m3' → 'kg/m³', but only when the digit follows a letter.
  s = s.replace(/([A-Za-zµΩ°])([23])\b/g, (_m, head, d) => head + (SUP[d] ?? d));

  // Step 9: replace ASCII period between two unit symbols with middle dot
  // (for "N.m" style). Only when both halves look like unit symbols.
  s = s.replace(/([A-Za-zµΩ°])\.([A-Za-zµΩ°])/g, '$1·$2');

  // Step 10: glued compound units → middle-dot form, via tiny allowlist.
  for (const [glued, expanded] of Object.entries(COMPOUND_GLUED)) {
    const re = new RegExp(`(^|[\\s/(·])${glued}(?=[\\s/)·²³⁻⁺]|$)`, 'g');
    s = s.replace(re, `$1${expanded}`);
  }

  // Step 11: canonical casing (RPM, Hz, kHz, MHz).
  const cased = CASING[s];
  if (cased) s = cased;

  // Step 12: final whitespace collapse and trim.
  s = s.replace(/\s+/g, ' ').trim();
  if (!s || EMPTY_TOKENS.has(s)) return '';

  return s;
}

/**
 * Split a "<value> <unit>" or "\( <value> \text{ <unit> } \)" blob into
 * a numeric value and a canonical unit. Falls back to keeping the whole
 * string in `value` when it can't make a clean split (e.g. embedded
 * formulas with `=` or `×`).
 */
export function splitValueAndUnit(raw: unknown): { value: string; unit: string } {
  if (raw === null || raw === undefined) return { value: '', unit: '' };
  let s = String(raw).trim();
  if (!s) return { value: '', unit: '' };

  // Strip simple math delimiters but DO NOT canonicalize the whole thing yet —
  // we want to find the "<num> <text-or-unit>" split first.
  s = s.replace(/^\\\(\s*|\s*\\\)$/g, '').replace(/^\\\[\s*|\s*\\\]$/g, '').trim();

  // If the blob still looks like a formula with an operator, leave it alone.
  if (/[=×\u00d7\u2248≈]/.test(s)) {
    return { value: s, unit: '' };
  }

  // Pattern 1: "234.5 \text{ N }" or "234.5 \text{N}"
  let m = s.match(/^(-?[\d.,]+(?:e[+\-]?\d+)?)\s*\\text\{\s*([^}]+?)\s*\}\s*$/i);
  if (m) {
    return { value: m[1].trim(), unit: canonicalUnit(m[2]) };
  }

  // Pattern 2: "234.5 N", "234.5 m/s", "234.5N", "234.5 kg/m^3", "500 N\cdot m"
  // Capture everything after the leading number as the unit candidate; let
  // canonicalUnit do the cleanup. The candidate must start with a unit-like
  // character (letter, Greek, %, °, \) — never a digit — to avoid splitting
  // bare numbers like "1500" into "150" + "0".
  m = s.match(/^(-?[\d.,]+(?:e[+\-]?\d+)?)\s*([A-Za-z\u00b5\u03bc\u03a9\u00b0%\\(].*?)\s*$/);
  if (m && !/[=+×÷]/.test(m[2])) {
    const unit = canonicalUnit(m[2]);
    if (unit) {
      return { value: m[1].trim(), unit };
    }
  }

  return { value: s, unit: '' };
}

/**
 * Canonicalize unit tokens that appear inside a free-form cell string
 * (e.g. BOM `spec` columns, comparison-table values). Replaces simple
 * "<number> <unit>" tail patterns with their canonical form, leaves
 * everything else alone. Never rewrites prose.
 *
 *   "M5 bolt, 10 Nm torque" → "M5 bolt, 10 N·m torque"
 *   "30 kN push, 25 mm/s"   → "30 kN push, 25 mm/s"  (already canonical)
 *   "M5"                     → "M5" (no number+unit pattern)
 */
export function canonicalizeUnitTokensInCell(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const s = String(raw);
  if (!s) return '';

  // Replace LaTeX command tokens that may appear inline (e.g. "\cdot",
  // "\text{N}") so spec strings copied from a calc context render cleanly.
  let out = s;
  out = out.replace(/\\\\/g, '\\');
  out = out.replace(/\\text\{([^}]*)\}/g, '$1');
  out = out.replace(/\s*\\cdot\s*/g, '·');
  out = out.replace(/\s*\\times\s*/g, '×');

  // For each "<number><whitespace><unit-token>" tail run canonicalUnit on
  // the unit token only. Unit tokens start with a letter / Greek / %.
  out = out.replace(
    /(-?\d+(?:[.,]\d+)?(?:e[+\-]?\d+)?)\s+([A-Za-z\u00b5\u03bc\u03a9\u00b0%][A-Za-z0-9\/\^\{\}\u00b2\u00b3\u00b7.\-·²³⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]*)/g,
    (_m, num, unit) => {
      const c = canonicalUnit(unit);
      return c ? `${num} ${c}` : `${num} ${unit}`;
    }
  );
  return out;
}

/**
 * Lightweight, log-only validator used by Task C. Stays here so the test
 * suite covers it together with the canonicalizer. Never throws, never
 * mutates — just returns a list of human-readable warnings.
 */
export function validateUnit(raw: unknown): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (raw === null || raw === undefined) return { ok: true, warnings };
  const s = String(raw);
  if (!s) return { ok: true, warnings };

  if (/\\[a-zA-Z]/.test(s)) {
    warnings.push(`raw LaTeX command in unit field: ${truncate(s)}`);
  } else if (/\\/.test(s)) {
    // Catches stray backslashes (e.g. `\\` from over-escaped JSON) that
    // didn't form a recognizable LaTeX command.
    warnings.push(`stray backslash in unit field: ${truncate(s)}`);
  }
  if (/^\s*-?[\d.,]+\s+\S/.test(s)) {
    warnings.push(`looks like value+unit not split: ${truncate(s)}`);
  }
  const canon = canonicalUnit(s);
  if (s.trim() && !canon) {
    warnings.push(`canonicalization stripped to empty from: ${truncate(s)}`);
  }
  return { ok: warnings.length === 0, warnings };
}

function mapChars(input: string, table: Record<string, string>, fallbackPrefix: string): string {
  let out = '';
  for (const ch of input) {
    if (table[ch]) {
      out += table[ch];
    } else if (FROM_SUP[ch] || FROM_SUB[ch]) {
      // Already a Unicode super/sub — keep as-is.
      out += ch;
    } else {
      out += `${fallbackPrefix}${ch}`;
    }
  }
  return out;
}

function truncate(s: string, n: number = 60): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
