import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AgentChat } from "../../client/src/features/genius/AgentChat";
import { ProposalCard } from "../../client/src/features/genius/ProposalCard";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const message = {
  id: "answer-1",
  role: "assistant" as const,
  content: "For a slender column, use Euler buckling.",
  calculationExample: {
    request: "Estimate a pinned column's critical load.",
    method: "Use Euler buckling with the member length, stiffness, and end condition.",
  },
};

function renderChat(readOnly = false) {
  return renderToStaticMarkup(
    React.createElement(AgentChat, {
      messages: [message],
      busyPhase: null,
      webSearch: false,
      discardedIds: new Set<string>(),
      isBuilding: false,
      isBusy: false,
      isCreatingExample: false,
      exampleCreatedIds: new Set<string>(),
      onApprove: () => {},
      onDiscard: () => {},
      onCreateExample: () => {},
      readOnly,
    }),
  );
}

describe("Genius answer calculation-example action", () => {
  it("shows the explicit action for an eligible answer", () => {
    const html = renderChat();

    expect(html).toContain("Build calculation example");
    expect(html).toContain('data-testid="button-build-calculation-example"');
    expect(html).toContain('aria-label="Build calculation example from this explanation"');
  });

  it("replaces the action with a historical-state disclosure", () => {
    const html = renderChat(true);

    expect(html).not.toContain('data-testid="button-build-calculation-example"');
    expect(html).toContain("Calculation examples are unavailable while viewing a historical calculation.");
  });

  it("renders proposal approach formulas at the same text size as chat answers", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProposalCard, {
        proposal: {
          title: "Euler buckling",
          understanding: "Check column stability.",
          problem: "Find the critical load.",
          inputs: [],
          assumptions: [],
          approach: "Use \\(P_{cr} = \\frac{\\pi^2 E I}{(KL)^2}\\).",
        },
        isBuilding: false,
        onApprove: () => {},
        onDiscard: () => {},
      }),
    );

    expect(html).toContain("text-sm");
    expect(html).toContain("katex");
    expect(html).toContain("mfrac");
    expect(html).toContain('class="katex-inline"');
  });
});