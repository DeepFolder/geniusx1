import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { buildChatApp } from "../helpers/app";
import { mintMemberToken, authHeader } from "../helpers/auth";
import { seedUser, closeDatabaseConnection } from "../helpers/db";

const document = {
  projectTitle: "Details persistence check",
  problemStatement: "Calculate power.",
  inputs: [{ id: "force", symbol: "F", label: "Force", value: 100, unit: "N", editable: true }],
  assumptions: [],
  steps: [{ id: "power", symbol: "P", title: "Power", description: "", formula: "P = 2F", expr: "F * 2", calculation: "", result: "", unit: "W", sources: [], warnings: [] }],
  results: [{ id: "result", label: "Power", symbol: "P", value: "", unit: "W", sources: [] }],
  references: [],
  confidence: { score: 80, explanation: "Verified", factors: [] },
  visualizations: [],
};

describe("Genius calculation details", () => {
  let app: Express;
  let token: string;
  let otherToken: string;

  beforeAll(async () => {
    app = await buildChatApp();
    const userId = `genius-details-${Date.now()}`;
    token = mintMemberToken(userId);
    otherToken = mintMemberToken(`${userId}-other`);
    await seedUser({ id: userId, email: `${userId}@test.example` });
    await seedUser({ id: `${userId}-other`, email: `${userId}-other@test.example` });
  });

  afterAll(closeDatabaseConnection);

  it("saves validated owner details without changing calculation values or versions", async () => {
    const saved = await request(app).post("/api/genius").set(authHeader(token)).send({ document });
    expect(saved.status).toBe(200);

    const details = { authorName: "A. Engineer", projectNameNumber: "North bridge / NB-42", notes: "Check the site dimensions before construction." };
    const updated = await request(app).patch(`/api/genius/${saved.body.id}/details`).set(authHeader(token)).send(details);
    expect(updated.status).toBe(200);
    expect(updated.body.document.details).toEqual(details);
    expect(updated.body.document.inputs).toEqual(saved.body.document.inputs);
    expect(updated.body.document.results).toEqual(saved.body.document.results);

    const reopened = await request(app).get(`/api/genius/${saved.body.id}`).set(authHeader(token));
    expect(reopened.body.document.details).toEqual(details);
    expect(reopened.body.document.steps).toEqual(saved.body.document.steps);

    const versions = await request(app).get(`/api/genius/${saved.body.id}/versions`).set(authHeader(token));
    expect(versions.body).toHaveLength(1);

    const recalculated = await request(app).post(`/api/genius/${saved.body.id}/recalc`).set(authHeader(token))
      .send({ document: { ...updated.body.document, inputs: [{ ...updated.body.document.inputs[0], value: 150 }] } });
    expect(recalculated.status).toBe(200);
    expect(recalculated.body.document.details).toEqual(details);

    const cleared = { authorName: "", projectNameNumber: "", notes: "" };
    const clearedUpdate = await request(app).patch(`/api/genius/${saved.body.id}/details`).set(authHeader(token)).send(cleared);
    expect(clearedUpdate.status).toBe(200);
    expect(clearedUpdate.body.document.details).toEqual(cleared);
    const reopenedCleared = await request(app).get(`/api/genius/${saved.body.id}`).set(authHeader(token));
    expect(reopenedCleared.body.document.details).toEqual(cleared);

    const forbidden = await request(app).patch(`/api/genius/${saved.body.id}/details`).set(authHeader(otherToken)).send(details);
    expect(forbidden.status).toBe(404);

    const invalid = await request(app).patch(`/api/genius/${saved.body.id}/details`).set(authHeader(token))
      .send({ ...details, notes: "x".repeat(5001) });
    expect(invalid.status).toBe(400);
  });
});