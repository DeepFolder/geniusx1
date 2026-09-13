import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { RequirementsMessage } from "./message-types/RequirementsMessage";
import { BomTableMessage } from "./message-types/BomTableMessage";
import { StandaloneComparisonMessage } from "./message-types/StandaloneComparisonMessage";
import { CalculationMessage } from "./message-types/CalculationMessage";
import { ResultsTableMessage } from "./message-types/ResultsTableMessage";
import { TextMessage } from "./message-types/TextMessage";
import { ExploreMessage } from "./message-types/ExploreMessage";
import type { AISearchMessage, Company } from "../types";

function containsMath(content: string | null | undefined): boolean {
  return /\\\(|\\\[/.test(content ?? '');
}

interface ChatMessagesProps {
  aiMessages: AISearchMessage[];
  isAILoading: boolean;
  streamingStatusMessage: string;
  spacerHeight: number;
  chatScrollRef: React.RefObject<HTMLDivElement>;
  companyMap: Map<number, Company>;
  userFollows: { id: number; companyId: number }[];
  webSearchEngine: { name: string; colorClass: string };
  buildWebSearchUrl: (q: string) => string;
  onFollowCompany: (e: React.MouseEvent, companyId: number, companyName: string) => void;
  onSearchBomItem: (query: string) => void;
  onSearchAlternative?: (query: string) => void;
  headerContent?: React.ReactNode;
  hasMoreMessages?: boolean;
  isLoadingOlderMessages?: boolean;
  onLoadOlderMessages?: () => void;
  onRetry?: (originatingQuery: string, failedMessageId: string) => void;
  onRegenerateCalc?: (messageId: string, overrides: Record<string, string>) => void | Promise<void>;
  onExplore?: (productName: string, companyName: string, info?: { attributes?: { label: string; value: string; unit?: string }[]; catalogPath?: string; productWebLink?: string }) => void;
  onExtendSearch?: (originalQuery: string) => void;
}

export function ChatMessages({
  aiMessages,
  isAILoading,
  streamingStatusMessage,
  spacerHeight,
  chatScrollRef,
  companyMap,
  userFollows,
  webSearchEngine,
  buildWebSearchUrl,
  onFollowCompany,
  onSearchBomItem,
  onSearchAlternative,
  headerContent,
  hasMoreMessages,
  isLoadingOlderMessages,
  onLoadOlderMessages,
  onRetry,
  onRegenerateCalc,
  onExplore,
  onExtendSearch,
}: ChatMessagesProps) {
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const [reqVisible, setReqVisible] = useState(false);
  const [reqDataVisible, setReqDataVisible] = useState(false);
  const reqTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqDataTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Two-phase timer so the user always sees skeleton → data population:
  // Phase 1 (10s): card appears in forced-skeleton mode
  // Phase 2 (14s): real rows reveal with staggered animation (600ms per row)
  useEffect(() => {
    if (isAILoading) {
      reqTimerRef.current = setTimeout(() => {
        setReqVisible(true);
        reqDataTimerRef.current = setTimeout(() => setReqDataVisible(true), 4000);
      }, 15000);
    } else {
      if (reqTimerRef.current) { clearTimeout(reqTimerRef.current); reqTimerRef.current = null; }
      if (reqDataTimerRef.current) { clearTimeout(reqDataTimerRef.current); reqDataTimerRef.current = null; }
      setReqVisible(false);
      setReqDataVisible(false);
    }
    return () => {
      if (reqTimerRef.current) { clearTimeout(reqTimerRef.current); reqTimerRef.current = null; }
      if (reqDataTimerRef.current) { clearTimeout(reqDataTimerRef.current); reqDataTimerRef.current = null; }
    };
  }, [isAILoading]);

  // Top sentinel → trigger lazy-loading older messages when it becomes visible.
  useEffect(() => {
    const node = topSentinelRef.current;
    if (!node || !hasMoreMessages || !onLoadOlderMessages) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isLoadingOlderMessages) {
          onLoadOlderMessages();
        }
      },
      { root: chatScrollRef.current ?? null, rootMargin: "100px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMoreMessages, isLoadingOlderMessages, onLoadOlderMessages, chatScrollRef, aiMessages.length]);

  // For each AI message we may need the immediately-preceding user message (if any)
  // so the Retry button can replay it. We compute it in-line per message.
  const lastUserContentBefore = (idx: number): string | undefined => {
    for (let i = idx - 1; i >= 0; i--) {
      if (aiMessages[i].isUser && aiMessages[i].content) return aiMessages[i].content;
    }
    return undefined;
  };

  // The active requirements message for the current search — pulled out of the
  // main loop so it can be rendered BELOW the ThinkingIndicator.
  const activeReqMsg = isAILoading
    ? aiMessages.find((m, i) => {
        if (m.isUser) return false;
        const isReq = !!m.requirements?.length || !!m.requirementsIsLoading;
        if (!isReq) return false;
        const hasResultsAfter = aiMessages
          .slice(i + 1)
          .some((n) => !n.isUser && !!n.searchResults?.products?.length && !n.content);
        return !hasResultsAfter && (m.requirementsIsLoading || m.requirementsMode === 'search');
      })
    : undefined;

  return (
    <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 flex flex-col">
      <div className={cn("max-w-4xl mx-auto w-full", aiMessages.length === 0 && "flex-1 flex items-center justify-center")}>
        {aiMessages.length === 0 ? (
          headerContent
        ) : (
          <>
            {/* Top sentinel + loading indicator for older-message pagination */}
            {hasMoreMessages && (
              <div ref={topSentinelRef} className="flex items-center justify-center py-3">
                {isLoadingOlderMessages ? (
                  <Loader2 className="w-4 h-4 animate-spin text-purple-500" data-testid="loading-older-messages" />
                ) : (
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">Scroll up for older messages</span>
                )}
              </div>
            )}

            {aiMessages.map((message, idx) => {
              // Only look at messages that come AFTER this one in the same turn.
              const hasResultsTableAfterThis = aiMessages.slice(idx + 1).some(
                (m) => !m.isUser && !!m.searchResults?.products?.length && !m.content,
              );
              const hasResultsProducts = !!(message.searchResults?.products?.length);
              const hasComparisonData = !!(message.comparisonTable?.products.length && message.comparisonTable.rows.length);
              const isResultsTable = !message.isUser && hasResultsProducts && !message.content;
              const isRequirementsTable = !message.isUser && (!!message.requirements?.length || !!message.requirementsIsLoading);
              const isBomTable = !message.isUser && !!message.bomTable?.length && !message.content;
              const isComparisonTable = hasComparisonData && !message.content && !hasResultsProducts;
              const isCalculationCard = !message.isUser && !!message.calculationSection && !message.content && !hasResultsProducts;
              const isFormulaMessage = !message.isUser && !isCalculationCard && !isResultsTable && !isRequirementsTable && !isBomTable && !isComparisonTable && containsMath(message.content);
              const isExploreResponse = !message.isUser && (() => {
                for (let j = idx - 1; j >= 0; j--) {
                  if (aiMessages[j].isUser) return aiMessages[j].displayContent?.startsWith('Explore:') === true;
                }
                return false;
              })();
              const showRetry =
                !message.isUser &&
                onRetry &&
                (message.status === 'failed' || message.status === 'streaming') &&
                !message.isStreaming;

              // While loading, the active requirements card is rendered separately
              // BELOW the ThinkingIndicator — skip it here so the indicator stays
              // pinned right under the user prompt.
              if (isAILoading && isRequirementsTable && !hasResultsTableAfterThis &&
                  (message.requirementsIsLoading || message.requirementsMode === 'search')) {
                return null;
              }

              // Skip AI messages with nothing to display — no text and no special
              // card data. Without this guard the wrapper div's padding renders as
              // a thin empty bar in the chat.
              const hasDisplayableContent =
                message.isUser ||
                (message.content && message.content.trim().length > 0) ||
                message.alternativeSearches?.length ||
                isResultsTable ||
                isRequirementsTable ||
                isBomTable ||
                isComparisonTable ||
                isCalculationCard ||
                showRetry;
              if (!hasDisplayableContent) return null;

              return (
                <div
                  key={message.id}
                  data-msg-id={message.id}
                  className={cn(
                    "flex flex-col space-y-2 mb-8 animate-in fade-in slide-in-from-bottom-3 ease-out",
                    isRequirementsTable ? "duration-700" : "duration-400",
                    message.isUser ? "items-end" : "items-start"
                  )}
                >
                  <div className={cn(
                    "px-4 py-2.5 rounded-lg shadow-sm transition-all duration-300",
                    message.isUser ? "max-w-[85%]" : "max-w-[95%] w-full",
                    message.isUser
                      ? "bg-gradient-to-br from-blue-600 to-blue-700 text-white"
                      : isFormulaMessage
                        ? "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700",
                    showRetry && "border-amber-300 dark:border-amber-700/60",
                  )}>
                    {isRequirementsTable ? (
                      <RequirementsMessage
                        message={message}
                        isLoading={false}
                      />
                    ) : isComparisonTable ? (
                      <StandaloneComparisonMessage message={message} />
                    ) : isBomTable ? (
                      <BomTableMessage message={message} onSearchBomItem={onSearchBomItem} />
                    ) : isCalculationCard ? (
                      <CalculationMessage message={message} onRegenerateCalc={onRegenerateCalc} />
                    ) : isResultsTable ? (
                      <ResultsTableMessage
                        message={message}
                        companyMap={companyMap}
                        userFollows={userFollows}
                        webSearchEngine={webSearchEngine}
                        buildWebSearchUrl={buildWebSearchUrl}
                        onFollowCompany={onFollowCompany}
                        renderUserMessageContent={() => null}
                        onRegenerateCalc={onRegenerateCalc}
                        onExplore={onExplore}
                        onExtendSearch={onExtendSearch && !message.isStreaming ? () => {
                          const q = lastUserContentBefore(idx);
                          if (q) onExtendSearch(q);
                        } : undefined}
                      />
                    ) : isExploreResponse ? (
                      <ExploreMessage message={message} />
                    ) : (
                      <TextMessage message={message} onSearchAlternative={onSearchAlternative} />
                    )}
                    {showRetry && (
                      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-amber-700 dark:text-amber-300">
                        <span>
                          {message.status === 'failed'
                            ? 'This response did not finish.'
                            : 'This response was interrupted.'}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-900/30"
                          onClick={() => {
                            const q = message.retryQuery || lastUserContentBefore(idx);
                            if (q) onRetry?.(q, message.id);
                          }}
                          data-testid={`button-retry-${message.id}`}
                        >
                          <RotateCw className="w-3 h-3 mr-1" />
                          Retry
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {/* ThinkingIndicator — always stays right below the prompt */}
        {isAILoading && !aiMessages.some((m) => m.isStreaming) && (
          <div className="flex items-start mb-8 animate-in fade-in slide-in-from-bottom-3 duration-400 ease-out">
            <ThinkingIndicator statusMessage={streamingStatusMessage} />
          </div>
        )}
        {isAILoading && aiMessages.some((m) => m.isStreaming) && (
          <div className="flex items-start mb-4">
            <ThinkingIndicator statusMessage={streamingStatusMessage} />
          </div>
        )}

        {/* Requirements card — fades in below the ThinkingIndicator after 15 s.
            Stays in forced-skeleton mode for 4 s, then real rows reveal. */}
        {isAILoading && reqVisible && activeReqMsg && (
          <div
            className="flex flex-col items-start space-y-2 mb-8 animate-in fade-in slide-in-from-bottom-3 duration-700 ease-out"
          >
            <div className={cn(
              "px-4 py-2.5 rounded-lg shadow-sm transition-all duration-300 max-w-[95%] w-full",
              "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700",
              "requirements-loading"
            )}>
              <RequirementsMessage
                message={activeReqMsg}
                isLoading={!reqDataVisible}
              />
            </div>
          </div>
        )}

        {aiMessages.length > 0 && spacerHeight > 0 && (
          <div data-scroll-spacer="true" aria-hidden="true" style={{ minHeight: `${spacerHeight}px` }} />
        )}
      </div>
    </div>
  );
}
