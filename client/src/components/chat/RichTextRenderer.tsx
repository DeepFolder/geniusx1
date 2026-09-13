import { useMemo } from "react";
import { Link } from "wouter";
import katex from "katex";

type RichNode =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "link"; text: string; href: string }
  | { type: "math-block"; latex: string }
  | { type: "math-inline"; latex: string };

const LATEX_COMMANDS = new Set([
  'alpha','beta','gamma','delta','epsilon','zeta','eta','theta','iota','kappa',
  'lambda','mu','nu','xi','pi','rho','sigma','tau','upsilon','phi','chi','psi','omega',
  'Delta','Gamma','Lambda','Omega','Phi','Pi','Psi','Sigma','Theta','Xi',
  'cdot','times','div','pm','mp','approx','neq','leq','geq','infty','partial','nabla',
  'sqrt','sum','prod','int','oint','lim','sin','cos','tan','log','ln','exp','max','min',
  'frac','text','left','right',
]);

const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\uFEFF]/g;

const UNICODE_OP_REPLACEMENTS: Array<[RegExp, string]> = [
  [/[\u22C5\u00B7]/g, '\\cdot '],
  [/\u00D7/g, '\\times '],
  [/\u00F7/g, '\\div '],
  [/\u00B1/g, '\\pm '],
  [/\u2248/g, '\\approx '],
  [/\u2260/g, '\\neq '],
  [/\u2264/g, '\\leq '],
  [/\u2265/g, '\\geq '],
  [/\u2212/g, '-'],
  [/\u2192/g, '\\rightarrow '],
  [/\u221E/g, '\\infty '],
];

const TOKEN_CHAR_RE = /[A-Za-z0-9_.\\^]/;

/**
 * Convert plain-text divisions `A / B` inside math content into `\frac{A}{B}`
 * so KaTeX renders proper stacked fractions instead of flattening the terms.
 * Handles parenthesized numerators/denominators, subscripted symbols like
 * P_{motor,select}, and chained divisions. Slashes inside braces (e.g. units
 * in \mathrm{m/s} or \text{...}) are left untouched.
 */
export function convertDivisionsToFrac(input: string): string {
  let s = input;
  for (let guard = 0; guard < 24; guard++) {
    // Find the first `/` at brace depth 0.
    let depth = 0;
    let slashIdx = -1;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '/' && depth === 0 && s[i - 1] !== '\\') {
        slashIdx = i;
        break;
      }
    }
    if (slashIdx === -1) break;

    // --- numerator (walk left) ---
    let numEnd = slashIdx;
    while (numEnd > 0 && s[numEnd - 1] === ' ') numEnd--;
    let numStart: number;
    let num: string;
    if (s[numEnd - 1] === ')') {
      let d = 0;
      let j = numEnd - 1;
      for (; j >= 0; j--) {
        if (s[j] === ')') d++;
        else if (s[j] === '(') { d--; if (d === 0) break; }
      }
      if (j < 0) break; // unbalanced — leave as-is
      numStart = j;
      num = s.slice(j + 1, numEnd - 1);
    } else {
      let j = numEnd;
      let bd = 0;
      while (j > 0) {
        const c = s[j - 1];
        if (c === '}') { bd++; j--; continue; }
        if (c === '{') { bd--; j--; continue; }
        if (bd > 0) { j--; continue; }
        if (TOKEN_CHAR_RE.test(c)) { j--; continue; }
        break;
      }
      numStart = j;
      num = s.slice(j, numEnd);
    }
    if (!num.trim()) break;

    // --- denominator (walk right) ---
    let denStart = slashIdx + 1;
    while (denStart < s.length && s[denStart] === ' ') denStart++;
    let denEnd: number;
    let den: string;
    if (s[denStart] === '(') {
      let d = 0;
      let j = denStart;
      for (; j < s.length; j++) {
        if (s[j] === '(') d++;
        else if (s[j] === ')') { d--; if (d === 0) break; }
      }
      if (j >= s.length) break; // unbalanced — leave as-is
      den = s.slice(denStart + 1, j);
      denEnd = j + 1;
    } else {
      let j = denStart;
      let bd = 0;
      while (j < s.length) {
        const c = s[j];
        if (c === '{') { bd++; j++; continue; }
        if (c === '}') { bd--; j++; continue; }
        if (bd > 0) { j++; continue; }
        if (TOKEN_CHAR_RE.test(c)) { j++; continue; }
        break;
      }
      den = s.slice(denStart, j);
      denEnd = j;
    }
    if (!den.trim()) break;

    s = s.slice(0, numStart) + `\\frac{${num.trim()}}{${den.trim()}}` + s.slice(denEnd);
  }
  return s;
}

