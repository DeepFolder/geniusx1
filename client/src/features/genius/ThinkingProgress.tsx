import { useEffect, useState } from "react";
import { Check, FileText, FunctionSquare, Calculator, Sparkles } from "lucide-react";
import { OrbAnimation } from "@/features/deepsearch/components/ThinkingIndicator";
import { PHASE_LABELS } from "./useBusyLabel";
import type { BusyPhase } from "./types";
import { AnimatedBusyLabel } from "./AnimatedBusyLabel";

// ─── Stage definitions ────────────────────────────────────────────────────────

/** The four canonical AI stages shown as rounded-square markers. */
export const STAGES = ["understand", "derive", "compute", "assemble"] as const;
export type Stage = (typeof STAGES)[number];

const STAGE_META: Record<Stage, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  understand: { label: "Understand", Icon: FileText },
  derive:     { label: "Derive",     Icon: FunctionSquare },
  compute:    { label: "Compute",    Icon: Calculator },
  assemble:   { label: "Assemble",   Icon: Sparkles },
};

// ─── Pure helpers (exported for tests) ───────────────────────────────────────

/**
 * Maps the current cycling label + busy phase to a stage index 0–3.
 * Deterministic and side-effect free.
 */
export function resolveStageIndex(phase: BusyPhase, label: string | null): number {
  if (!phase || !label) return 0;
  if (label.startsWith("Searching the web")) return 1;
  const labels = PHASE_LABELS[phase];
  const idx = labels.indexOf(label);
  const pos = idx === -1 ? 0 : idx;
  switch (phase) {
    case "generate": return Math.min(pos, 3);   // 4 labels map 1:1
    case "build":    return Math.min(pos, 2);   // building→derive→compute
    case "upload":   return pos === 2 ? 3 : pos; // reading→extracting→drafting(assemble)
    case "question": return Math.min(pos * 3, 3);
    case "refine":   return 3;
    default:         return 0;
  }
}

/** Visual status of a stage marker given the active stage index. */
export function stageStatus(stage: number, active: number): "done" | "active" | "future" {
  if (stage < active) return "done";
  if (stage === active) return "active";
  return "future";
}

/** Formats elapsed whole seconds for the compact inline timer. */
export function formatElapsed(seconds: number): string {
  return `${seconds}s`;
}

/** Starts the one-second ticker used by the elapsed-time hook. */
export function startElapsedTimer(onTick: () => void): () => void {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
}

// ─── Internal hooks ───────────────────────────────────────────────────────────

function useElapsedSeconds(busy: boolean): number {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    setSec(0);
    if (!busy) return;
    return startElapsedTimer(() => setSec((s) => s + 1));
  }, [busy]);
  return busy ? sec : 0;
}

function usePrefersReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduceMotion;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StepMarkerProps {
  stage: Stage;
  index: number;
  status: "done" | "active" | "future";
}

