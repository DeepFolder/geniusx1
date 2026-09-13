import { executeAgentSearch, type AgentSearchResult, type AgentUsageInfo, type ChatHistoryMessage } from '../agents/agent-search';
import { executeDatabaseSearch, executeDatabaseFallback, type DatabaseSearchResult } from '../connections/database-search';
import type { UnifiedProduct, ProductCard, SearchResult, HybridSearchConfig } from './types';
import type { QueryClassification } from '../agents/query-classifier';
import { type ManufacturerDiscoveryResult } from '../agents/manufacturer-discovery';
import { extractPdfText, extractPdfTextFromBuffer } from '../../../services/datasheet-summarizer';
import { getFileBufferById } from '../../../objectStorage';
import { verifyWebProductDatasheets } from './datasheet-verifier';
import { trackApiCall } from '../connections/usage-tracking';
import { storage } from '../../../storage';
import path from 'path';
import fs from 'fs';
import OpenAI from 'openai';

// In-memory cache for verified-datasheet PDF text. Keyed by absolute path.
// Avoids re-extracting the same PDF on every follow-up turn — datasheets
// rarely change between turns of the same conversation.
const PDF_TEXT_CACHE = new Map<string, { text: string; ts: number }>();
const PDF_TEXT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PDF_TEXT_CACHE_MAX_ENTRIES = 200;

// In-memory cache for remotely-fetched datasheet PDFs. Keyed by URL.
// Prevents re-downloading the same PDF on follow-up questions within a session.
const PDF_URL_CACHE = new Map<string, { text: string; ts: number }>();
const PDF_URL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const PDF_URL_CACHE_MAX_ENTRIES = 100;

async function getCachedPdfText(fullPath: string): Promise<string> {
  const now = Date.now();
  const cached = PDF_TEXT_CACHE.get(fullPath);
  if (cached && now - cached.ts < PDF_TEXT_CACHE_TTL_MS) {
    return cached.text;
  }
  const text = await extractPdfText(fullPath);
  if (PDF_TEXT_CACHE.size >= PDF_TEXT_CACHE_MAX_ENTRIES) {
    const oldestKey = PDF_TEXT_CACHE.keys().next().value;
    if (oldestKey) PDF_TEXT_CACHE.delete(oldestKey);
  }
  PDF_TEXT_CACHE.set(fullPath, { text, ts: now });
  return text;
}

/**
 * Resolves a datasheet relative path to extracted PDF text, handling three cases:
 *  - `/uploads/…`    → read from local filesystem (legacy path)
 *  - `/api/files/:id` → fetch base64 buffer from `file_storage` DB table
 *  - anything else   → log a warning and return '' (e.g. /objects/… GCS paths)
 *
 * Results are cached in PDF_TEXT_CACHE keyed by the relative path.
 */
async function resolveDatasheetText(relPath: string): Promise<string> {
  if (!relPath) return '';

  const now = Date.now();
  const cached = PDF_TEXT_CACHE.get(relPath);
  if (cached && now - cached.ts < PDF_TEXT_CACHE_TTL_MS) {
    return cached.text;
  }

  let text = '';

  if (relPath.startsWith('/uploads/')) {
    try {
      const fullPath = path.join(process.cwd(), `.${relPath}`);
      if (fs.existsSync(fullPath)) {
        text = (await getCachedPdfText(fullPath)) || '';
      }
    } catch (err: any) {
      console.warn(`⚠️ [HybridEngine] PDF read failed for "${relPath}": ${err?.message}`);
    }
  } else if (relPath.startsWith('/api/files/')) {
    try {
      const buf = await getFileBufferById(relPath);
      if (buf) {
        text = (await extractPdfTextFromBuffer(buf)) || '';
      } else {
        console.warn(`⚠️ [HybridEngine] DB file not found for "${relPath}"`);
      }
    } catch (err: any) {
      console.warn(`⚠️ [HybridEngine] DB PDF extract failed for "${relPath}": ${err?.message}`);
    }
  } else {
    console.warn(`⚠️ [HybridEngine] Unresolvable datasheet path (skipping): "${relPath}"`);
    return '';
  }

  if (PDF_TEXT_CACHE.size >= PDF_TEXT_CACHE_MAX_ENTRIES) {
    const oldestKey = PDF_TEXT_CACHE.keys().next().value;
    if (oldestKey) PDF_TEXT_CACHE.delete(oldestKey);
  }
  PDF_TEXT_CACHE.set(relPath, { text, ts: now });
  return text;
}

// A single previously-shown product as recovered from the chat history.
// `id` is set when the product was a DeepFolder catalog item (and so has a
// real DB row we can re-load); `manufacturer` and `url` come from the
// structured footer lines the frontend now emits per assistant turn.
export type PreviousProduct = {
  id?: number;
  name: string;
  manufacturer?: string;
  url?: string;
};

// Parse the structured footer the frontend appends to assistant messages
// (one line per shown product, format:
//   `- <Name> [id=<dbId>] [mfr=<companyName>] [url=<productWebLink or /product/<id>>]`)
// and fall back to the older `/product/<id>` regex so legacy turns still
// resolve. Order is preserved (oldest first); duplicates collapse on id when
// available, otherwise on lowercased name.
function extractPreviousProductsFromHistory(chatHistory: ChatHistoryMessage[]): PreviousProduct[] {
  const byKey = new Map<string, PreviousProduct>();
  for (const msg of chatHistory) {
    if (msg.role !== 'assistant' || !msg.content) continue;

    // Structured per-product footer lines.
    const structuredRe = /^-\s+([^\n[]+?)\s+((?:\[(?:id|mfr|url)=[^\]]*\]\s*)+)$/gm;
    for (const m of msg.content.matchAll(structuredRe)) {
      const name = (m[1] || '').trim();
      const tags = m[2] || '';
      if (!name) continue;
      const idMatch = tags.match(/\[id=(\d+)\]/);
      const mfrMatch = tags.match(/\[mfr=([^\]]*)\]/);
      const urlMatch = tags.match(/\[url=([^\]]*)\]/);
      const id = idMatch ? parseInt(idMatch[1], 10) : undefined;
      const key = id && !isNaN(id) ? `id:${id}` : `name:${name.toLowerCase()}`;
      const record: PreviousProduct = {
        id: id && !isNaN(id) ? id : undefined,
        name,
        manufacturer: mfrMatch && mfrMatch[1].trim() ? mfrMatch[1].trim() : undefined,
        url: urlMatch && urlMatch[1].trim() ? urlMatch[1].trim() : undefined,
      };
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, record);
      } else {
        // Merge — most-recent message wins on each field, but keep older fields
        // when newer ones are blank.
        byKey.set(key, {
          id: record.id ?? existing.id,
          name: record.name || existing.name,
          manufacturer: record.manufacturer || existing.manufacturer,
          url: record.url || existing.url,
        });
      }
    }

    // Backwards-compatible fallback: bare `/product/<id>` references.
    const bareIds = msg.content.matchAll(/\/product\/(\d+)/g);
    for (const m of bareIds) {
      const id = parseInt(m[1], 10);
      if (isNaN(id)) continue;
      const key = `id:${id}`;
      if (!byKey.has(key)) {
        byKey.set(key, { id, name: '' });
      }
    }
  }
  return Array.from(byKey.values());
}

// Pull every numeric DeepFolder product id the assistant has previously
// referenced in this conversation. Thin wrapper around the structured
// extractor so existing call sites that only need IDs keep working.
function extractDbProductIdsFromHistory(chatHistory: ChatHistoryMessage[]): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const p of extractPreviousProductsFromHistory(chatHistory)) {
    if (typeof p.id === 'number' && !seen.has(p.id)) {
      seen.add(p.id);
      ids.push(p.id);
    }
  }
  return ids;
}

// Pick the manufacturer to anchor a follow-up search to. Prefers the most
// recent previously-shown product whose name matches a candidate token from
// the current turn (e.g. "EMA-80" → match the Schaeffler EMA-80 we just
// showed); falls back to the most recently shown product that has a
// manufacturer recorded.
function pickAnchorFromHistory(
  previousProducts: PreviousProduct[],
  candidates: string[],
): { manufacturer?: string; matched?: PreviousProduct } {
  if (previousProducts.length === 0) return {};
  if (candidates.length > 0) {
    for (let i = previousProducts.length - 1; i >= 0; i--) {
      const p = previousProducts[i];
      if (p.name && nameMatchesAnyCandidate(p.name, candidates)) {
        return { manufacturer: p.manufacturer, matched: p };
      }
    }
  }
  for (let i = previousProducts.length - 1; i >= 0; i--) {
    const p = previousProducts[i];
    if (p.manufacturer) return { manufacturer: p.manufacturer, matched: p };
  }
  return {};
}

// Heuristic: extract product-name candidates from a free-form user query.
// Handles three patterns:
//   1. Single mixed-alphanumeric tokens  — "EMA-80", "6308-2RS", "IRFZ44N"
//   2. Three-word [Brand] [Model] [Suffix] — "SKF 7207 BECBP", "FAG 6306 2RS"
//   3. Two-word [Brand/Model] [Model/Suffix] — "SKF 7207", "7207 BECBP"
// Used by the calculation-grounding flow to detect when a query names a specific
// product alongside engineering inputs. Returns [] when no candidate is found.
// Common filler words and unit suffixes that should never be treated as a brand
// or model-suffix token in multi-word part designations.
const FILLER_WORDS = new Set([
  'and','the','for','with','from','find','into','that','this','have','its','not','are',
  'can','use','per','get','set','how','kn','nm','w','kw','kg','mm','cm','ms','hz',
  'khz','mhz','kv','ma','psi','bar','rpm','deg','rad','at','of','to','in','on','by',
  // Engineering quantity names — never a brand or model suffix
  'duty','stroke','speed','load','push','pull','force','power','torque','flow',
  'pressure','max','min','avg','rms','peak','rated','nominal','actual','required',
]);

function extractProductNameCandidates(query: string): string[] {
  if (!query) return [];
  const out: string[] = [];
  const seen = new Set<string>();

  // Pre-pass: collect tokens that appear as formula variables (e.g. "L10 = 20 000 h").
  // These are engineering parameters, not product names, and must never become candidates.
  const formulaVars = new Set<string>();
  for (const m of query.matchAll(/\b([A-Za-z][A-Za-z0-9_]{0,6})\s*=/g)) {
    formulaVars.add(m[1].toLowerCase());
  }

  const addCandidate = (tok: string) => {
    const norm = tok.toLowerCase().trim();
    if (seen.has(norm) || norm.length < 2) return;
    // Skip tokens that were used as formula variables in this query (L10 =, C0 =, etc.)
    if (formulaVars.has(norm)) return;
    // Skip standard engineering variable notation: exactly 1 letter + 1-3 digits
    // + optional 1-2 trailing letters (e.g. L10, L50, L10h, S1, A1, A2, A3,
    // K1, C0, P0).  Two-letter prefixes like "KR46" or "6308-2RS" are real
    // part numbers and are NOT filtered.  ISO/DIN variable symbols always use
    // a single capital/lowercase letter followed by a small subscript number.
    if (/^[a-z]\d{1,3}[a-z]{0,2}$/i.test(norm)) return;
    seen.add(norm);
    out.push(tok.trim());
  };

  // Pass 1 — single mixed-alphanumeric tokens (existing logic).
  // Catches designations like "EMA-80", "KR46", "6308-2RS", "IRFZ44N".
  const reSingle = /\b([A-Za-z][A-Za-z0-9\-./]{1,}[0-9][A-Za-z0-9\-./]{0,8}|[0-9][A-Za-z0-9\-./]{1,}[A-Za-z][A-Za-z0-9\-./]{0,8})\b/g;
  for (const m of query.matchAll(reSingle)) {
    const tok = m[1];
    if (!tok) continue;
    if (/^\d+(?:\.\d+)?(?:kn|n|nm|w|kw|kg|mm|cm|m|s|ms|hz|khz|mhz|v|kv|a|ma|ohm|c|f|h|hp|psi|bar|rpm|deg|rad)$/i.test(tok)) continue;
    // Skip engineering subscript notation: single letter + 1-2 digits (L10, C0, F1, P2…).
    // These are parameter names, not product identifiers.
    if (/^[A-Za-z]\d{1,2}$/.test(tok)) continue;
    // Skip pure dimension specs like "32x10", "40x5x2" (NxN or NxNxN).
    // These are ball-screw / thread / shaft size designations, not product names.
    if (/^\d+[xX]\d+(?:[xX]\d+)*$/.test(tok)) continue;
    // Skip compound-unit rate values like "150mm/sec", "10m/s", "5mm/min".
    if (/^\d+(?:\.\d+)?[a-z]+\/[a-z]+$/i.test(tok)) continue;
    addCandidate(tok);
    if (out.length >= 5) return out;
  }

  // Pass 2 — multi-word bearing/part designations that don't mix letters+digits
  // in a single token (e.g. "SKF 7207 BECBP", "FAG 6306 2RS", "NSK 7308 BEP").

  // Pattern A: [BRAND 2-5 alpha] [MODEL 3-5 digits] [SUFFIX 2-8 alphanumeric]
  // e.g. "SKF 7207 BECBP", "FAG 6306 2RS", "NSK 7308 BEP"
  const reThreeWord = /\b([A-Za-z]{2,5})\s+(\d{3,5})\s+([A-Za-z0-9]{2,8})\b/g;
  for (const m of query.matchAll(reThreeWord)) {
    const [, brand, model, suffix] = m;
    if (FILLER_WORDS.has(brand.toLowerCase()) || FILLER_WORDS.has(suffix.toLowerCase())) continue;
    addCandidate(`${brand} ${model} ${suffix}`);
    if (out.length >= 5) return out;
  }

  // Pattern B: [MODEL 3-5 digits] [SUFFIX 2-8 alpha] — e.g. "7207 BECBP", "6306 2RS"
  const reTwoWordMS = /\b(\d{3,5})\s+([A-Za-z]{2,8})\b/g;
  for (const m of query.matchAll(reTwoWordMS)) {
    const [, model, suffix] = m;
    if (FILLER_WORDS.has(suffix.toLowerCase())) continue;
    addCandidate(`${model} ${suffix}`);
    if (out.length >= 5) return out;
  }

  // Pattern C: [BRAND 2-5 alpha] [MODEL 3-5 digits] — e.g. "SKF 7207", "FAG 6306"
  const reTwoWordBM = /\b([A-Za-z]{2,5})\s+(\d{3,5})\b/g;
  for (const m of query.matchAll(reTwoWordBM)) {
    const [, brand, model] = m;
    if (FILLER_WORDS.has(brand.toLowerCase())) continue;
    addCandidate(`${brand} ${model}`);
    if (out.length >= 5) return out;
  }

  return out;
}

