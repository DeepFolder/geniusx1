import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import {
  AgentChat,
  isProposalVisible,
  resolveAnimatingIdx,
} from "../../client/src/features/genius/AgentChat";
import type { ChatMessage, GeniusTaskProposal } from "../../client/src/features/genius/types";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const PROPOSAL: GeniusTaskProposal = {
  title: "Build the load calculation",
  understanding: "",
  problem: "",
  inputs: [],
  assumptions: [],
  approach: "",
};

function renderChat(messages: ChatMessage[]): string {
  return renderToStaticMarkup(
    React.createElement(AgentChat, {
      messages,
      busyPhase: null,
      webSearch: false,
      discardedIds: new Set(),
      isBuilding: false,
      onApprove: () => {},
      onDiscard: () => {},
    }),
  );
}

describe("new assistant-message arrival", () => {
  it("renders a complete new reply and its proposal together on first render", () => {
    const html = renderChat([
      {
        id: "assistant-1",
        role: "assistant",
        content: "The full answer is available immediately.",
        proposal: PROPOSAL,
      },
    ]);

    expect(html).toContain("The full answer is available immediately.");
    expect(html).toContain(PROPOSAL.title);
  });

  describe("resolveAnimatingIdx — no re-animation of historical messages", () => {
    it("returns -1 when nothing is new (mount with existing messages)", () => {
      expect(resolveAnimatingIdx(2, 2)).toBe(-1);
    });

    it("returns the new index when a genuinely new message arrives", () => {
      expect(resolveAnimatingIdx(1, 2)).toBe(2);
    });

    it("returns -1 when idx moves backwards (should never happen but is safe)", () => {
      expect(resolveAnimatingIdx(5, 3)).toBe(-1);
    });

    it("returns 0 when the very first message arrives into an empty chat", () => {
      expect(resolveAnimatingIdx(-1, 0)).toBe(0);
    });

    it("each new message advances animatingIdx forward independently", () => {
      let prev = -1;
      for (let next = 0; next <= 2; next++) {
        expect(resolveAnimatingIdx(prev, next)).toBe(next);
        prev = next;
      }
    });
  });

  describe("isProposalVisible — ProposalCard arrives with reply", () => {
    it("returns true as soon as a proposal exists", () => {
      expect(isProposalVisible({ id: 1 })).toBe(true);
    });

    it("returns false when there is no proposal", () => {
      expect(isProposalVisible(null)).toBe(false);
      expect(isProposalVisible(undefined)).toBe(false);
    });
  });
});
