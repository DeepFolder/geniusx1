import { db } from "../../../db";
import { hybridSearchUsage, users, modelPricing } from "@shared/schema";
import { desc, gte, and, lt, sql, inArray, eq, count } from "drizzle-orm";
import { ASTRA_MODEL, MISSING_PRICE_SOURCE, REQUIRED_MODEL_PRICE_SEEDS } from './model-pricing-catalogue';

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export type ServiceType =
  | 'classifier'
  | 'intent_routing'
  | 'guardrails'
  | 'agent_search'
  | 'manufacturer_discovery'
  | 'history_compression'
  | 'datasheet_verifier'
  | 'web_search_tool'
  | 'source_lookup'
  | 'ai_generate'
  | 'ai_followup'
  | 'ai_propose_task'
  | 'server_recompute'
  | 'calculation_persistence'
  | 'calculation_commentary';

interface ApiCall {
  service: ServiceType;
  model: string;
  tokens: TokenUsage;
  duration_ms: number;
  timestamp: number;
  cost_usd?: number;
  web_search_calls?: number;
}

export { ASTRA_MODEL };

const HARDCODED_MODEL_PRICES: Record<string, { in: number; out: number }> = {
  'gpt-5.4': { in: 2.50, out: 15.00 },
  'gpt-5.2': { in: 1.75, out: 14.00 },
  'gpt-5.2-chat-latest': { in: 1.75, out: 14.00 },
  'gpt-5.2-codex': { in: 1.75, out: 14.00 },
  'gpt-5.2-pro': { in: 21.00, out: 168.00 },
  'gpt-5.1': { in: 1.25, out: 10.00 },
  'gpt-5.1-chat-latest': { in: 1.25, out: 10.00 },
  'gpt-5.1-codex': { in: 1.25, out: 10.00 },
  'gpt-5.1-codex-max': { in: 1.25, out: 10.00 },
  'gpt-5.1-codex-mini': { in: 0.25, out: 2.00 },
  'gpt-5': { in: 1.25, out: 10.00 },
  'gpt-5-chat-latest': { in: 1.25, out: 10.00 },
  'gpt-5-codex': { in: 1.25, out: 10.00 },
  'gpt-5-mini': { in: 0.25, out: 2.00 },
  'gpt-5-nano': { in: 0.05, out: 0.40 },
  'gpt-5-pro': { in: 15.00, out: 120.00 },
  'gpt-5-search-api': { in: 1.25, out: 10.00 },
  'gpt-4.1': { in: 2.00, out: 8.00 },
  'gpt-4.1-mini': { in: 0.40, out: 1.60 },
  'gpt-4.1-nano': { in: 0.10, out: 0.40 },
  'gpt-4o': { in: 2.50, out: 10.00 },
  'gpt-4o-mini': { in: 0.15, out: 0.60 },
  'o1': { in: 15.00, out: 60.00 },
  'o1-mini': { in: 1.10, out: 4.40 },
  'o3': { in: 2.00, out: 8.00 },
  'o3-mini': { in: 1.10, out: 4.40 },
  'o4-mini': { in: 1.10, out: 4.40 },
  // Web search preview (non-reasoning, e.g. gpt-4o): `in` stores $/call, not $/Mtok
  // Source: https://openai.com/api/pricing/ — $25.00/1k calls = $0.025/call
  'web_search_preview': { in: 0.025, out: 0 },
  // Web search preview (reasoning models, gpt-5/o-series): $10.00/1k calls = $0.010/call
  'web_search_preview_reasoning': { in: 0.010, out: 0 },
  // Standard web search tool (all models): $10.00/1k calls = $0.010/call
  'web_search_tool': { in: 0.010, out: 0 },
};

interface CachedPrice {
  in: number;
  out: number;
  source: string;
}

let priceCache: Map<string, CachedPrice> = new Map();
let cacheFilled = false;

function lookupInMap(map: Map<string, CachedPrice>, model: string): CachedPrice | undefined {
  if (map.has(model)) return map.get(model);
  for (const [key, price] of map.entries()) {
    if (model.startsWith(key)) return price;
  }
  return undefined;
}

export function getModelPrice(model: string): { in: number; out: number } {
  if (cacheFilled) {
    return lookupInMap(priceCache, model) ?? { in: 0, out: 0 };
  }
  return HARDCODED_MODEL_PRICES[model]
    ?? Object.entries(HARDCODED_MODEL_PRICES).find(([k]) => model.startsWith(k))?.[1]
    ?? { in: 0, out: 0 };
}

export function hasConfiguredModelPrice(model: string): boolean {
  if (cacheFilled) {
    const source = lookupInMap(priceCache, model)?.source;
    return Boolean(source && source !== MISSING_PRICE_SOURCE);
  }
  return model !== ASTRA_MODEL;
}

export function calculateTokenCost(
  tokens: TokenUsage,
  price: { in: number; out: number },
): number {
  return (tokens.prompt_tokens / 1_000_000) * price.in
    + (tokens.completion_tokens / 1_000_000) * price.out;
}

function cacheRows(rows: Array<{ model: string; inputPerMtok: string; outputPerMtok: string; source: string }>) {
  return new Map(rows.map((r) => [r.model, {
    in: parseFloat(r.inputPerMtok),
    out: parseFloat(r.outputPerMtok),
    source: r.source,
  }]));
}

