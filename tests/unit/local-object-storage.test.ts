import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import express from "express";
import request from "supertest";

vi.mock("../../server/db", () => ({ db: {} }));
import { ObjectNotFoundError, ObjectStorageService } from "../../server/objectStorage";
import { ObjectPermission, getObjectAclPolicy } from "../../server/objectAcl";
import { localObjectPath, writeLocalObject } from "../../server/localObjectStore";

let directory: string;
let service: ObjectStorageService;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "genius-object-test-"));
  vi.stubEnv("OBJECT_STORAGE_DIR", path.join(directory, ".objects"));
  service = new ObjectStorageService();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(directory, { recursive: true, force: true });
});

describe("application-owned file storage", () => {
  it("persists original bytes and ownership across service instances", async () => {
    const bytes = Buffer.from("private engineering attachment");
    const url = await service.uploadFileBuffer(bytes, "application/pdf", "genius", "drawing.PDF", { owner: "alice", visibility: "private" });
    expect(url).toMatch(/^\/objects\/genius\/[a-f0-9-]+\.pdf$/);
    const restarted = new ObjectStorageService();
    expect(await restarted.downloadObjectBuffer(url)).toEqual(bytes);
    const objectFile = await restarted.getObjectEntityFile(url);
    expect(await restarted.canAccessObjectEntity({ objectFile, userId: "alice" })).toBe(true);
    expect(await restarted.canAccessObjectEntity({ objectFile, userId: "bob" })).toBe(false);
    expect(await restarted.canAccessObjectEntity({ objectFile })).toBe(false);
    expect(await restarted.searchPublicObject("../private/" + url.slice(9))).toBeNull();
  });

  it("serves public files without granting public write access", async () => {
    const url = await service.uploadFileBuffer(Buffer.from("image"), "image/png", "logos", "without-extension", { owner: "alice", visibility: "public" });
    const objectFile = await service.getObjectEntityFile(url);
    expect(await service.canAccessObjectEntity({ objectFile })).toBe(true);
    expect(await service.canAccessObjectEntity({ objectFile, requestedPermission: ObjectPermission.WRITE })).toBe(false);
    const app = express();
    app.get("/file", (_req, res) => { void service.downloadObject(objectFile, res); });
    const response = await request(app).get("/file").expect(200);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(response.headers["cache-control"]).toContain("public");
  });

  it("keeps private files and their metadata out of static uploads", async () => {
    const url = await service.uploadFileBuffer(Buffer.from("secret"), "text/plain", "genius", "note.txt", { owner: "alice", visibility: "private" });
    const objectFile = await service.getObjectEntityFile(url);
    const app = express();
    app.use("/uploads", express.static(directory, { dotfiles: "deny" }));
    app.get("/file", (_req, res) => { void service.downloadObject(objectFile, res); });
    await request(app).get(`/uploads/.objects/data/${objectFile.objectName}`).expect(404);
    await request(app).get(`/uploads/.objects/metadata/${objectFile.objectName}.json`).expect(404);
    const response = await request(app).get("/file").expect(200);
    expect(response.text).toBe("secret");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    await fs.rm(localObjectPath(objectFile.objectName, true));
    expect(await service.canAccessObjectEntity({ objectFile, userId: "alice" })).toBe(false);
  });

  it.each(["../outside", "a/../../outside", "/absolute", "a\\outside", "%2e%2e/outside", "a//outside"])("rejects unsafe paths: %s", async (name) => {
    expect(() => localObjectPath(name)).toThrow("Invalid object path");
    await expect(service.getObjectEntityFile(`/objects/${name}`)).rejects.toBeInstanceOf(ObjectNotFoundError);
  });

  it("does not publish an upload if its access metadata cannot be saved", async () => {
    await fs.mkdir(path.join(directory, ".objects"));
    await fs.writeFile(path.join(directory, ".objects", "metadata"), "blocked directory");
    await expect(writeLocalObject("private/genius/file.pdf", Buffer.from("secret"), "application/pdf", { owner: "alice", visibility: "private" })).rejects.toThrow();
    await expect(fs.stat(localObjectPath("private/genius/file.pdf"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses ownership changes and only normalizes URLs from this app", async () => {
    vi.stubEnv("APP_URL", "https://geniusx1.com");
    const url = await service.uploadFileBuffer(Buffer.from("secret"), "text/plain", "genius", "note.txt", { owner: "alice", visibility: "private" });
    expect(service.normalizeObjectEntityPath(`https://geniusx1.com${url}`)).toBe(url);
    expect(service.normalizeObjectEntityPath(`https://example.com${url}`)).toBe(`https://example.com${url}`);
    await expect(service.trySetObjectEntityAclPolicy(url, { owner: "bob", visibility: "public" })).rejects.toThrow("Object owner cannot be changed");
    expect((await getObjectAclPolicy(await service.getObjectEntityFile(url)))?.visibility).toBe("private");
  });
});
