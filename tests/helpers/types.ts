/**
 * Typed shapes for HTTP API responses used across chat integration tests.
 * These mirror the DB row shape returned by the production routes.
 */

export interface ApiSession {
  id: number;
  userId: string;
  title: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  summarizedUntilMessageId: number | null;
  rollingContextSummary: string | null;
}

export interface ApiMessage {
  id: number;
  sessionId: number;
  content: string;
  isUser: boolean;
  status: string;
  estimatedTokens: number | null;
  createdAt: string;
  searchResults: Record<string, unknown> | null;
  suggestions: string[] | null;
}

export interface SessionListResponse {
  sessions: ApiSession[];
  nextCursor: number | null;
}

export interface MessageListResponse {
  messages: ApiMessage[];
  hasMore: boolean;
}

export interface ErrorResponse {
  error: string;
}

export interface SuccessResponse {
  success: boolean;
}

/** Parsed line from a NDJSON streaming response */
export interface NdjsonEvent {
  type: string;
  requestId?: string;
  data?: Record<string, unknown>;
  message?: string;
  error?: string;
  [key: string]: unknown;
}