// Resolution telemetry — tracks where the named-product context was sourced.
type ProductContextSourceLayer = 'db' | 'history' | 'web';

type ResolvedProductContext = {
  name: string;
  companyName: string;
  attributes: Array<{ label: string; value: string; unit?: string }>;
  datasheetText: string;
  datasheetUrl: string;
  sourceKind: 'db' | 'datasheet_pdf' | 'web';
  layer: ProductContextSourceLayer;
  productId?: number;
};

// Confidence rule for matching a candidate token against a product name.
// We require either substring overlap on tokens of length ≥3 OR exact case-
// insensitive equality of normalized tokens. We deliberately reject the
// arbitrary "top DB hit" fallback so unrelated catalog products never get
// injected into a calculation that happens to share a domain.
function nameMatchesAnyCandidate(productName: string, candidates: string[]): boolean {
  if (!productName || candidates.length === 0) return false;
  const normProduct = productName.toLowerCase().replace(/[\s\-_./]+/g, '');
  for (const c of candidates) {
    const normCand = c.toLowerCase().replace(/[\s\-_./]+/g, '');
    if (normCand.length < 3) continue;
    if (normProduct === normCand) return true;
    if (normProduct.includes(normCand) || normCand.includes(normProduct)) return true;
  }
  return false;
}

