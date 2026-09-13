import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../../db';
import { aiChatSessions, aiChatSessionMessages } from '@shared/schema';
import { extractToken, verifyAuthToken } from '../../../auth-middleware';
import {
  initializeStream,
  writeStatus,
  writeEvent,
  writeProductCard,
  writeResult,
  writeChatSummary,
  writeMessagePlaceholder,
  startHeartbeat,
  endStream,
  streamTokenString,
} from '../connections/streaming';
import {
  executeHybridSearch,
  executeWebOnlySearch,
  executeDatabaseOnlySearch,
  DEFAULT_CONFIG,
} from './hybrid-engine';
import { executeDatabaseFallback } from '../connections/database-search';
import { classifyQuery, type QueryClassification, DEFAULT_CLASSIFICATION } from '../agents/query-classifier';
import { getExpertPersonaName } from '../agents/expert-personas';
import { discoverManufacturers, detectDomainHeuristic, type ManufacturerDiscoveryResult, DEFAULT_MANUFACTURER_RESULT } from '../agents/manufacturer-discovery';

const PRODUCT_KEYWORDS = new Set([
  'motor', 'servo', 'gear', 'gearbox', 'sensor', 'actuator', 'bearing', 'plc',
  'gpu', 'cpu', 'ram', 'ssd', 'monitor', 'keyboard', 'mouse', 'headphone',
  'brake', 'suspension', 'exhaust', 'transmission', 'engine',
  'robot', 'chassis', 'microcontroller', 'arduino', 'raspberry',
  'component', 'part', 'product', 'equipment', 'tool', 'machine',
  'pump', 'valve', 'compressor', 'converter', 'transformer', 'relay',
  'cable', 'connector', 'adapter', 'battery', 'charger', 'power supply',
  'printer', '3d printer', 'cnc', 'laser', 'drill', 'screw', 'bolt', 'nut',
  'led', 'display', 'screen', 'camera', 'lens', 'switch', 'router',
  'industrial', 'automotive', 'electronic', 'mechanical', 'pneumatic', 'hydraulic',
  'specification', 'datasheet', 'technical', 'torque', 'voltage', 'watt',
  'find me', 'search for', 'looking for', 'i need', 'recommend',
  'compare', 'vs', 'versus', 'difference between',
  'material', 'steel', 'aluminum', 'alloy', 'stainless', 'carbon', 'titanium', 'brass', 'copper',
  'tolerance', 'diameter', 'shaft', 'rod', 'bar', 'tube', 'pipe', 'plate', 'sheet', 'flange',
  'hardness', 'tensile', 'yield', 'strength', 'density', 'weight',
  'raw material', 'stock', 'blank', 'billet', 'forging', 'casting',
  'spring', 'gasket', 'seal', 'o-ring', 'washer', 'spacer', 'bushing', 'coupling',
  'linear', 'rotary', 'encoder', 'driver', 'controller', 'inverter', 'regulator',
  'belt', 'chain', 'sprocket', 'pulley', 'wheel', 'rail', 'guide', 'slide',
  'weld', 'solder', 'adhesive', 'coating', 'finish', 'treatment',
  'build', 'assemble', 'size', 'calculate', 'design', 'select',
  'mm', 'inch', 'kg', 'kn', 'rpm', 'psi', 'bar', 'mpa',
  'iso', 'din', 'ansi', 'astm', 'aisi', 'en',
  'h6', 'h7', 'h8', 'h9', 'h10', 'h11', 'js7', 'k6', 'f7', 'g6',
  '42crmo4', '4140', '1045', '304', '316', '316l', '4340', 'c45',
]);

function detectOffTopicFallback(query: string): boolean {
  const lower = query.toLowerCase().trim();
  if (lower.length < 3) return true;
  const greetings = ['hello', 'hi', 'hey', 'thanks', 'thank you', 'bye', 'goodbye', 'what can you do'];
  if (greetings.some(g => lower === g || lower.startsWith(g + ' ') || lower.startsWith(g + ','))) return true;
  for (const keyword of PRODUCT_KEYWORDS) {
    if (lower.includes(keyword)) return false;
  }
  return true;
}

// Returns true when the query looks like a sizing / calculation request even
// without a successful classifier run.  Used as a fallback when classifyQuery
// times out so we can still activate size_then_search mode.
function detectSizingHeuristic(query: string): boolean {
  const q = query.toLowerCase();
  // Number followed by an engineering unit (e.g. "300Nm", "50 kW", "1000 rpm")
  const hasPhysicalValue = /\d+\s*(nm|n·m|kw|w\b|kg|g\b|kn|n\b|rpm|bar|psi|mpa|l\/min|lpm|m\/s|km\/h|mm\b|cm\b|m\b|a\b|v\b|hz|°c)/i.test(query);
  // Explicit sizing / calculation verbs
  const hasSizingVerb = /\b(calcul(ate|ation)|comput(e|ation)|size\b|sizing|determin(e|ation)|derive|what\s+(power|torque|force|load|diameter|speed|flow|pressure|current|rating))\b/.test(q);
  // "withstand / sustain / support / carry / handle / transmit" a load
  const hasWithstandVerb = /\b(withstand|sustain|support\s+(\d|the)|carry|handle|transmit|resist|rated\s+for|capable\s+of|suitable\s+for)\b/.test(q);
  return hasSizingVerb || hasPhysicalValue || hasWithstandVerb;
}

import { OpenAI } from 'openai';
import adminSettingsRouter from '../agents/admin/settings-routes';
import benchmarkRouter from '../agents/admin/benchmark-routes';
import { getAgentSettings } from '../agents/admin/settings-storage';
import { startTracking, trackApiCall, finishTracking, getUsageHistory, getUsageStats, getUsageByUser, getUsageDaily, getUsageSeries, getUserSummary, getUserTimeseries, getUserPrompts, getByUserCsv, getKnownModels, getGeoStats, type TimeRange, type UserAnalyticsFilters } from '../connections/usage-tracking';
import { requireAuth } from '../../../auth-middleware';

// Allowlist for the analytics endpoints below: any user with the
// platform `admin` role, plus the designated owner email. Anonymous
// requests are blocked by `requireAuth` upstream.
const ANALYTICS_OWNER_EMAILS = new Set<string>([
  'asalicunaj@gmail.com',
  'mikelkrasniqi@gmail.com',
]);

function requirePlatformAdmin(req: any, res: any, next: any) {
  const user = req.user;
  if (!user) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  const isPlatformAdmin = user.role === 'admin';
  const email = typeof user.email === 'string' ? user.email.toLowerCase() : '';
  const isOwnerEmail = !!email && ANALYTICS_OWNER_EMAILS.has(email);
  if (!isPlatformAdmin && !isOwnerEmail) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}


const router = Router();

router.use('/admin', requireAuth, requirePlatformAdmin, adminSettingsRouter);
router.use('/admin', requireAuth, requirePlatformAdmin, benchmarkRouter);

const LOADING_MESSAGES = [
  'Thinking...',
  'Searching manufacturer sites...',
  'Querying DeepFolder database...',
  'Analyzing technical specs...',
  'Verifying data...',
  'Summarizing results...',
];

