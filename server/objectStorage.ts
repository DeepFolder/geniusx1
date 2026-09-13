import { Client } from "@replit/object-storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import path from "path";
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

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

/**
 * Serializes a Replit object-storage SDK error into a readable string that
 * includes the error name, message, and any code/status fields.
 */
function serializeSdkError(err: unknown): string {
  if (!err) return "unknown error";
  if (typeof err === "string") return err;
  const e = err as Record<string, unknown>;
  const parts: string[] = [];
  if (e.name && e.name !== "Error") parts.push(`name=${e.name}`);
  if (e.message) parts.push(`message=${e.message}`);
  if (e.code !== undefined) parts.push(`code=${e.code}`);
  if (e.statusCode !== undefined) parts.push(`statusCode=${e.statusCode}`);
  if (e.status !== undefined) parts.push(`status=${e.status}`);
  return parts.length > 0 ? parts.join(", ") : String(err);
}

/**
 * Resolves the object-storage bucket ID by trying, in order:
 *   1. DEFAULT_OBJECT_STORAGE_BUCKET_ID env var (set by Replit object-storage integration)
 *   2. First path segment of PRIVATE_OBJECT_DIR (e.g. /replit-objstore-xxx/.private → replit-objstore-xxx)
 *   3. Hard-coded dev-bucket fallback (same bucket used in the env var defaults below)
 *
 * Passing bucketId explicitly to new Client() is required in deployed environments
 * where the SDK cannot auto-detect the bucket and silently returns "Error code undefined".
 */
function resolveBucketId(): string {
  if (process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) {
    return process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  }
  // Derive from PRIVATE_OBJECT_DIR: first non-empty segment after the leading slash
  const privateDir =
    process.env.PRIVATE_OBJECT_DIR ||
    "/replit-objstore-eace74f0-4d02-472e-9b67-7245c806d91b/.private";
  const parts = privateDir.split("/").filter(Boolean);
  if (parts.length > 0) {
    return parts[0];
  }
  return "replit-objstore-eace74f0-4d02-472e-9b67-7245c806d91b";
}

function replitClient(): Client {
  return new Client({ bucketId: resolveBucketId() });
}

/**
 * Database fallback for file uploads. Used when the Replit object-storage
 * sidecar cannot issue GCS tokens in the deployed environment.
 *
 * Files are stored as base64 text in the `file_storage` table and served via
 * GET /api/files/:id. The returned path is compatible with the existing URL
 * convention used by logo_path / image_path columns.
 */
async function storeInDatabase(buffer: Buffer, contentType: string): Promise<string> {
  const id = randomUUID();
  const data = buffer.toString("base64");
  await db.insert(fileStorage).values({ id, contentType, data });
  console.info(`[ObjectStorage] DB fallback stored file id=${id} size=${buffer.length}B type=${contentType}`);
  return `/api/files/${id}`;
}

/**
 * Fetches a file from the database fallback store and returns its raw Buffer.
 * Accepts either a full `/api/files/:id` URL string or a bare UUID string.
 * Returns null when the record is not found (non-throwing).
 */
export async function getFileBufferById(idOrUrl: string): Promise<Buffer | null> {
  const id = idOrUrl.startsWith('/api/files/')
    ? idOrUrl.slice('/api/files/'.length)
    : idOrUrl;
  const [record] = await db.select().from(fileStorage).where(eq(fileStorage.id, id));
  if (!record) return null;
  return Buffer.from(record.data, 'base64');
}

/**
 * Reads a file from the database fallback store and streams it to the response.
 * Called from the GET /api/files/:id route registered in routes.ts.
 */
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

/**
 * Derives a MIME content-type from a file extension.
 * Falls back to `application/octet-stream` for unknown types.
 */
function contentTypeFromName(objectName: string): string {
  const ext = path.extname(objectName).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".stl": "model/stl",
    ".step": "application/step",
    ".stp": "application/step",
    ".obj": "model/obj",
    ".fbx": "application/octet-stream",
    ".json": "application/json",
  };
  return map[ext] ?? "application/octet-stream";
}

/**
 * Strips the leading bucket-name segment from a full object path and returns
 * just the object name within the bucket.
 *
 * Full path format: `/<bucket_name>/<object_name>`
 * Returns: `<object_name>`
 */
function toObjectName(fullPath: string): string {
  if (!fullPath.startsWith("/")) {
    fullPath = `/${fullPath}`;
  }
  const parts = fullPath.split("/");
  // parts[0] = "", parts[1] = bucketName, parts[2..] = objectName
  if (parts.length < 3) {
    throw new Error(`Invalid object path: ${fullPath}`);
  }
  return parts.slice(2).join("/");
}