function scrubMathContent(inner: string): string {
  let s = inner.replace(ZERO_WIDTH_RE, '');
  for (const [re, repl] of UNICODE_OP_REPLACEMENTS) {
    s = s.replace(re, repl);
  }
  // \mathrm{%} — KaTeX can choke on % inside \mathrm{}; use \% directly.
  s = s.replace(/\\mathrm\{%\}/g, '\\%');
  // abs\frac{…}{…} — the AI sometimes writes "abs" (no backslash) directly
  // before \frac to denote absolute value. Rewrite as |\frac{…}{…}| so KaTeX
  // renders it unambiguously instead of as three italic letters "a·b·s".
  s = s.replace(/\babs\\frac\b/g, '|\\frac');
  s = convertDivisionsToFrac(s);
  return s;
}

function normalizeLatex(content: string): string {
  let result = content;

  // A model occasionally emits LaTex in JSON with single backslashes. JSON
  // then decodes `\frac`, `\times`, and `\text` as form-feed/tab control
  // characters followed by "rac", "imes", and "ext". Recover the intended
  // commands before tokenizing so the raw control glyph never reaches chat.
  result = result
    .replace(/\frac\b/g, "\\frac")
    .replace(/\times\b/g, "\\times")
    .replace(/\text\b/g, "\\text")
    .replace(/\right\b/g, "\\right")
    .replace(/\beta\b/g, "\\beta")
    .replace(/\n(?=abla\b)/g, "\\n");

  result = result.replace(/\\\\(\()/g, '\\$1');
  result = result.replace(/\\\\(\))/g, '\\$1');
  result = result.replace(/\\\\(\[)/g, '\\$1');
  result = result.replace(/\\\\(\])/g, '\\$1');
  result = result.replace(/\\\\([a-zA-Z]{2,})(?![a-zA-Z])/g, '\\$1');
  result = result.replace(/\\\\([,;!>])/g, '\\$1');

  result = result.replace(
    /\\\[\s*\n([\s\S]*?)\n\s*\\\]/g,
    (_match, inner) => '\\[' + inner.replace(/\n/g, ' ').trim() + '\\]'
  );
  result = result.replace(
    /\\\[\s*\n([\s\S]*?)\\\]/g,
    (_match, inner) => '\\[' + inner.replace(/\n/g, ' ').trim() + '\\]'
  );

  result = result.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (_match, inner) => '\\[' + scrubMathContent(inner) + '\\]'
  );
  result = result.replace(
    /\\\(([\s\S]*?)\\\)/g,
    (_match, inner) => '\\(' + scrubMathContent(inner) + '\\)'
  );

  return result;
}

export function collectLinkMap(content: string): Map<string, number> {
  const map = new Map<string, number>();
  let counter = 1;
  const mdRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(content)) !== null) {
    const href = m[2];
    if (!map.has(href)) map.set(href, counter++);
  }
  const fileRe = /\/api\/files\/[a-zA-Z0-9_-]{8,}/g;
  while ((m = fileRe.exec(content)) !== null) {
    const href = m[0];
    if (!map.has(href)) map.set(href, counter++);
  }
  return map;
}

const RAW_CITATION_MARKER_RE = /【[^【】]*】/g;

