import OpenAI from 'openai';
import { fetchAndExtractPdf, type PdfFetchResult } from '../../../services/web-pdf-fetcher';
import type { UnifiedProduct, ProductAttribute, InterpretedRequirement } from './types';
import { getAgentSettings } from '../agents/admin/settings-storage';

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/** Top-N web candidates to verify per search. Configurable via env (default 5, hard cap 20). */
const MAX_VERIFY_PRODUCTS = (() => {
  const raw = parseInt(process.env.DATASHEET_VERIFY_TOP_N || '', 10);
  if (!Number.isFinite(raw) || raw <= 0) return 5;
  return Math.min(raw, 20);
})();
const PER_PDF_TIMEOUT_MS = 8000;
/** Hard end-to-end cap: fetch + parse + LLM refinement combined. */
const TOTAL_BUDGET_MS = 15000;
/** Match the DB datasheet flow's truncation size. */
const DATASHEET_TEXT_CHARS = 2000;

interface VerifierRefinedItem {
  index: number;
  fit_score: number;
  attributes?: ProductAttribute[];
  note?: string;
}

interface VerifierRefinementResult {
  refined: VerifierRefinedItem[];
}

interface VerifierAttributeRaw {
  label?: unknown;
  value?: unknown;
  unit?: unknown;
  meets_requirement?: unknown;
  note?: unknown;
}

