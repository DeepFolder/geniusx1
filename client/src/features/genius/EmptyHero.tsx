import { ThinkingProgress } from "./ThinkingProgress";
import { useBusyLabel } from "./useBusyLabel";
import type { BusyPhase } from "./types";
import { GeniusLogo } from "@/components/layout/GeniusLogo";

interface Props {
  isGenerating: boolean;
  /** Current busy phase, used to show the same cycling status text as the chat panel. */
  busyPhase?: BusyPhase;
  webSearch?: boolean;
}

// Centered empty-state hero shown in the workspace before any calculation
// exists — sits directly above the floating chat bar.
export function EmptyHero({ isGenerating, busyPhase = null, webSearch = false }: Props) {
  const busyLabel = useBusyLabel(busyPhase, webSearch);

  return (
    <div className="relative flex flex-col items-center text-center px-4">
      {isGenerating ? (
        /* Generating state — animation only, no wordmark */
        (<>
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 h-32 w-64 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(ellipse at center, rgba(59,130,246,0.55) 0%, transparent 70%)", top: "-1rem" }}
          />
          <div className="relative">
            <ThinkingProgress busyPhase={busyPhase} label={busyLabel} size="md" showTimer />
          </div>
        </>)
      ) : (
        /* Idle state — wordmark, headline, sub-line */
        (<>
          {/* Wordmark */}
          <GeniusLogo className="mb-4 h-8 w-auto opacity-90" />
          {/* Ambient glow halo behind headline */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 h-40 w-80 rounded-full opacity-35 blur-3xl"
            style={{ background: "radial-gradient(ellipse at center, rgba(59,130,246,0.50) 0%, rgba(96,165,250,0.20) 50%, transparent 70%)", top: "3.5rem" }}
          />
          {/* Headline */}
          <h2 className="relative text-[2rem] font-extrabold tracking-tight leading-tight bg-gradient-to-r from-blue-800 via-blue-600 to-blue-500 bg-clip-text text-transparent dark:from-blue-400 dark:via-blue-300 dark:to-blue-200">
            Engineering intelligence
          </h2>
          {/* Sub-line */}
          <p className="relative mt-4 max-w-sm text-base font-medium text-gray-400 dark:text-gray-300">
            Describe your calculation. Get a sourced, step-by-step worksheet.
          </p>
        </>)
      )}
    </div>
  );
}
