import type { GeniusCalculationDoc } from "../../shared/schema.js";
import { canonicalUnit } from "../../shared/unit-canonical.js";
import {
  DEFAULT_GENIUS_DECIMALS,
  formatGeniusNumber,
  normalizeGeniusDecimals,
} from "../../shared/genius-number-format.js";

// ---------------------------------------------------------------------------
// Safe, dependency-free math expression evaluator.
// Supports: + - * / % ^, unary minus, parentheses, function calls, constants.
// Only whitelisted identifiers (scope variables) and functions are allowed —
// there is no access to JS globals, so this cannot execute arbitrary code.
// ---------------------------------------------------------------------------

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "lp" }
  | { t: "rp" }
  | { t: "comma" };

const FUNCS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  ln: Math.log,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  pow: Math.pow,
  min: Math.min,
  max: Math.max,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sign: Math.sign,
  // Every scoped angle is canonical radians before evaluation, so these
  // authoring helpers are intentionally identities at evaluation time.
  deg2rad: (angle: number) => angle,
  rad2deg: (angle: number) => angle,
};

const CONSTS: Record<string, number> = {
  pi: Math.PI,
  PI: Math.PI,
  e: Math.E,
  E: Math.E,
};

// ---------------------------------------------------------------------------
// Small, deterministic dimensional-unit engine. Values are represented in SI
// base units while dimensions use compact exponent vectors. This deliberately
// has a finite vocabulary: unfamiliar engineering units are reviewable rather
// than guessed at.
// ---------------------------------------------------------------------------

type Dimensions = Record<string, number>;
type ParsedUnit = { known: true; scale: number; dimensions: Dimensions; offset?: number } | { known: false; reason: string };
type DimValue = { dimensions: Dimensions; unknown?: string };
type RotationalRateKind = "angular" | "cyclic";

const DIM_KEYS = ["L", "M", "T", "I", "K", "N", "J", "A"] as const;
const DIMLESS: Dimensions = {};
const dimension = (parts: Dimensions): Dimensions =>
  Object.fromEntries(Object.entries(parts).filter(([, exponent]) => exponent !== 0));
const sameDimensions = (a: Dimensions, b: Dimensions) =>
  DIM_KEYS.every((key) => (a[key] ?? 0) === (b[key] ?? 0));
const combineDimensions = (a: Dimensions, b: Dimensions, sign = 1) => {
  const combined: Dimensions = { ...a };
  for (const [key, exponent] of Object.entries(b)) combined[key] = (combined[key] ?? 0) + sign * exponent;
  return dimension(combined);
};
const powerDimensions = (value: Dimensions, exponent: number) =>
  dimension(Object.fromEntries(Object.entries(value).map(([key, power]) => [key, power * exponent])));
const familyName = (value: Dimensions) => {
  const exponent = (key: string) => value[key] ?? 0;
  const known = [
    ["dimensionless", DIMLESS], ["length", { L: 1 }], ["mass", { M: 1 }], ["time", { T: 1 }],
    ["electric current", { I: 1 }], ["temperature", { K: 1 }], ["amount of substance", { N: 1 }],
    ["luminous intensity", { J: 1 }], ["angle", { A: 1 }], ["speed", { L: 1, T: -1 }],
    ["acceleration", { L: 1, T: -2 }], ["force", { M: 1, L: 1, T: -2 }],
    ["pressure", { M: 1, L: -1, T: -2 }], ["energy", { M: 1, L: 2, T: -2 }],
    ["power", { M: 1, L: 2, T: -3 }],
  ] as Array<[string, Dimensions]>;
  const match = known.find(([, candidate]) => sameDimensions(value, candidate));
  if (match) return match[0];
  const key = Object.entries(value).map(([key, value]) => `${key}:${value}`).join(",");
  return `dimensions (${key || "dimensionless"})`;
};

