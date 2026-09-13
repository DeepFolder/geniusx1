import { OpenAI } from 'openai';
import { eq, and, gt, asc } from 'drizzle-orm';
import { db } from '../../../db';
import { aiChatSessions, aiChatSessionMessages } from '@shared/schema';
import type { AgentSettingsData } from './admin/types';
import type { ChatHistoryMessage } from './agent-search';
import { calculateBudgets, estimateTokens } from './context-budget';

const MAX_SUMMARY_TOKENS = 600;
const SUMMARY_SYSTEM_PROMPT = `You are a conversation summarizer. Produce a concise summary of the earlier part of a product-sourcing conversation. Capture:
- Key topics and questions the user asked
- Specific products, brands, or components mentioned (with model numbers if any)
- Technical specifications and constraints discussed (dimensions, voltages, materials, etc.)
- Decisions made or preferences expressed by the user
- Any comparisons or trade-offs discussed

Be factual and specific. Use bullet points. Do NOT add opinions or new information.`;

export interface SessionContext {
  summary: string | null;
  recentMessages: ChatHistoryMessage[];
  recentTokens: number;
  bookmarkMessageId: number | null;
}

const EMPTY_CONTEXT: SessionContext = {
  summary: null,
  recentMessages: [],
  recentTokens: 0,
  bookmarkMessageId: null,
};

const inFlightCompactions = new Set<number>();

/**
 * Loads rolling summary + recent messages for a chat session.
 * Requires both sessionId AND userId — enforces ownership in the DB query.
 * Returns empty context if no userId is supplied or the session does not
 * belong to the requesting user. This prevents cross-user data exposure
 * via guessed session IDs.
 */
export async function getContextForSession(
  sessionId: number,
  userId: string | null | undefined,
  _settings: AgentSettingsData
): Promise<SessionContext> {
  if (!sessionId || sessionId <= 0) return EMPTY_CONTEXT;
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    console.warn(`⚠️ [Compaction] getContextForSession called without userId for session ${sessionId} — denying`);
    return EMPTY_CONTEXT;
  }

  const [session] = await db
    .select({
      rollingContextSummary: aiChatSessions.rollingContextSummary,
      summarizedUntilMessageId: aiChatSessions.summarizedUntilMessageId,
    })
    .from(aiChatSessions)
    .where(and(eq(aiChatSessions.id, sessionId), eq(aiChatSessions.userId, userId)));

  if (!session) {
    console.warn(`⚠️ [Compaction] Session ${sessionId} not found for user ${userId} — returning empty context`);
    return EMPTY_CONTEXT;
  }

  const bookmarkId = session.summarizedUntilMessageId ?? 0;

  const rows = await db
    .select({
      id: aiChatSessionMessages.id,
      content: aiChatSessionMessages.content,
      isUser: aiChatSessionMessages.isUser,
      estimatedTokens: aiChatSessionMessages.estimatedTokens,
    })
    .from(aiChatSessionMessages)
    .where(
      and(
        eq(aiChatSessionMessages.sessionId, sessionId),
        gt(aiChatSessionMessages.id, bookmarkId)
      )
    )
    .orderBy(asc(aiChatSessionMessages.id));

  const recentMessages: ChatHistoryMessage[] = [];
  let recentTokens = 0;
  for (const row of rows) {
    const content = row.content || '';
    if (!content.trim()) continue;
    recentMessages.push({
      role: row.isUser ? 'user' : 'assistant',
      content,
    });
    recentTokens += row.estimatedTokens ?? estimateTokens(content);
  }

  return {
    summary: session.rollingContextSummary ?? null,
    recentMessages,
    recentTokens,
    bookmarkMessageId: bookmarkId || null,
  };
}

/**
 * Background fire-and-forget compaction. Caller (e.g. POST messages route)
 * MUST have already verified session ownership before invoking this.
 */
export function runCompactionIfNeeded(sessionId: number, settings: AgentSettingsData): void {
  if (!sessionId || sessionId <= 0) return;
  if (inFlightCompactions.has(sessionId)) return;
  inFlightCompactions.add(sessionId);

  void compactSession(sessionId, settings)
    .catch((err: any) => {
      console.warn(`⚠️ [Compaction] Session ${sessionId} compaction failed:`, err?.message || err);
    })
    .finally(() => {
      inFlightCompactions.delete(sessionId);
    });
}