router.post('/agent-search-stream', requireAuth, async (req, res) => {
  const ctx = initializeStream(res);
  const heartbeatId = startHeartbeat(ctx, LOADING_MESSAGES);

  // Placeholder message lifecycle state — initialized once we've validated session ownership.
  let placeholderMessageId: number | null = null;
  let placeholderResolved = false; // true once we've explicitly marked complete/failed
  // Validated session id (set after we confirm the request user owns the session).
  // The placeholder row is *not* created up-front — we insert standalone
  // requirements/BOM rows first so their auto-increment IDs sort *before* the
  // placeholder, preserving live-UI order (user → requirements → BOM → results)
  // when the chat is reopened from history.
  let ownedSessionId: number | null = null;

  // Accumulator for whatever the agent has produced so far. Used to persist
  // partial content on the placeholder row when the stream fails / disconnects,
  // so the user sees their partial answer (not a blank bubble) on refresh.
  const partialState: {
    tokenText: string;
    productCards: any[];
    chatSummary: string;
    decisionSummary: string;
    bestFit: string;
    alternativeSuggestion: string;
    searchGuidance: string;
    bomTable: any[] | null;
    bomSummary: string;
    engineeringNotes: string;
    comparisonTable: any | null;
    calculationSection: any | null;
    requirements: any[] | null;
    requirementsMode: string | undefined;
    expertName: string | undefined;
  } = {
    tokenText: '',
    productCards: [],
    chatSummary: '',
    decisionSummary: '',
    bestFit: '',
    alternativeSuggestion: '',
    searchGuidance: '',
    bomTable: null,
    bomSummary: '',
    engineeringNotes: '',
    comparisonTable: null,
    calculationSection: null,
    requirements: null,
    requirementsMode: undefined,
    expertName: undefined,
  };

  ctx.onCapture = (event) => {
    switch (event.type) {
      case 'token': {
        const delta = (event as any).delta;
        if (typeof delta === 'string') partialState.tokenText += delta;
        break;
      }
      case 'product_card':
        if ((event as any).data) partialState.productCards.push((event as any).data);
        break;
      case 'chat_summary':
        if (typeof (event as any).message === 'string') partialState.chatSummary = (event as any).message;
        break;
      case 'decision_summary':
        if (typeof (event as any).message === 'string') partialState.decisionSummary = (event as any).message;
        if ((event as any).bestFit) partialState.bestFit = (event as any).bestFit;
        if ((event as any).alternativeSuggestion) partialState.alternativeSuggestion = (event as any).alternativeSuggestion;
        if ((event as any).searchGuidance) partialState.searchGuidance = (event as any).searchGuidance;
        break;
      case 'bom_table':
        if (Array.isArray((event as any).data)) partialState.bomTable = (event as any).data;
        if ((event as any).bomSummary) partialState.bomSummary = (event as any).bomSummary;
        if ((event as any).engineeringNotes) partialState.engineeringNotes = (event as any).engineeringNotes;
        break;
      case 'comparison_table':
        if ((event as any).data) partialState.comparisonTable = (event as any).data;
        break;
      case 'calculation_section':
        if ((event as any).data) partialState.calculationSection = (event as any).data;
        break;
      case 'requirements':
        if (Array.isArray((event as any).data)) partialState.requirements = (event as any).data;
        if ((event as any).mode) partialState.requirementsMode = (event as any).mode;
        if ((event as any).expert_name) partialState.expertName = (event as any).expert_name;
        break;
    }
  };

  const buildPartialSearchResults = (): Record<string, any> => {
    const out: Record<string, any> = { companies: [] };
    if (partialState.productCards.length > 0) out.productCards = partialState.productCards;
    if (partialState.bestFit) out.bestFit = partialState.bestFit;
    if (partialState.alternativeSuggestion) out.alternativeSuggestion = partialState.alternativeSuggestion;
    if (partialState.searchGuidance) out.searchGuidance = partialState.searchGuidance;
    const recText = partialState.chatSummary || partialState.decisionSummary;
    if (recText) out.recommendation = recText;
    if (partialState.bomTable) {
      out.bomTable = partialState.bomTable;
      if (partialState.bomSummary) out.bomSummary = partialState.bomSummary;
      if (partialState.engineeringNotes) out.engineeringNotes = partialState.engineeringNotes;
    }
    if (partialState.comparisonTable) out.comparisonTable = partialState.comparisonTable;
    if (partialState.calculationSection) out.calculationSection = partialState.calculationSection;
    if (partialState.requirements) {
      out.requirements = partialState.requirements;
      if (partialState.requirementsMode) out.requirementsMode = partialState.requirementsMode;
      if (partialState.expertName) out.expertName = partialState.expertName;
    }
    return out;
  };

  // Lazily insert the streaming placeholder row + emit its id to the client.
  // Idempotent: subsequent calls are no-ops once the placeholder exists.
  const ensurePlaceholder = async (): Promise<void> => {
    if (placeholderMessageId !== null || !ownedSessionId) return;
    try {
      const [placeholder] = await db
        .insert(aiChatSessionMessages)
        .values({
          sessionId: ownedSessionId,
          content: '',
          isUser: false,
          status: 'streaming',
        })
        .returning({ id: aiChatSessionMessages.id });
      if (placeholder?.id) {
        placeholderMessageId = placeholder.id;
        writeMessagePlaceholder(ctx, placeholder.id);
      }
    } catch (err) {
      console.warn('[Placeholder] Failed to insert streaming placeholder:', (err as Error)?.message);
    }
  };

  const markPlaceholderFailed = async () => {
    if (!placeholderMessageId || placeholderResolved) return;
    placeholderResolved = true;
    try {
      const partialContent =
        partialState.chatSummary ||
        partialState.decisionSummary ||
        (partialState.tokenText.trim().length > 0 ? partialState.tokenText : '');
      await db.update(aiChatSessionMessages)
        .set({
          content: partialContent,
          searchResults: buildPartialSearchResults(),
          status: 'failed',
        })
        .where(eq(aiChatSessionMessages.id, placeholderMessageId));
    } catch (err) {
      console.warn('[Placeholder] Failed to mark message failed:', (err as Error)?.message);
    }
  };

  // Detect client disconnect → mark placeholder failed if we never resolved it.
  res.on('close', () => {
    if (placeholderMessageId && !placeholderResolved) {
      void markPlaceholderFailed();
    }
  });

  try {
    const { query, mode = 'hybrid', searchMode, chatHistory = [] } = req.body;

    if (!query || typeof query !== 'string') {
      writeEvent(ctx, { type: 'error', error: 'Query is required' });
      endStream(ctx);
      return;
    }

    if (!process.env.OPENAI_API_KEY && mode !== 'database') {
      writeEvent(ctx, { type: 'error', error: 'OPENAI_API_KEY not configured' });
      endStream(ctx);
      return;
    }

    let parsedHistory: { role: 'user' | 'assistant'; content: string }[] = (chatHistory || [])
      .filter((msg: any) => msg.role === 'user' || msg.role === 'assistant')
      .filter((msg: any) => msg.content && !msg.requirements)
      .map((msg: any) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }));

    // Resolve userId from the authenticated user set by requireAuth middleware.
    let userId = (req as any).session?.userId || null;
    if (!userId) {
      const token = extractToken(req as any);
      if (token) {
        const decoded = verifyAuthToken(token);
        if (decoded?.id) userId = decoded.id;
      }
    }

    // Validate session ownership up front, but defer the placeholder INSERT
    // until after we've persisted the requirements / BOM rows below. This keeps
    // the placeholder's auto-increment id strictly greater than those rows so
    // the recalled chat shows them in the original order.
    const requestSessionId = req.body?.sessionId ? parseInt(req.body.sessionId) : null;
    if (userId && requestSessionId && Number.isFinite(requestSessionId)) {
      try {
        const [ownedSession] = await db
          .select({ id: aiChatSessions.id })
          .from(aiChatSessions)
          .where(and(eq(aiChatSessions.id, requestSessionId), eq(aiChatSessions.userId, userId)))
          .limit(1);
        if (ownedSession) ownedSessionId = ownedSession.id;
      } catch (err) {
        console.warn('[Placeholder] Failed to validate session ownership:', (err as Error)?.message);
      }
    }

    // Fallback: if the client failed to send chatHistory but we have a known
    // session, hydrate the recent turns from the DB so the classifier can
    // still detect follow-up intent. The current user query is appended below.
    if (parsedHistory.length === 0 && ownedSessionId) {
      try {
        const dbMsgs = await db
          .select({ content: aiChatSessionMessages.content, isUser: aiChatSessionMessages.isUser })
          .from(aiChatSessionMessages)
          .where(eq(aiChatSessionMessages.sessionId, ownedSessionId))
          .orderBy(desc(aiChatSessionMessages.id))
          .limit(6);

        const hydrated = dbMsgs
          .reverse()
          .filter(m => m.content && m.content.trim())
          .map(m => ({
            role: (m.isUser ? 'user' : 'assistant') as 'user' | 'assistant',
            content: m.content,
          }));

        // Drop the trailing user message if it's identical to the current query
        // (it was just persisted by the client moments before this request).
        while (
          hydrated.length > 0 &&
          hydrated[hydrated.length - 1].role === 'user' &&
          hydrated[hydrated.length - 1].content.trim() === query.trim()
        ) {
          hydrated.pop();
        }

        if (hydrated.length > 0) {
          parsedHistory = hydrated;
          console.log(`📚 [HybridSearch] Hydrated ${hydrated.length} history msg(s) from session ${ownedSessionId} (client sent empty chatHistory)`);
        }
      } catch (err) {
        console.warn('[HybridSearch] Failed to hydrate session history:', (err as Error)?.message);
      }
    }

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const country = (req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || req.headers['x-country'] || '') as string;
    const city = (req.headers['x-vercel-ip-city'] || req.headers['x-city'] || '') as string;
    const region = (req.headers['x-vercel-ip-country-region'] || req.headers['x-region'] || '') as string;

    startTracking(ctx.requestId, {
      query,
      session_id: req.body.sessionId,
      user_id: userId,
      ip_address: ip,
      user_agent: userAgent,
      country,
      city,
      region,
      search_mode: mode,
    });

    console.log(`🚀 [HybridSearch] Starting ${mode} search for:`, query, `with ${parsedHistory.length} history messages`);
    writeStatus(ctx, `Analyzing your request...`);

    let classification: QueryClassification | undefined;
    let manufacturerDiscovery: ManufacturerDiscoveryResult = { ...DEFAULT_MANUFACTURER_RESULT };
    const classifierStart = Date.now();

    const isProductLikelyNeeded = mode === 'hybrid' || mode === 'web';
    const heuristicDomain = detectDomainHeuristic(query);
    const heuristicPersona = getExpertPersonaName(heuristicDomain);

    // Pass the last 2 user messages as history context to discovery.
    // This is critical for follow-up queries (e.g., "search from Europe only")
    // where the current query alone has no product information.
    const recentUserHistory = parsedHistory.filter(m => m.role === 'user').slice(-2);

    const [classificationResult, discoveryResult] = await Promise.allSettled([
      classifyQuery(query, parsedHistory, 10000),
      isProductLikelyNeeded ? discoverManufacturers(query, heuristicDomain, undefined, heuristicPersona, recentUserHistory) : Promise.resolve(DEFAULT_MANUFACTURER_RESULT),
    ]);

    if (classificationResult.status === 'fulfilled') {
      classification = classificationResult.value;
      const classifierDuration = Date.now() - classifierStart;
      const usage = classification._usage;
      trackApiCall(ctx.requestId, {
        service: 'classifier',
        model: usage?.model ?? 'gpt-4o-mini',
        tokens: {
          prompt_tokens: usage?.prompt_tokens ?? 0,
          completion_tokens: usage?.completion_tokens ?? 0,
          total_tokens: usage?.total_tokens ?? 0,
        },
        duration_ms: usage?.duration_ms ?? classifierDuration,
        timestamp: Date.now(),
      });
      console.log(`🏷️ [Tracking] Classifier tracked: ${usage?.total_tokens ?? 0} tokens, ${usage?.duration_ms ?? classifierDuration}ms`);
      writeStatus(ctx, `Starting DeepSearch (${mode} mode)...`);
      // Emit a skeleton event so the client renders a blurred placeholder
      // requirements panel immediately — well before the agent run finishes
      // (30-50 s). Only for intents that produce a requirements table.
      const skeletonIntents = new Set(['product_search', 'calculation_search', 'build', 'comparison']);
      if (classification && skeletonIntents.has(classification.intent)) {
        writeEvent(ctx, { type: 'requirements_skeleton', mode: classification.intent === 'build' ? 'build' : 'search' } as any);
        console.log(`📋 [Requirements] Skeleton emitted for intent: ${classification.intent}`);
      }
    } else {
      const classifierDuration = Date.now() - classifierStart;
      trackApiCall(ctx.requestId, {
        service: 'classifier',
        model: 'gpt-4o-mini',
        tokens: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        duration_ms: classifierDuration,
        timestamp: Date.now(),
      });
      console.warn('⚠️ [HybridSearch] Classifier failed, proceeding without:', (classificationResult.reason as Error)?.message);
    }

    if (discoveryResult.status === 'fulfilled') {
      manufacturerDiscovery = discoveryResult.value;
      const mfgUsage = manufacturerDiscovery._usage;
      if (mfgUsage) {
        trackApiCall(ctx.requestId, {
          service: 'manufacturer_discovery',
          model: mfgUsage.model,
          tokens: {
            prompt_tokens: mfgUsage.prompt_tokens,
            completion_tokens: mfgUsage.completion_tokens,
            total_tokens: mfgUsage.total_tokens,
          },
          duration_ms: mfgUsage.duration_ms,
          timestamp: Date.now(),
        });
      }
    } else {
      console.warn('⚠️ [HybridSearch] Manufacturer discovery failed, proceeding without:', (discoveryResult.reason as Error)?.message);
    }

    // Re-run discovery with enriched_query for follow-up queries where the raw
    // query has no product context (e.g., "search from Europe only" after a
    // retaining ring search). Only re-run when:
    //   1. Intent is follow_up
    //   2. enriched_query meaningfully differs from the raw query (adds product context)
    //   3. The raw query is short (< 6 words) — strong signal it's a refinement
    //   4. The initial discovery returned no manufacturers (empty result = wrong context)
    const discoveryWasEmpty = manufacturerDiscovery.manufacturers.length === 0 && !manufacturerDiscovery.userOverride;
    if (
      isProductLikelyNeeded &&
      discoveryWasEmpty &&
      classification?.intent === 'follow_up' &&
      classification.enriched_query &&
      classification.enriched_query.toLowerCase() !== query.toLowerCase().trim() &&
      query.trim().split(/\s+/).length < 6
    ) {
      const enrichedDomain = detectDomainHeuristic(classification.enriched_query);
      const enrichedPersona = getExpertPersonaName(enrichedDomain);
      console.log(`🔄 [ManufacturerDiscovery] Re-running with enriched_query for follow-up: "${classification.enriched_query}"`);
      try {
        manufacturerDiscovery = await discoverManufacturers(
          classification.enriched_query,
          enrichedDomain,
          undefined,
          enrichedPersona,
          recentUserHistory
        );
        const mfgRetryUsage = manufacturerDiscovery._usage;
        if (mfgRetryUsage) {
          trackApiCall(ctx.requestId, {
            service: 'manufacturer_discovery',
            model: mfgRetryUsage.model,
            tokens: {
              prompt_tokens: mfgRetryUsage.prompt_tokens,
              completion_tokens: mfgRetryUsage.completion_tokens,
              total_tokens: mfgRetryUsage.total_tokens,
            },
            duration_ms: mfgRetryUsage.duration_ms,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        console.warn('⚠️ [ManufacturerDiscovery] Re-run failed, keeping original result:', (err as Error)?.message);
      }
    }

    if (searchMode === 'product_search' || searchMode === 'build') {
      if (!classification) {
        classification = {
          ...DEFAULT_CLASSIFICATION,
          enriched_query: query,
          classification_confidence: 1.0,
        };
      }
      console.log(`🔧 [SearchMode] User override: ${classification.intent} → ${searchMode}`);
      classification.intent = searchMode;
      if (searchMode === 'product_search') {
        const isEnum = classification.strategy.is_brand_enumeration === true;
        classification.strategy = {
          ...classification.strategy,
          needs_web_search: true,
          needs_product_cards: true,
          is_multi_product_set: false,
          suggested_product_count: isEnum
            ? Math.min(20, Math.max(12, classification.strategy.suggested_product_count || 12))
            : 5,
          response_tone: 'technical',
          needs_clarification: false,
        };
      } else {
        classification.strategy = {
          ...classification.strategy,
          needs_web_search: true,
          needs_product_cards: false,
          expects_detailed_analysis: true,
          is_multi_product_set: true,
          suggested_product_count: 8,
          response_tone: 'advisory',
          needs_clarification: false,
        };
      }
    }

    const userForcedMode = searchMode === 'product_search' || searchMode === 'build';
    const blockedIntents = ['off_topic'];
    const classifierTimedOut = classification && classification.classification_confidence === 0 && !classification._usage?.total_tokens;
    
    if (!userForcedMode && classification && !classifierTimedOut && !blockedIntents.includes(classification.intent) && classification.classification_confidence < 0.4) {
      try {
        const agentSettings = await getAgentSettings();
        if (agentSettings.topicRestrictionEnabled) {
          const isLikelyOffTopic = detectOffTopicFallback(query);
          if (isLikelyOffTopic) {
            console.log('🚫 [TopicRestriction] Low-confidence classifier + keyword fallback detected off-topic query:', query);
            classification.intent = 'off_topic' as any;
          }
        }
      } catch (e) {
        console.warn('⚠️ [TopicRestriction] Fallback check failed:', (e as Error).message);
      }
    }

    if (classifierTimedOut) {
      console.log('⚡ [TopicRestriction] Skipping topic restriction — classifier timed out, letting query through');
      // Keyword fallback: if the query looks like a sizing / calculation request
      // (physical values, sizing verbs, withstand-type words) treat it as
      // calculation_search / size_then_search so the response is structured
      // correctly and the Recalculate button works after the fact.
      if (classification && detectSizingHeuristic(query)) {
        classification.intent = 'calculation_search';
        classification.strategy = {
          ...classification.strategy,
          calculation_mode: 'size_then_search',
          needs_product_cards: true,
          needs_web_search: true,
        };
        console.log('🔢 [ClassifierTimeout] Heuristic detected sizing query → calculation_search / size_then_search');
      }
    }

    // Safety net: when user is in an established product-search conversation (4+ messages)
    // and types additional specs without any build trigger words, the classifier may
    // incorrectly assign "build" intent. Override back to product_search.
    // Guard: skip if user explicitly forced build mode via searchMode.
    if (!userForcedMode && classification && classification.intent === 'build' && parsedHistory.length >= 4) {
      const queryLower = query.toLowerCase();
      const buildTriggerWords = ['build', 'assemble', 'construct', 'make a', 'create a', 'design a',
        'put together', 'parts list', 'bill of materials', 'bom', 'what do i need to', 'components for', 'what parts'];
      const hasBuildKeyword = buildTriggerWords.some(kw => queryLower.includes(kw));
      if (!hasBuildKeyword) {
        console.log(`🔄 [BuildOverride] Overriding build→product_search: established conversation (${parsedHistory.length} msgs), no build keywords found in query`);
        classification.intent = 'product_search';
        // Normalize strategy fields to match product_search behavior
        classification.strategy.needs_product_cards = true;
        classification.strategy.is_multi_product_set = false;
        classification.strategy.needs_web_search = true;
        classification.strategy.suggested_product_count = 5;
        classification.strategy.expects_detailed_analysis = false;
        classification.strategy.response_tone = 'technical';
      }
    }

    const hasConversationContext = parsedHistory.length >= 2;
    if (!userForcedMode && !classifierTimedOut && classification && blockedIntents.includes(classification.intent) && hasConversationContext) {
      console.log(`🛡️ [TopicRestriction] Skipping topic restriction — in-conversation follow-up (${parsedHistory.length} history messages, classified as ${classification.intent})`);
    }
    if (!userForcedMode && !classifierTimedOut && classification && blockedIntents.includes(classification.intent) && !hasConversationContext) {
      try {
        const agentSettings = await getAgentSettings();
        if (agentSettings.topicRestrictionEnabled) {
          const allowedTopics = agentSettings.allowedTopics || [];
          if (!allowedTopics.includes(classification.intent)) {
            console.log('🚫 [TopicRestriction] Blocked off-topic query:', query);
            
            const rejectionMessage = agentSettings.topicRestrictionMessage || 
              "I'm a specialized AI assistant for product sourcing. Please ask me about products or components.";

            writeEvent(ctx, {
              type: 'decision_summary',
              message: rejectionMessage,
            });

            const finalResult = {
              chat_summary: '',
              logic_explanation: 'Query blocked by topic restriction - not product-related',
              interpreted_requirements: [],
              decision_summary: rejectionMessage,
              data: [],
              product_cards: [],
              stats: { web_results: 0, database_results: 0, total: 0 },
              classification: {
                intent: classification.intent,
                domain: classification.domain,
                is_multi_product_set: false,
                budget: null,
                enriched_query: classification.enriched_query,
              },
              topic_restricted: true,
            };

            const usageRecord = finishTracking(ctx.requestId, 0, {
              intent: classification.intent,
              domain: classification.domain,
            });

            if (usageRecord) {
              (finalResult as any).usage = {
                api_calls: usageRecord.api_calls.length,
                total_tokens: usageRecord.total_tokens,
                total_duration_ms: usageRecord.total_duration_ms,
              };
            }

            writeResult(ctx, finalResult);
            console.log(`🚫 [TopicRestriction] Returned rejection for: "${query}" | Tokens used: ${usageRecord?.total_tokens.total_tokens || 0} (classifier only)`);
            await ensurePlaceholder();
            if (placeholderMessageId && !placeholderResolved) {
              placeholderResolved = true;
              try {
                await db.update(aiChatSessionMessages)
                  .set({
                    content: rejectionMessage,
                    searchResults: { recommendation: rejectionMessage, topic_restricted: true },
                    status: 'complete',
                  })
                  .where(eq(aiChatSessionMessages.id, placeholderMessageId));
              } catch (err) {
                console.warn('[Placeholder] Failed to mark complete (topic-restricted):', (err as Error)?.message);
              }
            }
            endStream(ctx);
            return;
          }
        }
      } catch (settingsError: any) {
        console.warn('⚠️ [TopicRestriction] Failed to check settings, proceeding:', settingsError?.message);
      }
    }

    const isForcedProductSearch = searchMode === 'product_search';

    const onToken = (token: string) => {
      streamTokenString(ctx, token);
    };

    let result;
    let requirementsAlreadyEmitted = false;

    switch (mode) {
      case 'web':
        writeStatus(ctx, 'Searching manufacturer websites...');
        result = await executeWebOnlySearch(query, ctx.requestId, classification, manufacturerDiscovery, (message) => writeStatus(ctx, message));
        break;
      case 'database':
        writeStatus(ctx, 'Searching DeepFolder database...');
        result = await executeDatabaseOnlySearch(query, ctx.requestId);
        break;
      case 'hybrid':
      default:
        writeStatus(ctx, 'Searching web and database in parallel...');
        result = await executeHybridSearch(
          query,
          ctx.requestId,
          DEFAULT_CONFIG,
          (message) => writeStatus(ctx, message),
          parsedHistory,
          onToken,
          classification,
          isForcedProductSearch,
          manufacturerDiscovery,
          userId ? (typeof req.body.sessionId === 'number' ? req.body.sessionId : (req.body.sessionId ? parseInt(String(req.body.sessionId), 10) : null)) : null,
          userId,
          (reqs, reqMode) => {
            const expertNameEarly = classification ? getExpertPersonaName(classification.domain) : undefined;
            writeEvent(ctx, {
              type: 'requirements',
              data: reqs,
              mode: reqMode,
              expert_name: expertNameEarly,
            } as any);
            requirementsAlreadyEmitted = true;
            console.log(`📋 [Requirements] Emitted early: ${reqs.length} requirements`);
          }
        );
        break;
    }

    writeStatus(ctx, 'Processing results...');

    const expertName = classification ? getExpertPersonaName(classification.domain) : undefined;

    if (result.interpretedRequirements && result.interpretedRequirements.length > 0) {
      const requirementsMode = classification?.intent === 'build' ? 'build' : 'search';
      if (!requirementsAlreadyEmitted) {
        writeEvent(ctx, {
          type: 'requirements',
          data: result.interpretedRequirements,
          mode: requirementsMode,
          expert_name: expertName,
        } as any);
      }
      // Always persist the requirements row server-side regardless of early/late emission.
      if (ownedSessionId) {
        try {
          await db.insert(aiChatSessionMessages).values({
            sessionId: ownedSessionId,
            content: 'I understood your requirements:',
            isUser: false,
            status: 'complete',
            searchResults: {
              requirements: result.interpretedRequirements,
              requirementsMode,
              expertName,
            } as any,
          });
        } catch (err) {
          console.warn('[Persistence] Failed to insert requirements row:', (err as Error)?.message);
        }
      }
    }

    if (result.bomTable && result.bomTable.length > 0 && !isForcedProductSearch) {
      console.log(`🔧 [BOM] Emitting bom_table event with ${result.bomTable.length} parts`);
      writeEvent(ctx, {
        type: 'bom_table' as any,
        data: result.bomTable,
        bomSummary: result.bomSummary || '',
        engineeringNotes: result.engineeringNotes || '',
      });
      // Persist the BOM row server-side BEFORE the placeholder so its
      // auto-increment id sorts above the main results row in chat history.
      if (ownedSessionId) {
        try {
          await db.insert(aiChatSessionMessages).values({
            sessionId: ownedSessionId,
            content: '',
            isUser: false,
            status: 'complete',
            searchResults: {
              bomTable: result.bomTable,
              bomSummary: result.bomSummary || undefined,
              engineeringNotes: result.engineeringNotes || undefined,
            } as any,
          });
        } catch (err) {
          console.warn('[Persistence] Failed to insert BOM row:', (err as Error)?.message);
        }
      }
    } else if (result.bomTable && result.bomTable.length > 0 && isForcedProductSearch) {
      console.log(`🔧 [BOM] Suppressed bom_table emission — forced product_search mode`);
    }

    // Now create the streaming placeholder for the main AI-response row.
    // Inserted AFTER requirements/BOM so that on history reload the auto-increment
    // ids preserve the live ordering: user → requirements → BOM → results.
    await ensurePlaceholder();

    if (result.comparisonTable && result.comparisonTable.products.length > 0) {
      console.log(`📊 [Comparison] Emitting comparison_table event: ${result.comparisonTable.products.length} products × ${result.comparisonTable.rows.length} rows`);
      writeEvent(ctx, {
        type: 'comparison_table' as any,
        data: result.comparisonTable,
      });
    }

    if (result.calculationSection && result.calculationSection.title) {
      console.log(`🔢 [Calculation] Emitting calculation_section event: "${result.calculationSection.title}"`);
      writeEvent(ctx, {
        type: 'calculation_section' as any,
        data: result.calculationSection,
      });
    }

    if (result.bestFit || result.alternativeSuggestion || result.searchGuidance) {
      writeEvent(ctx, {
        type: 'decision_summary',
        message: result.decisionSummary || '',
        bestFit: result.bestFit || '',
        alternativeSuggestion: result.alternativeSuggestion || '',
        searchGuidance: result.searchGuidance || '',
      });
    } else if (result.decisionSummary) {
      writeEvent(ctx, {
        type: 'decision_summary',
        message: result.decisionSummary,
      });
    }

    if (result.chatSummary) {
      writeChatSummary(ctx, result.chatSummary);
    }

    for (let i = 0; i < result.productCards.length; i++) {
      writeProductCard(ctx, result.productCards[i], i);
    }

    const finalResult: Record<string, any> = {
      chat_summary: result.chatSummary,
      logic_explanation: result.logicExplanation,
      interpreted_requirements: result.interpretedRequirements,
      decision_summary: result.decisionSummary,
      best_fit: result.bestFit,
      alternative_suggestion: result.alternativeSuggestion,
      bom_table: result.bomTable,
      bom_summary: result.bomSummary,
      engineering_notes: result.engineeringNotes,
      comparison_table: result.comparisonTable,
      calculation_section: result.calculationSection,
      alternative_searches: result.alternativeSearches,
      data: result.products,
      product_cards: result.productCards,
      stats: {
        web_results: result.webResults,
        database_results: result.databaseResults,
        total: result.productCards.length,
      },
      searched_manufacturers: result.searchedManufacturers || [],
      user_override_source: result.userOverrideSource || null,
      classification: classification ? {
        intent: classification.intent,
        domain: classification.domain,
        is_multi_product_set: classification.strategy.is_multi_product_set,
        budget: classification.constraints.budget,
        enriched_query: classification.enriched_query,
        expert_name: expertName,
        // Task #363 — surfaced so benchmark scorers + the UI can verify the
        // mode the classifier picked for calculation_search queries.
        strategy: { calculation_mode: classification.strategy.calculation_mode ?? null },
      } : undefined,
    };

    if (result.agentUsage) {
      trackApiCall(ctx.requestId, {
        service: 'agent_search',
        model: result.agentUsage.model,
        tokens: {
          prompt_tokens: 0,
          completion_tokens: result.agentUsage.estimated_output_tokens,
          total_tokens: result.agentUsage.estimated_output_tokens,
        },
        duration_ms: result.agentUsage.agent_duration_ms,
        timestamp: Date.now(),
      });

      if (result.agentUsage.guardrails_duration_ms) {
        trackApiCall(ctx.requestId, {
          service: 'guardrails',
          model: 'gpt-4.1-mini',
          tokens: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          duration_ms: result.agentUsage.guardrails_duration_ms,
          timestamp: Date.now(),
        });
      }

      const compUsage = result.agentUsage.compression_usage;
      if (compUsage) {
        trackApiCall(ctx.requestId, {
          service: 'history_compression',
          model: compUsage.model,
          tokens: {
            prompt_tokens: compUsage.prompt_tokens,
            completion_tokens: compUsage.completion_tokens,
            total_tokens: compUsage.total_tokens,
          },
          duration_ms: compUsage.duration_ms,
          timestamp: Date.now(),
        });
      }

      const wsCalls = result.agentUsage.web_search_calls ?? 0;
      for (let i = 0; i < wsCalls; i++) {
        trackApiCall(ctx.requestId, {
          service: 'web_search_tool',
          model: 'web_search_preview',
          tokens: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          duration_ms: 0,
          timestamp: Date.now(),
          web_search_calls: 1,
        });
      }
    }

    const usageRecord = finishTracking(ctx.requestId, result.productCards.length, classification ? {
      intent: classification.intent,
      domain: classification.domain,
    } : undefined);

    if (usageRecord) {
      finalResult.usage = {
        api_calls: usageRecord.api_calls.length,
        total_tokens: usageRecord.total_tokens,
        total_duration_ms: usageRecord.total_duration_ms,
      };
    }

    writeResult(ctx, finalResult);
    console.log(`✅ [HybridSearch] Completed with ${result.productCards.length} products (${result.webResults} web, ${result.databaseResults} database) | API calls: ${usageRecord?.api_calls.length || 0} | Tokens: ${usageRecord?.total_tokens.total_tokens || 0} | Duration: ${usageRecord?.total_duration_ms || 0}ms`);

    // Defensive: if some path skipped the earlier ensurePlaceholder() call,
    // create the placeholder now so the response is still persisted.
    await ensurePlaceholder();

    // Resolve placeholder → 'complete' with the persisted main-AI-response payload.
    if (placeholderMessageId && !placeholderResolved) {
      placeholderResolved = true;
      try {
        const finalContent = result.productCards.length > 0
          ? ''
          : (result.bomTable?.length ? '' : (result.comparisonTable ? '' : (result.calculationSection ? '' : (result.chatSummary || result.decisionSummary || ''))));
        const searchResultsPayload: Record<string, any> = { companies: [] };
        if (result.productCards.length > 0) searchResultsPayload.productCards = result.productCards;
        if (result.bestFit) searchResultsPayload.bestFit = result.bestFit;
        if (result.alternativeSuggestion) searchResultsPayload.alternativeSuggestion = result.alternativeSuggestion;
        if (result.searchGuidance) searchResultsPayload.searchGuidance = result.searchGuidance;
        if (result.alternativeSearches?.length) searchResultsPayload.alternativeSearches = result.alternativeSearches;
        if (result.chatSummary || result.decisionSummary) searchResultsPayload.recommendation = result.chatSummary || result.decisionSummary;
        if (result.bomTable?.length) {
          searchResultsPayload.bomTable = result.bomTable;
          if (result.bomSummary) searchResultsPayload.bomSummary = result.bomSummary;
          if (result.engineeringNotes) searchResultsPayload.engineeringNotes = result.engineeringNotes;
        }
        if (result.comparisonTable) searchResultsPayload.comparisonTable = result.comparisonTable;
        if (result.calculationSection) searchResultsPayload.calculationSection = result.calculationSection;
        await db.update(aiChatSessionMessages)
          .set({
            content: finalContent,
            searchResults: searchResultsPayload,
            status: 'complete',
          })
          .where(eq(aiChatSessionMessages.id, placeholderMessageId));
      } catch (err) {
        console.warn('[Placeholder] Failed to mark complete:', (err as Error)?.message);
      }
    }

    endStream(ctx);
  } catch (error: any) {
    console.error('❌ [HybridSearch] Error:', error?.message || error);
    console.error('❌ [HybridSearch] Stack:', error?.stack);

    try {
      const { query } = req.body;
      writeStatus(ctx, 'Search failed, using database fallback...');

      const fallback = await executeDatabaseFallback(query || '');
      const chatSummaryParts: string[] = [];
      if (fallback.companies.length) chatSummaryParts.push(`Companies: ${fallback.companies.join(', ')}`);
      if (fallback.products.length) chatSummaryParts.push(`Products: ${fallback.products.join(', ')}`);

      const fallbackSummary = chatSummaryParts.join('\n') || 'No matches found.';
      const fallbackData = {
        chat_summary: fallbackSummary,
        logic_explanation: `Used fallback database search. Error: ${error?.message || 'Unknown error'}`,
        data: [],
        product_cards: [],
        stats: {
          web_results: 0,
          database_results: fallback.products.length,
          total: 0,
        },
      };

      writeResult(ctx, fallbackData);

      // Fallback succeeded — persist its summary to the placeholder so refresh
      // shows what the user just saw, rather than an empty failed bubble.
      await ensurePlaceholder();
      if (placeholderMessageId && !placeholderResolved) {
        placeholderResolved = true;
        try {
          await db.update(aiChatSessionMessages)
            .set({
              content: fallbackSummary,
              searchResults: { recommendation: fallbackSummary, fallback: true },
              status: 'complete',
            })
            .where(eq(aiChatSessionMessages.id, placeholderMessageId));
        } catch (err) {
          console.warn('[Placeholder] Failed to mark complete (fallback):', (err as Error)?.message);
        }
      }
    } catch (fallbackError) {
      // True failure: no fallback available either. Mark placeholder failed.
      await markPlaceholderFailed();
      writeEvent(ctx, {
        type: 'error',
        error: error?.message || 'Unexpected error',
      });
    }

    endStream(ctx);
  }
});

router.get('/search-modes', (req, res) => {
  res.json({
    modes: [
      { id: 'hybrid', name: 'Hybrid Search', description: 'Combines web and database results' },
      { id: 'web', name: 'Web Only', description: 'Search manufacturer websites only' },
      { id: 'database', name: 'Database Only', description: 'Search DeepFolder database only' },
    ],
    defaultConfig: DEFAULT_CONFIG,
  });
});

router.get('/usage/stats', requireAuth, requirePlatformAdmin, async (_req, res) => {
  try {
    res.json(await getUsageStats());
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get usage stats' });
  }
});

router.get('/usage/history', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    res.json(await getUsageHistory(limit));
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get usage history' });
  }
});

