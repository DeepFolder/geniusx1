import { OpenAI } from 'openai';
import type { ChatHistoryMessage } from './agent-search';

const RECENT_WINDOW = 6;
const FALLBACK_WINDOW = 8;
const COMPRESSION_THRESHOLD = 10;
const MAX_SUMMARY_TOKENS = 400;

export interface CompressionUsage {
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  duration_ms: number;
}

export interface CompressedHistory {
  summary: string | null;
  recentMessages: ChatHistoryMessage[];
  originalCount: number;
  compressedCount: number;
  summarizedCount: number;
  _usage?: CompressionUsage;
}

function fallbackCompression(history: ChatHistoryMessage[]): CompressedHistory {
  const firstUserMsg = history.find(m => m.role === 'user');
  const recentMessages = history.slice(-FALLBACK_WINDOW);

  if (firstUserMsg && !recentMessages.includes(firstUserMsg)) {
    return {
      summary: null,
      recentMessages: [firstUserMsg, ...recentMessages],
      originalCount: history.length,
      compressedCount: recentMessages.length + 1,
      summarizedCount: 0,
    };
  }

  return {
    summary: null,
    recentMessages,
    originalCount: history.length,
    compressedCount: recentMessages.length,
    summarizedCount: 0,
  };
}

export async function compressHistory(
  history: ChatHistoryMessage[]
): Promise<CompressedHistory> {
  if (history.length <= COMPRESSION_THRESHOLD) {
    return {
      summary: null,
      recentMessages: history,
      originalCount: history.length,
      compressedCount: history.length,
      summarizedCount: 0,
    };
  }

  const recentMessages = history.slice(-RECENT_WINDOW);
  const olderMessages = history.slice(0, -RECENT_WINDOW);

  if (olderMessages.length === 0) {
    return {
      summary: null,
      recentMessages,
      originalCount: history.length,
      compressedCount: recentMessages.length,
      summarizedCount: 0,
    };
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return fallbackCompression(history);
    }

    const olderText = olderMessages
      .map(m => `[${m.role}]: ${m.content.slice(0, 500)}`)
      .join('\n');

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const startTime = Date.now();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: MAX_SUMMARY_TOKENS,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `You are a conversation summarizer. Produce a concise summary of the earlier part of a product-sourcing conversation. Capture:
- Key topics and questions the user asked
- Specific products, brands, or components mentioned (with model numbers if any)
- Technical specifications and constraints discussed (dimensions, voltages, materials, etc.)
- Decisions made or preferences expressed by the user
- Any comparisons or trade-offs discussed

Be factual and specific. Use bullet points. Do NOT add opinions or new information.`
        },
        {
          role: 'user',
          content: `Summarize this earlier conversation (${olderMessages.length} messages):\n\n${olderText}`
        }
      ],
    });

    const summary = response.choices[0]?.message?.content?.trim();
    const duration = Date.now() - startTime;
    const tokens = response.usage?.total_tokens || 0;

    if (!summary) {
      console.warn('⚠️ [HistoryCompression] Empty summary returned, using fallback');
      return fallbackCompression(history);
    }

    console.log(`📝 [HistoryCompression] Compressed ${olderMessages.length} older messages into summary (${tokens} tokens, ${duration}ms). Keeping ${recentMessages.length} recent messages verbatim.`);

    return {
      summary,
      recentMessages,
      originalCount: history.length,
      compressedCount: recentMessages.length,
      summarizedCount: olderMessages.length,
      _usage: {
        model: 'gpt-4o-mini',
        prompt_tokens: response.usage?.prompt_tokens ?? 0,
        completion_tokens: response.usage?.completion_tokens ?? 0,
        total_tokens: tokens,
        duration_ms: duration,
      },
    };
  } catch (error: any) {
    console.warn('⚠️ [HistoryCompression] Summarization failed, using fallback:', error?.message);
    return fallbackCompression(history);
  }
}
