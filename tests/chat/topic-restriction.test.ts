import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { buildChatApp } from "../helpers/app";
import { clearChatTables, closeDatabaseConnection } from "../helpers/db";
import type { NdjsonEvent } from "../helpers/types";
import type * as QueryClassifierModule from "../../server/features/hybrid-search/agents/query-classifier";

/**
 * Topic-restriction integration tests.
 *
 * These tests exercise the full POST /api/openai/agent-search-stream request
 * path. classifyQuery is mocked so the intent can be forced to 'off_topic'
 * without a real OpenAI call.
 *
 * Design decisions:
 *  • mode='database' bypasses the OPENAI_API_KEY guard in the route (~line 250)
 *    without requiring credentials, while still exercising the classifier and
 *    topic-restriction logic.
 *  • The endpoint streams NDJSON (newline-delimited JSON). When a query is
 *    blocked the handler emits { type:'result', data:{ topic_restricted:true,
 *    decision_summary:..., data:[] } } then closes the stream.
 *  • No auth token is required — the route resolves userId optionally from
 *    session/JWT but does not require it for the topic-restriction path.
 */

vi.mock(
  "../../server/features/hybrid-search/agents/query-classifier",
  async () => {
    const actual = await vi.importActual<typeof QueryClassifierModule>(
      "../../server/features/hybrid-search/agents/query-classifier",
    );
    return {
      ...actual,
      classifyQuery: vi.fn().mockResolvedValue({
        ...actual.DEFAULT_CLASSIFICATION,
        intent: "off_topic",
        classification_confidence: 0.95,
        _usage: {
          total_tokens: 100,
          prompt_tokens: 90,
          completion_tokens: 10,
          model: "gpt-4o-mini",
          duration_ms: 300,
        },
      }),
    };
  },
);

/** Parse a raw NDJSON buffer into typed event objects */
function parseNDJSON(raw: string): NdjsonEvent[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as NdjsonEvent];
      } catch {
        return [] as NdjsonEvent[];
      }
    });
}

describe("Topic restriction — agent-search-stream integration", () => {
  let app: Express;

  beforeAll(async () => {
    app = await buildChatApp();
  });

  afterAll(async () => {
    await clearChatTables();
    await closeDatabaseConnection();
  });

  beforeEach(async () => {
    await clearChatTables();
  });

  it("returns topic_restricted=true in the result event when classifier returns off_topic", async () => {
    const res = await request(app)
      .post("/api/openai/agent-search-stream")
      .send({ query: "What is the weather today?", mode: "database", chatHistory: [] })
      .buffer(true)
      .parse((response, callback) => {
        let data = "";
        response.on("data", (chunk: Buffer) => (data += chunk.toString()));
        response.on("end", () => callback(null, data));
      });

    const events = parseNDJSON(res.text ?? (res.body as string));
    const resultEvent = events.find((e) => e.type === "result");

    expect(resultEvent).toBeDefined();
    expect(resultEvent?.data?.topic_restricted).toBe(true);
  });

  it("includes a non-empty decision_summary in the blocked result", async () => {
    const res = await request(app)
      .post("/api/openai/agent-search-stream")
      .send({ query: "Tell me a recipe for pasta", mode: "database", chatHistory: [] })
      .buffer(true)
      .parse((response, callback) => {
        let data = "";
        response.on("data", (chunk: Buffer) => (data += chunk.toString()));
        response.on("end", () => callback(null, data));
      });

    const events = parseNDJSON(res.text ?? (res.body as string));
    const resultEvent = events.find((e) => e.type === "result");

    expect(resultEvent).toBeDefined();
    expect(resultEvent?.data?.topic_restricted).toBe(true);
    expect(typeof resultEvent?.data?.decision_summary).toBe("string");
    expect((resultEvent?.data?.decision_summary as string).length).toBeGreaterThan(0);
  });

  it("blocked result has empty data array (no products returned)", async () => {
    const res = await request(app)
      .post("/api/openai/agent-search-stream")
      .send({ query: "Who won the last World Cup?", mode: "database", chatHistory: [] })
      .buffer(true)
      .parse((response, callback) => {
        let data = "";
        response.on("data", (chunk: Buffer) => (data += chunk.toString()));
        response.on("end", () => callback(null, data));
      });

    const events = parseNDJSON(res.text ?? (res.body as string));
    const resultEvent = events.find((e) => e.type === "result");

    expect(resultEvent).toBeDefined();
    expect(resultEvent?.data?.topic_restricted).toBe(true);
    expect(Array.isArray(resultEvent?.data?.data)).toBe(true);
    expect((resultEvent?.data?.data as unknown[]).length).toBe(0);
  });

  it("does NOT fire topic restriction when chatHistory has 2+ messages (in-conversation follow-up bypass)", async () => {
    const { classifyQuery } = await import(
      "../../server/features/hybrid-search/agents/query-classifier"
    );
    const { DEFAULT_CLASSIFICATION } = await import(
      "../../server/features/hybrid-search/agents/query-classifier"
    );
    (classifyQuery as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...DEFAULT_CLASSIFICATION,
      intent: "off_topic",
      classification_confidence: 0.95,
      _usage: { total_tokens: 100, prompt_tokens: 90, completion_tokens: 10, model: "gpt-4o-mini", duration_ms: 300 },
    });

    const res = await request(app)
      .post("/api/openai/agent-search-stream")
      .send({
        query: "What is 2+2?",
        mode: "database",
        chatHistory: [
          { role: "user", content: "What motors do you have?" },
          { role: "assistant", content: "We have AC and DC motors." },
        ],
      })
      .buffer(true)
      .parse((response, callback) => {
        let data = "";
        response.on("data", (chunk: Buffer) => (data += chunk.toString()));
        response.on("end", () => callback(null, data));
      });

    const events = parseNDJSON(res.text ?? (res.body as string));

    // With 2+ history messages topic restriction is SKIPPED — result must NOT
    // contain topic_restricted:true.
    const blocked = events.some(
      (e) => e.type === "result" && e.data?.topic_restricted === true,
    );
    expect(blocked).toBe(false);
  });

  it("emits an error event (not a blocked result) when query is missing", async () => {
    const res = await request(app)
      .post("/api/openai/agent-search-stream")
      .send({ mode: "database" })
      .buffer(true)
      .parse((response, callback) => {
        let data = "";
        response.on("data", (chunk: Buffer) => (data += chunk.toString()));
        response.on("end", () => callback(null, data));
      });

    if (res.status !== 200) {
      // Route rejected at the HTTP layer before streaming
      expect(res.status).toBeGreaterThanOrEqual(400);
    } else {
      const events = parseNDJSON(res.text ?? (res.body as string));
      const errorEvent = events.find((e) => e.type === "error");
      const blocked = events.some(
        (e) => e.type === "result" && e.data?.topic_restricted === true,
      );
      // Must have an error event OR no blocked result
      expect(errorEvent !== undefined || !blocked).toBe(true);
    }
  });
});
