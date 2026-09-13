import { useCallback, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { recoverRawJsonMessage } from "../utils/recoverRawJson";
import { adaptHybridProduct } from "../utils/productAdapters";
import type { AISearchMessage, Company, HybridProduct, Product } from "../types";

const ACTIVE_SESSION_STORAGE_KEY = "ds_active_session_id";
const MESSAGES_PAGE_SIZE = 10;

interface UseSessionManagerResult {
  activeSessionId: number | null;
  setActiveSessionId: (id: number | null) => void;
  hasMoreMessages: boolean;
  isLoadingOlderMessages: boolean;
  handleSelectSession: (
    sessionId: number,
    setAiMessages: (msgs: AISearchMessage[]) => void,
    setCollapsedSearchGroups: (s: Set<string>) => void,
    setDismissedProductIds: (s: Set<number>) => void,
    setDismissedCompanyIds: (s: Set<number>) => void,
    setIsSidebarOpen: (open: boolean) => void,
    companyMap?: Map<number, Company>,
  ) => Promise<void>;
  loadOlderMessages: (
    sessionId: number,
    beforeId: number,
    setAiMessages: React.Dispatch<React.SetStateAction<AISearchMessage[]>>,
    companyMap?: Map<number, Company>,
  ) => Promise<void>;
  handleDeleteSession: (
    sessionId: number,
    setAiMessages: (msgs: AISearchMessage[]) => void,
    setAiQuery: (q: string) => void,
    setCollapsedSearchGroups: (s: Set<string>) => void,
  ) => void;
  saveMessageToSession: (sessionId: number, message: AISearchMessage, user: any) => Promise<void>;
}

function readPersistedSessionId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writePersistedSessionId(id: number | null) {
  if (typeof window === "undefined") return;
  try {
    if (id === null) window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    else window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, String(id));
  } catch {
    /* storage may be unavailable (private mode, etc.) — fail silently */
  }
}

function formatSessionMessages(messages: any[], companyMap?: Map<number, Company>): AISearchMessage[] {
  return messages.map((msg: any) => {
    const recovered = recoverRawJsonMessage(msg);
    const sr: any = recovered.searchResults || undefined;

    // If the server saved raw `productCards` (HybridProduct[]) we need to adapt
    // them to UI `Product[]` using the company map. Existing `products` (already
    // adapted by older client-side saves) take precedence.
    let products: Product[] | undefined = sr?.products;
    if ((!products || products.length === 0) && Array.isArray(sr?.productCards) && sr.productCards.length > 0) {
      const map = companyMap ?? new Map<number, Company>();
      products = (sr.productCards as HybridProduct[]).map((pc) => adaptHybridProduct(pc, map));
    }

    const finalSearchResults = sr
      ? { ...sr, products: products || sr.products || [], companies: sr.companies || [] }
      : undefined;

    const rawStatus = (msg as any)?.status;
    const status: AISearchMessage["status"] =
      rawStatus === "streaming" || rawStatus === "failed" ? rawStatus : "complete";

    return {
      id: recovered.id.toString(),
      content: recovered.content,
      isUser: recovered.isUser,
      timestamp: new Date(recovered.createdAt),
      searchResults: finalSearchResults,
      suggestions: recovered.suggestions,
      isFromHistory: true,
      status,
      recommendation: sr?.recommendation,
      calculationNote: sr?.calculationNote,
      bestFit: sr?.bestFit,
      alternativeSuggestion: sr?.alternativeSuggestion,
      searchGuidance: sr?.searchGuidance,
      alternativeSearches: sr?.alternativeSearches,
      bomTable: sr?.bomTable,
      bomSummary: sr?.bomSummary,
      engineeringNotes: sr?.engineeringNotes,
      comparisonTable: sr?.comparisonTable,
      calculationSection: sr?.calculationSection,
      calculationMode: sr?.calculationMode,
      requirements: sr?.requirements,
      requirementsMode: sr?.requirementsMode,
      expertName: sr?.expertName,
      displayContent: sr?.displayContent,
    };
  });
}

