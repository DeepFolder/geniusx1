import { useEffect, useMemo, useRef, useState } from "react";
import { AgentChat } from "@/features/genius/AgentChat";
import { CalcTree } from "@/features/genius/CalcTree";
import { EmptyHero } from "@/features/genius/EmptyHero";
import { GeniusChatBar } from "@/features/genius/GeniusChatBar";
import { Worksheet } from "@/features/genius/Worksheet";
import type { ChatMessage } from "@/features/genius/types";
import { BALL_SCREW_EXAMPLE } from "@shared/genius-example";

const USER_MESSAGE: ChatMessage = {
  id: "homepage-example-user",
  role: "user",
  content: "Size the motor for a ball screw actuator delivering 30 kN at 150 mm/s over a 300 mm stroke.",
};

const ASSISTANT_MESSAGE: ChatMessage = {
  id: "homepage-example-assistant",
  role: "assistant",
  content:
    "The calculation is ready. The screw runs at **900 rpm** and needs **53.05 N·m** of drive torque. With efficiency and the selected safety factor applied, the minimum continuous motor rating is **10 kW**.",
};

const NOOP = () => {};

/**
 * A read-only run of the real Genius workspace UI. The preview deliberately
 * composes the production chat, worksheet, outline, and prompt components so
 * homepage styling cannot drift into a separate mock design.
 */
export function WorkspacePreview() {
  const [phase, setPhase] = useState(0);
  const worksheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setPhase(3);
      return;
    }

    const durations = [1700, 2300, 3600, 3600];
    const timer = window.setTimeout(
      () => setPhase((current) => (current + 1) % durations.length),
      durations[phase],
    );
    return () => window.clearTimeout(timer);
  }, [phase]);

  const calculationReady = phase >= 2;
  const messages = useMemo(
    () => calculationReady ? [USER_MESSAGE, ASSISTANT_MESSAGE] : [USER_MESSAGE],
    [calculationReady],
  );

  useEffect(() => {
    if (!calculationReady) {
      worksheetRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (phase === 3) {
      const result = worksheetRef.current?.querySelector<HTMLElement>("#section-results");
      worksheetRef.current?.scrollTo({
        top: Math.max(0, (result?.offsetTop ?? 0) - 18),
        behavior: "smooth",
      });
    } else {
      worksheetRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [calculationReady, phase]);

  return (
    <div
      className="pointer-events-none relative flex h-[560px] select-none flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl shadow-blue-950/10 dark:border-gray-800 dark:bg-black dark:shadow-blue-950/30 sm:aspect-video sm:h-auto"
      aria-label="Animated Genius X1 ball screw motor calculation"
    >
      <div className="flex min-h-0 flex-1">
        <aside
          className={`${calculationReady ? "hidden md:flex" : "flex"} h-full w-full flex-col overflow-hidden border-r border-gray-100 bg-white dark:border-gray-800 dark:bg-black md:w-[34%] md:min-w-[250px]`}
        >
          <AgentChat
            messages={messages}
            busyPhase={calculationReady ? null : "generate"}
            webSearch={false}
            discardedIds={new Set()}
            isBuilding={!calculationReady}
            isBusy={!calculationReady}
            isCreatingExample={false}
            exampleCreatedIds={new Set()}
            onApprove={NOOP}
            onDiscard={NOOP}
            onCreateExample={NOOP}
            readOnly={false}
            autoScroll={false}
          />
        </aside>

        <main
          ref={worksheetRef}
          className={`${calculationReady ? "block" : "hidden md:block"} modern-4k-background min-w-0 flex-1 overflow-y-auto text-gray-900 dark:text-gray-100`}
        >
          {calculationReady ? (
            <Worksheet
              doc={BALL_SCREW_EXAMPLE}
              onChange={NOOP}
              onRecalc={NOOP}
              isRecalculating={false}
              onExplainStep={NOOP}
              isExplaining={false}
              readOnly={false}
              showDisclaimer={false}
            />
          ) : (
            <div className="engineering-grid flex h-full items-center justify-center px-6">
              <EmptyHero isGenerating busyPhase="generate" webSearch={false} />
            </div>
          )}
        </main>

        <aside className={`hidden h-full w-48 flex-shrink-0 flex-col overflow-hidden border-l border-gray-100 bg-white dark:border-gray-800 dark:bg-black xl:flex ${calculationReady ? "visible" : "invisible"}`}>
          {calculationReady && (
            <CalcTree doc={BALL_SCREW_EXAMPLE} onNavigate={NOOP} />
          )}
        </aside>
      </div>

      <div className="border-t border-gray-100 bg-white/80 p-3 backdrop-blur-xl dark:border-gray-800 dark:bg-gray-950/80 md:pl-[34%] xl:pr-48">
        <div className="mx-auto max-w-4xl">
          <GeniusChatBar
            onSend={NOOP}
            onSendDirect={NOOP}
            onPlan={NOOP}
            isSending={!calculationReady}
            isPlanning={false}
            webSearch={false}
            onToggleWebSearch={NOOP}
            expertMode={false}
            onToggleExpertMode={NOOP}
            phdMode={false}
            onTogglePhdMode={NOOP}
            onUpload={NOOP}
            isUploading={false}
            hasCalc={calculationReady}
            isAuthenticated
            canStop={false}
            readOnly={false}
            showDisclaimer={false}
            renderLoginModal={false}
          />
        </div>
      </div>
    </div>
  );
}