async function compactSession(sessionId: number, settings: AgentSettingsData): Promise<void> {
  const budgets = calculateBudgets(settings.model, settings);

  // Compaction runs server-side after ownership verification by caller; load
  // by sessionId only (no userId scope needed for the background summarizer).
  const [session] = await db
    .select({
      rollingContextSummary: aiChatSessions.rollingContextSummary,
      summarizedUntilMessageId: aiChatSessions.summarizedUntilMessageId,
    })
    .from(aiChatSessions)
    .where(eq(aiChatSessions.id, sessionId));
  if (!session) return;

  const bookmarkId = session.summarizedUntilMessageId ?? 0;

  const rows = await db
    .select({
      id: aiChatSessionMessages.id,
      content: aiChatSessionMessages.content,
      isUser: aiChatSessionMessages.isUser,
      estimatedTokens: aiChatSessionMessages.estimatedTokens,
    })
    .from(aiChatSessionMessages)
    .where(
      and(
        eq(aiChatSessionMessages.sessionId, sessionId),
        gt(aiChatSessionMessages.id, bookmarkId)
      )
    )
    .orderBy(asc(aiChatSessionMessages.id));

  if (rows.length < 2) return;

  let recentTokens = 0;
  const recentMessages: ChatHistoryMessage[] = [];
  let newBookmarkId = bookmarkId;
  for (const row of rows) {
    const content = row.content || '';
    if (row.id > newBookmarkId) newBookmarkId = row.id;
    if (!content.trim()) continue;
    recentMessages.push({
      role: row.isUser ? 'user' : 'assistant',
      content,
    });
    recentTokens += row.estimatedTokens ?? estimateTokens(content);
  }

  if (recentTokens < budgets.compactionTriggerTokens) return;
  if (recentMessages.length < 2) return;
  if (newBookmarkId === bookmarkId) return;

  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️ [Compaction] OPENAI_API_KEY not configured — skipping');
    return;
  }

  const olderText = recentMessages
    .map((m) => `[${m.role}]: ${m.content.slice(0, 1500)}`)
    .join('\n');

  const previousSummary = session.rollingContextSummary
    ? `Previous rolling summary (preserve this context):\n${session.rollingContextSummary}\n\n---\n\n`
    : '';

  const userPrompt = `${previousSummary}Summarize the conversation below (${recentMessages.length} messages, ~${recentTokens} tokens). If a previous summary is provided above, MERGE it with the new content into a single coherent summary — do not drop earlier context.\n\n${olderText}`;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const startTime = Date.now();
  const compactionModel = settings.compactionModel || 'gpt-4o-mini';

  let summary: string | undefined;
  try {
    const response = await openai.chat.completions.create({
      model: compactionModel,
      max_tokens: MAX_SUMMARY_TOKENS,
      temperature: 0,
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });
    summary = response.choices[0]?.message?.content?.trim();
    const duration = Date.now() - startTime;
    const tokens = response.usage?.total_tokens ?? 0;
    console.log(
      `📝 [Compaction] Session ${sessionId}: summarized ${recentMessages.length} messages (~${recentTokens} tokens) using ${compactionModel} → ${tokens} tokens, ${duration}ms`
    );
  } catch (err: any) {
    console.warn(`⚠️ [Compaction] LLM call failed for session ${sessionId}:`, err?.message || err);
    return;
  }

  if (!summary) {
    console.warn(`⚠️ [Compaction] Empty summary for session ${sessionId} — bookmark not advanced`);
    return;
  }

  await db
    .update(aiChatSessions)
    .set({
      rollingContextSummary: summary,
      summarizedUntilMessageId: newBookmarkId,
      updatedAt: new Date(),
    })
    .where(eq(aiChatSessions.id, sessionId));

  console.log(
    `✅ [Compaction] Session ${sessionId}: rolling summary saved, bookmark advanced to message ${newBookmarkId}`
  );
}