export function useSessionManager(): UseSessionManagerResult {
  const [activeSessionId, _setActiveSessionId] = useState<number | null>(() => readPersistedSessionId());
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);

  const setActiveSessionId = useCallback((id: number | null) => {
    _setActiveSessionId(id);
    writePersistedSessionId(id);
  }, []);

  const handleSelectSession = async (
    sessionId: number,
    setAiMessages: (msgs: AISearchMessage[]) => void,
    setCollapsedSearchGroups: (s: Set<string>) => void,
    setDismissedProductIds: (s: Set<number>) => void,
    setDismissedCompanyIds: (s: Set<number>) => void,
    setIsSidebarOpen: (open: boolean) => void,
    companyMap?: Map<number, Company>,
  ) => {
    setActiveSessionId(sessionId);
    setDismissedProductIds(new Set());
    setDismissedCompanyIds(new Set());
    try {
      const response = await apiRequest(`/api/chat/sessions/${sessionId}/messages?limit=${MESSAGES_PAGE_SIZE}`);
      // Handle both paginated `{messages, hasMore}` and legacy raw-array shapes.
      const rawMessages: any[] = Array.isArray(response) ? response : (response?.messages || []);
      const formattedMessages = formatSessionMessages(rawMessages, companyMap);
      setHasMoreMessages(Array.isArray(response) ? false : !!response?.hasMore);
      setAiMessages(formattedMessages);
      const productMsgIds = formattedMessages
        .filter((m) => m.searchResults?.products?.length)
        .map((m) => m.id);
      if (productMsgIds.length > 1) {
        setCollapsedSearchGroups(new Set(productMsgIds.slice(0, -1)));
      } else {
        setCollapsedSearchGroups(new Set());
      }
      setIsSidebarOpen(false);
    } catch (error: any) {
      console.error("Error loading session messages:", error);
      // 404 → session was deleted out from under us; clear persistence.
      if (typeof error?.message === "string" && error.message.includes("404")) {
        setActiveSessionId(null);
      }
    }
  };

  const loadOlderMessages = async (
    sessionId: number,
    beforeId: number,
    setAiMessages: React.Dispatch<React.SetStateAction<AISearchMessage[]>>,
    companyMap?: Map<number, Company>,
  ) => {
    if (isLoadingOlderMessages) return;
    setIsLoadingOlderMessages(true);
    try {
      const response = await apiRequest(
        `/api/chat/sessions/${sessionId}/messages?limit=${MESSAGES_PAGE_SIZE}&before=${beforeId}`,
      );
      const rawMessages: any[] = Array.isArray(response) ? response : (response?.messages || []);
      const older = formatSessionMessages(rawMessages, companyMap);
      setHasMoreMessages(Array.isArray(response) ? false : !!response?.hasMore);
      if (older.length > 0) {
        setAiMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const deduped = older.filter((m) => !existingIds.has(m.id));
          return [...deduped, ...prev];
        });
      }
    } catch (error) {
      console.error("Error loading older messages:", error);
    } finally {
      setIsLoadingOlderMessages(false);
    }
  };

  const handleDeleteSession = (
    sessionId: number,
    setAiMessages: (msgs: AISearchMessage[]) => void,
    setAiQuery: (q: string) => void,
    setCollapsedSearchGroups: (s: Set<string>) => void,
  ) => {
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setAiMessages([]);
      setAiQuery("");
      setCollapsedSearchGroups(new Set());
      setHasMoreMessages(false);
    }
  };

  const saveMessageToSession = async (sessionId: number, message: AISearchMessage, user: any) => {
    if (!user) return;
    try {
      const searchResultsPayload = message.searchResults
        ? {
            ...message.searchResults,
            bestFit: message.bestFit,
            alternativeSuggestion: message.alternativeSuggestion,
            searchGuidance: message.searchGuidance,
            alternativeSearches: message.alternativeSearches,
            recommendation: message.recommendation,
            calculationNote: message.calculationNote,
            bomTable: message.bomTable,
            bomSummary: message.bomSummary,
            engineeringNotes: message.engineeringNotes,
            comparisonTable: message.comparisonTable,
            calculationSection: message.calculationSection,
            requirements: message.requirements,
            requirementsMode: message.requirementsMode,
            expertName: message.expertName,
          }
        : message.requirements?.length
          ? { requirements: message.requirements, requirementsMode: message.requirementsMode, expertName: message.expertName }
          : message.bomTable
            ? { bomTable: message.bomTable, bomSummary: message.bomSummary, engineeringNotes: message.engineeringNotes }
            : message.comparisonTable
              ? { comparisonTable: message.comparisonTable }
              : message.calculationSection
                ? { calculationSection: message.calculationSection }
                : message.alternativeSearches?.length
                  ? { alternativeSearches: message.alternativeSearches }
                  : message.isUser && message.displayContent
                    ? { displayContent: message.displayContent }
                    : null;
      // Attach displayContent to searchResults payload for user messages so it
      // survives persistence and can be restored on history replay.
      const finalPayload = message.isUser && message.displayContent && searchResultsPayload
        ? { ...searchResultsPayload, displayContent: message.displayContent }
        : searchResultsPayload;
      await apiRequest(`/api/chat/sessions/${sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          content: message.content,
          isUser: message.isUser,
          searchResults: finalPayload,
          suggestions: message.suggestions || null,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
    } catch (error) {
      console.error("Error saving message to session:", error);
    }
  };

  return {
    activeSessionId,
    setActiveSessionId,
    hasMoreMessages,
    isLoadingOlderMessages,
    handleSelectSession,
    loadOlderMessages,
    handleDeleteSession,
    saveMessageToSession,
  };
}

export { formatSessionMessages };
