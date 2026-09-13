import { describe, expect, it, vi } from "vitest";
import {
  formatElapsed,
  resolveStageIndex,
  startElapsedTimer,
  stageStatus,
} from "../../client/src/features/genius/ThinkingProgress";

describe("ThinkingProgress helpers", () => {
  it("advances through all four generation stages with the existing labels", () => {
    expect(resolveStageIndex("generate", "Understanding your problem…")).toBe(0);
    expect(resolveStageIndex("generate", "Deriving the governing equations…")).toBe(1);
    expect(resolveStageIndex("generate", "Computing & verifying every number…")).toBe(2);
    expect(resolveStageIndex("generate", "Assembling the worksheet…")).toBe(3);
  });

  it("maps the injected web-search label to the derive stage", () => {
    expect(resolveStageIndex("generate", "Searching the web for references…")).toBe(1);
    expect(resolveStageIndex("build", "Searching the web for references…")).toBe(1);
  });

  it("maps every shorter busy phase to its semantic stages", () => {
    expect(resolveStageIndex("build", "Building from the approved task…")).toBe(0);
    expect(resolveStageIndex("build", "Deriving the equations…")).toBe(1);
    expect(resolveStageIndex("build", "Computing & verifying every number…")).toBe(2);

    expect(resolveStageIndex("upload", "Reading your document…")).toBe(0);
    expect(resolveStageIndex("upload", "Extracting the engineering problem…")).toBe(1);
    expect(resolveStageIndex("upload", "Drafting the calculation task…")).toBe(3);

    expect(resolveStageIndex("question", "Thinking…")).toBe(0);
    expect(resolveStageIndex("question", "Pulling together the answer…")).toBe(3);
    expect(resolveStageIndex("refine", "Updating the proposed task…")).toBe(3);
  });

  it("uses a safe starting stage without a busy phase or recognized label", () => {
    expect(resolveStageIndex(null, null)).toBe(0);
    expect(resolveStageIndex("generate", "Unknown status")).toBe(0);
  });

  it("marks stages before the active one complete and later stages future", () => {
    expect(stageStatus(0, 2)).toBe("done");
    expect(stageStatus(2, 2)).toBe("active");
    expect(stageStatus(3, 2)).toBe("future");
  });

  it("formats the elapsed counter as whole seconds", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(24)).toBe("24s");
    expect(formatElapsed(90)).toBe("90s");
  });

  it("ticks every second and stops cleanly", () => {
    vi.useFakeTimers();
    try {
      let elapsed = 0;
      const stop = startElapsedTimer(() => {
        elapsed += 1;
      });

      vi.advanceTimersByTime(3100);
      expect(elapsed).toBe(3);

      stop();
      vi.advanceTimersByTime(2000);
      expect(elapsed).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});