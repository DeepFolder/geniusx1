import { webSearchTool, RunContext, Agent, AgentInputItem, Runner, withTrace } from '@openai/agents';
import { runGuardrails } from '@openai/guardrails';
import { OpenAI } from 'openai';
import type { AgentContext, UnifiedProduct } from '../backend/types';
import { DeepfolderLooseSchema } from './schemas';
import { getAgentSettings } from './admin/settings-storage';
import { AgentSettingsData, DEFAULT_SETTINGS, BOM_INSTRUCTIONS_BLOCK, CALCULATION_INSTRUCTIONS_BLOCK, SEARCH_THEN_CALCULATE_BLOCK, CALCULATE_THEN_SEARCH_BLOCK } from './admin/types';
import { type QueryClassification, buildAgentContext } from './query-classifier';
import { compressHistory } from './history-compression';
import { getContextForSession } from './context-compaction';
import { canonicalUnit, splitValueAndUnit, canonicalizeUnitTokensInCell, validateUnit } from '../utils/unit-canonical';

const DISTRIBUTOR_DOMAINS = new Set([
  'amazon.com', 'amazon.de', 'amazon.co.uk', 'amazon.co.jp',
  'ebay.com', 'ebay.de', 'ebay.co.uk',
  'aliexpress.com', 'alibaba.com', 'wish.com', 'banggood.com',
  'digikey.com', 'digikey.de', 'digikey.co.uk',
  'mouser.com', 'mouser.de', 'mouser.co.uk',
  'rs-online.com', 'rs-components.com',
  'farnell.com', 'element14.com', 'newark.com',
  'arrow.com', 'avnet.com', 'futureelectronics.com',
  'alliedelec.com', 'alliedelectronics.com',
  'mcmaster.com', 'mcmaster-carr.com',
  'grainger.com', 'mscdirect.com', 'zoro.com', 'fastenal.com',
  'octopart.com', 'findchips.com',
  'automationdirect.com', 'automation24.com',
  'conrad.com', 'conrad.de',
  'sparkfun.com', 'adafruit.com',
  'reichelt.de', 'reichelt.com',
  'tme.eu', 'distrelec.com', 'elfa.se',
  'jameco.com', 'onlinecomponents.com',
  'applied.com', 'thomasnet.com', 'globalindustrial.com',
  'webstaurantstore.com', 'tequipment.net', 'onlinemetals.com',
  'motion.com', 'motionindustries.com',
  'radwell.com', 'plcenter.com', 'galco.com',
  'testequity.com', 'instrumart.com',
  'surplus-center.com', 'surpluscenter.com',
  'industrialzone.com', 'powermotiontech.com',
  'kaman.com', 'kamandirect.com',
]);

function isDistributorUrl(url: string): boolean {
  if (!url) return false;
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname.toLowerCase();
    for (const domain of DISTRIBUTOR_DOMAINS) {
      if (hostname === domain || hostname.endsWith('.' + domain)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function sanitizeProductUrls(product: UnifiedProduct): UnifiedProduct {
  const refLink = product.structured_data.files.reference_link;
  const datasheetUrl = product.structured_data.files.datasheet_url;
  const companyWebsite = product.structured_data.company.website;

  if (isDistributorUrl(refLink)) {
    console.warn(`⚠️ [AgentSearch] Distributor reference_link cleared (company website kept separately): ${refLink}`);
    product.structured_data.files.reference_link = '';
    product.link_status = 'unverified';
  }

  if (isDistributorUrl(datasheetUrl)) {
    console.warn(`⚠️ [AgentSearch] Removed distributor datasheet_url: ${datasheetUrl}`);
    product.structured_data.files.datasheet_url = '';
  }

  return product;
}

const SOFT_404_PATTERNS = [
  /page\s*(not|wasn['']?t)\s*found/i,
  /404\s*(error|not\s*found|page)/i,
  /not\s*found<\/title>/i,
  /page\s*(does\s*not|doesn['']?t)\s*exist/i,
  /no\s*results?\s*found/i,
  /this\s*page\s*(has\s*been|was)\s*(removed|deleted|moved)/i,
  /content\s*(is\s*)?(no\s*longer|not)\s*available/i,
  /product\s*(not|no\s*longer)\s*(found|available|exists)/i,
  /item\s*(not|no\s*longer)\s*(found|available)/i,
  /we\s*(couldn['']?t|could\s*not)\s*find/i,
  /the\s*requested\s*(page|url|resource)\s*(was\s*not|could\s*not\s*be)\s*found/i,
  /<title>[^<]*404[^<]*<\/title>/i,
  /<title>[^<]*not\s*found[^<]*<\/title>/i,
];

function detectSoft404(html: string): boolean {
  const snippet = html.slice(0, 8000);
  return SOFT_404_PATTERNS.some(p => p.test(snippet));
}

// Task #259 — Detect when an agent-emitted calculation_section is really a
// refusal in disguise (no usable numbers, formula contains refusal prose,
// or formula has a long \text{...} prose-as-math block). When true, the
// caller should drop the section and merge a clean refusal sentence into
// chat_summary so the user sees a single readable message instead of a
// broken "Formula" card.
const REFUSAL_PROSE_RE = /\b(?:not\s+(?:directly\s+)?calculable|cannot\s+be\s+(?:computed|calculated|determined)|requires?\s+(?:the\s+|a\s+|an\s+)?(?:basic\s+|dynamic\s+|specific\s+|missing\s+)|not\s+provided|not\s+available|unknown\s+value|unspecified\s+value|insufficient\s+(?:data|information))\b/i;
const PROSE_IN_MATH_RE = /\\text\{[^}]{40,}\}/;

function extractMissingHintFromProse(s: string): string {
  if (!s) return '';
  // Prefer hint extracted from inside a \text{...} block since that's where
  // the agent typically dumps the refusal sentence.
  const m1 = s.match(/\\text\{[^}]*?(?:without|requires?)\s+(?:the\s+|a\s+|an\s+)?([^}]+?)\s*\}/i);
  if (m1) return m1[1].trim().replace(/\s+/g, ' ').slice(0, 80);
  const m2 = s.match(/(?:without|requires?)\s+(?:the\s+|a\s+|an\s+)?([^.,;{}\\]{3,80}?)(?:[.,;{}\\]|$)/i);
  if (m2) return m2[1].trim().replace(/\s+/g, ' ').slice(0, 80);
  return '';
}

function looksLikeRefusalCalcSection(cs: any): { isRefusal: boolean; reason: string; missingHint: string } {
  if (!cs || typeof cs !== 'object') return { isRefusal: false, reason: '', missingHint: '' };
  const formula = String(cs.formula ?? '');
  const resultValue = String(cs.result?.value ?? '').trim();
  const steps = Array.isArray(cs.steps) ? cs.steps : [];

  if (formula && REFUSAL_PROSE_RE.test(formula)) {
    return { isRefusal: true, reason: 'formula contains refusal prose', missingHint: extractMissingHintFromProse(formula) };
  }
  if (formula && PROSE_IN_MATH_RE.test(formula)) {
    return { isRefusal: true, reason: 'formula has prose-as-math \\text{...} block', missingHint: extractMissingHintFromProse(formula) };
  }
  for (const step of steps) {
    const sf = String(step?.formula ?? '');
    if (sf && REFUSAL_PROSE_RE.test(sf)) {
      return { isRefusal: true, reason: 'step formula contains refusal prose', missingHint: extractMissingHintFromProse(sf) };
    }
    if (sf && PROSE_IN_MATH_RE.test(sf)) {
      return { isRefusal: true, reason: 'step formula has prose-as-math \\text{...} block', missingHint: extractMissingHintFromProse(sf) };
    }
  }

  // Numeric-result check: leading number (allowing optional sign and
  // scientific notation). Same shape as the existing checkCalcConsistency
  // numRe so prose like "apply 25% margin" never counts as a numeric result.
  // Split the reason into two distinct telemetry buckets (per code review on
  // Task #259): the "empty result with non-empty steps" case (agent emitted
  // a flow but never produced a final number) is meaningfully different
  // from the "empty result with no steps" case (agent emitted only a stub
  // shell), and we want to track them separately to spot regressions.
  const numRe = /^\s*-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?/;
  const hasNumericResult = resultValue.length > 0 && numRe.test(resultValue);
  if (!hasNumericResult) {
    const hasNumericStep = steps.some((s: any) => {
      const v = String(s?.result?.value ?? '').trim();
      return v.length > 0 && numRe.test(v);
    });
    if (!hasNumericStep) {
      const reason = steps.length === 0
        ? 'empty result.value and no steps'
        : 'empty result.value while steps exist (no numeric step values)';
      return { isRefusal: true, reason, missingHint: '' };
    }
  }

  return { isRefusal: false, reason: '', missingHint: '' };
}

const CATEGORY_PAGE_PATTERNS = [
  /<title>[^<]*(products|catalog|category|categories|search results|browse|all\s+products|product\s+listing)[^<]*<\/title>/i,
  /showing\s+\d+[\s\-–]+\d+\s+of\s+\d+\s+(results|products|items)/i,
  /\d+\s+products?\s+(found|available|shown|displayed)/i,
  /filter\s+by|sort\s+by|refine\s+results|narrow\s+results/i,
];

function detectCategoryPage(html: string): boolean {
  const snippet = html.slice(0, 8000);
  return CATEGORY_PAGE_PATTERNS.some(p => p.test(snippet));
}

const PRODUCT_NOISE_RE = /\s*\((?:example|approx|typical|suggested|recommended|nominal|standard)\s+\w*\)\s*/gi;
const GENERIC_PAREN_RE = /\s*\((?:e\.g\.?,?\s*|such\s+as\s+|for\s+example,?\s*|like\s+)?[^)]*?(?:series|example|range|typical|approx)[^)]*\)\s*/gi;
const EG_PAREN_RE = /\s*\(e\.g\.?,?\s*[^)]*\)\s*/gi;

function cleanProductName(name: string): string {
  if (!name) return name;
  return name
    .replace(EG_PAREN_RE, ' ')
    .replace(GENERIC_PAREN_RE, ' ')
    .replace(PRODUCT_NOISE_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const GENERIC_NAME_MARKERS = [
  /\(e\.g\./i,
  /\(such as/i,
  /\(for example/i,
  /series\s+example/i,
  /example\s+series/i,
  /example\s+size/i,
  /\bseries\)/i,
  /\d{2,}xx\b/i,
  /\bxxx\b/i,
];

function isGenericProductName(name: string): boolean {
  return GENERIC_NAME_MARKERS.some(re => re.test(name));
}

function extractModelHintFromGenericName(name: string): string {
  const parenMatch = name.match(/\((?:e\.g\.?,?\s*|such\s+as\s+|like\s+)?([^)]+)\)/i);
  if (parenMatch) {
    let hint = parenMatch[1]
      .replace(/\bseries\b/gi, '')
      .replace(/\bexample\b/gi, '')
      .replace(/\brange\b/gi, '')
      .replace(/\btypical\b/gi, '')
      .replace(/\bapprox\b/gi, '')
      .replace(/[,;]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const hintTokens = hint.split(/\s+/).filter(t => t.length >= 1 && !/^\d{2,}xx$/i.test(t));
    const modelTokens = hintTokens.filter((t, i) =>
      /\d/.test(t) ||
      (i > 0 && /^[A-Z]\/[A-Z]$/i.test(t)) ||
      /^[A-Z]{2,}[-\d]*$/i.test(t)
    );

    const unitPatterns = /^(kN|kW|mm|cm|kg|mA|Hz|RPM|Nm|V|A|W|bar|psi|mbar|Pa|MPa)$/i;
    const symbolPatterns = /^[≈≥≤<>~±]+\d/;
    const cleanedTokens = modelTokens.filter(t => !unitPatterns.test(t) && !symbolPatterns.test(t));
    if (cleanedTokens.length > 0) {
      return cleanedTokens.join(' ');
    }
  }

  const cleanedName = cleanProductName(name);
  if (cleanedName.length > 10) {
    return '';
  }

  const modelNumber = extractModelNumber(name);
  if (modelNumber) return modelNumber;

  return '';
}

function hasModelToken(name: string): boolean {
  if (!name || name === 'Unnamed Product') return false;
  const tokens = name.replace(/[^\w\s\-\.\/]/g, ' ').split(/\s+/);
  return tokens.some(t => /\d/.test(t) && t.length >= 2 && !MODEL_STOP_WORDS.has(t.toLowerCase()));
}

function fixGenericProductName(name: string, brand: string): { name: string; wasGeneric: boolean } {
  if (!isGenericProductName(name)) {
    return { name, wasGeneric: false };
  }

  const cleaned = cleanProductName(name);

  if (cleaned && cleaned.length > 5 && hasModelToken(cleaned)) {
    console.log(`ℹ️ [ProductQuality] Cleaned generic parenthetical from name: "${name}" → "${cleaned}"`);
    return { name: cleaned, wasGeneric: true };
  }

  const modelHint = extractModelHintFromGenericName(name);
  if (modelHint) {
    const brandPrefix = brand && !modelHint.toLowerCase().startsWith(brand.toLowerCase().split(' ')[0].toLowerCase())
      ? `${brand.split('(')[0].trim()} `
      : '';
    const fixedName = `${brandPrefix}${modelHint}`;
    console.log(`⚠️ [ProductQuality] Fixed generic name: "${name}" → "${fixedName}"`);
    return { name: fixedName, wasGeneric: true };
  }

  if (cleaned && cleaned.length > 5) {
    console.log(`ℹ️ [ProductQuality] Cleaned generic parenthetical from name: "${name}" → "${cleaned}"`);
    return { name: cleaned, wasGeneric: true };
  }

  console.log(`⚠️ [ProductQuality] Removing product with unfixable generic name: "${name}"`);
  return { name: '', wasGeneric: true };
}

const MODEL_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'series', 'type', 'model', 'product', 'version',
  'single', 'double', 'row', 'tapered', 'roller', 'bearing', 'bearings', 'ball',
  'cylindrical', 'spherical', 'thrust', 'angular', 'contact', 'deep', 'groove',
  'linear', 'guide', 'motor', 'motors', 'servo', 'stepper', 'drive', 'driver',
  'controller', 'sensor', 'actuator', 'pump', 'valve', 'cylinder', 'gearbox',
  'encoder', 'switch', 'relay', 'connector', 'cable', 'power', 'supply',
  'industrial', 'precision', 'high', 'low', 'heavy', 'duty', 'compact',
  'standard', 'premium', 'professional', 'digital', 'analog', 'electric',
  'hydraulic', 'pneumatic', 'mechanical', 'automatic', 'manual',
  'stainless', 'steel', 'aluminum', 'brass', 'plastic', 'rubber',
  'sealed', 'shielded', 'open', 'flanged', 'metric', 'inch',
  'example', 'size', 'approx', 'typical', 'nominal',
]);

function extractModelTokens(productName: string): string[] {
  if (!productName) return [];
  const cleaned = cleanProductName(productName);
  const tokens = cleaned
    .replace(/[^\w\s\-\.\/]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2)
    .map(t => t.toLowerCase());
  return tokens.filter(t => !MODEL_STOP_WORDS.has(t));
}

function isLikelyModelNumber(token: string): boolean {
  if (/^\d+$/.test(token)) return false;
  if (/^\d+\/\d+$/.test(token)) return false;
  if (/^[≈≥≤<>~±]+/.test(token)) return false;
  if (/^(kN|kW|mm|cm|kg|mA|Hz|RPM|Nm|bar|psi|MPa|Pa|mbar)$/i.test(token)) return false;
  if (/^(Frame|Size|Type|Version|Grade|Class|Level|Stage|Phase)$/i.test(token)) return false;
  if (/[A-Za-z]/.test(token) && /\d/.test(token)) return true;
  return false;
}

function extractModelNumber(productName: string): string {
  if (!productName) return '';
  const cleaned = cleanProductName(productName);

  const compactModelRe = /\b([A-Z]{1,4}\d[\w\-\.]{2,}(?:\s*[A-Z]\/[A-Z])?)\b/gi;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = compactModelRe.exec(cleaned)) !== null) {
    const candidate = m[1].trim();
    if (isLikelyModelNumber(candidate)) {
      matches.push(candidate);
    }
  }

  if (matches.length > 0) {
    return matches.join(' ');
  }

  const tokens = cleaned.split(/\s+/);
  const modelTokens = tokens.filter(t => t.length >= 2 && isLikelyModelNumber(t));
  if (modelTokens.length > 0) {
    return modelTokens.join(' ');
  }

  return '';
}

function checkUrlContainsProduct(url: string, productName: string): boolean {
  if (!productName || !url) return false;
  const urlLower = url.toLowerCase();
  const tokens = extractModelTokens(productName);
  if (tokens.length === 0) return false;

  const alphanumericTokens = tokens.filter(t => /\d/.test(t));
  if (alphanumericTokens.length > 0) {
    return alphanumericTokens.some(t => urlLower.includes(t));
  }

  const matchCount = tokens.filter(t => urlLower.includes(t)).length;
  return matchCount >= Math.ceil(tokens.length * 0.4);
}

function checkPageContainsProduct(html: string, productName: string): boolean {
  if (!productName || !html) return false;
  const snippet = html.slice(0, 12000).toLowerCase();
  const tokens = extractModelTokens(productName);
  if (tokens.length === 0) return true;

  const alphanumericTokens = tokens.filter(t => /\d/.test(t));
  if (alphanumericTokens.length > 0) {
    return alphanumericTokens.some(t => snippet.includes(t));
  }

  const matchCount = tokens.filter(t => snippet.includes(t)).length;
  return matchCount >= Math.ceil(tokens.length * 0.5);
}

function verifyProductMatch(url: string, pageContent: string | undefined, productName: string): boolean {
  if (checkUrlContainsProduct(url, productName)) return true;
  if (pageContent && checkPageContainsProduct(pageContent, productName)) return true;
  return false;
}

interface UrlCheckResult {
  status: 'reachable' | 'not_found' | 'soft_404' | 'category_page' | 'wrong_product' | 'uncertain';
  pageContent?: string;
}

async function checkUrlReachable(url: string, productName?: string): Promise<UrlCheckResult> {
  if (!url || url.length < 10) return { status: 'not_found' };
  const fullUrl = url.startsWith('http') ? url : `https://${url}`;
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(fullUrl, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers,
    });
    clearTimeout(timeout);
    if (res.status === 404 || res.status === 410) return { status: 'not_found' };
    if (res.status >= 400) return { status: 'uncertain' };
  } catch {
  }

  try {
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 8000);
    const getRes = await fetch(fullUrl, {
      method: 'GET',
      signal: controller2.signal,
      redirect: 'follow',
      headers,
    });
    clearTimeout(timeout2);
    if (getRes.status === 404 || getRes.status === 410) return { status: 'not_found' };
    if (getRes.status >= 400) return { status: 'uncertain' };

    try {
      const reader = getRes.body?.getReader();
      if (reader) {
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        const maxBytes = 12288;
        while (totalBytes < maxBytes) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          chunks.push(value);
          totalBytes += value.length;
        }
        reader.cancel().catch(() => {});
        const decoder = new TextDecoder('utf-8', { fatal: false });
        const body = decoder.decode(Buffer.concat(chunks).slice(0, maxBytes));
        if (detectSoft404(body)) {
          return { status: 'soft_404', pageContent: body };
        }
        if (detectCategoryPage(body)) {
          return { status: 'category_page', pageContent: body };
        }
        if (productName && !verifyProductMatch(fullUrl, body, productName)) {
          return { status: 'wrong_product', pageContent: body };
        }
        return { status: 'reachable', pageContent: body };
      }
    } catch {
    }

    return { status: 'reachable' };
  } catch {
    return { status: 'uncertain' };
  }
}

const RECOVERY_TIMEOUT_MS = 8000;

let recoveryClient: OpenAI | null = null;

