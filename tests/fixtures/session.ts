import type { AiChatSession, InsertAiChatSession } from "../../shared/schema";

export function makeSessionFixture(
  overrides: Partial<InsertAiChatSession> & { id?: number } = {},
): Omit<AiChatSession, "createdAt" | "updatedAt"> & {
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: overrides.id ?? 1,
    userId: overrides.userId ?? "test-user-001",
    title: overrides.title ?? "Test Chat Session",
    lastQuery: overrides.lastQuery ?? null,
    isPinned: overrides.isPinned ?? false,
    rollingContextSummary: overrides.rollingContextSummary ?? null,
    summarizedUntilMessageId: overrides.summarizedUntilMessageId ?? null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

export function makeInsertSessionFixture(
  overrides: Partial<InsertAiChatSession> = {},
): InsertAiChatSession {
  return {
    userId: "test-user-001",
    title: "Test Chat Session",
    isPinned: false,
    lastQuery: null,
    rollingContextSummary: null,
    summarizedUntilMessageId: null,
    ...overrides,
  };
}
