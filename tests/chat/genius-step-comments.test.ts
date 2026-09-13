import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { buildChatApp } from "../helpers/app";
import { mintMemberToken, authHeader } from "../helpers/auth";
import { seedUser, closeDatabaseConnection } from "../helpers/db";

const document = {
  projectTitle: "Commented power check",
  problemStatement: "Calculate power.",
  inputs: [{ id: "force", symbol: "F", label: "Force", value: 100, unit: "N", editable: true }],
  assumptions: [],
  steps: [{ id: "power", symbol: "P", title: "Power", description: "Use the verified force.", formula: "P = 2F", expr: "F * 2", calculation: "", result: "", unit: "W", sources: [], warnings: [] }],
  results: [{ id: "result", label: "Power", symbol: "P", value: "", unit: "W", sources: [] }],
  references: [],
  confidence: { score: 80, explanation: "Verified", factors: [] },
  visualizations: [],
};

describe("Genius calculation step comments", () => {
  let app: Express;
  let token: string;
  let otherToken: string;

  beforeAll(async () => {
    app = await buildChatApp();
    const userId = `genius-comments-${Date.now()}`;
    const otherId = `${userId}-other`;
    token = mintMemberToken(userId);
    otherToken = mintMemberToken(otherId);
    await seedUser({ id: userId, email: `${userId}@test.example` });
    await seedUser({ id: otherId, email: `${otherId}@test.example` });
  });

  afterAll(closeDatabaseConnection);

  it("creates multiple comments, keeps them through recalc, and isolates them to the owner", async () => {
    const saved = await request(app).post("/api/genius").set(authHeader(token)).send({ document });
    expect(saved.status).toBe(200);

    const first = await request(app)
      .post(`/api/genius/${saved.body.id}/steps/power/comments`)
      .set(authHeader(token))
      .send({ content: "Confirm the motor duty cycle before release." });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ stepId: "power", content: "Confirm the motor duty cycle before release." });

    const second = await request(app)
      .post(`/api/genius/${saved.body.id}/steps/power/comments`)
      .set(authHeader(token))
      .send({ content: "Checked against the supplier datasheet." });
    expect(second.status).toBe(201);

    const updated = await request(app)
      .patch(`/api/genius/${saved.body.id}/steps/power/comments/${first.body.id}`)
      .set(authHeader(token))
      .send({ content: "Confirmed the motor duty cycle before release." });
    expect(updated.status).toBe(200);
    expect(updated.body.content).toBe("Confirmed the motor duty cycle before release.");

    const loaded = await request(app).get(`/api/genius/${saved.body.id}`).set(authHeader(token));
    expect(loaded.body.comments.map((comment: { content: string }) => comment.content)).toEqual([
      "Confirmed the motor duty cycle before release.",
      "Checked against the supplier datasheet.",
    ]);

    const changed = structuredClone(saved.body.document);
    changed.inputs[0].value = 150;
    const recalculated = await request(app)
      .post(`/api/genius/${saved.body.id}/recalc`)
      .set(authHeader(token))
      .send({ document: changed });
    expect(recalculated.status).toBe(200);

    const afterRecalc = await request(app).get(`/api/genius/${saved.body.id}`).set(authHeader(token));
    expect(afterRecalc.body.comments).toHaveLength(2);
    const historical = await request(app).get(`/api/genius/${saved.body.id}/versions/1`).set(authHeader(token));
    expect(historical.status).toBe(200);
    expect(historical.body.comments).toBeUndefined();

    const forbidden = await request(app)
      .post(`/api/genius/${saved.body.id}/steps/power/comments`)
      .set(authHeader(otherToken))
      .send({ content: "This must not be saved." });
    expect(forbidden.status).toBe(404);

    const removed = await request(app)
      .delete(`/api/genius/${saved.body.id}/steps/power/comments/${second.body.id}`)
      .set(authHeader(token));
    expect(removed.status).toBe(200);
    const afterDelete = await request(app).get(`/api/genius/${saved.body.id}`).set(authHeader(token));
    expect(afterDelete.body.comments).toEqual([expect.objectContaining({ id: first.body.id })]);
  });

  it("rejects blank, oversized, and unknown-step comments with clear errors", async () => {
    const saved = await request(app).post("/api/genius").set(authHeader(token)).send({ document });
    const url = `/api/genius/${saved.body.id}/steps/power/comments`;

    const blank = await request(app).post(url).set(authHeader(token)).send({ content: "   " });
    expect(blank.status).toBe(400);
    expect(blank.body.error).toBe("A comment cannot be blank.");

    const oversized = await request(app).post(url).set(authHeader(token)).send({ content: "a".repeat(2001) });
    expect(oversized.status).toBe(400);
    expect(oversized.body.error).toBe("Comments must be 2,000 characters or fewer.");

    const missingStep = await request(app)
      .post(`/api/genius/${saved.body.id}/steps/missing/comments`)
      .set(authHeader(token))
      .send({ content: "A valid note." });
    expect(missingStep.status).toBe(404);
    expect(missingStep.body.error).toBe("Calculation step not found");
  });
});