router.get('/usage/by-user', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const month = (req.query.month as string) || 'current';
    const hasFilters = req.query.range || req.query.model || req.query.searchMode
      || req.query.from || req.query.to;
    if (hasFilters) {
      const f = parseUserAnalyticsFilters(req.query);
      res.json(await getUsageByUser(month, {
        range: f.range,
        from: f.from,
        to: f.to,
        model: f.model,
        searchMode: f.searchMode,
      }));
    } else {
      res.json(await getUsageByUser(month));
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get per-user usage' });
  }
});

function parseUserAnalyticsFilters(q: any): UserAnalyticsFilters {
  const allowed: TimeRange[] = ['hour', 'day', 'week', 'month', 'all', 'custom'];
  const rangeRaw = (q.range as string) || 'month';
  const range = (allowed.includes(rangeRaw as TimeRange) ? rangeRaw : 'month') as TimeRange;
  return {
    range,
    from: typeof q.from === 'string' ? q.from : undefined,
    to: typeof q.to === 'string' ? q.to : undefined,
    model: typeof q.model === 'string' && q.model ? q.model : undefined,
    searchMode: typeof q.searchMode === 'string' && q.searchMode ? q.searchMode : undefined,
  };
}

router.get('/usage/models', requireAuth, requirePlatformAdmin, async (_req, res) => {
  try {
    res.json({ models: await getKnownModels() });
  } catch {
    res.status(500).json({ error: 'Failed to load models' });
  }
});