function tokenize(input: string): RichNode[] {
  const text = input.replace(RAW_CITATION_MARKER_RE, "");
  const tokens: RichNode[] = [];
  const combined =
    /(\\\[[\s\S]*?\\\])|(\$\$[\s\S]*?\$\$)|(\\\([\s\S]*?\\\))|(\$(?!\$)(?:[^$\n]|\\.)+\$)|(\[([^\]]+)\]\(([^)]+)\))|(\*\*(.+?)\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      // \[…\] display math
      const latex = match[1].slice(2, -2).trim();
      tokens.push({ type: "math-block", latex });
    } else if (match[2]) {
      // $$…$$ display math
      const latex = match[2].slice(2, -2).trim();
      tokens.push({ type: "math-block", latex });
    } else if (match[3]) {
      // \(…\) inline math
      const latex = match[3].slice(2, -2).trim();
      tokens.push({ type: "math-inline", latex });
    } else if (match[4]) {
      // $…$ inline math
      const latex = match[4].slice(1, -1).trim();
      tokens.push({ type: "math-inline", latex });
    } else if (match[5]) {
      // [text](href) link
      tokens.push({ type: "link", text: match[6], href: match[7] });
    } else if (match[8]) {
      // **bold**
      tokens.push({ type: "bold", value: match[9] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }

  return tokens;
}

const INLINE_MATH_RE = new RegExp(
  '(' +
    '\\\\(?:' + Array.from(LATEX_COMMANDS).join('|') + ')(?![a-zA-Z])' +
    '(?:\\s*[\\^_]\\{[^}]*\\}|\\s*[\\^_][a-zA-Z0-9])*' +
  ')' +
  '|(' +
    '[A-Za-z0-9]+_\\{[^}]+\\}' +
    '(?:\\s*[\\^]\\{[^}]*\\}|\\s*[\\^][a-zA-Z0-9])?' +
  ')' +
  '|(' +
    '[A-Za-z0-9]+\\^\\{[^}]+\\}' +
    '(?:\\s*[_]\\{[^}]*\\})?' +
  ')' +
  '|(' +
    '\\d+\\s*\\\\times\\s*\\d+\\^[\\{]?[^}\\s]+[\\}]?' +
  ')' +
  '|(' +
    '[A-Za-z0-9]+\\^[0-9]' +
  ')' +
  '|(' +
    '[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9]+(?:\\^[A-Za-z0-9]+)?' +
  ')',
  'g'
);

// Formulae in proposal/explanation prose are not always surrounded by
// `\(...\)`. Capture only equation-like fragments with an unmistakable math
// marker, and stop before the surrounding English sentence resumes.
const BARE_EQUATION_RE =
  /\b[A-Za-z][A-Za-z0-9_]*\s*=\s*(?=[^\n]*?(?:\\frac|\\times|×|π|\/|\^))[^\n]*?(?=(?:,|\.(?:\s|$)|\s+(?:where|to|and|for|with|from|in)\s)|$)/g;

/** Convert compact engineering subscripts such as L10 to KaTeX's L_{10}. */
function normalizeBareEquationSymbols(latex: string): string {
  return latex.replace(/\b([A-Za-z])(\d{1,2})\b/g, "$1_{$2}");
}

function detectInlineMath(tokens: RichNode[]): RichNode[] {
  const result: RichNode[] = [];

  for (const token of tokens) {
    if (token.type !== 'text') {
      result.push(token);
      continue;
    }

    const text = token.value;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    const matches: Array<{ index: number; value: string }> = [];
    BARE_EQUATION_RE.lastIndex = 0;
    while ((m = BARE_EQUATION_RE.exec(text)) !== null) {
      matches.push({ index: m.index, value: m[0].trim() });
    }
    INLINE_MATH_RE.lastIndex = 0;
    while ((m = INLINE_MATH_RE.exec(text)) !== null) {
      const overlapsEquation = matches.some(({ index, value }) =>
        m!.index >= index && m!.index < index + value.length,
      );
      if (!overlapsEquation) matches.push({ index: m.index, value: m[0] });
    }
    matches.sort((a, b) => a.index - b.index);

    for (const match of matches) {
      if (match.index < lastIdx) continue;
      if (match.index > lastIdx) {
        result.push({ type: 'text', value: text.slice(lastIdx, match.index) });
      }
      result.push({
        type: 'math-inline',
        latex: scrubMathContent(normalizeBareEquationSymbols(match.value)),
      });
      lastIdx = match.index + match.value.length;
    }

    if (lastIdx === 0) {
      result.push(token);
    } else if (lastIdx < text.length) {
      result.push({ type: 'text', value: text.slice(lastIdx) });
    }
  }

  return result;
}

/**
 * Normalize non-KaTeX command aliases and bare Unicode unit symbols that
 * KaTeX cannot render in math mode (it needs the backslash commands).
 * Exported so every formula-building path (steps, legends, summaries) feeds
 * KaTeX the same symbols instead of each view inventing its own handling.
 */
export function normalizeMathUnicode(latex: string): string {
  latex = latex.replace(/\\ohm\b/g, '\\Omega');
  latex = latex.replace(/Ω/g, '\\Omega ');
  latex = latex.replace(/[µμ]/g, '\\mu ');
  latex = latex.replace(/°/g, '^{\\circ}');
  return latex;
}

function renderKatex(latex: string, displayMode: boolean): string {
  latex = normalizeMathUnicode(latex);
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      output: "html",
      strict: false,
    });
  } catch {
    return latex;
  }
}

