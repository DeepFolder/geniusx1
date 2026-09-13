import { eq } from "drizzle-orm";
import * as schema from "../../shared/schema";
import type {
  InsertAiChatSession,
  InsertAiChatSessionMessage,
  InsertAgentSettings,
} from "../../shared/schema";

let _pool: import("pg").Pool | null = null;
let _db: ReturnType<typeof import("drizzle-orm/node-postgres").drizzle> | null = null;

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL must be set for tests. Tests never connect to NEON_DATABASE_URL.",
    );
  }

  // Defensive guard: fail fast if DATABASE_URL points to Neon (production).
  // This prevents accidentally seeding or deleting rows on the production database.
  const neonUrl = process.env.NEON_DATABASE_URL;
  if (neonUrl && url === neonUrl) {
    throw new Error(
      "DATABASE_URL must not equal NEON_DATABASE_URL in tests. " +
        "Set DATABASE_URL to the local heliumdb to avoid touching production.",
    );
  }
  if (url.includes("neon.tech") || url.includes("neondb.net")) {
    throw new Error(
      "DATABASE_URL appears to point to a Neon (production) host. " +
        "Tests must run against the local heliumdb only.",
    );
  }

  return url;
}

async function getDb() {
  if (_db) return _db;

  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");

  _pool = new Pool({
    connectionString: requireDatabaseUrl(),
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
  });

  _db = drizzle({ client: _pool, schema });
  return _db;
}

export function getDbHelperFunctions() {
  return {
    seedUser,
    seedSession,
    seedMessage,
    seedAgentSettings,
    clearChatTables,
    closeDatabaseConnection,
  };
}

const seededUserIds: string[] = [];
const seededSessionIds: number[] = [];
const seededMessageIds: number[] = [];
const seededAgentSettingIds: number[] = [];

export async function seedUser(
  overrides: Partial<typeof schema.users.$inferInsert> & { id: string; email: string } = {
    id: "test-user-001",
    email: "test-user-001@test.example",
  },
): Promise<typeof schema.users.$inferSelect> {
  const db = await getDb();
  const [user] = await db
    .insert(schema.users)
    .values({
      id: overrides.id,
      email: overrides.email,
      role: "public",
      isActive: true,
      ...overrides,
    })
    .onConflictDoNothing()
    .returning();

  if (user) {
    seededUserIds.push(user.id);
  }

  // If the user already existed (conflict), fetch it
  if (!user) {
    const [existing] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, overrides.id))
      .limit(1);
    return existing;
  }

  return user;
}

export async function seedSession(
  userId: string,
  overrides: Partial<InsertAiChatSession> = {},
): Promise<typeof schema.aiChatSessions.$inferSelect> {
  const db = await getDb();
  const [session] = await db
    .insert(schema.aiChatSessions)
    .values({
      userId,
      title: "Test Chat Session",
      isPinned: false,
      ...overrides,
    })
    .returning();

  seededSessionIds.push(session.id);
  return session;
}

export async function seedMessage(
  sessionId: number,
  opts: Partial<InsertAiChatSessionMessage> & {
    content?: string;
    isUser?: boolean;
  } = {},
): Promise<typeof schema.aiChatSessionMessages.$inferSelect> {
  const db = await getDb();
  const [message] = await db
    .insert(schema.aiChatSessionMessages)
    .values({
      sessionId,
      content: opts.content ?? "Test message content",
      isUser: opts.isUser ?? true,
      status: "complete",
      ...opts,
    })
    .returning();

  seededMessageIds.push(message.id);
  return message;
}

export async function seedAgentSettings(
  overrides: Partial<InsertAgentSettings> = {},
): Promise<typeof schema.agentSettings.$inferSelect> {
  const db = await getDb();
  const [settings] = await db
    .insert(schema.agentSettings)
    .values({
      name: "Test Agent Settings",
      model: "gpt-4o",
      webSearchEnabled: false,
      storeEnabled: false,
      ...overrides,
    })
    .returning();

  seededAgentSettingIds.push(settings.id);
  return settings;
}

export async function clearChatTables(): Promise<void> {
  const db = await getDb();

  if (seededMessageIds.length > 0) {
    for (const id of seededMessageIds) {
      await db
        .delete(schema.aiChatSessionMessages)
        .where(eq(schema.aiChatSessionMessages.id, id));
    }
    seededMessageIds.length = 0;
  }

  if (seededSessionIds.length > 0) {
    for (const id of seededSessionIds) {
      await db
        .delete(schema.aiChatSessions)
        .where(eq(schema.aiChatSessions.id, id));
    }
    seededSessionIds.length = 0;
  }

  if (seededAgentSettingIds.length > 0) {
    for (const id of seededAgentSettingIds) {
      await db
        .delete(schema.agentSettings)
        .where(eq(schema.agentSettings.id, id));
    }
    seededAgentSettingIds.length = 0;
  }

  if (seededUserIds.length > 0) {
    for (const id of seededUserIds) {
      await db
        .delete(schema.users)
        .where(eq(schema.users.id, id));
    }
    seededUserIds.length = 0;
  }
}

/**
 * Deletes all messages and sessions owned by a specific userId without
 * touching the user row itself. Useful in integration tests where the test
 * app creates sessions via the API (untracked in seededSessionIds) and a
 * subsequent clearChatTables would fail the FK constraint when deleting the user.
 */
export async function clearUserSessions(userId: string): Promise<void> {
  const db = await getDb();
  const { aiChatSessions, aiChatSessionMessages } = schema;
  const { eq, inArray } = await import("drizzle-orm");

  const sessions = await db
    .select({ id: aiChatSessions.id })
    .from(aiChatSessions)
    .where(eq(aiChatSessions.userId, userId));

  if (sessions.length > 0) {
    const sessionIds = sessions.map((s) => s.id);
    await db
      .delete(aiChatSessionMessages)
      .where(inArray(aiChatSessionMessages.sessionId, sessionIds));
    await db
      .delete(aiChatSessions)
      .where(eq(aiChatSessions.userId, userId));
  }
}

export async function closeDatabaseConnection(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
