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
import type { ApiSession, SessionListResponse } from "../helpers/types";

describe("Chat session endpoints", () => {
  let app: Express;
  let userId: string;
  let token: string;

  beforeAll(async () => {
    app = await buildChatApp();
    userId = `sess-test-${Date.now()}`;
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
  });

  describe("POST /api/chat/sessions", () => {
    it("creates a session and returns its id and userId", async () => {
      const res = await request(app)
        .post("/api/chat/sessions")
        .set(authHeader(token))
        .send({ title: "My first session" });

      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(typeof res.body.id).toBe("number");
      expect(res.body.userId).toBe(userId);
      expect(res.body.title).toBe("My first session");
    });

    it("uses 'New Chat' as default title when no title provided", async () => {
      const res = await request(app)
        .post("/api/chat/sessions")
        .set(authHeader(token))
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("New Chat");
    });

    it("returns 401 when no auth token is provided", async () => {
      const res = await request(app)
        .post("/api/chat/sessions")
        .send({ title: "No auth" });

      expect(res.status).toBe(401);
    });

    it("returns 401 when an invalid token is provided", async () => {
      const res = await request(app)
        .post("/api/chat/sessions")
        .set({ Authorization: "Bearer invalid-token" })
        .send({ title: "Bad token" });

      expect(res.status).toBe(401);
    });
  });

  describe("GET /api/chat/sessions", () => {
    it("returns only the requesting user's sessions", async () => {
      const otherUserId = `sess-other-${Date.now()}`;
      const otherToken = mintMemberToken(otherUserId);
      await seedUser({ id: otherUserId, email: `${otherUserId}@test.example` });

      await seedSession(userId, { title: "My session" });
      await seedSession(otherUserId, { title: "Other session" });

      const res = await request(app)
        .get("/api/chat/sessions")
        .set(authHeader(token));

      expect(res.status).toBe(200);
      const body = res.body as SessionListResponse;
      const sessionTitles = body.sessions.map((s: ApiSession) => s.title);
      expect(sessionTitles).toContain("My session");
      expect(sessionTitles).not.toContain("Other session");

      const otherRes = await request(app)
        .get("/api/chat/sessions")
        .set(authHeader(otherToken));

      expect(otherRes.status).toBe(200);
      const otherBody = otherRes.body as SessionListResponse;
      const otherTitles = otherBody.sessions.map((s: ApiSession) => s.title);
      expect(otherTitles).toContain("Other session");
      expect(otherTitles).not.toContain("My session");

      await clearUserSessions(otherUserId);
    });

    it("returns 401 when no auth token is provided", async () => {
      const res = await request(app).get("/api/chat/sessions");
      expect(res.status).toBe(401);
    });

    it("returns sessions and nextCursor in response shape", async () => {
      await seedSession(userId, { title: "Session A" });

      const res = await request(app)
        .get("/api/chat/sessions")
        .set(authHeader(token));

      expect(res.status).toBe(200);
      const body = res.body as SessionListResponse;
      expect(Array.isArray(body.sessions)).toBe(true);
      expect("nextCursor" in res.body).toBe(true);
    });

    it("returns an empty sessions array when user has no sessions", async () => {
      const res = await request(app)
        .get("/api/chat/sessions")
        .set(authHeader(token));

      expect(res.status).toBe(200);
      const body = res.body as SessionListResponse;
      expect(body.sessions).toHaveLength(0);
    });

    it("includes both pinned and unpinned sessions in the list", async () => {
      await seedSession(userId, { title: "Pinned Session", isPinned: true });
      await seedSession(userId, { title: "Unpinned Session", isPinned: false });

      const res = await request(app)
        .get("/api/chat/sessions")
        .set(authHeader(token));

      expect(res.status).toBe(200);
      const body = res.body as SessionListResponse;
      const titles = body.sessions.map((s: ApiSession) => s.title);
      expect(titles).toContain("Pinned Session");
      expect(titles).toContain("Unpinned Session");
    });
  });

  describe("DELETE /api/chat/sessions/:id", () => {
    it("deletes the session and returns success", async () => {
      const session = await seedSession(userId, { title: "To delete" });

      const res = await request(app)
        .delete(`/api/chat/sessions/${session.id}`)
        .set(authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("cascade-deletes messages when session is deleted", async () => {
      const session = await seedSession(userId, { title: "Has messages" });
      await seedMessage(session.id, { content: "msg 1" });
      await seedMessage(session.id, { content: "msg 2" });

      const deleteRes = await request(app)
        .delete(`/api/chat/sessions/${session.id}`)
        .set(authHeader(token));

      expect(deleteRes.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/chat/sessions/${session.id}/messages`)
        .set(authHeader(token));

      expect(getRes.status).toBe(404);
    });

    it("returns 404 when session does not exist", async () => {
      const res = await request(app)
        .delete("/api/chat/sessions/999999")
        .set(authHeader(token));

      expect(res.status).toBe(404);
    });

    it("returns 401 when no auth token is provided", async () => {
      const session = await seedSession(userId, { title: "No auth delete" });

      const res = await request(app)
        .delete(`/api/chat/sessions/${session.id}`);

      expect(res.status).toBe(401);
    });
  });

  /**
   * NOTE: The task spec lists this endpoint as PATCH /api/chat/sessions/:id.
   * The actual production route (server/routes.ts line 6928) is registered as
   * PATCH /api/chat/sessions/:id/rename.  Tests target the real route path.
   */
  describe("PATCH /api/chat/sessions/:id/rename", () => {
    it("renames the session and returns updated session", async () => {
      const session = await seedSession(userId, { title: "Old Title" });

      const res = await request(app)
        .patch(`/api/chat/sessions/${session.id}/rename`)
        .set(authHeader(token))
        .send({ title: "New Title" });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("New Title");
      expect(res.body.id).toBe(session.id);
    });

    it("trims whitespace from the new title", async () => {
      const session = await seedSession(userId, { title: "Untrimmed" });

      const res = await request(app)
        .patch(`/api/chat/sessions/${session.id}/rename`)
        .set(authHeader(token))
        .send({ title: "  Trimmed Title  " });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Trimmed Title");
    });

    it("returns 400 when title is missing", async () => {
      const session = await seedSession(userId, { title: "No title rename" });

      const res = await request(app)
        .patch(`/api/chat/sessions/${session.id}/rename`)
        .set(authHeader(token))
        .send({});

      expect(res.status).toBe(400);
    });

    it("returns 404 when session does not exist", async () => {
      const res = await request(app)
        .patch("/api/chat/sessions/999999/rename")
        .set(authHeader(token))
        .send({ title: "Ghost" });

      expect(res.status).toBe(404);
    });

    it("returns 401 when no auth token is provided", async () => {
      const session = await seedSession(userId, { title: "Unauth rename" });

      const res = await request(app)
        .patch(`/api/chat/sessions/${session.id}/rename`)
        .send({ title: "New" });

      expect(res.status).toBe(401);
    });
  });
});
