/**
 * Scrapes OpenAI's public pricing page and returns:
 *   - model prices ($/1M tokens, in/out)
 *   - tool prices ($/call for web search, etc.)
 *
 * Strategy (most-reliable first):
 *   1. Look for __NEXT_DATA__ or any embedded JSON that contains pricing arrays.
 *   2. Regex-scan visible text for model + price patterns.
 *   3. Parse HTML table rows.
 *
 * On failure, throws a descriptive error so the caller can keep the last
 * cached prices and surface a warning to the admin.
 */

const PRICING_URL = 'https://openai.com/api/pricing/';

export interface ParsedPrice {
  model: string;
  in: number;
  out: number;
}

export interface ParsedToolPrice {
  key: string;
  label: string;
  costPerCall: number;
}

export interface FetchPricingResult {
  models: ParsedPrice[];
  tools: ParsedToolPrice[];
}

function parseNumber(raw: string): number | null {
  const s = raw.replace(/[$,\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function extractFromJsonBlob(json: any, results: Map<string, ParsedPrice>): void {
  if (!json || typeof json !== 'object') return;
  if (Array.isArray(json)) {
    json.forEach((item) => extractFromJsonBlob(item, results));
    return;
  }
  const keys = Object.keys(json);
  const modelKey = keys.find((k) => k === 'model' || k === 'id' || k === 'name');
  const inKey = keys.find((k) => /input/i.test(k) && !/output/i.test(k));
  const outKey = keys.find((k) => /output/i.test(k));
  if (modelKey && inKey && outKey) {
    const model = String(json[modelKey]).toLowerCase().trim();
    const inVal = parseNumber(String(json[inKey]));
    const outVal = parseNumber(String(json[outKey]));
    if (model && inVal !== null && outVal !== null && inVal >= 0 && outVal >= 0) {
      if (!results.has(model)) {
        results.set(model, { model, in: inVal, out: outVal });
      }
    }
  }
  keys.forEach((k) => extractFromJsonBlob(json[k], results));
}

function tryParseScriptTags(html: string, results: Map<string, ParsedPrice>): void {
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const content = m[1].trim();
    if (!content.includes('gpt') && !content.includes('model') && !content.includes('input')) continue;
    const jsonStartChars = ['{', '['];
    for (const ch of jsonStartChars) {
      const idx = content.indexOf(ch);
      if (idx === -1) continue;
      try {
        const jsonStr = content.slice(idx);
        const parsed = JSON.parse(jsonStr);
        extractFromJsonBlob(parsed, results);
      } catch {}
    }
  }
}

function tryParseTableRows(html: string, results: Map<string, ParsedPrice>): void {
  const tdRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = tdRe.exec(html)) !== null) {
    const row = rowMatch[1];
    const tdRe2 = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = tdRe2.exec(row)) !== null) {
      const text = cellMatch[1].replace(/<[^>]+>/g, '').trim();
      if (text) cells.push(text);
    }
    if (cells.length < 3) continue;
    const modelCell = cells[0].toLowerCase();
    if (!/gpt|o[1-9]|codex/i.test(modelCell)) continue;
    const inVal = parseNumber(cells[1]);
    const outVal = parseNumber(cells[2]);
    if (inVal !== null && outVal !== null && inVal >= 0 && outVal >= 0) {
      const model = modelCell.trim();
      if (!results.has(model)) {
        results.set(model, { model, in: inVal, out: outVal });
      }
    }
  }
}

function tryParseApiJson(html: string, results: Map<string, ParsedPrice>): void {
  const nextDataRe = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i;
  const ndMatch = nextDataRe.exec(html);
  if (ndMatch) {
    try {
      const parsed = JSON.parse(ndMatch[1]);
      extractFromJsonBlob(parsed, results);
    } catch {}
  }
}