// Last-resort: ask the OpenAI Responses API with web_search_preview to find a
// manufacturer datasheet for the named product. Mirrors the doRecoverySearch
// pattern already used elsewhere in this feature, but returns a snippet of
// key spec values alongside the URL so the agent has real numbers to ground
// the calculation in. Returns null on timeout, parse failure, or no result.
const PRODUCT_CONTEXT_WEB_TIMEOUT_MS = 12000;
const PDF_FETCH_TIMEOUT_MS = 5000;
const PDF_MAX_CHARS = 4000;
async function searchManufacturerDatasheetForProduct(
  productName: string,
  anchorManufacturer?: string,
): Promise<{
  datasheetUrl: string;
  snippet: string;
  manufacturerName: string;
} | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️ [HybridEngine.ProductContext.Web] No OPENAI_API_KEY — skipping web fallback');
    return null;
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PRODUCT_CONTEXT_WEB_TIMEOUT_MS);
  const start = Date.now();
  try {
    const response = await client.responses.create(
      {
        model: 'gpt-4o-mini',
        tools: [{ type: 'web_search_preview' }],
        input: `Find the official manufacturer datasheet for the product: "${productName}".${anchorManufacturer ? `

ANCHOR MANUFACTURER (REQUIRED): The user is asking about this product in the context of a previous conversation that featured products from "${anchorManufacturer}". Restrict your search to "${anchorManufacturer}" — search "${anchorManufacturer} ${productName} datasheet" and prefer results on ${anchorManufacturer}'s official domain. If "${anchorManufacturer}" does not make this product, return all empty fields rather than guessing a different brand.` : ''}

Search the web (manufacturer's official site only — not distributors like Amazon, DigiKey, Mouser, Octopart) and return a JSON object with these exact fields and nothing else:
{
  "manufacturer_name": "<official manufacturer/brand name>",
  "datasheet_url": "<direct https URL to the PDF datasheet, or '' if you cannot find one>",
  "key_specs": "<compact bullet list of numeric specs from the datasheet — include values + units. Prioritise: dynamic load rating C, static load rating C0, rated force/torque, stroke/travel, speed limits, efficiency, life rating (L10/Lh), operating temperature, weight. Limit ~600 characters.>"
}

Rules:
- If the product cannot be confidently identified as a real product, return {"manufacturer_name":"","datasheet_url":"","key_specs":""}.
- Do NOT invent a URL. If no PDF datasheet is reachable, leave datasheet_url empty.
- Return ONLY the JSON object — no prose, no markdown fences.`,
      },
      { signal: controller.signal },
    );
    const duration = Date.now() - start;
    const raw = response.output_text || '';
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart < 0 || jsonEnd <= jsonStart) {
      console.warn(`⚠️ [HybridEngine.ProductContext.Web] No JSON in response for "${productName}" (${duration}ms)`);
      return null;
    }
    let parsed: any;
    try {
      parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    } catch {
      console.warn(`⚠️ [HybridEngine.ProductContext.Web] JSON parse failed for "${productName}" (${duration}ms)`);
      return null;
    }
    const manufacturerName = String(parsed.manufacturer_name || '').trim();
    const snippet = String(parsed.key_specs || '').trim();
    let datasheetUrl = String(parsed.datasheet_url || '').trim();
    if (datasheetUrl && !/^https?:\/\//i.test(datasheetUrl)) datasheetUrl = '';
    if (!manufacturerName && !snippet && !datasheetUrl) {
      console.log(`ℹ️ [HybridEngine.ProductContext.Web] Web found no datasheet for "${productName}" (${duration}ms)`);
      return null;
    }
    // Note: web_search_preview usage from this lookup is intentionally not
    // tracked — trackApiCall requires a requestId scoped to the SSE stream
    // which isn't threaded through this helper. The cost is bounded (one call
    // per turn for the strongest candidate token).
    console.log(`🌐 [HybridEngine.ProductContext.Web] Resolved "${productName}" via web in ${duration}ms — manufacturer="${manufacturerName}", url=${datasheetUrl ? 'yes' : 'no'}, snippetChars=${snippet.length}`);
    return { datasheetUrl, snippet, manufacturerName };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.warn(`⚠️ [HybridEngine.ProductContext.Web] Timed out for "${productName}" after ${PRODUCT_CONTEXT_WEB_TIMEOUT_MS}ms`);
    } else {
      console.warn(`⚠️ [HybridEngine.ProductContext.Web] Error for "${productName}": ${err?.message}`);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---- SSRF guard -------------------------------------------------------
// Block private/loopback/link-local hostnames before making any outbound fetch.
// Pattern covers IPv4 loopback, private RFC-1918 ranges, link-local, and
// common IPv6 equivalents; also rejects bare numeric IPs and internal names.
const PRIVATE_HOST_RE = /^(localhost|0\.0\.0\.0|::1|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|fc[0-9a-f]{2}:|fe[89ab][0-9a-f]:|::ffff:(?:127|10|172|192)\.)$/i;

function isUrlSafe(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;       // https only
    if (PRIVATE_HOST_RE.test(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
// -----------------------------------------------------------------------

// Fetches a remote PDF URL and extracts raw text via the shared extractPdfTextFromBuffer utility.
// Returns extracted text (capped to PDF_MAX_CHARS) or null on any failure.
// SSRF-safe: https-only, private-range hostnames are rejected before fetching.
async function fetchAndParsePdfFromUrl(url: string): Promise<string | null> {
  if (!url) return null;
  if (!isUrlSafe(url)) {
    console.warn(`⚠️ [HybridEngine.PDF] Rejected unsafe URL "${url}" (not https or private host)`);
    return null;
  }

  // Check the URL cache before making a network request.
  const now = Date.now();
  const cached = PDF_URL_CACHE.get(url);
  if (cached && now - cached.ts < PDF_URL_CACHE_TTL_MS) {
    console.log(`✅ [HybridEngine.PDF] Cache hit for "${url}"`);
    return cached.text;
  }
  console.log(`🌐 [HybridEngine.PDF] Cache miss — fetching "${url}"`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDF_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'DeepFolder-DatasheetParser/1.0', 'Accept': 'application/pdf,application/octet-stream' },
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`⚠️ [HybridEngine.PDF] HTTP ${res.status} fetching "${url}"`);
      return null;
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if ((ct.includes('html') || ct.includes('json') || ct.includes('xml') || ct.includes('text/plain')) && !ct.includes('pdf')) {
      console.warn(`⚠️ [HybridEngine.PDF] Non-PDF content-type "${ct}" for "${url}" — skipping`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 4 || buf.slice(0, 4).toString('ascii') !== '%PDF') {
      console.warn(`⚠️ [HybridEngine.PDF] Not a PDF (bad magic bytes) at "${url}"`);
      return null;
    }
    const text = await extractPdfTextFromBuffer(buf);
    if (!text.trim()) {
      console.log(`ℹ️ [HybridEngine.PDF] No extractable text in PDF at "${url}"`);
      return null;
    }
    const result = text.slice(0, PDF_MAX_CHARS);

    // Populate the URL cache, evicting the oldest entry when at capacity.
    if (PDF_URL_CACHE.size >= PDF_URL_CACHE_MAX_ENTRIES) {
      const oldestKey = PDF_URL_CACHE.keys().next().value;
      if (oldestKey) PDF_URL_CACHE.delete(oldestKey);
    }
    PDF_URL_CACHE.set(url, { text: result, ts: Date.now() });

    return result;
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      console.warn(`⚠️ [HybridEngine.PDF] Timed out fetching "${url}" after ${PDF_FETCH_TIMEOUT_MS}ms`);
    } else {
      console.warn(`⚠️ [HybridEngine.PDF] Failed to fetch/parse "${url}": ${err?.message}`);
    }
    return null;
  }
}

// Build an optional "PRODUCT CONTEXT" block when a calculation query targets a
// specific product — either named in the current turn OR carried over from a
// previously-discussed product in the same conversation. Pure first-turn
// calculations (no named product, no prior product in history) get no block,
// preserving the unchanged pure-calculation flow.
//
// Resolution order:
//   1. Named in current turn → DB hybrid hit whose name matches a candidate
//   2. Named in current turn → previously-discussed DB product whose name
//      matches a candidate
//   3. Named in current turn → manufacturer-first web lookup
//   4. NOT named in current turn → most-recent previously-discussed DB
//      product (carries conversational context for follow-ups like
//      "calculate the lifetime" referring back to a product just shown)
// Returns '' only when the current turn names nothing AND history has no DB
// product to anchor the follow-up calculation to.
async function buildProductContextBlock(
  query: string,
  chatHistory: ChatHistoryMessage[],
  dbProducts: UnifiedProduct[],
  perProductChars = 3500,
  options?: { anchorManufacturer?: string },
): Promise<{ block: string; resolved: ResolvedProductContext | null }> {
  const candidates = extractProductNameCandidates(query);
  const hasCandidate = candidates.length > 0;

  let resolved: ResolvedProductContext | null = null;

  // Layer 1: DB hybrid hits whose product_name overlaps a candidate. Only
  // runs when the current turn names a product — we explicitly do NOT fall
  // back to dbProducts[0] without a name match.
  if (hasCandidate && dbProducts.length > 0) {
    for (const p of dbProducts) {
      const productName = p.fluid_data.product_name || '';
      if (!nameMatchesAnyCandidate(productName, candidates)) continue;
      // Prefer pre-computed DB column; only fall back to file read when absent.
      let datasheetText = p._dbDatasheetText || '';
      const relPath = p._dbDatasheetPath || p.structured_data.files.datasheet_url || '';
      if (!datasheetText && relPath) {
        datasheetText = await resolveDatasheetText(relPath);
      }
      resolved = {
        name: productName,
        companyName: p.structured_data.company.name || '',
        attributes: (p.fluid_data.attributes || []).slice(0, 12).map(a => ({
          label: a.label, value: a.value, unit: a.unit || undefined,
        })),
        datasheetText,
        datasheetUrl: relPath || '',
        sourceKind: datasheetText ? 'datasheet_pdf' : 'db',
        layer: 'db',
        productId: p._dbProductId,
      };
      break;
    }
  }

  // Layer 2: previously-discussed DB product whose name overlaps a current-
  // turn candidate. Catches the case where the user re-mentions an earlier
  // product by name but the catalog hybrid search returned nothing for it.
  if (!resolved && hasCandidate && chatHistory.length > 0) {
    const previousIds = extractDbProductIdsFromHistory(chatHistory).slice(-5).reverse();
    for (const id of previousIds) {
      try {
        const product = await storage.getProduct(id);
        if (!product) continue;
        if (!nameMatchesAnyCandidate(product.name, candidates)) continue;
        let companyName = '';
        if (product.companyId) {
          try {
            const company = await storage.getCompany(product.companyId);
            companyName = company?.name || '';
          } catch {
            // company lookup failures are non-fatal
          }
        }
        // Prefer pre-computed DB column; only fall back to file read when absent.
        let datasheetText = (product as any).datasheetText || '';
        const relPath = (product as any).catalogPath || (product as any).datasheetPath || '';
        if (!datasheetText && relPath) {
          datasheetText = await resolveDatasheetText(relPath);
        }
        const attributes: Array<{ label: string; value: string; unit?: string }> = [];
        if (product.specifications && typeof product.specifications === 'object') {
          for (const [key, value] of Object.entries(product.specifications as Record<string, any>)) {
            if (value === null || value === undefined) continue;
            const str = String(value);
            const m = str.match(/^([\d.]+)\s*(.*)$/);
            attributes.push({
              label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              value: m ? m[1] : str,
              unit: m && m[2] ? m[2].trim() : undefined,
            });
            if (attributes.length >= 12) break;
          }
        }
        resolved = {
          name: product.name,
          companyName,
          attributes,
          datasheetText,
          datasheetUrl: relPath,
          sourceKind: datasheetText ? 'datasheet_pdf' : 'db',
          layer: 'history',
          productId: id,
        };
        break;
      } catch (err: any) {
        console.warn(`⚠️ [HybridEngine.ProductContext.History] Failed to load product #${id}: ${err?.message}`);
      }
    }
  }

  // Layer 3: manufacturer-first web search for the candidate. Last resort
  // for current-turn-named products — costs a web_search_preview call, so we
  // gate it on hasCandidate and only use the strongest candidate token.
  if (!resolved && hasCandidate) {
    const primaryCandidate = candidates[0];
    const webHit = await searchManufacturerDatasheetForProduct(primaryCandidate, options?.anchorManufacturer);
    // Treat hits with no datasheet URL AND a tiny snippet as "no usable
    // grounding" — they let the agent fabricate values that look cited but
    // aren't. Only accept the hit when there's either a real PDF URL or a
    // substantive text snippet to ground the calculation in.
    // When a datasheetUrl is present we always attempt PDF extraction first —
    // if that succeeds we have full text regardless of snippet length.
    const snippetLen = webHit?.snippet?.length ?? 0;
    const isUsableHit = !!webHit && (Boolean(webHit.datasheetUrl) || snippetLen >= 50);
    if (webHit && isUsableHit) {
      // Attempt to download and parse the PDF for richer context.
      let datasheetText = webHit.snippet;
      if (webHit.datasheetUrl) {
        const pdfText = await fetchAndParsePdfFromUrl(webHit.datasheetUrl);
        if (pdfText) {
          datasheetText = pdfText;
          console.log(`📄 [HybridEngine.PDF] Extracted ${pdfText.length} chars from PDF for "${primaryCandidate}" (${webHit.datasheetUrl})`);
        } else {
          console.log(`ℹ️ [HybridEngine.PDF] PDF unavailable for "${primaryCandidate}" — using web snippet (${snippetLen} chars)`);
        }
      }
      resolved = {
        name: primaryCandidate,
        companyName: webHit.manufacturerName || '',
        attributes: [],
        datasheetText,
        datasheetUrl: webHit.datasheetUrl,
        sourceKind: webHit.datasheetUrl ? 'datasheet_pdf' : 'web',
        layer: 'web',
      };
    } else if (webHit) {
      console.log(`ℹ️ [HybridEngine.ProductContext.Web] Discarding weak web hit for "${primaryCandidate}" — datasheetUrl=${Boolean(webHit.datasheetUrl)}, snippetChars=${snippetLen}; treating as not_resolved`);
    }
  }

  // Layer 4: conversational follow-up — current turn names NO product but the
  // chat history has a previously-discussed DB product. Treat the most
  // recently-shown product as the implicit subject (e.g. "calculate the
  // lifetime", "what's the inrush current", "estimate the bearing load").
  // First-turn pure calculations skip this layer (no history to anchor to)
  // so their flow stays unchanged.
  if (!resolved && !hasCandidate && chatHistory.length > 0) {
    const previousIds = extractDbProductIdsFromHistory(chatHistory);
    if (previousIds.length > 0) {
      const lastId = previousIds[previousIds.length - 1];
      try {
        const product = await storage.getProduct(lastId);
        if (product) {
          let companyName = '';
          if (product.companyId) {
            try {
              const company = await storage.getCompany(product.companyId);
              companyName = company?.name || '';
            } catch {
              // company lookup failures are non-fatal
            }
          }
          let datasheetText = '';
          const relPath = (product as any).datasheetPath || '';
          if (relPath && relPath.startsWith('/uploads/')) {
            try {
              const fullPath = path.join(process.cwd(), `.${relPath}`);
              if (fs.existsSync(fullPath)) {
                datasheetText = (await getCachedPdfText(fullPath)) || '';
              }
            } catch {
              // PDF read failures are non-fatal
            }
          }
          const attributes: Array<{ label: string; value: string; unit?: string }> = [];
          if (product.specifications && typeof product.specifications === 'object') {
            for (const [key, value] of Object.entries(product.specifications as Record<string, any>)) {
              if (value === null || value === undefined) continue;
              const str = String(value);
              const m = str.match(/^([\d.]+)\s*(.*)$/);
              attributes.push({
                label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                value: m ? m[1] : str,
                unit: m && m[2] ? m[2].trim() : undefined,
              });
              if (attributes.length >= 12) break;
            }
          }
          console.log(`💬 [HybridEngine.ProductContext.History] Follow-up calc with no product token — anchoring to most-recent product #${lastId} "${product.name}"`);
          resolved = {
            name: product.name,
            companyName,
            attributes,
            datasheetText,
            datasheetUrl: relPath,
            sourceKind: datasheetText ? 'datasheet_pdf' : 'db',
            layer: 'history',
            productId: lastId,
          };
        }
      } catch (err: any) {
        console.warn(`⚠️ [HybridEngine.ProductContext.History] Failed to load follow-up product #${lastId}: ${err?.message}`);
      }
    }
  }

  if (!resolved) {
    if (hasCandidate) {
      const candidate = candidates[0];
      console.log(`ℹ️ [HybridEngine.ProductContext] No layer (DB/history/web) resolved candidates [${candidates.join(', ')}] — emitting NOT RESOLVED guard block for "${candidate}"`);
      // The user named a real-sounding product but we found NO datasheet —
      // not in the catalog, not in chat history, not on the web. Without
      // this guard block the agent would silently fall back to its training
      // and emit a calc with "EMA-80M datasheet example" rows that look
      // cited but aren't. Tell it explicitly: no datasheet exists for this
      // product, so either compute honestly from prompt-only inputs OR
      // refuse with a chat reply. Never invent a datasheet citation.
      return { block: `## PRODUCT CONTEXT — NAMED PRODUCT NOT RESOLVED

The user's query NAMES a specific product (token "${candidate}"), but NO datasheet for it could be found in the DeepFolder catalog, in this conversation's history, or via manufacturer web search.

You MUST NOT fabricate datasheet values for this product. Specifically, in your response:
- Do NOT label any \`given[i]\` row with wording like "example", "datasheet example", "${candidate} example", "from datasheet", or anything that implies a specific real datasheet was consulted. No such datasheet was consulted.
- Do NOT set \`given[i].source.kind\` to "datasheet_pdf", "db", or "web". Those kinds require a real, citable source — none is available here.
- Do NOT set \`formula_sources[].kind\` to "manufacturer". The manufacturer's catalog was not consulted.
- Do NOT invent any URL.

Choose ONE of the three paths below for this calculation:

PATH A — Compute from the user's prompt only (when the prompt supplies every product-specific input the formula needs):
- Each \`given[i]\` whose value came directly from the user prompt → \`source: { "kind": "user", "label": "User input" }\`.
- Each \`given[i]\` that is a generic engineering constant from your training (gravity, friction coefficient, textbook bearing exponent p=10/3, etc.) → \`source: { "kind": "ai", "label": "AI engineering reference" }\`.
- \`formula_sources\` may include \`kind: "textbook"\`, \`"standard"\`, or \`"ai"\` only — never \`"manufacturer"\`.

PATH C — Assume a typical engineering value (PREFERRED over PATH B when the missing product-specific input has a well-known typical range for this product class or size):
- Use your engineering training to pick a conservative mid-range typical value for the missing parameter (e.g. for an EMA-80 class electric linear actuator, dynamic load capacity C is typically 18–25 kN → assume 20 kN).
- Tag that \`given[i]\` row as \`source: { "kind": "ai", "label": "AI assumed typical value — verify against datasheet" }\`.
- Do NOT invent any URL or claim a datasheet was consulted.
- In the \`summary\` field, include one sentence naming the assumed value and inviting the user to replace it (e.g. "C assumed as 20 kN (typical for EMA-80 class) — replace with the actual datasheet value for an accurate result.").
- Also set \`chat_summary\` to a one-sentence note, e.g. "Calculated using assumed C = 20 kN (typical for EMA-80 class) — replace with the actual datasheet value for an accurate result."

PATH B — Refuse the calculation (ONLY when you genuinely cannot estimate a reasonable typical value — e.g. a fully bespoke one-off part with no analogous product class in your training):
- OMIT \`calculation_section\` ENTIRELY from your JSON response. Do NOT emit a partial calc card with placeholder values.
- In \`chat_summary\`, write a short plain-English message that:
  (a) names the missing field (e.g. "dynamic load capacity C"),
  (b) explains in one sentence why it is needed for this calculation,
  (c) offers two ways forward: provide the value directly, OR paste a link to the manufacturer's datasheet PDF so it can be parsed.

PRODUCT (user-named, NOT verified): "${candidate}"
RESOLUTION: not_resolved
`, resolved: null };
    }
    console.log(`ℹ️ [HybridEngine.ProductContext] No named product and no prior product in history — pure first-turn calculation`);
    return { block: '', resolved: null };
  }

  const truncated = resolved.datasheetText
    ? resolved.datasheetText.slice(0, perProductChars).replace(/\n{3,}/g, '\n\n').trim()
    : '';
  const attrLines = resolved.attributes.length > 0
    ? resolved.attributes.map(a => `  - ${a.label}: ${a.value}${a.unit ? ' ' + a.unit : ''}`).join('\n')
    : '  (none recorded in catalog metadata)';

  // The agent's `given[i].source.url` becomes the click target for the chip
  // in CalcCard. We pass the URL through for ALL layers when one exists:
  //   - DB / history: the relative `/uploads/<path>` route already serves the
  //     stored PDF, so a relative URL works as a click target.
  //   - Web: the manufacturer URL we resolved.
  const citationUrl = resolved.datasheetUrl || '';
  const citationUrlSnippet = citationUrl ? `, "url": "${citationUrl}"` : '';
  const citationKindForAgent: 'datasheet_pdf' | 'db' | 'web' = resolved.datasheetText
    ? (resolved.layer === 'web' && !resolved.datasheetUrl ? 'web' : 'datasheet_pdf')
    : (resolved.layer === 'web' ? 'web' : 'db');
  const citationLabel = resolved.layer === 'web'
    ? `${resolved.name} datasheet${resolved.companyName ? ' — ' + resolved.companyName : ''}`
    : `${resolved.name} datasheet${resolved.companyName ? ' — ' + resolved.companyName : ''}`;

  const datasheetUrlLine = citationUrl
    ? `Datasheet URL: ${citationUrl}`
    : 'No datasheet PDF on file.';

  const turnDescriptor = hasCandidate
    ? `NAMES a specific product (matched on token "${candidates[0]}")`
    : `is a follow-up calculation referring back to a product previously discussed in this conversation`;

  console.log(`📐 [HybridEngine.ProductContext] Built block via layer=${resolved.layer} for product="${resolved.name}" (candidate=${hasCandidate ? `"${candidates[0]}"` : '<none, follow-up>'}) — kind=${citationKindForAgent}, attrs=${resolved.attributes.length}, datasheetChars=${truncated.length}, hasUrl=${Boolean(citationUrl)}`);

  return { block: `## PRODUCT CONTEXT — NAMED PRODUCT FOR CALCULATION

The user's query ${turnDescriptor}. Use the structured attributes and the datasheet excerpt below as the AUTHORITATIVE inputs to the calculation. For every \`given[i]\` value you can match to data in this block:
- Pull the value from this block (NOT from your own training).
- Set \`given[i].source\` to \`{ "kind": "${citationKindForAgent}", "label": "${citationLabel}"${citationUrlSnippet} }\`. Pass the \`url\` through verbatim — it is the click target for the user. Do NOT invent additional URLs beyond the one provided here.
- Cite this product context in \`formula_sources\` when the formula itself comes from the manufacturer's catalog (use \`{ "label": "${citationLabel}", "kind": "manufacturer"${citationUrlSnippet} }\`).

PER-INPUT GROUNDING RULE (CRITICAL — handles partial datasheets):
This block may NOT contain every input the formula needs. Treat the rule above as opt-in per row, not blanket: only cite this block for a \`given[i]\` row when the value actually appears in the STRUCTURED CATALOG ATTRIBUTES or DATASHEET EXCERPT below. For each input that is NOT in this block:
- If it came from the user prompt → \`source: { "kind": "user", "label": "User input" }\`.
- If it is a generic engineering constant from your training (gravity, friction coefficient, textbook bearing exponent, etc.) → \`source: { "kind": "ai", "label": "AI engineering reference" }\`. Do NOT tag generic constants as \`datasheet_pdf\` / \`db\` / \`web\` and do NOT label them with "example" wording.
- If it is a product-specific value (e.g. dynamic load capacity C, stall torque, rated push force) AND neither this block nor the user prompt provides it: FIRST try PATH C — use your engineering training to pick a conservative mid-range typical value for that parameter class, tag it as \`source: { "kind": "ai", "label": "AI assumed typical value — verify against datasheet" }\` (no URL), include one sentence in \`summary\` naming the assumed value and inviting the user to replace it, AND also set \`chat_summary\` to a one-sentence note naming the assumed value (e.g. "Calculated using assumed C = 20 kN (typical for this actuator class) — replace with the actual datasheet value for an accurate result."). ONLY fall back to refusing (omitting \`calculation_section\` entirely) if no reasonable typical value exists for this product class${citationUrl ? ` (the partial datasheet you DID find is at ${citationUrl}, so reference that URL in any refusal message)` : ''}.

PRODUCT: "${resolved.name}"${resolved.companyName ? ` — ${resolved.companyName}` : ''}
RESOLUTION LAYER: ${resolved.layer}
${datasheetUrlLine}

STRUCTURED CATALOG ATTRIBUTES (kind="db"):
${attrLines}

${truncated ? `DATASHEET EXCERPT (kind="${citationKindForAgent}"):\n${truncated}` : 'DATASHEET EXCERPT: (none — datasheet PDF not available; use catalog attributes above and explicitly mark any other values as kind="ai")'}
`, resolved };
}