function renderTokens(tokens: RichNode[], linkMap: Map<string, number>): (string | JSX.Element)[] {
  return tokens.map((token, i) => {
    switch (token.type) {
      case "text":
        return <span key={i}>{token.value}</span>;
      case "bold":
        return (
          <strong key={i} className="font-semibold text-gray-900 dark:text-gray-100">
            {token.value}
          </strong>
        );
      case "link": {
        const isExternal = /^https?:\/\//i.test(token.href);
        const isApiFile = token.href.startsWith('/api/files/');
        if (isExternal) {
          const refNum = linkMap.get(token.href);
          if (refNum !== undefined) {
            return (
              <a
                key={i}
                href={token.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-1 py-0.5 mx-0.5 text-[11px] font-semibold leading-none rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-800/40 hover:underline cursor-pointer transition-colors"
                title={token.href}
              >
                [{refNum}]
              </a>
            );
          }
          return (
            <a
              key={i}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {token.text}
            </a>
          );
        }
        if (isApiFile) {
          const refNum = linkMap.get(token.href);
          return (
            <a
              key={i}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-1 py-0.5 mx-0.5 text-[11px] font-semibold leading-none rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-800/40 hover:underline cursor-pointer transition-colors"
              title={token.href}
            >
              {refNum !== undefined ? `[${refNum}]` : token.text}
            </a>
          );
        }
        return (
          <Link
            key={i}
            href={token.href}
            className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline cursor-pointer"
          >
            {token.text}
          </Link>
        );
      }
      case "math-block": {
        // Defense-in-depth: when a `\[ ... \]` block is really English prose
        // dressed as math, KaTeX renders it in a garbled serif italic style.
        // We detect two distinct "prose" patterns and fall back to plain text.

        // Guard 1 (Task #259): explicit \text{...} block longer than 40 chars.
        const LONG_TEXT_BLOCK_RE = /\\text\{([^}]{40,})\}/;
        const longText = token.latex.match(LONG_TEXT_BLOCK_RE);
        if (longText) {
          let cleaned = longText[1].trim();
          if (/\\[a-zA-Z]+|\\[\(\)\[\]\{\}]/.test(cleaned)) {
            cleaned = cleaned
              .replace(/\\text\{([^}]+)\}/g, '$1')
              .replace(/\\,|\\;|\\!|\\:|\\>|\\quad|\\qquad/g, ' ')
              .replace(/\\[a-zA-Z]+/g, '')
              .replace(/[_^]\{([^}]+)\}/g, '$1')
              .replace(/\\\\/g, ' ')
              .replace(/\s{2,}/g, ' ')
              .trim();
          }
          return (
            <span
              key={i}
              className="block italic text-gray-600 dark:text-gray-400 text-sm my-1"
            >
              {cleaned}
            </span>
          );
        }

        // Guard 2: plain English words without \text{} wrapping.
        // When the AI puts a descriptive label inside \[ \], each word gets
        // rendered as a KaTeX math-italic variable (serif, hard to read).
        // Detect by counting un-escaped alphabetic words of 4+ chars that
        // are NOT known LaTeX commands. Five or more such words = English prose.
        const PLAIN_WORD_RE = /(?<!\\)\b([A-Za-z]{4,})\b/g;
        const plainWords = Array.from(token.latex.matchAll(PLAIN_WORD_RE))
          .filter(m => !LATEX_COMMANDS.has(m[1]));
        if (plainWords.length >= 5) {
          const stripped = token.latex
            .replace(/\\text\{([^}]+)\}/g, '$1')
            .replace(/\\,|\\;|\\!|\\:|\\>|\\quad|\\qquad/g, ' ')
            .replace(/\\[a-zA-Z]+/g, '')
            .replace(/[_^]\{([^}]+)\}/g, '$1')
            .replace(/[{}]/g, '')
            .replace(/\\\\/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
          return (
            <span
              key={i}
              className="block text-gray-600 dark:text-gray-400 text-sm my-1"
            >
              {stripped}
            </span>
          );
        }

        return (
          <span
            key={i}
            className="katex-block"
            dangerouslySetInnerHTML={{ __html: renderKatex(token.latex, true) }}
          />
        );
      }
      case "math-inline":
        return (
          <span
            key={i}
            className="katex-inline"
            dangerouslySetInnerHTML={{
              __html: renderKatex(token.latex, false),
            }}
          />
        );
    }
  });
}

