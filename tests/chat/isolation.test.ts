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

/**
 * Cross-user isolation tests — critical security regression guard.
 * Verifies that no session data leaks between users on any endpoint.
 * A user must receive 403 or 404 (never 200) when accessing another
 * user's resources.
 *
 * NOTE: task spec lists PATCH /api/chat/sessions/:id; actual route is
 * PATCH /api/chat/sessions/:id/rename (server/routes.ts:6928). Tests target
 * the real route.
 */
describe("Cross-user session isolation", () => {
  let app: Express;
  let userAId: string;
  let userBId: string;
  let tokenA: string;
  let tokenB: string;
  let sessionA: number;
  let sessionB: number;

  beforeAll(async () => {
    app = await buildChatApp();
    userAId = `isolation-a-${Date.now()}`;
    userBId = `isolation-b-${Date.now()}`;
    tokenA = mintMemberToken(userAId);
    tokenB = mintMemberToken(userBId);
    await seedUser({ id: userAId, email: `${userAId}@test.example` });
    await seedUser({ id: userBId, email: `${userBId}@test.example` });
  });

  afterAll(async () => {
    await clearUserSessions(userAId);
    await clearUserSessions(userBId);
    await clearChatTables();
    await closeDatabaseConnection();
  });

  beforeEach(async () => {
    await clearUserSessions(userAId);
    await clearUserSessions(userBId);
    const sa = await seedSession(userAId, { title: "User A's Session" });
    const sb = await seedSession(userBId, { title: "User B's Session" });
    sessionA = sa.id;
    sessionB = sb.id;
  });

  describe("GET /api/chat/sessions — list isolation", () => {
    it("user A does not see user B's sessions in list", async () => {
      const res = await request(app)
        .get("/api/chat/sessions")
        .set(authHeader(tokenA));

      expect(res.status).toBe(200);
      const body = res.body as SessionListResponse;
      const ids = body.sessions.map((s: ApiSession) => s.id);
      expect(ids).toContain(sessionA);
      expect(ids).not.toContain(sessionB);
    });

    it("user B does not see user A's sessions in list", async () => {
      const res = await request(app)
        .get("/api/chat/sessions")
        .set(authHeader(tokenB));

      expect(res.status).toBe(200);
      const body = res.body as SessionListResponse;
      const ids = body.sessions.map((s: ApiSession) => s.id);
      expect(ids).toContain(sessionB);
      expect(ids).not.toContain(sessionA);
    });
  });

  describe("GET /api/chat/sessions/:id/messages — message read isolation", () => {
    it("user A cannot read messages from user B's session (404)", async () => {
      await seedMessage(sessionB, { content: "B's private message", isUser: true });

      const res = await request(app)
        .get(`/api/chat/sessions/${sessionB}/messages`)
        .set(authHeader(tokenA));

      expect([403, 404]).toContain(res.status);
    });

    it("user B cannot read messages from user A's session (404)", async () => {
      await seedMessage(sessionA, { content: "A's private message", isUser: true });

      const res = await request(app)
        .get(`/api/chat/sessions/${sessionA}/messages`)
        .set(authHeader(tokenB));

      expect([403, 404]).toContain(res.status);
    });

    it("user A can successfully read their own session's messages", async () => {
      await seedMessage(sessionA, { content: "My own message", isUser: true });

      const res = await request(app)
        .get(`/api/chat/sessions/${sessionA}/messages`)
        .set(authHeader(tokenA));

      expect(res.status).toBe(200);
      expect(res.body.messages).toHaveLength(1);
      expect(res.body.messages[0].content).toBe("My own message");
    });
  });

  describe("POST /api/chat/sessions/:id/messages — message write isolation", () => {
    it("user A cannot post to user B's session (403 or 404)", async () => {
      const res = await request(app)
        .post(`/api/chat/sessions/${sessionB}/messages`)
        .set(authHeader(tokenA))
        .send({ content: "Unauthorized message", isUser: true });

      expect([403, 404]).toContain(res.status);
    });

    it("user B cannot post to user A's session (403 or 404)", async () => {
      const res = await request(app)
        .post(`/api/chat/sessions/${sessionA}/messages`)
        .set(authHeader(tokenB))
        .send({ content: "Unauthorized message", isUser: true });

      expect([403, 404]).toContain(res.status);
    });

    it("user A can successfully post to their own session", async () => {
      const res = await request(app)
        .post(`/api/chat/sessions/${sessionA}/messages`)
        .set(authHeader(tokenA))
        .send({ content: "My own message", isUser: true });

      expect(res.status).toBe(200);
      expect(res.body.sessionId).toBe(sessionA);
    });
  });

  describe("DELETE /api/chat/sessions/:id — delete isolation", () => {
    it("user A cannot delete user B's session (403 or 404)", async () => {
      const res = await request(app)
        .delete(`/api/chat/sessions/${sessionB}`)
        .set(authHeader(tokenA));

      expect([403, 404]).toContain(res.status);
    });

    it("user B cannot delete user A's session (403 or 404)", async () => {
      const res = await request(app)
        .delete(`/api/chat/sessions/${sessionA}`)
        .set(authHeader(tokenB));

      expect([403, 404]).toContain(res.status);
    });

    it("user B's session still exists after user A's failed delete attempt", async () => {
      await request(app)
        .delete(`/api/chat/sessions/${sessionB}`)
        .set(authHeader(tokenA));

      const res = await request(app)
        .get("/api/chat/sessions")
        .set(authHeader(tokenB));

      expect(res.status).toBe(200);
      const body = res.body as SessionListResponse;
      const ids = body.sessions.map((s: ApiSession) => s.id);
      expect(ids).toContain(sessionB);
    });

    it("user A can delete their own session", async () => {
      const res = await request(app)
        .delete(`/api/chat/sessions/${sessionA}`)
        .set(authHeader(tokenA));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("PATCH /api/chat/sessions/:id/rename — rename isolation", () => {
    it("user A cannot rename user B's session (403 or 404)", async () => {
      const res = await request(app)
        .patch(`/api/chat/sessions/${sessionB}/rename`)
        .set(authHeader(tokenA))
        .send({ title: "Hijacked Title" });

      expect([403, 404]).toContain(res.status);
    });

    it("user B cannot rename user A's session (403 or 404)", async () => {
      const res = await request(app)
        .patch(`/api/chat/sessions/${sessionA}/rename`)
        .set(authHeader(tokenB))
        .send({ title: "Stolen Title" });

      expect([403, 404]).toContain(res.status);
    });

    it("user A's session title is unchanged after B's failed rename attempt", async () => {
      await request(app)
        .patch(`/api/chat/sessions/${sessionA}/rename`)
        .set(authHeader(tokenB))
        .send({ title: "Modified by B" });

      const res = await request(app)
        .get("/api/chat/sessions")
        .set(authHeader(tokenA));

      expect(res.status).toBe(200);
      const body = res.body as SessionListResponse;
      const session = body.sessions.find((s: ApiSession) => s.id === sessionA);
      expect(session?.title).not.toBe("Modified by B");
    });
  });

  describe("Unauthenticated access — all endpoints must deny", () => {
    it("GET /api/chat/sessions returns 401 without token", async () => {
      const res = await request(app).get("/api/chat/sessions");
      expect(res.status).toBe(401);
    });

    it("POST /api/chat/sessions returns 401 without token", async () => {
      const res = await request(app)
        .post("/api/chat/sessions")
        .send({ title: "No auth" });
      expect(res.status).toBe(401);
    });

    it("GET /api/chat/sessions/:id/messages returns 401 without token", async () => {
      const res = await request(app).get(
        `/api/chat/sessions/${sessionA}/messages`,
      );
      expect(res.status).toBe(401);
    });

    it("POST /api/chat/sessions/:id/messages returns 401 without token", async () => {
      const res = await request(app)
        .post(`/api/chat/sessions/${sessionA}/messages`)
        .send({ content: "No auth", isUser: true });
      expect(res.status).toBe(401);
    });

    it("DELETE /api/chat/sessions/:id returns 401 without token", async () => {
      const res = await request(app).delete(`/api/chat/sessions/${sessionA}`);
      expect(res.status).toBe(401);
    });

    it("PATCH /api/chat/sessions/:id/rename returns 401 without token", async () => {
      const res = await request(app)
        .patch(`/api/chat/sessions/${sessionA}/rename`)
        .send({ title: "No auth" });
      expect(res.status).toBe(401);
    });
  });
});
