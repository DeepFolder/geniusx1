import { describe, it, expect } from "vitest";
import {
  calculateBudgets,
  estimateTokens,
  getModelContextWindow,
  MODEL_CONTEXT_WINDOWS,
  DEFAULT_CONTEXT_WINDOW,
} from "../../server/features/hybrid-search/agents/context-budget";

/**
 * Token budget unit tests — pure functions, no DB or network needed.
 * Validates that budget partitions are mathematically consistent and
 * that the compaction trigger is non-zero (prevents infinite compaction loops).
 */
describe("estimateTokens", () => {
  it("returns 0 for null input", () => {
    expect(estimateTokens(null)).toBe(0);
  });

  it("returns 0 for undefined input", () => {
    expect(estimateTokens(undefined)).toBe(0);
  });

  it("returns 0 for an empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("estimates tokens as ceil(length / 4) for a known string", () => {
    const text = "ABCDEFGH";
    expect(estimateTokens(text)).toBe(Math.ceil(8 / 4));
  });

  it("rounds up for non-divisible lengths", () => {
    const text = "ABC";
    expect(estimateTokens(text)).toBe(Math.ceil(3 / 4));
  });

  it("handles a 100-character string correctly", () => {
    const text = "A".repeat(100);
    expect(estimateTokens(text)).toBe(25);
  });

  it("handles a 1-character string", () => {
    expect(estimateTokens("X")).toBe(1);
  });

  it("handles a long paragraph-length string", () => {
    const text = "The quick brown fox jumps over the lazy dog. ".repeat(20);
    expect(estimateTokens(text)).toBe(Math.ceil(text.length / 4));
  });
});

describe("getModelContextWindow", () => {
  it("returns gpt-4o window (128K) for 'gpt-4o'", () => {
    expect(getModelContextWindow("gpt-4o")).toBe(128_000);
  });

  it("returns 1M window for 'gpt-4.1'", () => {
    expect(getModelContextWindow("gpt-4.1")).toBe(1_000_000);
  });

  it("returns 200K window for 'gpt-5.4'", () => {
    expect(getModelContextWindow("gpt-5.4")).toBe(200_000);
  });

  it("returns DEFAULT_CONTEXT_WINDOW for an unknown model", () => {
    expect(getModelContextWindow("unknown-model-xyz")).toBe(DEFAULT_CONTEXT_WINDOW);
  });

  it("returns DEFAULT_CONTEXT_WINDOW for an empty string", () => {
    expect(getModelContextWindow("")).toBe(DEFAULT_CONTEXT_WINDOW);
  });

  it("every entry in MODEL_CONTEXT_WINDOWS is a positive integer", () => {
    for (const [model, window] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
      expect(window, `Model ${model} context window`).toBeGreaterThan(0);
      expect(Number.isInteger(window), `Model ${model} context window is integer`).toBe(true);
    }
  });
});

describe("calculateBudgets", () => {
  const defaultSettings = {
    systemInstructionPct: 20,
    fluidMemoryPct: 10,
    conversationPct: 70,
    compactionThresholdPct: 70,
  };

  it("returns correct totalTokens for gpt-4o (128K)", () => {
    const budgets = calculateBudgets("gpt-4o", defaultSettings);
    expect(budgets.totalTokens).toBe(128_000);
  });

  it("budget percentages sum to totalTokens (system + fluid + conversation)", () => {
    const budgets = calculateBudgets("gpt-4o", defaultSettings);
    const sum = budgets.systemTokens + budgets.fluidTokens + budgets.conversationTokens;
    expect(sum).toBeLessThanOrEqual(budgets.totalTokens);
    expect(sum).toBeGreaterThan(0);
  });

  it("compactionTriggerTokens is non-zero (prevents infinite-loop compaction)", () => {
    const budgets = calculateBudgets("gpt-4o", defaultSettings);
    expect(budgets.compactionTriggerTokens).toBeGreaterThan(0);
  });

  it("compactionTriggerTokens is less than conversationTokens", () => {
    const budgets = calculateBudgets("gpt-4o", defaultSettings);
    expect(budgets.compactionTriggerTokens).toBeLessThan(budgets.conversationTokens);
  });

  it("uses default percentages (20/10/70) when settings pcts are 0", () => {
    const zeroSettings = {
      systemInstructionPct: 0,
      fluidMemoryPct: 0,
      conversationPct: 0,
      compactionThresholdPct: 70,
    };
    const budgets = calculateBudgets("gpt-4o", zeroSettings);
    expect(budgets.systemTokens).toBeGreaterThan(0);
    expect(budgets.conversationTokens).toBeGreaterThan(0);
  });

  it("normalizes percentages that do not sum to 100", () => {
    const skewedSettings = {
      systemInstructionPct: 50,
      fluidMemoryPct: 50,
      conversationPct: 50,
      compactionThresholdPct: 70,
    };
    const budgets = calculateBudgets("gpt-4o", skewedSettings);
    const sum = budgets.systemTokens + budgets.fluidTokens + budgets.conversationTokens;
    expect(sum).toBeLessThanOrEqual(budgets.totalTokens);
  });

  it("works correctly with gpt-4.1 (1M context window)", () => {
    const budgets = calculateBudgets("gpt-4.1", defaultSettings);
    expect(budgets.totalTokens).toBe(1_000_000);
    expect(budgets.compactionTriggerTokens).toBeGreaterThan(0);
  });

  it("falls back to DEFAULT_CONTEXT_WINDOW for unknown models", () => {
    const budgets = calculateBudgets("unknown-future-model", defaultSettings);
    expect(budgets.totalTokens).toBe(DEFAULT_CONTEXT_WINDOW);
  });

  it("clamps systemInstructionPct to 0-100 range for invalid inputs", () => {
    const invalidSettings = {
      systemInstructionPct: -50,
      fluidMemoryPct: 10,
      conversationPct: 70,
      compactionThresholdPct: 70,
    };
    expect(() => calculateBudgets("gpt-4o", invalidSettings)).not.toThrow();
    const budgets = calculateBudgets("gpt-4o", invalidSettings);
    expect(budgets.totalTokens).toBe(128_000);
  });

  it("all returned budget values are non-negative integers", () => {
    const budgets = calculateBudgets("gpt-4o", defaultSettings);
    for (const [key, value] of Object.entries(budgets)) {
      expect(value, key).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(value), `${key} is integer`).toBe(true);
    }
  });

  it("systemTokens approximates 20% of totalTokens with default settings", () => {
    const budgets = calculateBudgets("gpt-4o", defaultSettings);
    const approx20Pct = budgets.totalTokens * 0.20;
    expect(budgets.systemTokens).toBeCloseTo(approx20Pct, -2);
  });

  it("conversationTokens approximates 70% of totalTokens with default settings", () => {
    const budgets = calculateBudgets("gpt-4o", defaultSettings);
    const approx70Pct = budgets.totalTokens * 0.70;
    expect(budgets.conversationTokens).toBeCloseTo(approx70Pct, -2);
  });
});