function isVerifyableWebProduct(p: UnifiedProduct, dbDatasheetUrls: Set<string>): boolean {
  if (p.source !== 'web') return false;
  if (p._dbDatasheetPath) return false;
  const url = p.structured_data?.files?.datasheet_url;
  if (!url || typeof url !== 'string') return false;
  // Strict: HTTPS only, must end in .pdf — the fetcher will re-validate but
  // we filter here to avoid wasting candidate slots on URLs that will reject.
  if (!/^https:\/\//i.test(url)) return false;
  const lower = url.split(/[?#]/)[0].toLowerCase();
  if (!lower.endsWith('.pdf')) return false;
  if (dbDatasheetUrls.has(url)) return false;
  return true;
}

function buildRefinementPrompt(
  query: string,
  requirements: InterpretedRequirement[] | undefined,
  items: Array<{
    index: number;
    name: string;
    company: string;
    originalScore: number;
    originalAttrs: ProductAttribute[];
    datasheetText: string;
  }>
): string {
  const reqLines = (requirements || [])
    .map(r => `- [${r.type}] ${r.parameter}: ${r.requirement}`)
    .join('\n') || '(none extracted — use the user query alone)';

  const itemBlocks = items.map(it => {
    const attrLines = (it.originalAttrs || []).slice(0, 6)
      .map(a => `  - ${a.label}: ${a.value}${a.unit ? ' ' + a.unit : ''}`)
      .join('\n');
    const truncated = it.datasheetText.slice(0, DATASHEET_TEXT_CHARS);
    return `### Product index ${it.index}
- Name: ${it.name}
- Manufacturer: ${it.company}
- Agent's first-pass fit_score: ${it.originalScore}
- Agent's first-pass key specs:
${attrLines || '  (none)'}

DATASHEET CONTENT (truncated to ${DATASHEET_TEXT_CHARS} chars):
"""
${truncated}
"""`;
  }).join('\n\n');

  return `You are a technical sourcing expert verifying products against a user's requirements using their actual PDF datasheets.

USER QUERY: "${query}"

INTERPRETED REQUIREMENTS:
${reqLines}

Below are products the agent already returned. For each one I have downloaded the actual manufacturer PDF datasheet and extracted the text. Re-evaluate fit_score and key specs using ONLY the datasheet content (not the agent's prior guess), then return a refined record.

PRODUCTS TO VERIFY:
${itemBlocks}

INSTRUCTIONS:
1. For each product, assign an honest fit_score (0–100) based on how well the datasheet specs match the user's requirements.
   - 85–100: meets all hard requirements, comfortable margin
   - 70–84: meets all hard requirements, tight margin or minor mismatch on soft requirements
   - 50–69: partially meets — some hard requirements met, others borderline
   - Below 50: clearly does not meet one or more hard requirements
2. Return refined "attributes" — the 3–6 most relevant key specs from the datasheet for the user's requirements. Each attribute MUST include label, value, unit (use empty string if dimensionless), and meets_requirement set to "meets" | "oversized" | "undersized" | true.
3. Use only specs you can verify in the datasheet text. If a critical spec isn't in the datasheet text, lower the score and note it.
4. Add a brief "note" field (max ~120 chars) explaining the score adjustment in plain language.

Respond with JSON only in this exact shape:
{
  "refined": [
    {
      "index": <number>,
      "fit_score": <0-100>,
      "attributes": [
        { "label": "...", "value": "...", "unit": "...", "meets_requirement": "meets" | "oversized" | "undersized" | true, "note": "..." }
      ],
      "note": "short explanation of score change"
    }
  ]
}`;
}

interface RefinementCallResult {
  refinement: VerifierRefinementResult | null;
  usage: {
    model: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
}

async function callRefinement(
  prompt: string,
  model: string,
  temperature: number,
  signal: AbortSignal
): Promise<RefinementCallResult> {
  try {
    const response = await openai.chat.completions.create(
      {
        model,
        temperature,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a strict technical sourcing verifier. You only return JSON.' },
          { role: 'user', content: prompt },
        ],
      },
      { signal }
    );
    const usage = {
      model,
      prompt_tokens: response.usage?.prompt_tokens ?? 0,
      completion_tokens: response.usage?.completion_tokens ?? 0,
      total_tokens: response.usage?.total_tokens ?? 0,
    };
    const content = response.choices?.[0]?.message?.content;
    if (!content) return { refinement: null, usage };
    const parsed = JSON.parse(content);
    if (!parsed || !Array.isArray(parsed.refined)) return { refinement: null, usage };
    return { refinement: parsed as VerifierRefinementResult, usage };
  } catch (err: any) {
    console.warn(`⚠️ [DatasheetVerifier] Refinement LLM call failed: ${err?.message}`);
    return { refinement: null, usage: null };
  }
}

export interface VerifierUsage {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface VerificationStats {
  attempted: number;
  verified: number;
  failed: number;
  failures: Array<{ name: string; reason: string; message: string }>;
  duration_ms: number;
  _usage?: VerifierUsage;
}

function normalizeAttributes(raw: unknown): ProductAttribute[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ProductAttribute[] = [];
  for (const item of raw as VerifierAttributeRaw[]) {
    if (!item || typeof item !== 'object') continue;
    const label = typeof item.label === 'string' ? item.label : null;
    const value = typeof item.value === 'string' ? item.value : null;
    if (!label || !value) continue;
    const unit = typeof item.unit === 'string' ? item.unit : '';
    let meets: ProductAttribute['meets_requirement'];
    const mr = item.meets_requirement;
    if (mr === true || mr === 'meets' || mr === 'oversized' || mr === 'undersized') {
      meets = mr;
    }
    const note = typeof item.note === 'string' ? item.note : undefined;
    out.push({ label, value, unit, meets_requirement: meets, note });
  }
  return out;
}

/**
 * Mutates `products` in place: top web candidates with HTTPS .pdf datasheet
 * URLs have their PDFs downloaded, parsed, and re-scored against the user's
 * requirements within a hard end-to-end deadline. Sets `datasheet_verified=true`
 * on success, `false` on any failure.
 */
export async function verifyWebProductDatasheets(
  query: string,
  products: UnifiedProduct[],
  requirements: InterpretedRequirement[] | undefined
): Promise<VerificationStats> {
  const startedAt = Date.now();
  const deadlineController = new AbortController();
  const deadlineHandle = setTimeout(() => deadlineController.abort(), TOTAL_BUDGET_MS);

  try {
    const dbDatasheetUrls = new Set(
      products
        .filter(p => p.source === 'database')
        .map(p => p.structured_data?.files?.datasheet_url || '')
        .filter(Boolean)
    );

    const candidatesAll = products
      .filter(p => isVerifyableWebProduct(p, dbDatasheetUrls))
      .sort((a, b) => (b.fluid_data.fit_score || 0) - (a.fluid_data.fit_score || 0))
      .slice(0, MAX_VERIFY_PRODUCTS);

    if (candidatesAll.length === 0) {
      return { attempted: 0, verified: 0, failed: 0, failures: [], duration_ms: 0 };
    }

    console.log(`🌐 [DatasheetVerifier] Verifying ${candidatesAll.length} web datasheet(s)`);

    const fetchPromises = candidatesAll.map(p =>
      fetchAndExtractPdf(p.structured_data.files.datasheet_url, {
        timeoutMs: PER_PDF_TIMEOUT_MS,
        signal: deadlineController.signal,
      })
        .then((res): { product: UnifiedProduct; result: PdfFetchResult } => ({ product: p, result: res }))
        .catch((err): { product: UnifiedProduct; result: PdfFetchResult } => ({
          product: p,
          result: { ok: false, reason: 'fetch_failed', message: err?.message || 'unknown' },
        }))
    );

    const fetchResults = await Promise.all(fetchPromises);

    const successful: Array<{ index: number; product: UnifiedProduct; text: string }> = [];
    const failures: VerificationStats['failures'] = [];

    for (const candidate of candidatesAll) {
      const matched = fetchResults.find(r => r.product === candidate);
      const name = candidate.fluid_data.product_name || 'unknown';
      if (!matched || !matched.result.ok) {
        candidate.datasheet_verified = false;
        const reason = matched?.result.ok === false ? matched.result.reason : 'fetch_failed';
        const message = matched?.result.ok === false ? matched.result.message : 'fetch promise missing';
        failures.push({ name, reason, message });
        continue;
      }
      const productIndex = products.indexOf(candidate);
      successful.push({ index: productIndex, product: candidate, text: matched.result.text });
    }

    if (successful.length === 0 || deadlineController.signal.aborted) {
      const duration_ms = Date.now() - startedAt;
      console.log(`🌐 [DatasheetVerifier] 0/${candidatesAll.length} verified in ${duration_ms}ms (budget exhausted: ${deadlineController.signal.aborted})`);
      return {
        attempted: candidatesAll.length,
        verified: 0,
        failed: failures.length,
        failures,
        duration_ms,
      };
    }

    let model = 'gpt-4o-mini';
    let temperature = 0.2;
    try {
      const settings = await getAgentSettings();
      if (settings?.model) model = settings.model;
      if (typeof settings?.temperature === 'number') temperature = Math.min(settings.temperature, 0.4);
    } catch {
      // fall back to defaults
    }

    const prompt = buildRefinementPrompt(
      query,
      requirements,
      successful.map(s => ({
        index: s.index,
        name: s.product.fluid_data.product_name || 'Unknown',
        company: s.product.structured_data.company.name || '',
        originalScore: s.product.fluid_data.fit_score || 0,
        originalAttrs: s.product.fluid_data.attributes || [],
        datasheetText: s.text,
      }))
    );

    const refinementResult = await callRefinement(prompt, model, temperature, deadlineController.signal);
    const refinement = refinementResult.refinement;
    const refinementUsage = refinementResult.usage;

    let verifiedCount = 0;
    if (refinement) {
      // Only accept LLM indices that point at one of the products we
      // actually fetched + parsed. Anything outside this allow-set is
      // ignored — the LLM is not allowed to update DB products or
      // unrelated web products it never saw a datasheet for.
      const allowedIndices = new Set<number>(successful.map(s => s.index));
      const refinedIndices = new Set<number>();
      for (const item of refinement.refined) {
        if (typeof item?.index !== 'number' || !Number.isInteger(item.index)) continue;
        if (!allowedIndices.has(item.index)) {
          console.warn(`⚠️ [DatasheetVerifier] LLM returned out-of-scope index ${item.index} — ignoring`);
          continue;
        }
        if (refinedIndices.has(item.index)) {
          // duplicate from the model — keep the first, drop the rest
          continue;
        }
        const target = products[item.index];
        if (!target) continue;
        if (typeof item.fit_score !== 'number' || !Number.isFinite(item.fit_score)) continue;
        const newScore = Math.max(0, Math.min(100, Math.round(item.fit_score)));
        target.fluid_data.fit_score = newScore;
        const normalizedAttrs = normalizeAttributes(item.attributes);
        if (normalizedAttrs && normalizedAttrs.length > 0) {
          target.fluid_data.attributes = normalizedAttrs;
        }
        target.datasheet_verified = true;
        refinedIndices.add(item.index);
        verifiedCount++;
      }
      for (const s of successful) {
        if (!refinedIndices.has(s.index)) {
          products[s.index].datasheet_verified = false;
          failures.push({
            name: s.product.fluid_data.product_name || 'unknown',
            reason: 'parse_failed',
            message: 'LLM did not return refinement for this product',
          });
        }
      }
    } else {
      for (const s of successful) {
        products[s.index].datasheet_verified = false;
      }
      failures.push({
        name: '(refinement-call)',
        reason: 'parse_failed',
        message: 'LLM refinement call returned null/invalid (or budget exhausted)',
      });
    }

    const duration_ms = Date.now() - startedAt;
    console.log(
      `🌐 [DatasheetVerifier] ${verifiedCount}/${candidatesAll.length} verified, ${failures.length} failed in ${duration_ms}ms`
    );
    return {
      attempted: candidatesAll.length,
      verified: verifiedCount,
      failed: failures.length,
      failures,
      duration_ms,
      _usage: refinementUsage || undefined,
    };
  } finally {
    clearTimeout(deadlineHandle);
  }
}