function getRecoveryClient(): OpenAI {
  if (!recoveryClient) {
    recoveryClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return recoveryClient;
}

interface RecoveryResult {
  url: string | null;
  brandChanged?: boolean;
  newManufacturer?: string;
  newWebsite?: string;
}

async function doRecoverySearch(
  client: OpenAI,
  searchQuery: string,
  searchTerm: string,
  targetName: string,
  productName: string,
  targetDomain: string,
  enforceDomain: boolean,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RECOVERY_TIMEOUT_MS);

  let response: OpenAI.Responses.Response;
  try {
    response = await client.responses.create(
      {
        model: 'gpt-4o-mini',
        tools: [{ type: 'web_search_preview' }],
        input: `Find the exact product page URL for: "${searchTerm}"${targetName ? ` by "${targetName}"` : ''}.
Search for: ${searchQuery}
Return ONLY the single best product page URL from the manufacturer's official website.
Do NOT return distributor URLs (Amazon, DigiKey, Mouser, etc).
Do NOT return category/listing pages.
Return ONLY the URL, nothing else. If you cannot find the specific product page, respond with "NONE".`,
      },
      { signal: controller.signal },
    );
  } finally {
    clearTimeout(timeout);
  }

  const textOutput = response.output_text || '';
  const urlMatch = textOutput.match(/https?:\/\/[^\s"'<>\]]+/);
  if (!urlMatch) return null;

  const candidateUrl = urlMatch[0].replace(/[.,;:)\]}>]+$/, '');

  if (isDistributorUrl(candidateUrl)) {
    console.log(`ℹ️ [LinkRecovery] Discarded distributor URL: ${candidateUrl}`);
    return null;
  }

  if (enforceDomain && targetDomain) {
    try {
      const candidateHost = new URL(candidateUrl).hostname.replace(/^www\./, '');
      const hostMatch = candidateHost === targetDomain || candidateHost.endsWith('.' + targetDomain);
      if (!hostMatch) {
        console.log(`ℹ️ [LinkRecovery] Discarded off-domain URL: ${candidateUrl} (expected ${targetDomain})`);
        return null;
      }
    } catch {
      return null;
    }
  }

  const checkResult = await checkUrlReachable(candidateUrl, productName);
  if (checkResult.status === 'reachable') {
    return candidateUrl;
  }
  if (checkResult.status === 'uncertain') {
    if (checkUrlContainsProduct(candidateUrl, productName)) {
      return candidateUrl;
    }
  }

  console.log(`ℹ️ [LinkRecovery] Recovered URL failed validation (${checkResult.status}): ${candidateUrl}`);
  return null;
}

async function recoverProductPageUrl(
  productName: string,
  companyName: string,
  companyWebsite: string,
): Promise<RecoveryResult> {
  if (!productName || !companyName) return { url: null };

  try {
    const client = getRecoveryClient();

    let manufacturerDomain = '';
    if (companyWebsite) {
      try {
        manufacturerDomain = new URL(
          companyWebsite.startsWith('http') ? companyWebsite : `https://${companyWebsite}`
        ).hostname.replace(/^www\./, '');
      } catch {}
    }

    const modelNumber = extractModelNumber(productName);
    const cleanedName = cleanProductName(productName);
    const searchTerm = modelNumber || cleanedName || productName;

    const siteFilter = manufacturerDomain ? ` site:${manufacturerDomain}` : '';
    const searchQuery = `${companyName} ${searchTerm} product page${siteFilter}`;
    console.log(`🔍 [LinkRecovery] Search query: "${searchQuery}" (model: "${modelNumber || 'none'}")`);

    const url = await doRecoverySearch(client, searchQuery, searchTerm, companyName, productName, manufacturerDomain, true);
    if (url) return { url };

    console.log(`🔍 [LinkRecovery] Site-filtered search failed, trying brand-agnostic fallback for "${searchTerm}"`);
    const fallbackQuery = `${searchTerm} product page manufacturer`;
    const fallbackUrl = await doRecoverySearch(client, fallbackQuery, searchTerm, '', productName, '', false);

    if (fallbackUrl) {
      try {
        const newHost = new URL(fallbackUrl).hostname.replace(/^www\./, '');
        const isSameDomain = manufacturerDomain && (newHost === manufacturerDomain || newHost.endsWith('.' + manufacturerDomain));
        if (manufacturerDomain && !isSameDomain) {
          const newManufacturer = newHost.split('.').slice(-2, -1)[0] || newHost;
          const capitalizedName = newManufacturer.charAt(0).toUpperCase() + newManufacturer.slice(1);
          console.log(`🔄 [LinkRecovery] Brand change detected: ${companyName} → ${capitalizedName} for "${searchTerm}"`);
          return {
            url: fallbackUrl,
            brandChanged: true,
            newManufacturer: capitalizedName,
            newWebsite: `https://${newHost}`,
          };
        }
      } catch {}
      return { url: fallbackUrl };
    }

    return { url: null };
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    if (error.name === 'AbortError') {
      console.warn(`⚠️ [LinkRecovery] Timeout recovering URL for "${productName}"`);
    } else {
      console.warn(`⚠️ [LinkRecovery] Error recovering URL for "${productName}":`, error.message);
    }
    return { url: null };
  }
}

async function tryRecoverLink(product: UnifiedProduct): Promise<boolean> {
  const productName = product.fluid_data.product_name || '';
  const companyName = product.structured_data.company.name || '';
  const companyWebsite = product.structured_data.company.website || '';

  if (!productName || !companyName) {
    applyHomepageFallback(product);
    return false;
  }

  console.log(`🔍 [LinkRecovery] Attempting recovery for "${productName}" by ${companyName}`);
  const result = await recoverProductPageUrl(productName, companyName, companyWebsite);

  if (result.url) {
    console.log(`✅ [LinkRecovery] Recovered product page: ${result.url}`);
    product.structured_data.files.reference_link = result.url;
    product.link_status = 'recovered';

    if (result.brandChanged && result.newManufacturer) {
      const oldName = product.structured_data.company.name;
      product.structured_data.company.name = result.newManufacturer;
      if (result.newWebsite) {
        product.structured_data.company.website = result.newWebsite;
      }
      const brandNote = `Note: Formerly listed under ${oldName}, now manufactured by ${result.newManufacturer}.`;
      const existing = product.fluid_data.ai_summary || '';
      product.fluid_data.ai_summary = existing ? `${existing} ${brandNote}` : brandNote;
    }
    return true;
  }

  console.log(`ℹ️ [LinkRecovery] No valid product page found for "${productName}"`);
  applyHomepageFallback(product);
  return false;
}

function applyHomepageFallback(product: UnifiedProduct): void {
  // Do NOT set reference_link to the company homepage — the homepage is already stored
  // in structured_data.company.website and surfaces to the UI as product.company.website
  // (used as the brand link). The "Web" button should only link to a real product page;
  // when none is found the UI falls back to a Google search link automatically.
  product.structured_data.files.reference_link = '';
  product.link_status = 'unverified';
}

async function validateProductUrls(products: UnifiedProduct[]): Promise<void> {
  if (products.length === 0) return;

  const productsNeedingRecovery: UnifiedProduct[] = [];

  const checks = products.flatMap((product) => {
    const tasks: Promise<void>[] = [];
    const productName = product.fluid_data.product_name || '';

    const refLink = product.structured_data.files.reference_link;
    if (refLink) {
      tasks.push((async () => {
        const result = await checkUrlReachable(refLink, productName);
        if (result.status === 'not_found' || result.status === 'soft_404') {
          const label = result.status === 'soft_404' ? 'soft-404' : '404';
          console.warn(`⚠️ [AgentSearch] ${label} reference_link: ${refLink}`);
          productsNeedingRecovery.push(product);
        } else if (result.status === 'category_page') {
          console.warn(`⚠️ [AgentSearch] Category/listing page detected: ${refLink}`);
          productsNeedingRecovery.push(product);
        } else if (result.status === 'wrong_product') {
          console.warn(`⚠️ [AgentSearch] Page doesn't mention "${productName}": ${refLink}`);
          productsNeedingRecovery.push(product);
        } else if (result.status === 'uncertain') {
          console.log(`ℹ️ [AgentSearch] Keeping uncertain reference_link (may work in browser): ${refLink}`);
          product.link_status = 'unverified';
        } else {
          product.link_status = 'verified';
        }
      })());
    } else {
      productsNeedingRecovery.push(product);
    }

    const dsUrl = product.structured_data.files.datasheet_url;
    if (dsUrl) {
      tasks.push((async () => {
        const result = await checkUrlReachable(dsUrl);
        if (result.status === 'not_found' || result.status === 'soft_404') {
          const label = result.status === 'soft_404' ? 'soft-404' : '404';
          console.warn(`⚠️ [AgentSearch] ${label} datasheet_url removed: ${dsUrl}`);
          product.structured_data.files.datasheet_url = '';
        } else if (result.status === 'uncertain') {
          console.log(`ℹ️ [AgentSearch] Keeping uncertain datasheet_url (may work in browser): ${dsUrl}`);
        }
      })());
    }

    return tasks;
  });

  await Promise.allSettled(checks);

  if (productsNeedingRecovery.length > 0) {
    console.log(`🔍 [LinkRecovery] Starting recovery for ${productsNeedingRecovery.length} product(s)`);
    const recoveryStart = Date.now();
    const recoveryResults = await Promise.allSettled(
      productsNeedingRecovery.map((product) => tryRecoverLink(product))
    );
    const recovered = recoveryResults.filter(
      (r) => r.status === 'fulfilled' && r.value === true
    ).length;
    const duration = Date.now() - recoveryStart;
    console.log(`📊 [LinkRecovery] Recovered ${recovered}/${productsNeedingRecovery.length} links in ${duration}ms`);
  }
}

interface CitationUrl {
  url: string;
  title: string;
}

function extractCitationUrls(output: any[]): CitationUrl[] {
  const citations: CitationUrl[] = [];
  const seen = new Set<string>();

  if (!Array.isArray(output)) return citations;

  for (const item of output) {
    if (item.type === 'message' && Array.isArray(item.content)) {
      for (const content of item.content) {
        if (typeof content === 'object' && content !== null) {
          const annotations = (content as any).annotations;
          if (Array.isArray(annotations)) {
            for (const ann of annotations) {
              if (ann.type === 'url_citation' && ann.url && !seen.has(ann.url)) {
                seen.add(ann.url);
                citations.push({ url: ann.url, title: ann.title || '' });
              }
            }
          }
        }
      }
    }
  }

  return citations;
}

const RAW_CITATION_MARKER_RE = /【[^【】]*】/g;

function applyCitationAnnotations(text: string, annotations: any): string {
  let result = text;
  if (Array.isArray(annotations) && annotations.length > 0) {
    const usable = annotations
      .filter((a) =>
        a &&
        a.type === 'url_citation' &&
        typeof a.url === 'string' &&
        a.url.length > 0 &&
        Number.isInteger(a.start_index) &&
        Number.isInteger(a.end_index) &&
        a.end_index > a.start_index &&
        a.end_index <= result.length,
      )
      .sort((a, b) => b.start_index - a.start_index);

    for (const ann of usable) {
      const slice = result.slice(ann.start_index, ann.end_index);
      // Only substitute if the slice actually looks like an OpenAI citation marker
      // (Chinese square brackets) to avoid accidentally rewriting real prose.
      if (!/^【[^【】]*】$/.test(slice)) continue;
      const replacement = `[src](${ann.url})`;
      result = result.slice(0, ann.start_index) + replacement + result.slice(ann.end_index);
    }
  }
  // Final sweep: drop any markers that didn't have a usable annotation.
  result = result.replace(RAW_CITATION_MARKER_RE, '');
  return result;
}

function extractTextFromOutput(output: any[]): string {
  if (!Array.isArray(output)) return '';
  let text = '';
  for (const item of output) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (
        typeof content === 'object' &&
        content !== null &&
        'type' in content &&
        content.type === 'output_text' &&
        'text' in content &&
        typeof (content as any).text === 'string'
      ) {
        text += applyCitationAnnotations((content as any).text, (content as any).annotations);
      }
    }
  }
  return text;
}

function findBestCitationForProduct(
  productName: string,
  companyWebsite: string,
  citations: CitationUrl[],
): string | null {
  if (citations.length === 0 || !productName) return null;

  let manufacturerDomain = '';
  if (companyWebsite) {
    try {
      manufacturerDomain = new URL(
        companyWebsite.startsWith('http') ? companyWebsite : `https://${companyWebsite}`
      ).hostname.replace(/^www\./, '');
    } catch {}
  }

  const candidateCitations = manufacturerDomain
    ? citations.filter((c) => {
        try {
          const host = new URL(c.url).hostname.replace(/^www\./, '');
          return host === manufacturerDomain || host.endsWith('.' + manufacturerDomain);
        } catch {
          return false;
        }
      })
    : citations;

  for (const c of candidateCitations) {
    if (isDistributorUrl(c.url)) continue;
    if (checkUrlContainsProduct(c.url, productName)) return c.url;
  }

  const tokens = extractModelTokens(productName);
  const alphanumericTokens = tokens.filter((t) => /\d/.test(t));
  if (alphanumericTokens.length > 0) {
    for (const c of candidateCitations) {
      if (isDistributorUrl(c.url)) continue;
      const titleLower = (c.title || '').toLowerCase();
      if (alphanumericTokens.some((t) => titleLower.includes(t))) return c.url;
    }
  }

  return null;
}

function crossReferenceCitations(products: UnifiedProduct[], citations: CitationUrl[]): void {
  if (citations.length === 0) return;

  const citationUrlSet = new Set(citations.map((c) => c.url));

  for (const product of products) {
    const refLink = product.structured_data.files.reference_link;
    const productName = product.fluid_data.product_name || '';
    const companyWebsite = product.structured_data.company.website || '';

    if (refLink && citationUrlSet.has(refLink)) {
      continue;
    }

    const bestCitation = findBestCitationForProduct(productName, companyWebsite, citations);
    if (bestCitation) {
      if (refLink) {
        console.log(`🔗 [CitationFix] Replacing hallucinated URL for "${productName}": ${refLink} → ${bestCitation}`);
      } else {
        console.log(`🔗 [CitationFix] Filled missing reference_link for "${productName}": ${bestCitation}`);
      }
      product.structured_data.files.reference_link = bestCitation;
    }
  }
}

let guardrailClient: OpenAI | null = null;

function getGuardrailClient(): OpenAI {
  if (!guardrailClient) {
    guardrailClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return guardrailClient;
}

function guardrailsHasTripwire(results: any[]): boolean {
  return (results ?? []).some((r) => r?.tripwireTriggered === true);
}

function getGuardrailSafeText(results: any[], fallbackText: string): string {
  for (const r of results ?? []) {
    if (r?.info && ("checked_text" in r.info)) {
      return r.info.checked_text ?? fallbackText;
    }
  }
  const pii = (results ?? []).find((r) => r?.info && "anonymized_text" in r.info);
  return pii?.info?.anonymized_text ?? fallbackText;
}

function buildGuardrailFailOutput(results: any[]) {
  const get = (name: string) => (results ?? []).find((r: any) => ((r?.info?.guardrail_name ?? r?.info?.guardrailName) === name));
  const pii = get("Contains PII"), mod = get("Moderation"), jb = get("Jailbreak"), nsfw = get("NSFW Text"), url = get("URL Filter"), custom = get("Custom Prompt Check"), pid = get("Prompt Injection Detection");
  const piiCounts = Object.entries(pii?.info?.detected_entities ?? {}).filter(([, v]) => Array.isArray(v)).map(([k, v]) => k + ":" + (v as any[]).length);
  
  return {
    pii: { failed: (piiCounts.length > 0) || pii?.tripwireTriggered === true, detected_counts: piiCounts },
    moderation: { failed: mod?.tripwireTriggered === true || ((mod?.info?.flagged_categories ?? []).length > 0), flagged_categories: mod?.info?.flagged_categories },
    jailbreak: { failed: jb?.tripwireTriggered === true },
    nsfw: { failed: nsfw?.tripwireTriggered === true },
    url_filter: { failed: url?.tripwireTriggered === true },
    custom_prompt_check: { failed: custom?.tripwireTriggered === true },
    prompt_injection: { failed: pid?.tripwireTriggered === true },
  };
}

async function runAndApplyGuardrails(inputText: string, guardrailsConfig: any): Promise<{
  hasTripwire: boolean;
  safeText: string;
  failOutput: any;
}> {
  const context = { guardrailLlm: getGuardrailClient() };
  
  const enabledGuardrails = guardrailsConfig.guardrails
    .filter((g: any) => g.enabled !== false)
    .map((g: any) => ({ name: g.name, config: g.config }));
  
  const config = { guardrails: enabledGuardrails };
  const results = await runGuardrails(inputText, config, context, true);
  
  const hasTripwire = guardrailsHasTripwire(results);
  const safeText = getGuardrailSafeText(results, inputText);
  const failOutput = buildGuardrailFailOutput(results ?? []);
  
  return { hasTripwire, safeText, failOutput };
}

function sanitizeControlCharsInStrings(json: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    const code = json.charCodeAt(i);

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      result += ch;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString && code >= 0x00 && code <= 0x1F) {
      switch (ch) {
        case '\n': result += '\\n'; break;
        case '\r': result += '\\r'; break;
        case '\t': result += '\\t'; break;
        case '\b': result += '\\b'; break;
        case '\f': result += '\\f'; break;
        default: result += ''; break;
      }
      continue;
    }

    result += ch;
  }
  return result;
}

function stripControlCharsInStrings(json: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    const code = json.charCodeAt(i);

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      result += ch;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString && code >= 0x00 && code <= 0x1F) {
      if (ch === '\n' || ch === '\r') {
        result += ' ';
      }
      continue;
    }

    result += ch;
  }
  return result;
}

function extractBalancedArray(str: string, startIdx: number): string | null {
  if (str[startIdx] !== '[') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIdx; i < str.length; i++) {
    const ch = str[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '[') depth++;
    if (ch === ']') { depth--; if (depth === 0) return str.substring(startIdx, i + 1); }
  }
  return null;
}

function extractBomFieldValue(str: string, fieldName: string): string | null {
  const keyPattern = new RegExp(`"${fieldName}"\\s*:\\s*"`);
  const match = keyPattern.exec(str);
  if (!match) return null;
  const valStart = match.index + match[0].length;
  let end = valStart;
  let escaped = false;
  while (end < str.length) {
    if (escaped) { escaped = false; end++; continue; }
    if (str[end] === '\\') { escaped = true; end++; continue; }
    if (str[end] === '"') {
      const afterQuote = str.substring(end + 1).trimStart();
      if (afterQuote.startsWith(',') || afterQuote.startsWith('}') || afterQuote.length === 0) break;
      end++;
      continue;
    }
    end++;
  }
  return str.substring(valStart, end).replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\t/g, ' ');
}

function extractIndividualBomObjects(str: string, startIdx: number): any[] {
  const items: any[] = [];
  const objRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  objRegex.lastIndex = startIdx;
  let match;
  while ((match = objRegex.exec(str)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj.part && (obj.spec !== undefined || obj.qty !== undefined || obj.reason !== undefined)) {
        items.push(obj);
      }
    } catch {
      try {
        const cleaned = sanitizeControlCharsInStrings(match[0]);
        const obj = JSON.parse(cleaned);
        if (obj.part && (obj.spec !== undefined || obj.qty !== undefined || obj.reason !== undefined)) {
          items.push(obj);
        }
      } catch {
        const part = extractBomFieldValue(match[0], 'part');
        const spec = extractBomFieldValue(match[0], 'spec');
        const reason = extractBomFieldValue(match[0], 'reason');
        const qtyMatch = match[0].match(/"qty"\s*:\s*(\d+)/);
        if (part) {
          items.push({
            part,
            spec: spec || '',
            qty: qtyMatch ? parseInt(qtyMatch[1], 10) : 1,
            reason: reason || '',
          });
        }
      }
    }
  }
  return items;
}

