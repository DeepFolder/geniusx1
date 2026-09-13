/**
 * Split a plain-text calculation summary into readable sentence rows without
 * changing the persisted summary text. The summary generator promises prose,
 * but historical summaries can contain engineering abbreviations and decimals.
 */
const NON_TERMINAL_ABBREVIATIONS = new Set([
  "e.g.",
  "i.e.",
  "etc.",
  "vs.",
  "fig.",
  "eq.",
  "ref.",
  "no.",
  "approx.",
  "min.",
  "max.",
  "incl.",
  "excl.",
]);

function isNonTerminalPeriod(text: string, periodIndex: number): boolean {
  const next = text[periodIndex + 1];
  if (/\d/.test(text[periodIndex - 1] ?? "") && /\d/.test(next ?? "")) {
    return true;
  }

  const before = text.slice(0, periodIndex + 1);
  const abbreviation = before.match(/([A-Za-z.]+)$/)?.[1].toLowerCase();
  if (abbreviation && NON_TERMINAL_ABBREVIATIONS.has(abbreviation)) {
    return true;
  }

  // Initialisms such as "U.S." and "A.S.M.E." are notation, not row breaks.
  return Boolean(abbreviation && /^(?:[a-z]\.){2,}$/.test(abbreviation));
}

/**
 * Returns each complete thought as a separate visual row. A trailing fragment
 * is retained as its own row so historical or interrupted summaries stay visible.
 */
export function formatSummarySentenceRows(summary: string): string[] {
  const rows: string[] = [];
  let rowStart = 0;

  for (let index = 0; index < summary.length; index++) {
    if (summary[index] !== "." || isNonTerminalPeriod(summary, index)) continue;

    let sentenceEnd = index + 1;
    while (/["')\]]/.test(summary[sentenceEnd] ?? "")) sentenceEnd++;
    if (!/\s/.test(summary[sentenceEnd] ?? "")) continue;

    const row = summary.slice(rowStart, sentenceEnd).trim();
    if (row) rows.push(row);
    while (/\s/.test(summary[sentenceEnd] ?? "")) sentenceEnd++;
    rowStart = sentenceEnd;
    index = sentenceEnd - 1;
  }

  const remaining = summary.slice(rowStart).trim();
  if (remaining) rows.push(remaining);
  return rows;
}