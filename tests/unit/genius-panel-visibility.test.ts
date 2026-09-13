import { describe, expect, it } from "vitest";
import { outlinePanelVisibilityClasses } from "../../client/src/features/genius/usePanelState";

describe("Genius outline panel responsive visibility", () => {
  it("keeps the collapsed outline edge tab rendered at md and lg widths", () => {
    expect(outlinePanelVisibilityClasses(false, true).split(" ")).toEqual([
      "hidden",
      "md:flex",
      "lg:flex",
    ]);
  });

  it("keeps an expanded outline hidden at md but visible again at lg", () => {
    expect(outlinePanelVisibilityClasses(false, false).split(" ")).toEqual([
      "hidden",
      "md:hidden",
      "lg:flex",
    ]);
  });

  it("continues to follow the active Outline tab below md", () => {
    expect(outlinePanelVisibilityClasses(true, false).split(" ")).toEqual([
      "flex",
      "md:hidden",
      "lg:flex",
    ]);
  });
});