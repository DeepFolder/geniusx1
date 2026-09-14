import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ObjectAclPolicy } from "./objectAcl";

interface ObjectMetadata {
  contentType: string;
  aclPolicy: ObjectAclPolicy;
}

// The default sits inside the persistent upload volume, in a directory that
// express.static must never serve. Data and metadata use separate trees.
export function localObjectPath(objectName: string, metadata = false): string {
  const segments = objectName.split("/");
  if (!segments.every((segment) => /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(segment))) {
    throw new Error("Invalid object path");
  }
  const root = path.resolve(process.env.OBJECT_STORAGE_DIR || "uploads/.objects");
  return path.join(root, metadata ? "metadata" : "data", ...segments) + (metadata ? ".json" : "");
}

export async function hasLocalObject(objectName: string): Promise<boolean> {
  try {
    return (await fs.lstat(localObjectPath(objectName))).isFile();
  } catch (error: any) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
}

export async function readObjectMetadata(objectName: string): Promise<ObjectMetadata | null> {
  let text: string;
  try {
    text = await fs.readFile(localObjectPath(objectName, true), "utf8");
  } catch (error: any) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const metadata = JSON.parse(text) as ObjectMetadata;
  const policy = metadata?.aclPolicy;
  if (!policy || typeof policy.owner !== "string" || !policy.owner ||
      !["public", "private"].includes(policy.visibility) ||
      typeof metadata.contentType !== "string" || /[\r\n]/.test(metadata.contentType)) {
    throw new Error("Invalid object metadata");
  }
  return metadata;
}

async function writeObjectMetadata(objectName: string, metadata: ObjectMetadata): Promise<void> {
  const target = localObjectPath(objectName, true);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(metadata), { flag: "wx", mode: 0o600 });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

export async function writeLocalObject(
  objectName: string,
  buffer: Buffer,
  contentType: string,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  if (!aclPolicy.owner || !["public", "private"].includes(aclPolicy.visibility)) {
    throw new Error("An object owner and visibility are required");
  }
  const target = localObjectPath(objectName);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await fs.writeFile(target, buffer, { flag: "wx", mode: 0o600 });
  try {
    await writeObjectMetadata(objectName, {
      contentType: /^[\w.+-]+\/[\w.+-]+$/.test(contentType) ? contentType : "application/octet-stream",
      aclPolicy,
    });
  } catch (error) {
    // A failed policy write must never turn a private upload into a public file.
    await fs.rm(target, { force: true });
    throw error;
  }
}

export async function updateLocalObjectPolicy(objectName: string, aclPolicy: ObjectAclPolicy): Promise<void> {
  const metadata = await readObjectMetadata(objectName);
  if (!metadata || !(await hasLocalObject(objectName))) throw new Error("Object not found");
  if (metadata.aclPolicy.owner !== aclPolicy.owner) throw new Error("Object owner cannot be changed");
  if (!["public", "private"].includes(aclPolicy.visibility)) throw new Error("Invalid object visibility");
  await writeObjectMetadata(objectName, { ...metadata, aclPolicy });
}
