import { RichTextRenderer, InlineMath } from "@/components/chat/RichTextRenderer";
import { canonicalUnit } from "@shared/unit-canonical";

// ─── Symbol delimiter stripping ──────────────────────────────────────────────
// The AI sometimes stores symbol fields with LaTeX delimiters, e.g. \(L_{10}\),
// $\sigma_y$, or $$F_{net}$$. Strip them so the inner LaTeX is extracted
// before rendering — this ensures \(L_{10}\) and L_{10} render identically.
function stripSymbolDelimiters(s: string): string {
  s = s.trim();
  if (s.startsWith("\\(") && s.endsWith("\\)")) return s.slice(2, -2).trim();
  if (s.startsWith("\\[") && s.endsWith("\\]")) return s.slice(2, -2).trim();
  if (s.startsWith("$$") && s.endsWith("$$") && s.length > 4) return s.slice(2, -2).trim();
  if (s.startsWith("$") && s.endsWith("$") && s.length > 2) return s.slice(1, -1).trim();
  return s;
}

// Matches a spelled Greek letter name, optionally followed by an underscore
// subscript — e.g. "sigma", "sigma_y", "tau_max", "eta_m".
// Capture group 1: the Greek name; group 2: the subscript including "_" (or undefined).
const GREEK_BASE_RE =
  /^(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)(_[A-Za-z0-9]+)?$/;

const ENGINEERING_SUBSCRIPT_ABBREVIATIONS: Record<string, string> = {
  motor: "d",
  drive: "d",
  mechanical: "m",
  mech: "m",
  required: "r",
  req: "r",
  rated: "r",
  net: "n",
  yield: "y",
  axial: "a",
  radial: "r",
  bending: "b",
  bend: "b",
  input: "i",
  output: "o",
};

// Units belong in the Unit column, never in a quantity's subscript.
// Keep this list to unambiguous multi-character unit spellings so legitimate
// one-letter engineering subscripts such as F_n are not removed.
const UNIT_SUBSCRIPT_TOKENS = new Set([
  "kw", "mw", "gw", "hp", "rpm", "hz", "khz", "mhz",
  "kpa", "mpa", "gpa", "bar", "psi", "mm", "cm", "km",
  "kg", "nmm", "nm", "mps",
]);

function compactEngineeringSubscript(token: string): string | null {
  const lower = token.toLowerCase();
  if (UNIT_SUBSCRIPT_TOKENS.has(lower)) return null;
  if (ENGINEERING_SUBSCRIPT_ABBREVIATIONS[lower]) {
    return ENGINEERING_SUBSCRIPT_ABBREVIATIONS[lower];
  }
  // Standard engineering qualifiers such as max, min, rms and avg are already
  // concise. Unknown legacy words are reduced to one letter.
  return lower.length <= 3 ? lower : lower[0];
}

/**
 * Convert a stored symbol identifier to compact, professional display LaTeX.
 *
 * This is intentionally display-only: evaluator identifiers are not renamed.
 * It therefore fixes historical documents safely while new generations are
 * prevented from storing verbose symbols by the strict server schema.
 *
 * Examples:
 *   P_motor_kw       → P_{d}
 *   P_{motor}_{kw}   → P_{d}
 *   sigma_y          → \sigma_{y}
 *   F_net            → F_{n}
 */
export function engineeringSymbolToLatex(content: string | number): string {
  const raw = stripSymbolDelimiters(String(content));
  // Accept both identifier syntax (P_motor_kw) and already-braced LaTeX
  // (P_{motor}_{kw}) so old and new documents take the same path.
  const match = raw.match(
    /^(\\?)([A-Za-z]+)((?:_(?:\{[A-Za-z0-9]+\}|[A-Za-z0-9]+))*)$/,
  );
  if (!match) {
    return raw.replace(/([_^])([A-Za-z0-9]{2,})/g, "$1{$2}");
  }

  const [, slash, base, scriptTail] = match;
  const baseLatex = slash || GREEK_BASE_RE.test(base) ? `\\${base}` : base;
  if (!scriptTail) return baseLatex;

  const subscripts: string[] = [];
  for (const part of scriptTail.matchAll(/_(?:\{([A-Za-z0-9]+)\}|([A-Za-z0-9]+))/g)) {
    const compact = compactEngineeringSubscript(part[1] ?? part[2]);
    if (compact && !subscripts.includes(compact)) subscripts.push(compact);
  }

  // One grouped subscript is conventional and avoids malformed stacked output
  // such as P_{motor}_{kw}. Multiple meaningful qualifiers use commas inside
  // the same group (e.g. F_axial_max → F_{a,max}).
  return subscripts.length ? `${baseLatex}_{${subscripts.join(",")}}` : baseLatex;
}

/** Normalize symbol identifiers embedded in a larger LaTeX expression. */
export function normalizeEngineeringLatexSymbols(latex: string): string {
  const validFunctions = latex
    .replace(/\\atan2\b/g, "\\operatorname{atan2}")
    .replace(/\\atan\b/g, "\\arctan")
    .replace(/\\asin\b/g, "\\arcsin")
    .replace(/\\acos\b/g, "\\arccos");
  return validFunctions.replace(
    /\\?[A-Za-z]+(?:_(?:\{[A-Za-z0-9]+\}|[A-Za-z0-9]+))+/g,
    (symbol) => engineeringSymbolToLatex(symbol),
  );
}

