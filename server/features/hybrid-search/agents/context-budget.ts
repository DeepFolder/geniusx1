import type { AgentSettingsData } from './admin/types';

const K = 1000;
const M = 1000 * 1000;

export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-5.4': 200 * K,

  'gpt-5.2': 200 * K,
  'gpt-5.2-chat-latest': 200 * K,
  'gpt-5.2-codex': 200 * K,
  'gpt-5.2-pro': 200 * K,

  'gpt-5.1': 200 * K,
  'gpt-5.1-chat-latest': 200 * K,
  'gpt-5.1-codex-max': 200 * K,
  'gpt-5.1-codex': 200 * K,
  'gpt-5.1-codex-mini': 200 * K,

  'gpt-5': 128 * K,
  'gpt-5-chat-latest': 128 * K,
  'gpt-5-codex': 128 * K,
  'gpt-5-mini': 128 * K,
  'gpt-5-nano': 128 * K,
  'gpt-5-pro': 128 * K,
  'gpt-5-search-api': 128 * K,

  'gpt-4.1': 1 * M,
  'gpt-4.1-mini': 1 * M,
  'gpt-4.1-nano': 1 * M,

  'gpt-4o': 128 * K,
  'gpt-4o-2024-05-13': 128 * K,
  'gpt-4o-mini': 128 * K,
  'gpt-4o-search-preview': 128 * K,
  'gpt-4o-mini-search-preview': 128 * K,

  'o1': 200 * K,
  'o1-mini': 128 * K,
  'o1-pro': 200 * K,
  'o3': 200 * K,
  'o3-mini': 200 * K,
  'o3-pro': 200 * K,
  'o3-deep-research': 200 * K,
  'o4-mini': 200 * K,
  'o4-mini-deep-research': 200 * K,

  'codex-mini-latest': 200 * K,

  'computer-use-preview': 128 * K,
};

export const DEFAULT_CONTEXT_WINDOW = 128 * K;

export function getModelContextWindow(model: string): number {
  if (!model) return DEFAULT_CONTEXT_WINDOW;
  if (MODEL_CONTEXT_WINDOWS[model]) return MODEL_CONTEXT_WINDOWS[model];

  const lower = model.toLowerCase();
  for (const [key, value] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
    if (lower.startsWith(key.toLowerCase())) return value;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

export interface ContextBudgets {
  totalTokens: number;
  systemTokens: number;
  fluidTokens: number;
  conversationTokens: number;
  compactionTriggerTokens: number;
}

function clampPct(pct: number, fallback: number): number {
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0) return fallback;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

/**
 * Splits the model context window into three named slots
 * (system instruction / fluid memory / conversation) that always
 * sum to 100% of the available window. If admin-configured percentages
 * do not sum to 100, they are normalized proportionally so the partition
 * is preserved. Falls back to defaults (20/10/70) when input is invalid.
 */
export function calculateBudgets(
  model: string,
  settings: Pick<
    AgentSettingsData,
    'systemInstructionPct' | 'fluidMemoryPct' | 'conversationPct' | 'compactionThresholdPct'
  >
): ContextBudgets {
  const totalTokens = getModelContextWindow(model);

  let systemPct = clampPct(settings.systemInstructionPct, 20);
  let fluidPct = clampPct(settings.fluidMemoryPct, 10);
  let conversationPct = clampPct(settings.conversationPct, 70);
  const triggerPct = clampPct(settings.compactionThresholdPct, 70);

  const sum = systemPct + fluidPct + conversationPct;
  if (sum === 0) {
    systemPct = 20;
    fluidPct = 10;
    conversationPct = 70;
  } else if (sum !== 100) {
    systemPct = Math.round((systemPct * 100) / sum);
    fluidPct = Math.round((fluidPct * 100) / sum);
    conversationPct = 100 - systemPct - fluidPct;
    if (conversationPct < 0) conversationPct = 0;
  }

  const systemTokens = Math.floor((totalTokens * systemPct) / 100);
  const fluidTokens = Math.floor((totalTokens * fluidPct) / 100);
  const conversationTokens = Math.floor((totalTokens * conversationPct) / 100);
  const compactionTriggerTokens = Math.floor((conversationTokens * triggerPct) / 100);

  return {
    totalTokens,
    systemTokens,
    fluidTokens,
    conversationTokens,
    compactionTriggerTokens,
  };
}

export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