function stripWrappingParens(tokens: RichNode[]): RichNode[] {
  const result: RichNode[] = [...tokens];
  for (let i = result.length - 1; i >= 0; i--) {
    const tok = result[i];
    if (tok.type !== 'text') continue;

    if (i + 1 < result.length) {
      const next = result[i + 1];
      if (next.type === 'link' && /^https?:\/\//i.test(next.href)) {
        const stripped = tok.value.replace(/\(\s*$/, '');
        if (stripped !== tok.value) {
          if (stripped.trim() === '') result.splice(i, 1);
          else result[i] = { type: 'text', value: stripped };
          continue;
        }
      }
    }

    if (i > 0) {
      const prev = result[i - 1];
      if (prev.type === 'link' && /^https?:\/\//i.test(prev.href)) {
        const stripped = tok.value.replace(/^\s*\)/, '');
        if (stripped !== tok.value) {
          if (stripped.trim() === '') result.splice(i, 1);
          else result[i] = { type: 'text', value: stripped };
        }
      }
    }
  }
  return result;
}

const API_FILE_RE = /\/api\/files\/[a-zA-Z0-9_-]{8,}/g;

function linkifyApiFiles(tokens: RichNode[]): RichNode[] {
  const result: RichNode[] = [];
  for (const token of tokens) {
    if (token.type !== 'text') { result.push(token); continue; }
    const text = token.value;
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    API_FILE_RE.lastIndex = 0;
    while ((m = API_FILE_RE.exec(text)) !== null) {
      if (m.index > lastIdx) result.push({ type: 'text', value: text.slice(lastIdx, m.index) });
      result.push({ type: 'link', text: 'Open Datasheet', href: m[0] });
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx === 0) result.push(token);
    else if (lastIdx < text.length) result.push({ type: 'text', value: text.slice(lastIdx) });
  }
  return result;
}

function renderInlineTokens(text: string, linkMap: Map<string, number>): (string | JSX.Element)[] {
  return renderTokens(stripWrappingParens(detectInlineMath(linkifyApiFiles(tokenize(text)))), linkMap);
}

function renderKeyValueLine(line: string, linkMap: Map<string, number>): JSX.Element | null {
  const kvMatch = line.match(KV_RE);
  if (!kvMatch) return null;
  return (
    <span>
      <strong className="font-semibold text-gray-900 dark:text-gray-100">{kvMatch[1]}</strong>
      <span className="text-gray-600 dark:text-gray-400">: {renderInlineTokens(kvMatch[2], linkMap)}</span>
    </span>
  );
}

const KV_RE = /^([A-Za-z][A-Za-z0-9 /&-]{1,30}):\s+(.+)$/;

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "bullet"; items: string[] }
  | { type: "numbered"; items: NumberedItem[] }
  | { type: "paragraph"; lines: string[] }
  | { type: "kvgroup"; items: { label: string; value: string }[] }
  | { type: "hr" }
  | { type: "table"; headers: string[]; rows: string[][] };

function parseBlocks(content: string): Block[] {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  let currentBulletItems: string[] = [];
  let currentParagraphLines: string[] = [];
  let currentNumberedItems: NumberedItem[] = [];
  let currentKvItems: { label: string; value: string }[] = [];

  function flushBullet() {
    if (currentBulletItems.length > 0) {
      blocks.push({ type: "bullet", items: [...currentBulletItems] });
      currentBulletItems = [];
    }
  }

  function flushNumbered() {
    if (currentNumberedItems.length > 0) {
      blocks.push({ type: "numbered", items: [...currentNumberedItems] });
      currentNumberedItems = [];
    }
  }

  function flushKv() {
    if (currentKvItems.length >= 2) {
      blocks.push({ type: "kvgroup", items: [...currentKvItems] });
    } else if (currentKvItems.length === 1) {
      currentParagraphLines.push(`${currentKvItems[0].label}: ${currentKvItems[0].value}`);
    }
    currentKvItems = [];
  }

  function flushParagraph() {
    if (currentParagraphLines.length > 0) {
      blocks.push({ type: "paragraph", lines: [...currentParagraphLines] });
      currentParagraphLines = [];
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "" || trimmed === "---" || trimmed === "***" || trimmed === "___") {
      flushBullet();
      flushNumbered();
      flushKv();
      flushParagraph();
      if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
        blocks.push({ type: "hr" });
      }
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const nextLine = i + 1 < lines.length ? lines[i + 1]?.trim() : "";
      const isSeparator = /^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|$/.test(nextLine || "");

      if (isSeparator) {
        flushBullet();
        flushNumbered();
        flushKv();
        flushParagraph();
        const headers = trimmed.split("|").slice(1, -1).map(c => c.trim());
        const tableRows: string[][] = [];
        i += 2;
        while (i < lines.length) {
          const rowLine = lines[i].trim();
          if (!rowLine.startsWith("|") || !rowLine.endsWith("|")) break;
          tableRows.push(rowLine.split("|").slice(1, -1).map(c => c.trim()));
          i++;
        }
        i--;
        blocks.push({ type: "table", headers, rows: tableRows });
        continue;
      }
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushBullet();
      flushNumbered();
      flushKv();
      flushParagraph();
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2] });
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      flushNumbered();
      flushKv();
      currentBulletItems.push(bulletMatch[1]);
      continue;
    }

    const numberedMatch = trimmed.match(/^(\d+)[\.\)]\s*\*?\*?([^:–—]{2,60}?)(?:\*\*)?(?::\s+|\s+[–—]\s+|\s+-\s+)(.*)$/);
    if (numberedMatch) {
      flushParagraph();
      flushBullet();
      flushKv();
      currentNumberedItems.push({
        number: numberedMatch[1],
        heading: numberedMatch[2].replace(/\*\*/g, ""),
        body: numberedMatch[3],
      });
      continue;
    }

    const kvMatch = trimmed.match(KV_RE);
    if (kvMatch) {
      flushBullet();
      flushNumbered();
      flushParagraph();
      currentKvItems.push({ label: kvMatch[1], value: kvMatch[2] });
      continue;
    }

    flushBullet();
    flushNumbered();
    flushKv();
    currentParagraphLines.push(trimmed);
  }

  flushBullet();
  flushNumbered();
  flushKv();
  flushParagraph();

  return blocks;
}