async function ensureRequiredPriceRows(): Promise<void> {
  for (const seed of REQUIRED_MODEL_PRICE_SEEDS) {
    await db.insert(modelPricing).values({
      ...seed,
      fetchedAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }
}

export async function initPriceCache(): Promise<void> {
  try {
    const rows = await db.select().from(modelPricing);
    if (rows.length === 0) {
      const seeds = Object.entries(HARDCODED_MODEL_PRICES).map(([m, p]) => ({
        model: m,
        inputPerMtok: String(p.in),
        outputPerMtok: String(p.out),
        source: 'hardcoded',
        fetchedAt: new Date(),
        updatedAt: new Date(),
      }));
      for (const seed of seeds) {
        await db.insert(modelPricing).values(seed).onConflictDoNothing();
      }
      await ensureRequiredPriceRows();
      const seeded = await db.select().from(modelPricing);
      priceCache = cacheRows(seeded);
    } else {
      priceCache = cacheRows(rows);
      // Ensure all web search tool entries are always in the DB (may be missing from older installs)
      const webSearchKeys = ['web_search_preview', 'web_search_preview_reasoning', 'web_search_tool'];
      for (const wsKey of webSearchKeys) {
        if (!priceCache.has(wsKey)) {
          const wsEntry = HARDCODED_MODEL_PRICES[wsKey];
          await db.insert(modelPricing).values({
            model: wsKey,
            inputPerMtok: String(wsEntry.in),
            outputPerMtok: String(wsEntry.out),
            source: 'hardcoded',
            fetchedAt: new Date(),
            updatedAt: new Date(),
          }).onConflictDoNothing();
          priceCache.set(wsKey, { in: wsEntry.in, out: wsEntry.out, source: 'hardcoded' });
        }
      }
      await ensureRequiredPriceRows();
      const completeRows = await db.select().from(modelPricing);
      priceCache = cacheRows(completeRows);
    }
    cacheFilled = true;
    console.log(`[pricing] Price cache loaded: ${priceCache.size} models`);
  } catch (err: any) {
    console.warn('[pricing] Failed to init price cache from DB, using hardcoded values:', err?.message);
  }
}

export async function reloadPriceCache(): Promise<void> {
  try {
    const rows = await db.select().from(modelPricing);
    priceCache = cacheRows(rows);
    cacheFilled = true;
    console.log(`[pricing] Price cache reloaded: ${priceCache.size} models`);
  } catch (err: any) {
    console.warn('[pricing] Failed to reload price cache:', err?.message);
  }
}

export function computeCallCost(call: ApiCall): number {
  if (call.service === 'web_search_tool') {
    const n = call.web_search_calls ?? 1;
    const costPerCall = cacheFilled
      ? (priceCache.get('web_search_preview')?.in ?? HARDCODED_MODEL_PRICES['web_search_preview'].in)
      : HARDCODED_MODEL_PRICES['web_search_preview'].in;
    return n * costPerCall;
  }
  if (call.service === 'guardrails' && call.tokens.total_tokens === 0) {
    return 0;
  }
  const price = getModelPrice(call.model);
  return calculateTokenCost(call.tokens, price);
}

export interface RequestUsage {
  request_id: string;
  session_id?: string;
  query: string;
  user_id?: string | null;
  name?: string | null;
  email?: string | null;
  ip_address?: string;
  user_agent?: string;
  country?: string;
  city?: string;
  region?: string;
  api_calls: ApiCall[];
  total_tokens: TokenUsage;
  total_duration_ms: number;
  total_cost_usd: number;
  search_mode: string;
  products_found: number;
  classification_intent?: string;
  classification_domain?: string;
  timestamp: number;
}

const activeRequests = new Map<string, {
  calls: ApiCall[];
  startTime: number;
  query: string;
  session_id?: string;
  user_id?: string | null;
  ip_address?: string;
  user_agent?: string;
  country?: string;
  city?: string;
  region?: string;
  search_mode: string;
}>();

export function startTracking(requestId: string, opts: {
  query: string;
  session_id?: string;
  user_id?: string | null;
  ip_address?: string;
  user_agent?: string;
  country?: string;
  city?: string;
  region?: string;
  search_mode: string;
}) {
  activeRequests.set(requestId, {
    calls: [],
    startTime: Date.now(),
    ...opts,
  });
}

export function trackApiCall(requestId: string, call: ApiCall) {
  const req = activeRequests.get(requestId);
  if (req) {
    if (call.cost_usd === undefined) {
      call.cost_usd = computeCallCost(call);
    }
    req.calls.push(call);
  }
}

export function finishTracking(requestId: string, productsFound: number, classification?: { intent?: string; domain?: string }): RequestUsage | null {
  const req = activeRequests.get(requestId);
  if (!req) return null;

  activeRequests.delete(requestId);

  const totalTokens: TokenUsage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };
  let totalCost = 0;
  for (const call of req.calls) {
    totalTokens.prompt_tokens += call.tokens.prompt_tokens;
    totalTokens.completion_tokens += call.tokens.completion_tokens;
    totalTokens.total_tokens += call.tokens.total_tokens;
    totalCost += call.cost_usd ?? 0;
  }

  const totalDurationMs = Date.now() - req.startTime;

  const usage: RequestUsage = {
    request_id: requestId,
    session_id: req.session_id,
    query: req.query,
    user_id: req.user_id,
    ip_address: req.ip_address,
    user_agent: req.user_agent,
    country: req.country,
    city: req.city,
    region: req.region,
    api_calls: req.calls,
    total_tokens: totalTokens,
    total_duration_ms: totalDurationMs,
    total_cost_usd: totalCost,
    search_mode: req.search_mode,
    products_found: productsFound,
    classification_intent: classification?.intent,
    classification_domain: classification?.domain,
    timestamp: Date.now(),
  };

  db.insert(hybridSearchUsage).values({
    requestId: usage.request_id,
    sessionId: usage.session_id,
    query: usage.query,
    userId: usage.user_id ?? undefined,
    ipAddress: usage.ip_address,
    userAgent: usage.user_agent,
    country: usage.country,
    city: usage.city,
    region: usage.region,
    apiCalls: usage.api_calls,
    totalPromptTokens: totalTokens.prompt_tokens,
    totalCompletionTokens: totalTokens.completion_tokens,
    totalTokens: totalTokens.total_tokens,
    totalDurationMs: totalDurationMs,
    searchMode: usage.search_mode,
    productsFound: productsFound,
    classificationIntent: classification?.intent,
    classificationDomain: classification?.domain,
  }).then(() => {
    console.log(`📊 [UsageTracking] Saved: ${requestId} (${totalTokens.total_tokens} tok, ${totalDurationMs}ms, $${totalCost.toFixed(4)})`);
  }).catch((err) => {
    console.error(`❌ [UsageTracking] Failed to save:`, err?.message);
  });

  return usage;
}

function dbRowToRequestUsage(row: any): RequestUsage {
  const apiCalls = ((row.apiCalls || []) as ApiCall[]).map(c => ({
    ...c,
    cost_usd: c.cost_usd ?? computeCallCost(c),
  }));
  const totalCost = apiCalls.reduce((acc, c) => acc + (c.cost_usd ?? 0), 0);
  return {
    request_id: row.requestId,
    session_id: row.sessionId,
    query: row.query,
    user_id: row.userId,
    name: row.name ?? null,
    email: row.email ?? null,
    ip_address: row.ipAddress,
    user_agent: row.userAgent,
    country: row.country,
    city: row.city,
    region: row.region,
    api_calls: apiCalls,
    total_tokens: {
      prompt_tokens: row.totalPromptTokens ?? 0,
      completion_tokens: row.totalCompletionTokens ?? 0,
      total_tokens: row.totalTokens ?? 0,
    },
    total_duration_ms: row.totalDurationMs ?? 0,
    total_cost_usd: totalCost,
    search_mode: row.searchMode ?? 'hybrid',
    products_found: row.productsFound ?? 0,
    classification_intent: row.classificationIntent,
    classification_domain: row.classificationDomain,
    timestamp: row.createdAt ? new Date(row.createdAt).getTime() : Date.now(),
  };
}

export async function getUsageHistory(limit = 50): Promise<RequestUsage[]> {
  try {
    const rows = await db
      .select({
        requestId: hybridSearchUsage.requestId,
        sessionId: hybridSearchUsage.sessionId,
        query: hybridSearchUsage.query,
        userId: hybridSearchUsage.userId,
        ipAddress: hybridSearchUsage.ipAddress,
        userAgent: hybridSearchUsage.userAgent,
        country: hybridSearchUsage.country,
        city: hybridSearchUsage.city,
        region: hybridSearchUsage.region,
        apiCalls: hybridSearchUsage.apiCalls,
        totalPromptTokens: hybridSearchUsage.totalPromptTokens,
        totalCompletionTokens: hybridSearchUsage.totalCompletionTokens,
        totalTokens: hybridSearchUsage.totalTokens,
        totalDurationMs: hybridSearchUsage.totalDurationMs,
        searchMode: hybridSearchUsage.searchMode,
        productsFound: hybridSearchUsage.productsFound,
        classificationIntent: hybridSearchUsage.classificationIntent,
        classificationDomain: hybridSearchUsage.classificationDomain,
        createdAt: hybridSearchUsage.createdAt,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(hybridSearchUsage)
      .leftJoin(users, eq(hybridSearchUsage.userId, users.id))
      .orderBy(desc(hybridSearchUsage.createdAt))
      .limit(limit);

    return rows.map(row => {
      const name = [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || null;
      return dbRowToRequestUsage({ ...row, name, email: row.email ?? null });
    });
  } catch (err: any) {
    console.error(`❌ [UsageTracking] Failed to load history:`, err?.message);
    return [];
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export async function getUsageStats() {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [{ totalCount }] = await db.select({ totalCount: count() }).from(hybridSearchUsage);

    const allRows = await db.select().from(hybridSearchUsage)
      .orderBy(desc(hybridSearchUsage.createdAt))
      .limit(1000);

    const monthRows = await db.select().from(hybridSearchUsage)
      .where(gte(hybridSearchUsage.createdAt, startOfMonth))
      .orderBy(desc(hybridSearchUsage.createdAt));

    const all = allRows.map(dbRowToRequestUsage);
    const thisMonth = monthRows.map(dbRowToRequestUsage);
    const lastHour = all.filter(u => u.timestamp > oneHourAgo.getTime());
    const lastDay = all.filter(u => u.timestamp > oneDayAgo.getTime());

    const sumTokens = (entries: RequestUsage[]) => entries.reduce((acc, u) => acc + u.total_tokens.total_tokens, 0);
    const sumCost = (entries: RequestUsage[]) => entries.reduce((acc, u) => acc + (u.total_cost_usd || 0), 0);
    const avgDuration = (entries: RequestUsage[]) => entries.length ? Math.round(entries.reduce((acc, u) => acc + u.total_duration_ms, 0) / entries.length) : 0;
    const avgCalls = (entries: RequestUsage[]) => entries.length ? Math.round((entries.reduce((acc, u) => acc + u.api_calls.length, 0) / entries.length) * 10) / 10 : 0;
    const avgCost = (entries: RequestUsage[]) => entries.length ? sumCost(entries) / entries.length : 0;

    const uniqueUsers = new Set(all.filter(u => u.user_id).map(u => u.user_id));
    const uniqueIPs = new Set(all.filter(u => !u.user_id && u.ip_address).map(u => u.ip_address));

    const byModel = new Map<string, { calls: number; tokens: number; cost_usd: number }>();
    const unpricedModels = new Map<string, { calls: number; tokens: number }>();
    const byService = new Map<string, { calls: number; tokens: number; cost_usd: number; avg_duration_ms: number; total_duration_ms: number }>();
    let totalWebSearchCalls = 0;
    for (const u of all) {
      for (const call of u.api_calls) {
        const cost = call.cost_usd ?? 0;
        const modelKey = call.service === 'web_search_tool' ? 'web_search_preview' : call.model;
        const modelEntry = byModel.get(modelKey) || { calls: 0, tokens: 0, cost_usd: 0 };
        modelEntry.calls++;
        modelEntry.tokens += call.tokens.total_tokens;
        modelEntry.cost_usd += cost;
        byModel.set(modelKey, modelEntry);

        if (call.tokens.total_tokens > 0 && !hasConfiguredModelPrice(call.model)) {
          const unpriced = unpricedModels.get(call.model) || { calls: 0, tokens: 0 };
          unpriced.calls++;
          unpriced.tokens += call.tokens.total_tokens;
          unpricedModels.set(call.model, unpriced);
        }

        const svcEntry = byService.get(call.service) || { calls: 0, tokens: 0, cost_usd: 0, avg_duration_ms: 0, total_duration_ms: 0 };
        svcEntry.calls++;
        svcEntry.tokens += call.tokens.total_tokens;
        svcEntry.cost_usd += cost;
        svcEntry.total_duration_ms += call.duration_ms;
        svcEntry.avg_duration_ms = Math.round(svcEntry.total_duration_ms / svcEntry.calls);
        byService.set(call.service, svcEntry);

        if (call.service === 'web_search_tool') {
          totalWebSearchCalls += call.web_search_calls ?? 1;
        }
      }
    }

    const recent50ForCostStats = all.slice(0, 50);
    const sortedCosts = recent50ForCostStats.map(u => u.total_cost_usd || 0).sort((a, b) => a - b);
    const costStats = {
      avg: avgCost(recent50ForCostStats),
      p50: percentile(sortedCosts, 0.5),
      p95: percentile(sortedCosts, 0.95),
      max: sortedCosts.length ? sortedCosts[sortedCosts.length - 1] : 0,
      total: sumCost(recent50ForCostStats),
      window: recent50ForCostStats.length,
    };

    const byIntent = new Map<string, number>();
    for (const u of all) {
      if (u.classification_intent) {
        byIntent.set(u.classification_intent, (byIntent.get(u.classification_intent) || 0) + 1);
      }
    }

    const recent50 = all.slice(0, 50);
    const groupedByMode = new Map<string, RequestUsage[]>();
    for (const u of recent50) {
      const key = u.search_mode || 'unknown';
      if (!groupedByMode.has(key)) groupedByMode.set(key, []);
      groupedByMode.get(key)!.push(u);
    }
    const byMode: Record<string, {
      requests: number;
      total_cost_usd: number;
      cost_per_request: { avg: number; p50: number; p95: number; max: number };
      avg_duration_ms: number;
    }> = {};
    for (const [mode, entries] of groupedByMode) {
      const sorted = entries.map(e => e.total_cost_usd || 0).sort((a, b) => a - b);
      byMode[mode] = {
        requests: entries.length,
        total_cost_usd: sumCost(entries),
        cost_per_request: {
          avg: avgCost(entries),
          p50: percentile(sorted, 0.5),
          p95: percentile(sorted, 0.95),
          max: sorted.length ? sorted[sorted.length - 1] : 0,
        },
        avg_duration_ms: avgDuration(entries),
      };
    }

    const monthCost = sumCost(thisMonth);
    const monthMs = now.getTime() - startOfMonth.getTime();
    const totalMonthMs = startOfNextMonth.getTime() - startOfMonth.getTime();
    const monthElapsedFraction = monthMs > 0 ? monthMs / totalMonthMs : 0;
    const projectedMonthlyCost = monthElapsedFraction > 0 ? monthCost / monthElapsedFraction : 0;
    const projectedMonthlyRequests = monthElapsedFraction > 0 ? Math.round(thisMonth.length / monthElapsedFraction) : 0;
    const projectedMonthlyTokens = monthElapsedFraction > 0 ? Math.round(sumTokens(thisMonth) / monthElapsedFraction) : 0;
    const monthUniqueUsers = new Set(thisMonth.filter(u => u.user_id).map(u => u.user_id));

    return {
      total_requests: totalCount,
      last_hour: {
        requests: lastHour.length,
        total_tokens: sumTokens(lastHour),
        total_cost_usd: sumCost(lastHour),
        avg_cost_usd: avgCost(lastHour),
        avg_duration_ms: avgDuration(lastHour),
        avg_api_calls: avgCalls(lastHour),
      },
      last_day: {
        requests: lastDay.length,
        total_tokens: sumTokens(lastDay),
        total_cost_usd: sumCost(lastDay),
        avg_cost_usd: avgCost(lastDay),
        avg_duration_ms: avgDuration(lastDay),
        avg_api_calls: avgCalls(lastDay),
      },
      this_month: {
        requests: thisMonth.length,
        total_tokens: sumTokens(thisMonth),
        total_cost_usd: monthCost,
        avg_cost_usd: avgCost(thisMonth),
        avg_duration_ms: avgDuration(thisMonth),
        avg_api_calls: avgCalls(thisMonth),
        unique_users: monthUniqueUsers.size,
        month_label: startOfMonth.toLocaleString('default', { month: 'long', year: 'numeric' }),
        elapsed_fraction: monthElapsedFraction,
        projected_cost_usd: projectedMonthlyCost,
        projected_requests: projectedMonthlyRequests,
        projected_tokens: projectedMonthlyTokens,
      },
      all_time: {
        total_tokens: sumTokens(all),
        total_cost_usd: sumCost(all),
        avg_cost_usd: avgCost(all),
        avg_duration_ms: avgDuration(all),
        avg_api_calls: avgCalls(all),
      },
      cost_per_request: costStats,
      total_web_search_calls: totalWebSearchCalls,
      unique_users: uniqueUsers.size,
      anonymous_visitors: uniqueIPs.size,
      by_model: Object.fromEntries(byModel),
      unpriced_models: Array.from(unpricedModels.entries()).map(([model, data]) => ({ model, ...data })),
      by_service: Object.fromEntries(byService),
      by_intent: Object.fromEntries(byIntent),
      by_mode: byMode,
    };
  } catch (err: any) {
    console.error(`❌ [UsageTracking] Failed to compute stats:`, err?.message);
    return {
      total_requests: 0,
      last_hour: { requests: 0, total_tokens: 0, total_cost_usd: 0, avg_cost_usd: 0, avg_duration_ms: 0, avg_api_calls: 0 },
      last_day: { requests: 0, total_tokens: 0, total_cost_usd: 0, avg_cost_usd: 0, avg_duration_ms: 0, avg_api_calls: 0 },
      this_month: {
        requests: 0, total_tokens: 0, total_cost_usd: 0, avg_cost_usd: 0, avg_duration_ms: 0, avg_api_calls: 0,
        unique_users: 0, month_label: '', elapsed_fraction: 0,
        projected_cost_usd: 0, projected_requests: 0, projected_tokens: 0,
      },
      all_time: { total_tokens: 0, total_cost_usd: 0, avg_cost_usd: 0, avg_duration_ms: 0, avg_api_calls: 0 },
      cost_per_request: { avg: 0, p50: 0, p95: 0, max: 0, total: 0 },
      total_web_search_calls: 0,
      unique_users: 0,
      anonymous_visitors: 0,
      by_model: {},
      unpriced_models: [],
      by_service: {},
      by_intent: {},
      by_mode: {},
    };
  }
}

function resolveMonthRange(month: string): { start: Date | null; end: Date | null; label: string } {
  const now = new Date();
  if (month === 'all') {
    return { start: null, end: null, label: 'All time' };
  }
  if (month === 'current' || !month) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start, end, label: start.toLocaleString('default', { month: 'long', year: 'numeric' }) };
  }
  if (month === 'previous') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end, label: start.toLocaleString('default', { month: 'long', year: 'numeric' }) };
  }
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const year = parseInt(m[1], 10);
    const monthIdx = parseInt(m[2], 10) - 1;
    const start = new Date(year, monthIdx, 1);
    const end = new Date(year, monthIdx + 1, 1);
    return { start, end, label: start.toLocaleString('default', { month: 'long', year: 'numeric' }) };
  }
  // Fallback: current month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end, label: start.toLocaleString('default', { month: 'long', year: 'numeric' }) };
}