function extractBomFallback(str: string): any | null {
  const bomKeyIdx = str.indexOf('"bom_table"');
  if (bomKeyIdx === -1) return null;

  const colonIdx = str.indexOf('[', bomKeyIdx);
  if (colonIdx === -1) return null;

  let bomTable: any[] = [];

  const bomArrayStr = extractBalancedArray(str, colonIdx);
  if (bomArrayStr) {
    try {
      bomTable = JSON.parse(bomArrayStr);
    } catch {
      try {
        bomTable = JSON.parse(sanitizeControlCharsInStrings(bomArrayStr));
      } catch {
        try {
          bomTable = JSON.parse(stripControlCharsInStrings(bomArrayStr));
        } catch {}
      }
    }
  }

  if (!Array.isArray(bomTable) || bomTable.length === 0) {
    bomTable = extractIndividualBomObjects(str, colonIdx);
    if (bomTable.length > 0) {
      console.log(`🔧 [AgentSearch] BOM recovered ${bomTable.length} parts from truncated array`);
    }
  }

  if (!Array.isArray(bomTable) || bomTable.length === 0) return null;

  const reqKeyIdx = str.indexOf('"interpreted_requirements"');
  let interpretedRequirements: any[] = [];
  if (reqKeyIdx !== -1) {
    const reqStart = str.indexOf('[', reqKeyIdx);
    if (reqStart !== -1) {
      const reqArrayStr = extractBalancedArray(str, reqStart);
      if (reqArrayStr) {
        try { interpretedRequirements = JSON.parse(reqArrayStr); } catch {}
      }
    }
  }

  const extractStringField = (field: string): string => {
    const keyIdx = str.indexOf(`"${field}"`);
    if (keyIdx === -1) return '';
    const valStart = str.indexOf('"', keyIdx + field.length + 2);
    if (valStart === -1) return '';
    let end = valStart + 1;
    let esc = false;
    while (end < str.length) {
      if (esc) { esc = false; end++; continue; }
      if (str[end] === '\\') { esc = true; end++; continue; }
      if (str[end] === '"') break;
      end++;
    }
    const raw = str.substring(valStart + 1, end);
    return raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\t/g, '\t');
  };

  console.log(`🔧 [AgentSearch] BOM fallback extraction: ${bomTable.length} parts recovered`);

  return {
    interpreted_requirements: interpretedRequirements,
    decision_summary: { best_fit: '', alternative_suggestion: '', search_guidance: '' },
    bom_table: bomTable,
    bom_summary: extractStringField('bom_summary'),
    engineering_notes: extractStringField('engineering_notes'),
    data: [],
  };
}

function escapeLatexInJsonStrings(json: string): string {
  const validJsonEscapes = new Set(['n', 't', 'r', '"', '\\', '/', 'b', 'f', 'u']);
  const latexDelimiters = new Set(['(', ')', '[', ']']);
  const latexCommands = /^[a-zA-Z]/;
  let result = '';
  let inString = false;
  let i = 0;

  while (i < json.length) {
    const ch = json[i];

    if (ch === '"') {
      if (!inString) {
        inString = true;
      } else {
        let backslashCount = 0;
        let j = result.length - 1;
        while (j >= 0 && result[j] === '\\') { backslashCount++; j--; }
        if (backslashCount % 2 === 0) {
          inString = false;
        }
      }
      result += ch;
      i++;
      continue;
    }

    if (inString && ch === '\\') {
      const next = i + 1 < json.length ? json[i + 1] : '';
      if (next === '\\') {
        result += '\\\\';
        i += 2;
        continue;
      }
      if (validJsonEscapes.has(next)) {
        result += ch + next;
        i += 2;
        continue;
      }
      if (latexDelimiters.has(next)) {
        result += '\\\\' + next;
        i += 2;
        continue;
      }
      if (latexCommands.test(next)) {
        result += '\\\\' + next;
        i += 2;
        continue;
      }
      result += '\\\\';
      i++;
      continue;
    }

    result += ch;
    i++;
  }
  return result;
}

function extractDecisionSummaryFallback(str: string): any | null {
  const dsKeyIdx = str.indexOf('"decision_summary"');
  if (dsKeyIdx === -1) return null;

  const colonIdx = str.indexOf(':', dsKeyIdx + 18);
  if (colonIdx === -1) return null;

  const afterColon = str.substring(colonIdx + 1).trimStart();

  let summaryText = '';

  if (afterColon.startsWith('"')) {
    let end = 1;
    let esc = false;
    while (end < afterColon.length) {
      if (esc) { esc = false; end++; continue; }
      if (afterColon[end] === '\\') { esc = true; end++; continue; }
      if (afterColon[end] === '"') break;
      end++;
    }
    summaryText = afterColon.substring(1, end)
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\');
  } else if (afterColon.startsWith('{')) {
    const bestFitIdx = afterColon.indexOf('"best_fit"');
    if (bestFitIdx !== -1) {
      const bfValStart = afterColon.indexOf('"', bestFitIdx + 10);
      if (bfValStart !== -1) {
        let end = bfValStart + 1;
        let esc = false;
        while (end < afterColon.length) {
          if (esc) { esc = false; end++; continue; }
          if (afterColon[end] === '\\') { esc = true; end++; continue; }
          if (afterColon[end] === '"') break;
          end++;
        }
        summaryText = afterColon.substring(bfValStart + 1, end)
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\t/g, '\t')
          .replace(/\\\\/g, '\\');
      }
    }
  }

  if (!summaryText) return null;

  let interpretedRequirements: any[] = [];
  const reqKeyIdx = str.indexOf('"interpreted_requirements"');
  if (reqKeyIdx !== -1) {
    const reqStart = str.indexOf('[', reqKeyIdx);
    if (reqStart !== -1) {
      const reqArrayStr = extractBalancedArray(str, reqStart);
      if (reqArrayStr) {
        try { interpretedRequirements = JSON.parse(reqArrayStr); } catch {}
      }
    }
  }

  console.log(`🔧 [AgentSearch] Decision summary fallback extraction: ${summaryText.length} chars recovered`);

  return {
    interpreted_requirements: interpretedRequirements,
    decision_summary: summaryText,
    data: [],
  };
}

const PLACEHOLDER_REGEX = /\b(hold on|please wait|gather(ing)? the (necessary )?details|let me (check|look|search|verify|gather|find)|i('ll| will) need to (verify|check|search|look|gather|find)|one moment|searching for|looking up)\b/i;
const SUBSTANTIVE_MARKERS = /(\d+\s*(mm|cm|m|kg|g|lb|psi|bar|rpm|kw|hp|v|a|°|%|mpa|gpa|hz|nm|µm)|\d+\.\d+|•|—|\n-\s|specifications?:|features?:|rating:|capacity:|dimensions?:|material:|torque:|temperature:)/i;

function isPlaceholderText(text: string): boolean {
  if (text.length >= 300) return false;
  if (!PLACEHOLDER_REGEX.test(text)) return false;
  if (SUBSTANTIVE_MARKERS.test(text)) return false;
  return true;
}

function matchJsonOutput(text: string): RegExpMatchArray | null {
  return text.match(/```json\s*([\s\S]*?)\s*```/) ||
         text.match(/(\{[\s\S]*"comparison_table"[\s\S]*\})/) ||
         text.match(/(\{[\s\S]*"calculation_section"[\s\S]*\})/) ||
         text.match(/(\{[\s\S]*"bom_table"[\s\S]*\})/) ||
         text.match(/(\{[\s\S]*"decision_summary"[\s\S]*\})/) ||
         text.match(/(\{[\s\S]*"data"[\s\S]*\})/) ||
         text.match(/(\[\s*\{[\s\S]*\}\s*\])/);
}

function safeJsonParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    try {
      return JSON.parse(sanitizeControlCharsInStrings(str));
    } catch {
      try {
        return JSON.parse(stripControlCharsInStrings(str));
      } catch {
        try {
          return JSON.parse(escapeLatexInJsonStrings(str));
        } catch {
          try {
            return JSON.parse(escapeLatexInJsonStrings(sanitizeControlCharsInStrings(str)));
          } catch {
            const bomFallback = extractBomFallback(str);
            if (bomFallback) return bomFallback;
            const dsFallback = extractDecisionSummaryFallback(str);
            if (dsFallback) return dsFallback;
            throw new SyntaxError('All JSON parse strategies failed');
          }
        }
      }
    }
  }
}

let cachedSettings: AgentSettingsData | null = null;
let settingsLoadedAt: number = 0;
const SETTINGS_CACHE_TTL = 30000; // 30 seconds

async function loadSettings(): Promise<AgentSettingsData> {
  const now = Date.now();
  if (cachedSettings && (now - settingsLoadedAt) < SETTINGS_CACHE_TTL) {
    return cachedSettings;
  }
  try {
    cachedSettings = await getAgentSettings();
    settingsLoadedAt = now;
    console.log('🔧 [AgentSearch] Loaded settings:', cachedSettings.model, cachedSettings.reasoningEffort);
    return cachedSettings;
  } catch (error) {
    console.warn('⚠️ [AgentSearch] Failed to load settings, using defaults:', error);
    return DEFAULT_SETTINGS;
  }
}

function createWebSearchTool(settings: AgentSettingsData) {
  return webSearchTool({
    searchContextSize: settings.searchContextSize,
    userLocation: {
      type: 'approximate',
      city: null,
      country: null,
      region: null,
      timezone: null,
    },
  });
}

const FORMATTING_BLOCK = `

# RESPONSE TEXT FORMATTING (ENFORCED)

When writing text in decision_summary (best_fit, alternative_suggestion), explanations, and clarifications, ALWAYS use structured markdown:
- Use **bold** for key terms, product names, spec values, and important concepts
- When listing multiple items, put each on its own line as a numbered list with bold headings:
  1. **Item heading** — description
  2. **Next item** — description
- NEVER write inline run-on lists like "(1) thing, (2) thing, (3) thing" in a single paragraph
- Use ## or ### headings to separate sections in longer responses
- Keep paragraphs short (2-3 sentences). Add blank lines between paragraphs.
- When asking for missing specs, format each as a numbered item with bold label and example value
- Exception: search_guidance field stays pipe-separated as specified in its own rules

## HARD RULE: best_fit and alternative_suggestion MUST be a bulleted list

decision_summary.best_fit and decision_summary.alternative_suggestion MUST be written as a short markdown bulleted list of 3–6 bullets, NEVER as a single run-on sentence or paragraph. EXCEPTION: when the response qualifies as a NO-MATCH / LOW-CONFIDENCE response (see the NO-MATCH / LOW-CONFIDENCE RESPONSE FORMAT block below), this 3–6 bullet rule is OVERRIDDEN — best_fit and alternative_suggestion must instead follow the Result/Why/Next steps shape from that block, or be left as empty strings. Outside of no-match cases, each bullet MUST:
- start with "- " (dash + space) on its own line
- open with a short **bold label** followed by " — " and a short value/sentence
- cover ONE topic only — never glue unrelated facts together with "and ... and ..."
- stay short and scannable (roughly one line each)

For best_fit, use these bullet labels (skip any that don't apply, but do NOT collapse multiple facts into one bullet):
- **Model / Part #** — exact catalog identifier of the matched product
- **Key matched specs** — only the spec values the user asked about (e.g. 40 mm shaft, 10 mm lead)
- **What's different / caveats** — anything that doesn't perfectly match (length, stroke, mounting, etc.)
- **How to order / configure** — end machining, cut-to-length, preloaded nut, options
- **Source** — short note like "from the NSK SS catalog" (optional)

For alternative_suggestion, use the same bullet rule with labels covering the alternative product or broader recommendation:
- **Why consider it** — one-line reason this alternative is worth a look
- **Trade-offs** — what you give up vs. the best_fit
- **When to pick this instead** — concrete situation where it's the better choice
- **Model / Part #** — if you have a specific alternative product in mind

WRONG (run-on sentence — never do this):
"NSK HSS4010N1D0950 is the closest catalog match: it has a 40 mm shaft diameter, 10 mm lead, a 600 mm screw length with 950 mm overall dimension, and comes with a preloaded nut and detailed shaft-end dimensions in the NSK SS series catalog, so it can be ordered with appropriate end machining and cut to an effective stroke around 500 mm."

RIGHT (bulleted list — always do this):
- **Model / Part #** — NSK HSS4010N1D0950
- **Key matched specs** — 40 mm shaft diameter, 10 mm lead
- **Length** — 600 mm screw, 950 mm overall
- **Caveats** — effective stroke ~500 mm after end machining
- **How to order / configure** — comes with preloaded nut, cut-to-length and end machining available
- **Source** — NSK SS series catalog

## HARD RULE: data and specifications MUST be formatted as a table

Whenever your response contains TWO OR MORE related data points — specifications, parameters, measurements, or numeric values with units — you MUST present them as a markdown table. NEVER list them as inline prose, a run-on sentence, or a comma-separated list.

This rule applies to ALL response types: clarifications, explanations, follow-up answers, text-only responses, and any decision_summary text. It is not limited to product-search results.

Table format (always use this column order when units apply):
| Parameter | Value | Unit |
|---|---|---|
| Max load | 32 | kN |
| Duty cycle | 100 | % |
| Max stroke | 1500 | mm |

When units don't apply (e.g. categorical or text values), use a two-column table:
| Parameter | Value |
|---|---|
| Protection class | IP65M |
| Screw type | Ball screw |

THRESHOLD: A single isolated fact does not need a table ("Yes, it is IP65 rated"). Two or more related data points ALWAYS require a table.

WRONG (prose — never do this):
"For the EWELLIX EMA-80 we already have key specs like 32 kN max load, 31 kN dynamic load rating, 100% duty cycle, 1500 mm max stroke, IP65M protection, 10 mm lead, 160 mm/s max speed, 960 rpm max screw speed."

RIGHT (table — always do this):
| Parameter | Value | Unit |
|---|---|---|
| Maximum load | 32 | kN |
| Dynamic load rating | 31 | kN |
| Duty cycle | 100 | % |
| Maximum stroke | 1500 | mm |
| Protection | IP65M | — |
| Lead | 10 | mm |
| Maximum speed | 160 | mm/s |
| Max screw speed | 960 | rpm |`;

const NO_MATCH_RESPONSE_BLOCK = `

## NO-MATCH / LOW-CONFIDENCE RESPONSE FORMAT (ENFORCED)

This block applies ONLY when your response will not include any structured outputs — i.e. the "data" array is empty AND there is no comparison_table AND no bom_table AND no calculation_section. In that case, the user-visible answer is your prose only (decision_summary fields and/or chat_summary), and it MUST follow the exact shape below.

REQUIRED SHAPE (use these three markdown sub-headers, in this order, nothing else):

### Result
One single line stating what was (or wasn't) found. Name the part / spec the user asked about. No preamble.

### Why
At most 2 short bullets. Fact-only. Each bullet is one concrete reason — a missing spec, a discontinued model, an unpublished datasheet, a brand we don't carry, etc. If there is only one real reason, use one bullet.

### Next steps
At most 3 short bullets. Each bullet is a concrete action the user can take right now (share the nameplate model number, upload the datasheet, try the OEM distributor page, broaden a spec, switch to a comparable family, etc.). Every bullet must unlock a next action — no philosophical advice.

HARD LIMITS:
- Total length cap: ~80 words across all three sections combined.
- No paragraphs. Bullets and the single Result line only.
- No recap of the user's question.
- No apologetic preambles. The words "Unfortunately", "Sorry", "I regret", "I apologize" are BANNED.
- No first-person narration of your own search process. The phrases "I attempted", "I searched", "I tried", "I could not find", "I was unable", "I would have to guess", "Without an official", "What this means for you", "Based on my search" are BANNED. State facts about the part / market, not facts about your own actions.
- No filler closers like "Let me know if…", "Feel free to…", "Hope this helps".

WHERE TO PUT IT:
- If you are emitting the structured JSON shape, put this Result/Why/Next steps content into chat_summary (or decision_summary.best_fit if chat_summary isn't available in your output schema for this query type) and leave decision_summary.alternative_suggestion and decision_summary.search_guidance as empty strings.
- The same word and phrasing limits above also apply to decision_summary.best_fit and decision_summary.alternative_suggestion when nothing matched: degrade them to the same Result/Why/Next steps shape, or leave them as empty strings. Do NOT fill them with verbose "we considered X, Y, Z but…" narrative.

ALTERNATIVE SEARCH CHIPS (use when you name specific products in your no-match response):
- When your ### Next steps or ### Why section names 1–3 specific real products the user could search for next, also populate the "alternative_searches" array in your JSON output.
- Each entry: { "label": "<short product name/model>", "query": "<focused search string with manufacturer + model + key spec>" }
- Maximum 3 entries. Only include products you actually named in your prose — do NOT add generic categories.
- If your response names no specific products, leave alternative_searches as an empty array [].
- Example: if you mention "Ropeblock SE.355.5016.7.5" in your Next steps, add { "label": "Ropeblock SE.355.5016.7.5", "query": "Ropeblock SE.355.5016.7.5 wire rope sheave" }.
- These chips let the user click directly to search for the named alternative without retyping — make the query a focused, effective search string.

EXAMPLE (good):
### Result
No verified datasheet found for **ASM109**.

### Why
- The part number doesn't match any published catalog from the major motor OEMs we searched.
- Several distributor listings reference it but none link to an original manufacturer PDF.

### Next steps
- Share the nameplate brand and any prefix/suffix from the motor housing.
- Upload the datasheet directly if you have a copy.
- Try the closest match: a 1.5 kW 4-pole IEC 90L frame from ABB, Siemens, or WEG.

EXAMPLE (bad — never do this):
"Unfortunately, I attempted multiple targeted searches across manufacturer sites and could not find an official datasheet for ASM109. Without an official drawing I would have to guess at the dimensions. What this means for you is that you may want to provide more information so I can help further. Let me know if you have additional details!"
`;

const COMPARISON_CITATION_RULES = `\n## COMPARISON CELL ATTRIBUTION (REQUIRED)\nFor every comparison_table row you produce, you MUST also produce a "value_sources" array PARALLEL to the "values" array — same length, same order. Each entry tags where that specific cell value came from. Format:\n  { "parameter": "Voltage", "values": ["230 V AC", "24 V DC"], "value_sources": [<source for cell 1>, <source for cell 2>] }\n\nEach source entry MUST be one of these four kinds (or null when the cell is empty / "—"):\n- { "kind": "web", "url": "https://manufacturer.com/datasheet.pdf", "label": "manufacturer.com" } — Use ONLY for HTTPS URLs you actually visited or that came back from web search results. The label is optional but a short domain name like "siemens.com" is helpful.\n- { "kind": "datasheet", "label": "DeepFolder catalog datasheet — <Product Name>" } — Use when the value came from a PDF datasheet attached to a product in the database-context block. Put the product name in the label so the user knows which one.\n- { "kind": "database", "label": "DeepFolder catalog" } — Use when the value came from a database product's own metadata (its description, specs field, etc.) but not from its datasheet PDF.\n- { "kind": "model_knowledge", "label": "AI engineering knowledge" } — Use HONESTLY when the value is from your general training rather than from a specific cited source. Do NOT invent URLs to avoid this — model_knowledge is the correct, honest answer when no real citation exists.\n\nRules:\n- value_sources is REQUIRED on every row. Length MUST match the values array exactly.\n- Use null only for empty cells (value is "—", "", or "N/A").\n- NEVER invent URLs. If you didn't visit a real page, use model_knowledge.\n- The legacy form of inlining "[src](https://...)" at the end of a value is still allowed as a backstop, but value_sources is the primary attribution channel — the UI prefers it.\n`;

const COMPARISON_SIDE_OUTPUT_BLOCK = `\n\n## COMPARISON SIDE-OUTPUT\nThe user asked you to compare products in addition to finding them. After you populate the "data" array with product cards (normal product-search response), you MUST also produce a "comparison_table" field with this exact shape:\n{ "products": ["Product A", "Product B", ...], "rows": [{ "parameter": "Param Name", "values": ["Value for A", "Value for B", ...], "value_sources": [<src1>, <src2>, ...] }, ...] }\nRules:\n- Pick the top 2–4 candidates from the products you returned in "data" (more if the user asked for "top N").\n- Names in "comparison_table.products" MUST exactly match product names that appear in "data".\n- Include 6–12 meaningful technical parameters as rows.\n- The comparison table is ADDITIONAL to the product cards — never empty the "data" array.\n${COMPARISON_CITATION_RULES}`;