function StepMarker({ stage, index, status }: StepMarkerProps) {
  const { label, Icon } = STAGE_META[stage];

  const containerCls = [
    "relative flex h-11 w-11 shrink-0 items-center justify-center overflow-visible rounded-xl border transition-all duration-500",
    status === "done"   && "border-emerald-200 bg-emerald-50 text-emerald-600 shadow-[0_6px_18px_rgba(16,185,129,0.10)] dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-400",
    status === "active" && "border-violet-300 bg-gradient-to-br from-violet-50 to-indigo-100/80 text-violet-600 shadow-[0_8px_24px_rgba(124,58,237,0.18)] ring-4 ring-violet-100/70 motion-safe:animate-pulse dark:border-violet-400/50 dark:from-violet-500/20 dark:to-indigo-500/10 dark:text-violet-300 dark:ring-violet-500/10",
    status === "future" && "border-gray-100 bg-white/50 text-gray-300 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-gray-600",
  ].filter(Boolean).join(" ");

  return (
    <span
      key={`${stage}-${index}`}
      title={label}
      aria-hidden
      className={containerCls}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={status === "done" ? 2.25 : 1.9} />

      {/* Completion badge floats above the icon without clipping. */}
      {status === "done" && (
        <span
          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-emerald-500 shadow-sm dark:border-[#1c2028]"
        >
          <Check className="h-2 w-2 text-white" strokeWidth={3.5} />
        </span>
      )}
    </span>
  );
}

interface StatusTextProps {
  label: string;
  sm: boolean;
  elapsed: number;
  showTimer: boolean;
}

function StatusText({ label, sm, elapsed, showTimer }: StatusTextProps) {
  return (
    <div className={["flex items-baseline gap-1.5 min-w-0", sm ? "flex-1" : ""].join(" ")}>
      {/* key forces remount → retriggers the shared left-to-right entrance per label */}
      <span
        key={label}
        className={[
          "busy-status-enter inline-flex min-w-0 items-center",
          sm
            ? "text-xs text-gray-500 dark:text-gray-400"
            : "text-sm text-gray-500/90 dark:text-gray-400",
        ].join(" ")}
        data-testid="text-busy-label"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-label={label}
      >
        <span className="truncate">
          <AnimatedBusyLabel label={label} />
        </span>
      </span>

      {showTimer && (
        <span
          className={[
            "shrink-0 font-mono tabular-nums text-gray-400 dark:text-gray-500",
            sm ? "text-[10px]" : "text-xs",
          ].join(" ")}
          aria-hidden
        >
          · {formatElapsed(elapsed)}
        </span>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface ThinkingProgressProps {
  busyPhase: BusyPhase;
  /** Current cycling label from useBusyLabel — preserved verbatim. */
  label: string | null;
  size: "sm" | "md";
  showTimer?: boolean;
}

/**
 * Compact AI thinking progress indicator.
 *
 * Chat gets a quiet orbit-only loading cue. Workspace gets the orbit above
 * a modern icon-based phase rail and a live status line.
 */
export function ThinkingProgress({ busyPhase, label, size, showTimer = false }: ThinkingProgressProps) {
  const elapsed     = useElapsedSeconds(!!busyPhase);
  const reduceMotion = usePrefersReducedMotion();

  if (!busyPhase || !label) return null;

  const active = resolveStageIndex(busyPhase, label);
  const sm     = size === "sm";
  const orbSize = sm ? 26 : 46;

  if (sm) {
    return (
      <span aria-label="Thinking" role="status" className="flex h-7 w-7 items-center justify-center">
        {reduceMotion ? (
          <span
            className="block h-[26px] w-[26px] rounded-full"
            style={{
              background:
                "radial-gradient(circle at 35% 35%, rgba(147,197,253,0.95), rgba(59,130,246,0.8) 42%, rgba(30,64,175,0.2) 72%, transparent 76%)",
              boxShadow: "0 0 14px rgba(59,130,246,0.30)",
            }}
          />
        ) : (
          <OrbAnimation size={orbSize} />
        )}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-blue-400/20 blur-xl dark:bg-blue-500/15" aria-hidden />
        <span aria-hidden className="relative flex shrink-0 items-center justify-center">
          {reduceMotion ? (
            <span
              className="block rounded-full shrink-0"
              style={{
                width: orbSize,
                height: orbSize,
                background:
                  "radial-gradient(circle at 35% 35%, rgba(147,197,253,0.95), rgba(59,130,246,0.8) 42%, rgba(30,64,175,0.2) 72%, transparent 76%)",
                boxShadow: "0 0 18px rgba(59,130,246,0.36)",
              }}
            />
          ) : (
            <OrbAnimation size={orbSize} />
          )}
        </span>
      </div>

      {/* The phase rail intentionally lives beneath the orbit in workspace. */}
      <div className="mt-3 flex items-center gap-2" aria-hidden>
        {(STAGES as readonly Stage[]).map((stage, i) => (
          <StepMarker
            key={stage}
            stage={stage}
            index={i}
            status={stageStatus(i, active)}
          />
        ))}
      </div>

      <div className="mt-4 max-w-[min(92vw,28rem)]">
        <StatusText label={label} sm={false} elapsed={elapsed} showTimer={showTimer} />
      </div>
    </div>
  );
}