// The object storage service is used to interact with the object storage service.
export class ObjectStorageService {
  constructor() {}

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr =
      process.env.PUBLIC_OBJECT_SEARCH_PATHS ||
      "/replit-objstore-eace74f0-4d02-472e-9b67-7245c806d91b/public";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((p) => p.trim())
          .filter((p) => p.length > 0),
      ),
    );
    return paths;
  }

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    const dir =
      process.env.PRIVATE_OBJECT_DIR ||
      "/replit-objstore-eace74f0-4d02-472e-9b67-7245c806d91b/.private";
    return dir;
  }

  // Search for a public object from the search paths.
  async searchPublicObject(filePath: string): Promise<StoredObject | null> {
    const client = replitClient();
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const objectName = toObjectName(fullPath);
      const result = await client.exists(objectName);
      if (result.ok && result.value) {
        return { objectName };
      }
    }
    return null;
  }

  // Downloads an object to the response.
  async downloadObject(
    obj: StoredObject,
    res: Response,
    cacheTtlSec: number = 3600,
  ): Promise<void> {
    try {
      const client = replitClient();
      const aclPolicy = await getObjectAclPolicy(obj);
      const isPublic = aclPolicy?.visibility === "public";
      const contentType = contentTypeFromName(obj.objectName);

      res.set({
        "Content-Type": contentType,
        "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
      });

      const stream = client.downloadAsStream(obj.objectName);

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  /**
   * Returns a server-relative upload path for a new private entity.
   * Direct PUT-based signed uploads are not supported with the Replit SDK —
   * use `uploadFileBuffer` for server-side buffer uploads instead.
   * This method is kept for backward compatibility with routes that still call it;
   * callers should migrate to multipart POST → `uploadFileBuffer`.
   */
  async getObjectEntityUploadURL(): Promise<string> {
    throw new Error(
      "Direct client-side signed uploads are not supported. Use the multipart upload endpoint instead.",
    );
  }

  // Gets the object entity file from the object path.
  async getObjectEntityFile(objectPath: string): Promise<StoredObject> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const objectName = toObjectName(objectEntityPath);

    const client = replitClient();
    const result = await client.exists(objectName);
    if (!result.ok || !result.value) {
      throw new ObjectNotFoundError();
    }

    return { objectName };
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    // pathname starts with /<bucketName>/<objectName>
    // strip leading slash and bucket name prefix to get a comparable path
    const strippedPathname = rawObjectPath.startsWith("/")
      ? rawObjectPath.slice(1)
      : rawObjectPath;

    const entityDirObjectName = toObjectName(objectEntityDir.endsWith("/")
      ? objectEntityDir.slice(0, -1)
      : objectEntityDir);
    const entityDirPrefix = entityDirObjectName + "/";

    if (!strippedPathname.includes(entityDirObjectName)) {
      return rawObjectPath;
    }

    const idx = strippedPathname.indexOf(entityDirObjectName);
    const entityId = strippedPathname.slice(idx + entityDirObjectName.length + 1);
    return `/objects/${entityId}`;
  }

  // Tries to set the ACL policy for the object entity and return the normalized path.
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    try {
      const objectFile = await this.getObjectEntityFile(normalizedPath);
      await setObjectAclPolicy(objectFile, aclPolicy);
    } catch {
      // Object not found or ACL write failed — return the normalized path anyway
    }
    return normalizedPath;
  }

  // Checks if the user can access the object entity.
  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: StoredObject;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }

  /**
   * Uploads a file buffer directly to object storage and returns the
   * `/objects/<folder>/<uuid>` path that can be stored in the database.
   *
   * @param buffer       Raw file bytes (from multer memoryStorage)
   * @param contentType  MIME type (e.g. "image/jpeg", "application/pdf")
   * @param folder       Sub-folder inside private storage (e.g. "products", "catalogs", "models")
   * @param originalName Original filename – used only for the extension
   * @param aclPolicy    ACL to apply after upload (images → public, everything else → private)
   */
  async uploadFileBuffer(
    buffer: Buffer,
    contentType: string,
    folder: string,
    originalName: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const ext = originalName.includes(".")
      ? originalName.slice(originalName.lastIndexOf("."))
      : "";
    const uniqueId = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const entityId = `${folder}/${uniqueId}`;

    let privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir.endsWith("/")) {
      privateObjectDir = `${privateObjectDir}/`;
    }
    const fullPath = `${privateObjectDir}${entityId}`;
    const objectName = toObjectName(fullPath);

    const client = replitClient();
    const uploadResult = await client.uploadFromBytes(objectName, buffer);
    if (!uploadResult.ok) {
      const errDetail = serializeSdkError(uploadResult.error);
      console.warn(`[ObjectStorage] SDK upload failed (${errDetail}), falling back to database storage...`);
      try {
        const dbPath = await storeInDatabase(buffer, contentType);
        // Store the ACL policy for the object (best-effort; DB files are always accessible).
        await setObjectAclPolicy({ objectName }, aclPolicy).catch(() => {});
        return dbPath;
      } catch (dbErr) {
        console.error("[ObjectStorage] DB fallback also failed:", dbErr);
        throw new Error(
          `Object storage upload failed: ${errDetail}. DB fallback: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
        );
      }
    }

    // Store the ACL sidecar next to the main object.
    const obj: StoredObject = { objectName };
    await setObjectAclPolicy(obj, aclPolicy);

    return `/objects/${entityId}`;
  }

  /**
   * Downloads the content of an object-storage file into a Buffer.
   * Useful for spec-extraction which needs the raw PDF bytes.
   */
  async downloadObjectBuffer(objectPath: string): Promise<Buffer> {
    const objectFile = await this.getObjectEntityFile(objectPath);
    const client = replitClient();
    const result = await client.downloadAsBytes(objectFile.objectName);
    if (!result.ok) {
      const errDetail = serializeSdkError(result.error);
      console.error("[ObjectStorage] downloadAsBytes failed:", result.error);
      throw new Error(`Object storage download failed: ${errDetail}`);
    }
    return result.value[0];
  }
}