export interface ByUserListOptions {
  range?: 'hour' | 'day' | 'week' | 'month' | 'all' | 'custom';
  from?: string;
  to?: string;
  model?: string;
  searchMode?: string;
}

export async function getUsageByUser(
  month: string = 'current',
  filters?: ByUserListOptions,
) {
  try {
    let rangeLabel = '';
    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;

    if (filters && filters.range) {
      const r = resolveTimeRange({
        range: filters.range,
        from: filters.from,
        to: filters.to,
      });
      rangeStart = r.start;
      rangeEnd = r.end;
      rangeLabel = filters.range === 'custom'
        ? `${filters.from || ''} – ${filters.to || ''}`
        : ({ hour: 'Last hour', day: 'Last 24h', week: 'Last 7 days', month: 'This month', all: 'All time' } as Record<string, string>)[filters.range] || '';
    } else {
      const monthRange = resolveMonthRange(month);
      rangeStart = monthRange.start;
      rangeEnd = monthRange.end;
      rangeLabel = monthRange.label;
    }

    const conditions: any[] = [];
    if (rangeStart) conditions.push(gte(hybridSearchUsage.createdAt, rangeStart));
    if (rangeEnd) conditions.push(lt(hybridSearchUsage.createdAt, rangeEnd));
    if (filters?.searchMode && filters.searchMode !== 'all') {
      conditions.push(eq(hybridSearchUsage.searchMode, filters.searchMode));
    }
    const whereExpr = conditions.length ? and(...conditions) : undefined;

    const baseQuery = db.select().from(hybridSearchUsage);
    const rowsRaw = whereExpr
      ? await baseQuery.where(whereExpr).orderBy(desc(hybridSearchUsage.createdAt))
      : await baseQuery.orderBy(desc(hybridSearchUsage.createdAt));

    let entries = rowsRaw.map(dbRowToRequestUsage);
    if (filters?.model && filters.model !== 'all') {
      entries = entries.filter(e => e.api_calls.some(c => c.model === filters.model));
    }

    type Bucket = {
      key: string;
      user_id: string | null;
      requests: number;
      total_tokens: number;
      total_cost_usd: number;
      avg_cost_usd: number;
      last_seen: number;
      first_seen: number;
      anonymous_count: number;
      durations: number[];
      total_duration_ms: number;
      total_completion_tokens: number;
      model_calls: Map<string, number>;
    };
    const userBuckets = new Map<string, Bucket>();
    let anonRequests = 0;
    let anonTokens = 0;
    let anonCost = 0;
    let anonLastSeen = 0;
    let anonFirstSeen = 0;
    const anonIps = new Set<string>();
    const anonDurations: number[] = [];
    let anonTotalDuration = 0;
    let anonCompletionTokens = 0;
    const anonModelCalls = new Map<string, number>();

    for (const e of entries) {
      const cost = e.total_cost_usd || 0;
      const tokens = e.total_tokens.total_tokens || 0;
      const completionTokens = e.total_tokens.completion_tokens || 0;
      const dur = e.total_duration_ms || 0;
      if (!e.user_id) {
        anonRequests += 1;
        anonTokens += tokens;
        anonCost += cost;
        anonTotalDuration += dur;
        anonCompletionTokens += completionTokens;
        anonDurations.push(dur);
        for (const call of e.api_calls) {
          anonModelCalls.set(call.model, (anonModelCalls.get(call.model) || 0) + 1);
        }
        if (e.timestamp > anonLastSeen) anonLastSeen = e.timestamp;
        if (anonFirstSeen === 0 || e.timestamp < anonFirstSeen) anonFirstSeen = e.timestamp;
        if (e.ip_address) anonIps.add(e.ip_address);
        continue;
      }
      const key = e.user_id;
      const b = userBuckets.get(key) || {
        key,
        user_id: e.user_id,
        requests: 0,
        total_tokens: 0,
        total_cost_usd: 0,
        avg_cost_usd: 0,
        last_seen: 0,
        first_seen: 0,
        anonymous_count: 0,
        durations: [],
        total_duration_ms: 0,
        total_completion_tokens: 0,
        model_calls: new Map<string, number>(),
      };
      b.requests += 1;
      b.total_tokens += tokens;
      b.total_cost_usd += cost;
      b.total_duration_ms += dur;
      b.total_completion_tokens += completionTokens;
      b.durations.push(dur);
      for (const call of e.api_calls) {
        b.model_calls.set(call.model, (b.model_calls.get(call.model) || 0) + 1);
      }
      if (e.timestamp > b.last_seen) b.last_seen = e.timestamp;
      if (b.first_seen === 0 || e.timestamp < b.first_seen) b.first_seen = e.timestamp;
      userBuckets.set(key, b);
    }

    // Resolve user identities
    const userIds = Array.from(userBuckets.keys());
    const userInfo = new Map<string, { email: string; name: string | null; role: string | null }>();
    if (userIds.length > 0) {
      try {
        const userRows = await db.select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          role: users.role,
        }).from(users).where(inArray(users.id, userIds));
        for (const u of userRows) {
          const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
          userInfo.set(u.id, {
            email: u.email,
            name: fullName || null,
            role: u.role,
          });
        }
      } catch (err: any) {
        console.error(`❌ [UsageTracking] Failed to resolve user identities:`, err?.message);
      }
    }

    const rowsOut = Array.from(userBuckets.values()).map(b => {
      const info = userInfo.get(b.key);
      const sortedDur = b.durations.slice().sort((a, b) => a - b);
      const p95Latency = percentile(sortedDur, 0.95);
      const avgLatency = b.requests > 0 ? b.total_duration_ms / b.requests : 0;
      const tokensPerSec = b.total_duration_ms > 0
        ? (b.total_completion_tokens / b.total_duration_ms) * 1000
        : 0;
      let topModel: string | null = null;
      let topModelCalls = 0;
      for (const [m, c] of b.model_calls) {
        if (c > topModelCalls) { topModel = m; topModelCalls = c; }
      }
      return {
        user_id: b.user_id,
        email: info?.email ?? null,
        name: info?.name ?? null,
        role: info?.role ?? null,
        is_anonymous: false,
        requests: b.requests,
        total_tokens: b.total_tokens,
        total_cost_usd: b.total_cost_usd,
        avg_cost_usd: b.requests > 0 ? b.total_cost_usd / b.requests : 0,
        avg_latency_ms: Math.round(avgLatency),
        p95_latency_ms: Math.round(p95Latency),
        throughput_tps: Math.round(tokensPerSec * 10) / 10,
        top_model: topModel,
        last_seen: b.last_seen,
        first_seen: b.first_seen,
      };
    });

    if (anonRequests > 0) {
      const sortedAnon = anonDurations.slice().sort((a, b) => a - b);
      let topAnonModel: string | null = null;
      let topAnonCalls = 0;
      for (const [m, c] of anonModelCalls) {
        if (c > topAnonCalls) { topAnonModel = m; topAnonCalls = c; }
      }
      rowsOut.push({
        user_id: null,
        email: null,
        name: `Anonymous (${anonIps.size} unique IPs)`,
        role: null,
        is_anonymous: true,
        requests: anonRequests,
        total_tokens: anonTokens,
        total_cost_usd: anonCost,
        avg_cost_usd: anonRequests > 0 ? anonCost / anonRequests : 0,
        avg_latency_ms: anonRequests > 0 ? Math.round(anonTotalDuration / anonRequests) : 0,
        p95_latency_ms: Math.round(percentile(sortedAnon, 0.95)),
        throughput_tps: anonTotalDuration > 0
          ? Math.round((anonCompletionTokens / anonTotalDuration) * 1000 * 10) / 10
          : 0,
        top_model: topAnonModel,
        last_seen: anonLastSeen,
        first_seen: anonFirstSeen,
      });
    }

    rowsOut.sort((a, b) => b.total_cost_usd - a.total_cost_usd);

    const totals = rowsOut.reduce(
      (acc, r) => {
        acc.requests += r.requests;
        acc.total_tokens += r.total_tokens;
        acc.total_cost_usd += r.total_cost_usd;
        return acc;
      },
      { requests: 0, total_tokens: 0, total_cost_usd: 0 },
    );

    return {
      month,
      month_label: rangeLabel,
      range_start: rangeStart ? rangeStart.toISOString() : null,
      range_end: rangeEnd ? rangeEnd.toISOString() : null,
      filters: filters || null,
      users: rowsOut,
      totals,
      authenticated_users: rowsOut.filter(r => !r.is_anonymous).length,
    };
  } catch (err: any) {
    console.error(`❌ [UsageTracking] Failed to compute by-user stats:`, err?.message);
    return {
      month,
      month_label: '',
      range_start: null,
      range_end: null,
      filters: filters || null,
      users: [],
      totals: { requests: 0, total_tokens: 0, total_cost_usd: 0 },
      authenticated_users: 0,
    };
  }
}