const UNIT_BASES: Record<string, { scale: number; dimensions: Dimensions; offset?: number }> = {
  "": { scale: 1, dimensions: DIMLESS }, "1": { scale: 1, dimensions: DIMLESS }, "%": { scale: 0.01, dimensions: DIMLESS },
  m: { scale: 1, dimensions: { L: 1 } }, s: { scale: 1, dimensions: { T: 1 } }, g: { scale: 1e-3, dimensions: { M: 1 } },
  kg: { scale: 1, dimensions: { M: 1 } }, A: { scale: 1, dimensions: { I: 1 } }, K: { scale: 1, dimensions: { K: 1 } },
  mol: { scale: 1, dimensions: { N: 1 } }, cd: { scale: 1, dimensions: { J: 1 } },
  // Radians are dimensionless in SI dimensional analysis. Retaining a
  // separate angle dimension here would make the picker’s RPM → rad/s
  // conversion incompatible with torque × angular speed → power.
  rad: { scale: 1, dimensions: DIMLESS }, deg: { scale: Math.PI / 180, dimensions: DIMLESS }, "°": { scale: Math.PI / 180, dimensions: DIMLESS },
  Hz: { scale: 1, dimensions: { T: -1 } }, N: { scale: 1, dimensions: { M: 1, L: 1, T: -2 } },
  Pa: { scale: 1, dimensions: { M: 1, L: -1, T: -2 } }, J: { scale: 1, dimensions: { M: 1, L: 2, T: -2 } },
  W: { scale: 1, dimensions: { M: 1, L: 2, T: -3 } }, C: { scale: 1, dimensions: { I: 1, T: 1 } },
  V: { scale: 1, dimensions: { M: 1, L: 2, T: -3, I: -1 } }, Ω: { scale: 1, dimensions: { M: 1, L: 2, T: -3, I: -2 } },
  ohm: { scale: 1, dimensions: { M: 1, L: 2, T: -3, I: -2 } }, F: { scale: 1, dimensions: { M: -1, L: -2, T: 4, I: 2 } },
  H: { scale: 1, dimensions: { M: 1, L: 2, T: -2, I: -2 } }, T: { scale: 1, dimensions: { M: 1, T: -2, I: -1 } },
  Wb: { scale: 1, dimensions: { M: 1, L: 2, T: -2, I: -1 } }, rev: { scale: 1, dimensions: DIMLESS }, rpm: { scale: (2 * Math.PI) / 60, dimensions: { T: -1 } },
  min: { scale: 60, dimensions: { T: 1 } }, h: { scale: 3600, dimensions: { T: 1 } }, L: { scale: 1e-3, dimensions: { L: 3 } },
  bar: { scale: 1e5, dimensions: { M: 1, L: -1, T: -2 } }, t: { scale: 1e3, dimensions: { M: 1 } },
  RPM: { scale: (2 * Math.PI) / 60, dimensions: { T: -1 } }, kWh: { scale: 3.6e6, dimensions: { M: 1, L: 2, T: -2 } },
  "°C": { scale: 1, offset: 273.15, dimensions: { K: 1 } },
};
const PREFIXES: Array<[string, number]> = [["da", 1e1], ["G", 1e9], ["M", 1e6], ["k", 1e3], ["h", 1e2], ["d", 1e-1], ["c", 1e-2], ["m", 1e-3], ["µ", 1e-6], ["u", 1e-6], ["n", 1e-9], ["p", 1e-12]];
const unitCache = new Map<string, ParsedUnit>();

function parseUnitAtom(atom: string): ParsedUnit {
  const match = atom.match(/^(.+?)(?:\^?([+-]?\d+)|([⁰¹²³⁴⁵⁶⁷⁸⁹]))?$/);
  if (!match) return { known: false, reason: `Unsupported unit "${atom}"` };
  const [, rawName, asciiExponent, superscript] = match;
  const superscriptExponent: Record<string, number> = { "⁰": 0, "¹": 1, "²": 2, "³": 3, "⁴": 4, "⁵": 5, "⁶": 6, "⁷": 7, "⁸": 8, "⁹": 9 };
  const exponent = superscript ? superscriptExponent[superscript] : Number(asciiExponent ?? 1);
  let base = UNIT_BASES[rawName];
  let prefixScale = 1;
  if (!base) {
    const prefix = PREFIXES.find(([candidate]) => rawName.startsWith(candidate) && UNIT_BASES[rawName.slice(candidate.length)]);
    if (prefix) {
      prefixScale = prefix[1];
      base = UNIT_BASES[rawName.slice(prefix[0].length)];
    }
  }
  if (!base || !Number.isInteger(exponent)) return { known: false, reason: `Unknown or unsupported unit "${rawName}"` };
  if (base.offset !== undefined && (exponent !== 1 || prefixScale !== 1)) {
    return { known: false, reason: `Unsupported affine unit expression "${atom}"` };
  }
  return { known: true, scale: (base.scale * prefixScale) ** exponent, dimensions: powerDimensions(base.dimensions, exponent), offset: base.offset };
}

/** Parses supported SI/derived/scaled compound units and caches every spelling. */
export function parseUnit(unit: string | undefined): ParsedUnit {
  const original = canonicalUnit(unit);
  const cached = unitCache.get(original);
  if (cached) return cached;
  if (!original) {
    const dimensionless: ParsedUnit = { known: true, scale: 1, dimensions: DIMLESS };
    unitCache.set(original, dimensionless);
    return dimensionless;
  }
  const normalized = original.replace(/\s+/g, "").replace(/·|⋅|\*/g, ".");
  const sections = normalized.split("/");
  if (sections.length > 2 || sections.some((section) => !section)) {
    const unknown = { known: false as const, reason: `Unsupported unit expression "${original}"` };
    unitCache.set(original, unknown); return unknown;
  }
  let result: ParsedUnit = { known: true, scale: 1, dimensions: DIMLESS };
  for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
    for (const atom of sections[sectionIndex].split(".").filter(Boolean)) {
      const parsed = parseUnitAtom(atom);
      if (!parsed.known) { unitCache.set(original, parsed); return parsed; }
      if (parsed.offset !== undefined && (sections.length !== 1 || sectionIndex !== 0 || normalized.includes("."))) {
        const unknown = { known: false as const, reason: `Unsupported affine unit expression "${original}"` };
        unitCache.set(original, unknown); return unknown;
      }
      result = { known: true, scale: result.scale * (sectionIndex ? 1 / parsed.scale : parsed.scale), dimensions: combineDimensions(result.dimensions, parsed.dimensions, sectionIndex ? -1 : 1), offset: parsed.offset };
    }
  }
  unitCache.set(original, result);
  return result;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input.replace(/\s+/g, "");
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9.eE+\-]/.test(s[j])) {
        // Only consume +/- when part of scientific notation (e.g. 1.5e-3).
        if ((s[j] === "+" || s[j] === "-") && !/[eE]/.test(s[j - 1])) break;
        j++;
      }
      const num = Number(s.slice(i, j));
      if (!Number.isFinite(num)) throw new Error(`Invalid number: ${s.slice(i, j)}`);
      tokens.push({ t: "num", v: num });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
      tokens.push({ t: "id", v: s.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/%^".includes(c)) {
      tokens.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (c === "(") { tokens.push({ t: "lp" }); i++; continue; }
    if (c === ")") { tokens.push({ t: "rp" }); i++; continue; }
    if (c === ",") { tokens.push({ t: "comma" }); i++; continue; }
    throw new Error(`Unexpected character: ${c}`);
  }
  return tokens;
}

