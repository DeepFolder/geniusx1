import { db } from '../../../../db';
import { agentSettings, agentInstructionHistory } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';
import { AgentSettingsData, DEFAULT_SETTINGS, DEFAULT_TOPIC_RESTRICTION_MESSAGE, DEFAULT_ALLOWED_TOPICS } from './types';

export async function getAgentSettings(): Promise<AgentSettingsData> {
  const rows = await db
    .select()
    .from(agentSettings)
    .orderBy(desc(agentSettings.updatedAt))
    .limit(1);

  if (rows.length === 0) {
    return DEFAULT_SETTINGS;
  }

  return mapRowToSettings(rows[0]);
}

export async function saveAgentSettings(settings: Partial<AgentSettingsData>): Promise<AgentSettingsData> {
  const existing = await db
    .select()
    .from(agentSettings)
    .orderBy(desc(agentSettings.updatedAt))
    .limit(1);

  const now = new Date();

  if (existing.length === 0) {
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    const [inserted] = await db
      .insert(agentSettings)
      .values({
        name: merged.name,
        instructions: merged.instructions,
        model: merged.model,
        reasoningEffort: merged.reasoningEffort,
        reasoningSummary: merged.reasoningSummary,
        storeEnabled: merged.storeEnabled,
        webSearchEnabled: merged.webSearchEnabled,
        searchContextSize: merged.searchContextSize,
        temperature: merged.temperature.toString(),
        maxTokens: merged.maxTokens,
        outputSchema: merged.outputSchema,
        guardrailsEnabled: merged.guardrailsEnabled,
        guardrailsConfig: merged.guardrailsConfig,
        topicRestrictionEnabled: merged.topicRestrictionEnabled,
        topicRestrictionMessage: merged.topicRestrictionMessage,
        allowedTopics: JSON.stringify(merged.allowedTopics),
        systemInstructionPct: merged.systemInstructionPct,
        fluidMemoryPct: merged.fluidMemoryPct,
        conversationPct: merged.conversationPct,
        compactionThresholdPct: merged.compactionThresholdPct,
        compactionModel: merged.compactionModel,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return mapRowToSettings(inserted);
  }

  if (settings.instructions && existing[0].instructions && settings.instructions !== existing[0].instructions) {
    await saveInstructionToHistory(existing[0].instructions);
  }

  const [updated] = await db
    .update(agentSettings)
    .set({
      name: settings.name,
      instructions: settings.instructions,
      model: settings.model,
      reasoningEffort: settings.reasoningEffort,
      reasoningSummary: settings.reasoningSummary,
      storeEnabled: settings.storeEnabled,
      webSearchEnabled: settings.webSearchEnabled,
      searchContextSize: settings.searchContextSize,
      temperature: settings.temperature?.toString(),
      maxTokens: settings.maxTokens,
      outputSchema: settings.outputSchema,
      guardrailsEnabled: settings.guardrailsEnabled,
      guardrailsConfig: settings.guardrailsConfig,
      topicRestrictionEnabled: settings.topicRestrictionEnabled,
      topicRestrictionMessage: settings.topicRestrictionMessage,
      allowedTopics: settings.allowedTopics ? JSON.stringify(settings.allowedTopics) : undefined,
      systemInstructionPct: settings.systemInstructionPct,
      fluidMemoryPct: settings.fluidMemoryPct,
      conversationPct: settings.conversationPct,
      compactionThresholdPct: settings.compactionThresholdPct,
      compactionModel: settings.compactionModel,
      updatedAt: now,
    })
    .where(eq(agentSettings.id, existing[0].id))
    .returning();

  return mapRowToSettings(updated);
}

function mapRowToSettings(row: any): AgentSettingsData {
  let allowedTopics: string[];
  try {
    allowedTopics = row.allowedTopics ? JSON.parse(row.allowedTopics) : DEFAULT_ALLOWED_TOPICS;
  } catch {
    allowedTopics = DEFAULT_ALLOWED_TOPICS;
  }
  return {
    id: row.id,
    name: row.name ?? DEFAULT_SETTINGS.name,
    instructions: row.instructions ?? DEFAULT_SETTINGS.instructions,
    model: row.model ?? DEFAULT_SETTINGS.model,
    reasoningEffort: (row.reasoningEffort as 'none' | 'low' | 'medium' | 'high') ?? 'low',
    reasoningSummary: (row.reasoningSummary as 'auto' | 'concise' | 'detailed' | 'none') ?? 'auto',
    storeEnabled: row.storeEnabled ?? true,
    webSearchEnabled: row.webSearchEnabled ?? true,
    searchContextSize: (row.searchContextSize as 'low' | 'medium' | 'high') ?? 'high',
    temperature: parseFloat(row.temperature || '0.7'),
    maxTokens: row.maxTokens || 4096,
    outputSchema: row.outputSchema || DEFAULT_SETTINGS.outputSchema,
    guardrailsEnabled: row.guardrailsEnabled ?? true,
    guardrailsConfig: row.guardrailsConfig || DEFAULT_SETTINGS.guardrailsConfig,
    topicRestrictionEnabled: row.topicRestrictionEnabled ?? true,
    topicRestrictionMessage: row.topicRestrictionMessage || DEFAULT_TOPIC_RESTRICTION_MESSAGE,
    allowedTopics,
    systemInstructionPct: row.systemInstructionPct ?? DEFAULT_SETTINGS.systemInstructionPct,
    fluidMemoryPct: row.fluidMemoryPct ?? DEFAULT_SETTINGS.fluidMemoryPct,
    conversationPct: row.conversationPct ?? DEFAULT_SETTINGS.conversationPct,
    compactionThresholdPct: row.compactionThresholdPct ?? DEFAULT_SETTINGS.compactionThresholdPct,
    compactionModel: row.compactionModel ?? DEFAULT_SETTINGS.compactionModel,
    createdAt: row.createdAt ?? undefined,
    updatedAt: row.updatedAt ?? undefined,
  };
}

export async function resetAgentSettings(): Promise<AgentSettingsData> {
  await db.delete(agentSettings);
  return DEFAULT_SETTINGS;
}

// One-time migration: if the DB still holds the old DeepFolder/DeepSearch
// instructions, overwrite them with the Genius X1 defaults so the live agent
// identity is correct without requiring a manual admin save.
export async function migrateStaleInstructions(): Promise<void> {
  try {
    const rows = await db.select().from(agentSettings).limit(1);
    if (rows.length === 0) return; // no row yet — DEFAULT_SETTINGS will be used on first load
    const row = rows[0];
    const stale =
      row.instructions?.includes('You are DeepSearch') ||
      row.instructions?.includes('You are DeepFolder') ||
      row.name === 'deepfolder';
    if (!stale) return;

    // Archive old instructions to history before overwriting
    if (row.instructions) await saveInstructionToHistory(row.instructions);

    await db
      .update(agentSettings)
      .set({
        name: DEFAULT_SETTINGS.name,
        instructions: DEFAULT_SETTINGS.instructions,
        topicRestrictionMessage: DEFAULT_SETTINGS.topicRestrictionMessage,
        allowedTopics: JSON.stringify(DEFAULT_SETTINGS.allowedTopics),
        updatedAt: new Date(),
      })
      .where(eq(agentSettings.id, row.id));

    console.log('[Genius X1] Migrated agent settings from DeepFolder defaults.');
  } catch (err: any) {
    console.warn('[Genius X1] migrateStaleInstructions failed (non-fatal):', err?.message);
  }
}

function generateInstructionLabel(instructions: string): string {
  const firstLine = instructions.split('\n')[0].trim().replace(/^#+\s*/, '');
  const preview = firstLine.length > 60 ? firstLine.substring(0, 57) + '...' : firstLine;
  return preview || 'Untitled instruction';
}

export async function saveInstructionToHistory(instructions: string): Promise<void> {
  const label = generateInstructionLabel(instructions);
  await db.insert(agentInstructionHistory).values({
    instructions,
    label,
    savedAt: new Date(),
  });
}

export async function getInstructionHistory() {
  return db
    .select()
    .from(agentInstructionHistory)
    .orderBy(desc(agentInstructionHistory.savedAt));
}

export async function getInstructionById(id: number) {
  const rows = await db
    .select()
    .from(agentInstructionHistory)
    .where(eq(agentInstructionHistory.id, id))
    .limit(1);
  return rows[0] || null;
}

export async function deleteInstructionHistoryEntry(id: number) {
  await db.delete(agentInstructionHistory).where(eq(agentInstructionHistory.id, id));
}