export async function getUsageDaily(days: number = 30) {
  try {
    const safeDays = Math.max(1, Math.min(days, 365));
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(today);
    start.setDate(start.getDate() - (safeDays - 1));

    const rows = await db.select().from(hybridSearchUsage)
      .where(gte(hybridSearchUsage.createdAt, start))
      .orderBy(desc(hybridSearchUsage.createdAt));

    const entries = rows.map(dbRowToRequestUsage);

    type Day = {
      date: string;
      requests: number;
      total_tokens: number;
      total_cost_usd: number;
      users: Set<string>;
    };
    const buckets = new Map<string, Day>();

    // Pre-fill all days in the window so the chart has continuous data
    for (let i = 0; i < safeDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      buckets.set(key, { date: key, requests: 0, total_tokens: 0, total_cost_usd: 0, users: new Set() });
    }

    for (const e of entries) {
      const d = new Date(e.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.requests += 1;
      bucket.total_tokens += e.total_tokens.total_tokens || 0;
      bucket.total_cost_usd += e.total_cost_usd || 0;
      if (e.user_id) bucket.users.add(e.user_id);
    }

    const series = Array.from(buckets.values())
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map(b => ({
        date: b.date,
        requests: b.requests,
        total_tokens: b.total_tokens,
        total_cost_usd: b.total_cost_usd,
        unique_users: b.users.size,
      }));

    return {
      days: safeDays,
      start: start.toISOString(),
      end: now.toISOString(),
      series,
    };
  } catch (err: any) {
    console.error(`❌ [UsageTracking] Failed to compute daily series:`, err?.message);
    return { days, start: null, end: null, series: [] };
  }
}

export type UsageSeriesRange = 'day' | 'week' | 'month' | 'year';

export async function getUsageSeries(range: UsageSeriesRange = 'month') {
  try {
    const now = new Date();
    let start: Date;
    let bucketSize: 'hour' | 'day' | 'month';
    let bucketCount: number;

    if (range === 'day') {
      bucketSize = 'hour';
      bucketCount = 24;
      start = new Date(now);
      start.setMinutes(0, 0, 0);
      start.setHours(start.getHours() - (bucketCount - 1));
    } else if (range === 'week') {
      bucketSize = 'day';
      bucketCount = 7;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (bucketCount - 1));
    } else if (range === 'year') {
      bucketSize = 'month';
      bucketCount = 12;
      start = new Date(now.getFullYear(), now.getMonth() - (bucketCount - 1), 1);
    } else {
      bucketSize = 'day';
      bucketCount = 30;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (bucketCount - 1));
    }

    const rows = await db.select().from(hybridSearchUsage)
      .where(gte(hybridSearchUsage.createdAt, start))
      .orderBy(desc(hybridSearchUsage.createdAt));
    const entries = rows.map(dbRowToRequestUsage);

    const keyForDate = (d: Date): string => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      if (bucketSize === 'month') return `${yyyy}-${mm}`;
      const dd = String(d.getDate()).padStart(2, '0');
      if (bucketSize === 'day') return `${yyyy}-${mm}-${dd}`;
      const hh = String(d.getHours()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}T${hh}`;
    };

    type Bucket = { key: string; requests: number; total_tokens: number; total_cost_usd: number; users: Set<string> };
    const buckets = new Map<string, Bucket>();

    for (let i = 0; i < bucketCount; i++) {
      const d = new Date(start);
      if (bucketSize === 'hour') d.setHours(d.getHours() + i);
      else if (bucketSize === 'day') d.setDate(d.getDate() + i);
      else d.setMonth(d.getMonth() + i);
      const key = keyForDate(d);
      buckets.set(key, { key, requests: 0, total_tokens: 0, total_cost_usd: 0, users: new Set() });
    }

    for (const e of entries) {
      const d = new Date(e.timestamp);
      const key = keyForDate(d);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.requests += 1;
      bucket.total_tokens += e.total_tokens.total_tokens || 0;
      bucket.total_cost_usd += e.total_cost_usd || 0;
      if (e.user_id) bucket.users.add(e.user_id);
    }

    const series = Array.from(buckets.values())
      .sort((a, b) => (a.key < b.key ? -1 : 1))
      .map(b => ({
        key: b.key,
        requests: b.requests,
        total_tokens: b.total_tokens,
        total_cost_usd: b.total_cost_usd,
        unique_users: b.users.size,
      }));

    const totals = series.reduce(
      (acc, b) => {
        acc.requests += b.requests;
        acc.total_tokens += b.total_tokens;
        acc.total_cost_usd += b.total_cost_usd;
        return acc;
      },
      { requests: 0, total_tokens: 0, total_cost_usd: 0 },
    );

    // Per-user aggregation for the same window (authenticated users only,
    // anonymous lumped under a single bucket).
    type UserAgg = { user_id: string; requests: number; total_tokens: number; total_cost_usd: number };
    const userAgg = new Map<string, UserAgg>();
    for (const e of entries) {
      if (!e.user_id) continue;
      const u = userAgg.get(e.user_id) || { user_id: e.user_id, requests: 0, total_tokens: 0, total_cost_usd: 0 };
      u.requests += 1;
      u.total_tokens += e.total_tokens.total_tokens || 0;
      u.total_cost_usd += e.total_cost_usd || 0;
      userAgg.set(e.user_id, u);
    }
    const userIdList = Array.from(userAgg.keys());
    const userInfo = new Map<string, { email: string; name: string | null }>();
    if (userIdList.length > 0) {
      try {
        const userRows = await db.select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        }).from(users).where(inArray(users.id, userIdList));
        for (const u of userRows) {
          const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
          userInfo.set(u.id, { email: u.email, name: fullName || null });
        }
      } catch (err: any) {
        console.error(`❌ [UsageTracking] Failed to resolve user identities for series:`, err?.message);
      }
    }
    const top_users = Array.from(userAgg.values())
      .map(u => {
        const info = userInfo.get(u.user_id);
        return {
          user_id: u.user_id,
          email: info?.email ?? null,
          name: info?.name ?? null,
          is_anonymous: false,
          requests: u.requests,
          total_tokens: u.total_tokens,
          total_cost_usd: u.total_cost_usd,
        };
      })
      .sort((a, b) => b.total_cost_usd - a.total_cost_usd)
      .slice(0, 10);

    // By-model aggregation for the same window
    const byModel = new Map<string, { calls: number; tokens: number; cost_usd: number }>();
    for (const e of entries) {
      for (const call of e.api_calls) {
        const cur = byModel.get(call.model) || { calls: 0, tokens: 0, cost_usd: 0 };
        cur.calls += 1;
        cur.tokens += call.tokens.total_tokens || 0;
        cur.cost_usd += call.cost_usd ?? computeCallCost(call);
        byModel.set(call.model, cur);
      }
    }
    const by_model = Object.fromEntries(byModel);

    return {
      range,
      bucket: bucketSize,
      start: start.toISOString(),
      end: now.toISOString(),
      series,
      totals,
      top_users,
      by_model,
    };
  } catch (err: any) {
    console.error(`❌ [UsageTracking] Failed to compute usage series:`, err?.message);
    return {
      range,
      bucket: 'day',
      start: null,
      end: null,
      series: [],
      totals: { requests: 0, total_tokens: 0, total_cost_usd: 0 },
      top_users: [],
      by_model: {},
    };
  }
}

// ============================================================
// Per-User Analytics — read-only helpers used by the Per-User
// Analytics drill-down view. Pure aggregations over hybrid_search_usage.
// ============================================================

export type TimeRange = 'hour' | 'day' | 'week' | 'month' | 'all' | 'custom';

export interface UserAnalyticsFilters {
  range?: TimeRange;
  from?: string;
  to?: string;
  model?: string;
  searchMode?: string;
}

function resolveTimeRange(opts: UserAnalyticsFilters): { start: Date | null; end: Date | null } {
  const now = new Date();
  const r = opts.range || 'month';
  if (r === 'custom') {
    const start = opts.from ? new Date(opts.from) : null;
    const end = opts.to ? new Date(opts.to) : null;
    return { start: isNaN(start as any) ? null : start, end: isNaN(end as any) ? null : end };
  }
  if (r === 'all') return { start: null, end: null };
  let start: Date;
  if (r === 'hour') start = new Date(now.getTime() - 60 * 60 * 1000);
  else if (r === 'day') start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  else if (r === 'week') start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  else start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start, end: now };
}

function entryMatchesFilters(e: RequestUsage, opts: UserAnalyticsFilters): boolean {
  if (opts.searchMode && opts.searchMode !== 'all' && e.search_mode !== opts.searchMode) return false;
  if (opts.model && opts.model !== 'all') {
    const hasModel = e.api_calls.some(c => c.model === opts.model);
    if (!hasModel) return false;
  }
  return true;
}

async function loadFilteredEntries(opts: UserAnalyticsFilters & { userId?: string | null }): Promise<RequestUsage[]> {
  const range = resolveTimeRange(opts);
  const conditions: any[] = [];
  if (range.start) conditions.push(gte(hybridSearchUsage.createdAt, range.start));
  if (range.end) conditions.push(lt(hybridSearchUsage.createdAt, range.end));
  if (opts.userId === '__anon__') {
    conditions.push(sql`${hybridSearchUsage.userId} IS NULL`);
  } else if (opts.userId) {
    conditions.push(eq(hybridSearchUsage.userId, opts.userId));
  }
  if (opts.searchMode && opts.searchMode !== 'all') {
    conditions.push(eq(hybridSearchUsage.searchMode, opts.searchMode));
  }
  const base = db.select().from(hybridSearchUsage);
  const rows = conditions.length
    ? await base.where(and(...conditions)).orderBy(desc(hybridSearchUsage.createdAt))
    : await base.orderBy(desc(hybridSearchUsage.createdAt));
  const entries = rows.map(dbRowToRequestUsage);
  return entries.filter(e => entryMatchesFilters(e, opts));
}

async function resolveUserInfo(userId: string): Promise<{ id: string; email: string | null; name: string | null; role: string | null } | null> {
  try {
    const rows = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
    }).from(users).where(eq(users.id, userId)).limit(1);
    if (!rows.length) return null;
    const u = rows[0];
    const fullName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    return { id: u.id, email: u.email, name: fullName || null, role: u.role };
  } catch {
    return null;
  }
}

export async function getUserSummary(userId: string, opts: UserAnalyticsFilters = {}) {
  try {
    const isAnon = userId === '__anon__';
    const entries = await loadFilteredEntries({ ...opts, userId });
    const user = isAnon ? null : await resolveUserInfo(userId);

    let totalTokens = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCost = 0;
    let totalDuration = 0;
    const durations: number[] = [];
    const byModel = new Map<string, { calls: number; tokens: number; cost_usd: number }>();
    const byMode = new Map<string, number>();
    const byIntent = new Map<string, number>();
    let firstSeen = 0;
    let lastSeen = 0;

    for (const e of entries) {
      totalTokens += e.total_tokens.total_tokens || 0;
      totalPromptTokens += e.total_tokens.prompt_tokens || 0;
      totalCompletionTokens += e.total_tokens.completion_tokens || 0;
      totalCost += e.total_cost_usd || 0;
      totalDuration += e.total_duration_ms || 0;
      durations.push(e.total_duration_ms || 0);
      if (firstSeen === 0 || e.timestamp < firstSeen) firstSeen = e.timestamp;
      if (e.timestamp > lastSeen) lastSeen = e.timestamp;
      byMode.set(e.search_mode || 'unknown', (byMode.get(e.search_mode || 'unknown') || 0) + 1);
      if (e.classification_intent) {
        byIntent.set(e.classification_intent, (byIntent.get(e.classification_intent) || 0) + 1);
      }
      for (const call of e.api_calls) {
        const key = call.service === 'web_search_tool' ? 'web_search_preview' : call.model;
        const cur = byModel.get(key) || { calls: 0, tokens: 0, cost_usd: 0 };
        cur.calls += 1;
        cur.tokens += call.tokens.total_tokens || 0;
        cur.cost_usd += call.cost_usd ?? computeCallCost(call);
        byModel.set(key, cur);
      }
    }

    const sortedDur = durations.slice().sort((a, b) => a - b);
    const requests = entries.length;
    const avgLatency = requests > 0 ? totalDuration / requests : 0;
    const p95 = percentile(sortedDur, 0.95);
    const throughput = totalDuration > 0 ? (totalCompletionTokens / totalDuration) * 1000 : 0;

    const totalModelCost = Array.from(byModel.values()).reduce((a, m) => a + m.cost_usd, 0);
    const byModelOut = Array.from(byModel.entries())
      .map(([model, m]) => ({
        model,
        calls: m.calls,
        tokens: m.tokens,
        cost_usd: m.cost_usd,
        share_pct: totalModelCost > 0 ? (m.cost_usd / totalModelCost) * 100 : 0,
      }))
      .sort((a, b) => b.cost_usd - a.cost_usd);

    // Derive top country/city from entries
    const countryCounts = new Map<string, number>();
    const cityCounts = new Map<string, number>();
    for (const e of entries) {
      if (e.country) countryCounts.set(e.country, (countryCounts.get(e.country) || 0) + 1);
      if (e.city) cityCounts.set(e.city, (cityCounts.get(e.city) || 0) + 1);
    }
    let topCountry: string | null = null;
    let topCountryCount = 0;
    for (const [c, n] of countryCounts) {
      if (n > topCountryCount) { topCountry = c; topCountryCount = n; }
    }
    let topCity: string | null = null;
    let topCityCount = 0;
    for (const [c, n] of cityCounts) {
      if (n > topCityCount) { topCity = c; topCityCount = n; }
    }

    return {
      user: isAnon
        ? { id: '__anon__', email: null, name: 'Anonymous', role: null, is_anonymous: true }
        : user
          ? { ...user, is_anonymous: false }
          : { id: userId, email: null, name: null, role: null, is_anonymous: false },
      filters: opts,
      summary: {
        requests,
        total_tokens: totalTokens,
        total_prompt_tokens: totalPromptTokens,
        total_completion_tokens: totalCompletionTokens,
        total_cost_usd: totalCost,
        avg_cost_per_prompt: requests > 0 ? totalCost / requests : 0,
        avg_latency_ms: Math.round(avgLatency),
        p95_latency_ms: Math.round(p95),
        throughput_tps: Math.round(throughput * 10) / 10,
        first_seen: firstSeen,
        last_seen: lastSeen,
        top_country: topCountry,
        top_city: topCity,
      },
      by_model: byModelOut,
      by_mode: Object.fromEntries(byMode),
      by_intent: Object.fromEntries(byIntent),
    };
  } catch (err: any) {
    console.error(`❌ [UsageTracking] getUserSummary failed:`, err?.message);
    return { user: null, filters: opts, summary: null, by_model: [], by_mode: {}, by_intent: {} };
  }
}

export async function getUserTimeseries(userId: string, opts: UserAnalyticsFilters = {}) {
  try {
    const entries = await loadFilteredEntries({ ...opts, userId });
    const range = resolveTimeRange(opts);
    const effectiveRange = opts.range || 'month';

    let bucketSize: 'hour' | 'day' | 'month';
    if (effectiveRange === 'hour' || effectiveRange === 'day') bucketSize = 'hour';
    else if (effectiveRange === 'week' || effectiveRange === 'month' || effectiveRange === 'custom') bucketSize = 'day';
    else bucketSize = 'month';

    const keyForDate = (d: Date): string => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      if (bucketSize === 'month') return `${yyyy}-${mm}`;
      const dd = String(d.getDate()).padStart(2, '0');
      if (bucketSize === 'day') return `${yyyy}-${mm}-${dd}`;
      const hh = String(d.getHours()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}T${hh}`;
    };

    type Bucket = { key: string; requests: number; total_tokens: number; total_cost_usd: number; total_duration_ms: number };
    const buckets = new Map<string, Bucket>();

    // Pre-fill the buckets in the range when start/end are known.
    if (range.start && range.end) {
      const cur = new Date(range.start);
      while (cur <= range.end) {
        const k = keyForDate(cur);
        if (!buckets.has(k)) buckets.set(k, { key: k, requests: 0, total_tokens: 0, total_cost_usd: 0, total_duration_ms: 0 });
        if (bucketSize === 'hour') cur.setHours(cur.getHours() + 1);
        else if (bucketSize === 'day') cur.setDate(cur.getDate() + 1);
        else cur.setMonth(cur.getMonth() + 1);
      }
    }

    for (const e of entries) {
      const k = keyForDate(new Date(e.timestamp));
      const b = buckets.get(k) || { key: k, requests: 0, total_tokens: 0, total_cost_usd: 0, total_duration_ms: 0 };
      b.requests += 1;
      b.total_tokens += e.total_tokens.total_tokens || 0;
      b.total_cost_usd += e.total_cost_usd || 0;
      b.total_duration_ms += e.total_duration_ms || 0;
      buckets.set(k, b);
    }

    const series = Array.from(buckets.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
    return { bucket: bucketSize, range: effectiveRange, series };
  } catch (err: any) {
    console.error(`❌ [UsageTracking] getUserTimeseries failed:`, err?.message);
    return { bucket: 'day', range: opts.range || 'month', series: [] };
  }
}