// Recursive-descent parser → evaluates directly against a numeric scope.
function makeParser(tokens: Token[], scope: Record<string, number>) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr(): number {
    let left = parseTerm();
    while (peek()?.t === "op" && (peek() as any).v === "+") {
      next(); left = left + parseTerm();
    }
    while (peek()?.t === "op" && ((peek() as any).v === "+" || (peek() as any).v === "-")) {
      const op = (next() as any).v;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (peek()?.t === "op" && ["*", "/", "%"].includes((peek() as any).v)) {
      const op = (next() as any).v;
      const right = parseFactor();
      if (op === "*") left = left * right;
      else if (op === "/") left = left / right;
      else left = left % right;
    }
    return left;
  }

  // Exponent is right-associative and binds tighter than unary minus is handled below.
  function parseFactor(): number {
    const base = parseUnary();
    if (peek()?.t === "op" && (peek() as any).v === "^") {
      next();
      const exp = parseFactor();
      return Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number {
    if (peek()?.t === "op" && (peek() as any).v === "-") { next(); return -parseUnary(); }
    if (peek()?.t === "op" && (peek() as any).v === "+") { next(); return parseUnary(); }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const tok = peek();
    if (!tok) throw new Error("Unexpected end of expression");
    if (tok.t === "num") { next(); return tok.v; }
    if (tok.t === "lp") {
      next();
      const v = parseExpr();
      if (peek()?.t !== "rp") throw new Error("Expected )");
      next();
      return v;
    }
    if (tok.t === "id") {
      next();
      const name = tok.v;
      if (peek()?.t === "lp") {
        next();
        const args: number[] = [];
        if (peek()?.t !== "rp") {
          args.push(parseExpr());
          while (peek()?.t === "comma") { next(); args.push(parseExpr()); }
        }
        if (peek()?.t !== "rp") throw new Error("Expected )");
        next();
        const fn = FUNCS[name];
        if (!fn) throw new Error(`Unknown function: ${name}`);
        return fn(...args);
      }
      if (name in scope) return scope[name];
      if (name in CONSTS) return CONSTS[name];
      throw new Error(`Unknown variable: ${name}`);
    }
    throw new Error(`Unexpected token`);
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error("Unexpected trailing tokens");
  return result;
}

export function evaluateExpr(expr: string, scope: Record<string, number>): number {
  const tokens = tokenize(expr);
  return makeParser(tokens, scope);
}

export function coerceNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/,/g, "").trim();
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function formatNumber(
  n: number,
  maxDecimals = DEFAULT_GENIUS_DECIMALS,
): string {
  if (!Number.isFinite(n)) return String(n);
  return formatGeniusNumber(n, maxDecimals);
}

// ---------------------------------------------------------------------------
// SI prefix auto-scaling — applied to server-recomputed step and headline
// results only. Input/assumption values are never touched (the AI chose them).
// ---------------------------------------------------------------------------

// The set of bare base SI units that are eligible for prefix scaling.
// Compound units (e.g. N·m, m/s²) and already-prefixed units (kN, MPa, mm)
// are intentionally absent — they are left unchanged by applyBestSIPrefix.
const SCALABLE_BASE_UNITS = new Set([
  "N", "Pa", "W", "J", "m", "Hz", "V", "A", "Ω", "g", "s", "mol", "K", "T", "F", "H",
]);

// Ordered from largest to smallest. The first prefix that brings |value| into
// [1, 1000) is selected.
const SI_PREFIXES: Array<{ prefix: string; factor: number }> = [
  { prefix: "G", factor: 1e9 },
  { prefix: "M", factor: 1e6 },
  { prefix: "k", factor: 1e3 },
  { prefix: "",  factor: 1 },
  { prefix: "m", factor: 1e-3 },
  { prefix: "µ", factor: 1e-6 },
  { prefix: "n", factor: 1e-9 },
  { prefix: "p", factor: 1e-12 },
];

/**
 * Format a server-computed numeric value with the most readable SI prefix.
 *
 * Rules:
 *  - Compound units (containing ·, /, or whitespace) are never scaled.
 *  - Only bare base SI units listed in SCALABLE_BASE_UNITS are scaled.
 *  - Already-prefixed units (kN, MPa, mm …) are not in the set → no change.
 *  - Zero and non-finite values fall through to formatNumber unchanged.
 *  - Empty / dimensionless unit → falls through to formatNumber unchanged.
 */
export function applyBestSIPrefix(
  value: number,
  unit: string,
  maxDecimals = DEFAULT_GENIUS_DECIMALS,
): { value: string; unit: string } {
  // Compound units or empty/dimensionless — leave alone.
  if (!unit || /[·/\s]/.test(unit)) {
    return { value: formatNumber(value, maxDecimals), unit };
  }

  // Only scale bare base SI units (already-prefixed units are absent from the set).
  if (!SCALABLE_BASE_UNITS.has(unit)) {
    return { value: formatNumber(value, maxDecimals), unit };
  }

  // Zero or non-finite: no prefix makes sense.
  if (!Number.isFinite(value) || value === 0) {
    return { value: formatNumber(value, maxDecimals), unit };
  }

  const abs = Math.abs(value);
  for (const { prefix, factor } of SI_PREFIXES) {
    const scaled = abs / factor;
    if (scaled >= 1 && scaled < 1000) {
      const scaledValue = value / factor;
      const formatted = formatNumber(scaledValue, maxDecimals);
      return { value: formatted, unit: prefix + unit };
    }
  }

  // Fallback — value is outside the p…G range (e.g. sub-pico).
  return { value: formatNumber(value, maxDecimals), unit };
}

// ---------------------------------------------------------------------------
// Commentary grounding — the AI commentary may only reference numbers that
// already exist in the (recomputed) calculation document(s). Anything else is
// treated as an invented number and the commentary is rejected.
// ---------------------------------------------------------------------------

const NUM_TOKEN_RE = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

export function extractNumericTokens(text: string): number[] {
  const out: number[] = [];
  const cleaned = text.replace(/(\d),(?=\d{3}\b)/g, "$1"); // strip thousands separators
  for (const m of cleaned.match(NUM_TOKEN_RE) ?? []) {
    const n = Number(m);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * Collect only the numeric values that appear in actual calculation fields —
 * inputs, assumptions, step results, outputs, confidence score. Excludes
 * reference IDs, URLs, and other non-calculation JSON tokens that would
 * otherwise inflate the allowed set and weaken the grounding check.
 */
function calcNumbers(doc: GeniusCalculationDoc): number[] {
  const raw: (string | number | undefined)[] = [
    ...doc.inputs.map((v) => v.value),
    ...doc.assumptions.map((v) => v.value),
    ...doc.steps.map((s) => s.result),
    ...doc.results.map((r) => r.value),
    doc.confidence?.score,
  ];
  const out: number[] = [];
  for (const r of raw) {
    if (r == null) continue;
    for (const n of extractNumericTokens(String(r))) out.push(n);
  }
  return out;
}

/**
 * True when every number mentioned in `text` is grounded in one of the given
 * documents. Small integers (|n| <= 10) are always allowed — they show up as
 * counts/ordinals ("2 assumptions", "step 3"). Other numbers must match some
 * calculation value (inputs, steps, results, confidence score) within a 5%
 * relative tolerance (to allow rounded forms of document values).
 */
export function commentaryNumbersAreGrounded(
  text: string,
  docs: GeniusCalculationDoc[],
): boolean {
  const allowed = new Set<number>();
  for (const doc of docs) {
    for (const n of calcNumbers(doc)) allowed.add(n);
  }
  const allowedList = Array.from(allowed);
  for (const n of extractNumericTokens(text)) {
    if (Number.isInteger(n) && Math.abs(n) <= 10) continue;
    const grounded = allowedList.some((a) => {
      const scale = Math.max(Math.abs(a), Math.abs(n), 1e-12);
      return Math.abs(a - n) / scale <= 0.05;
    });
    if (!grounded) return false;
  }
  return true;
}

// Build the numeric scope from inputs + assumptions. New expressions evaluate
// entirely in canonical SI. An input switched by the user after loading a
// legacy expression carries evaluationUnit, so that expression continues to
// receive the equivalent value in the unit convention it was authored for.
function buildScope(doc: GeniusCalculationDoc): Record<string, number> {
  const scope: Record<string, number> = {};
  for (const value of [...doc.inputs, ...doc.assumptions]) {
    const numeric = coerceNumber(value.value);
    if (!value.symbol || numeric === null) continue;
    const displayed = parseUnit(value.unit);
    const evaluation = value.evaluationUnit ? parseUnit(value.evaluationUnit) : undefined;
    const canonicalValue = displayed.known ? numeric * displayed.scale + (displayed.offset ?? 0) : numeric;
    scope[value.symbol] = evaluation?.known
      ? (canonicalValue - (evaluation.offset ?? 0)) / evaluation.scale
      : canonicalValue;
  }
  return scope;
}

function buildRawScope(doc: GeniusCalculationDoc): Record<string, number> {
  const scope: Record<string, number> = {};
  for (const value of [...doc.inputs, ...doc.assumptions]) {
    const numeric = coerceNumber(value.value);
    if (value.symbol && numeric !== null) scope[value.symbol] = numeric;
  }
  return scope;
}

/**
 * Compatibility for calculations generated before dimensional propagation:
 * their authoring instruction explicitly required `mm / 1000`. Preserve that
 * numerical convention only when the expression contains that exact conversion;
 * current expressions operate entirely in canonical SI units.
 */
function applyLegacyScaleConversions(expr: string, scope: Record<string, number>, rawScope: Record<string, number>, doc: GeniusCalculationDoc) {
  for (const value of [...doc.inputs, ...doc.assumptions]) {
    if (!value.symbol || !(value.symbol in rawScope)) continue;
    // The client has already restored this legacy expression's expected unit
    // convention in buildScope; applying the old fallback again would convert
    // the value twice.
    if (value.evaluationUnit) continue;
    const parsed = parseUnit(value.unit);
    if (!parsed.known) continue;
    const escaped = value.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // A widespread older convention converts an input speed from km/h to m/s
    // inside the expression. Restore the implied km/h value from canonical SI
    // even when a previously saved document already shows the input as m/s.
    if (
      sameDimensions(parsed.dimensions, { L: 1, T: -1 })
      && new RegExp(`\\b${escaped}\\b\\s*/\\s*3\\.6\\b`).test(expr)
    ) {
      scope[value.symbol] = scope[value.symbol] * 3.6;
      continue;
    }
    if (!parsed.dimensions.L) continue;
    // Pre-unit-engine expressions used `length / 1000` to turn an explicitly
    // milli-SI value (e.g. mm or mm/s) into SI. Recreate that expected
    // milli-scaled operand from the canonical value, rather than trusting the
    // input's current display unit/value after a picker conversion (e.g.
    // 10 mm → 0.01 m or 150 mm/s → 0.15 m/s).
    if (new RegExp(`\\b${escaped}\\b\\s*\\/\\s*1000\\b`).test(expr)) scope[value.symbol] = scope[value.symbol] / 1e-3;
  }
}

function applyLegacyRotationalTimeConversion(
  expr: string,
  unit: string,
  scope: Record<string, number>,
  doc: GeniusCalculationDoc,
) {
  if (canonicalUnit(unit) !== "h") return;
  for (const value of [...doc.inputs, ...doc.assumptions]) {
    if (!value.symbol || rotationalRateKind(value.unit) !== "angular") continue;
    const escaped = value.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Earlier bearing-life expressions use 60 × RPM to turn revolutions into
    // minutes/hours. Restore the RPM operand from canonical rad/s so the
    // expression's embedded time conversion is applied exactly once.
    if (new RegExp(`(?:\\(?\\s*60\\b\\s*\\*\\s*${escaped}\\b|\\b${escaped}\\b\\s*\\*\\s*60\\b)`).test(expr)) {
      const rpm = parseUnit("RPM");
      if (rpm.known) scope[value.symbol] = scope[value.symbol] / rpm.scale;
    }
  }
}

function usesLegacyInputConvention(expr: string, doc: GeniusCalculationDoc): boolean {
  return [...doc.inputs, ...doc.assumptions].some((value) => {
    if (!value.symbol || !value.evaluationUnit) return false;
    const escaped = value.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(expr);
  });
}

function usesLegacyRpmConversion(expr: string, unit: string): boolean {
  return canonicalUnit(unit) === "RPM" && /(?:\*\s*60\b|60\s*\*)/.test(expr);
}

function usesLegacyHoursConversion(expr: string, unit: string): boolean {
  if (canonicalUnit(unit) !== "h") return false;
  // Expressions that explicitly divide by seconds-per-hour already return an
  // hours display value. This includes `... / 3600`, `... / (3600 * n)`,
  // and the established `... / (60 * RPM)` bearing-life convention.
  return /\/\s*3600\b|\(\s*3600\s*\*|\/\s*\(?\s*60\s*\*/.test(expr);
}

// Both rates are T⁻¹, but their displayed values differ by 2π: rad/s is
// angular rate while Hz is cycles/s. Keep this small semantic hint beside the
// dimensions so picker conversions preserve a correct displayed number.
function rotationalRateKind(unit: string | undefined): RotationalRateKind | undefined {
  const canonical = canonicalUnit(unit);
  if (canonical === "RPM" || canonical === "rad/s") return "angular";
  if (canonical === "Hz" || canonical === "kHz" || canonical === "MHz") return "cyclic";
  return undefined;
}

function convertRotationalRate(value: number, from: RotationalRateKind | undefined, to: RotationalRateKind | undefined): number {
  if (!from || !to || from === to) return value;
  return from === "angular" ? value / (2 * Math.PI) : value * (2 * Math.PI);
}

function buildDimensionScope(doc: GeniusCalculationDoc): Record<string, DimValue> {
  const scope: Record<string, DimValue> = {};
  for (const value of [...doc.inputs, ...doc.assumptions]) {
    if (!value.symbol) continue;
    const parsed = parseUnit(value.unit);
    const numericValue = coerceNumber(value.value);
    scope[value.symbol] = numericValue === null
      ? { dimensions: parsed.known ? parsed.dimensions : DIMLESS, unknown: `Unit review: missing or invalid numeric input "${value.label}" (${value.symbol}).` }
      : parsed.known
      ? { dimensions: parsed.dimensions }
      : { dimensions: DIMLESS, unknown: parsed.reason };
  }
  return scope;
}

function evaluateDimensions(expr: string, scope: Record<string, DimValue>): Dimensions {
  const tokens = tokenize(expr);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const unknown = (value: DimValue) => { if (value.unknown) throw new Error(value.unknown); return value.dimensions; };
  const needSame = (left: Dimensions, right: Dimensions, op: string) => {
    if (!sameDimensions(left, right)) throw new Error(`Unit review: cannot ${op} ${familyName(left)} and ${familyName(right)}`);
    return left;
  };
  const expression = (): Dimensions => {
    let left = term();
    while (peek()?.t === "op" && ["+", "-"].includes((peek() as any).v)) {
      const op = (next() as any).v; left = needSame(left, term(), op === "+" ? "add" : "subtract");
    }
    return left;
  };
  const term = (): Dimensions => {
    let left = factor();
    while (peek()?.t === "op" && ["*", "/", "%"].includes((peek() as any).v)) {
      const op = (next() as any).v; const right = factor();
      if (op === "*") left = combineDimensions(left, right);
      else if (op === "/") left = combineDimensions(left, right, -1);
      else left = needSame(left, right, "take the remainder of");
    }
    return left;
  };
  const factor = (): Dimensions => {
    const left = unary();
    if (peek()?.t === "op" && (peek() as any).v === "^") {
      next();
      const start = pos;
      const exponent = factor();
      if (!sameDimensions(exponent, DIMLESS)) throw new Error("Unit review: exponents must be dimensionless");
      const token = tokens[start];
      if (Object.keys(left).length && (!token || token.t !== "num" || !Number.isInteger(token.v))) {
        throw new Error("Unit review: a dimensional quantity requires an integer literal exponent");
      }
      return powerDimensions(left, token?.t === "num" ? token.v : 1);
    }
    return left;
  };
  const unary = (): Dimensions => {
    if (peek()?.t === "op" && ["+", "-"].includes((peek() as any).v)) { next(); return unary(); }
    return primary();
  };
  const primary = (): Dimensions => {
    const token = peek();
    if (!token) throw new Error("Unexpected end of expression");
    if (token.t === "num") { next(); return DIMLESS; }
    if (token.t === "lp") { next(); const result = expression(); if (peek()?.t !== "rp") throw new Error("Expected )"); next(); return result; }
    if (token.t !== "id") throw new Error("Unexpected token");
    next();
    if (peek()?.t !== "lp") {
      if (token.v in scope) return unknown(scope[token.v]);
      if (token.v in CONSTS) return DIMLESS;
      throw new Error(`Unknown variable: ${token.v}`);
    }
    next(); const args: Dimensions[] = []; const argumentStarts: number[] = [];
    if (peek()?.t !== "rp") {
      argumentStarts.push(pos); args.push(expression());
      while (peek()?.t === "comma") { next(); argumentStarts.push(pos); args.push(expression()); }
    }
    if (peek()?.t !== "rp") throw new Error("Expected )"); next();
    const name = token.v;
    if (!(name in FUNCS)) throw new Error(`Unknown function: ${name}`);
    const allDimensionless = () => args.forEach((value) => { if (!sameDimensions(value, DIMLESS)) throw new Error(`Unit review: ${name} requires dimensionless arguments`); });
    if (["sqrt", "cbrt"].includes(name)) return powerDimensions(args[0] ?? DIMLESS, name === "sqrt" ? 0.5 : 1 / 3);
    if (name === "pow") {
      if (!sameDimensions(args[1] ?? DIMLESS, DIMLESS)) throw new Error("Unit review: pow exponent must be dimensionless");
      // Match the literal belonging to this exact parsed call, not another
      // pow() occurrence elsewhere in the expression.
      const exponentToken = tokens[argumentStarts[1]];
      if (Object.keys(args[0] ?? DIMLESS).length && (!exponentToken || exponentToken.t !== "num" || !Number.isInteger(exponentToken.v))) {
        throw new Error("Unit review: a dimensional quantity requires an integer literal exponent");
      }
      return powerDimensions(args[0] ?? DIMLESS, exponentToken?.t === "num" ? exponentToken.v : 1);
    }
    if (["abs", "round", "floor", "ceil"].includes(name)) return args[0] ?? DIMLESS;
    if (name === "sign") return DIMLESS;
    if (["sin", "cos", "tan"].includes(name)) { allDimensionless(); return DIMLESS; }
    if (["asin", "acos", "atan"].includes(name)) { allDimensionless(); return DIMLESS; }
    if (name === "atan2") { needSame(args[0] ?? DIMLESS, args[1] ?? DIMLESS, "compare"); return DIMLESS; }
    if (["deg2rad", "rad2deg"].includes(name)) { allDimensionless(); return DIMLESS; }
    if (["min", "max"].includes(name)) return args.reduce((first, value) => needSame(first, value, "compare"), args[0] ?? DIMLESS);
    allDimensionless(); return DIMLESS;
  };
  const result = expression();
  if (pos !== tokens.length) throw new Error("Unexpected trailing tokens");
  return result;
}

/**
 * Convert a plain-math expression (after numeric substitution) to LaTeX so
 * it renders correctly in KaTeX. Handles operators that look wrong as raw
 * LaTeX, including non-standard inverse-trig names.
 */
function exprToLatex(s: string): string {
  s = s.replace(/\bpi\b/g, "\\pi");
  s = s.replace(/\bsqrt\(([^()]*)\)/g, "\\sqrt{$1}");
  s = s.replace(/\bsqrt\(([^()]*)\)/g, "\\sqrt{$1}");
  s = s.replace(/\bcbrt\(([^()]*)\)/g, "\\sqrt[3]{$1}");
  s = s.replace(/\batan2(?=\s*\()/g, "\\operatorname{atan2}");
  s = s.replace(/\batan(?=\s*\()/g, "\\arctan");
  s = s.replace(/\basin(?=\s*\()/g, "\\arcsin");
  s = s.replace(/\bacos(?=\s*\()/g, "\\arccos");
  s = s.replace(/\*/g, " \\cdot ");
  return s.replace(/ {2,}/g, " ").trim();
}

function normalizeFormulaLatex(s: string): string {
  return s
    .replace(/\\atan2\b/g, "\\operatorname{atan2}")
    .replace(/\\atan\b/g, "\\arctan")
    .replace(/\\asin\b/g, "\\arcsin")
    .replace(/\\acos\b/g, "\\arccos")
    .replace(/\batan2(?=\s*\()/g, "\\operatorname{atan2}")
    .replace(/\batan(?=\s*\()/g, "\\arctan")
    .replace(/\basin(?=\s*\()/g, "\\arcsin")
    .replace(/\bacos(?=\s*\()/g, "\\arccos");
}

/**
 * Substitute numeric scope values into a step expression to produce a fresh
 * calculation string.  This replaces each identifier with its current numeric
 * value so the displayed math line stays in sync after user edits.
 *
 * Example: "F_a*(v_f/1000)" + {F_a:500, v_f:0.6} → "500*(0.6/1000)"
 */
function buildSubstitution(
  expr: string,
  scope: Record<string, number>,
  maxDecimals: number,
): string {
  // Longest-first so e.g. "eta_d" is replaced before "eta" would be if it existed.
  const keys = Object.keys(scope).sort((a, b) => b.length - a.length);
  let s = expr;
  for (const key of keys) {
    // Escape regex-special chars, then match whole identifier (word boundary on both sides).
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const formatted = formatNumber(scope[key], maxDecimals);
    const replacement = scope[key] < 0 ? `(${formatted})` : formatted;
    s = s.replace(new RegExp(`\\b${escaped}\\b`, "g"), replacement);
  }
  return exprToLatex(s);
}

// Deterministically recompute every step result from its expression, in order,
// so numbers are never trusted from the AI. Steps may reference earlier step
// symbols. Results whose symbol matches a step/scope symbol are refreshed too.
export function recomputeDoc(doc: GeniusCalculationDoc): GeniusCalculationDoc {
  const displayDecimals = normalizeGeniusDecimals(doc.displayDecimals);
  const scope = buildScope(doc);
  const rawScope = buildRawScope(doc);
  const dimensionScope = buildDimensionScope(doc);
  const rateKindScope: Record<string, RotationalRateKind | undefined> = {};
  for (const value of [...doc.inputs, ...doc.assumptions]) {
    if (value.symbol) rateKindScope[value.symbol] = rotationalRateKind(value.unit);
  }
  // Sentinel shown whenever a numeric result cannot be verified by our evaluator.
  // We never trust a number the model supplied — an unverifiable step gets this.
  const UNVERIFIED = "—";
  const steps = doc.steps.map((step) => {
    const formula = normalizeFormulaLatex(step.formula ?? "");
    const displayUnit = canonicalUnit(step.unit);
    if (!step.expr || !step.expr.trim()) {
      const declared = parseUnit(displayUnit);
      if (step.symbol) {
        delete scope[step.symbol];
        delete rawScope[step.symbol];
        delete dimensionScope[step.symbol];
        delete rateKindScope[step.symbol];
      }
      return {
        ...step,
        formula,
        result: UNVERIFIED,
        reviewNeeded: true,
        warnings: [
          ...(step.warnings || []).filter((warning) => !warning.startsWith("Unit review:")),
          "No evaluable expression — result not computed.",
          ...(!declared.known ? [`Unit review: step "${step.title}" has ${declared.reason}`] : []),
        ],
      };
    }
    try {
      const dimensions = evaluateDimensions(step.expr, dimensionScope);
      const declared = parseUnit(displayUnit);
      if (!declared.known) throw new Error(`Unit review: step "${step.title}" has ${declared.reason}`);
      if (!sameDimensions(dimensions, declared.dimensions)) {
        throw new Error(`Unit review: step "${step.title}" expects ${familyName(dimensions)} but declares ${familyName(declared.dimensions)} (${step.unit || "no unit"})`);
      }
      // Use a per-step scope because legacy explicit scale conversions must not
      // mutate the canonical values retained for subsequent expressions.
      const numericScope = { ...scope };
      applyLegacyScaleConversions(step.expr, numericScope, rawScope, doc);
      applyLegacyRotationalTimeConversion(step.expr, displayUnit, numericScope, doc);
      let evaluatedValue = evaluateExpr(step.expr, numericScope);
      const directSymbol = step.expr.trim().match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)?.[0];
      const sourceRateKind = directSymbol ? rateKindScope[directSymbol] : undefined;
      const outputRateKind = rotationalRateKind(displayUnit);
      evaluatedValue = convertRotationalRate(evaluatedValue, sourceRateKind, outputRateKind);
      const legacyRpm = usesLegacyRpmConversion(step.expr, displayUnit);
      const legacyInputConvention = usesLegacyInputConvention(step.expr, doc);
      const legacyHours = usesLegacyHoursConversion(step.expr, displayUnit);
      // Older generated ball-screw formulas explicitly multiply the
      // rev/s ratio by 60 and already produce an RPM display value. Convert
      // that value to the canonical angular-rate scope only after preserving
      // its declared RPM representation.
      const legacyDisplayValue = legacyRpm || legacyInputConvention || legacyHours;
      const declaredValue = legacyDisplayValue
        ? evaluatedValue
        : (evaluatedValue - (declared.offset ?? 0)) / declared.scale;
      const value = legacyDisplayValue
        ? declaredValue * declared.scale + (declared.offset ?? 0)
        : evaluatedValue;
      if (step.symbol) scope[step.symbol] = value;
      if (step.symbol) dimensionScope[step.symbol] = { dimensions };
      if (step.symbol) rateKindScope[step.symbol] = outputRateKind;
      if (step.symbol) rawScope[step.symbol] = declaredValue;
      const scaled = applyBestSIPrefix(declaredValue, displayUnit, displayDecimals);
      // Regenerate the substituted calculation string so it matches the new
      // scope values (clears stale AI-generated substitutions after edits).
      const subScope = { ...rawScope };
      if (step.symbol) delete subScope[step.symbol];
      const freshCalc = buildSubstitution(step.expr, subScope, displayDecimals);
      return {
        ...step,
        formula,
        result: scaled.value,
        unit: scaled.unit,
        calculation: freshCalc,
        reviewNeeded: false,
        warnings: (step.warnings || []).filter((warning) => !warning.startsWith("Unit review:")),
      };
    } catch (err) {
      const warning = (err as Error).message;
      const unitWarning = warning.startsWith("Unit review:") ? warning : `Unit review: ${warning}`;
      // A failed step must never leave an older input or step binding behind:
      // downstream expressions and linked results must become unverified too.
      if (step.symbol) {
        delete scope[step.symbol];
        delete rawScope[step.symbol];
        delete dimensionScope[step.symbol];
        delete rateKindScope[step.symbol];
      }
      // Still show the substituted working when arithmetic itself is safe. The
      // sentinel result and review state make clear that it is not verified.
      const subScope = { ...rawScope };
      if (step.symbol) delete subScope[step.symbol];
      return {
        ...step,
        formula,
        result: UNVERIFIED,
        calculation: buildSubstitution(step.expr, subScope, displayDecimals),
        reviewNeeded: true,
        warnings: [...(step.warnings || []).filter((item) => !item.startsWith("Unit review:")), unitWarning],
      };
    }
  });
  const invalidStepSymbols = new Set(steps.filter((step) => step.reviewNeeded).map((step) => step.symbol).filter(Boolean));
  const results = doc.results.map((r) => {
    if (r.symbol && r.symbol in scope) {
      const displayUnit = canonicalUnit(r.unit);
      const declared = parseUnit(displayUnit);
      const computed = dimensionScope[r.symbol];
      const warnings = (r.warnings || []).filter((warning) => !warning.startsWith("Unit review:"));
      if (!declared.known || !computed || computed.unknown || !sameDimensions(computed.dimensions, declared.dimensions)) {
        const expected = computed?.unknown ? computed.unknown : familyName(computed?.dimensions ?? DIMLESS);
        return { ...r, reviewNeeded: true, warnings: [...warnings, `Unit review: result "${r.label}" expects ${expected} but declares ${declared.known ? familyName(declared.dimensions) : declared.reason} (${r.unit || "no unit"}).`] };
      }
      const rotationalValue = convertRotationalRate(scope[r.symbol], rateKindScope[r.symbol], rotationalRateKind(displayUnit));
      const scaled = applyBestSIPrefix(
        (rotationalValue - (declared.offset ?? 0)) / declared.scale,
        displayUnit,
        displayDecimals,
      );
      return { ...r, value: scaled.value, unit: scaled.unit, reviewNeeded: invalidStepSymbols.has(r.symbol), warnings: invalidStepSymbols.has(r.symbol) ? [...warnings, "Unit review: the source calculation step needs review."] : warnings };
    }
    // A result tied to a symbol we could not compute must not display a model
    // number or look fully trusted, regardless of its declared unit.
    if (r.symbol) {
      const declared = parseUnit(canonicalUnit(r.unit));
      const warnings = (r.warnings || []).filter((warning) => !warning.startsWith("Unit review:"));
      return {
        ...r,
        value: UNVERIFIED,
        reviewNeeded: true,
        warnings: [...warnings, `Unit review: source calculation "${r.symbol}" could not be dimensionally verified.${!declared.known ? ` ${declared.reason}.` : ""}`],
      };
    }
    return r;
  });
  return { ...doc, steps, results };
}
