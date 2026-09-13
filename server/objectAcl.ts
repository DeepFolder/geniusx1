import { Client } from "@replit/object-storage";

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

export enum ObjectAccessGroupType {}

export interface ObjectAccessGroup {
  type: ObjectAccessGroupType;
  id: string;
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
  aclRules?: Array<ObjectAclRule>;
}

/**
 * A lightweight handle for a stored object — replaces the old GCS `File` type.
 * `objectName` is the path within the bucket (no leading slash, no bucket prefix).
 */
export interface StoredObject {
  objectName: string;
}

function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission,
): boolean {
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }
  return granted === ObjectPermission.WRITE;
}

abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(
    public readonly type: ObjectAccessGroupType,
    public readonly id: string,
  ) {}

  public abstract hasMember(userId: string): Promise<boolean>;
}

function createObjectAccessGroup(
  group: ObjectAccessGroup,
): BaseObjectAccessGroup {
  switch (group.type) {
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

// ─── Sidecar helpers using @replit/object-storage ────────────────────────────

function resolveBucketId(): string {
  if (process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID) {
    return process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  }
  const privateDir =
    process.env.PRIVATE_OBJECT_DIR ||
    "/replit-objstore-eace74f0-4d02-472e-9b67-7245c806d91b/.private";
  const parts = privateDir.split("/").filter(Boolean);
  if (parts.length > 0) return parts[0];
  return "replit-objstore-eace74f0-4d02-472e-9b67-7245c806d91b";
}

function replitClient(): Client {
  return new Client({ bucketId: resolveBucketId() });
}

async function writeSidecar(
  objectName: string,
  policy: ObjectAclPolicy,
): Promise<void> {
  try {
    const client = replitClient();
    const sidecarName = `${objectName}.acl.json`;
    const result = await client.uploadFromText(sidecarName, JSON.stringify(policy));
    if (!result.ok) {
      console.warn(`[ACL] writeSidecar error for ${objectName}:`, result.error?.message);
    }
  } catch (err) {
    console.warn("[ACL] writeSidecar error:", (err as Error)?.message);
  }
}

async function readSidecar(
  objectName: string,
): Promise<ObjectAclPolicy | null> {
  try {
    const client = replitClient();
    const sidecarName = `${objectName}.acl.json`;
    const result = await client.downloadAsText(sidecarName);
    if (!result.ok) return null;
    return JSON.parse(result.value) as ObjectAclPolicy;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Sets the ACL policy for an object by writing a JSON sidecar via the Replit SDK.
 */
export async function setObjectAclPolicy(
  obj: StoredObject,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  await writeSidecar(obj.objectName, aclPolicy);
}

/**
 * Gets the ACL policy for an object by reading its JSON sidecar via the Replit SDK.
 */
export async function getObjectAclPolicy(
  obj: StoredObject,
): Promise<ObjectAclPolicy | null> {
  return readSidecar(obj.objectName);
}

/**
 * Checks if the user can access the object.
 */
export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: StoredObject;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) {
    return false;
  }

  if (
    aclPolicy.visibility === "public" &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  if (!userId) {
    return false;
  }

  if (aclPolicy.owner === userId) {
    return true;
  }

  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}