export async function getUserPrompts(
  userId: string,
  opts: UserAnalyticsFilters & { page?: number; pageSize?: number } = {},
) {
  try {
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.max(1, Math.min(200, opts.pageSize || 25));
    const entries = await loadFilteredEntries({ ...opts, userId });
    const total = entries.length;
    const sliced = entries.slice((page - 1) * pageSize, page * pageSize);
    const prompts = sliced.map(e => {
      const completion = e.total_tokens.completion_tokens || 0;
      const dur = e.total_duration_ms || 0;
      const modelsUsed = Array.from(new Set(e.api_calls.map(c => c.model)));
      return {
        request_id: e.request_id,
        timestamp: e.timestamp,
        query: e.query,
        models: modelsUsed,
        primary_model: modelsUsed[0] || null,
        total_tokens: e.total_tokens.total_tokens || 0,
        prompt_tokens: e.total_tokens.prompt_tokens || 0,
        completion_tokens: completion,
        duration_ms: dur,
        throughput_tps: dur > 0 ? Math.round((completion / dur) * 1000 * 10) / 10 : 0,
        cost_usd: e.total_cost_usd || 0,
        search_mode: e.search_mode,
        intent: e.classification_intent || null,
        products_found: e.products_found,
      };
    });
    return { total, page, pageSize, prompts };
  } catch (err: any) {
    console.error(`❌ [UsageTracking] getUserPrompts failed:`, err?.message);
    return { total: 0, page: 1, pageSize: 25, prompts: [] };
  }
}