/**
 * Parse web search tool pricing from the Tools section of the pricing page.
 * Looks for "$N.NN / 1k calls" patterns near "web search" text.
 *
 * From the OpenAI pricing page (as of 2025):
 *   Web search (all models):                     $10.00 / 1k calls
 *   Web search preview (reasoning, gpt-5, o-*):  $10.00 / 1k calls
 *   Web search preview (non-reasoning):           $25.00 / 1k calls
 */
function tryParseWebSearchPricing(html: string): ParsedToolPrice[] {
  // Flatten HTML to plain text for easier regex matching
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  const tools: ParsedToolPrice[] = [];
  const seen = new Set<string>();

  const patterns: Array<{ re: RegExp; key: string; label: string }> = [
    // Non-reasoning preview (most specific — match first)
    {
      re: /web\s+search\s+preview[^$]{0,120}non[- ]reasoning[^$]{0,80}\$\s*([\d.]+)\s*\/\s*1[,.]?k\s*calls/i,
      key: 'web_search_preview',
      label: 'Web search preview (non-reasoning models)',
    },
    // Reasoning preview (gpt-5, o-series)
    {
      re: /web\s+search\s+preview[^$]{0,120}reasoning[^$]{0,80}\$\s*([\d.]+)\s*\/\s*1[,.]?k\s*calls/i,
      key: 'web_search_preview_reasoning',
      label: 'Web search preview (reasoning models)',
    },
    // Standard web search tool (all models)
    {
      re: /web\s+search\s*\([^)]*all\s+models[^)]*\)[^$]{0,80}\$\s*([\d.]+)\s*\/\s*1[,.]?k\s*calls/i,
      key: 'web_search_tool',
      label: 'Web search (all models)',
    },
  ];

  for (const { re, key, label } of patterns) {
    if (seen.has(key)) continue;
    const m = text.match(re);
    if (m) {
      const per1k = parseFloat(m[1]);
      if (!isNaN(per1k) && per1k > 0) {
        tools.push({ key, label, costPerCall: per1k / 1000 });
        seen.add(key);
      }
    }
  }

  // Fallback: grab any "$N.NN / 1k calls" near "web search" if specific patterns missed
  if (tools.length === 0) {
    const fallbackRe = /web\s+search[^$]{0,200}\$\s*([\d.]+)\s*\/\s*1[,.]?k\s*calls/i;
    const m = text.match(fallbackRe);
    if (m) {
      const per1k = parseFloat(m[1]);
      if (!isNaN(per1k) && per1k > 0) {
        tools.push({ key: 'web_search_preview', label: 'Web search', costPerCall: per1k / 1000 });
      }
    }
  }

  return tools;
}

async function fetchPricingHtml(): Promise<string> {
  // Use realistic browser headers — OpenAI's page returns 403 for obvious bot requests
  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://openai.com/',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  };

  // Try primary URL and one fallback (without trailing slash)
  const urls = [PRICING_URL, 'https://openai.com/api/pricing'];
  let lastError = '';

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: browserHeaders,
        redirect: 'follow',
        signal: AbortSignal.timeout(25000),
      });
      if (res.ok) return await res.text();
      lastError = `HTTP ${res.status} from ${url}`;
    } catch (err: any) {
      lastError = err.message;
    }
  }

  throw new Error(`Failed to fetch OpenAI pricing page: ${lastError}`);
}

export function parseOpenAIPricingHtml(html: string): FetchPricingResult {
  const results = new Map<string, ParsedPrice>();

  tryParseApiJson(html, results);
  tryParseScriptTags(html, results);
  tryParseTableRows(html, results);

  const tools = tryParseWebSearchPricing(html);

  if (results.size === 0 && tools.length === 0) {
    throw new Error(
      'Could not extract any prices from OpenAI pricing page. ' +
      'The page structure may have changed. Last cached prices are still active.'
    );
  }

  return { models: Array.from(results.values()), tools };
}

export async function fetchOpenAIPricing(): Promise<FetchPricingResult> {
  try {
    return parseOpenAIPricingHtml(await fetchPricingHtml());
  } catch (err: any) {
    throw new Error(err.message);
  }
}