function createInstructionsFactory(customInstructions: string, classifierContext?: string, isBuildQuery?: boolean, isForcedProductSearch?: boolean, historySummary?: string, dbContextBlock?: string, manufacturerBlock?: string, isComparisonQuery?: boolean, isExplanationSpecQuery?: boolean, isCalculationQuery?: boolean, isSearchAndCompareQuery?: boolean, wantsComparisonSideOutput?: boolean, productContextBlock?: string, calculationMode?: 'size_then_search' | 'search_then_size', isExploreQuery?: boolean) {
  return (runContext: RunContext<AgentContext>, _agent: Agent<AgentContext>) => {
    const { workflowInputAsText } = runContext.context;
    const baseInstructions = customInstructions || DEFAULT_SETTINGS.instructions;
    const bomBlock = (isForcedProductSearch || baseInstructions.includes('PRODUCT BUILD MODE')) ? '' : `\n\n${BOM_INSTRUCTIONS_BLOCK}`;
    // Pick exactly ONE calculation block based on the classifier's
    // calculation_mode so the agent never sees contradictory ordering rules.
    // Default to CALCULATE_THEN_SEARCH for sizing — it's the safer default
    // and matches the streaming order the UI expects.
    const calcBlockToUse = calculationMode === 'search_then_size'
      ? SEARCH_THEN_CALCULATE_BLOCK
      : CALCULATE_THEN_SEARCH_BLOCK;
    const calcBlock = (isForcedProductSearch || baseInstructions.includes('CALCULATION-FIRST SEARCH MODE') || baseInstructions.includes('SEARCH-THEN-CALCULATE MODE') || baseInstructions.includes('CALCULATE-THEN-SEARCH MODE')) ? '' : `\n\n${calcBlockToUse}`;
    const classifierBlock = (isForcedProductSearch || !classifierContext) ? '' : `\n\n${classifierContext}\n`;
    const formattingBlock = baseInstructions.includes('RESPONSE TEXT FORMATTING') ? '' : FORMATTING_BLOCK;
    const noMatchBlock = baseInstructions.includes('NO-MATCH / LOW-CONFIDENCE RESPONSE FORMAT') ? '' : NO_MATCH_RESPONSE_BLOCK;

    let overridePrefix = '';
    if (isBuildQuery) {
      overridePrefix = `CRITICAL OVERRIDE: This is a BUILD query. You MUST use the PRODUCT BUILD MODE format. Return bom_table (array of {part, spec, qty, reason}), bom_summary (markdown explaining WHY each part was selected with engineering reasoning), and engineering_notes (markdown explaining HOW to combine the parts). The data array MUST be empty []. Do NOT return product cards. Follow the BOM format exactly. bom_summary MUST explain the selection reasoning for each part. engineering_notes MUST explain integration steps, compatibility, and how parts connect. Both must use structured markdown with ## section headers. Adapt section headers to the topic.\n\n`;
    } else if (isCalculationQuery) {
      if (calculationMode === 'search_then_size') {
        overridePrefix = `CRITICAL OVERRIDE: This is a CALCULATION_SEARCH query in **search_then_size** mode. The user named a specific product and wants a derived metric of THAT product. You MUST follow the SEARCH-THEN-CALCULATE MODE in EXACTLY this order — no exceptions.\n\nSTEP 1 — PRODUCT SEARCH (NON-OPTIONAL — run this first, always):\nYou MUST populate the "data" array with at least one product card BEFORE computing any calculation. If the user named a specific product (e.g., "SKF 7207 BECBP", "EMA-80", "THK KR46", "FAG 6306 2RS"), you MUST (a) run a web search explicitly for that named product (e.g., search "SKF 7207 BECBP angular contact bearing datasheet") and include it as the FIRST card in "data", then (b) optionally add 1–3 close alternatives. Do NOT fill results with only generic alternatives — the named product MUST be the first card.\n\nSTEP 2 — ENGINEERING CALCULATION (runs after STEP 1):\nPerform the full engineering calculation and populate the "calculation_section" JSON field (title, given, steps, result, derived_specs, summary, legend, formula_sources). Use specs retrieved in STEP 1 as the primary source of values (dynamic load rating C, static load rating C0, speed limit, rated force, etc.). If a required product-specific value is unavailable, assume a typical engineering value for this product class and tag it kind="ai". Do NOT refuse to calculate — always produce a calculation_section.\n\nMANDATORY OUTPUT RULE: The worked calculation MUST go in "calculation_section". Writing equations, formulas, or numeric results into "decision_summary", "chat_summary", or any prose field is FORBIDDEN — those fields are for search context only, never for calculation answers.\n\nDo NOT return bom_table.\n\n`;
      } else {
        overridePrefix = `CRITICAL OVERRIDE: This is a CALCULATION_SEARCH query in **size_then_search** mode (sizing). The user gave physical inputs (mass, force, speed, flow, pressure, distance, time, life target, etc.) and wants the system to SIZE a component, then recommend matching products. You MUST follow the CALCULATE-THEN-SEARCH MODE in EXACTLY this order — no exceptions.\n\nSTEP 1 — ENGINEERING CALCULATION (NON-OPTIONAL — run this first, always):\nPerform the full engineering calculation from the user's physical inputs and populate the "calculation_section" JSON field (title, given, steps, result, derived_specs, summary, legend, formula_sources). Apply a 20–25% safety margin (unless the user specified otherwise or this is a life calculation). The calculation_section MUST be present in your JSON output — do NOT skip it and do NOT return only product cards.\n\nMANDATORY OUTPUT RULE: The worked calculation MUST go in "calculation_section". Writing equations, formulas, or numeric results into "decision_summary", "chat_summary", or any prose field is FORBIDDEN — those fields are for search context only, never for calculation answers. Even if the result is a ratio or is expressed in terms of an unknown input, produce a full calculation_section with that ratio or symbolic result.\n\nMISSING INPUTS — DO NOT REFUSE: If a required physical input is absent from the user's query but has a well-known typical range for this component class or material grade, assume a conservative mid-range value from your engineering training, tag the corresponding given[] row with source: { "kind": "ai", "label": "AI assumed typical value — verify against design spec" }, and proceed with the full calculation. Examples: shaft diameter missing → assume 40 mm; wall thickness missing → assume 5 mm; surface finish factor missing → use Kf=0.85 for machined steel; equivalent load P missing → assume P = 5 kN for a general-purpose bearing. Do NOT refuse to calculate — always produce a calculation_section.\n\nSTEP 2 — DERIVE SEARCH SPECS:\nConvert the calculation result into concrete product specs in "derived_specs" (e.g. "≥3.0 kW continuous power", "≥40 Nm peak torque", "48 V DC"). These derived specs — NOT the raw user query — drive STEP 3.\n\nSTEP 3 — PRODUCT SEARCH against the derived specs:\nRun web searches using the DERIVED SPECS and populate the "data" array with at least 3 product cards scored against those derived specs (not the raw query). Each card should mark whether it meets each derived spec. Maintain brand diversity unless the user asked for one brand.\n\nORDERING: in the streamed JSON, "calculation_section" MUST appear BEFORE "data". Do NOT return bom_table.\n\n`;
      }
    } else if (isForcedProductSearch) {
      overridePrefix = `CRITICAL OVERRIDE: The user has explicitly selected PRODUCT SEARCH mode. You MUST return structured JSON with "interpreted_requirements" (array of {parameter, requirement, type}), "decision_summary" (string explaining your analysis), and "data" (array of product objects). Even if the query looks like a build request or general question, treat it as a product search request and find relevant products. Do NOT return bom_table or engineering_notes — return product cards in the "data" array only. ALWAYS include interpreted_requirements extracted from the query. Do NOT return plain text — you MUST return valid JSON.\n\n`;
    } else if (isSearchAndCompareQuery) {
      overridePrefix = `CRITICAL OVERRIDE: This is a SEARCH-AND-COMPARE query. You MUST do BOTH steps in this order:\n\nSTEP 1 — PRODUCT SEARCH: Run the normal product-search flow. Populate "interpreted_requirements" (array of {parameter, requirement, type}) and the "data" array with real product cards scored against the requirements (same shape as a regular product_search response). Use web search and any provided database products. Database products that fit the requirements should be evaluated and scored just like in a normal product_search.\n\nSTEP 2 — COMPARISON TABLE: From the products you just returned in "data", pick the top candidates (typically 2–4, more if the user asks for "top N") and produce a "comparison_table" field with the structure: { "products": ["Product A", "Product B", ...], "rows": [{ "parameter": "Param Name", "values": ["Value for A", "Value for B", ...], "value_sources": [<src1>, <src2>, ...] }, ...] }. The product names in "comparison_table.products" MUST exactly match names that appear in the "data" array. Include 6–12 meaningful technical parameters. Also include "decision_summary" with best_fit and alternative_suggestion explaining the key differences and your recommendation.\n\nFor EVERY row, value_sources is REQUIRED — same length as values, with one source object per cell tagged as kind="web" (with url), "datasheet" (with label naming the catalog product), "database" (catalog metadata), or "model_knowledge" (your own training, no URL). Use null only for empty cells. Never invent URLs — pick model_knowledge instead.\n\nDo NOT return an empty "data" array. The comparison table is an ADDITIONAL view on top of the product cards, not a replacement.\n\n`;
    } else if (isComparisonQuery) {
      overridePrefix = `CRITICAL OVERRIDE: This is a PURE COMPARISON query — the user already named the products to compare and is not asking you to perform a new product search. You MUST return a "comparison_table" field in your JSON with the structure: { "products": ["Product A", "Product B", ...], "rows": [{ "parameter": "Param Name", "values": ["Value for A", "Value for B", ...], "value_sources": [<src1>, <src2>, ...] }, ...] }. The "products" array lists all compared product names. Each row in "rows" compares one parameter across all products. Include 6–12 meaningful technical parameters. Also include "chat_summary" explaining key differences and your recommendation. The "data" array MUST be empty []. Do NOT return product cards — only comparison_table and chat_summary.\n\nFor EVERY row, value_sources is REQUIRED — same length as values, with one source object per cell tagged as kind="web" (with url), "datasheet" (with label naming the catalog product), "database" (catalog metadata), or "model_knowledge" (your own training, no URL). Use null only for empty cells. Never invent URLs — pick model_knowledge instead.\n\n`;
    } else if (isExploreQuery) {
      overridePrefix = `CRITICAL OVERRIDE: You are in EXPLORE MODE for a specific product the user has selected. Your task is to produce a comprehensive technical profile using the DATASHEET EXCERPT and CATALOG ATTRIBUTES provided in the context.\n\nYou MUST return a JSON response with the following fields:\n- "chat_summary": a markdown string structured as:\n  ## Overview\n  (2–3 sentences: what the product is, its primary use-case, key differentiators)\n  ## Specifications\n  (A markdown table with ALL specification parameters found in the datasheet and catalog — DO NOT curate or summarize — list EVERY parameter you find. Target ≥15 rows if the datasheet supports it. Format: | Parameter | Value | Unit |)\n  ## Fit\n  (1–2 sentences on typical application fit and any notable constraints)\n  Reference: <datasheet URL if one exists, otherwise omit this line>\n- "comparison_table": { "products": ["<ProductName>"], "rows": [ ... ] } — mirror every spec row from the ## Specifications table. Each row: { "parameter": "...", "values": ["..."], "value_sources": [<src>] }. Tag sources as kind="datasheet" (catalog product), "web" (manufacturer page, with url), "database" (catalog metadata), or "model_knowledge" (training data). Never invent URLs.\n- "data": [] (empty array — do NOT return product cards in Explore mode)\n\nEXHAUSTIVE EXTRACTION RULES:\n1. Read the ENTIRE DATASHEET EXCERPT — do not stop at the first table or section.\n2. Extract EVERY parameter: electrical, mechanical, thermal, environmental, dimensional, performance, ratings, certifications, options.\n3. Do NOT merge, abbreviate, or omit parameters — list each one as its own row.\n4. If a value appears as a range (e.g. "10–50 V"), list it as-is.\n5. For any spec in the CATALOG ATTRIBUTES that is NOT already in the datasheet table, add it as an additional row tagged kind="database".\n\nDo NOT return plain text. You MUST return valid JSON with the fields above.\n\n`;
    } else if (isExplanationSpecQuery) {
      overridePrefix = `IMPORTANT: This is a SPECIFICATION / EXPLANATION query about a specific product. If the user asks for technical data, specifications, or characteristics of a named product, you MUST return a "comparison_table" field in your JSON with the structure: { "products": ["<ProductName>"], "rows": [{ "parameter": "Spec Name", "values": ["Spec Value"], "value_sources": [<src>] }, ...] }. The "products" array should contain exactly one entry — the product name. Each row lists one technical specification. Include as many relevant specs as you can find (at minimum 5). Also include "chat_summary" with a brief explanation. The "data" array MUST be empty []. If the query is NOT about specific product specs, ignore this instruction and return the normal JSON format.\n\nFor EVERY row, value_sources is REQUIRED — exactly one source object matching the single value. Tag it as kind="web" (with url) when the spec comes from a manufacturer datasheet or web page you visited, "datasheet"/"database" when it comes from the catalog, or "model_knowledge" when you're answering from general training. Never invent URLs — pick model_knowledge instead.\n\n`;
    }

    const historyBlock = historySummary ? `\n\n## EARLIER CONVERSATION CONTEXT\nThe following is a summary of the earlier part of this conversation. Use it to maintain continuity and reference prior discussion points when relevant:\n${historySummary}\n## END EARLIER CONTEXT\n` : '';

    const dbBlock = dbContextBlock ? `\n\n${dbContextBlock}\n` : '';
    const productBlock = productContextBlock ? `\n\n${productContextBlock}\n` : '';
    const mfgBlock = manufacturerBlock ? `\n\n${manufacturerBlock}\n` : '';
    const compareSideBlock = wantsComparisonSideOutput ? COMPARISON_SIDE_OUTPUT_BLOCK : '';

    return `${overridePrefix}${baseInstructions}${bomBlock}${calcBlock}${formattingBlock}${noMatchBlock}${classifierBlock}${historyBlock}${dbBlock}${productBlock}${mfgBlock}${compareSideBlock}

USER QUERY: ${workflowInputAsText}`;
  };
}

const REASONING_MODELS = [
  'o1', 'o1-mini', 'o1-pro',
  'o3', 'o3-mini', 'o3-pro', 'o3-deep-research',
  'o4-mini', 'o4-mini-deep-research',
  'gpt-5.1-codex-mini', 'gpt-5.2-pro', 'gpt-5-pro'
];

function createAgent(settings: AgentSettingsData, classifierContext?: string, disableWebSearch?: boolean, isBuildQuery?: boolean, isForcedProductSearch?: boolean, historySummary?: string, dbContextBlock?: string, manufacturerBlock?: string, isComparisonQuery?: boolean, isExplanationSpecQuery?: boolean, isCalculationQuery?: boolean, isSearchAndCompareQuery?: boolean, wantsComparisonSideOutput?: boolean, productContextBlock?: string, calculationMode?: 'size_then_search' | 'search_then_size', isExploreQuery?: boolean): Agent<AgentContext> {
  const tools = (settings.webSearchEnabled && !disableWebSearch) ? [createWebSearchTool(settings)] : [];
  
  const modelSettings: any = {
    store: settings.storeEnabled,
    temperature: settings.temperature ?? 0.2,
  };

  if (settings.maxTokens && settings.maxTokens > 0) {
    modelSettings.maxOutputTokens = settings.maxTokens;
  }
  
  const supportsReasoning = REASONING_MODELS.includes(settings.model);
  if (supportsReasoning && settings.reasoningEffort !== 'none') {
    modelSettings.reasoning = {
      effort: settings.reasoningEffort,
      summary: settings.reasoningSummary,
    };
    delete modelSettings.temperature;
  }

  return new Agent<AgentContext>({
    name: settings.name,
    instructions: createInstructionsFactory(settings.instructions, classifierContext, isBuildQuery, isForcedProductSearch, historySummary, dbContextBlock, manufacturerBlock, isComparisonQuery, isExplanationSpecQuery, isCalculationQuery, isSearchAndCompareQuery, wantsComparisonSideOutput, productContextBlock, calculationMode, isExploreQuery),
    model: settings.model as any,
    tools,
    outputType: 'text',
    modelSettings,
  });
}

const deepfolderRunner = new Runner({
  traceMetadata: {
    __trace_source__: 'hybrid-search',
    workflow_id: 'wf_hybrid_search_agent',
  },
  tracingDisabled: true,
});

export interface InterpretedRequirement {
  parameter: string;
  requirement: string;
  type: 'hard' | 'soft';
}

export interface AgentUsageInfo {
  model: string;
  agent_duration_ms: number;
  guardrails_duration_ms?: number;
  estimated_output_tokens: number;
  compression_usage?: {
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    duration_ms: number;
  };
  web_search_calls?: number;
}

export interface BomItem {
  part: string;
  spec: string;
  qty: number;
  reason: string;
}

export type ComparisonCellSourceKind = 'web' | 'datasheet' | 'database' | 'model_knowledge';

export interface ComparisonCellSource {
  kind: ComparisonCellSourceKind;
  label?: string;
  url?: string;
}

export interface ComparisonRow {
  parameter: string;
  values: string[];
  valueSources?: Array<ComparisonCellSource | null>;
}

const VALID_SOURCE_KINDS = new Set(['web', 'datasheet', 'database', 'model_knowledge']);
const INLINE_SRC_LINK_RE = /\s*\(?\[src\]\((https?:\/\/[^)\s]+)\)\)?\s*$/i;

