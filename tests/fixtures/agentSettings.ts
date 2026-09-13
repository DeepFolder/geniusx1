import type { AgentSettings, InsertAgentSettings } from "../../shared/schema";

export function makeAgentSettingsFixture(
  overrides: Partial<InsertAgentSettings> & { id?: number } = {},
): Omit<AgentSettings, "createdAt" | "updatedAt"> & {
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: overrides.id ?? 1,
    name: overrides.name ?? "Test Agent",
    instructions: overrides.instructions ?? "You are a helpful test assistant.",
    model: overrides.model ?? "gpt-4o",
    reasoningEffort: overrides.reasoningEffort ?? null,
    storeEnabled: overrides.storeEnabled ?? false,
    webSearchEnabled: overrides.webSearchEnabled ?? false,
    searchContextSize: overrides.searchContextSize ?? "medium",
    temperature: overrides.temperature ?? null,
    maxTokens: overrides.maxTokens ?? 4096,
    outputSchema: overrides.outputSchema ?? null,
    reasoningSummary: overrides.reasoningSummary ?? null,
    guardrailsEnabled: overrides.guardrailsEnabled ?? false,
    guardrailsConfig: overrides.guardrailsConfig ?? null,
    topicRestrictionEnabled: overrides.topicRestrictionEnabled ?? true,
    topicRestrictionMessage: overrides.topicRestrictionMessage ?? null,
    allowedTopics: overrides.allowedTopics ?? null,
    compactionThresholdPct: overrides.compactionThresholdPct ?? 70,
    compactionModel: overrides.compactionModel ?? null,
    systemInstructionPct: overrides.systemInstructionPct ?? 20,
    fluidMemoryPct: overrides.fluidMemoryPct ?? 10,
    conversationPct: overrides.conversationPct ?? 70,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

export function makeInsertAgentSettingsFixture(
  overrides: Partial<InsertAgentSettings> = {},
): InsertAgentSettings {
  return {
    name: "Test Agent",
    instructions: "You are a helpful test assistant.",
    model: "gpt-4o",
    reasoningEffort: null,
    storeEnabled: false,
    webSearchEnabled: false,
    searchContextSize: "medium",
    temperature: null,
    maxTokens: 4096,
    outputSchema: null,
    reasoningSummary: null,
    guardrailsEnabled: false,
    guardrailsConfig: null,
    topicRestrictionEnabled: true,
    topicRestrictionMessage: null,
    allowedTopics: null,
    compactionThresholdPct: 70,
    compactionModel: null,
    systemInstructionPct: 20,
    fluidMemoryPct: 10,
    conversationPct: 70,
    ...overrides,
  };
}
