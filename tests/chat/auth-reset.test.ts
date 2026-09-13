import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { createHash, randomBytes } from "crypto";
import { nanoid } from "nanoid";

vi.mock("express-rate-limit", () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));
import { buildChatApp } from "../helpers/app";
import {
  seedUser,
  clearChatTables,
  closeDatabaseConnection,
} from "../helpers/db";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../../shared/schema";
import { eq } from "drizzle-orm";

const { Pool } = pg;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function getTestDb() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL!, max: 2 });
  const db = drizzle({ client: pool, schema });
  return { pool, db };
}

async function seedResetToken(
  userId: string,
  token: string,
  expiresAt: Date,
): Promise<string> {
  const { pool, db } = await getTestDb();
  const id = nanoid();
  await db.insert(schema.passwordResetTokens).values({
    id,
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  await pool.end();
  return id;
}

async function deleteResetToken(id: string): Promise<void> {
  const { pool, db } = await getTestDb();
  await db
    .delete(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.id, id));
  await pool.end();
}

describe("POST /api/auth/reset-password — password strength enforcement", () => {
  let app: Express;
  let userId: string;
  let tokenId: string;

  beforeAll(async () => {
    app = await buildChatApp();
    userId = `reset-test-${Date.now()}`;
    await seedUser({ id: userId, email: `${userId}@test.example` });
  });

  afterAll(async () => {
    if (tokenId) await deleteResetToken(tokenId).catch(() => {});
    await clearChatTables();
    await closeDatabaseConnection();
  });

  it("returns 400 and error message when password is shorter than 8 characters", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "any-token-value", newPassword: "short1!" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 8 characters/i);
  });

  it("returns 400 when password is exactly 7 characters", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "any-token-value", newPassword: "1234567" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least 8 characters/i);
  });

  it("returns 200 when password is exactly 8 characters and token is valid", async () => {
    const rawToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    tokenId = await seedResetToken(userId, rawToken, expiresAt);

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: rawToken, newPassword: "Passw0rd" });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/password updated/i);
  });

  it("returns 400 when token is missing", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ newPassword: "ValidPass1!" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when newPassword is missing", async () => {
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: "some-token" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when token is valid format but not found in DB", async () => {
    const unknownToken = randomBytes(32).toString("hex");

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: unknownToken, newPassword: "ValidPass1!" });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid or has expired/i);
  });

  it("returns 400 when the same token is reused after a successful reset", async () => {
    const rawToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const reusedTokenId = await seedResetToken(userId, rawToken, expiresAt);

    await request(app)
      .post("/api/auth/reset-password")
      .send({ token: rawToken, newPassword: "FirstPass1!" });

    const secondRes = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: rawToken, newPassword: "SecondPass1!" });

    expect(secondRes.status).toBe(400);
    expect(secondRes.body.error).toMatch(/invalid or has expired/i);

    await deleteResetToken(reusedTokenId).catch(() => {});
  });
});
