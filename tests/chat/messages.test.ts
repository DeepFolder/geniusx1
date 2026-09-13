import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { buildChatApp } from "../helpers/app";
import { mintMemberToken, authHeader } from "../helpers/auth";
import {
  seedUser,
  seedSession,
  seedMessage,
  clearUserSessions,
  clearChatTables,
  closeDatabaseConnection,
} from "../helpers/db";
import type { ApiMessage, MessageListResponse, ErrorResponse } from "../helpers/types";

describe("Chat message endpoints", () => {
  let app: Express;
  let userId: string;
  let token: string;
  let sessionId: number;

  beforeAll(async () => {
    app = await buildChatApp();
    userId = `msg-test-${Date.now()}`;
    token = mintMemberToken(userId);
    await seedUser({ id: userId, email: `${userId}@test.example` });
  });

  afterAll(async () => {
    await clearUserSessions(userId);
    await clearChatTables();
    await closeDatabaseConnection();
  });

  beforeEach(async () => {
    await clearUserSessions(userId);
    const session = await seedSession(userId, { title: "Message test session" });
    sessionId = session.id;
  });

  describe("POST /api/chat/sessions/:id/messages", () => {
    it("inserts a user message and returns status='complete'", async () => {
      const res = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set(authHeader(token))
        .send({ content: "What motors are available?", isUser: true });

      expect(res.status).toBe(200);
      const msg = res.body as ApiMessage;
      expect(typeof msg.id).toBe("number");
      expect(msg.sessionId).toBe(sessionId);
      expect(msg.content).toBe("What motors are available?");
      expect(msg.isUser).toBe(true);
      expect(msg.status).toBe("complete");
    });

    it("inserts an assistant message; estimatedTokens is null or number", async () => {
      const res = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set(authHeader(token))
        .send({ content: "", isUser: false });

      expect(res.status).toBe(200);
      const msg = res.body as ApiMessage;
      expect(msg.status).toBe("complete");
      expect(
        msg.estimatedTokens === null || typeof msg.estimatedTokens === "number",
      ).toBe(true);
    });

    it("estimatedTokens equals ceil(charCount / 4)", async () => {
      const content = "A".repeat(100);
      const res = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set(authHeader(token))
        .send({ content, isUser: true });

      expect(res.status).toBe(200);
      expect((res.body as ApiMessage).estimatedTokens).toBe(Math.ceil(100 / 4));
    });

    it("response shape includes id, sessionId, content, isUser, status, createdAt", async () => {
      const res = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set(authHeader(token))
        .send({ content: "Schema test", isUser: true });

      expect(res.status).toBe(200);
      const msg = res.body as ApiMessage;
      expect(typeof msg.id).toBe("number");
      expect(msg.sessionId).toBe(sessionId);
      expect(typeof msg.content).toBe("string");
      expect(typeof msg.isUser).toBe("boolean");
      expect(msg.status).toBe("complete");
      expect(msg.createdAt).toBeDefined();
    });

    it("returns 401 when no auth token is provided", async () => {
      const res = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .send({ content: "No auth", isUser: true });

      expect(res.status).toBe(401);
      expect((res.body as ErrorResponse).error).toBeDefined();
    });

    it("returns 404 when posting to another user's session", async () => {
      const otherUserId = `msg-other-${Date.now()}`;
      const otherToken = mintMemberToken(otherUserId);
      await seedUser({ id: otherUserId, email: `${otherUserId}@test.example` });
      const otherSession = await seedSession(otherUserId, { title: "Other session" });

      const res = await request(app)
        .post(`/api/chat/sessions/${otherSession.id}/messages`)
        .set(authHeader(token))
        .send({ content: "Unauthorized attempt", isUser: true });

      expect(res.status).toBe(404);
      await clearUserSessions(otherUserId);
    });

    it("returns 404 when session does not exist", async () => {
      const res = await request(app)
        .post("/api/chat/sessions/999999/messages")
        .set(authHeader(token))
        .send({ content: "Ghost session", isUser: true });

      expect(res.status).toBe(404);
    });

    it("persists searchResults payload without data loss", async () => {
      const searchResults = {
        companies: [{ name: "ACME Corp", score: 0.9 }],
        recommendation: "Best fit: ACME Widget",
      };

      const res = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set(authHeader(token))
        .send({ content: "Results message", isUser: false, searchResults });

      expect(res.status).toBe(200);
      const msg = res.body as ApiMessage;
      expect(msg.searchResults).toBeDefined();
      expect(
        (msg.searchResults as Record<string, string>).recommendation,
      ).toBe("Best fit: ACME Widget");
    });

    it("persists suggestions array without data loss", async () => {
      const suggestions = ["Try motor X", "Or motor Y"];

      const res = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set(authHeader(token))
        .send({ content: "Suggestion message", isUser: false, suggestions });

      expect(res.status).toBe(200);
      expect((res.body as ApiMessage).suggestions).toEqual(suggestions);
    });
  });

  describe("GET /api/chat/sessions/:id/messages", () => {
    it("returns messages in ascending (chronological) order", async () => {
      await seedMessage(sessionId, { content: "First", isUser: true });
      await seedMessage(sessionId, { content: "Second", isUser: false });
      await seedMessage(sessionId, { content: "Third", isUser: true });

      const res = await request(app)
        .get(`/api/chat/sessions/${sessionId}/messages`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      const body = res.body as MessageListResponse;
      expect(body.messages).toHaveLength(3);
      expect(body.messages[0].content).toBe("First");
      expect(body.messages[1].content).toBe("Second");
      expect(body.messages[2].content).toBe("Third");
    });

    it("returns hasMore=false when messages fit within the page limit", async () => {
      await seedMessage(sessionId, { content: "Only message" });

      const res = await request(app)
        .get(`/api/chat/sessions/${sessionId}/messages`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect((res.body as MessageListResponse).hasMore).toBe(false);
    });

    it("returns an empty messages array for a session with no messages", async () => {
      const res = await request(app)
        .get(`/api/chat/sessions/${sessionId}/messages`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect((res.body as MessageListResponse).messages).toHaveLength(0);
    });

    it("returns 401 when no auth token is provided", async () => {
      const res = await request(app).get(
        `/api/chat/sessions/${sessionId}/messages`,
      );

      expect(res.status).toBe(401);
      expect((res.body as ErrorResponse).error).toBeDefined();
    });

    it("returns 404 when session belongs to another user", async () => {
      const otherUserId = `msg-get-other-${Date.now()}`;
      await seedUser({ id: otherUserId, email: `${otherUserId}@test.example` });
      const otherSession = await seedSession(otherUserId, { title: "Not mine" });

      const res = await request(app)
        .get(`/api/chat/sessions/${otherSession.id}/messages`)
        .set(authHeader(token));

      expect(res.status).toBe(404);
      await clearUserSessions(otherUserId);
    });
  });
});
