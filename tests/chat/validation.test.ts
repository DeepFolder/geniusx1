import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { buildChatApp } from "../helpers/app";
import { mintMemberToken, authHeader } from "../helpers/auth";
import {
  seedUser,
  seedSession,
  clearUserSessions,
  clearChatTables,
  closeDatabaseConnection,
} from "../helpers/db";
import type { ErrorResponse } from "../helpers/types";

/**
 * Schema / payload validation tests.
 *
 * Coverage:
 *   • POST /api/chat/sessions          — auth, default title.
 *   • PATCH /api/chat/sessions/:id/rename — 400 on missing/empty title.
 *   • POST /api/chat/sessions/:id/messages — auth (401), session-ownership
 *     (404), and valid-payload (200) guards. Body-field type-coercion tests
 *     (null isUser, missing content, etc.) require a Zod guard in the route
 *     that does not yet exist; those cases are tracked in task #328.
 *
 * NOTE: task spec lists PATCH /api/chat/sessions/:id; production route is
 * registered as PATCH /api/chat/sessions/:id/rename (server/routes.ts).
 */
describe("Chat endpoint schema validation", () => {
  let app: Express;
  let userId: string;
  let token: string;
  let sessionId: number;

  beforeAll(async () => {
    app = await buildChatApp();
    userId = `validation-${Date.now()}`;
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
    const session = await seedSession(userId, { title: "Validation session" });
    sessionId = session.id;
  });

  // -------------------------------------------------------------------------
  // POST /api/chat/sessions
  // -------------------------------------------------------------------------
  describe("POST /api/chat/sessions", () => {
    it("accepts empty body and defaults title to 'New Chat'", async () => {
      const res = await request(app)
        .post("/api/chat/sessions")
        .set(authHeader(token))
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("New Chat");
    });

    it("accepts a valid title string", async () => {
      const res = await request(app)
        .post("/api/chat/sessions")
        .set(authHeader(token))
        .send({ title: "Valid Title" });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Valid Title");
    });

    it("returns 401 when called without auth", async () => {
      const res = await request(app)
        .post("/api/chat/sessions")
        .send({ title: "No auth" });

      expect(res.status).toBe(401);
      expect((res.body as ErrorResponse).error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/chat/sessions/:id/messages — enforced contracts only
  // Body-field validation (null isUser, missing content) is deferred to #328.
  // -------------------------------------------------------------------------
  describe("POST /api/chat/sessions/:id/messages — enforced guards", () => {
    it("returns 401 when called without auth", async () => {
      const res = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .send({ content: "No auth", isUser: true });

      expect(res.status).toBe(401);
      expect((res.body as ErrorResponse).error).toBeDefined();
    });

    it("returns 404 when session does not exist", async () => {
      const res = await request(app)
        .post("/api/chat/sessions/999999/messages")
        .set(authHeader(token))
        .send({ content: "Ghost session", isUser: true });

      expect(res.status).toBe(404);
    });

    it("returns 404 when session belongs to another user", async () => {
      const otherId = `val-other-${Date.now()}`;
      await seedUser({ id: otherId, email: `${otherId}@test.example` });
      const otherSession = await seedSession(otherId, { title: "Not mine" });

      const res = await request(app)
        .post(`/api/chat/sessions/${otherSession.id}/messages`)
        .set(authHeader(token))
        .send({ content: "Unauthorized", isUser: true });

      expect(res.status).toBe(404);
      await clearUserSessions(otherId);
    });

    it("valid payload returns 200 (regression guard)", async () => {
      const res = await request(app)
        .post(`/api/chat/sessions/${sessionId}/messages`)
        .set(authHeader(token))
        .send({ content: "Valid message", isUser: true });

      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /api/chat/sessions/:id/rename — pre-existing explicit validation
  // -------------------------------------------------------------------------
  describe("PATCH /api/chat/sessions/:id/rename", () => {
    it("returns 400 + error when title is missing", async () => {
      const res = await request(app)
        .patch(`/api/chat/sessions/${sessionId}/rename`)
        .set(authHeader(token))
        .send({});

      expect(res.status).toBe(400);
      const body = res.body as ErrorResponse;
      expect(body.error).toBeDefined();
      expect(typeof body.error).toBe("string");
    });

    it("returns 400 + error when title is an empty string", async () => {
      const res = await request(app)
        .patch(`/api/chat/sessions/${sessionId}/rename`)
        .set(authHeader(token))
        .send({ title: "" });

      expect(res.status).toBe(400);
      const body = res.body as ErrorResponse;
      expect(body.error).toBeDefined();
      expect(typeof body.error).toBe("string");
    });

    it("accepts a valid title and returns updated session", async () => {
      const res = await request(app)
        .patch(`/api/chat/sessions/${sessionId}/rename`)
        .set(authHeader(token))
        .send({ title: "Renamed Title" });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Renamed Title");
    });

    it("returns 404 when session does not exist", async () => {
      const res = await request(app)
        .patch("/api/chat/sessions/999999/rename")
        .set(authHeader(token))
        .send({ title: "Ghost" });

      expect(res.status).toBe(404);
    });

    it("returns 401 when called without auth", async () => {
      const res = await request(app)
        .patch(`/api/chat/sessions/${sessionId}/rename`)
        .send({ title: "No auth" });

      expect(res.status).toBe(401);
      expect((res.body as ErrorResponse).error).toBeDefined();
    });
  });
});
