import type { AiChatSessionMessage, InsertAiChatSessionMessage } from "../../shared/schema";

export function makeMessageFixture(
  overrides: Partial<InsertAiChatSessionMessage> & { id?: number } = {},
): Omit<AiChatSessionMessage, "createdAt"> & { createdAt: Date } {
  return {
    id: overrides.id ?? 1,
    sessionId: overrides.sessionId ?? 1,
    content: overrides.content ?? "Test message content",
    isUser: overrides.isUser ?? true,
    searchResults: overrides.searchResults ?? null,
    suggestions: overrides.suggestions ?? null,
    status: overrides.status ?? "complete",
    estimatedTokens: overrides.estimatedTokens ?? null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

export function makeUserMessageFixture(
  content: string,
  overrides: Partial<InsertAiChatSessionMessage> & { id?: number } = {},
): ReturnType<typeof makeMessageFixture> {
  return makeMessageFixture({ content, isUser: true, ...overrides });
}

export function makeAssistantMessageFixture(
  content: string,
  overrides: Partial<InsertAiChatSessionMessage> & { id?: number } = {},
): ReturnType<typeof makeMessageFixture> {
  return makeMessageFixture({ content, isUser: false, ...overrides });
}

export function makeInsertMessageFixture(
  overrides: Partial<InsertAiChatSessionMessage> = {},
): InsertAiChatSessionMessage {
  return {
    sessionId: 1,
    content: "Test message content",
    isUser: true,
    searchResults: null,
    suggestions: null,
    status: "complete",
    estimatedTokens: null,
    ...overrides,
  };
}