function hasStructuredContent(content: string): boolean {
  const lines = content.split("\n");
  let headingCount = 0;
  let bulletCount = 0;
  let numberedCount = 0;
  let kvCount = 0;
  let hasTable = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^#{1,4}\s+/.test(t)) headingCount++;
    if (/^[-*•]\s+/.test(t)) bulletCount++;
    if (/^\d+[\.\)]\s*\*?\*?[^:–—]{2,60}?(?:\*\*)?(?::\s+|\s+[–—]\s+|\s+-\s+)/.test(t)) numberedCount++;
    if (KV_RE.test(t)) kvCount++;
    if (t.startsWith("|") && t.endsWith("|") && i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (/^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)*\|$/.test(next)) hasTable = true;
    }
  }
  return headingCount >= 1 || bulletCount >= 2 || numberedCount >= 2 || kvCount >= 2 || hasTable;
}

interface NumberedItem {
  number: string;
  heading: string;
  body: string;
}

function parseNumberedList(text: string): { items: NumberedItem[]; preamble: string } | null {
  const lines = text.split("\n");
  const items: NumberedItem[] = [];
  let preamble = "";
  let currentItem: NumberedItem | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const numbered = trimmed.match(/^(\d+)[\.\)]\s*\*?\*?([^:–—]{2,60}?)(?:\*\*)?(?::\s+|\s+[–—]\s+|\s+-\s+)(.*)$/);
    if (numbered) {
      if (currentItem) items.push(currentItem);
      currentItem = { number: numbered[1], heading: numbered[2].replace(/\*\*/g, ""), body: numbered[3] };
    } else if (currentItem && trimmed) {
      currentItem.body += (currentItem.body ? " " : "") + trimmed;
    } else if (!currentItem && trimmed) {
      preamble += (preamble ? "\n" : "") + trimmed;
    }
  }
  if (currentItem) items.push(currentItem);

  return items.length >= 2 ? { items, preamble } : null;
}