function csvEscape(v: any): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function getByUserCsv(opts: UserAnalyticsFilters = {}): Promise<string> {
  try {
    const range = resolveTimeRange(opts);
    const conditions: any[] = [];
    if (range.start) conditions.push(gte(hybridSearchUsage.createdAt, range.start));
    if (range.end) conditions.push(lt(hybridSearchUsage.createdAt, range.end));
    if (opts.searchMode && opts.searchMode !== 'all') {
      conditions.push(eq(hybridSearchUsage.searchMode, opts.searchMode));
    }
    const base = db.select().from(hybridSearchUsage);
    const rows = conditions.length
      ? await base.where(and(...conditions)).orderBy(desc(hybridSearchUsage.createdAt))
      : await base.orderBy(desc(hybridSearchUsage.createdAt));
    let entries = rows.map(dbRowToRequestUsage);
    entries = entries.filter(e => entryMatchesFilters(e, opts));

    // Aggregate per user
    type Agg = {
      user_id: string | null;
      requests: number;
      total_tokens: number;
      completion_tokens: number;
      total_cost: number;
      total_duration: number;
      durations: number[];
      model_calls: Map<string, number>;
      last_seen: number;
    };
    const byUser = new Map<string, Agg>();
    for (const e of entries) {
      const key = e.user_id || '__anon__';
      const a: Agg = byUser.get(key) || {
        user_id: e.user_id ?? null,
        requests: 0,
        total_tokens: 0,
        completion_tokens: 0,
        total_cost: 0,
        total_duration: 0,
        durations: [] as number[],
        model_calls: new Map<string, number>(),
        last_seen: 0,
      };
      a.requests += 1;
      a.total_tokens += e.total_tokens.total_tokens || 0;
      a.completion_tokens += e.total_tokens.completion_tokens || 0;
      a.total_cost += e.total_cost_usd || 0;
      a.total_duration += e.total_duration_ms || 0;
      a.durations.push(e.total_duration_ms || 0);
      for (const c of e.api_calls) a.model_calls.set(c.model, (a.model_calls.get(c.model) || 0) + 1);
      if (e.timestamp > a.last_seen) a.last_seen = e.timestamp;
      byUser.set(key, a);
    }

    const userIds = Array.from(byUser.keys()).filter(k => k !== '__anon__');
    const info = new Map<string, { email: string; name: string | null }>();
    if (userIds.length) {
      try {
        const ur = await db.select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
          .from(users).where(inArray(users.id, userIds));
        for (const u of ur) {
          const n = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
          info.set(u.id, { email: u.email, name: n || null });
        }
      } catch { /* ignore */ }
    }

    const header = [
      'user_id', 'email', 'name', 'requests', 'total_tokens', 'total_cost_usd',
      'avg_cost_per_prompt', 'avg_latency_ms', 'p95_latency_ms', 'throughput_tps',
      'top_model', 'last_seen',
    ];
    const lines = [header.join(',')];
    const sorted = Array.from(byUser.entries()).sort((a, b) => b[1].total_cost - a[1].total_cost);
    for (const [key, a] of sorted) {
      const i = a.user_id ? info.get(a.user_id) : undefined;
      const sortedDur = a.durations.slice().sort((x, y) => x - y);
      let topModel = '';
      let topCalls = 0;
      for (const [m, c] of a.model_calls) if (c > topCalls) { topModel = m; topCalls = c; }
      const row = [
        a.user_id ?? '',
        i?.email ?? (a.user_id ? '' : 'anonymous'),
        i?.name ?? '',
        a.requests,
        a.total_tokens,
        a.total_cost.toFixed(6),
        (a.requests > 0 ? a.total_cost / a.requests : 0).toFixed(6),
        Math.round(a.requests > 0 ? a.total_duration / a.requests : 0),
        Math.round(percentile(sortedDur, 0.95)),
        a.total_duration > 0 ? (Math.round((a.completion_tokens / a.total_duration) * 1000 * 10) / 10) : 0,
        topModel,
        a.last_seen ? new Date(a.last_seen).toISOString() : '',
      ];
      lines.push(row.map(csvEscape).join(','));
    }
    return lines.join('\n');
  } catch (err: any) {
    console.error(`❌ [UsageTracking] getByUserCsv failed:`, err?.message);
    return 'error\n' + csvEscape(err?.message || 'unknown');
  }
}

export async function getKnownModels(): Promise<string[]> {
  try {
    const rows = await db.select().from(hybridSearchUsage)
      .orderBy(desc(hybridSearchUsage.createdAt))
      .limit(500);
    const models = new Set<string>();
    for (const r of rows) {
      const calls = (r.apiCalls || []) as ApiCall[];
      for (const c of calls) if (c.model) models.add(c.model);
    }
    return Array.from(models).sort();
  } catch {
    return [];
  }
}

export async function getGeoStats(): Promise<Array<{ country: string; city: string; count: number }>> {
  try {
    const rows = await db
      .select({
        country: hybridSearchUsage.country,
        city: hybridSearchUsage.city,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(hybridSearchUsage)
      .groupBy(hybridSearchUsage.country, hybridSearchUsage.city)
      .orderBy(desc(sql`count(*)`));

    return rows
      .filter(r => r.country || r.city)
      .map(r => ({
        country: (r.country || '').trim(),
        city: (r.city || '').trim(),
        count: r.count,
      }));
  } catch (err: any) {
    console.error('[UsageTracking] getGeoStats failed:', err?.message);
    return [];
  }
}
