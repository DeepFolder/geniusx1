import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { buildChatApp } from "../helpers/app";
import { mintMemberToken, authHeader } from "../helpers/auth";
import { seedUser, closeDatabaseConnection } from "../helpers/db";
import { db } from "../../server/db";
import { geniusCalculations } from "../../shared/schema";

const document = {
  projectTitle: "Versioned power check",
  problemStatement: "Calculate power.",
  inputs: [{ id: "force", symbol: "F", label: "Force", value: 100, unit: "N", editable: true }],
  assumptions: [],
  steps: [{ id: "power", symbol: "P", title: "Power", description: "", formula: "P = 2F", expr: "F * 2", calculation: "", result: "", unit: "W", sources: [], warnings: [] }],
  results: [{ id: "result", label: "Power", symbol: "P", value: "", unit: "W", sources: [] }],
  references: [],
  confidence: { score: 80, explanation: "Verified", factors: [] },
  visualizations: [],
};

describe("Genius calculation version history", () => {
  let app: Express;
  let token: string;
  let otherToken: string;
  let userId: string;

  beforeAll(async () => {
    app = await buildChatApp();
    userId = `genius-version-${Date.now()}`;
    const otherId = `${userId}-other`;
    token = mintMemberToken(userId);
    otherToken = mintMemberToken(otherId);
    await seedUser({ id: userId, email: `${userId}@test.example` });
    await seedUser({ id: otherId, email: `${otherId}@test.example` });
  });

  afterAll(closeDatabaseConnection);

  it("creates immutable ordered snapshots and only exposes them to their owner", async () => {
    const saved = await request(app).post("/api/genius").set(authHeader(token)).send({ document });
    expect(saved.status).toBe(200);

    const firstHistory = await request(app).get(`/api/genius/${saved.body.id}/versions`).set(authHeader(token));
    expect(firstHistory.status).toBe(200);
    expect(firstHistory.body).toHaveLength(1);
    expect(firstHistory.body[0]).toMatchObject({ version: 1, summary: "Initial calculation" });

    const changed = structuredClone(saved.body.document);
    changed.inputs[0].value = 150;
    const recalculated = await request(app).post(`/api/genius/${saved.body.id}/recalc`).set(authHeader(token))
      .send({ document: changed });
    expect(recalculated.status).toBe(200);

    const history = await request(app).get(`/api/genius/${saved.body.id}/versions`).set(authHeader(token));
    expect(history.body.map((item: { version: number }) => item.version)).toEqual([2, 1]);
    expect(history.body[0].summary).toBe("Changed Force");

    const oldVersion = await request(app).get(`/api/genius/${saved.body.id}/versions/1`).set(authHeader(token));
    expect(oldVersion.status).toBe(200);
    expect(oldVersion.body.document.inputs[0].value).toBe(100);
    expect(recalculated.body.document.inputs[0].value).toBe(150);

    const forbiddenList = await request(app).get(`/api/genius/${saved.body.id}/versions`).set(authHeader(otherToken));
    const forbiddenSnapshot = await request(app).get(`/api/genius/${saved.body.id}/versions/1`).set(authHeader(otherToken));
    expect(forbiddenList.status).toBe(404);
    expect(forbiddenSnapshot.status).toBe(404);
  });

  it("seeds one real snapshot for a legacy calculation without exposing timestamp markers", async () => {
    const [legacy] = await db.insert(geniusCalculations).values({
      userId,
      title: "Legacy calculation",
      document: { ...document, versions: [{ version: 42, date: "2020-01-01T00:00:00.000Z" }] },
    }).returning();

    const history = await request(app).get(`/api/genius/${legacy.id}/versions`).set(authHeader(token));
    expect(history.status).toBe(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({ version: 1, summary: "Initial calculation" });
  });
});