// For products previously shown to the user (verified database items with
// datasheets), re-load their datasheet text so the agent can reason over
// real spec data when answering follow-up questions about those products.
// `excludeIds` are products already injected via the current dbContextBlock —
// no need to duplicate them.
async function buildPreviousVerifiedDatasheetsBlock(
  chatHistory: ChatHistoryMessage[],
  excludeIds: Set<number>,
  maxProducts = 5,
  perProductChars = 2000,
): Promise<string> {
  const previousIds = extractDbProductIdsFromHistory(chatHistory).filter(id => !excludeIds.has(id));
  if (previousIds.length === 0) return '';

  const candidateIds = previousIds.slice(-maxProducts).reverse();
  const entries: string[] = [];

  for (let i = 0; i < candidateIds.length; i++) {
    const id = candidateIds[i];
    try {
      const product = await storage.getProduct(id);
      if (!product) continue;
      const datasheetRelPath = (product as any).datasheetPath || '';
      if (!datasheetRelPath || !datasheetRelPath.startsWith('/uploads/')) continue;
      const fullPath = path.join(process.cwd(), `.${datasheetRelPath}`);
      if (!fs.existsSync(fullPath)) continue;

      const pdfText = await getCachedPdfText(fullPath);
      if (!pdfText) continue;

      let companyName = '';
      if (product.companyId) {
        try {
          const company = await storage.getCompany(product.companyId);
          companyName = company?.name || '';
        } catch {
          // company lookup failures are non-fatal
        }
      }

      const truncatedText = pdfText.slice(0, perProductChars).replace(/\n{3,}/g, '\n\n').trim();
      const header = `${i + 1}. [PREVIOUS_DB_PRODUCT id=${id}] "${product.name}"${companyName ? ` by ${companyName}` : ''}`;
      entries.push(`${header}\n   DATASHEET CONTENT:\n   ${truncatedText}`);
      console.log(`📄 [HybridEngine] Re-loaded verified datasheet for previously-discussed product #${id} "${product.name}" (${pdfText.length} chars, cached: ${PDF_TEXT_CACHE.has(fullPath)})`);
    } catch (err: any) {
      console.warn(`⚠️ [HybridEngine] Failed to re-load datasheet for previously-discussed product #${id}: ${err?.message}`);
    }
  }

  if (entries.length === 0) return '';

  return `## VERIFIED DATASHEETS — PRODUCTS PREVIOUSLY DISCUSSED IN THIS CONVERSATION

These verified PDF datasheets belong to DeepFolder catalog products you have already shown the user earlier in this conversation. They are reliable, first-party technical sources.

${entries.join('\n\n')}

REASONING INSTRUCTIONS — WHEN TO USE THIS DATA:
- Read the user's current question carefully. If the question is a follow-up about ANY of the products above (e.g. "what's its IP rating?", "can it handle 24V?", "what's the torque?", "compare the first two", "how does it mount?"), you MUST treat the DATASHEET CONTENT above as the authoritative source and answer directly from it. Do NOT guess and do NOT invent specs that contradict the datasheet.
- When the user references a product by name, by position ("the first one", "the second", "the SEW one"), by id, or by an attribute previously mentioned, resolve the reference to the matching product above and ground your answer in its datasheet text.
- If the datasheet text contains the answer: cite it with kind="datasheet" and a label naming the product (e.g. "DeepFolder catalog datasheet — <Product Name>"). Do NOT fabricate a URL.
- If the datasheet text does NOT contain the answer (the spec is genuinely missing from the PDF): say so honestly, then either fall back to the manufacturer's web datasheet via web search, or answer from model_knowledge — never invent a value just because a datasheet was provided.
- If the user's current question is clearly about a different topic or different products entirely, you may ignore this block.
`;
}

const REPUTATION_TIERS: Record<string, number> = {};

const TIER_1: string[] = [
  'siemens', 'bosch', 'bosch rexroth', 'abb', 'schneider electric',
  'honeywell', 'mitsubishi electric', 'omron', 'fanuc', 'rockwell automation',
  'allen-bradley', 'emerson', 'parker hannifin', 'parker', 'festo',
  'sew-eurodrive', 'sew eurodrive', 'beckhoff', 'yaskawa', 'kuka',
  'danfoss', 'eaton', 'phoenix contact', 'wago', 'pilz',
  'rexroth', 'lenze', 'nord drivesystems', 'nord', 'baumüller', 'baumuller',
  'ge', 'general electric', 'weg', 'nidec', 'danaher',
  'texas instruments', 'analog devices', 'infineon', 'stmicroelectronics',
  'intel', 'nvidia', 'amd', 'qualcomm', 'microchip', 'nxp',
  'samsung', 'lg', 'panasonic', 'sony', 'toshiba', 'hitachi',
  'caterpillar', 'john deere', 'atlas copco', 'sandvik',
  'TE connectivity', 'amphenol', 'molex',
];

const TIER_2: string[] = [
  'maxon', 'maxon motor', 'maxon group', 'pololu', 'nanotec',
  'oriental motor', 'harmonic drive', 'harmonicdrive',
  'thk', 'nsk', 'skf', 'igus', 'hiwin', 'renishaw',
  'sick', 'balluff', 'ifm', 'keyence', 'pepperl+fuchs', 'pepperl fuchs',
  'turck', 'banner engineering', 'baumer', 'wenglor', 'leuze',
  'murrelektronik', 'murr elektronik', 'weidmüller', 'weidmuller',
  'rittal', 'harting', 'lapp', 'helukabel',
  'norelem', 'elesa+ganter', 'elesa ganter', 'kipp', 'halder',
  'misumi', 'item', 'bosch rexroth', 'bossard',
  'flir', 'cognex', 'basler', 'ids imaging',
  'universal robots', 'doosan robotics', 'cobot',
  'raspberry pi', 'arduino',
  'mean well', 'traco power', 'puls', 'wago',
  'dunkermotoren', 'ebm-papst', 'ebm papst', 'ziehl-abegg',
  'bonfiglioli', 'wittenstein', 'neugart', 'apex dynamics',
  'stäubli', 'staubli', 'schunk', 'zimmer group',
  'faulhaber', 'portescap', 'moog', 'kollmorgen',
  'heidenhain', 'rexroth', 'num', 'fagor',
];

const TIER_3: string[] = [
  'stepperonline', 'trinamic', 'ams', 'allegro microsystems',
  'sensata', 'te connectivity', 'vishay', 'rohm', 'on semiconductor',
  'renesas', 'cypress', 'lattice semiconductor',
  'sparkfun', 'adafruit', 'seeed studio', 'dfrobot',
  'creality', 'prusa', 'bambu lab', 'ultimaker', 'formlabs',
  'openbuilds', 'ooznest', 'ratrig',
  'actuonix', 'firgelli', 'linak',
  'beckhoff automation', 'b&r', 'br automation',
  'contrinex', 'datalogic', 'di-soric',
  'wika', 'endress+hauser', 'endress hauser', 'krohne', 'vega',
  'smc', 'aventics', 'camozzi', 'metal work',
  'gates', 'continental', 'optibelt',
];

for (const name of TIER_1) REPUTATION_TIERS[name.toLowerCase()] = 100;
for (const name of TIER_2) REPUTATION_TIERS[name.toLowerCase()] = 80;
for (const name of TIER_3) REPUTATION_TIERS[name.toLowerCase()] = 60;

