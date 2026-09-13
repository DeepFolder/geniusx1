import { useEffect, useState } from "react";
import type { BusyPhase } from "./types";

/**
 * Cycling status copy shown while a Genius calculation is busy.
 * Shared between the chat busy bubble and the workspace empty-state hero so
 * both surfaces show identical progress text for the same phase.
 */
export const PHASE_LABELS: Record<Exclude<BusyPhase, null>, string[]> = {
  generate: [
    "Understanding your problem…",
    "Deriving the governing equations…",
    "Computing & verifying every number…",
    "Assembling the worksheet…",
  ],
  question: [
    "Thinking…",
    "Pulling together the answer…",
  ],
  upload: ["Reading your document…", "Extracting the engineering problem…", "Drafting the calculation task…"],
  refine: ["Updating the proposed task…"],
  build: ["Building from the approved task…", "Deriving the equations…", "Computing & verifying every number…"],
};

/** Returns the current cycling busy-phase label, or null when idle. */
export function useBusyLabel(phase: BusyPhase, webSearch: boolean): string | null {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
    if (!phase) return;
    const t = setInterval(() => setIdx((i) => i + 1), 2600);
    return () => clearInterval(t);
  }, [phase]);
  if (!phase) return null;
  const labels = [...PHASE_LABELS[phase]];
  if (webSearch && (phase === "generate" || phase === "build")) {
    labels.splice(1, 0, "Searching the web for references…");
  }
  return labels[Math.min(idx, labels.length - 1)];
}
