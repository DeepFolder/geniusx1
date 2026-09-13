import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import * as schema from "../../shared/schema";
import {
  seedUser,
  seedSession,
  seedMessage,
  clearUserSessions,
  clearChatTables,
  closeDatabaseConnection,
} from "../helpers/db";
import { makeAgentSettingsFixture } from "../fixtures/agentSettings";
import {
  getContextForSession,
  runCompactionIfNeeded,
} from "../../server/features/hybrid-search/agents/context-compaction";

const DEFAULT_SETTINGS = makeAgentSettingsFixture();

/** Direct DB handle for asserting side effects written by the compaction worker */
let assertPool: Pool;
let assertDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(() => {
  assertPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  assertDb = drizzle({ client: assertPool, schema });
});

afterAll(async () => {
  await assertPool.end();
});

// ---------------------------------------------------------------------------
// getContextForSession
// ---------------------------------------------------------------------------
describe("getContextForSession", () => {
  let userId: string;
  let sessionId: number;

  beforeAll(async () => {
    userId = `compact-ctx-${Date.now()}`;
    await seedUser({ id: userId, email: `${userId}@test.example` });
  });

  afterAll(async () => {
    await clearUserSessions(userId);
    await clearChatTables();
    await closeDatabaseConnection();
  });

  beforeEach(async () => {
    await clearUserSessions(userId);
    const session = await seedSession(userId, {
      title: "Compaction test session",
      summarizedUntilMessageId: null,
      rollingContextSummary: null,
    });
    sessionId = session.id;
  });

  it("returns empty context when userId is null", async () => {
    const ctx = await getContextForSession(sessionId, null, DEFAULT_SETTINGS);
    expect(ctx.summary).toBeNull();
    expect(ctx.recentMessages).toHaveLength(0);
    expect(ctx.recentTokens).toBe(0);
    expect(ctx.bookmarkMessageId).toBeNull();
  });

  it("returns empty context when userId is undefined", async () => {
    const ctx = await getContextForSession(sessionId, undefined, DEFAULT_SETTINGS);
    expect(ctx.recentMessages).toHaveLength(0);
  });

  it("returns empty context when userId is an empty string", async () => {
    const ctx = await getContextForSession(sessionId, "", DEFAULT_SETTINGS);
    expect(ctx.recentMessages).toHaveLength(0);
  });

  it("returns empty context when the session does not belong to the user", async () => {
    const otherUserId = `compact-other-${Date.now()}`;
    await seedUser({ id: otherUserId, email: `${otherUserId}@test.example` });

    const ctx = await getContextForSession(sessionId, otherUserId, DEFAULT_SETTINGS);
    expect(ctx.recentMessages).toHaveLength(0);

    await clearUserSessions(otherUserId);
  });

  it("returns empty context when sessionId is 0 or negative", async () => {
    const ctx0 = await getContextForSession(0, userId, DEFAULT_SETTINGS);
    expect(ctx0.recentMessages).toHaveLength(0);

    const ctxNeg = await getContextForSession(-1, userId, DEFAULT_SETTINGS);
    expect(ctxNeg.recentMessages).toHaveLength(0);
  });

  it("returns all messages when summarizedUntilMessageId is NULL (no bookmark yet)", async () => {
    await seedMessage(sessionId, { content: "First message", isUser: true });
    await seedMessage(sessionId, { content: "Second message", isUser: false });

    const ctx = await getContextForSession(sessionId, userId, DEFAULT_SETTINGS);

    expect(ctx.recentMessages).toHaveLength(2);
    expect(ctx.recentMessages[0].role).toBe("user");
    expect(ctx.recentMessages[0].content).toBe("First message");
    expect(ctx.recentMessages[1].role).toBe("assistant");
    expect(ctx.recentMessages[1].content).toBe("Second message");
    expect(ctx.bookmarkMessageId).toBeNull();
  });

  it("returns only messages after summarizedUntilMessageId when bookmark is set", async () => {
    const m1 = await seedMessage(sessionId, { content: "Before bookmark", isUser: true });
    await seedMessage(sessionId, { content: "After bookmark", isUser: false });

    await assertDb
      .update(schema.aiChatSessions)
      .set({ summarizedUntilMessageId: m1.id })
      .where(eq(schema.aiChatSessions.id, sessionId));

    const ctx = await getContextForSession(sessionId, userId, DEFAULT_SETTINGS);

    expect(ctx.recentMessages).toHaveLength(1);
    expect(ctx.recentMessages[0].content).toBe("After bookmark");
    expect(ctx.bookmarkMessageId).toBe(m1.id);
  });

  it("returns rolling summary when present on the session", async () => {
    await assertDb
      .update(schema.aiChatSessions)
      .set({ rollingContextSummary: "User discussed servo motors" })
      .where(eq(schema.aiChatSessions.id, sessionId));

    const ctx = await getContextForSession(sessionId, userId, DEFAULT_SETTINGS);
    expect(ctx.summary).toBe("User discussed servo motors");
  });

  it("accumulates recentTokens using estimatedTokens from the DB", async () => {
    await seedMessage(sessionId, { content: "Hello", isUser: true, estimatedTokens: 100 });
    await seedMessage(sessionId, { content: "World", isUser: false, estimatedTokens: 200 });

    const ctx = await getContextForSession(sessionId, userId, DEFAULT_SETTINGS);
    expect(ctx.recentTokens).toBe(300);
  });

  it("skips messages with empty or whitespace-only content", async () => {
    await seedMessage(sessionId, { content: "   ", isUser: true });
    await seedMessage(sessionId, { content: "Real message", isUser: false });

    const ctx = await getContextForSession(sessionId, userId, DEFAULT_SETTINGS);
    expect(ctx.recentMessages).toHaveLength(1);
    expect(ctx.recentMessages[0].content).toBe("Real message");
  });
});