function getCompanyReputation(companyName: string): number {
  if (!companyName) return 30;
  const normalized = companyName.toLowerCase()
    .replace(/\s*(gmbh|ag|inc|corp|ltd|llc|co\.?|kg|se|sa|s\.?a\.?|plc|pty|b\.?v\.?|n\.?v\.?|s\.?r\.?l\.?|oy|as|a\/s)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (REPUTATION_TIERS[normalized] !== undefined) return REPUTATION_TIERS[normalized];

  for (const [key, score] of Object.entries(REPUTATION_TIERS)) {
    if (normalized.includes(key) || key.includes(normalized)) return score;
  }

  return 30;
}

interface CacheEntry {
  result: HybridSearchResult;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_SIZE = 50;
const searchCache = new Map<string, CacheEntry>();

export function clearSearchCache(): void {
  const size = searchCache.size;
  searchCache.clear();
  console.log(`🧹 [HybridSearch] Cache cleared (removed ${size} entries)`);
}

clearSearchCache();
console.log(`🧹 [HybridSearch] Cache ready — TTL ${CACHE_TTL_MS / 1000}s, max ${CACHE_MAX_SIZE} entries`);

function normalizeQueryKey(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

function getCachedResult(query: string): HybridSearchResult | null {
  const key = normalizeQueryKey(query);
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  console.log(`📦 [HybridSearch] Cache hit for: "${key}"`);
  return entry.result;
}

function setCachedResult(query: string, result: HybridSearchResult): void {
  const key = normalizeQueryKey(query);
  if (searchCache.size >= CACHE_MAX_SIZE) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) searchCache.delete(oldestKey);
  }
  searchCache.set(key, { result, timestamp: Date.now() });
}

export const DEFAULT_CONFIG: HybridSearchConfig = {
  webWeight: 0.3,
  databaseWeight: 0.7,
  maxWebResults: 5,
  maxDatabaseResults: 5,
  timeoutMs: 30000,
};

export interface InterpretedRequirement {
  parameter: string;
  requirement: string;
  type: 'hard' | 'soft';
}

export interface HybridSearchResult {
  success: boolean;
  products: UnifiedProduct[];
  productCards: ProductCard[];
  chatSummary: string;
  logicExplanation: string;
  interpretedRequirements?: InterpretedRequirement[];
  decisionSummary?: string;
  bestFit?: string;
  alternativeSuggestion?: string;
  searchGuidance?: string;
  alternativeSearches?: { label: string; query: string }[];
  bomTable?: import('../agents/agent-search').BomItem[];
  bomSummary?: string;
  engineeringNotes?: string;
  comparisonTable?: import('../agents/agent-search').ComparisonTableData;
  calculationSection?: import('../agents/agent-search').CalculationSection;
  webResults: number;
  databaseResults: number;
  error?: string;
  agentUsage?: AgentUsageInfo;
  searchedManufacturers?: Array<{ name: string; domain: string; tier: 1 | 2 | 3 }>;
  userOverrideSource?: string;
}

function createProductCard(product: UnifiedProduct, index: number, requestId: string): ProductCard {
  const locationStr = [
    product.structured_data.company.address.city,
    product.structured_data.company.address.country_code
  ].filter(Boolean).join(', ');

  return {
    id: `product-${requestId}-${index}`,
    product_name: product.fluid_data.product_name,
    brand: product.fluid_data.brand || product.structured_data.company.name,
    description: product.fluid_data.description,
    ai_summary: product.fluid_data.ai_summary || product.fluid_data.description,
    company: {
      name: product.structured_data.company.name,
      website: product.structured_data.company.website,
      location: locationStr || product.structured_data.company.address,
    },
    reference_link: product.structured_data.files.reference_link,
    datasheet_url: product.structured_data.files.datasheet_url,
    image_url: product.source === 'database' ? (product._dbImagePath || undefined) : undefined,
    model_url: product.source === 'database' ? (product._dbModelPath || undefined) : undefined,
    document_urls: product.source === 'database' ? product._dbDocumentPaths : undefined,
    fit_score: product.fluid_data.fit_score,
    score_reason: product.fluid_data.score_reason,
    verification_status: product.source === 'database' ? 'verified' : 'web',
    attributes: product.fluid_data.attributes,
    source: product.source,
    link_status: product.link_status || (product.source === 'database' ? 'verified' : 'unverified'),
    company_profile_url: product._dbCompanyId ? `/company/${product._dbCompanyId}` : undefined,
    product_profile_url: product._dbProductId ? `/product/${product._dbProductId}` : undefined,
    part_type: product.fluid_data.part_type || undefined,
    datasheet_verified: product.source === 'database' ? true : product.datasheet_verified,
  };
}

const VERIFIED_DB_BONUS = 2;

function mergeResults(
  webProducts: UnifiedProduct[],
  dbProducts: UnifiedProduct[],
  config: HybridSearchConfig
): UnifiedProduct[] {
  const dbSet = new Set(dbProducts);

  const byScore = (a: UnifiedProduct, b: UnifiedProduct) => {
    const effectiveA = (a.fluid_data.fit_score || 0) + (dbSet.has(a) ? VERIFIED_DB_BONUS : 0);
    const effectiveB = (b.fluid_data.fit_score || 0) + (dbSet.has(b) ? VERIFIED_DB_BONUS : 0);
    if (effectiveA !== effectiveB) return effectiveB - effectiveA;
    const repA = getCompanyReputation(a.structured_data.company.name);
    const repB = getCompanyReputation(b.structured_data.company.name);
    return repB - repA;
  };

  const maxResults = config.maxDatabaseResults + config.maxWebResults;
  const merged = [...dbProducts, ...webProducts]
    .sort(byScore)
    .slice(0, maxResults);

  const topDbScore = dbProducts.length > 0 ? Math.max(...dbProducts.map(p => p.fluid_data.fit_score || 0)) : 0;
  const topWebScore = webProducts.length > 0 ? Math.max(...webProducts.map(p => p.fluid_data.fit_score || 0)) : 0;
  console.log(`📊 [MergeResults] Merged ${merged.length} products by score — top DB: ${topDbScore}%, top Web: ${topWebScore}% (DB gets +${VERIFIED_DB_BONUS} tie-breaker bonus)`);

  return merged;
}

function generateConversationalSummary(
  products: UnifiedProduct[],
  webCount: number,
  dbCount: number,
  query: string,
  decisionSummary?: string
): string {
  const totalCount = products.length;
  const lines: string[] = [];

  if (decisionSummary && decisionSummary.trim().length > 60) {
    lines.push(decisionSummary.trim());

    if (totalCount > 0) {
      const dbProducts = products.filter(p => p.source === 'database');
      if (dbProducts.length > 0 && !decisionSummary.toLowerCase().includes('verified catalog') && !decisionSummary.toLowerCase().includes('database')) {
        lines.push('');
        lines.push(`${dbProducts.length} of these ${dbProducts.length > 1 ? 'are' : 'is'} from our verified catalog with confirmed specifications.`);
      }

      const companiesWithDatasheets = products.filter(p =>
        p.structured_data.files.datasheet_url && p.structured_data.files.datasheet_url.length > 0
      );
      if (companiesWithDatasheets.length > 0) {
        lines.push('');
        lines.push(`By the way, ${companiesWithDatasheets.length} of these ${companiesWithDatasheets.length > 1 ? 'have' : 'has a'} downloadable datasheet${companiesWithDatasheets.length > 1 ? 's' : ''} if you want to dig into the full specs.`);
      }
    }

    return lines.join('\n');
  }

  if (totalCount === 0) {
    lines.push(`I couldn't find products matching that exactly. Try adjusting the specs or broadening your search a bit — I'm happy to help you refine it.`);
    return lines.join('\n');
  }

  const sourceParts: string[] = [];
  if (dbCount > 0) sourceParts.push(`${dbCount} from our database`);
  if (webCount > 0) sourceParts.push(`${webCount} from manufacturer websites`);
  const sourceNote = sourceParts.length > 0 ? ` I pulled ${sourceParts.join(' and ')}.` : '';

  lines.push(`Here's what I found for you — ${totalCount} product${totalCount !== 1 ? 's' : ''} that look like a good match.${sourceNote}`);
  lines.push('');

  const topProducts = products.slice(0, 5);
  for (const p of topProducts) {
    const name = p.fluid_data.product_name || 'Product';
    const company = p.structured_data.company.name || '';
    const score = p.fluid_data.fit_score;
    const keyAttrs = (p.fluid_data.attributes || []).slice(0, 2)
      .map(a => `${a.label}: ${a.value}${a.unit ? ' ' + a.unit : ''}`)
      .join(', ');
    const hasDatasheet = p.structured_data.files.datasheet_url && p.structured_data.files.datasheet_url.length > 0;

    let line = `**${name}**`;
    if (company) line += ` by ${company}`;
    if (score && score > 0) line += ` — ${score}% match`;
    if (keyAttrs) line += ` (${keyAttrs})`;
    if (hasDatasheet) line += ' — datasheet available';
    lines.push(`• ${line}`);
  }

  const topScored = products
    .filter(p => p.fluid_data.fit_score && p.fluid_data.fit_score > 0)
    .sort((a, b) => (b.fluid_data.fit_score || 0) - (a.fluid_data.fit_score || 0));

  if (topScored.length >= 1) {
    const best = topScored[0];
    lines.push('');
    lines.push(`If I had to pick one, I'd start with the **${best.fluid_data.product_name}**${best.structured_data.company.name ? ` from ${best.structured_data.company.name}` : ''} — it's the strongest match for what you described.`);
  }

  lines.push('');
  lines.push('Want me to compare any of these, find alternatives, or break down the specs?');

  return lines.join('\n');
}

function extractKeySpecsSummary(products: UnifiedProduct[]): string {
  const specCounts = new Map<string, { values: string[], units: string }>();

  for (const product of products) {
    for (const attr of product.fluid_data.attributes || []) {
      if (!attr.label || !attr.value) continue;
      const key = attr.label.toLowerCase();
      if (!specCounts.has(key)) {
        specCounts.set(key, { values: [], units: attr.unit || '' });
      }
      specCounts.get(key)!.values.push(attr.value);
    }
  }

  const commonSpecs = Array.from(specCounts.entries())
    .filter(([, data]) => data.values.length >= 2)
    .slice(0, 3);

  if (commonSpecs.length === 0) return '';

  const specSummaries = commonSpecs.map(([label, data]) => {
    const numValues = data.values.map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (numValues.length >= 2) {
      const min = Math.min(...numValues);
      const max = Math.max(...numValues);
      const unit = data.units ? ` ${data.units}` : '';
      if (min === max) {
        return `${label}: ${min}${unit}`;
      }
      return `${label}: ${min}–${max}${unit}`;
    }
    const unique = Array.from(new Set(data.values)).slice(0, 3);
    return `${label}: ${unique.join(', ')}`;
  });

  return `Key specs across results — ${specSummaries.join(' | ')}.`;
}

export async function executeHybridSearch(
  query: string,
  requestId: string,
  config: Partial<HybridSearchConfig> = {},
  onProgress?: (message: string) => void,
  chatHistory: ChatHistoryMessage[] = [],
  onToken?: (token: string) => void,
  classification?: QueryClassification,
  isForcedProductSearch?: boolean,
  precomputedManufacturerDiscovery?: ManufacturerDiscoveryResult,
  sessionId?: number | null,
  userId?: string | null,
  onRequirements?: (reqs: InterpretedRequirement[], mode: 'build' | 'search', expertName?: string) => void
): Promise<HybridSearchResult> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (classification?.strategy.is_multi_product_set) {
    finalConfig.maxWebResults = Math.max(finalConfig.maxWebResults, classification.strategy.suggested_product_count);
  }

  // Brand enumeration: raise the cap so single-brand listing queries
  // ("list all linear actuators from Schaeffler") can return 8–20 distinct
  // models from the same brand instead of being capped at the default 5.
  if (classification?.strategy.is_brand_enumeration) {
    finalConfig.maxWebResults = Math.max(
      finalConfig.maxWebResults,
      Math.min(20, classification.strategy.suggested_product_count || 12)
    );
  }

  const isFirstQuery = chatHistory.length === 0;
  if (isFirstQuery) {
    const cached = getCachedResult(query);
    if (cached) {
      onProgress?.('Retrieved cached results');
      return cached;
    }
  }

  try {
    onProgress?.('Starting hybrid search...');

    const conversationalIntents = new Set(['explanation', 'follow_up', 'general_chat']);
    const useOriginalQuery = classification && conversationalIntents.has(classification.intent);
    const searchQuery = useOriginalQuery ? query : (classification?.enriched_query || query);

    // Use the structured extractor as the source of truth for "did the
    // previous turn show products?" The legacy heuristic sniffed for JSON
    // tokens like `fit_score` / `product_name` / `reference_link` that never
    // appear in the human-readable history the frontend actually sends, so
    // it always returned false and broke every follow-up grounding path.
    const previousProducts = extractPreviousProductsFromHistory(chatHistory);
    const previousSearchHadProducts = previousProducts.length > 0;

    // Build a compact list of previously-shown product names for context injection into buildAgentContext.
    const previousProductNames = previousProducts
      .map(p => [p.manufacturer, p.name].filter(Boolean).join(' '))
      .filter(Boolean)
      .slice(0, 10);

    // Clarification / comparison / calculation follow-ups answer from cached context — no web search.
    const noWebFollowUpTypes = new Set(['clarification', 'comparison', 'calculation']);
    const followUpNeedsWebSearch = !classification?.follow_up_answer_type ||
      !noWebFollowUpTypes.has(classification.follow_up_answer_type);

    // isSpecRefinement: follow-up adds a numeric spec to a previous search → upgrade to web search.
    // Only applies when the follow-up sub-type actually needs a new search (not clarification/comparison/calculation).
    const isSpecRefinement = classification?.intent === 'follow_up' && previousSearchHadProducts &&
      /\d/.test(query) && !classification.strategy.needs_web_search && followUpNeedsWebSearch;
    if (isSpecRefinement) {
      console.log(`🔄 [HybridEngine] Follow-up adds specs to previous product search — upgrading to web search`);
    }

    const productContextIntents = new Set(['explanation', 'follow_up']);
    const isProductContextFollowUp = classification && productContextIntents.has(classification.intent) && previousSearchHadProducts
      && (classification.intent !== 'follow_up' || followUpNeedsWebSearch);
    if (isProductContextFollowUp && !classification?.strategy.needs_web_search) {
      console.log(`🔄 [HybridEngine] ${classification?.intent} intent with product history — upgrading to web search`);
    }

    const skipWebSearch = classification && !classification.strategy.needs_web_search && !isSpecRefinement && !isProductContextFollowUp;
    const skipDatabase = skipWebSearch || (classification && !classification.strategy.needs_product_cards && !isSpecRefinement && !isProductContextFollowUp);

    onProgress?.('Checking DeepFolder database first...');

    const manufacturerDiscovery: ManufacturerDiscoveryResult = precomputedManufacturerDiscovery || {
      manufacturers: [],
      userOverride: false,
      searchScope: 'manufacturers',
      domain_used: classification?.domain || 'general',
    };

    const dbResult = skipDatabase
      ? ({ success: true, products: [], error: undefined } as DatabaseSearchResult)
      : await executeDatabaseSearch(searchQuery, finalConfig.maxDatabaseResults);

    let dbContextBlock = '';
    if (dbResult.success && dbResult.products.length > 0) {
      const dbSummaryParts: string[] = [];
      for (let i = 0; i < Math.min(dbResult.products.length, 5); i++) {
        const p = dbResult.products[i];
        const name = p.fluid_data.product_name || 'Unknown';
        const company = p.structured_data.company.name || '';
        const hasDatasheet = p.structured_data.files.datasheet_url ? 'YES' : 'NO';
        const attrs = (p.fluid_data.attributes || []).slice(0, 10)
          .map(a => `${a.label}: ${a.value}${a.unit ? ' ' + a.unit : ''}`)
          .join(', ');
        let entry = `${i + 1}. [DB_PRODUCT] "${name}" by ${company} — Datasheet: ${hasDatasheet}${attrs ? ` — Specs: ${attrs}` : ''}`;

        const datasheetRelPath = p._dbDatasheetPath || p.structured_data.files.datasheet_url || '';
        if (datasheetRelPath) {
          const pdfText = await resolveDatasheetText(datasheetRelPath);
          if (pdfText) {
            const truncatedText = pdfText.slice(0, 2000).replace(/\n{3,}/g, '\n\n').trim();
            entry += `\n   DATASHEET CONTENT:\n   ${truncatedText}`;
            console.log(`📄 [HybridEngine] Extracted ${pdfText.length} chars from datasheet for "${name}" (showing first 2000)`);
          }
        }

        dbSummaryParts.push(entry);
      }
      const dbSummaries = dbSummaryParts.join('\n');
      dbContextBlock = `## DEEPFOLDER DATABASE MATCHES (VERIFIED CATALOG)\n\nThe following products were found in DeepFolder's verified database. You MUST evaluate each one against the user's requirements — compare specifications from attributes AND datasheet content to determine how well each product matches.\n\n${dbSummaries}\n\nMANDATORY RULES FOR DATABASE PRODUCTS:\n- EVERY database product listed above MUST appear in your products array. Do NOT omit any database product — even if you find a better web alternative from the same manufacturer. Include both.\n- Use the EXACT product name shown above — do not rename or substitute it with a different model from the same brand.\n- Do NOT replace a database product with a web-found variant. Always include the DB product AND any web alternatives separately.\n- Assign each database product an honest fit_score based on how well its specs match the user's requirements. Use the DATASHEET CONTENT to verify specs.\n- Do NOT inflate fit_score just because it is a verified catalog product. Score honestly.\n- If a database product does NOT meet ANY hard requirement (all specs undersized), assign fit_score ≤ 10.\n- CRITICAL — ATTRIBUTES MUST COME FROM THIS PRODUCT'S OWN DATA ONLY: For each [DB_PRODUCT] listed above, its attributes array MUST be populated exclusively from (a) the "Specs:" fields shown in this block for that product, and (b) the "DATASHEET CONTENT:" section shown in this block for that same product. Do NOT use web search results or your training knowledge about any other model — including variants, successors, or products with similar names — to fill in a DB product's attributes. Each product's specs must come only from its own verified data. If a spec is not present in this block for this specific product, omit that attribute entirely — never borrow a value from a different model.\n- CRITICAL: You MUST ALSO search the web for additional products. Always return BOTH database products AND web-found products. Never return only database products — the user needs market alternatives too. Returning 0 web products is NOT acceptable.`;
      console.log(`📦 [HybridEngine] Injecting ${dbResult.products.length} database product(s) as agent context with datasheet data`);
    }

    // Re-inject datasheets for verified DB products the user discussed earlier
    // in this conversation. Lets the agent reason directly from real spec PDFs
    // when answering follow-up questions about previously-shown catalog items.
    if (chatHistory.length > 0) {
      const currentDbIds = new Set<number>(
        (dbResult.products || [])
          .map(p => p._dbProductId)
          .filter((id): id is number => typeof id === 'number')
      );
      try {
        const previousDatasheetsBlock = await buildPreviousVerifiedDatasheetsBlock(chatHistory, currentDbIds);
        if (previousDatasheetsBlock) {
          dbContextBlock = dbContextBlock
            ? `${dbContextBlock}\n\n${previousDatasheetsBlock}`
            : previousDatasheetsBlock;
          console.log(`📚 [HybridEngine] Injected verified datasheets for previously-discussed products into agent context`);
        }
      } catch (err: any) {
        console.warn(`⚠️ [HybridEngine] Failed to build previous-datasheets block: ${err?.message}`);
      }
    }

    onProgress?.('Searching web for additional products...');
    const hasDbResults = dbResult.success && dbResult.products.length > 0;
    // Do NOT force web search for calculation_search intent — the ProductContextBlock
    // built from the DB / history already contains all spec data the agent needs.
    // Forcing web search here adds ~75s of latency for zero benefit.
    const forceWebForDb = hasDbResults && classification && !classification.strategy.needs_web_search
      && classification.intent !== 'calculation_search';
    if (forceWebForDb) {
      console.log(`🌐 [HybridEngine] Forcing web search ON because database returned ${dbResult.products.length} results — user needs web alternatives too`);
    }
    const effectiveClassification = (isSpecRefinement || forceWebForDb || isProductContextFollowUp) && classification ? {
      ...classification,
      strategy: { ...classification.strategy, needs_web_search: true, needs_product_cards: isProductContextFollowUp ? classification.strategy.needs_product_cards : true }
    } : classification;

    // Calculation-search ground truth + follow-up/explanation anchoring: when
    // the prompt names a specific product OR there's a previously-shown
    // product to fall back on, resolve real DB / datasheet / web context
    // BEFORE the agent runs so it answers from real spec data instead of
    // guessing or drifting to the wrong brand. See tasks #253 and #285.
    let productContextBlock: string | undefined;
    let calcResolvedContext: ResolvedProductContext | null = null;
    let anchorManufacturer: string | undefined;
    let anchorMatchedProduct: PreviousProduct | undefined;
    let pinnedSearchQuery = searchQuery;
    const productContextEligibleIntents = new Set(['calculation_search', 'follow_up', 'explanation']);
    const turnCandidates = extractProductNameCandidates(query);
    const intentEligibleForContext = classification && productContextEligibleIntents.has(classification.intent);
    const shouldBuildProductContext = intentEligibleForContext &&
      (turnCandidates.length > 0 || previousProducts.length > 0);

    if (shouldBuildProductContext) {
      // Pick a manufacturer to anchor any web search to so a short token like
      // "EMA-80" stays pinned to the brand we just showed (e.g. Schaeffler).
      const anchor = pickAnchorFromHistory(previousProducts, turnCandidates);
      anchorManufacturer = anchor.manufacturer;
      anchorMatchedProduct = anchor.matched;

      // For follow-ups that name a model token AND have a manufacturer to
      // anchor to, prepend the manufacturer to the agent's web-search query
      // so its own web tool also gets the anchored query.
      if (turnCandidates.length > 0 && anchorManufacturer) {
        const lcQuery = pinnedSearchQuery.toLowerCase();
        if (!lcQuery.includes(anchorManufacturer.toLowerCase())) {
          pinnedSearchQuery = `${anchorManufacturer} ${pinnedSearchQuery}`;
          console.log(`🔗 [HybridEngine.Anchor] Pinned web-search query to manufacturer "${anchorManufacturer}" — query="${pinnedSearchQuery}"`);
        }
      }

      try {
        // Explanation (Explore) queries are single-product focused — give them
        // 3× the default datasheet budget so the agent reads actual spec data
        // instead of filling the table from model knowledge.
        const exploreChars = classification?.intent === 'explanation' ? 30000 : undefined;
        const { block, resolved } = await buildProductContextBlock(
          query,
          chatHistory,
          dbResult.products || [],
          exploreChars,
          { anchorManufacturer },
        );
        if (block) {
          productContextBlock = block;
          if (classification?.intent === 'calculation_search') {
            onProgress?.('Loaded named product context for calculation grounding');
          } else {
            onProgress?.('Loaded previously-discussed product context for follow-up grounding');
          }
        }
        calcResolvedContext = resolved;
      } catch (err: any) {
        console.warn(`⚠️ [HybridEngine] Failed to build product context block: ${err?.message}`);
      }
    }

    if (classification && (classification.intent === 'follow_up' || classification.intent === 'explanation')) {
      const datasheetReinjected = !!(chatHistory.length > 0 && previousProducts.some(p => typeof p.id === 'number'));
      console.log(`🔗 [Followup] anchor=${anchorMatchedProduct?.name || calcResolvedContext?.name || '<none>'} (intent=${classification.intent}, layer=${calcResolvedContext?.layer || 'none'}, productId=${calcResolvedContext?.productId ?? anchorMatchedProduct?.id ?? 'none'}, datasheetReinjected=${datasheetReinjected}, webPinnedTo=${anchorManufacturer || '<none>'})`);
    }

    const agentResult = await executeAgentSearch(pinnedSearchQuery, chatHistory, onToken, effectiveClassification, isForcedProductSearch, dbContextBlock || undefined, manufacturerDiscovery, productContextBlock, sessionId, userId, previousProductNames);

    // Emit requirements immediately after the agent finishes — before link recovery
    // and datasheet verification add another 10-20s of latency.
    if (onRequirements && agentResult.interpretedRequirements && agentResult.interpretedRequirements.length > 0) {
      const reqMode: 'build' | 'search' = classification?.intent === 'build' ? 'build' : 'search';
      onRequirements(agentResult.interpretedRequirements, reqMode, undefined);
    }

    onProgress?.('Merging results...');

    const agentProducts = agentResult.success ? agentResult.products : [];

    if (isForcedProductSearch && agentResult.bomTable && agentResult.bomTable.length > 0) {
      console.log(`🔧 [HybridEngine] Stripping BOM data from agent result — forced product_search mode`);
      agentResult.bomTable = undefined;
      agentResult.bomSummary = undefined;
      agentResult.engineeringNotes = undefined;
    }
    
    const isExplanationResponse = !isForcedProductSearch && agentResult.decisionSummary && 
                                   agentProducts.length === 0 && 
                                   (agentResult.interpretedRequirements?.length === 0 || !agentResult.interpretedRequirements);
    
    const isGuidanceResponse = !isForcedProductSearch && !isExplanationResponse &&
                                agentResult.decisionSummary && agentResult.decisionSummary.trim().length > 30 &&
                                agentProducts.length === 0;

    const rawDbProducts = isExplanationResponse ? [] : (dbResult.success ? dbResult.products : []);
    const dbNameMap = new Map(rawDbProducts.map(p => [(p.fluid_data.product_name || '').toLowerCase().trim(), p]));

    const taggedWebProducts: UnifiedProduct[] = [];
    const taggedDbProducts: UnifiedProduct[] = [];

    // Extract distinctive model/part-number tokens from a product name.
    // These are alphanumeric tokens containing at least one digit and at least
    // 3 characters total (e.g. "EMA-80", "DIN912", "M10x30", "6306", "IRFZ44N").
    // Hyphens, dots and slashes inside a token are preserved so "EMA-80" stays
    // intact rather than splitting into "ema" + "80".
    const extractModelTokens = (name: string): Set<string> => {
      const tokens = new Set<string>();
      const normalized = name.toLowerCase();
      const matches = normalized.match(/[a-z0-9][a-z0-9\-./]*[a-z0-9]/g) || [];
      for (const tok of matches) {
        if (tok.length < 3) continue;
        if (!/\d/.test(tok)) continue; // must contain a digit to be a model number
        if (/^(19|20)\d{2}$/.test(tok)) continue; // skip years
        tokens.add(tok);
      }
      return tokens;
    };

    const dbModelIndex: Array<{ tokens: Set<string>; product: UnifiedProduct }> = rawDbProducts.map(p => ({
      tokens: extractModelTokens(p.fluid_data.product_name || ''),
      product: p,
    }));

    const findDbMatch = (agentName: string): UnifiedProduct | undefined => {
      const norm = agentName.toLowerCase().trim();
      if (!norm) return undefined;

      // 1. Exact name match (always strong)
      if (dbNameMap.has(norm)) return dbNameMap.get(norm);

      // 2. Substring containment with threshold guard.
      // - dbName.includes(norm): no guard needed — the DB entry is the longer
      //   string so the agent name is a meaningful prefix/suffix of it.
      // - norm.includes(dbName): require dbName covers ≥60 % of norm to avoid
      //   short generic DB names (e.g. "Gear") matching long unrelated agent
      //   names (e.g. "P1044 Formula 1 Gearbox Assembly"). Below threshold,
      //   emit a regression warning and fall through.
      for (const [dbName, dbProd] of dbNameMap) {
        if (!dbName) continue;
        if (dbName.includes(norm)) return dbProd;
        if (norm.includes(dbName)) {
          const ratio = dbName.length / norm.length;
          if (ratio >= 0.6) return dbProd;
          console.warn(
            `⚠️ [HybridEngine] Skipped weak substring DB match for "${agentName}": ` +
            `DB name "${dbName}" covers only ${Math.round(ratio * 100)}% of agent name (threshold 60%). ` +
            `Would have merged in old code — skipping to prevent false grafting.`
          );
        }
      }

      // 3. Shared model-number token (handles cases where the agent renames
      // the product, e.g. agent says "EWELLIX electric actuator EMA-80" and
      // DB has "EMA-80 electro-actuator" — both share the token "ema-80").
      // Require overlap / max(agentTokens, dbTokens) ≥ 0.5 — a single shared
      // token is not sufficient to establish identity.
      const agentTokens = extractModelTokens(agentName);
      if (agentTokens.size === 0) return undefined;

      let bestMatch: UnifiedProduct | undefined;
      let bestOverlap = 0;
      let bestRatio = 0;
      for (const { tokens, product } of dbModelIndex) {
        if (tokens.size === 0) continue;
        let overlap = 0;
        for (const t of agentTokens) {
          if (tokens.has(t)) overlap++;
        }
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestRatio = overlap / Math.max(agentTokens.size, tokens.size);
          bestMatch = product;
        }
      }

      if (!bestMatch || bestOverlap === 0) return undefined;

      if (bestRatio >= 0.5) return bestMatch;

      // Below token-overlap threshold — log regression warning and reject match.
      console.warn(
        `⚠️ [HybridEngine] Skipped weak token DB match for "${agentName}": ` +
        `overlap ratio ${bestRatio.toFixed(2)} < 0.5 (overlap=${bestOverlap}, ` +
        `agentTokens=${agentTokens.size}, matched DB: "${bestMatch.fluid_data.product_name}"). ` +
        `Would have merged in old code — skipping to prevent false grafting.`
      );
      return undefined;
    };

    for (const product of agentProducts) {
      const dbMatch = findDbMatch(product.fluid_data.product_name || '');
      if (dbMatch) {
        // Replace the agent (web) product entirely with the DB record.
        // DB records and web results are mutually exclusive: a result card must
        // come 100% from one source. The only agent-assigned value we preserve
        // is fit_score and score_reason — everything else (files, company info,
        // IDs, links) comes from the canonical DB record.
        const fitScore = product.fluid_data.fit_score;
        const scoreReason = product.fluid_data.score_reason;
        const replacedProduct: UnifiedProduct = {
          ...dbMatch,
          fluid_data: {
            ...dbMatch.fluid_data,
            // Preserve agent's per-query analysis — these are computed for
            // this specific search and are not stored in the DB record.
            fit_score: fitScore,
            score_reason: scoreReason,
            // attributes = key specs with ✓/✗ match indicators, agent-computed
            attributes: product.fluid_data.attributes?.length
              ? product.fluid_data.attributes
              : dbMatch.fluid_data.attributes,
            // ai_summary = agent's query-specific summary; fall back to DB value
            ai_summary: product.fluid_data.ai_summary || dbMatch.fluid_data.ai_summary,
          },
        };
        taggedDbProducts.push(replacedProduct);
        console.log(`🏷️ [HybridEngine] Replaced agent product "${product.fluid_data.product_name}" with full DB record "${dbMatch.fluid_data.product_name}" (fit_score: ${fitScore}, dbId: ${dbMatch._dbProductId})`);
      } else {
        taggedWebProducts.push(product);
      }
    }

    if (taggedDbProducts.length > 0 && taggedWebProducts.length === 0) {
      console.warn(`⚠️ [HybridEngine] Agent returned ${taggedDbProducts.length} DB product(s) but 0 web products — web search may not have found relevant alternatives`);
    }

    // Datasheet verification — fetch top-N web product PDFs and re-score against
    // user requirements. Mutates fit_score and attributes in place so the tier
    // filtering and re-ranking below use the refined scores.
    if (taggedWebProducts.length > 0 && !isExplanationResponse && !isGuidanceResponse) {
      onProgress?.('Verifying datasheets...');
      try {
        const verifyStats = await verifyWebProductDatasheets(
          searchQuery,
          [...taggedDbProducts, ...taggedWebProducts],
          agentResult.interpretedRequirements
        );
        if (verifyStats?._usage) {
          trackApiCall(requestId, {
            service: 'datasheet_verifier',
            model: verifyStats._usage.model,
            tokens: {
              prompt_tokens: verifyStats._usage.prompt_tokens,
              completion_tokens: verifyStats._usage.completion_tokens,
              total_tokens: verifyStats._usage.total_tokens,
            },
            duration_ms: verifyStats.duration_ms,
            timestamp: Date.now(),
          });
        }
      } catch (verifyErr: any) {
        console.warn(`⚠️ [HybridEngine] Datasheet verification skipped: ${verifyErr?.message}`);
      }
    }

    // For standardized catalog parts (e.g., bearing 6306, IRFZ44N), lower thresholds
    // so that valid multi-manufacturer alternatives (e.g., SKF 6306 at 73%) are not
    // hidden behind the STRONG floor designed for complex parametric queries.
    const isStandardPart = classification?.strategy.is_standard_part_query === true;
    const TIERS = isStandardPart
      ? { STRONG: 72, VIABLE: 55, PARTIAL: 40 }
      : { STRONG: 85, VIABLE: 70, PARTIAL: 50 };
    const MIN_RESULTS = 5;
    // Products scoring below this threshold are never shown, even when fewer
    // than MIN_RESULTS candidates are available. Tune here to adjust quality floor.
    // 35 blocks genuinely irrelevant results (0–34) while letting the tier fallback
    // work as designed. The previous 50 sat above PARTIAL(40/50), making partial
    // tier unreachable and discarding low-but-valid brand-specific results.
    const HARD_SCORE_FLOOR = 35;
    if (isStandardPart) {
      console.log(`⚙️ [HybridEngine] Standard part mode — lowered tier thresholds: STRONG=${TIERS.STRONG}, VIABLE=${TIERS.VIABLE}, PARTIAL=${TIERS.PARTIAL}`);
    }

    const getScore = (p: UnifiedProduct) => p.fluid_data.fit_score || 0;

    // Brand-confidence boost: when the user explicitly named a brand as a HARD
    // requirement and a product actually belongs to that brand, exempt it from the
    // hard score floor so link-verification penalties don't discard valid results.
    // The product's ORIGINAL score is preserved (not overwritten) so each product
    // displays its own distinct percentage.
    //
    // Token safety: tokens shorter than 3 characters are dropped to prevent single
    // letters (e.g. "G" from "iglidur G") from false-matching unrelated products.
    const explicitBrands: string[] = (agentResult.interpretedRequirements ?? [])
      .filter((r: any) => r.type === 'hard' && /brand|manufacturer/i.test(r.parameter))
      .flatMap((r: any) => (r.requirement as string).toLowerCase().split(/[\/,\s]+/).filter(Boolean))
      .filter((token: string) => token.length >= 3);

    const brandExemptSet = new Set<UnifiedProduct>();
    if (explicitBrands.length > 0) {
      for (const p of [...taggedDbProducts, ...taggedWebProducts]) {
        const name = (p.fluid_data.product_name || '').toLowerCase();
        const mfr  = (p.fluid_data.brand || p.structured_data?.company?.name || '').toLowerCase();
        const matchesBrand = explicitBrands.some(b => name.includes(b) || mfr.includes(b));
        const score = getScore(p);
        if (matchesBrand && score > 0 && score < HARD_SCORE_FLOOR) {
          brandExemptSet.add(p);
          console.log(
            `🏷️ [HybridEngine] Brand-match floor exemption for "${p.fluid_data.product_name}": ` +
            `score=${score} kept as-is (would have been removed by hard floor, explicit brand: ${explicitBrands.join(', ')})`
          );
        }
      }
    }

    const allTagged = [...taggedDbProducts, ...taggedWebProducts]
      .sort((a, b) => getScore(b) - getScore(a));

    const dbSet = new Set(taggedDbProducts);
    const strong  = allTagged.filter(p => getScore(p) >= TIERS.STRONG);
    const viable  = allTagged.filter(p => getScore(p) >= TIERS.VIABLE && getScore(p) < TIERS.STRONG);
    const partial = allTagged.filter(p => getScore(p) >= TIERS.PARTIAL && getScore(p) < TIERS.VIABLE);
    const weak    = allTagged.filter(p => getScore(p) < TIERS.PARTIAL);

    // Fill from top tier down — weak results are only appended to meet the
    // minimum floor when higher tiers are exhausted. They are labeled with
    // their score so users can see the quality difference.
    let shown: UnifiedProduct[] = [...strong];
    if (shown.length < MIN_RESULTS) shown = [...shown, ...viable];
    if (shown.length < MIN_RESULTS) shown = [...shown, ...partial];
    if (shown.length < MIN_RESULTS) shown = [...shown, ...weak];

    // Hard floor: never show products below the minimum acceptable score,
    // regardless of how few results remain after tier-fill.
    // Brand-exempt products (explicit brand HARD requirement matched) bypass this
    // filter so link-verification penalties don't discard them — they keep their
    // original scores so each displays a distinct percentage.
    const beforeFloor = shown.length;
    shown = shown.filter(p => getScore(p) >= HARD_SCORE_FLOOR || brandExemptSet.has(p));
    const floorRemoved = beforeFloor - shown.length;
    if (floorRemoved > 0) {
      console.log(`🚫 [HybridEngine] Hard floor (${HARD_SCORE_FLOOR}%) removed ${floorRemoved} product(s) with scores below threshold`);
    }
    if (brandExemptSet.size > 0) {
      console.log(`🏷️ [HybridEngine] ${brandExemptSet.size} brand-exempt product(s) bypassed hard floor`);
    }

    let filteredDb = shown.filter(p => dbSet.has(p));
    let filteredWeb = shown.filter(p => !dbSet.has(p));

    const weakShown = shown.filter(p => getScore(p) < TIERS.PARTIAL).length;
    console.log(`🔍 [HybridEngine] Tiers: ${strong.length} strong, ${viable.length} viable, ${partial.length} partial, ${weak.length} weak — showing ${shown.length} (${floorRemoved} below hard floor, ${weak.length - weakShown - floorRemoved} weak hidden)`);

    const mergedProducts = mergeResults(filteredWeb, filteredDb, finalConfig);

    const productCards = mergedProducts.map((product, index) => 
      createProductCard(product, index, requestId)
    );

    const finalDbCount = filteredDb.length;
    const finalWebCount = filteredWeb.length;

    let chatSummary = agentResult.chatSummary || '';
    
    const isBomResponse = agentResult.bomTable && agentResult.bomTable.length > 0;
    // Comparison-only response: blank chatSummary so the comparison table speaks for itself.
    // When products are ALSO present (search-and-compare flow), keep the conversational
    // summary so the user sees the recommendation alongside the product list.
    const isComparisonOnlyResponse = !!(agentResult.comparisonTable?.products.length) && mergedProducts.length === 0;

    if (isExplanationResponse || isGuidanceResponse || isBomResponse || isComparisonOnlyResponse) {
      chatSummary = '';
    } else if (mergedProducts.length > 0) {
      chatSummary = generateConversationalSummary(
        mergedProducts,
        finalWebCount,
        finalDbCount,
        query,
        agentResult.decisionSummary
      );
    } else if (agentResult.decisionSummary && agentResult.decisionSummary.trim().length > 30) {
      chatSummary = agentResult.decisionSummary.trim();
    } else if (!chatSummary) {
      chatSummary = `I searched for "${query}" but couldn't find matching products. Try rephrasing your requirements or broadening the specifications.`;
    }

    // Calculation-search safety net: when the agent returned no products for a
    // named-product calculation query (e.g. STEP 2 had no derived_specs to search
    // with), inject the resolved product so the user always sees something in the
    // results table even when the calculation itself was refused.
    // Also fires when results ARE present but the named product is not among them —
    // in that case the named product is injected at position 0 (front of list).
    // Priority: DB/history layer (resolved.productId) → web layer → NOT_RESOLVED name-match fallback.
    if (classification?.intent === 'calculation_search') {
      // Determine whether the named product is already represented in merged results.
      const calcCandidatesForCheck = extractProductNameCandidates(query);
      const existingNamedIdx = calcCandidatesForCheck.length > 0
        ? mergedProducts.findIndex(p => nameMatchesAnyCandidate(p.fluid_data.product_name || '', calcCandidatesForCheck))
        : -1;
      const namedProductAlreadyPresent = existingNamedIdx >= 0;
      const allDbProducts = dbResult.success ? (dbResult.products || []) : [];

      // UPGRADE PATH: named product is present but not DB-tagged. If a DB record exists for it
      // (via calcResolvedContext.productId, in-slice name match, or storage lookup), merge DB
      // metadata into the existing entry so the user gets the same verified card they saw in
      // the original product search (green ✓, manufacturer Web link, datasheet, 3D, etc.).
      if (namedProductAlreadyPresent) {
        const existing = mergedProducts[existingNamedIdx];
        const isAlreadyDbBacked = existing.source === 'database' || !!existing._dbProductId;
        if (!isAlreadyDbBacked) {
          try {
            // Resolve DB record: productId from context first, then name-match against catalog slice.
            let storedProduct: any = null;
            let dbProductId: number | undefined = calcResolvedContext?.productId;
            if (dbProductId) {
              storedProduct = await storage.getProduct(dbProductId);
            }
            if (!storedProduct) {
              const dbMatch = allDbProducts.find(p =>
                nameMatchesAnyCandidate(p.fluid_data.product_name || '', calcCandidatesForCheck)
              );
              if (dbMatch?._dbProductId) {
                dbProductId = dbMatch._dbProductId;
                storedProduct = await storage.getProduct(dbProductId);
              }
            }
            // Identity guard: only upgrade if the resolved DB record name actually matches
            // the existing entry's product name. This protects against bad context resolution
            // overwriting a web result with a different DB product's metadata.
            const storedName: string = storedProduct ? (storedProduct.name || '') : '';
            const identityMatches = storedProduct && (
              nameMatchesAnyCandidate(storedName, calcCandidatesForCheck) &&
              nameMatchesAnyCandidate(existing.fluid_data.product_name || '', [storedName])
            );
            if (storedProduct && dbProductId && identityMatches) {
              let companyWebsite = '';
              let companyCity = '';
              let companyCountry = '';
              let companyName = existing.structured_data?.company?.name || '';
              if (storedProduct.companyId) {
                try {
                  const company = await storage.getCompany(storedProduct.companyId);
                  if (company) {
                    companyWebsite = company.website || '';
                    companyCity = company.location || '';
                    companyCountry = (company as any).country || '';
                    if (!companyName) companyName = company.name || '';
                  }
                } catch {}
              }
              const dbReferenceLink = (storedProduct as any).productWebLink || '';
              const dbImagePath = (storedProduct as any).imagePath || '';
              const dbModelPath = (storedProduct as any).modelPath || '';
              const dbDatasheetPath = (storedProduct as any).catalogPath || calcResolvedContext?.datasheetUrl || '';
              const dbDocumentPaths = Array.isArray((storedProduct as any).documentPaths)
                ? ((storedProduct as any).documentPaths as string[]).filter((p) => typeof p === 'string' && p.length > 0)
                : [];

              existing.source = 'database';
              existing.link_status = 'verified';
              existing._dbProductId = dbProductId;
              existing._dbCompanyId = storedProduct.companyId || undefined;
              existing._dbDatasheetPath = dbDatasheetPath || undefined;
              existing._dbReferenceLink = dbReferenceLink || undefined;
              existing._dbImagePath = dbImagePath || undefined;
              existing._dbModelPath = dbModelPath || undefined;
              existing._dbDocumentPaths = dbDocumentPaths.length > 0 ? dbDocumentPaths : undefined;
              existing.structured_data = existing.structured_data || ({} as any);
              existing.structured_data.company = {
                ...(existing.structured_data.company || {}),
                name: companyName,
                website: companyWebsite,
                address: {
                  ...((existing.structured_data.company as any)?.address || {}),
                  country_code: companyCountry,
                  city: companyCity,
                },
              };
              existing.structured_data.files = {
                ...(existing.structured_data.files || {}),
                datasheet_url: dbDatasheetPath || existing.structured_data.files?.datasheet_url || '',
                reference_link: dbReferenceLink || existing.structured_data.files?.reference_link,
              };
              // Re-render the card so DB metadata propagates into productCards too.
              productCards[existingNamedIdx] = createProductCard(existing, existingNamedIdx, requestId);
              console.log(`🔢 [HybridEngine] Calc-search safety net: upgraded existing entry "${existing.fluid_data.product_name}" to DB-backed (id=${dbProductId})`);
            }
          } catch (err: any) {
            console.warn(`⚠️ [HybridEngine] Calc-search safety net: upgrade-existing failed: ${err?.message}`);
          }
        }
      }

      // Run safety-net injection when: no results at all, OR results exist but named product is absent.
      const needsInjection = mergedProducts.length === 0 || (calcCandidatesForCheck.length > 0 && !namedProductAlreadyPresent);

      if (needsInjection) {
        const injectAtFront = mergedProducts.length > 0; // inject at position 0 when displacing generic results
        let injected = false;

        const injectProduct = (product: UnifiedProduct, label: string) => {
          // Hard floor guard: never inject products below the minimum score threshold.
          if (getScore(product) < HARD_SCORE_FLOOR) {
            console.log(`🚫 [HybridEngine] Calc-search safety net: skipped injection for "${product.fluid_data.product_name}" — score ${getScore(product)} below hard floor ${HARD_SCORE_FLOOR}`);
            return;
          }
          // Dedupe guard: skip injection if this product is already present by DB ID or normalized name.
          const normInjectName = (product.fluid_data.product_name || '').toLowerCase().replace(/[\s\-_./]+/g, '');
          const alreadyPresent = mergedProducts.some(p => {
            if (product._dbProductId && p._dbProductId === product._dbProductId) return true;
            const normExisting = (p.fluid_data.product_name || '').toLowerCase().replace(/[\s\-_./]+/g, '');
            return normInjectName.length >= 3 && normExisting.length >= 3 &&
              (normExisting === normInjectName || normExisting.includes(normInjectName) || normInjectName.includes(normExisting));
          });
          if (alreadyPresent) {
            console.log(`🔢 [HybridEngine] Calc-search safety net: skipped duplicate injection for "${product.fluid_data.product_name}"`);
            return;
          }
          if (injectAtFront) {
            mergedProducts.unshift(product);
            productCards.unshift(createProductCard(product, 0, requestId));
            // Re-index cards after insertion so position indices stay consistent
            for (let i = 1; i < productCards.length; i++) {
              productCards[i] = createProductCard(mergedProducts[i], i, requestId);
            }
          } else {
            mergedProducts.push(product);
            productCards.push(createProductCard(product, 0, requestId));
          }
          console.log(`🔢 [HybridEngine] Calc-search safety net: injected ${label} at ${injectAtFront ? 'front' : 'end'}`);
          injected = true;
        };

        if (calcResolvedContext?.productId) {
          // DB or history layer — find by product ID in catalog search results first
          const byId = allDbProducts.find(p => p._dbProductId === calcResolvedContext!.productId);
          if (byId) {
            if (!byId.fluid_data.fit_score || byId.fluid_data.fit_score < 1) byId.fluid_data.fit_score = 50;
            byId.source = 'database';
            injectProduct(byId, `DB product "${byId.fluid_data.product_name}" via id=${calcResolvedContext.productId}`);
          } else {
            // Not in current search slice — fetch directly from storage
            try {
              const storedProduct = await storage.getProduct(calcResolvedContext.productId);
              if (storedProduct) {
                let companyWebsite = '';
                let companyCity = '';
                let companyCountry = '';
                if (storedProduct.companyId) {
                  try {
                    const company = await storage.getCompany(storedProduct.companyId);
                    if (company) {
                      companyWebsite = company.website || '';
                      companyCity = company.location || '';
                      companyCountry = (company as any).country || '';
                    }
                  } catch {}
                }
                const dbReferenceLink = (storedProduct as any).productWebLink || '';
                const dbImagePath = (storedProduct as any).imagePath || '';
                const dbModelPath = (storedProduct as any).modelPath || '';
                const dbDatasheetPath = (storedProduct as any).catalogPath || calcResolvedContext.datasheetUrl || '';
                const dbDocumentPaths = Array.isArray((storedProduct as any).documentPaths)
                  ? ((storedProduct as any).documentPaths as string[]).filter((p) => typeof p === 'string' && p.length > 0)
                  : [];
                const synthetic: UnifiedProduct = {
                  structured_data: {
                    company: {
                      name: calcResolvedContext.companyName || '',
                      website: companyWebsite,
                      address: { country_code: companyCountry, city: companyCity },
                    },
                    files: {
                      datasheet_url: dbDatasheetPath,
                      reference_link: dbReferenceLink || undefined,
                    },
                  },
                  fluid_data: {
                    product_name: calcResolvedContext.name,
                    description: '',
                    attributes: calcResolvedContext.attributes.map(a => ({
                      label: a.label,
                      value: a.value,
                      unit: a.unit || '',
                    })),
                    fit_score: 50,
                  },
                  source: 'database',
                  link_status: 'verified',
                  _dbProductId: calcResolvedContext.productId,
                  _dbCompanyId: storedProduct.companyId || undefined,
                  _dbDatasheetPath: dbDatasheetPath || undefined,
                  _dbReferenceLink: dbReferenceLink || undefined,
                  _dbImagePath: dbImagePath || undefined,
                  _dbModelPath: dbModelPath || undefined,
                  _dbDocumentPaths: dbDocumentPaths.length > 0 ? dbDocumentPaths : undefined,
                };
                injectProduct(synthetic, `storage-fetched product "${calcResolvedContext.name}" (id=${calcResolvedContext.productId})`);
              }
            } catch (err: any) {
              console.warn(`⚠️ [HybridEngine] Calc-search safety net: storage.getProduct failed for id=${calcResolvedContext.productId}: ${err?.message}`);
            }
          }
        } else if (calcResolvedContext?.layer === 'web') {
          // Web-resolved product (no DB ID) — build a synthetic card from resolved metadata
          const synthetic: UnifiedProduct = {
            structured_data: {
              company: {
                name: calcResolvedContext.companyName || '',
                website: '',
                address: { country_code: '', city: '' },
              },
              files: { datasheet_url: calcResolvedContext.datasheetUrl || '' },
            },
            fluid_data: {
              product_name: calcResolvedContext.name,
              description: '',
              attributes: calcResolvedContext.attributes.map(a => ({
                label: a.label,
                value: a.value,
                unit: a.unit || '',
              })),
              fit_score: 50,
            },
            source: 'web',
          };
          injectProduct(synthetic, `web-resolved product "${calcResolvedContext.name}"`);
        }

        if (!injected) {
          // Fallback: NOT_RESOLVED layer or no context — try query-based DB name matching
          const calcCandidates = extractProductNameCandidates(query);
          if (calcCandidates.length > 0 && allDbProducts.length > 0) {
            const dbMatch = allDbProducts.find(p =>
              nameMatchesAnyCandidate(p.fluid_data.product_name || '', calcCandidates)
            );
            if (dbMatch) {
              if (!dbMatch.fluid_data.fit_score || dbMatch.fluid_data.fit_score < 1) {
                dbMatch.fluid_data.fit_score = 50;
              }
              dbMatch.source = 'database';
              injectProduct(dbMatch, `DB product "${dbMatch.fluid_data.product_name}" (name-match fallback)`);
            }
          }
        }
      }
    }

    // Recompute counts after safety-net injection so telemetry reflects actual products shown.
    const actualDbCount = mergedProducts.filter(p => p.source === 'database').length;
    const actualWebCount = mergedProducts.filter(p => p.source === 'web').length;

    console.log(`✅ [HybridSearch] Combined ${actualWebCount} web + ${actualDbCount} database = ${mergedProducts.length} total products`);

    const finalResult: HybridSearchResult = {
      success: true,
      products: mergedProducts,
      productCards,
      chatSummary,
      logicExplanation: agentResult.logicExplanation || `Hybrid search: ${actualDbCount} database results + ${actualWebCount} web results`,
      interpretedRequirements: agentResult.interpretedRequirements,
      decisionSummary: agentResult.decisionSummary,
      bestFit: agentResult.bestFit,
      alternativeSuggestion: agentResult.alternativeSuggestion,
      searchGuidance: agentResult.searchGuidance,
      alternativeSearches: agentResult.alternativeSearches,
      bomTable: agentResult.bomTable,
      bomSummary: agentResult.bomSummary,
      engineeringNotes: agentResult.engineeringNotes,
      comparisonTable: agentResult.comparisonTable,
      calculationSection: agentResult.calculationSection,
      webResults: actualWebCount,
      databaseResults: actualDbCount,
      agentUsage: agentResult._usage,
      searchedManufacturers: manufacturerDiscovery.userOverride ? undefined : manufacturerDiscovery.manufacturers.map(m => ({ name: m.name, domain: m.domain, tier: m.tier })),
      userOverrideSource: manufacturerDiscovery.userOverride ? (manufacturerDiscovery.overrideSite || undefined) : undefined,
    };

    if (mergedProducts.length > 0 && isFirstQuery) {
      setCachedResult(query, finalResult);
    }

    return finalResult;
  } catch (error: any) {
    console.error('❌ [HybridSearch] Error:', error?.message || error);

    try {
      onProgress?.('Hybrid search failed, using database fallback...');
      const fallback = await executeDatabaseFallback(query);
      
      return {
        success: false,
        products: [],
        productCards: [],
        chatSummary: [
          fallback.companies.length ? `Companies: ${fallback.companies.join(', ')}` : '',
          fallback.products.length ? `Products: ${fallback.products.join(', ')}` : '',
        ].filter(Boolean).join('\n') || 'No matches found.',
        logicExplanation: `Fallback search. Error: ${error?.message || 'Unknown'}`,
        webResults: 0,
        databaseResults: fallback.products.length,
        error: error?.message,
      };
    } catch (fallbackError) {
      return {
        success: false,
        products: [],
        productCards: [],
        chatSummary: '',
        logicExplanation: '',
        webResults: 0,
        databaseResults: 0,
        error: error?.message || 'Hybrid search failed',
      };
    }
  }
}

