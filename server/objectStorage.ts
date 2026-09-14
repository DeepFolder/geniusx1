import { Response } from "express";
import { randomUUID } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { fileStorage } from "../shared/schema";
import {
  ObjectAclPolicy,
  ObjectPermission,
  StoredObject,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";
import { hasLocalObject, localObjectPath, readObjectMetadata, writeLocalObject } from "./localObjectStore";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// Historical database-backed files remain readable. New uploads always use the
// local store, which preserves ownership instead of falling back to public files.
export async function getFileBufferById(idOrUrl: string): Promise<Buffer | null> {
  const id = idOrUrl.startsWith('/api/files/')
    ? idOrUrl.slice('/api/files/'.length)
    : idOrUrl;
  const [record] = await db.select().from(fileStorage).where(eq(fileStorage.id, id));
  if (!record) return null;
  return Buffer.from(record.data, 'base64');
}

export async function serveDbFile(id: string, res: Response): Promise<void> {
  const [record] = await db.select().from(fileStorage).where(eq(fileStorage.id, id));
  if (!record) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  const buffer = Buffer.from(record.data, "base64");
  res.set("Content-Type", record.contentType);
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  res.set("Content-Length", String(buffer.length));
  res.send(buffer);
}

export class ObjectStorageService {
  getPublicObjectSearchPaths(): Array<string> {
    return ["public"];
  }

  getPrivateObjectDir(): string {
    return "private";
  }

  async searchPublicObject(filePath: string): Promise<StoredObject | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const objectName = `${searchPath}/${filePath}`;
      try {
        if (await hasLocalObject(objectName)) {
          const obj = { objectName };
          if ((await getObjectAclPolicy(obj))?.visibility === "public") return obj;
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  // Callers must enforce the object's ACL before streaming it.
  async downloadObject(obj: StoredObject, res: Response, cacheTtlSec: number = 3600): Promise<void> {
    try {
      const metadata = await readObjectMetadata(obj.objectName);
      if (!metadata) throw new ObjectNotFoundError();
      const filePath = localObjectPath(obj.objectName);
      const info = await fs.stat(filePath);
      res.set({
        "Content-Type": metadata.contentType,
        "Content-Length": String(info.size),
        "Cache-Control": metadata.aclPolicy.visibility === "public"
          ? `public, max-age=${cacheTtlSec}` : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      });
      const stream = createReadStream(filePath);
      res.on("close", () => stream.destroy());
      stream.on("error", () => {
        if (!res.headersSent) res.status(500).end();
        else res.destroy();
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) res.status(500).json({ error: "Error downloading file" });
    }
  }

  // Legacy callers must use their multipart endpoint. No external signed URL
  // service is involved in local storage.
  async getObjectEntityUploadURL(): Promise<string> {
    throw new Error("Direct client-side signed uploads are not supported. Use the multipart upload endpoint instead.");
  }

  async getObjectEntityFile(objectPath: string): Promise<StoredObject> {
    if (!objectPath.startsWith("/objects/")) throw new ObjectNotFoundError();
    const objectName = `${this.getPrivateObjectDir()}/${objectPath.slice("/objects/".length)}`;
    try {
      // Invalid, encoded traversal, and missing paths all behave as missing objects.
      localObjectPath(objectName);
    } catch {
      throw new ObjectNotFoundError();
    }
    if (!(await hasLocalObject(objectName))) throw new ObjectNotFoundError();
    return { objectName };
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (rawPath.startsWith("/objects/")) return rawPath;
    try {
      const url = new URL(rawPath);
      const origins = [process.env.APP_URL, process.env.FRONTEND_URL, process.env.SITE_URL]
        .filter(Boolean).map((origin) => new URL(origin!).origin);
      if (origins.includes(url.origin) && url.pathname.startsWith("/objects/")) return url.pathname;
    } catch {
      // Other existing relative paths remain unchanged.
    }
    return rawPath;
  }

  async trySetObjectEntityAclPolicy(rawPath: string, aclPolicy: ObjectAclPolicy): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/objects/")) return normalizedPath;
    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({ userId, objectFile, requestedPermission }: {
    userId?: string;
    objectFile: StoredObject;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({ userId, objectFile, requestedPermission: requestedPermission ?? ObjectPermission.READ });
  }

  async uploadFileBuffer(
    buffer: Buffer,
    contentType: string,
    folder: string,
    originalName: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    // Original names never choose a directory or executable path.
    const extension = path.extname(originalName).toLowerCase();
    const safeExtension = /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : "";
    const entityId = `${folder}/${randomUUID()}${safeExtension}`;
    const objectName = `${this.getPrivateObjectDir()}/${entityId}`;
    await writeLocalObject(objectName, buffer, contentType, aclPolicy);
    return `/objects/${entityId}`;
  }

  // Internal server callers already check the owning record before reading bytes.
  async downloadObjectBuffer(objectPath: string): Promise<Buffer> {
    const objectFile = await this.getObjectEntityFile(objectPath);
    return fs.readFile(localObjectPath(objectFile.objectName));
  }
}