function normalizeComparisonSource(raw: any): ComparisonCellSource | null {
  if (!raw || typeof raw !== 'object') return null;
  const kind = typeof raw.kind === 'string' ? raw.kind.toLowerCase().trim() : '';
  if (!VALID_SOURCE_KINDS.has(kind)) return null;
  const out: ComparisonCellSource = { kind: kind as ComparisonCellSourceKind };
  if (kind === 'web') {
    const url = typeof raw.url === 'string' ? raw.url.trim() : '';
    if (!/^https?:\/\//i.test(url)) return null;
    out.url = url;
  }
  if (typeof raw.label === 'string') {
    const lbl = raw.label.trim();
    if (lbl) out.label = lbl;
  }
  return out;
}

function buildComparisonRow(raw: any): ComparisonRow {
  const rawValues: any[] = Array.isArray(raw.values) ? raw.values : [];
  const rawSources: any[] = Array.isArray(raw.value_sources) ? raw.value_sources : [];

  const valueSources: Array<ComparisonCellSource | null> = [];
  const cleanedValues: string[] = rawValues.map((v: any, idx: number) => {
    let str = String(v ?? '—');
    let inlineSource: ComparisonCellSource | null = null;
    const m = str.match(INLINE_SRC_LINK_RE);
    if (m) {
      inlineSource = { kind: 'web', url: m[1] };
      str = str.replace(INLINE_SRC_LINK_RE, '').trim() || '—';
    }
    const parsed = normalizeComparisonSource(rawSources[idx]) ?? inlineSource;
    valueSources.push(parsed);
    return canonicalizeUnitTokensInCell(str);
  });

  return {
    parameter: String(raw.parameter),
    values: cleanedValues,
    valueSources,
  };
}

export interface ComparisonTableData {
  products: string[];
  rows: ComparisonRow[];
}

export interface CalculationStep {
  label: string;
  content?: string;
  formula?: string;
  result?: { value: string; unit?: string };
}

export type CalculationGivenSourceKind = 'user' | 'db' | 'datasheet_pdf' | 'web' | 'ai';

export interface CalculationGivenSource {
  kind: CalculationGivenSourceKind;
  label: string;
  url?: string;
}

export type FormulaSourceKind = 'standard' | 'manufacturer' | 'textbook' | 'ai';

export interface FormulaSource {
  label: string;
  url?: string;
  kind: FormulaSourceKind;
}

export interface CalculationGiven {
  name: string;
  value: string;
  unit: string;
  source?: CalculationGivenSource;
}

export interface CalculationSection {
  title: string;
  given: CalculationGiven[];
  formula?: string;
  steps: CalculationStep[];
  result: { name: string; value: string; unit: string };
  derived_specs: Array<{ label: string; value: string; unit?: string }>;
  summary: string;
  formula_sources?: FormulaSource[];
}

export interface AgentSearchResult {
  success: boolean;
  products: UnifiedProduct[];
  chatSummary: string;
  logicExplanation: string;
  interpretedRequirements?: InterpretedRequirement[];
  decisionSummary?: string;
  bestFit?: string;
  alternativeSuggestion?: string;
  searchGuidance?: string;
  alternativeSearches?: { label: string; query: string }[];
  bomTable?: BomItem[];
  bomSummary?: string;
  engineeringNotes?: string;
  comparisonTable?: ComparisonTableData;
  calculationSection?: CalculationSection;
  rawOutput?: string;
  error?: string;
  guardrailsBlocked?: boolean;
  guardrailsFailOutput?: any;
  _usage?: AgentUsageInfo;
}

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function executeAgentSearch(
  query: string,
  chatHistory: ChatHistoryMessage[] = [],
  onToken?: (token: string) => void,
  classification?: QueryClassification,
  isForcedProductSearch?: boolean,
  dbContextBlock?: string,
  manufacturerDiscovery?: import('../agents/manufacturer-discovery').ManufacturerDiscoveryResult,
  productContextBlock?: string,
  sessionId?: number | null,
  userId?: string | null,
  previousProductNames?: string[]
): Promise<AgentSearchResult> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const settings = await loadSettings();
    
    const classifierContext = classification ? buildAgentContext(classification, previousProductNames ?? []) : undefined;

    let processedQuery = query;
    let guardrailsDuration = 0;
    const conversationDepth = chatHistory ? chatHistory.length : 0;
    const skipGuardrails = conversationDepth >= 2;
    if (settings.guardrailsEnabled && settings.guardrailsConfig && !skipGuardrails) {
      try {
        const guardrailsConfig = JSON.parse(settings.guardrailsConfig);
        console.log('🛡️ [AgentSearch] Running guardrails check...');
        const guardrailsStart = Date.now();
        
        let guardrailsInput = query;
        if (conversationDepth > 0) {
          const recentHistory = chatHistory.slice(-2).map(m => `[${m.role}]: ${m.content}`).join('\n');
          guardrailsInput = `Conversation context:\n${recentHistory}\n\n[user]: ${query}`;
        }
        
        const { hasTripwire, safeText, failOutput } = await runAndApplyGuardrails(guardrailsInput, guardrailsConfig);
        guardrailsDuration = Date.now() - guardrailsStart;
        
        if (hasTripwire) {
          console.log('🚫 [AgentSearch] Guardrails blocked the query');
          return {
            success: false,
            products: [],
            chatSummary: 'Your query was blocked by safety filters.',
            logicExplanation: 'The query triggered one or more guardrails.',
            guardrailsBlocked: true,
            guardrailsFailOutput: failOutput,
            error: 'Query blocked by guardrails',
          };
        }
        
        processedQuery = safeText.includes('[user]:') ? query : safeText;
        console.log('✅ [AgentSearch] Guardrails passed');
      } catch (guardrailError: any) {
        console.warn('⚠️ [AgentSearch] Guardrails error (continuing without):', guardrailError?.message);
      }
    } else if (skipGuardrails) {
      console.log(`🛡️ [AgentSearch] Skipping guardrails — established conversation (${conversationDepth} messages in history)`);
    }

    const intentsRequiringWebSearch = new Set(['product_search', 'recommendation', 'comparison', 'build', 'calculation_search']);
    const intentNeedsWeb = classification ? intentsRequiringWebSearch.has(classification.intent) : false;

    // Detect previously-shown products by sniffing for the structured footer
    // lines the frontend now emits (`Products shown:` summary + per-product
    // `[id=...]` / `[mfr=...]` tags). The legacy markers (`fit_score`,
    // `product_name`, `reference_link`, `attributes`) never appear in the
    // human-readable history we actually send back, so the old check always
    // returned false and broke follow-up grounding.
    const historyHasProducts = chatHistory.some(
      (m) =>
        m.role === 'assistant' &&
        (m.content.includes('Products shown:') ||
          /\[(?:id|mfr|url)=/.test(m.content) ||
          m.content.includes('/product/'))
    );
    // Clarification, comparison, and calculation follow-ups answer directly from cached product
    // context — they must NOT trigger a web search override.
    const noWebFollowUpTypes = new Set(['clarification', 'comparison', 'calculation']);
    const followUpAnswerNeedsWeb = !classification?.follow_up_answer_type ||
      !noWebFollowUpTypes.has(classification.follow_up_answer_type);

    const productContextIntents = new Set(['explanation', 'follow_up']);
    const overrideForProductContext = classification
      ? (productContextIntents.has(classification.intent) && historyHasProducts &&
         (classification.intent !== 'follow_up' || followUpAnswerNeedsWeb))
      : false;

    if (overrideForProductContext && !classification?.strategy.needs_web_search) {
      console.log(`ℹ️ [AgentSearch] Overriding web search: ${classification?.intent} intent with product history — enabling web search`);
    }

    const disableWebSearch = classification
      ? (!classification.strategy.needs_web_search && !intentNeedsWeb && !overrideForProductContext)
      : false;
    const isBuildQuery = !isForcedProductSearch && classification?.intent === 'build';
    const isCalculationQuery = !isForcedProductSearch && !isBuildQuery && classification?.intent === 'calculation_search';
    const calculationMode: 'size_then_search' | 'search_then_size' | undefined = isCalculationQuery
      ? (classification?.strategy.calculation_mode === 'search_then_size' ? 'search_then_size' : 'size_then_search')
      : undefined;
    // Set to true when CalcRefusal drops a stub calc the agent DID emit.
    // Prevents the size_then_search HARD REJECT from wiping valid products.
    let calcDroppedByRefusal = false;
    // Detect search-and-compare phrasing: a search verb combined with a compare keyword.
    // This lets us split "compare X vs Y" (pure comparison, table-only) from
    // "find X and compare two of them" (product search with a comparison side-output).
    const SEARCH_VERB_RE = /\b(find|search|show|give|list|look\s+for|i\s+need|recommend|suggest|fetch)\b/i;
    const COMPARE_WORD_RE = /\b(compare|comparison|vs\.?|versus|side[-\s]by[-\s]side)\b/i;
    const queryHasSearchVerb = SEARCH_VERB_RE.test(query);
    const queryHasCompareWord = COMPARE_WORD_RE.test(query);
    const isPureComparisonQueryFlag = !isForcedProductSearch && !isBuildQuery && !isCalculationQuery && classification?.intent === 'comparison' && !queryHasSearchVerb;
    const isSearchAndCompareQueryFlag = !isForcedProductSearch && !isBuildQuery && !isCalculationQuery && classification?.intent === 'comparison' && queryHasSearchVerb;
    // Also produce a comparison side-output for product_search / forced product_search
    // queries that explicitly mention "compare" (the classifier now routes most of these
    // to product_search instead of comparison).
    const wantsComparisonSideOutputFlag = !isBuildQuery && !isCalculationQuery && !isPureComparisonQueryFlag && !isSearchAndCompareQueryFlag && queryHasCompareWord && (isForcedProductSearch || classification?.intent === 'product_search' || classification?.intent === 'recommendation');
    const isComparisonQueryFlag = isPureComparisonQueryFlag;
    // Suppress explanation spec-sheet mode when prior product results exist in history:
    // the user is asking about already-shown products, not requesting a generic spec sheet.
    const isExplanationSpecQueryFlag = !isForcedProductSearch && !isBuildQuery && !isComparisonQueryFlag &&
      classification?.intent === 'explanation' && !historyHasProducts;
    // Explore mode: query starts with "Explore:" — always active regardless of history.
    // Used to trigger exhaustive spec extraction for the Explore panel.
    const isExploreQuery = !isForcedProductSearch && !isBuildQuery && !isComparisonQueryFlag &&
      classification?.intent === 'explanation' && historyHasProducts &&
      (query.trimStart().startsWith('Explore:') || query.trimStart().startsWith('explore:'));
    const effectiveHistory = isForcedProductSearch ? [] : chatHistory;
    let compressed: { summary: string | null; recentMessages: ChatHistoryMessage[]; originalCount: number; compressedCount: number; summarizedCount: number; _usage?: { model: string; prompt_tokens: number; completion_tokens: number; total_tokens: number; duration_ms: number } };
    if (sessionId && sessionId > 0 && typeof userId === 'string' && userId.trim() !== '' && !isForcedProductSearch) {
      try {
        const sessionCtx = await getContextForSession(sessionId, userId, settings);
        compressed = {
          summary: sessionCtx.summary,
          recentMessages: sessionCtx.recentMessages,
          originalCount: sessionCtx.recentMessages.length,
          compressedCount: sessionCtx.recentMessages.length,
          summarizedCount: sessionCtx.summary ? 1 : 0,
        };
        console.log(
          `📚 [AgentSearch] Loaded session ${sessionId} context from DB: summary=${sessionCtx.summary ? 'yes' : 'no'}, recent=${sessionCtx.recentMessages.length} msgs, ~${sessionCtx.recentTokens} tokens`
        );
      } catch (err: any) {
        console.warn(`⚠️ [AgentSearch] getContextForSession failed (session ${sessionId}), falling back to in-RAM compression:`, err?.message);
        compressed = await compressHistory(effectiveHistory);
      }
    } else {
      if (!sessionId) {
        console.log('⚠️ [AgentSearch] No sessionId provided — using in-RAM compressHistory fallback');
      } else if (!userId) {
        console.log(`⚠️ [AgentSearch] sessionId=${sessionId} provided but no userId — refusing to load DB context, using in-RAM fallback`);
      }
      compressed = await compressHistory(effectiveHistory);
    }

    const isBrandEnumerationFlag = classification?.strategy.is_brand_enumeration === true;
    const enumerationBrand = isBrandEnumerationFlag
      ? (classification?.constraints.preferred_brands[0] || '').trim()
      : '';

    let manufacturerBlock = '';
    if (isBrandEnumerationFlag && !disableWebSearch && !isBuildQuery && enumerationBrand) {
      // Brand enumeration overrides the normal manufacturer-discovery scope:
      // restrict the agent to the single named brand and suppress the
      // "ONE PRODUCT PER MANUFACTURER" rule. The detailed enumeration
      // instructions live in the classifier-context block injected separately;
      // here we only set the search scope.
      manufacturerBlock = `## WEB SEARCH SCOPE — BRAND ENUMERATION (PRIORITY)

The user explicitly asked to LIST products from a single brand. Restrict ALL web searches to this brand's official domain — do NOT search other manufacturers, do NOT pad results with competitors.

**Target brand**: ${enumerationBrand}

**Search Instructions:**
- Use "site:<brand-domain>" searches against ${enumerationBrand}'s official website to enumerate the catalog (search the product index, category pages, family pages, and individual model pages).
- Issue MULTIPLE site-restricted searches — one search rarely covers an entire catalog. Vary the query (e.g., "site:brand.com <product type> series", "site:brand.com <product type> models", "site:brand.com <product type> product range").
- Return MANY DISTINCT MODELS from ${enumerationBrand} (target 8–15, hard cap 20). The "ONE PRODUCT PER MANUFACTURER" / brand-diversity rule is SUSPENDED for this query.
- Each card MUST link to a specific model page on ${enumerationBrand}'s own domain — no distributors, no homepages, no category pages.
- If ${enumerationBrand} does not produce this product type, say so explicitly in decision_summary and return an empty data array — do NOT substitute another manufacturer.`;
      console.log(`📋 [AgentSearch] Brand enumeration mode active for "${enumerationBrand}" — diversity rule suspended, scope=site:${enumerationBrand}`);
    } else if (manufacturerDiscovery && !disableWebSearch && !isBuildQuery) {
      if (manufacturerDiscovery.userOverride && manufacturerDiscovery.overrideSite) {
        manufacturerBlock = `## WEB SEARCH SCOPE — USER OVERRIDE

The user has explicitly requested to search on a specific source. Your web searches MUST be restricted to this source:

**Source**: ${manufacturerDiscovery.overrideSite}
**Instruction**: Prefix all your web searches with "site:${manufacturerDiscovery.overrideSite}" to restrict results to this domain only. Do NOT search any other site or domain.`;
      } else if (manufacturerDiscovery.manufacturers.length > 0) {
        const mfgList = manufacturerDiscovery.manufacturers.map((m, i) => {
          const tierLabel = m.tier === 1 ? 'Tier 1 — Best-Fit Specialist' : m.tier === 2 ? 'Tier 2 — Category Specialist' : 'Tier 3 — Reputable Source';
          return `${i + 1}. **${m.name}** (${m.domain}) — ${tierLabel}${m.reason ? `\n   _${m.reason}_` : ''}`;
        }).join('\n');
        manufacturerBlock = `## WEB SEARCH SCOPE — MANUFACTURER-FIRST STRATEGY (PRIORITY)

A domain expert has pre-identified the most likely authoritative manufacturers for this product type. Search these as your PRIORITY sources:

${mfgList}

**Search Instructions:**
- Search PRIMARILY within each manufacturer's official domain using "site:domain.com <product query>" format
- Work through manufacturers in tier order (Tier 1 first, then Tier 2, then Tier 3)
- After searching all Tier 1 manufacturers: if you found 5 or more products, you may stop. If fewer than 5, continue to Tier 2. After Tier 2: if still fewer than 5, continue to Tier 3
- You do not need to search every manufacturer — stop as soon as you have 5 good results or have exhausted all tiers
- **AUTO-EXPAND RULE:** If after searching all listed manufacturers you have found fewer than 3 products that genuinely meet the hard requirements in the query, expand your search beyond this list to other manufacturers in this product category. Use your own domain knowledge to identify additional manufacturers that are more likely to make the product at the required specification level. The priority list is a starting point, not a hard constraint.
- **ONE PRODUCT PER MANUFACTURER (MANDATORY):** Return at most ONE product per manufacturer. If a site offers multiple matching models, select only the single best-fitting one for that manufacturer and immediately move on to the next manufacturer. If you have 5 manufacturers in scope, return 5 products — one from each — not 5 products from 2 manufacturers. Variety across brands is the top priority.
- Find the manufacturer's own product page for each result — NEVER use distributor pages (DigiKey, Mouser, RS Components, Amazon, etc.)
- Each product MUST link directly to the manufacturer's product page (not the homepage, not a category page)
- If a manufacturer in the list does not make a product meeting the requirements, skip them and move to the next — do not force a poor match
- Smaller specialist manufacturers may have better-fit products than large global companies — evaluate each result by product fit and relevance, not company size or revenue
- A specialist company in the exact product category (e.g., Seeger-Orbis for circlips, Schnorr for disc springs) is a higher-quality source than a large industrial conglomerate that includes the product as a minor catalog item`;
      }
    }

    // Change B — STANDARDIZED CATALOG PART: inject mandatory multi-manufacturer block
    if (classification?.strategy.is_standard_part_query === true) {
      const standardPartBlock = `

## ⚠️ CRITICAL: STANDARDIZED CATALOG PART — MANDATORY MULTI-MANUFACTURER RESULTS

The classifier has identified this query as targeting a STANDARDIZED CATALOG PART — a designation that multiple manufacturers produce identically under the same ISO / DIN / IEC / ANSI / JIS / industry-standard code (examples: bearing 6306, IRFZ44N transistor, M8×50 DIN 912 bolt, DN50 PN16 ball valve, HEA 100 steel profile, Pt100 RTD sensor).

For standardized parts, every manufacturer's version IS a distinct product with different quality grades, material tolerances, load ratings, pricing, and availability. The user MUST see multiple brands to make an informed choice.

**MANDATORY RULES — violation is a critical failure:**
1. You MUST find and return products from AT LEAST 4–5 DIFFERENT MANUFACTURERS. Never return only one brand's version of a standardized part.
2. Search each discovered manufacturer's official site for THEIR version of this exact designation.
3. Assign each manufacturer's product its OWN fit_score — do NOT give all the same score.
4. Do NOT stop after finding one good match. The goal is brand variety, not finding the single "best" answer.

**Industry reference lists for standard parts (expand beyond this list if needed):**
- Bearings (ISO designation): SKF, NSK, FAG/Schaeffler, NTN, Koyo/JTEKT, INA, Timken, ZKL
- Transistors/ICs (component type number): Infineon, Vishay, ON Semiconductor, STMicroelectronics, Nexperia, Diodes Inc., Toshiba
- Fasteners (DIN/ISO thread): Würth, Bossard, Bulten, LISI Group, Nord-Lock, Heco, Ejot
- Ball/gate valves (DN designation): Kitz, Flowserve, Velan, Habonim, Neles/Metso, Emerson, Watts
- Steel profiles (HEA/IPE/RHS): ArcelorMittal, Voestalpine, Tata Steel, Salzgitter, SSAB
- Seals/O-rings (AS568/metric): Freudenberg, Parker, Trelleborg, Simrit/SKF, Greene Tweed
- Pneumatic cylinders (ISO 6432/VDMA): Festo, SMC, Parker, Aventics/Emerson, Norgren, Airtac
- RTD/thermocouples (IEC type): TC Direct, Omega, Pyromation, Heraeus, TE Connectivity, Honeywell
- Hydraulic fittings (DIN/SAE/BSP): Parker, Eaton, Manuli, Gates, Alfagomma, Ryco

**Scoring guidance for standardized parts:**
- Any manufacturer's version that carries the exact same designation (e.g., "SKF 6306", "FAG 6306", "NTN 6306") deserves a fit_score of 80–95 — they all meet the dimensional spec.
- Differentiate scores based on quality tier, availability, or extra features (e.g., 2RS vs open, ABEC-3 vs ABEC-5).
- Do NOT score a valid brand at 50% or below just because another brand scored 95%.`;

      manufacturerBlock = (manufacturerBlock || '') + standardPartBlock;
      console.log(`⚙️ [AgentSearch] Standard part query detected — injecting mandatory multi-manufacturer block`);
    }

    if (isSearchAndCompareQueryFlag) {
      console.log(`🔀 [AgentSearch] Search-and-compare mode (intent=comparison + search verb): products + comparison_table`);
    } else if (wantsComparisonSideOutputFlag) {
      console.log(`🔀 [AgentSearch] Comparison side-output enabled for product_search intent`);
    } else if (isPureComparisonQueryFlag) {
      console.log(`🔀 [AgentSearch] Pure comparison mode: comparison_table only`);
    }
    const agent = createAgent(settings, classifierContext, disableWebSearch, isBuildQuery, isForcedProductSearch, compressed.summary || undefined, dbContextBlock, manufacturerBlock || undefined, isComparisonQueryFlag, isExplanationSpecQueryFlag, isCalculationQuery, isSearchAndCompareQueryFlag, wantsComparisonSideOutputFlag, productContextBlock, calculationMode, isExploreQuery);
    const agentStartTime = Date.now();
    
    console.log(`🔍 [AgentSearch] Starting ${disableWebSearch ? 'text-only' : 'web'} search for:`, processedQuery, `(model: ${settings.model}, history: ${chatHistory.length} messages, classified: ${classification ? classification.intent + '/' + classification.domain : 'none'})`);

    if (compressed.summary) {
      const originalChars = effectiveHistory.reduce((sum, m) => sum + m.content.length, 0);
      const compressedChars = compressed.summary.length + compressed.recentMessages.reduce((sum, m) => sum + m.content.length, 0);
      const savings = originalChars > 0 ? Math.round((1 - compressedChars / originalChars) * 100) : 0;
      console.log(`📝 [AgentSearch] History compression: ${compressed.summarizedCount} older messages summarized into system context, ${compressed.recentMessages.length} recent kept verbatim (was ${compressed.originalCount} total). ~${originalChars} chars → ~${compressedChars} chars (${savings}% reduction)`);
    }

    const conversationHistory: AgentInputItem[] = [];

    for (const msg of compressed.recentMessages) {
      if (msg.role === 'user') {
        conversationHistory.push({
          role: 'user',
          content: [{ type: 'input_text', text: msg.content }]
        });
      } else {
        conversationHistory.push({
          role: 'assistant',
          content: [{ type: 'output_text', text: msg.content }]
        } as AgentInputItem);
      }
    }
    
    conversationHistory.push({
      role: 'user',
      content: [{ type: 'input_text', text: processedQuery }]
    });

    const result = await withTrace('HybridSearch Agent', async () => {
      const agentResult = await deepfolderRunner.run(agent as any, conversationHistory, {
        context: { workflowInputAsText: processedQuery },
      });

      if (!agentResult.output) {
        throw new Error('Agent returned no output');
      }

      return agentResult;
    });

    let textOutput = '';
    const agentCitations: CitationUrl[] = [];
    let webSearchCallCount = 0;
    if (result.output && Array.isArray(result.output)) {
      const extracted = extractCitationUrls(result.output);
      agentCitations.push(...extracted);
      textOutput = extractTextFromOutput(result.output);
      for (const item of result.output as any[]) {
        const itemType = item?.type || item?.rawItem?.type;
        if (itemType === 'web_search_call' || itemType === 'hosted_tool_call') {
          webSearchCallCount++;
        }
      }
    }

    console.log('✅ [AgentSearch] Agent run completed');
    if (agentCitations.length > 0) {
      console.log(`🔗 [AgentSearch] Extracted ${agentCitations.length} citation URL(s) from web search annotations`);
    }
    console.log('📝 [AgentSearch] Raw output:', textOutput.substring(0, 500));

    const products: UnifiedProduct[] = [];
    let chatSummary = '';
    let logicExplanation = '';

    try {
      const jsonMatch = matchJsonOutput(textOutput);

      if (!jsonMatch) {
        const trimmedOutput = textOutput.trim();
        const MIN_USEFUL_RESPONSE_LENGTH = 80;

        const isPlaceholderResponse = isPlaceholderText(trimmedOutput);

        if (trimmedOutput.length < MIN_USEFUL_RESPONSE_LENGTH || isPlaceholderResponse) {
          const label = isPlaceholderResponse ? 'Placeholder/stalling' : 'Stub/incomplete';
          console.log(`⚠️ [AgentSearch] ${label} non-JSON response (${trimmedOutput.length} chars): "${trimmedOutput.substring(0, 150)}"`);

          if (isPlaceholderResponse && disableWebSearch && historyHasProducts) {
            console.log(`🔄 [AgentSearch] Retrying with web search enabled after placeholder response`);
            const retryAgent = createAgent(settings, classifierContext, false, isBuildQuery, isForcedProductSearch, compressed.summary || undefined, dbContextBlock, manufacturerBlock || undefined, isComparisonQueryFlag, isExplanationSpecQueryFlag, isCalculationQuery, isSearchAndCompareQueryFlag, wantsComparisonSideOutputFlag, productContextBlock, calculationMode, isExploreQuery);
            const retryResult = await withTrace('HybridSearch Agent Retry', async () => {
              const agentResult = await deepfolderRunner.run(retryAgent as typeof agent, conversationHistory, {
                context: { workflowInputAsText: processedQuery },
              });
              return agentResult;
            });

            let retryTextOutput = '';
            if (retryResult.output && Array.isArray(retryResult.output)) {
              const retryCitations = extractCitationUrls(retryResult.output);
              if (retryCitations.length > 0) {
                agentCitations.push(...retryCitations);
              }
              retryTextOutput = extractTextFromOutput(retryResult.output);
            }

            const retryTrimmed = retryTextOutput.trim();
            const isRetryPlaceholder = isPlaceholderText(retryTrimmed);

            if (retryTrimmed.length > MIN_USEFUL_RESPONSE_LENGTH && !isRetryPlaceholder) {
              console.log(`✅ [AgentSearch] Retry produced substantive response (${retryTrimmed.length} chars)`);
              textOutput = retryTextOutput;
            } else {
              console.log(`⚠️ [AgentSearch] Retry also produced ${isRetryPlaceholder ? 'placeholder' : 'insufficient'} response`);
            }
          }

          const isStillPlaceholder = isPlaceholderText(textOutput.trim());

          if (isStillPlaceholder || textOutput.trim().length < MIN_USEFUL_RESPONSE_LENGTH) {
            return {
              success: true,
              products: [],
              chatSummary: '',
              logicExplanation: '',
              interpretedRequirements: [],
              decisionSummary: "I wasn't able to fully process your request. Could you rephrase your question or provide more details? I'm here to help with product sourcing, technical questions, and building component lists.",
              rawOutput: textOutput,
            };
          }
        }

        if (!matchJsonOutput(textOutput)) {
          console.log('📝 [AgentSearch] Non-JSON response detected - treating as clarification/explanation');
          return {
            success: true,
            products: [],
            chatSummary: '',
            logicExplanation: '',
            interpretedRequirements: [],
            decisionSummary: textOutput.trim(),
            rawOutput: textOutput,
          };
        }
        console.log('📝 [AgentSearch] Retry produced JSON - processing as structured response');
      }

      const effectiveJsonMatch = matchJsonOutput(textOutput);

      if (effectiveJsonMatch) {
        const jsonStr = effectiveJsonMatch[1] || effectiveJsonMatch[0];
        const parsed = safeJsonParse(jsonStr);
        
        let dataArray: any[] = [];
        let interpretedRequirements: InterpretedRequirement[] = [];
        let decisionSummary = '';
        let bestFit = '';
        let alternativeSuggestion = '';
        let searchGuidance = '';
        let alternativeSearches: { label: string; query: string }[] | undefined;
        let bomTable: BomItem[] = [];
        let bomSummary = '';
        let engineeringNotes = '';
        let comparisonTable: ComparisonTableData | undefined;
        let calculationSection: CalculationSection | undefined;
        
        if (parsed.bom_table) {
          console.log(`🔧 [AgentSearch] BOM detected in parsed output: ${Array.isArray(parsed.bom_table) ? parsed.bom_table.length : 0} parts`);
        }
        if (parsed.comparison_table) {
          console.log(`📊 [AgentSearch] Comparison table detected in parsed output`);
        }
        if (parsed.calculation_section) {
          console.log(`🔢 [AgentSearch] Calculation section detected in parsed output: "${parsed.calculation_section.title || ''}"`);
        }
        
        if (Array.isArray(parsed)) {
          dataArray = parsed;
          const textBeforeJson = textOutput.substring(0, textOutput.indexOf(jsonStr)).replace(/```json|```/g, '').trim();
          const textAfterJson = textOutput.substring(textOutput.indexOf(jsonStr) + jsonStr.length).replace(/```json|```/g, '').trim();
          const surroundingText = (textBeforeJson + '\n' + textAfterJson).trim();
          if (surroundingText.length > 30) {
            decisionSummary = surroundingText;
          }
        } else if ((parsed.data && Array.isArray(parsed.data)) || parsed.bom_table || parsed.comparison_table || parsed.calculation_section || parsed.interpreted_requirements) {
          dataArray = Array.isArray(parsed.data) ? parsed.data : [];
          // extra.content is where the agent parks its prose answer when it
          // also emits a JSON envelope (e.g. Explore follow-up responses that
          // produce the ## Overview / ## Specifications / ## Fit markdown inside
          // extra.content while still wrapping it in the standard JSON shape).
          // Promote it to chatSummary so it reaches the client and ExploreMessage
          // can parse the sections correctly.
          chatSummary = parsed.chat_summary
            || (typeof parsed.extra?.content === 'string' ? parsed.extra.content : '')
            // Agent sometimes puts its refusal/explanation in decision_summary
            // (as a plain string) instead of chat_summary — surface it so the
            // user sees the message rather than a blank response.
            || (typeof parsed.decision_summary === 'string' ? parsed.decision_summary : '')
            || '';
          logicExplanation = parsed.logic_explanation || '';
          interpretedRequirements = parsed.interpreted_requirements || [];
          const ds = parsed.decision_summary;
          if (ds && typeof ds === 'object' && (ds.best_fit || ds.alternative_suggestion || ds.search_guidance)) {
            decisionSummary = [ds.best_fit, ds.alternative_suggestion].filter(Boolean).join('\n\n');
            bestFit = ds.best_fit || '';
            alternativeSuggestion = ds.alternative_suggestion || '';
            searchGuidance = ds.search_guidance || '';
          } else {
            decisionSummary = typeof ds === 'string' ? ds : '';
          }
          if (Array.isArray(parsed.alternative_searches) && parsed.alternative_searches.length > 0) {
            const parsedAlts = parsed.alternative_searches
              .filter((item: any) => item && typeof item.label === 'string' && typeof item.query === 'string')
              .slice(0, 3)
              .map((item: any) => ({ label: item.label as string, query: item.query as string }));
            alternativeSearches = parsedAlts.length > 0 ? parsedAlts : undefined;
          }
          if (Array.isArray(parsed.bom_table) && parsed.bom_table.length > 0) {
            bomTable = parsed.bom_table.map((item: any) => ({
              part: item.part || '',
              spec: canonicalizeUnitTokensInCell(item.spec || ''),
              qty: typeof item.qty === 'number' ? item.qty : 1,
              reason: item.reason || '',
            }));
          }
          if (typeof parsed.engineering_notes === 'string' && parsed.engineering_notes) {
            engineeringNotes = parsed.engineering_notes;
          }
          if (typeof parsed.bom_summary === 'string' && parsed.bom_summary) {
            bomSummary = parsed.bom_summary;
          }
          if (parsed.comparison_table && Array.isArray(parsed.comparison_table.products) && Array.isArray(parsed.comparison_table.rows)) {
            comparisonTable = {
              products: parsed.comparison_table.products.map((p: any) => String(p)),
              rows: parsed.comparison_table.rows
                .filter((r: any) => r && typeof r.parameter === 'string' && Array.isArray(r.values))
                .map((r: any) => buildComparisonRow(r)),
            };
            console.log(`📊 [AgentSearch] Parsed comparison table: ${comparisonTable.products.length} products × ${comparisonTable.rows.length} rows`);
          }
          // Track which kind of PRODUCT CONTEXT block (if any) we supplied to
          // the agent. Server-side defense for Task #256: if the agent emits
          // datasheet/db/web/manufacturer source citations when no resolved
          // block was provided, demote them to "ai" so the chip doesn't lie
          // to the user. The "NOT RESOLVED" guard block is intentionally
          // treated the same as no block at all for citation purposes.
          const hasResolvedProductContext = Boolean(
            productContextBlock && productContextBlock.includes('PRODUCT CONTEXT — NAMED PRODUCT FOR CALCULATION')
          );
          const hasNotResolvedProductContext = Boolean(
            productContextBlock && productContextBlock.includes('PRODUCT CONTEXT — NAMED PRODUCT NOT RESOLVED')
          );

          // Calculation refusal logging (Task #256): when the query was a
          // calculation_search but the agent omitted calculation_section, it
          // chose the refusal path. Distinguish Case-2 (no resolved context)
          // from Case-3 (resolved context but missing field) so we can audit
          // refusal rates per case.
          if (
            classification?.intent === 'calculation_search' &&
            (!parsed.calculation_section || typeof parsed.calculation_section !== 'object')
          ) {
            const refusalCase = hasResolvedProductContext
              ? 'Case-3 (resolved datasheet, missing field)'
              : hasNotResolvedProductContext
                ? 'Case-2 (named product, no datasheet found)'
                : 'Prompt-only (no named product, missing input)';
            console.log(`🚫 [AgentSearch] Calculation refused — ${refusalCase}; chat_summary length=${(parsed.chat_summary || '').length}`);
          }

          // Single automatic retry when classifier set calculation_search but
          // the agent omitted calculation_section entirely (not a refusal stub —
          // those are caught below by looksLikeRefusalCalcSection and set
          // calcDroppedByRefusal=true). Cap at one retry to avoid doubling
          // latency on every turn; if the retry also omits it, log and
          // continue — the hard-reject / refusal path handles the UX fallback.
          const needsCalcRetry =
            isCalculationQuery &&
            !calcDroppedByRefusal &&
            calculationMode === 'size_then_search' &&
            (!parsed.calculation_section || typeof parsed.calculation_section !== 'object');

          if (needsCalcRetry) {
            console.log('🔄 [AgentSearch] Calc retry — agent omitted calculation_section for size_then_search; retrying with tighter instruction');
            const CALC_RETRY_DEMAND =
              `\n\n⚠️ MANDATORY RETRY INSTRUCTION: Your previous response was missing the required "calculation_section" JSON field. ` +
              `This is a size_then_search calculation query — you MUST include a complete "calculation_section" with: ` +
              `title, given[], steps[], result, derived_specs[], summary, legend[], and formula_sources[]. ` +
              `Do NOT omit it under any circumstances. If a required physical input is missing, assume a conservative ` +
              `engineering default, tag it kind="ai", and proceed with the full calculation anyway. ` +
              `Returning only product cards without a calculation_section is a critical failure for this query type.`;
            const retrySettings = { ...settings, instructions: (settings.instructions || '') + CALC_RETRY_DEMAND };
            const retryAgent = createAgent(
              retrySettings,
              classifierContext,
              disableWebSearch,
              isBuildQuery,
              isForcedProductSearch,
              compressed.summary || undefined,
              dbContextBlock,
              manufacturerBlock || undefined,
              isComparisonQueryFlag,
              isExplanationSpecQueryFlag,
              isCalculationQuery,
              isSearchAndCompareQueryFlag,
              wantsComparisonSideOutputFlag,
              productContextBlock,
              calculationMode,
              isExploreQuery,
            );
            try {
              const calcRetryResult = await withTrace('HybridSearch Calc Retry', async () => {
                const agentResult = await deepfolderRunner.run(retryAgent as typeof agent, conversationHistory, {
                  context: { workflowInputAsText: processedQuery },
                });
                return agentResult;
              });
              let calcRetryText = '';
              if (calcRetryResult.output && Array.isArray(calcRetryResult.output)) {
                const retryCitations = extractCitationUrls(calcRetryResult.output);
                if (retryCitations.length > 0) agentCitations.push(...retryCitations);
                calcRetryText = extractTextFromOutput(calcRetryResult.output);
              }
              const calcRetryJsonMatch = matchJsonOutput(calcRetryText);
              if (calcRetryJsonMatch) {
                const calcRetryParsed = safeJsonParse(calcRetryJsonMatch[1] || calcRetryJsonMatch[0]);
                if (
                  calcRetryParsed?.calculation_section &&
                  typeof calcRetryParsed.calculation_section === 'object'
                ) {
                  console.log('✅ [AgentSearch] Calc retry produced calculation_section — transplanting into response');
                  parsed.calculation_section = calcRetryParsed.calculation_section;
                  // If the original had no product cards but the retry found some, absorb them.
                  if (
                    Array.isArray(calcRetryParsed.data) &&
                    calcRetryParsed.data.length > 0 &&
                    dataArray.length === 0
                  ) {
                    dataArray = calcRetryParsed.data;
                  }
                } else {
                  console.warn('⚠️ [AgentSearch] Calc retry also omitted calculation_section — using original result');
                }
              } else {
                console.warn('⚠️ [AgentSearch] Calc retry returned no parseable JSON — using original result');
              }
            } catch (calcRetryErr) {
              console.warn('⚠️ [AgentSearch] Calc retry threw an error — using original result:', calcRetryErr);
            }
          }

          // Task #259 — Defense against "fake calc cards": detect when the
          // agent emitted a calculation_section that is really a refusal in
          // disguise (no numeric result + no numeric steps, formula full of
          // refusal prose, or a \text{...} prose block longer than 40 chars
          // dressed as math) and drop it. Without this, RichTextRenderer
          // tries to typeset the refusal sentence as KaTeX and the user
          // sees a broken-looking Formula card. Runs BEFORE any other
          // calculation_section processing so the dropped section never
          // reaches checkCalcConsistency / unit normalization / the parsed
          // CalculationSection that gets streamed to the client.
          // Request-scoped warn budget mirroring the existing
          // CALC_CONSISTENCY_WARN_BUDGET pattern so logs don't drown when
          // an agent regresses and emits multiple bad sections per turn.
          let calcRefusalWarnCount = 0;
          const CALC_REFUSAL_WARN_BUDGET = 5;
          if (parsed.calculation_section && typeof parsed.calculation_section === 'object') {
            const refusalCheck = looksLikeRefusalCalcSection(parsed.calculation_section);
            if (refusalCheck.isRefusal) {
              calcDroppedByRefusal = true;
              const cs0 = parsed.calculation_section as any;
              const rawSymbol = String(cs0?.result?.name ?? cs0?.title ?? '');
              const cleanSymbol = rawSymbol
                .replace(/\\text\{([^}]+)\}/g, '$1')
                .replace(/[_^]\{([^}]+)\}/g, '$1')
                .replace(/\\[\(\)\[\]\{\},;!>]/g, '')
                .replace(/\\[a-zA-Z]+/g, '')
                .replace(/\s+/g, ' ')
                .trim();
              const subjectPhrase = cleanSymbol ? ` ${cleanSymbol}` : ' this';
              const hintPhrase = refusalCheck.missingHint
                ? ` without ${refusalCheck.missingHint.replace(/^(the|a|an)\s+/i, '')}`
                : '';
              const refusalLine = `I can't compute${subjectPhrase}${hintPhrase}. Please provide the value or paste a link to the manufacturer's datasheet PDF so I can re-run the calculation.`;
              const existingSummary = String(parsed.chat_summary ?? '').trim();
              const summaryAlreadyRefuses = /i can'?t compute|i cannot compute|please provide|paste a (?:link|datasheet)/i.test(existingSummary);
              if (!existingSummary) {
                parsed.chat_summary = refusalLine;
              } else if (!summaryAlreadyRefuses) {
                parsed.chat_summary = `${refusalLine}\n\n${existingSummary}`;
              }
              if (calcRefusalWarnCount < CALC_REFUSAL_WARN_BUDGET) {
                calcRefusalWarnCount++;
                console.warn(`⚠️ [CalcRefusal] Dropped fake calc_section — reason: ${refusalCheck.reason}; missingHint: "${refusalCheck.missingHint || '(none)'}"; symbol: "${cleanSymbol || '(none)'}"`);
              }
              delete parsed.calculation_section;
            }
          }

          if (parsed.calculation_section && typeof parsed.calculation_section === 'object') {
            const cs = parsed.calculation_section;

            // Sampled validation logging (Task C T002). Wraps canonicalUnit +
            // validateUnit and console.warns at most 5 issues per request so
            // logs don't drown when an agent regresses on unit format. Pure
            // diagnostic — never mutates or strips data.
            let unitWarnCount = 0;
            const UNIT_WARN_BUDGET = 5;
            // Request-scoped budget for the calc-section consistency check
            // (Task #176). Same shape as unitWarnCount — resets per request.
            let calcConsistencyWarnCount = 0;
            const CALC_CONSISTENCY_WARN_BUDGET = 5;
            function canonU(field: string, raw: unknown): string {
              const out = canonicalUnit(raw);
              if (unitWarnCount < UNIT_WARN_BUDGET) {
                const v = validateUnit(raw);
                for (const reason of v.warnings) {
                  if (unitWarnCount >= UNIT_WARN_BUDGET) break;
                  unitWarnCount++;
                  console.warn(
                    `⚠️ [UnitCanonical] field=${field} input=${JSON.stringify(String(raw ?? ''))} reason=${reason}`,
                  );
                }
              }
              return out;
            }

            function checkCalcConsistency(section: {
              result?: { name?: string; value?: string; unit?: string };
              steps?: Array<{ result?: { value?: string; unit?: string } }>;
            }): void {
              if (calcConsistencyWarnCount >= CALC_CONSISTENCY_WARN_BUDGET) return;
              const finalVal = section.result?.value ?? '';
              if (!finalVal) return;
              const steps = section.steps ?? [];
              if (steps.length === 0) return;
              // Compare against the FINAL step entry only — not the last
              // numeric step. If the final step has no numeric result,
              // remain silent (the agent intentionally ended on a
              // descriptive step).
              const finalStep = steps[steps.length - 1];
              const stepVal = finalStep.result?.value;
              if (!stepVal) return;
              // Only treat the value as numeric when it BEGINS with a number
              // (after optional whitespace). Embedded numbers in prose like
              // "apply 25% safety margin" must not trigger a comparison.
              const numRe = /^\s*(-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)/;
              const fMatch = String(finalVal).match(numRe);
              const sMatch = String(stepVal).match(numRe);
              if (!fMatch || !sMatch) return;
              const fNum = Number(fMatch[0]);
              const sNum = Number(sMatch[0]);
              if (!Number.isFinite(fNum) || !Number.isFinite(sNum) || sNum === 0) return;
              const rel = Math.abs(fNum - sNum) / Math.abs(sNum);
              if (rel <= 0.01) return;
              calcConsistencyWarnCount++;
              const finalUnit = section.result?.unit ?? '';
              const stepUnit = finalStep.result?.unit ?? '';
              const finalName = section.result?.name ?? '';
              console.warn(
                `⚠️ [CalcConsistency] result.value=${finalVal}${finalUnit ? ' ' + finalUnit : ''} ` +
                `differs from final step result=${stepVal}${stepUnit ? ' ' + stepUnit : ''} ` +
                `for symbol ${finalName || '(unnamed)'} (relΔ=${(rel * 100).toFixed(1)}%)`,
              );
            }

            // Wraps bare multi-char subscripts/superscripts in {} so KaTeX renders them correctly.
            // Safe for all string fields — only modifies tokens matching X_yy or X^yy patterns.
            function normalizeSubscriptsOnly(s: string): string {
              if (!s) return s;
              let out = s.replace(/([A-Za-z0-9])_([A-Za-z0-9]{2,})(?![}A-Za-z0-9])/g, '$1_{$2}');
              out = out.replace(/([A-Za-z0-9])\^([A-Za-z0-9]{2,})(?![}A-Za-z0-9])/g, '$1^{$2}');
              return out;
            }

            // Broader variant that also wraps single-character subscripts/superscripts.
            // Safe ONLY in whitelisted symbol/identifier fields (legend[].symbol,
            // result.name, given[].name, derived_specs[].label, math zones in
            // normalizeSymbolInProse). Never call this on free-form prose:
            // strings like "model_v2" or "q1_2024" in chat_summary or
            // engineering_notes would get spuriously rewrapped.
            function normalizeSubscriptsAll(s: string): string {
              if (!s) return s;
              let out = s.replace(/([A-Za-z\u00b5\u03bc\u03a9])_([A-Za-z0-9])(?![}A-Za-z0-9])/g, '$1_{$2}');
              out = out.replace(/([A-Za-z\u00b5\u03bc\u03a9])\^([A-Za-z0-9])(?![}A-Za-z0-9])/g, '$1^{$2}');
              out = out.replace(/([A-Za-z0-9])_([A-Za-z0-9]{2,})(?![}A-Za-z0-9])/g, '$1_{$2}');
              out = out.replace(/([A-Za-z0-9])\^([A-Za-z0-9]{2,})(?![}A-Za-z0-9])/g, '$1^{$2}');
              return out;
            }

            // Unit fields are now canonicalized for display via canonicalUnit
            // from ../utils/unit-canonical (imported at top of file). Keeps a
            // single source of truth for "Nm" / "N\cdot m" / "\text{N}·\text{m}"
            // → "N·m" so the client never has to guess.

            // Wraps math-symbol tokens (letter followed by _{...} or ^{...} groups, optionally
            // with a trailing letter like C_{d}A) in \( \) so RichTextRenderer renders them as
            // math glyphs while leaving surrounding prose untouched.
            //
            //   "Rolling resistance coefficient C_{rr}" → "Rolling resistance coefficient \(C_{rr}\)"
            //   "Drag area C_{d}A"                      → "Drag area \(C_{d}\)A"  (trailing A stays upright)
            //   "Total mass m"                          → "Total mass m" (no change, no sub/sup)
            function normalizeSymbolInProse(s: string): string {
              if (!s) return s;
              // Whitelisted: identifier fields (legend symbols, given/result names,
              // derived_specs labels) feed through this function — single-char
              // subscripts like C_d are intended math notation here.
              let out = normalizeSubscriptsAll(s);
              if (/\\\(|\\\[/.test(out)) return out;
              // Wrap only the symbol + sub/sup groups (no trailing alpha) so any letter that
              // follows stays in the surrounding prose font (upright, not italic math).
              out = out.replace(
                /([A-Za-z\u00b5\u03bc\u03a9\u03c1\u03b7\u03b8\u03c4\u03b1\u03b2\u03b3\u03b4])((?:_\{[^}]+\}|\^\{[^}]+\})+)/g,
                (_m, head, groups) => `\\(${head}${groups}\\)`
              );
              return out;
            }

            // Lighter-weight normalizer for value fields: pure numerics pass through unchanged;
            // only when sub/sup markers are present do we route through normalizeMathString
            // (which fixes subscripts and conditionally wraps in \( \) when a formula is detected).
            function normalizeValueString(s: string): string {
              if (!s) return s;
              if (!/_\{|\^\{|_[A-Za-z0-9]{2,}|\^[A-Za-z0-9]{2,}/.test(s)) return s;
              return normalizeSymbolInProse(s);
            }

            // Full normalization: fixes subscripts AND auto-wraps bare formula strings in \( \).
            // Only wraps when the string has an = or × operator with a digit — avoids prose false-positives.
            function normalizeMathString(s: string): string {
              if (!s) return s;
              let out = normalizeSubscriptsOnly(s);
              const hasMathDelims = /\\\(|\\\[/.test(out);
              // Require explicit = or × or ≈ (not generic / or -) to reduce false positives on prose text.
              const looksLikeFormula = /[=×\u00d7\u2248≈]/.test(out) && /\d/.test(out);
              if (!hasMathDelims && looksLikeFormula) {
                out = out.replace(/(\d(?:\.\d+)?)\s+([A-Za-z\u00b5\u03bc\u03a9\u00b0][A-Za-z\/\u00b2\u00b3\u00b7.\-]*)/g,
                  (_m: string, n: string, u: string) => `${n} \\text{ ${u}}`);
                out = `\\( ${out} \\)`;
              }
              return out;
            }

            // Parse a free-form step result like "234.5 N", "v = 11.11 m/s",
            // or an object {value, unit} into { value, unit } with the unit in
            // canonical Unicode form. Embedded formulas (=, ×, ≈) keep the
            // whole string in `value` and leave `unit` undefined so the UI
            // renders it as one cell.
            function parseValueUnitString(raw: any, unitField: string): { value: string; unit?: string } | undefined {
              if (raw === undefined || raw === null) return undefined;
              if (typeof raw === 'object') {
                const v = String(raw.value ?? '');
                const u = raw.unit ? String(raw.unit) : '';
                if (!v && !u) return undefined;
                const canonUnit = canonU(unitField, u);
                return {
                  value: normalizeValueString(v),
                  unit: canonUnit || undefined,
                };
              }
              const str = String(raw).trim();
              if (!str) return undefined;
              const split = splitValueAndUnit(str);
              if (split.unit) {
                // Route the unit half through canonU for consistent
                // sampled validation logging — split.unit is already
                // canonical so this is a no-op rewrite, but the
                // validate pass still surfaces issues if the source
                // string contained raw LaTeX or stray backslashes.
                const loggedUnit = canonU(unitField, split.unit);
                return { value: normalizeValueString(split.value), unit: loggedUnit || undefined };
              }
              return { value: normalizeValueString(str), unit: undefined };
            }

            function parseStepResult(raw: any): { value: string; unit?: string } | undefined {
              return parseValueUnitString(raw, 'step.result.unit');
            }

            const rawSteps: CalculationStep[] = Array.isArray(cs.steps) ? cs.steps.map((s: any) => {
              if (s.label !== undefined) {
                return {
                  // label/content rendered via RichTextRenderer in the UI — apply full normalization
                  // so math expressions (e.g. "v = 11.11 m/s") are wrapped in \( \) when they
                  // contain = or × operators with digits. Plain prose (no such operators) is unchanged.
                  label: normalizeMathString(String(s.label || '')),
                  content: s.content ? normalizeMathString(String(s.content)) : undefined,
                  formula: s.formula ? normalizeMathString(String(s.formula)) : undefined,
                  result: parseStepResult(s.result),
                };
              }
              return {
                label: normalizeMathString(String(s.description || '')),
                formula: s.expression ? normalizeMathString(String(s.expression)) : undefined,
                result: parseStepResult(s.result),
              };
            }) : [];
            const rawDerivedSpecs: Array<{ label: string; value: string; unit?: string }> = (() => {
              if (Array.isArray(cs.derived_specs)) {
                return cs.derived_specs.map((d: any) => ({
                  label: normalizeSymbolInProse(String(d.label || '')),
                  value: normalizeValueString(String(d.value || '')),
                  unit: d.unit ? (canonU('derived_specs.unit', d.unit) || undefined) : undefined,
                }));
              }
              if (cs.derived_specs && typeof cs.derived_specs === 'object') {
                return Object.entries(cs.derived_specs).map(([k, v]) => {
                  const str = String(v || '');
                  const m = str.match(/^([\d.,]+)\s*(.*)$/);
                  return {
                    label: normalizeSymbolInProse(k),
                    value: m ? m[1] : normalizeValueString(str),
                    unit: m && m[2] ? (canonU('derived_specs.unit', m[2].trim()) || undefined) : undefined,
                  };
                });
              }
              return [];
            })();
            // Normalize the optional source citation on a single given input.
            // Accepts the agent's freeform shape and clamps to the discriminated
            // union the frontend renders.
            const ALLOWED_GIVEN_KINDS: ReadonlySet<CalculationGivenSourceKind> = new Set(['user', 'db', 'datasheet_pdf', 'web', 'ai']);
            // Pre-budgeted forensic warn counters so a misbehaving agent
            // doesn't flood the logs.
            let sourceDemoteWarnCount = 0;
            const SOURCE_DEMOTE_WARN_BUDGET = 8;
            function normalizeGivenSource(raw: any): CalculationGivenSource | undefined {
              if (!raw || typeof raw !== 'object') return undefined;
              const rawKind = String(raw.kind || '').toLowerCase().trim();
              const aliasMap: Record<string, CalculationGivenSourceKind> = {
                user_input: 'user',
                user: 'user',
                database: 'db',
                catalog: 'db',
                db: 'db',
                datasheet: 'datasheet_pdf',
                datasheet_pdf: 'datasheet_pdf',
                pdf: 'datasheet_pdf',
                web: 'web',
                manufacturer: 'web',
                model_knowledge: 'ai',
                ai: 'ai',
              };
              let kind = (aliasMap[rawKind] || (ALLOWED_GIVEN_KINDS.has(rawKind as CalculationGivenSourceKind) ? rawKind as CalculationGivenSourceKind : 'ai'));
              let label = String(raw.label || '').trim() || (kind === 'ai' ? 'AI engineering reference' : kind === 'user' ? 'User input' : kind);
              // Allow absolute https URLs (web/manufacturer sources) AND relative
              // same-origin paths starting with `/uploads/` (DB datasheets that
              // the app already serves). Anything else is dropped to avoid
              // hallucinated URLs and javascript:/data: schemes.
              const rawUrl = typeof raw.url === 'string' ? raw.url.trim() : '';
              let url: string | undefined = (/^https?:\/\//i.test(rawUrl) || /^\/uploads\//i.test(rawUrl)) ? rawUrl : undefined;

              // Defense-in-depth (Task #256): if no resolved PRODUCT CONTEXT
              // block was supplied to the agent, "datasheet_pdf" / "db" /
              // "web" citations cannot be backed by anything we gave it — the
              // agent invented them. Demote to "ai" so the chip renders as
              // an honest "AI engineering reference" instead of a fake
              // datasheet citation.
              if (!hasResolvedProductContext && (kind === 'datasheet_pdf' || kind === 'db' || kind === 'web')) {
                if (sourceDemoteWarnCount < SOURCE_DEMOTE_WARN_BUDGET) {
                  sourceDemoteWarnCount++;
                  console.warn(
                    `⚠️ [Calculation.Source] Demoting given.source kind="${kind}" → "ai" (no resolved PRODUCT CONTEXT block was supplied; label was ${JSON.stringify(label)})`,
                  );
                }
                kind = 'ai';
                label = 'AI engineering reference';
                url = undefined;
              }

              // Strip "example" wording from labels — the rules forbid it
              // because it implies a real datasheet was consulted.
              if (/\bexample\b/i.test(label)) {
                if (sourceDemoteWarnCount < SOURCE_DEMOTE_WARN_BUDGET) {
                  sourceDemoteWarnCount++;
                  console.warn(`⚠️ [Calculation.Source] Stripping "example" wording from given.source label: ${JSON.stringify(label)}`);
                }
                const cleaned = label
                  .replace(/\(\s*[^)]*\bexample\b[^)]*\)/gi, '')
                  .replace(/\b(?:datasheet\s+)?example\b[^,;]*$/gi, '')
                  .replace(/\s{2,}/g, ' ')
                  .trim();
                label = cleaned || (kind === 'ai' ? 'AI engineering reference' : kind === 'user' ? 'User input' : kind);
              }

              return { kind, label, url };
            }

            const ALLOWED_FORMULA_KINDS: ReadonlySet<FormulaSourceKind> = new Set(['standard', 'manufacturer', 'textbook', 'ai']);
            function normalizeFormulaSource(raw: any): FormulaSource | undefined {
              if (!raw || typeof raw !== 'object') return undefined;
              const rawKind = String(raw.kind || '').toLowerCase().trim();
              const aliasMap: Record<string, FormulaSourceKind> = {
                standard: 'standard',
                iso: 'standard',
                din: 'standard',
                manufacturer: 'manufacturer',
                catalog: 'manufacturer',
                vendor: 'manufacturer',
                textbook: 'textbook',
                book: 'textbook',
                handbook: 'textbook',
                ai: 'ai',
                model_knowledge: 'ai',
              };
              let kind = (aliasMap[rawKind] || (ALLOWED_FORMULA_KINDS.has(rawKind as FormulaSourceKind) ? rawKind as FormulaSourceKind : 'ai'));
              let label = String(raw.label || '').trim() || (kind === 'ai' ? 'AI engineering reference' : kind);
              // Same URL policy as given-source citations: absolute https or
              // /uploads/* relative; reject everything else.
              const rawUrl = typeof raw.url === 'string' ? raw.url.trim() : '';
              let url: string | undefined = (/^https?:\/\//i.test(rawUrl) || /^\/uploads\//i.test(rawUrl)) ? rawUrl : undefined;

              // Defense-in-depth (Task #256): "manufacturer" requires that we
              // actually consulted a manufacturer catalog. With no resolved
              // PRODUCT CONTEXT block, we did not — demote to "ai".
              if (!hasResolvedProductContext && kind === 'manufacturer') {
                if (sourceDemoteWarnCount < SOURCE_DEMOTE_WARN_BUDGET) {
                  sourceDemoteWarnCount++;
                  console.warn(
                    `⚠️ [Calculation.Source] Demoting formula_source kind="manufacturer" → "ai" (no resolved PRODUCT CONTEXT block was supplied; label was ${JSON.stringify(label)})`,
                  );
                }
                kind = 'ai';
                label = 'AI engineering reference';
                url = undefined;
              }

              return { label, url, kind };
            }

            const rawFormulaSources: FormulaSource[] = (() => {
              const out: FormulaSource[] = [];
              if (Array.isArray(cs.formula_sources)) {
                for (const s of cs.formula_sources) {
                  const norm = normalizeFormulaSource(s);
                  if (norm) out.push(norm);
                }
              }
              // Always guarantee at least one formula source so the UI can
              // distinguish a real citation from "AI engineering reference".
              if (out.length === 0) out.push({ label: 'AI engineering reference', kind: 'ai' });
              return out;
            })();

            // Strip "example" / "datasheet example" wording from a parameter
            // NAME (Task #256). Conservative: only fires when no resolved
            // PRODUCT CONTEXT block was supplied — i.e. the only way the
            // agent could justify "example" wording is by inventing it.
            // Patterns handled (case-insensitive):
            //   "Rated push force EMA-80M example" → "Rated push force"
            //   "Load capacity (datasheet example for EMA-80M)" → "Load capacity"
            //   "Friction coefficient (example)" → "Friction coefficient"
            const stripExampleFromName = (name: string): string => {
              if (hasResolvedProductContext) return name;
              if (!/\bexample\b/i.test(name)) return name;
              const cleaned = name
                .replace(/\s*\(\s*[^)]*\bexample\b[^)]*\)\s*/gi, ' ')
                .replace(/\s+(?:datasheet\s+)?example\b[^,;]*$/gi, '')
                .replace(/\s{2,}/g, ' ')
                .trim();
              const out = cleaned || name;
              if (out !== name && sourceDemoteWarnCount < SOURCE_DEMOTE_WARN_BUDGET) {
                sourceDemoteWarnCount++;
                console.warn(`⚠️ [Calculation.Source] Stripping "example" wording from given.name: ${JSON.stringify(name)} → ${JSON.stringify(out)}`);
              }
              return out;
            };

            // Task #261 — Track Given inputs whose source.kind was demoted
            // from "datasheet_pdf"/"db"/"web" to "ai" by normalizeGivenSource
            // (because no resolved PRODUCT CONTEXT block was supplied). On a
            // calculation_search turn that NAMED a product, a non-empty list
            // here is the fabrication signal: the agent dressed up training-
            // data values as datasheet citations. Used by the Case-2
            // fabrication block below to drop the calc card.
            const fabricatedGivenInputs: Array<{ name: string; originalKind: string }> = [];
            const FABRICATED_RAW_KINDS = new Set([
              'datasheet_pdf', 'datasheet', 'pdf',
              'db', 'database', 'catalog',
              'web', 'manufacturer',
            ]);

            calculationSection = {
              title: typeof cs.title === 'string' ? cs.title : '',
              given: Array.isArray(cs.given) ? cs.given.map((g: any) => {
                const cleanedName = normalizeSymbolInProse(stripExampleFromName(String(g.name || '')));
                const rawKind = String(g?.source?.kind || '').toLowerCase().trim();
                const normSource = normalizeGivenSource(g.source);
                if (
                  !hasResolvedProductContext &&
                  FABRICATED_RAW_KINDS.has(rawKind) &&
                  normSource?.kind === 'ai'
                ) {
                  fabricatedGivenInputs.push({
                    name: cleanedName || '(unnamed input)',
                    originalKind: rawKind,
                  });
                }
                return {
                  name: cleanedName,
                  value: normalizeValueString(String(g.value || '')),
                  unit: canonU('given.unit', g.unit),
                  source: normSource,
                };
              }) : [],
              formula: typeof cs.formula === 'string' ? normalizeMathString(cs.formula) : undefined,
              legend: Array.isArray(cs.legend) ? cs.legend.map((l: any) => ({
                // legend[].symbol is a pure identifier field — use the broader
                // single-char subscript rule so "C_d" / "P_rr" / "F_max" render
                // with proper subscripts in the legend table.
                symbol: normalizeSubscriptsAll(String(l.symbol || '')),
                description: String(l.description || ''),
                unit: l.unit ? (canonU('legend.unit', l.unit) || undefined) : undefined,
              })) : undefined,
              steps: rawSteps,
              result: (() => {
                if (cs.result && typeof cs.result === 'object') {
                  return {
                    name: normalizeSymbolInProse(String(cs.result.name || '')),
                    value: normalizeValueString(String(cs.result.value || '')),
                    unit: canonU('result.unit', cs.result.unit),
                  };
                }
                if (typeof cs.result === 'string') {
                  const parsed = parseValueUnitString(cs.result, 'result.unit');
                  if (parsed) {
                    return { name: '', value: parsed.value, unit: parsed.unit || '' };
                  }
                }
                return { name: '', value: '', unit: '' };
              })(),
              derived_specs: rawDerivedSpecs,
              summary: typeof cs.summary === 'string' ? cs.summary : '',
              formula_sources: rawFormulaSources,
            };
            console.log(`🔢 [AgentSearch] Parsed calculation section: "${calculationSection.title}", ${calculationSection.steps.length} steps`);

            // Sampled forensic check: warn when the Final Result row's numeric
            // value diverges from the value computed in the FINAL calculation
            // step (the last entry in steps[], not the last numeric step).
            // Pure observability — never mutates data, never throws.
            checkCalcConsistency(calculationSection);

            // Task #261 — Block calculation cards on Case-2 (named product,
            // not resolved). When a calculation_search query NAMED a product
            // and no resolution layer (db / history / web / manufacturer)
            // could ground it, the hybrid engine emits a "PRODUCT CONTEXT —
            // NAMED PRODUCT NOT RESOLVED" guard block telling the agent to
            // either compute from prompt-only inputs or refuse. If the agent
            // ignored that guard and emitted ANY calc card on this turn, the
            // numbers are built on values it couldn't actually source — drop
            // the card and surface a refusal in chat_summary that names the
            // product candidate, lists the missing inputs (when known), and
            // offers two ways forward (provide value, paste datasheet link).
            // This is the silent-move-on bug the user observed with EMA-80.
            //
            // Two flavors of refusal text:
            //   - Fabrication: agent emitted Given rows whose source kind
            //     was demoted from datasheet/db/web → ai (we know which
            //     inputs are missing).
            //   - Generic: agent emitted a calc card without usable Given
            //     metadata (no demoted rows, no Given rows at all, etc.).
            //
            // Gated to hasNotResolvedProductContext so it only fires for
            // Case-2 and never for the pure prompt-only path or the Case-1
            // resolved-datasheet path.
            if (
              classification?.intent === 'calculation_search' &&
              hasNotResolvedProductContext &&
              calculationSection &&
              fabricatedGivenInputs.length > 0
            ) {
              const resultName = String(calculationSection.result?.name || '').trim();
              const resultPhrase = resultName
                ? resultName.replace(/\\text\{([^}]+)\}/g, '$1').replace(/[_^]\{([^}]+)\}/g, '$1').replace(/\\[a-zA-Z]+/g, '').replace(/\s+/g, ' ').trim() || 'this value'
                : 'this value';
              // Dedupe input names so a model that repeats a Given row (e.g.
              // "C — dynamic load capacity" listed twice) doesn't render
              // duplicate phrases in the refusal sentence.
              const inputNames = Array.from(new Set(
                fabricatedGivenInputs
                  .map(i => i.name)
                  .filter(n => n && n !== '(unnamed input)'),
              ));
              const inputList = inputNames.join(', ');

              // The NOT_RESOLVED guard block always contains the candidate
              // token in this exact format (see hybrid-engine.ts ~line 444).
              let candidateLabel = '';
              if (productContextBlock) {
                const m = productContextBlock.match(/PRODUCT \(user-named, NOT verified\): "([^"]+)"/);
                if (m) candidateLabel = m[1];
              }
              const subjectPhrase = candidateLabel ? `**${candidateLabel}**` : 'that product';

              const refusalLine = inputNames.length > 0
                ? `I couldn't find a datasheet for ${subjectPhrase} in the catalog or on the web. To compute ${resultPhrase} I need ${inputList}. Either share those values, or paste a datasheet link.`
                : `I couldn't find a datasheet for ${subjectPhrase} in the catalog or on the web. Please share a datasheet link or the key specifications and I'll re-run the calculation.`;

              const existingSummary = String(parsed.chat_summary ?? '').trim();
              const summaryAlreadyRefuses = /i couldn'?t find a datasheet|please (?:share|provide)|paste a (?:link|datasheet)/i.test(existingSummary);
              const newSummary = !existingSummary
                ? refusalLine
                : (summaryAlreadyRefuses ? existingSummary : `${refusalLine}\n\n${existingSummary}`);
              parsed.chat_summary = newSummary;
              // The local `chatSummary` was captured from parsed.chat_summary
              // way back at line 2079 (before any refusal handler runs) and
              // is what the function ultimately returns. Update it too so
              // the refusal text actually flows out to the client instead of
              // being silently dropped.
              chatSummary = newSummary;

              if (calcRefusalWarnCount < CALC_REFUSAL_WARN_BUDGET) {
                calcRefusalWarnCount++;
                const flavor = fabricatedGivenInputs.length > 0 ? 'fabrication' : 'unresolved-product';
                console.warn(
                  `🚫 [AgentSearch] Calculation blocked (Case-2 ${flavor}) — candidate=${JSON.stringify(candidateLabel || '(unknown)')}, result=${JSON.stringify(resultPhrase)}, missing inputs=${JSON.stringify(inputNames.length > 0 ? inputNames : '(no Given metadata)')}`,
                );
              }

              calculationSection = undefined;
              delete parsed.calculation_section;
              calcDroppedByRefusal = true;
            } else if (
              classification?.intent === 'calculation_search' &&
              hasNotResolvedProductContext &&
              calculationSection &&
              fabricatedGivenInputs.length === 0
            ) {
              // Case-1b: product context unresolved but agent used only
              // prompt-supplied inputs (no demoted/fabricated rows). Let the
              // calc card pass through — all values came from the user.
              console.log(
                `✅ [AgentSearch] Calculation passed (Case-1b prompt-only inputs) — title=${JSON.stringify(calculationSection.title || '')}, given=${calculationSection.given.length}, steps=${calculationSection.steps.length}`,
              );
            } else if (
              classification?.intent === 'calculation_search' &&
              hasResolvedProductContext &&
              calculationSection
            ) {
              // Case-1 success log: a calc card was computed against a
              // resolved datasheet (db / history / web layer). Pairs with
              // the existing Case-2 / Case-3 refusal logging at line ~2141
              // so every calculation_search turn emits exactly one case
              // marker for observability.
              console.log(
                `✅ [AgentSearch] Calculation computed (Case-1 resolved datasheet) — title=${JSON.stringify(calculationSection.title || '')}, given=${calculationSection.given.length}, steps=${calculationSection.steps.length}`,
              );
            }
          }
        }

        if (dataArray.length === 0 && !decisionSummary) {
          const textBeforeJson = textOutput.substring(0, textOutput.indexOf(jsonStr)).trim();
          const textAfterJson = textOutput.substring(textOutput.indexOf(jsonStr) + jsonStr.length).trim();
          const freeText = (textBeforeJson + '\n' + textAfterJson).replace(/```json|```/g, '').trim();
          
          if (freeText.length > 20) {
            console.log('📝 [AgentSearch] Empty JSON with surrounding text - using text as explanation');
            return {
              success: true,
              products: [],
              chatSummary: '',
              logicExplanation: '',
              interpretedRequirements: [],
              decisionSummary: freeText,
              rawOutput: textOutput,
            };
          }
        }

        for (const item of dataArray) {
          let productName = item.fluid_data?.product_name || item.product_name || '';

          if (!productName || productName === 'Unknown Product' || productName === 'Unknown') {
            const attrs = item.fluid_data?.attributes || [];
            const productAttr = attrs.find((a: any) => {
              if (!a.label || !a.value) return false;
              const label = a.label.toLowerCase();
              return label === 'product' || label === 'product name' || label === 'model' || 
                     label === 'model name' || label === 'part number' || label === 'series' ||
                     label.startsWith('product') || label.startsWith('model');
            });
            if (productAttr) {
              productName = productAttr.value;
            }
          }

          if (!productName || productName === 'Unknown Product' || productName === 'Unknown') {
            const desc = item.fluid_data?.description || '';
            const modelMatch = desc.match(/(?:Model|Product|Part)[:\s]+(.+?)(?:\s*[\(\|,]|$)/i);
            if (modelMatch) {
              productName = modelMatch[1].trim();
            } else if (desc && desc.length > 0 && desc.length < 120) {
              productName = desc;
            }
          }

          if (!productName || productName === 'Unknown Product' || productName === 'Unknown') {
            const summary = item.fluid_data?.ai_summary || '';
            if (summary && summary.length > 0 && summary.length < 80) {
              productName = summary;
            }
          }

          if (!productName || productName === 'Unknown Product' || productName === 'Unknown') {
            const company = item.structured_data?.company?.name || item.structured_data?.manufacturer_name || '';
            const attrs = item.fluid_data?.attributes || [];
            const identifyingAttr = attrs.find((a: any) => {
              if (!a.label || !a.value) return false;
              const l = a.label.toLowerCase();
              return l.includes('model') || l.includes('series') || l.includes('gpu') || 
                     l.includes('cpu') || l.includes('chipset') || l.includes('type') ||
                     l.includes('cooler') || l.includes('case') || l.includes('ssd');
            }) || attrs[0];
            
            if (identifyingAttr?.value) {
              productName = identifyingAttr.value;
              if (company && !productName.toLowerCase().includes(company.toLowerCase().split(' ')[0].toLowerCase())) {
                productName = `${company.split('(')[0].trim()} ${productName}`;
              }
            } else if (company) {
              productName = `${company.split('(')[0].trim()} Product`;
            }
          }

          const brand = item.fluid_data?.brand || item.structured_data?.company?.name || '';
          const qualityCheck = fixGenericProductName(productName || '', brand);
          if (qualityCheck.wasGeneric) {
            if (!qualityCheck.name) {
              continue;
            }
            productName = qualityCheck.name;
          }

          productName = cleanProductName(productName || '');

          if (!hasModelToken(productName)) {
            console.log(`ℹ️ [ProductQuality] Weak model token in product name: "${productName}"`);
          }

          const product: UnifiedProduct = {
            structured_data: {
              company: {
                name: item.structured_data?.company?.name || item.structured_data?.manufacturer_name || 'Unknown',
                website: item.structured_data?.company?.website || item.structured_data?.manufacturer_website || '',
                address: {
                  country_code: item.structured_data?.company?.address?.country_code || '',
                  city: item.structured_data?.company?.address?.city || item.structured_data?.manufacturer_location || '',
                  street: item.structured_data?.company?.address?.street || '',
                },
              },
              files: {
                datasheet_url: item.structured_data?.files?.datasheet_url || '',
                reference_link: item.structured_data?.files?.reference_link || '',
              },
            },
            fluid_data: {
              product_name: productName || 'Unnamed Product',
              brand: item.fluid_data?.brand || item.structured_data?.company?.name || '',
              description: item.fluid_data?.description || '',
              ai_summary: item.fluid_data?.ai_summary || item.fluid_data?.description || '',
              fit_score: item.fluid_data?.fit_score || 0,
              score_reason: typeof item.fluid_data?.score_reason === 'string' ? item.fluid_data.score_reason.trim() || undefined : undefined,
              part_type: typeof item.fluid_data?.part_type === 'string' ? item.fluid_data.part_type.trim() || undefined : undefined,
              attributes: (item.fluid_data?.attributes || []).map((attr: any) => {
                const rawUnit = attr.unit ? String(attr.unit) : '';
                const rawNote = typeof attr.note === 'string' ? attr.note.trim() : '';
                return {
                  label: attr.label || '',
                  value: attr.value || '',
                  unit: canonicalUnit(rawUnit),
                  unit_raw: rawUnit || undefined,
                  meets_requirement: attr.meets_requirement,
                  note: rawNote || undefined,
                };
              }),
            },
            source: 'web',
          };
          sanitizeProductUrls(product);
          products.push(product);
        }

        crossReferenceCitations(products, agentCitations);
        await validateProductUrls(products);

        // ── Task #363 enforcement (size_then_search) — HARD REJECT ──
        // Policy: when the classifier said size_then_search but the agent did
        // not produce a usable calculation_section (missing OR steps array
        // empty), the response is fundamentally wrong for the user's intent.
        // We chose HARD REJECT over auto-repair / re-prompt because:
        //   (a) re-prompting doubles latency and token cost on a flow that
        //       is already user-facing-streaming,
        //   (b) a silently-repaired calc card would still be ungrounded,
        //   (c) the honest UX is to ask the user for the missing physical
        //       input rather than fabricate one.
        // Concretely: we drop any product cards (they would render before a
        // missing calc card and mislead the user) and replace chat_summary
        // with a refusal that names what we need. This path is deterministic
        // and trivially testable: assert that a size_then_search response
        // with no calc_section returns products=[] and a refusal-shaped
        // chat_summary.
        // calcDroppedByRefusal=true means the agent DID emit a calculation_section
        // but it was a stub (no numeric values) and CalcRefusal filtered it out.
        // In that case the agent tried — the products are still valid and should show.
        // Only hard-reject when the agent completely omitted the calc section.
        const calcMissingForSizeMode =
          isCalculationQuery &&
          calculationMode === 'size_then_search' &&
          !calcDroppedByRefusal &&
          (!calculationSection || !calculationSection.steps || calculationSection.steps.length === 0);
        if (calcMissingForSizeMode) {
          if (products.length > 0) {
            console.warn(
              `🚫 [AgentSearch] size_then_search guard (HARD REJECT) — agent emitted ${products.length} product card(s) but no calculation_section; dropping products and surfacing refusal.`
            );
            products.length = 0;
          } else {
            console.warn('🚫 [AgentSearch] size_then_search guard (HARD REJECT) — no calculation_section AND no products; surfacing refusal.');
          }
          if (!chatSummary || !/i can'?t (?:size|compute)|please (?:provide|share)/i.test(chatSummary)) {
            const refusalLine = "I couldn't size this from the inputs you gave me. Please share the missing physical inputs (e.g. mass, target speed, time, stroke, flow rate, or pressure) and I'll size the component first, then recommend matching products.";
            chatSummary = chatSummary ? `${refusalLine}\n\n${chatSummary}` : refusalLine;
          }
        }

        // ── Task #363 derived-spec rerank ──
        // When the agent did produce a calculation_section with derived_specs,
        // we re-rank the product cards deterministically so candidates that
        // meet ALL derived specs come first — independent of how well the
        // agent followed the prompt. We score each product by counting the
        // derived-spec attributes that the product's fluid_data.attributes
        // marks as meets_requirement=true (matched by case-insensitive label
        // substring). Stable sort: ties keep the agent's original order.
        if (
          isCalculationQuery &&
          calculationSection &&
          Array.isArray(calculationSection.derived_specs) &&
          calculationSection.derived_specs.length > 0 &&
          products.length > 1
        ) {
          const derivedLabels = calculationSection.derived_specs
            .map((d: any) => String(d?.label || '').trim().toLowerCase())
            .filter(Boolean);
          if (derivedLabels.length > 0) {
            // Accept BOTH the boolean form (`true`) and the string form
            // (`"meets"`) for meets_requirement — the codebase uses both
            // (see backend/types.ts and admin/types.ts examples). Treat
            // "oversized" as still meeting (capacity above target is fine
            // for a sizing recommendation); only "undersized"/false fail.
            const meetsOk = (v: unknown): boolean =>
              v === true || v === 'meets' || v === 'oversized';
            const scoreOf = (p: UnifiedProduct): number => {
              const attrs = p.fluid_data?.attributes || [];
              let met = 0;
              for (const label of derivedLabels) {
                const hit = attrs.find((a: any) =>
                  String(a?.label || '').toLowerCase().includes(label) ||
                  label.includes(String(a?.label || '').toLowerCase())
                );
                if (hit && meetsOk((hit as any).meets_requirement)) met++;
              }
              return met;
            };
            const decorated = products.map((p, i) => ({ p, i, s: scoreOf(p) }));
            decorated.sort((a, b) => (b.s - a.s) || (a.i - b.i));
            const reordered = decorated.map(d => d.p);
            const changed = reordered.some((p, i) => p !== products[i]);
            if (changed) {
              console.log(
                `🔀 [AgentSearch] Re-ranked ${products.length} product(s) against ${derivedLabels.length} derived spec(s); top score=${decorated[0].s}/${derivedLabels.length}`
              );
              products.length = 0;
              products.push(...reordered);
            }
          }
        }

        const agentDuration = Date.now() - agentStartTime;
        const estimatedTokens = Math.ceil(textOutput.length / 4);
        return {
          success: true,
          products,
          chatSummary,
          logicExplanation,
          interpretedRequirements,
          decisionSummary,
          bestFit,
          alternativeSuggestion,
          searchGuidance,
          alternativeSearches: alternativeSearches?.length ? alternativeSearches : undefined,
          bomTable: bomTable.length > 0 ? bomTable : undefined,
          bomSummary: bomSummary || undefined,
          engineeringNotes: engineeringNotes || undefined,
          comparisonTable: comparisonTable || undefined,
          calculationSection: calculationSection || undefined,
          rawOutput: textOutput,
          _usage: { model: settings.model, agent_duration_ms: agentDuration, guardrails_duration_ms: guardrailsDuration || undefined, estimated_output_tokens: estimatedTokens, compression_usage: compressed._usage, web_search_calls: webSearchCallCount },
        };
      }
    } catch (parseError) {
      console.warn('[AgentSearch] Could not parse JSON from response:', parseError);
      console.log('📝 [AgentSearch] JSON parse failed - trying BOM and decision_summary fallbacks');
      const agentDuration = Date.now() - agentStartTime;
      const estimatedTokens = Math.ceil(textOutput.length / 4);

      const bomFallback = extractBomFallback(textOutput);
      if (bomFallback?.bom_table?.length > 0) {
        console.log(`📝 [AgentSearch] Recovered ${bomFallback.bom_table.length} BOM parts from failed JSON parse`);
        return {
          success: true,
          products: [],
          chatSummary: '',
          logicExplanation: '',
          interpretedRequirements: bomFallback.interpreted_requirements || [],
          bomTable: bomFallback.bom_table.map((item: any) => ({
            part: item.part || '',
            spec: canonicalizeUnitTokensInCell(item.spec || ''),
            qty: typeof item.qty === 'number' ? item.qty : 1,
            reason: item.reason || '',
          })),
          bomSummary: bomFallback.bom_summary || undefined,
          engineeringNotes: bomFallback.engineering_notes || undefined,
          rawOutput: textOutput,
          _usage: { model: settings.model, agent_duration_ms: agentDuration, guardrails_duration_ms: guardrailsDuration || undefined, estimated_output_tokens: estimatedTokens, compression_usage: compressed._usage, web_search_calls: webSearchCallCount },
        };
      }

      const dsFallback = extractDecisionSummaryFallback(textOutput);
      let fallbackSummary: string;
      if (dsFallback?.decision_summary) {
        fallbackSummary = dsFallback.decision_summary;
        console.log('📝 [AgentSearch] Extracted decision_summary from raw text for fallback');
      } else {
        const looksLikeRawJson = textOutput.trimStart().startsWith('{') || textOutput.trimStart().startsWith('[');
        if (looksLikeRawJson) {
          fallbackSummary = "I found some results but had trouble formatting them. Please try your search again.";
          console.log('📝 [AgentSearch] Raw JSON detected in fallback - using safe message instead');
        } else {
          fallbackSummary = textOutput.trim();
        }
      }

      return {
        success: true,
        products: [],
        chatSummary: '',
        logicExplanation: '',
        interpretedRequirements: dsFallback?.interpreted_requirements || [],
        decisionSummary: fallbackSummary,
        rawOutput: textOutput,
        _usage: { model: settings.model, agent_duration_ms: agentDuration, guardrails_duration_ms: guardrailsDuration || undefined, estimated_output_tokens: estimatedTokens, compression_usage: compressed._usage, web_search_calls: webSearchCallCount },
      };
    }

    console.log(`✅ [AgentSearch] Parsed ${products.length} products from web search`);

    crossReferenceCitations(products, agentCitations);
    await validateProductUrls(products);

    const agentDuration = Date.now() - agentStartTime;
    const estimatedTokens = Math.ceil(textOutput.length / 4);
    return {
      success: true,
      products,
      chatSummary,
      logicExplanation,
      rawOutput: textOutput,
      _usage: { model: settings.model, agent_duration_ms: agentDuration, guardrails_duration_ms: guardrailsDuration || undefined, estimated_output_tokens: estimatedTokens, compression_usage: compressed._usage, web_search_calls: webSearchCallCount },
    };
  } catch (error: any) {
    console.error('❌ [AgentSearch] Error:', error?.message || error);
    return {
      success: false,
      products: [],
      chatSummary: '',
      logicExplanation: '',
      error: error?.message || 'Unknown error',
    };
  }
}