export async function executeWebOnlySearch(
  query: string,
  requestId: string,
  classification?: import('../agents/query-classifier').QueryClassification,
  manufacturerDiscovery?: ManufacturerDiscoveryResult,
  onProgress?: (message: string) => void
): Promise<HybridSearchResult> {
  const agentResult = await executeAgentSearch(query, [], undefined, classification, false, undefined, manufacturerDiscovery);

  if (agentResult.success && agentResult.products.length > 0) {
    onProgress?.('Verifying datasheets...');
    try {
      const verifyStats = await verifyWebProductDatasheets(query, agentResult.products, agentResult.interpretedRequirements);
      if (verifyStats?._usage) {
        trackApiCall(requestId, {
          service: 'datasheet_verifier',
          model: verifyStats._usage.model,
          tokens: {
            prompt_tokens: verifyStats._usage.prompt_tokens,
            completion_tokens: verifyStats._usage.completion_tokens,
            total_tokens: verifyStats._usage.total_tokens,
          },
          duration_ms: verifyStats.duration_ms,
          timestamp: Date.now(),
        });
      }
    } catch (verifyErr: any) {
      console.warn(`⚠️ [HybridEngine] Web-only datasheet verification skipped: ${verifyErr?.message}`);
    }
  }

  const productCards = agentResult.products.map((product, index) =>
    createProductCard(product, index, requestId)
  );

  return {
    success: agentResult.success,
    products: agentResult.products,
    productCards,
    chatSummary: agentResult.chatSummary,
    logicExplanation: agentResult.logicExplanation,
    webResults: agentResult.products.length,
    databaseResults: 0,
    error: agentResult.error,
    searchedManufacturers: manufacturerDiscovery?.userOverride ? undefined : manufacturerDiscovery?.manufacturers?.map(m => ({ name: m.name, domain: m.domain, tier: m.tier })),
    userOverrideSource: manufacturerDiscovery?.userOverride ? (manufacturerDiscovery.overrideSite || undefined) : undefined,
  };
}

export async function executeDatabaseOnlySearch(
  query: string,
  requestId: string,
  maxResults: number = 10
): Promise<HybridSearchResult> {
  const dbResult = await executeDatabaseSearch(query, maxResults);
  
  const productCards = dbResult.products.map((product, index) =>
    createProductCard(product, index, requestId)
  );

  return {
    success: dbResult.success,
    products: dbResult.products,
    productCards,
    chatSummary: dbResult.products.length > 0 
      ? generateConversationalSummary(dbResult.products, 0, dbResult.products.length, query)
      : `I searched our database for "${query}" but couldn't find matching products. Try broadening your specifications or switching to hybrid mode for wider results.`,
    logicExplanation: 'Database-only search',
    webResults: 0,
    databaseResults: dbResult.products.length,
    error: dbResult.error,
  };
}