export function MaybeMath({ content }: { content?: string | number | null }) {
  if (content == null || content === '') return null;
  // Coerce defensively — callers occasionally pass numeric values, and string
  // methods like .trim() below would throw on a number.
  const text = String(content);
  const hasMath = /\\\(|\\\[|\\text|\\frac|_\{|\^\{/.test(text);
  if (hasMath) return <RichTextRenderer content={text} hideReferences />;
  const trimmed = text.trim();
  // Bare symbol with subscript/superscript like C_d, C_rr, x^2 — render as math glyph.
  // Multi-char subscripts/superscripts must be braced so KaTeX renders them correctly:
  // F_net → F_{net} (not F_n et), C_rr → C_{rr} (not C_r r).
  const isBareSymbolWithScript = /^[A-Za-z]+([_^][A-Za-z0-9]+)+$/.test(trimmed);
  if (isBareSymbolWithScript) {
    const braced = trimmed.replace(/([_^])([A-Za-z0-9]{2,})/g, "$1{$2}");
    return <InlineMath latex={braced} />;
  }
  // A short bare letter token (b, F, n, dt) or a Greek/LaTeX command name (\alpha,
  // \Delta, \theta) with no digits, spaces, or operators — render as italic math.
  // Anything containing digits, whitespace, or operators stays plain so values
  // like "30", "30 kN", "1.5e-3", and "n + 1" keep their existing rendering.
  const hasDigitOrSpace = /[\d\s]/.test(trimmed);
  if (!hasDigitOrSpace) {
    // Spelled Greek-letter names like `theta`, `alpha`, `Delta` → render as the
    // corresponding LaTeX command so KaTeX produces the actual glyph.
    // Lowercase: all 24 spelled Greek letters are valid KaTeX commands.
    // Uppercase: only the 11 letters with distinct glyphs from Latin are
    // KaTeX-supported (Gamma, Delta, Theta, Lambda, Xi, Pi, Sigma, Upsilon,
    // Phi, Psi, Omega). Other uppercase Greek names are not valid KaTeX
    // commands and would render as a KaTeX error.
    const greekName = /^(?:alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|omicron|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)$/;
    if (greekName.test(trimmed)) {
      return <InlineMath latex={`\\${trimmed}`} />;
    }
    // Run canonical unit normalisation first. If the result differs from the
    // input (e.g. "Nm" → "N·m") it is a unit token — render as plain text
    // so it is never mis-routed through KaTeX as a math symbol.
    const canonical = canonicalUnit(trimmed);
    if (canonical && canonical !== trimmed) {
      return <>{canonical}</>;
    }
    const isLatinLetters = /^[A-Za-z]{1,3}$/.test(trimmed);
    const isGreekLetters = /^[\u0370-\u03FF]{1,3}$/.test(trimmed);
    const isLatexCommand = /^\\[A-Za-z]+$/.test(trimmed);
    if (isLatinLetters || isGreekLetters || isLatexCommand) {
      return <InlineMath latex={trimmed} />;
    }
  }
  return <>{content}</>;
}

/**
 * Shared symbol renderer — one size/style for symbols everywhere they appear
 * (symbol legend, inputs table, results, steps summary).
 *
 * Always routes through InlineMath (never RichTextRenderer) so every symbol
 * cell produces identical KaTeX output regardless of how the AI stored the
 * string (bare "L_10", with braces "L_{10}", or with delimiters "\(L_{10}\)").
 *
 * Pipeline:
 *   1. Strip LaTeX delimiters  →  \(L_{10}\)  →  L_{10}
 *   2. Expand spelled Greek names  →  theta  →  \theta
 *   3. Auto-brace multi-char subscripts  →  F_net  →  F_{net}
 *   4. Render as InlineMath when the result looks like a math symbol,
 *      otherwise render as plain text (safety fallback for sentences).
 */
export function SymbolMath({ content }: { content?: string | number | null }) {
  if (content == null || content === '') return null;
  const raw = String(content).trim();
  if (!raw) return null;

  const latex = engineeringSymbolToLatex(raw);

  // Step 4 — decide whether to render as math or plain text.
  // Treat as math when the string contains LaTeX commands, sub/superscripts,
  // braces, or is a short Latin/Greek identifier (1–4 chars). Fall back to
  // plain text for anything that looks like a sentence or a plain number.
  const isMath =
    /[\\_{^]/.test(latex) ||
    /^[A-Za-z]{1,4}$/.test(latex) ||
    /^[\u0370-\u03FF]{1,4}$/.test(latex);

  return (
    <span className="genius-symbol">
      {isMath ? <InlineMath latex={latex} /> : <>{raw}</>}
    </span>
  );
}

export function UnitMath({ unit }: { unit?: string | number | null }) {
  if (unit == null) return null;
  // Coerce defensively — callers occasionally pass numeric values.
  const text = String(unit);
  if (!text.trim()) return null;
  return <>{canonicalUnit(text)}</>;
}