router.get('/usage/by-user/export.csv', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const csv = await getByUserCsv(parseUserAnalyticsFilters(req.query));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="usage-by-user-${Date.now()}.csv"`);
    res.send(csv);
  } catch {
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

router.get('/usage/by-user/:userId/summary', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    res.json(await getUserSummary(req.params.userId, parseUserAnalyticsFilters(req.query)));
  } catch {
    res.status(500).json({ error: 'Failed to get user summary' });
  }
});

router.get('/usage/by-user/:userId/timeseries', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    res.json(await getUserTimeseries(req.params.userId, parseUserAnalyticsFilters(req.query)));
  } catch {
    res.status(500).json({ error: 'Failed to get user timeseries' });
  }
});

router.get('/usage/by-user/:userId/prompts', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const filters = parseUserAnalyticsFilters(req.query);
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 25;
    res.json(await getUserPrompts(req.params.userId, { ...filters, page, pageSize }));
  } catch {
    res.status(500).json({ error: 'Failed to get user prompts' });
  }
});

router.get('/usage/daily', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    res.json(await getUsageDaily(days));
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get daily usage' });
  }
});

router.get('/usage/series', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const raw = (req.query.range as string) || 'month';
    const range = (['day', 'week', 'month', 'year'].includes(raw) ? raw : 'month') as 'day' | 'week' | 'month' | 'year';
    res.json(await getUsageSeries(range));
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get usage series' });
  }
});

router.get('/admin/usage/geo-stats', requireAuth, requirePlatformAdmin, async (_req, res) => {
  try {
    res.json(await getGeoStats());
  } catch {
    res.status(500).json({ error: 'Failed to get geo stats' });
  }
});

// Regenerate an existing calculation with user-provided parameter overrides.
// Reuses the standard hybrid search flow but with a synthesized "recompute"
// prompt that injects the overridden values as user-sourced givens. For
// size_then_search the agent also re-runs product search so cards reflect the
// new derived specs; for search_then_size / pure calc, only the calc card is
// regenerated (the existing product card on the client is preserved).
router.post('/calc-regenerate', requireAuth, async (req, res) => {
  try {
    const {
      query,
      calculationSection,
      calculationMode,
      overrides = {},
    } = req.body || {};

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query is required' });
    }
    if (!calculationSection || !Array.isArray(calculationSection.given)) {
      return res.status(400).json({ error: 'calculationSection is required' });
    }
    if (!overrides || typeof overrides !== 'object' || Object.keys(overrides).length === 0) {
      return res.status(400).json({ error: 'at least one override is required' });
    }

    // Resolve mode server-authoritatively using the sizing heuristic so that
    // a stale or incorrect `calculationMode` echoed back by the client cannot
    // silently skip the product re-search.
    // - Heuristic returns true  → physical inputs present → always size_then_search
    // - Heuristic returns false AND client explicitly sent search_then_size → honour it
    // - Otherwise               → safe default: size_then_search
    const sizingHeuristic = detectSizingHeuristic(query);
    const mode: 'size_then_search' | 'search_then_size' =
      sizingHeuristic
        ? 'size_then_search'
        : calculationMode === 'search_then_size'
          ? 'search_then_size'
          : 'size_then_search';

    console.log(
      `[calc-regenerate] received calculationMode="${calculationMode}" | sizingHeuristic=${sizingHeuristic} | resolved mode="${mode}"`,
    );

    const overrideEntries: Array<[string, string]> = Object.entries(overrides)
      .filter(([, v]) => v != null && String(v).trim().length > 0)
      .map(([k, v]) => [String(k), String(v).trim()]);
    const overrideMap = new Map(overrideEntries);

    const effectiveGivens = calculationSection.given.map((g: any) => {
      const overridden = overrideMap.has(g.name);
      return {
        ...g,
        value: overridden ? overrideMap.get(g.name)! : String(g.value ?? ''),
        _overridden: overridden,
      };
    });

    const givenLines = effectiveGivens.map((g: any) =>
      `- ${g.name} = ${g.value}${g.unit ? ' ' + g.unit : ''}${g._overridden ? '  [USER OVERRIDE — source.kind="user"]' : ''}`
    ).join('\n');

    const calcSystemPrompt = [
      'You are a precision engineering calculator. Your ONLY task is to re-run an existing calculation with updated input values and return a single JSON object.',
      '',
      'RULES (ALL MANDATORY):',
      '1. Return ONLY a valid JSON object with a single top-level key "calculation_section".',
      '2. Keep the SAME title, formula, legend, step labels/formulas, result name, unit, and derived_spec labels/units as the template below.',
      '3. The template intentionally OMITS all numeric values. You MUST compute every number fresh from the input values above — there is nothing to copy.',
      '4. Every step must have a computed numeric result.value derived from the inputs — never leave it empty or symbolic, and never reuse a number you were not given.',
      '5. Do NOT search the web. Do NOT return product cards. Do NOT add commentary.',
      '6. The JSON must have at minimum: title (string), given (array), steps (array of {label,formula?,result:{value,unit?}}), result ({name,value,unit}), derived_specs (array of {label,value,unit?}), summary (string).',
      '7. Use exactly the field names "steps" (array) and "result" (singular object) — not "results".',
      '8. COMPUTE "derived_specs" values fresh from the new inputs/result for every label in the template (keep the same labels and units; fill in the numbers).',
      '9. WRITE a fresh "summary" (1-2 sentences) that states the newly computed result and conclusion using the input values above. Do not mention any value that is not among the inputs or your computed results.',
    ].join('\n');

    const calcContext = JSON.stringify({
      title: calculationSection.title,
      formula: calculationSection.formula,
      legend: calculationSection.legend,
      steps: (calculationSection.steps || []).map((s: any) => ({ label: s?.label, formula: s?.formula })),
      result: calculationSection.result
        ? { name: calculationSection.result.name, unit: calculationSection.result.unit }
        : undefined,
      derived_specs: (calculationSection.derived_specs || []).map((d: any) => ({ label: d?.label, unit: d?.unit })),
    });

    const calcUserMessage = [
      'Re-run this calculation using EXACTLY these input values:',
      '',
      givenLines,
      '',
      'Calculation TEMPLATE (structure only — all numeric values omitted on purpose; compute them ALL fresh from the inputs above):',
      calcContext,
      '',
      `Original query (for context only): ${query}`,
    ].join('\n');

    let regenClient: OpenAI;
    try {
      regenClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    } catch {
      return res.status(500).json({ error: 'Failed to initialize calculation engine' });
    }

    async function attemptCalcRegen(userMsg: string): Promise<any> {
      const completion = await regenClient.chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        temperature: 0.1,
        messages: [
          { role: 'system', content: calcSystemPrompt },
          { role: 'user', content: userMsg },
        ],
      });
      const raw = completion.choices[0]?.message?.content ?? '';
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
      const cs = parsed.calculation_section ?? parsed;
      // Accept either "steps" or "results" from the AI — normalize to "steps"
      const stepsArr: any[] = Array.isArray(cs?.steps) ? cs.steps
        : Array.isArray(cs?.results) ? cs.results
        : [];
      // Require at minimum a title; given and steps can be empty arrays
      if (!cs || !cs.title) {
        console.warn('[calc-regenerate] validation failed — missing title. cs:', JSON.stringify(cs).slice(0, 300));
        return null;
      }
      const givenArr: any[] = Array.isArray(cs.given) ? cs.given : [];
      // The frontend (CalcCard / MaybeMath) calls string methods like .trim() on
      // these values, so coerce every numeric value the AI returns back to a string.
      // gpt-4o returns bare numbers (e.g. 66.16) now that the context template omits
      // numeric values — without this, `(66.16).trim()` crashes the calc card render.
      const toStr = (v: any) => (v == null ? '' : String(v));
      // Normalize each step: AI may use "name" instead of "label"
      const normalizedSteps = stepsArr.map((s: any) => {
        const r = s.result ?? (s.value != null ? { value: s.value, unit: s.unit } : undefined);
        return {
          ...s,
          label: s.label ?? s.name ?? s.step ?? '',
          result: r
            ? (typeof r === 'object'
              ? { ...r, value: toStr(r.value), unit: r.unit != null ? String(r.unit) : undefined }
              : { value: toStr(r), unit: undefined })
            : undefined,
        };
      });
      // Ensure singular "result" (final answer) is present
      const lastStep = normalizedSteps[normalizedSteps.length - 1];
      const lastStepResult = lastStep?.result;
      const rawResult = cs.result ?? (
        lastStepResult
          ? (typeof lastStepResult === 'object'
            ? { name: lastStep.label || 'Result', value: lastStepResult.value ?? '', unit: lastStepResult.unit ?? '' }
            : { name: lastStep.label || 'Result', value: String(lastStepResult), unit: '' })
          : undefined
      );
      const normalizedResult = rawResult
        ? { ...rawResult, value: toStr(rawResult.value), unit: rawResult.unit != null ? String(rawResult.unit) : '' }
        : undefined;
      const normalizedDerived = Array.isArray(cs.derived_specs)
        ? cs.derived_specs.map((d: any) => ({
            ...d,
            value: toStr(d?.value),
            unit: d?.unit != null ? String(d.unit) : undefined,
          }))
        : cs.derived_specs;
      return { ...cs, given: givenArr, steps: normalizedSteps, result: normalizedResult, derived_specs: normalizedDerived };
    }

    let newCalc = await attemptCalcRegen(calcUserMessage);

    if (!newCalc) {
      const retryMsg = [
        'IMPORTANT: Return ONLY JSON with key "calculation_section".',
        'Required fields: title (string), given (array of {name,value,unit}), steps (array of {label,formula?,result:{value,unit?}}), result ({name,value,unit}), derived_specs (array of {label,value,unit?}), summary (string).',
        'Use field names "steps" (array) and "result" (singular) — NOT "results".',
        '',
        'Re-calculate with these inputs:',
        givenLines,
        '',
        'Keep the same formula and structure as before. Compute all numeric values.',
        'UPDATE derived_specs and summary so they reflect the NEW result — do not echo the old numbers.',
      ].join('\n');
      newCalc = await attemptCalcRegen(retryMsg);
    }

    if (!newCalc) {
      return res.status(422).json({ error: 'Could not regenerate — please try again' });
    }

    // Build the returned "given" rows DETERMINISTICALLY from the original
    // parameters + user overrides — NOT from the AI output. The AI is only
    // trusted to recompute steps/result; it frequently drops or shortens the
    // "given" array (the system prompt even allows it to be empty), which made
    // the parameters disappear after regeneration. effectiveGivens already
    // holds every original row with the user's override applied.
    const stampedGivens = effectiveGivens.map((g: any) => {
      const { _overridden, ...rest } = g;
      if (_overridden) {
        return { ...rest, source: { kind: 'user', label: 'User input' } };
      }
      // Keep the original source chip for non-edited rows.
      return { ...rest, source: rest.source ?? { kind: 'ai' } };
    });

    // Start from the original section so structural fields (legend, summary,
    // formula_sources, derived_specs, title) survive even when the AI omits
    // them, then overlay the AI's recomputed numbers and the deterministic
    // given rows. This prevents the "section changed / parameters disappeared"
    // regression where a partial AI payload wiped the card.
    const stampedCalc = {
      ...calculationSection,
      ...newCalc,
      given: stampedGivens,
      legend: newCalc.legend ?? calculationSection.legend,
      formula_sources: newCalc.formula_sources ?? calculationSection.formula_sources,
      summary: newCalc.summary ?? calculationSection.summary,
      derived_specs: newCalc.derived_specs ?? calculationSection.derived_specs,
    };

    // Use only freshly recomputed values from `newCalc` — never fall back to the
    // original `calculationSection.*` fields here, because the whole point is to
    // replace stale data with values from the new calculation run.
    //
    // `stampedCalc.result` is safe: it is `newCalc.result` (spread order guarantees
    // newCalc wins) and is validated as present by attemptCalcRegen.
    // `newCalc.derived_specs` may be absent if the AI omits the field — in that case
    // we produce no soft requirements (better to show fewer rows than stale ones).
    // `newCalc.summary` may also be absent — fall back to deterministic text only.
    const _freshResult = stampedCalc.result; // guaranteed from newCalc
    const _freshDerivedSpecs: any[] = Array.isArray(newCalc.derived_specs) ? newCalc.derived_specs : [];

    // Derive fresh interpreted_requirements: result → hard, derived_specs → soft.
    const freshRequirements: Array<{ parameter: string; requirement: string; type: 'hard' | 'soft' }> = [];
    if (_freshResult?.name && _freshResult?.value != null && String(_freshResult.value).trim()) {
      freshRequirements.push({
        parameter: _freshResult.name,
        requirement: `${_freshResult.value}${_freshResult.unit ? ' ' + _freshResult.unit : ''}`,
        type: 'hard',
      });
    }
    for (const d of _freshDerivedSpecs) {
      if (d?.label && d?.value != null && String(d.value).trim()) {
        freshRequirements.push({
          parameter: d.label,
          requirement: `${d.value}${d.unit ? ' ' + d.unit : ''}`,
          type: 'soft',
        });
      }
    }

    // Build fresh summary (bestFit) and recommendation (alternativeSuggestion) text.
    // Priority: LLM-written newCalc.summary → deterministic text from new result values.
    // NEVER fall back to old calculationSection.summary — that references previous values.
    const _resultStr = _freshResult?.name && _freshResult?.value != null
      ? `${_freshResult.name}: ${_freshResult.value}${_freshResult.unit ? ' ' + _freshResult.unit : ''}`
      : '';
    const _derivedParts: string[] = _freshDerivedSpecs
      .filter((d: any) => d?.label && d?.value != null && String(d.value).trim())
      .slice(0, 3)
      .map((d: any) => `${d.label}: ${d.value}${d.unit ? ' ' + d.unit : ''}`);
    const freshBestFit: string =
      (newCalc.summary && String(newCalc.summary).trim())
        ? String(newCalc.summary).trim()
        : (_resultStr
            ? `Recalculated result — ${_resultStr}${_derivedParts.length ? '. Key derived values: ' + _derivedParts.join(', ') + '.' : '.'}`
            : '');
    const freshAlternativeSuggestion: string = _resultStr
      ? `Based on the updated sizing (${_resultStr}), verify that your selected products meet the new computed specifications. Review safety margins and tolerance requirements accordingly.`
      : '';

    // For size_then_search (calculation first, then a product search that
    // depends on the calculated values) we MUST re-run the product search so
    // the results reflect the freshly recomputed sizing. We build an augmented
    // query that states the new computed targets explicitly and force a pure
    // product search (the sizing is already done here — don't recompute it).
    let freshProductCards: any[] | undefined = undefined;
    if (mode === 'size_then_search') {
      console.log('[calc-regenerate] starting product re-search for size_then_search mode');
      try {
        const reqLines: string[] = [];
        if (stampedCalc.result && stampedCalc.result.name) {
          const r = stampedCalc.result;
          reqLines.push(`- ${r.name}: ${r.value}${r.unit ? ' ' + r.unit : ''}`);
        }
        if (Array.isArray(stampedCalc.derived_specs)) {
          for (const d of stampedCalc.derived_specs) {
            if (d && d.label && d.value != null && String(d.value).trim() !== '') {
              reqLines.push(`- ${d.label}: ${d.value}${d.unit ? ' ' + d.unit : ''}`);
            }
          }
        }

        const augmentedQuery = [
          query,
          '',
          'The sizing calculation is already complete. Use these UPDATED computed values as the target product requirements (do NOT recompute them):',
          ...reqLines,
          '',
          'Find products that satisfy these updated requirements.',
        ].join('\n');

        // Parse chat history sent by the client (same shape the stream uses).
        const rawHistory = Array.isArray(req.body?.chatHistory) ? req.body.chatHistory : [];
        const parsedHistory = rawHistory
          .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant'))
          .filter((m: any) => m.content && !m.requirements)
          .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

        // Resolve userId (best-effort) for downstream personalization.
        let userId: string | null = (req as any).session?.userId || null;
        if (!userId) {
          const token = extractToken(req as any);
          if (token) {
            const decoded = verifyAuthToken(token);
            if (decoded?.id) userId = decoded.id;
          }
        }

        const requestId = `calc-regen-${Date.now()}`;
        const heuristicDomain = detectDomainHeuristic(augmentedQuery);
        const heuristicPersona = getExpertPersonaName(heuristicDomain);
        const recentUserHistory = parsedHistory.filter((m: any) => m.role === 'user').slice(-2);

        const [classificationResult, discoveryResult] = await Promise.allSettled([
          classifyQuery(augmentedQuery, parsedHistory, 10000),
          discoverManufacturers(augmentedQuery, heuristicDomain, undefined, heuristicPersona, recentUserHistory),
        ]);
        const reClassification: QueryClassification = classificationResult.status === 'fulfilled'
          ? classificationResult.value
          : { ...DEFAULT_CLASSIFICATION, enriched_query: augmentedQuery, classification_confidence: 1.0 };
        const reDiscovery: ManufacturerDiscoveryResult = discoveryResult.status === 'fulfilled'
          ? discoveryResult.value
          : { ...DEFAULT_MANUFACTURER_RESULT };

        // Force a pure product search so the agent searches against the new
        // requirements instead of re-running the calculation.
        reClassification.intent = 'product_search';
        const isEnum = reClassification.strategy?.is_brand_enumeration === true;
        reClassification.strategy = {
          ...reClassification.strategy,
          needs_web_search: true,
          needs_product_cards: true,
          is_multi_product_set: false,
          suggested_product_count: isEnum
            ? Math.min(20, Math.max(12, reClassification.strategy?.suggested_product_count || 12))
            : 5,
          response_tone: 'technical',
        };

        const searchResult = await executeHybridSearch(
          augmentedQuery,
          requestId,
          DEFAULT_CONFIG,
          undefined,
          parsedHistory,
          undefined,
          reClassification,
          true,
          reDiscovery,
          null,
          userId,
          undefined,
        );

        if (Array.isArray(searchResult?.productCards) && searchResult.productCards.length > 0) {
          freshProductCards = searchResult.productCards;
        }
      } catch (searchErr) {
        console.warn('[calc-regenerate] product re-search failed; returning calc only:', (searchErr as Error)?.message);
      }
    }

    res.json({
      calculationSection: stampedCalc,
      productCards: freshProductCards,
      mode,
      interpretedRequirements: freshRequirements.length > 0 ? freshRequirements : undefined,
      bestFit: freshBestFit || undefined,
      alternativeSuggestion: freshAlternativeSuggestion || undefined,
    });
  } catch (err: any) {
    console.error('[calc-regenerate] error', err);
    res.status(500).json({ error: err?.message || 'Failed to regenerate calculation' });
  }
});

export default router;
