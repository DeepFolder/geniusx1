import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { AgentChat } from "@/features/genius/AgentChat";
import { Worksheet } from "@/features/genius/Worksheet";
import { CalcTree } from "@/features/genius/CalcTree";
import { SidebarCalcActions } from "@/features/genius/SidebarCalcActions";
import { GeniusChatBar } from "@/features/genius/GeniusChatBar";
import { EmptyHero } from "@/features/genius/EmptyHero";
import { useGenius } from "@/features/genius/useGenius";
import {
  outlinePanelVisibilityClasses,
  usePanelState,
} from "@/features/genius/usePanelState";
import { isEmptyDoc } from "@/features/genius/empty";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import type { BusyPhase, GeniusStep } from "@/features/genius/types";

type MobilePanel = "chat" | "calc" | "tree";
type MobileAttention = Record<MobilePanel, boolean>;

function useBreakpoints() {
  const [isMd, setIsMd] = useState(() => window.innerWidth >= 768);
  const [isLg, setIsLg] = useState(() => window.innerWidth >= 1024);
  useEffect(() => {
    const handle = () => { setIsMd(window.innerWidth >= 768); setIsLg(window.innerWidth >= 1024); };
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);
  return { isMd, isLg };
}

export default function GeniusPage() {
  const g = useGenius();
  const { isAuthenticated } = useAuth();
  const empty = isEmptyDoc(g.doc);
  const { chatWidth, chatCollapsed, treeCollapsed, minChatWidth, maxChatWidth, toggleChat, toggleTree, expandChat, onDragStart, onDragMove, onDragEnd, onDragKeyDown } = usePanelState();
  const { isMd, isLg } = useBreakpoints();
  const { toast } = useToast();

  // Mobile panel switcher state
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("calc");
  const [mobileAttention, setMobileAttention] = useState<MobileAttention>({
    chat: false,
    calc: false,
    tree: false,
  });
  const previousCalculationUpdateRef = useRef(g.calculationUpdateToken);
  const awaitingAssistantResponseRef = useRef(false);
  const hasObservedAssistantMessagesRef = useRef(false);
  const lastAssistantMessageRef = useRef<string | null>(null);
  const latestAssistantMessageId = useMemo(
    () => g.messages.reduce<string | null>(
      (latest, message) => message.role === "assistant" ? message.id : latest,
      null,
    ),
    [g.messages],
  );

  const openMobilePanel = useCallback((panel: MobilePanel) => {
    setMobilePanel(panel);
    setMobileAttention((current) =>
      current[panel] ? { ...current, [panel]: false } : current,
    );
  }, []);

  const openChatForReply = useCallback((action: () => void) => {
    awaitingAssistantResponseRef.current = true;
    openMobilePanel("chat");
    expandChat();
    action();
  }, [expandChat, openMobilePanel]);

  // New calculations start in the workspace so the empty calculation state is
  // immediately visible on mobile.
  useEffect(() => {
    if (empty) openMobilePanel("calc");
  }, [empty, openMobilePanel]);

  // Switch only for an actual calculation row supplied by the server. Chat
  // answers never update this token, so they must remain in the Chat panel.
  useEffect(() => {
    if (previousCalculationUpdateRef.current === g.calculationUpdateToken) return;

    previousCalculationUpdateRef.current = g.calculationUpdateToken;
    if (!isMd && !empty) openMobilePanel("calc");
  }, [g.calculationUpdateToken, isMd, empty, openMobilePanel]);

  // Do not notify for messages loaded from calculation history. Only light
  // Chat for the reply to an action the user has just sent, while they have
  // moved to another mobile panel to continue working.
  useEffect(() => {
    if (!hasObservedAssistantMessagesRef.current) {
      hasObservedAssistantMessagesRef.current = true;
      lastAssistantMessageRef.current = latestAssistantMessageId;
      return;
    }
    if (latestAssistantMessageId === lastAssistantMessageRef.current) return;

    lastAssistantMessageRef.current = latestAssistantMessageId;
    if (awaitingAssistantResponseRef.current && !isMd && mobilePanel !== "chat") {
      setMobileAttention((current) => ({ ...current, chat: true }));
    }
    awaitingAssistantResponseRef.current = false;
  }, [isMd, latestAssistantMessageId, mobilePanel]);

  const navigate = (id: string) => {
    // On mobile, the outline lives in its own tab — jump to the calculation
    // panel first so the target section is actually visible, then scroll.
    if (!isMd) openMobilePanel("calc");
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const effectiveChatWidth = chatCollapsed ? 0 : chatWidth;
  const effectiveTreeWidth = (!empty && !treeCollapsed) ? 260 : 0;

  // Dynamic padding only at desktop breakpoints — mobile keeps Tailwind defaults
  const chatBarStyle: React.CSSProperties = {
    ...(isMd ? { paddingLeft: Math.max(24, effectiveChatWidth) } : {}),
    ...(isLg && !empty ? { paddingRight: Math.max(24, effectiveTreeWidth) } : {}),
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
  };

  const handleTreeTab = () => {
    if (empty) {
      toast({ description: "Run a calculation first." });
    } else {
      openMobilePanel("tree");
    }
  };

  const explainStep = (step: GeniusStep) => {
    if (g.isSending) return;
    openChatForReply(() => g.explainStep(step));
  };

  return (
    <AppShell
      onLogoClick={g.startNew}
      sidebarExtra={(onClose) => (
        <SidebarCalcActions
          history={g.history}
          onNew={g.startNew}
          onLoad={g.loadCalc}
          onDelete={g.deleteCalc}
          onPin={g.pinCalc}
          onRename={g.renameCalc}
          onClose={onClose}
          readOnly={g.isHistorical}
        />
      )}
    >
      <div className="modern-4k-background flex h-[calc(100vh-80px)] flex-col overflow-x-hidden text-gray-900 dark:text-gray-100">

        {/* Three-panel row */}
        <div className="flex min-h-0 flex-1">

          {/* Left panel — always visible on md+; on mobile only when mobilePanel==="chat" */}
          <div data-print-hide="true" className={`relative flex-shrink-0 h-full ${mobilePanel === "chat" ? "flex" : "hidden"} md:flex`}>
            <aside
              className="flex h-full flex-col border-r border-gray-100 bg-white dark:border-gray-800 dark:bg-black overflow-hidden"
              style={{ width: isMd ? effectiveChatWidth : "100vw" }}
            >
              <div className={`flex h-full flex-col ${chatCollapsed && isMd ? "invisible" : ""}`}>
                <AgentChat
                  messages={g.messages}
                  busyPhase={g.busyPhase}
                  webSearch={g.webSearch}
                  discardedIds={g.discardedProposalIds}
                  isBuilding={g.busyPhase === "build"}
                  isBusy={g.isSending}
                  isCreatingExample={g.isCreatingCalculationExample}
                  exampleCreatedIds={g.exampleCreatedIds}
                onApprove={g.approveProposal}
                  onDiscard={g.discardProposal}
                  onCreateExample={g.createCalculationExample}
                  readOnly={g.isHistorical}
                />
              </div>

              {/* Drag handle — right edge of the aside (desktop only) */}
              {!chatCollapsed && isMd && (
                <div
                  role="separator"
                  aria-label="Resize chat panel"
                  aria-orientation="vertical"
                  aria-valuenow={chatWidth}
                  aria-valuemin={minChatWidth}
                  aria-valuemax={maxChatWidth}
                  tabIndex={0}
                  className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-400/40 active:bg-blue-500/50 focus-visible:bg-blue-500/60 focus-visible:outline-none z-10"
                  onPointerDown={onDragStart}
                  onPointerMove={onDragMove}
                  onPointerUp={onDragEnd}
                  onPointerCancel={onDragEnd}
                  onKeyDown={onDragKeyDown}
                />
              )}
            </aside>

            {/* Panel handle (desktop only) */}
            {isMd && (
              chatCollapsed ? (
                <button
                  type="button"
                  onClick={toggleChat}
                  aria-expanded={false}
                  aria-label="Expand chat panel"
                  title="Open chat"
                  className="absolute left-full top-1/2 z-20 -translate-y-1/2 inline-flex h-11 w-7 items-center justify-center rounded-r-full border border-l-0 border-blue-400/80 bg-white/95 text-blue-600 shadow-[0_0_18px_rgba(59,130,246,0.35)] backdrop-blur transition-all hover:w-8 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 hover:shadow-[0_0_24px_rgba(59,130,246,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-blue-400/70 dark:bg-[#1c2028]/95 dark:text-blue-300 dark:hover:bg-blue-500/15 dark:hover:text-blue-200 dark:focus-visible:ring-offset-[#161a22]"
                >
                  <PanelLeftOpen className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={toggleChat}
                  aria-expanded={true}
                  aria-label="Collapse chat panel"
                  title="Collapse chat"
                  className="absolute -right-3.5 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-md transition-colors hover:border-blue-300 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:text-blue-400 dark:focus-visible:ring-offset-[#161a22]"
                >
                  <PanelLeftClose className="h-3.5 w-3.5" />
                </button>
              )
            )}
          </div>

          {/* Center — scrollable workspace; hidden on mobile when not active */}
          <main className={`min-w-0 flex-1 overflow-y-auto ${mobilePanel === "calc" ? "" : "hidden md:block"}`}>
            {empty ? (
              <div className="engineering-grid flex h-full items-center justify-center px-6">
                <EmptyHero
                  isGenerating={g.isSending}
                  busyPhase={g.busyPhase}
                  webSearch={g.webSearch}
                />
              </div>
            ) : (
              <Worksheet
                doc={g.doc}
                onChange={g.setDoc}
                onRecalc={() => g.recalculate(g.doc)}
                isRecalculating={g.isRecalculating}
                onExplainStep={explainStep}
                isExplaining={g.isSending}
                readOnly={g.isHistorical}
                historicalVersion={g.historicalVersion}
                versions={g.versions}
                onOpenVersion={g.openVersion}
                onReturnToLatest={g.returnToLatest}
                isLoadingVersion={g.isLoadingVersion}
                calculationId={g.calcId}
                onSaveDetails={g.saveDetails}
                isBusy={g.isSending}
                stepComments={g.stepComments}
                onAddStepComment={g.addStepComment}
                onUpdateStepComment={g.updateStepComment}
                onDeleteStepComment={g.deleteStepComment}
                isSavingStepComment={g.isSavingStepComment}
                isUpdatingStepComment={g.isUpdatingStepComment}
                isDeletingStepComment={g.isDeletingStepComment}
              />
            )}
          </main>

          {/* Right panel — mobile follows its tab; md shows the collapsed edge tab; lg+ always renders */}
          {!empty && (
            <div
              data-print-hide="true"
              className={`relative h-full flex-shrink-0 ${outlinePanelVisibilityClasses(
                mobilePanel === "tree",
                treeCollapsed,
              )}`}
            >
              <aside
                className="flex h-full flex-col border-l border-gray-100 bg-white dark:border-gray-800 dark:bg-black overflow-hidden"
                style={{ width: isMd ? (treeCollapsed ? 0 : 260) : "100vw" }}
              >
                <div className={`flex h-full flex-col ${treeCollapsed && isMd ? "invisible" : ""}`}>
                  <CalcTree doc={g.doc} onNavigate={navigate} />
                </div>
              </aside>

            {/* Panel handle (desktop only) */}
              {isMd && (
                treeCollapsed ? (
                  <button
                    type="button"
                    onClick={toggleTree}
                    aria-expanded={false}
                    aria-label="Expand outline panel"
                  title="Open outline"
                  className="absolute right-full top-1/2 z-20 -translate-y-1/2 inline-flex h-11 w-7 items-center justify-center rounded-l-full border border-r-0 border-blue-400/80 bg-white/95 text-blue-600 shadow-[0_0_18px_rgba(59,130,246,0.35)] backdrop-blur transition-all hover:w-8 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 hover:shadow-[0_0_24px_rgba(59,130,246,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-blue-400/70 dark:bg-[#1c2028]/95 dark:text-blue-300 dark:hover:bg-blue-500/15 dark:hover:text-blue-200 dark:focus-visible:ring-offset-[#161a22]"
                  >
                  <PanelRightOpen className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={toggleTree}
                    aria-expanded={true}
                    aria-label="Collapse outline panel"
                  title="Collapse outline"
                  className="absolute -left-3.5 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-md transition-colors hover:border-blue-300 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:text-blue-400 dark:focus-visible:ring-offset-[#161a22]"
                  >
                    <PanelRightClose className="h-3.5 w-3.5" />
                  </button>
                )
              )}
            </div>
          )}
        </div>

        {/* Mobile tab bar — visible only on < md screens */}
        <div
          data-print-hide="true"
          className="flex md:hidden border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {(
            [
              { id: "chat" as MobilePanel, label: "Chat" },
              { id: "calc" as MobilePanel, label: "Calculation" },
              { id: "tree" as MobilePanel, label: "Outline" },
            ] as const
          ).map(({ id, label }) => {
            const isActive = mobilePanel === id;
            const isDisabled = id === "tree" && empty;
            const needsAttention = mobileAttention[id] && !isActive && !isDisabled;
            return (
              <button
                key={id}
                type="button"
                onClick={id === "tree" ? handleTreeTab : () => openMobilePanel(id)}
                aria-label={needsAttention ? `${label}, new update available` : label}
                aria-pressed={isActive}
                className={`relative flex flex-1 items-center justify-center py-2.5 text-xs font-semibold transition-colors ${
                  isDisabled
                    ? "text-gray-300 dark:text-gray-700"
                    : isActive
                    ? "border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                    : "border-b-2 border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                } ${needsAttention ? "mobile-tab-attention" : ""}`}
              >
                {label}
                {needsAttention && <span className="sr-only">New update available</span>}
              </button>
            );
          })}
        </div>

        {/* Chat bar — dynamic padding only at desktop breakpoints */}
        <div
          data-print-hide="true"
          className="border-t border-gray-100 bg-white/80 p-4 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/80 md:p-6"
          style={chatBarStyle}
        >
          <div className="mx-auto max-w-4xl">
            <GeniusChatBar
              onSend={(t) => openChatForReply(() => g.send(t))}
              onSendDirect={(t) => openChatForReply(() => g.sendDirect(t))}
              onPlan={(t) => openChatForReply(() => g.plan(t))}
              isSending={g.isSending}
              isPlanning={g.isPlanning}
              webSearch={g.webSearch}
              onToggleWebSearch={g.toggleWebSearch}
              expertMode={g.expertMode}
              onToggleExpertMode={g.toggleExpertMode}
              phdMode={g.phdMode}
              onTogglePhdMode={g.togglePhdMode}
              onUpload={(file, prompt) => openChatForReply(() => g.upload(file, prompt))}
              isUploading={g.isUploading}
              hasCalc={!empty}
              hasPendingProposal={g.hasPendingProposal}
              allProposalsDiscarded={g.allProposalsDiscarded}
              isAuthenticated={isAuthenticated}
              canStop={g.hasActiveJob}
              onStop={g.stopGeneration}
               readOnly={g.isHistorical}
            />
          </div>
        </div>

      </div>
    </AppShell>
  );
}