// ---------------------------------------------------------------------------
// runCompactionIfNeeded
// ---------------------------------------------------------------------------
describe("runCompactionIfNeeded", () => {
  let userId: string;
  /** create mock function returned by the mocked OpenAI constructor */
  let openaiCreateMock: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    userId = `compact-run-${Date.now()}`;
    await seedUser({ id: userId, email: `${userId}@test.example` });

    /**
     * The global mock in tests/setup.ts makes `new OpenAI()` return an object
     * whose `chat.completions.create` is a shared vi.fn() instance.
     * Constructing one instance here is enough to obtain a reference to that
     * shared mock function.
     */
    const { default: MockOpenAI } = await import("openai");
    type MockInstance = { chat: { completions: { create: ReturnType<typeof vi.fn> } } };
    type MockCtor = new () => MockInstance;
    const instance = new (MockOpenAI as unknown as MockCtor)();
    openaiCreateMock = instance.chat.completions.create;
  });

  afterAll(async () => {
    await clearUserSessions(userId);
    await clearChatTables();
    await closeDatabaseConnection();
  });

  beforeEach(async () => {
    await clearUserSessions(userId);
    openaiCreateMock?.mockClear();
  });

  it("does nothing when sessionId is 0", () => {
    expect(() => runCompactionIfNeeded(0, DEFAULT_SETTINGS)).not.toThrow();
  });

  it("does nothing when sessionId is negative", () => {
    expect(() => runCompactionIfNeeded(-1, DEFAULT_SETTINGS)).not.toThrow();
  });

  it("skips compaction when OPENAI_API_KEY is not set", async () => {
    const session = await seedSession(userId, { title: "No key session" });
    await seedMessage(session.id, { content: "Big message", isUser: true, estimatedTokens: 40000 });
    await seedMessage(session.id, { content: "Big response", isUser: false, estimatedTokens: 40000 });

    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    runCompactionIfNeeded(session.id, DEFAULT_SETTINGS);
    await new Promise((r) => setTimeout(r, 400));

    expect(openaiCreateMock).not.toHaveBeenCalled();

    if (originalKey) process.env.OPENAI_API_KEY = originalKey;
  });

  it("does nothing when token count is below compaction threshold", async () => {
    const session = await seedSession(userId, { title: "Below threshold session" });
    await seedMessage(session.id, { content: "Short message", isUser: true });
    await seedMessage(session.id, { content: "Short response", isUser: false });

    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    runCompactionIfNeeded(session.id, DEFAULT_SETTINGS);
    await new Promise((r) => setTimeout(r, 400));

    expect(openaiCreateMock).not.toHaveBeenCalled();

    process.env.OPENAI_API_KEY = originalKey ?? "";
  });

  it("calls the OpenAI API and writes summary + bookmark to DB when token budget is exceeded", async () => {
    const session = await seedSession(userId, { title: "High token session" });
    const m1 = await seedMessage(session.id, {
      content: "High token user message",
      isUser: true,
      estimatedTokens: 35000,
    });
    const m2 = await seedMessage(session.id, {
      content: "High token assistant response",
      isUser: false,
      estimatedTokens: 35000,
    });

    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    openaiCreateMock.mockResolvedValueOnce({
      id: "test-compaction-id",
      choices: [
        {
          message: { role: "assistant", content: "Summary: User asked about motors." },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 500, completion_tokens: 50, total_tokens: 550 },
    });

    runCompactionIfNeeded(session.id, DEFAULT_SETTINGS);
    await new Promise((r) => setTimeout(r, 800));

    expect(openaiCreateMock).toHaveBeenCalledTimes(1);

    // --- DB side-effect assertions ---
    const [updatedSession] = await assertDb
      .select({
        rollingContextSummary: schema.aiChatSessions.rollingContextSummary,
        summarizedUntilMessageId: schema.aiChatSessions.summarizedUntilMessageId,
      })
      .from(schema.aiChatSessions)
      .where(eq(schema.aiChatSessions.id, session.id));

    // Rolling summary must be the text returned by the mock
    expect(updatedSession.rollingContextSummary).toBe("Summary: User asked about motors.");

    // Bookmark must advance to the last message id in the compacted window
    const expectedBookmark = Math.max(m1.id, m2.id);
    expect(updatedSession.summarizedUntilMessageId).toBe(expectedBookmark);

    process.env.OPENAI_API_KEY = originalKey ?? "";
  });

  it("does NOT advance the bookmark when the OpenAI call returns an empty summary", async () => {
    const session = await seedSession(userId, { title: "Empty summary session" });
    await seedMessage(session.id, { content: "Lots of tokens", isUser: true, estimatedTokens: 35000 });
    await seedMessage(session.id, { content: "Also lots", isUser: false, estimatedTokens: 35000 });

    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    openaiCreateMock.mockResolvedValueOnce({
      id: "empty-summary",
      choices: [{ message: { role: "assistant", content: "" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 500, completion_tokens: 0, total_tokens: 500 },
    });

    runCompactionIfNeeded(session.id, DEFAULT_SETTINGS);
    await new Promise((r) => setTimeout(r, 800));

    const [updatedSession] = await assertDb
      .select({
        rollingContextSummary: schema.aiChatSessions.rollingContextSummary,
        summarizedUntilMessageId: schema.aiChatSessions.summarizedUntilMessageId,
      })
      .from(schema.aiChatSessions)
      .where(eq(schema.aiChatSessions.id, session.id));

    // Neither field should have been written on empty summary
    expect(updatedSession.rollingContextSummary).toBeNull();
    expect(updatedSession.summarizedUntilMessageId).toBeNull();

    process.env.OPENAI_API_KEY = originalKey ?? "";
  });

  it("is safe to call with a session that has no messages (no-op)", async () => {
    const session = await seedSession(userId, { title: "Empty session" });
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";

    expect(() => runCompactionIfNeeded(session.id, DEFAULT_SETTINGS)).not.toThrow();
    await new Promise((r) => setTimeout(r, 400));

    expect(openaiCreateMock).not.toHaveBeenCalled();

    process.env.OPENAI_API_KEY = originalKey ?? "";
  });
});
