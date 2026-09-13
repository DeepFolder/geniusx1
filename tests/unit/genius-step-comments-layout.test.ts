import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StepsView } from "../../client/src/features/genius/StepsView";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const step = {
  id: "power",
  symbol: "P",
  title: "Power",
  description: "Use the verified force.",
  formula: "P = 2F",
  expr: "F * 2",
  calculation: "",
  result: "200",
  unit: "W",
  sources: [],
  warnings: [],
};

describe("Genius step comment Notes UI", () => {
  it("groups comment edit and delete actions in a compact options menu", () => {
    const html = renderToStaticMarkup(React.createElement(StepsView, {
      steps: [step],
      comments: [{ id: 1, stepId: "power", content: "Check the duty cycle.", createdAt: "2026-09-01T00:00:00.000Z" }],
      onAddComment: async () => {},
      onUpdateComment: async () => {},
      onDeleteComment: async () => {},
    }));

    expect(html).toContain("Add comment");
    expect(html).toContain("Check the duty cycle.");
    expect(html).toContain("Comment options for Power");
    expect(html).not.toContain("Edit comment for Power");
    expect(html).not.toContain("Delete comment for Power");
  });

  it("shows existing comments but no mutation controls in read-only mode", () => {
    const html = renderToStaticMarkup(React.createElement(StepsView, {
      steps: [step],
      comments: [{ id: 1, stepId: "power", content: "Legacy design note.", createdAt: "2026-09-01T00:00:00.000Z" }],
      readOnly: true,
      onAddComment: async () => {},
      onUpdateComment: async () => {},
      onDeleteComment: async () => {},
    }));

    expect(html).toContain("Legacy design note.");
    expect(html).not.toContain("Add comment");
    expect(html).not.toContain("Comment options for Power");
  });
});