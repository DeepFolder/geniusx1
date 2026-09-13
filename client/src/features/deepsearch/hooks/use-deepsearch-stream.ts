import { useState, useRef } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { adaptHybridProduct } from "../utils/productAdapters";
import type { AISearchMessage, BomItem, ComparisonTableData, HybridProduct, Requirement, Product } from "../types";
import type { CalculationSection } from "@/components/chat/CalcCard";

function wrapBareMath(text: string): string {
  if (/\\\(|\\\[|\$\$/.test(text)) return text;
  // Match full multi-command expressions as a single unit:
  // optional word prefix + one-or-more (LaTeX command + content) + optional trailing identifier
  return text.replace(
    /(?<![\\(])(?:[\w\d.]+\s*)?(?:\\(?:approx|cdot|times|frac|sqrt|leq|geq|neq|pm|div|sum|int|alpha|beta|gamma|delta|mu|sigma|omega|pi|theta|phi|lambda|rho|tau|epsilon|eta|kappa|nu|xi|psi|chi|zeta)(?:[^\\{}\n]*(?:\{[^}]*\})?)*)+[\w\d._]*/g,
    (match) => `\\(${match.trim()}\\)`
  );
}

function buildChatHistory(
  messages: AISearchMessage[],
  opts: { skipHistory?: boolean; appendUserQuery?: string }
): { role: 'user' | 'assistant'; content: string }[] {
  const { skipHistory, appendUserQuery } = opts;
  const base = skipHistory
    ? messages
        .filter(m => m.isUser && m.content)
        .slice(0, 1)
        .map(m => ({ role: 'user' as const, content: m.content }))
    : messages
        .filter(m => m.content || m.searchResults?.products?.length)
        .map(m => {
          if (m.isUser) return { role: 'user' as const, content: m.content };
          let content = m.content || '';
          if (m.searchResults?.products?.length) {
            const productNames = m.searchResults.products
              .map((p: Product) => `${p.name}${p.companyName ? ' (' + p.companyName + ')' : ''}`)
              .join(', ');
            content += (content ? '\n\n' : '') + 'Products shown: ' + productNames;
            const structuredLines = m.searchResults.products
              .map((p: Product) => {
                const isDbProduct = !p.isExternal;
                const tags: string[] = [];
                if (isDbProduct && p.id) tags.push(`[id=${p.id}]`);
                if (p.companyName) tags.push(`[mfr=${p.companyName}]`);
                const url = isDbProduct && p.id ? `/product/${p.id}` : (p.productWebLink || '');
                if (url) tags.push(`[url=${url}]`);
                return `- ${p.name} ${tags.join(' ')}`.trim();
              })
              .join('\n');
            if (structuredLines) content += '\n\nProduct details:\n' + structuredLines;
          }
          if (m.bestFit) content += (content ? '\n\n' : '') + 'Best fit: ' + m.bestFit;
          return { role: 'assistant' as const, content };
        })
        .filter(m => m.content);

  if (appendUserQuery && !base.some(m => m.role === 'user' && m.content === appendUserQuery)) {
    base.push({ role: 'user', content: appendUserQuery });
  }
  return base;
}

interface UseDeepSearchStreamResult {
  aiMessages: AISearchMessage[];
  setAiMessages: React.Dispatch<React.SetStateAction<AISearchMessage[]>>;
  isAILoading: boolean;
  streamingStatusMessage: string;
  regenerateCalculation: (
    messageId: string,
    overrides: Record<string, string>,
    companyMap: Map<number, any>,
  ) => Promise<void>;
  handleAISearch: (
    searchQuery: string,
    forcedSearchMode?: 'product_search',
    skipHistory?: boolean,
    options?: {
      user: any;
      activeSessionId: number | null;
      setActiveSessionId: (id: number | null) => void;
      setCollapsedSearchGroups: (fn: (prev: Set<string>) => Set<string>) => void;
      setDismissedProductIds: (fn: (prev: Set<number>) => Set<number>) => void;
      companyMap: Map<number, any>;
      saveMessageToSession: (sessionId: number, message: AISearchMessage, user: any) => Promise<void>;
      pendingScrollTargetRef: React.MutableRefObject<string | null>;
      setAnimationActive: (v: boolean) => void;
      setAiQuery: (q: string) => void;
      // Retry mode: the user bubble already exists in the transcript, so
      // don't add a duplicate one (and don't re-save it to the session).
      skipUserMessage?: boolean;
      // Short display label shown in the user bubble instead of the full prompt.
      displayQuery?: string;
    }
  ) => Promise<void>;
}

/**
 * Returns true when the query looks like a product-search / technical query
 * that warrants showing the requirements skeleton at T=0. Returns false for
 * clearly conversational input ("hi", "what is this?", "explain this") so
 * those queries never flash the skeleton while waiting for the server.
 *
 * The check is intentionally permissive — it only suppresses the skeleton
 * when the query is clearly NOT a search (≤3 words, no digits, no action
 * keywords). Anything ambiguous gets the skeleton, which the token-based
 * suppression will remove if the server responds with chat tokens.
 */
function looksLikeSearchQuery(query: string, forcedSearchMode?: string): boolean {
  if (forcedSearchMode === 'product_search') return true;
  const q = query.trim();
  const words = q.split(/\s+/);
  if (words.length > 4) return true;
  if (/\d/.test(q)) return true;
  if (/\b(find|search|looking\s+for|need|want|show\s+me|get\s+me|source)\b/i.test(q)) return true;
  return false;
}

export function useDeepSearchStream(): UseDeepSearchStreamResult {
  const [aiMessages, setAiMessages] = useState<AISearchMessage[]>([]);
  const [isAILoading, setIsAILoading] = useState(false);
  const [streamingStatusMessage, setStreamingStatusMessage] = useState("");
  // Keep a ref in sync with the latest committed messages so async handlers
  // can read the current value synchronously without relying on React 18's
  // deferred state-updater callbacks (which are batched after `await` calls
  // and otherwise leave chatHistory empty for follow-up requests).
  const aiMessagesRef = useRef<AISearchMessage[]>(aiMessages);
  aiMessagesRef.current = aiMessages;

  // Re-run a single calculation with user-provided value overrides. Hits the
  // /api/openai/calc-regenerate endpoint which reuses executeHybridSearch under
  // the hood. For size_then_search we also swap in the freshly searched product
  // cards; for search_then_size / pure-calc we only replace the calculationSection.
  const regenerateCalculation = async (
    messageId: string,
    overrides: Record<string, string>,
    companyMap: Map<number, any>,
  ) => {
    const msg = aiMessagesRef.current.find(m => m.id === messageId);
    if (!msg || !msg.calculationSection) return;

    const originatingQuery = (() => {
      const idx = aiMessagesRef.current.findIndex(m => m.id === messageId);
      for (let i = idx - 1; i >= 0; i--) {
        if (aiMessagesRef.current[i].isUser && aiMessagesRef.current[i].content) {
          return aiMessagesRef.current[i].content;
        }
      }
      return '';
    })();

    // Build chat history excluding the message being regenerated.
    const priorMessages = aiMessagesRef.current.slice(
      0,
      aiMessagesRef.current.findIndex(m => m.id === messageId)
    );
    const chatHistory = buildChatHistory(priorMessages, { skipHistory: false });

    setAiMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, isRegeneratingCalc: true, regenerateCalcError: null } : m
    ));

    try {
      const resp = await apiRequest('/api/openai/calc-regenerate', {
        method: 'POST',
        body: JSON.stringify({
          query: originatingQuery || 'Regenerate calculation',
          chatHistory,
          calculationSection: msg.calculationSection,
          calculationMode: msg.calculationMode,
          overrides,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const newCalc = resp?.calculationSection as CalculationSection | undefined;
      if (!newCalc) throw new Error('No calculation_section returned');

      // Extract fresh requirements, summary and recommendation from the backend.
      const freshBestFit: string | undefined =
        typeof resp?.bestFit === 'string' && resp.bestFit ? resp.bestFit : undefined;
      const freshAlternativeSuggestion: string | undefined =
        typeof resp?.alternativeSuggestion === 'string' && resp.alternativeSuggestion
          ? resp.alternativeSuggestion
          : undefined;
      const freshRequirements: Requirement[] | undefined =
        Array.isArray(resp?.interpretedRequirements) && resp.interpretedRequirements.length > 0
          ? (resp.interpretedRequirements as Requirement[])
          : undefined;

      // Only replace product cards when the agent actually returned ≥1 card.
      // An empty array means the re-search found nothing — keep the existing
      // cards rather than wiping them ([] is truthy so the old guard was wrong).
      const rawProductCards = resp?.productCards;
      const hasNewProducts = Array.isArray(rawProductCards) && (rawProductCards as HybridProduct[]).length > 0;
      const adaptedProducts: Product[] | null = hasNewProducts
        ? (rawProductCards as HybridProduct[]).map(pc => adaptHybridProduct(pc, companyMap))
        : null;

      // Swap in the freshly searched product cards when the calc message
      // already had products (size_then_search renders calc + results in one
      // card; the server re-runs the search so results reflect the new sizing).
      // We compute the next searchResults ONCE here, from the captured `msg`,
      // and use it for BOTH the UI update and the persisted PATCH below — the
      // ref read after setAiMessages is stale and would persist old products.
      const hadProducts = !!(msg.searchResults?.products?.length);
      const nextSearchResults = adaptedProducts && hadProducts && msg.searchResults
        ? { ...msg.searchResults, products: adaptedProducts }
        : msg.searchResults;

      // Find the requirements message belonging to this turn (the first message
      // with requirements going backwards from the calc card position).
      const calcIdx = aiMessagesRef.current.findIndex(m => m.id === messageId);
      let reqMsgId: string | null = null;
      for (let i = calcIdx - 1; i >= 0; i--) {
        if (aiMessagesRef.current[i].requirements?.length) {
          reqMsgId = aiMessagesRef.current[i].id;
          break;
        }
      }
      const reqMsgSnapshot = reqMsgId
        ? aiMessagesRef.current.find(m => m.id === reqMsgId) ?? null
        : null;

      setAiMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          return {
            ...m,
            calculationSection: newCalc,
            searchResults: nextSearchResults,
            bestFit: freshBestFit !== undefined ? freshBestFit : m.bestFit,
            alternativeSuggestion: freshAlternativeSuggestion !== undefined
              ? freshAlternativeSuggestion
              : m.alternativeSuggestion,
            isRegeneratingCalc: false,
            regenerateCalcError: null,
          };
        }
        if (reqMsgId && m.id === reqMsgId && freshRequirements) {
          return { ...m, requirements: freshRequirements };
        }
        return m;
      }));

      // Persist the updated calculationSection (+ products + summary/rec) so
      // reloading the chat re-renders the new values.
      // Guard: messageId may be a client-side timestamp (~1.78e12) which is
      // way beyond PostgreSQL int32 max (2,147,483,647) — skip the PATCH in
      // that case to avoid a guaranteed 500 error.
      const numericId = parseInt(messageId, 10);
      if (Number.isFinite(numericId) && numericId <= 2_147_483_647) {
        const persistedSearchResults = nextSearchResults
          ? {
              ...nextSearchResults,
              calculationSection: newCalc,
              calculationMode: msg.calculationMode,
              ...(freshBestFit !== undefined ? { bestFit: freshBestFit } : {}),
              ...(freshAlternativeSuggestion !== undefined ? { alternativeSuggestion: freshAlternativeSuggestion } : {}),
            }
          : {
              calculationSection: newCalc,
              calculationMode: msg.calculationMode,
              products: adaptedProducts || [],
              companies: [],
              ...(freshBestFit !== undefined ? { bestFit: freshBestFit } : {}),
              ...(freshAlternativeSuggestion !== undefined ? { alternativeSuggestion: freshAlternativeSuggestion } : {}),
            };
        apiRequest(`/api/chat/messages/${numericId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'complete', searchResults: persistedSearchResults }),
          headers: { 'Content-Type': 'application/json' },
        }).catch(err => console.warn('[calc-regenerate] persist failed', err));

        // Persist the updated requirements message so it survives a reload.
        if (reqMsgId && freshRequirements && reqMsgSnapshot) {
          const reqNumericId = parseInt(reqMsgId, 10);
          if (Number.isFinite(reqNumericId) && reqNumericId <= 2_147_483_647) {
            apiRequest(`/api/chat/messages/${reqNumericId}/status`, {
              method: 'PATCH',
              body: JSON.stringify({
                status: 'complete',
                searchResults: {
                  requirements: freshRequirements,
                  requirementsMode: reqMsgSnapshot.requirementsMode,
                  expertName: reqMsgSnapshot.expertName,
                },
              }),
              headers: { 'Content-Type': 'application/json' },
            }).catch(err => console.warn('[calc-regenerate] persist requirements failed', err));
          }
        }
      }
    } catch (err: any) {
      console.error('[calc-regenerate] failed', err);
      setAiMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, isRegeneratingCalc: false, regenerateCalcError: err?.message || 'Failed to regenerate' }
          : m
      ));
    }
  };

  const upsertMessage = (msg: AISearchMessage) => {
    setAiMessages(prev => {
      const existing = prev.findIndex(m => m.id === msg.id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = msg;
        return next;
      }
      return [...prev, msg];
    });
  };

  const handleAISearch = async (
    searchQuery: string,
    forcedSearchMode?: 'product_search',
    skipHistory?: boolean,
    options?: {
      user: any;
      activeSessionId: number | null;
      setActiveSessionId: (id: number | null) => void;
      setCollapsedSearchGroups: (fn: (prev: Set<string>) => Set<string>) => void;
      setDismissedProductIds: (fn: (prev: Set<number>) => Set<number>) => void;
      companyMap: Map<number, any>;
      saveMessageToSession: (sessionId: number, message: AISearchMessage, user: any) => Promise<void>;
      pendingScrollTargetRef: React.MutableRefObject<string | null>;
      setAnimationActive: (v: boolean) => void;
      setAiQuery: (q: string) => void;
      skipUserMessage?: boolean;
      displayQuery?: string;
    }
  ) => {
    if (!searchQuery.trim()) return;

    const {
      user, activeSessionId, setActiveSessionId, setCollapsedSearchGroups,
      setDismissedProductIds, companyMap, saveMessageToSession,
      pendingScrollTargetRef, setAnimationActive, setAiQuery,
      skipUserMessage, displayQuery,
    } = options || {};

    setAnimationActive?.(false);
    setIsAILoading(true);
    setStreamingStatusMessage("Analyzing your request...");

    setCollapsedSearchGroups?.(prev => {
      const next = new Set(prev);
      setAiMessages(current => {
        current.forEach(msg => {
          if (msg.searchResults?.products?.length) next.add(msg.id);
        });
        return current;
      });
      return next;
    });

    let currentSessionId = activeSessionId ?? null;
    if (user && !currentSessionId) {
      try {
        const newSession = await apiRequest("/api/chat/sessions", {
          method: "POST",
          body: JSON.stringify({ title: searchQuery.slice(0, 50) }),
        });
        currentSessionId = newSession.id;
        setActiveSessionId?.(newSession.id);
        queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      } catch (error) {
        console.error("Error creating chat session:", error);
      }
    }

    // streamingMsgId must be defined before the user message block so the
    // immediate skeleton card can reference it (skeleton id = streamingMsgId-req).
    const streamingMsgId = (Date.now() + 1).toString();

    // In retry mode, the user bubble already exists in the transcript and was
    // persisted on the original attempt — skip adding a duplicate.
    if (!skipUserMessage) {
      const userMessage: AISearchMessage = {
        id: Date.now().toString(),
        content: searchQuery,
        isUser: true,
        timestamp: new Date(),
        ...(displayQuery ? { displayContent: displayQuery } : {}),
      };
      // Only inject the T=0 skeleton when the query looks like a product
      // search. Short conversational queries ("hi", "what is this?",
      // "explain this") skip the skeleton entirely. The heuristic is
      // intentionally conservative: show the skeleton unless the query is
      // clearly conversational (≤3 words with no digits and no search
      // action words). For any query that slips through, the token-based
      // suppression below still removes the skeleton when the first chat
      // token arrives.
      const showImmediateSkeleton = looksLikeSearchQuery(searchQuery, forcedSearchMode);
      if (showImmediateSkeleton) {
        const immediateSkeleton: AISearchMessage = {
          id: `${streamingMsgId}-req`,
          content: '',
          isUser: false,
          timestamp: new Date(),
          requirements: [],
          requirementsMode: 'search',
          requirementsIsLoading: true,
        };
        setAiMessages(prev => [...prev, userMessage, immediateSkeleton]);
      } else {
        setAiMessages(prev => [...prev, userMessage]);
      }

      if (currentSessionId) {
        saveMessageToSession?.(currentSessionId, userMessage, user);
      }

      if (pendingScrollTargetRef) pendingScrollTargetRef.current = userMessage.id;
    }

    // Build chat history synchronously from the ref (always reflects the
    // latest committed state) and append the just-submitted user query so the
    // server-side classifier can see it as the most recent turn even when the
    // setAiMessages above has not flushed yet.
    const builtHistory = buildChatHistory(aiMessagesRef.current, {
      skipHistory,
      appendUserQuery: skipUserMessage ? undefined : searchQuery,
    });
    const resultsMsgId = `${streamingMsgId}-results`;
    const recMsgId = `${streamingMsgId}-rec`;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 180000);
    // Server-side placeholder row id (received via 'message_placeholder' event).
    // Declared at function scope so the catch / finally blocks can reference it.
    // When set, the server is the source of truth for the main AI response row,
    // so the client must NOT also POST it to /api/chat/sessions/:id/messages.
    let serverPlaceholderId: number | null = null;

    try {
      const response = await fetch('/api/openai/agent-search-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          mode: 'hybrid',
          searchMode: forcedSearchMode || undefined,
          chatHistory: builtHistory,
          // Pass currentSessionId so the server can create a placeholder row
          // we can later mark failed on disconnect / restore on refresh.
          sessionId: currentSessionId ?? undefined,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) throw new Error('Search request failed');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('Stream not available');


      let buffer = '';
      let collectedProducts: Product[] = [];
      let tokenText = '';
      let decisionSummary = '';
      let bestFit = '';
      let alternativeSuggestion = '';
      let searchGuidance = '';
      let alternativeSearches: { label: string; query: string }[] | undefined;
      let chatSummary = '';
      let bomTable: BomItem[] = [];
      let bomSummary = '';
      let engineeringNotes = '';
      let comparisonTable: ComparisonTableData | undefined;
      let calculationSection: CalculationSection | undefined;
      let calculationMode: 'size_then_search' | 'search_then_size' | undefined;
      let collectedRequirements: Requirement[] = [];
      let collectedRequirementsMode: 'build' | 'search' | undefined;
      let collectedExpertName: string | undefined;
      let collectedIntent: string | undefined;
      let heartbeatBuffer = '';
      let inHeartbeat = false;
      const seenProductIds = new Set<number>();
      // True once a `requirements_skeleton` SSE event has arrived, meaning
      // the server classified this as a search/build/calc intent. If the
      // first `token` event arrives before this is set, the query is
      // general_chat and the T=0 skeleton should be removed immediately.
      let skeletonConfirmed = false;

      const localUpsert = (msg: AISearchMessage) => {
        setAiMessages(prev => {
          const existing = prev.findIndex(m => m.id === msg.id);
          if (existing >= 0) {
            const next = [...prev];
            next[existing] = msg;
            return next;
          }
          return [...prev, msg];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);

            if (data.type === 'message_placeholder') {
              const pid = data?.payload?.messageId;
              if (typeof pid === 'number' && Number.isFinite(pid)) {
                serverPlaceholderId = pid;
              }
            } else if (data.type === 'preliminary_response') {
              const prelimMsg: AISearchMessage = {
                id: `${streamingMsgId}-prelim`,
                content: data.message || '',
                isUser: false,
                timestamp: new Date(),
              };
              setAiMessages(prev => {
                const existing = prev.findIndex(m => m.id === prelimMsg.id);
                if (existing >= 0) return prev;
                const streamIdx = prev.findIndex(m => m.id === streamingMsgId);
                if (streamIdx >= 0) {
                  const next = [...prev];
                  next.splice(streamIdx, 0, prelimMsg);
                  return next;
                }
                return [...prev, prelimMsg];
              });
            } else if (data.type === 'status') {
              setStreamingStatusMessage(data.message || '');
            } else if (data.type === 'token') {
              const delta = data.delta || data.message || '';
              if (delta === '>' && !inHeartbeat) {
                inHeartbeat = true;
                heartbeatBuffer = '>';
                continue;
              }
              if (inHeartbeat) {
                if (delta === '\n') {
                  if (heartbeatBuffer.match(/^>\s.*\(\d+s\)$/)) {
                    heartbeatBuffer = '';
                    inHeartbeat = false;
                    continue;
                  }
                  tokenText += heartbeatBuffer + '\n';
                  heartbeatBuffer = '';
                  inHeartbeat = false;
                  continue;
                }
                heartbeatBuffer += delta;
                continue;
              }
              // First token without a prior requirements_skeleton means this
              // is a general_chat response — remove the T=0 skeleton immediately.
              if (!skeletonConfirmed) {
                skeletonConfirmed = true; // prevent repeated removes
                const skeletonId = `${streamingMsgId}-req`;
                setAiMessages(prev => prev.filter(m => m.id !== skeletonId));
              }
              tokenText += delta;
            } else if (data.type === 'requirements_skeleton') {
              // Emitted right after classification — before the agent runs.
              // Adds a blurred placeholder panel so the user sees loading state
              // immediately instead of waiting 30-50 s for real requirements.
              const skeletonMode = data.mode === 'build' ? 'build' : 'search';
              const skeletonId = `${streamingMsgId}-req`;
              setAiMessages(prev => {
                if (prev.some(m => m.id === skeletonId)) return prev;
                const skeleton: AISearchMessage = {
                  id: skeletonId,
                  content: '',
                  isUser: false,
                  timestamp: new Date(),
                  requirements: [],
                  requirementsMode: skeletonMode,
                  requirementsIsLoading: true,
                };
                const streamIdx = prev.findIndex(m => m.id === streamingMsgId);
                if (streamIdx >= 0) {
                  const next = [...prev];
                  next.splice(streamIdx, 0, skeleton);
                  return next;
                }
                return [...prev, skeleton];
              });
              // Confirm the skeleton — suppresses removal on first token
              skeletonConfirmed = true;
              // Scroll the skeleton card into view so it's definitely visible
              if (pendingScrollTargetRef) pendingScrollTargetRef.current = skeletonId;
            } else if (data.type === 'requirements') {
              const reqs = data.data;
              const mode = data.mode === 'build' ? 'build' : 'search';
              if (reqs && Array.isArray(reqs) && reqs.length > 0) {
                const reqMsg: AISearchMessage = {
                  id: `${streamingMsgId}-req`,
                  content: 'I understood your requirements:',
                  isUser: false,
                  timestamp: new Date(),
                  requirements: reqs,
                  requirementsMode: mode,
                  requirementsIsLoading: false,
                  expertName: data.expert_name || undefined,
                };
                setAiMessages(prev => {
                  const existing = prev.findIndex(m => m.id === reqMsg.id);
                  if (existing >= 0) {
                    // Update the skeleton placeholder with real requirements
                    const next = [...prev];
                    next[existing] = reqMsg;
                    return next;
                  }
                  const streamIdx = prev.findIndex(m => m.id === streamingMsgId);
                  if (streamIdx >= 0) {
                    const next = [...prev];
                    next.splice(streamIdx, 0, reqMsg);
                    return next;
                  }
                  return [...prev, reqMsg];
                });
              }
            } else if (data.type === 'bom_table') {
              if (Array.isArray(data.data)) bomTable = data.data;
              if (data.bomSummary) bomSummary = data.bomSummary;
              if (data.engineeringNotes) engineeringNotes = data.engineeringNotes;
              const bomMsgId = `${streamingMsgId}-bom`;
              localUpsert({
                id: bomMsgId,
                content: '',
                isUser: false,
                timestamp: new Date(),
                bomTable: [...bomTable],
                bomSummary,
                engineeringNotes,
              });
            } else if (data.type === 'comparison_table') {
              if (data.data && Array.isArray(data.data.products) && Array.isArray(data.data.rows)) {
                comparisonTable = { products: data.data.products, rows: data.data.rows };
                if (collectedProducts.length > 0) {
                  localUpsert({
                    id: resultsMsgId,
                    content: '',
                    isUser: false,
                    timestamp: new Date(),
                    searchResults: { companies: [], products: [...collectedProducts] },
                    isStreaming: true,
                    comparisonTable,
                  });
                }
              }
            } else if (data.type === 'calculation_section') {
              if (data.data && typeof data.data.title === 'string') {
                calculationSection = data.data as CalculationSection;
              }
            } else if (data.type === 'decision_summary') {
              decisionSummary = data.message || data.data || '';
              bestFit = data.bestFit || '';
              alternativeSuggestion = data.alternativeSuggestion || '';
              searchGuidance = data.searchGuidance || '';
              localUpsert({
                id: resultsMsgId,
                content: '',
                isUser: false,
                timestamp: new Date(),
                searchResults: { companies: [], products: [...collectedProducts] },
                isStreaming: true,
                recommendation: decisionSummary,
                bestFit,
                alternativeSuggestion,
                searchGuidance,
              });
            } else if (data.type === 'chat_summary') {
              chatSummary = data.message || data.data || '';
            } else if (data.type === 'product_card') {
              const adapted = adaptHybridProduct(data.data as HybridProduct, companyMap || new Map());
              if (!seenProductIds.has(adapted.id)) {
                seenProductIds.add(adapted.id);
                collectedProducts.push(adapted);
                setDismissedProductIds?.(prev => {
                  const updated = new Set(Array.from(prev).filter(id => id !== adapted.id));
                  return updated;
                });
                localUpsert({
                  id: resultsMsgId,
                  content: '',
                  isUser: false,
                  timestamp: new Date(),
                  searchResults: { companies: [], products: [...collectedProducts] },
                  isStreaming: true,
                });
              }
            } else if (data.type === 'result') {
              if (data.data?.interpreted_requirements?.length > 0) {
                if (collectedRequirements.length === 0) {
                  collectedRequirements = data.data.interpreted_requirements;
                  collectedRequirementsMode = data.data?.requirements_mode || undefined;
                  collectedExpertName = data.data?.classification?.expert_name || undefined;
                  collectedIntent = data.data?.classification?.intent || collectedIntent;
                }
                const reqMsgId = `${streamingMsgId}-req`;
                setAiMessages(prev => {
                  if (prev.some(m => m.id === reqMsgId)) return prev;
                  const reqMsg: AISearchMessage = {
                    id: reqMsgId,
                    content: 'I understood your requirements:',
                    isUser: false,
                    timestamp: new Date(),
                    requirements: data.data.interpreted_requirements,
                    expertName: data.data?.classification?.expert_name || undefined,
                  };
                  const streamIdx = prev.findIndex(m => m.id === streamingMsgId);
                  if (streamIdx >= 0) {
                    const next = [...prev];
                    next.splice(streamIdx, 0, reqMsg);
                    return next;
                  }
                  return [...prev, reqMsg];
                });
              }
              if (data.data?.decision_summary && !decisionSummary) decisionSummary = typeof data.data.decision_summary === 'string' ? data.data.decision_summary : '';
              if (data.data?.classification?.intent && !collectedIntent) collectedIntent = data.data.classification.intent;
              if (data.data?.classification?.strategy?.calculation_mode && !calculationMode) calculationMode = data.data.classification.strategy.calculation_mode as 'size_then_search' | 'search_then_size';
              if (data.data?.best_fit && !bestFit) bestFit = data.data.best_fit;
              if (data.data?.alternative_suggestion && !alternativeSuggestion) alternativeSuggestion = data.data.alternative_suggestion;
              if (data.data?.search_guidance && !searchGuidance) searchGuidance = data.data.search_guidance;
              if (data.data?.alternative_searches && Array.isArray(data.data.alternative_searches) && !alternativeSearches) {
                alternativeSearches = data.data.alternative_searches.filter((x: any) => x && typeof x.label === 'string' && typeof x.query === 'string');
              }
              if (data.data?.bom_table && Array.isArray(data.data.bom_table) && bomTable.length === 0) bomTable = data.data.bom_table;
              if (data.data?.bom_summary && !bomSummary) bomSummary = data.data.bom_summary;
              if (data.data?.engineering_notes && !engineeringNotes) engineeringNotes = data.data.engineering_notes;
              if (data.data?.comparison_table && !comparisonTable && Array.isArray(data.data.comparison_table.products)) comparisonTable = data.data.comparison_table;
              if (data.data?.calculation_section && !calculationSection && typeof data.data.calculation_section.title === 'string') calculationSection = data.data.calculation_section as CalculationSection;
              if (data.data?.chat_summary && !chatSummary) chatSummary = data.data.chat_summary;
              if (data.data?.product_cards?.length > 0) {
                for (const pc of data.data.product_cards) {
                  const adapted = adaptHybridProduct(pc as HybridProduct, companyMap || new Map());
                  if (!seenProductIds.has(adapted.id)) {
                    seenProductIds.add(adapted.id);
                    collectedProducts.push(adapted);
                  }
                }
              }
            } else if (data.type === 'error') {
              throw new Error(data.error || 'Search error');
            }
          } catch (parseErr: any) {
            if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
          }
        }
      }

      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (data.type === 'result') {
            if (data.data?.decision_summary && !decisionSummary) decisionSummary = typeof data.data.decision_summary === 'string' ? data.data.decision_summary : '';
            if (data.data?.classification?.intent && !collectedIntent) collectedIntent = data.data.classification.intent;
            if (data.data?.classification?.strategy?.calculation_mode && !calculationMode) calculationMode = data.data.classification.strategy.calculation_mode as 'size_then_search' | 'search_then_size';
            if (data.data?.best_fit && !bestFit) bestFit = data.data.best_fit;
            if (data.data?.alternative_suggestion && !alternativeSuggestion) alternativeSuggestion = data.data.alternative_suggestion;
            if (data.data?.search_guidance && !searchGuidance) searchGuidance = data.data.search_guidance;
            if (data.data?.alternative_searches && Array.isArray(data.data.alternative_searches) && !alternativeSearches) {
              alternativeSearches = data.data.alternative_searches.filter((x: any) => x && typeof x.label === 'string' && typeof x.query === 'string');
            }
            if (data.data?.bom_table && Array.isArray(data.data.bom_table) && bomTable.length === 0) bomTable = data.data.bom_table;
            if (data.data?.bom_summary && !bomSummary) bomSummary = data.data.bom_summary;
            if (data.data?.engineering_notes && !engineeringNotes) engineeringNotes = data.data.engineering_notes;
            if (data.data?.comparison_table && !comparisonTable && Array.isArray(data.data.comparison_table.products)) comparisonTable = data.data.comparison_table;
            if (data.data?.calculation_section && !calculationSection && typeof data.data.calculation_section.title === 'string') calculationSection = data.data.calculation_section as CalculationSection;
            if (data.data?.chat_summary && !chatSummary) chatSummary = data.data.chat_summary;
            if (data.data?.product_cards?.length > 0) {
              for (const pc of data.data.product_cards) {
                const adapted = adaptHybridProduct(pc as HybridProduct, companyMap || new Map());
                if (!seenProductIds.has(adapted.id)) {
                  seenProductIds.add(adapted.id);
                  collectedProducts.push(adapted);
                }
              }
            }
          }
        } catch (_) {}
      }

      const finalRecommendation = chatSummary || decisionSummary || tokenText || "I couldn't find specific results for your query. Could you try rephrasing or being more specific?";
      const bomMsgId = `${streamingMsgId}-bom`;
      const hasCalc = !!calculationSection;
      const isCalcQuery = collectedIntent === 'calculation_search';

      // Fallback: if the classifier returned calculation_search but
      // calculationMode was never emitted in the SSE stream, default to
      // 'size_then_search'. This ensures Recalculate always re-runs the
      // product search for sizing queries even when the stream omits the field.
      if (isCalcQuery && !calculationMode) {
        calculationMode = 'size_then_search';
      }

      if (bomTable.length > 0) {
        localUpsert({ id: bomMsgId, content: '', isUser: false, timestamp: new Date(), bomTable: [...bomTable], bomSummary, engineeringNotes, isFromHistory: true });
      }

      if (collectedProducts.length > 0) {
        localUpsert({
          id: resultsMsgId,
          content: '',
          isUser: false,
          timestamp: new Date(),
          searchResults: { companies: [], products: [...collectedProducts] },
          calculationSection: calculationSection || undefined,
          calculationMode: calculationMode || undefined,
          calculationNote: !hasCalc && isCalcQuery ? (finalRecommendation ? wrapBareMath(finalRecommendation) : undefined) : undefined,
          isFromHistory: true,
          recommendation: hasCalc || !isCalcQuery ? finalRecommendation : undefined,
          bestFit: bestFit || undefined,
          alternativeSuggestion: alternativeSuggestion || undefined,
          searchGuidance: searchGuidance || undefined,
          comparisonTable: comparisonTable || undefined,
        });
      } else if (calculationSection) {
        localUpsert({ id: resultsMsgId, content: '', isUser: false, timestamp: new Date(), calculationSection, isFromHistory: true });
      } else if (bomTable.length === 0 && !comparisonTable) {
        localUpsert({ id: resultsMsgId, content: finalRecommendation, isUser: false, timestamp: new Date(), alternativeSearches: alternativeSearches?.length ? alternativeSearches : undefined });
      }

      if (comparisonTable && collectedProducts.length === 0) {
        const cmpMsgId = `${streamingMsgId}-cmp`;
        localUpsert({ id: cmpMsgId, content: '', isUser: false, timestamp: new Date(), comparisonTable, isFromHistory: true });
      }

      // Remove the skeleton requirements placeholder if no real requirements
      // arrived (e.g. general_chat query that got a requirements_skeleton).
      const skeletonId = `${streamingMsgId}-req`;
      if (collectedRequirements.length === 0) {
        setAiMessages(prev => prev.filter(m => m.id !== skeletonId));
      }

      setAiMessages(prev => prev.filter(m => m.id !== streamingMsgId && m.id !== recMsgId));

      const savedResponse: AISearchMessage = {
        id: resultsMsgId,
        content: collectedProducts.length > 0 ? '' : (bomTable.length > 0 ? '' : (comparisonTable ? '' : (calculationSection ? '' : finalRecommendation))),
        isUser: false,
        timestamp: new Date(),
        searchResults: collectedProducts.length > 0 ? { companies: [], products: collectedProducts } : undefined,
        recommendation: collectedProducts.length > 0 && (hasCalc || !isCalcQuery) ? finalRecommendation : undefined,
        calculationNote: collectedProducts.length > 0 && !hasCalc && isCalcQuery ? (finalRecommendation ? wrapBareMath(finalRecommendation) : undefined) : undefined,
        bestFit: collectedProducts.length > 0 ? (bestFit || undefined) : undefined,
        alternativeSuggestion: collectedProducts.length > 0 ? (alternativeSuggestion || undefined) : undefined,
        searchGuidance: collectedProducts.length > 0 ? (searchGuidance || undefined) : undefined,
        bomTable: bomTable.length > 0 ? bomTable : undefined,
        bomSummary: bomSummary || undefined,
        engineeringNotes: engineeringNotes || undefined,
        comparisonTable: comparisonTable || undefined,
        calculationSection: calculationSection || undefined,
        calculationMode: calculationMode || undefined,
        isFromHistory: true,
      };

      if (currentSessionId) {
        // When the server created a placeholder row, it has also persisted the
        // requirements + BOM rows server-side (in the correct order before the
        // placeholder). Skip all client-side saves in that case to avoid
        // duplicates and to keep the saved-row order matching the live UI:
        //   user → requirements → BOM → results (placeholder).
        // Otherwise (no placeholder = anonymous / no session), persist each
        // message sequentially with awaits so their auto-increment ids match
        // the visual order shown to the user.
        if (serverPlaceholderId === null) {
          if (collectedRequirements.length > 0) {
            await saveMessageToSession?.(currentSessionId, {
              id: `${streamingMsgId}-req`,
              content: 'I understood your requirements:',
              isUser: false,
              timestamp: new Date(),
              requirements: collectedRequirements,
              requirementsMode: collectedRequirementsMode,
              expertName: collectedExpertName,
            }, user);
          }
          if (bomTable.length > 0) {
            await saveMessageToSession?.(currentSessionId, {
              id: bomMsgId,
              content: '',
              isUser: false,
              timestamp: new Date(),
              bomTable: [...bomTable],
              bomSummary: bomSummary || undefined,
              engineeringNotes: engineeringNotes || undefined,
              isFromHistory: true,
            }, user);
          }
          if (collectedProducts.length > 0 || bomTable.length === 0) {
            await saveMessageToSession?.(currentSessionId, savedResponse, user);
          }
        }
      }

      clearTimeout(timeoutId);
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error("AI search error:", error);
      const isTimeout = error?.name === 'AbortError';
      const errorContent = isTimeout
        ? "The search request timed out. Please try a simpler query or try again."
        : "I'm having trouble processing your request. Please try again.";

      // Defensive client-side mark-as-failed (the server already does this on
      // res.on('close'), but a redundant PATCH is safe and idempotent).
      if (serverPlaceholderId !== null) {
        try {
          await apiRequest(`/api/chat/messages/${serverPlaceholderId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'failed' }),
          });
          queryClient.invalidateQueries({ queryKey: ['/api/chat/sessions'] });
        } catch (patchErr) {
          console.warn('Failed to PATCH placeholder status:', patchErr);
        }
      }

      // Preserve any partial content the user already saw — only inject the
      // generic error bubble when there is genuinely nothing to keep.
      setAiMessages(prev => {
        const existing = prev.find(m => m.id === resultsMsgId);
        const hasPartial = !!existing && (
          !!existing.content ||
          !!existing.searchResults?.products?.length ||
          !!existing.bomTable?.length ||
          !!existing.comparisonTable ||
          !!existing.calculationSection ||
          !!existing.recommendation
        );
        if (hasPartial) {
          return prev.map(m =>
            m.id === resultsMsgId
              ? { ...m, isStreaming: false, status: 'failed' as const, retryQuery: searchQuery }
              : m,
          );
        }
        const withoutStale = prev.filter(m => m.id !== streamingMsgId && m.id !== resultsMsgId && m.id !== recMsgId);
        return [
          ...withoutStale,
          {
            id: resultsMsgId,
            content: errorContent,
            isUser: false,
            timestamp: new Date(),
            isFromHistory: true,
            status: 'failed' as const,
            retryQuery: searchQuery,
          },
        ];
      });
    } finally {
      setIsAILoading(false);
      setStreamingStatusMessage("");
      setAiQuery?.("");
    }
  };

  return { aiMessages, setAiMessages, isAILoading, streamingStatusMessage, handleAISearch, regenerateCalculation };
}