function parseInlineNumberedList(text: string): { items: NumberedItem[]; preamble: string } | null {
  const inlinePattern = /\((\d+)\)\s*([^:(]+?)(?::\s*|\s*[–—-]\s*)((?:(?!\(\d+\)).)*)(?=\(\d+\)|$)/g;
  const items: NumberedItem[] = [];
  let firstMatchIndex = -1;
  let m: RegExpExecArray | null;

  while ((m = inlinePattern.exec(text)) !== null) {
    if (firstMatchIndex === -1) firstMatchIndex = m.index;
    items.push({
      number: m[1],
      heading: m[2].trim().replace(/\*\*/g, ""),
      body: m[3].trim().replace(/,\s*$/, "").replace(/;\s*$/, "").replace(/\.\s*$/, ""),
    });
  }

  if (items.length < 2) return null;

  const preamble = firstMatchIndex > 0 ? text.slice(0, firstMatchIndex).trim().replace(/[:;,]\s*$/, "") : "";
  return { items, preamble };
}

function renderBlock(block: Block, idx: number, linkMap: Map<string, number>): JSX.Element {
  switch (block.type) {
    case "heading": {
      const inner = renderInlineTokens(block.text, linkMap);
      if (block.level === 1) {
        return <h3 key={idx} className="text-base font-bold text-gray-900 dark:text-gray-100 mt-3 mb-1">{inner}</h3>;
      }
      if (block.level === 2) {
        return <h4 key={idx} className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-3 mb-1">{inner}</h4>;
      }
      return <h5 key={idx} className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-2 mb-0.5">{inner}</h5>;
    }
    case "bullet":
      return (
        <ul key={idx} className="space-y-1.5 my-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 mt-[7px]" />
              <span className="flex-1 min-w-0">{renderInlineTokens(item, linkMap)}</span>
            </li>
          ))}
        </ul>
      );
    case "numbered":
      return <div key={idx} className="my-2">{renderNumberedItems(block.items, "", linkMap)}</div>;
    case "kvgroup":
      return (
        <div key={idx} className="my-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 px-3 py-2 space-y-1">
          {block.items.map((item, i) => (
            <div key={i} className="flex items-baseline gap-1.5 text-[13px]">
              <strong className="font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">{item.label}:</strong>
              <span className="text-gray-600 dark:text-gray-400">{renderInlineTokens(item.value, linkMap)}</span>
            </div>
          ))}
        </div>
      );
    case "paragraph":
      return (
        <div key={idx} className="my-2 leading-relaxed">
          {block.lines.map((line, lidx) => {
            const kv = renderKeyValueLine(line, linkMap);
            return (
              <span key={lidx}>
                {lidx > 0 && <br />}
                {kv || renderInlineTokens(line, linkMap)}
              </span>
            );
          })}
        </div>
      );
    case "table":
      return (
        <div key={idx} className="overflow-x-auto my-3">
          <table className="w-full text-xs border-collapse border border-gray-200 dark:border-gray-700 rounded-lg">
            <thead>
              <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                {block.headers.map((h, hi) => (
                  <th key={hi} className="py-2 px-3 font-semibold text-gray-700 dark:text-gray-200 text-left border-r border-gray-200 dark:border-gray-700 last:border-r-0">
                    {renderInlineTokens(h, linkMap)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  {row.map((cell, ci) => (
                    <td key={ci} className={`py-1.5 px-3 border-r border-gray-200 dark:border-gray-700 last:border-r-0 ${ci === 0 ? 'font-medium text-gray-700 dark:text-gray-300' : 'text-gray-600 dark:text-gray-400'}`}>
                      {renderInlineTokens(cell, linkMap)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "hr":
      return <hr key={idx} className="border-gray-200 dark:border-gray-700 my-2" />;
  }
}

function renderNumberedItems(items: NumberedItem[], preamble: string, linkMap: Map<string, number>): JSX.Element {
  return (
    <div className="space-y-2.5">
      {preamble && (
        <div className="text-gray-700 dark:text-gray-300 leading-relaxed">{renderInlineTokens(preamble, linkMap)}</div>
      )}
      <ol className="space-y-2 mt-1">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2.5 py-1.5 px-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-400 mt-0.5">
              {item.number}
            </span>
            <div className="flex-1 min-w-0">
              <strong className="font-semibold text-gray-900 dark:text-gray-100">
                {renderInlineTokens(item.heading, linkMap)}
              </strong>
              {item.body && (
                <span className="text-gray-600 dark:text-gray-400">
                  {" — "}{renderInlineTokens(item.body, linkMap)}
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function renderParagraphWithInlineList(text: string, linkMap: Map<string, number>): JSX.Element | null {
  const inlineList = parseInlineNumberedList(text);
  if (inlineList) return renderNumberedItems(inlineList.items, inlineList.preamble, linkMap);
  return null;
}

function renderKvCard(items: { label: string; value: string }[], key: number, linkMap: Map<string, number>): JSX.Element {
  return (
    <div key={key} className="my-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/50 px-3 py-2 space-y-1">
      {items.map((item, i) => (
        <div key={i} className="flex items-baseline gap-1.5 text-[13px]">
          <strong className="font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">{item.label}:</strong>
          <span className="text-gray-600 dark:text-gray-400">{renderInlineTokens(item.value, linkMap)}</span>
        </div>
      ))}
    </div>
  );
}

function renderLinesWithKvGrouping(lines: string[], linkMap: Map<string, number>): JSX.Element {
  const segments: JSX.Element[] = [];
  let kvBuffer: { label: string; value: string }[] = [];
  let textBuffer: string[] = [];
  let segIdx = 0;

  function flushText() {
    if (textBuffer.length > 0) {
      segments.push(
        <div key={segIdx++} className="leading-relaxed">
          {textBuffer.map((line, lidx) => (
            <span key={lidx}>
              {lidx > 0 && <br />}
              {renderInlineTokens(line, linkMap)}
            </span>
          ))}
        </div>
      );
      textBuffer = [];
    }
  }

  function flushKvBuf() {
    if (kvBuffer.length >= 2) {
      flushText();
      segments.push(renderKvCard([...kvBuffer], segIdx++, linkMap));
    } else if (kvBuffer.length === 1) {
      textBuffer.push(`${kvBuffer[0].label}: ${kvBuffer[0].value}`);
    }
    kvBuffer = [];
  }

  for (const line of lines) {
    const m = line.match(KV_RE);
    if (m) {
      kvBuffer.push({ label: m[1], value: m[2] });
    } else {
      flushKvBuf();
      textBuffer.push(line);
    }
  }
  flushKvBuf();
  flushText();

  return <>{segments}</>;
}

function renderReferences(linkMap: Map<string, number>): JSX.Element | null {
  if (linkMap.size === 0) return null;
  const entries = Array.from(linkMap.entries()).sort((a, b) => a[1] - b[1]);
  return (
    <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
      <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
        Sources
      </div>
      <div className="flex flex-col gap-y-1">
        {entries.map(([href, n]) => {
          const isFile = href.startsWith('/api/files/');
          const label = isFile ? 'DeepFolder catalog datasheet' : href;
          const displayLabel = isFile ? label : (label.length > 80 ? label.slice(0, 80) + '…' : label);
          return (
            <div key={n} className="flex items-start gap-1.5 text-[10px]">
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 inline-flex items-center px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold hover:bg-blue-100 dark:hover:bg-blue-800/40 hover:underline transition-colors cursor-pointer"
                title={href}
              >
                [{n}]
              </a>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline break-all transition-colors cursor-pointer"
                title={isFile ? href : undefined}
              >
                {displayLabel}
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function InlineMath({ latex }: { latex: string }) {
  return (
    <span
      className="katex-inline"
      dangerouslySetInnerHTML={{ __html: renderKatex(latex, false) }}
    />
  );
}

export function RichTextRenderer({ content, hideReferences, externalLinkMap, stripExternalLinks }: { content: string; hideReferences?: boolean; externalLinkMap?: Map<string, number>; stripExternalLinks?: boolean }) {
  const { rendered, linkMap } = useMemo(() => {
    const stripped = stripExternalLinks
      ? content.replace(/\s*\[[^\]]+\]\(https?:\/\/[^)]+\)/gi, '').replace(/\s+$/g, '')
      : content;
    const normalized = normalizeLatex(stripped);
    const linkMap = stripExternalLinks
      ? new Map<string, number>()
      : (externalLinkMap ?? collectLinkMap(normalized));

    let rendered: JSX.Element | (string | JSX.Element)[];

    if (hasStructuredContent(normalized)) {
      const blocks = parseBlocks(normalized);
      rendered = <div className="space-y-0.5">{blocks.map((b, i) => renderBlock(b, i, linkMap))}</div>;
    } else {
      const numbered = parseNumberedList(normalized);
      if (numbered && numbered.items.length >= 2) {
        rendered = renderNumberedItems(numbered.items, numbered.preamble, linkMap);
      } else {
        const inlineNumbered = parseInlineNumberedList(normalized);
        if (inlineNumbered) {
          rendered = renderNumberedItems(inlineNumbered.items, inlineNumbered.preamble, linkMap);
        } else {
          const paragraphs = normalized.split(/\n\n+/);
          if (paragraphs.length > 1) {
            rendered = (
              <div className="space-y-3">
                {paragraphs.map((para, idx) => {
                  const inlineList = renderParagraphWithInlineList(para, linkMap);
                  if (inlineList) return <div key={idx}>{inlineList}</div>;
                  const lines = para.split("\n");
                  return <div key={idx}>{renderLinesWithKvGrouping(lines, linkMap)}</div>;
                })}
              </div>
            );
          } else {
            const lines = normalized.split("\n");
            if (lines.length > 1) {
              rendered = renderLinesWithKvGrouping(lines, linkMap);
            } else {
              rendered = <span>{renderInlineTokens(normalized, linkMap)}</span>;
            }
          }
        }
      }
    }

    return { rendered, linkMap };
  }, [content, externalLinkMap, stripExternalLinks]);

  return (
    <>
      {rendered}
      {!hideReferences && renderReferences(linkMap)}
    </>
  );
}

export function stripMarkdownStars(text: string): string {
  return text.replace(/\*\*/g, "");
}
