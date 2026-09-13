import type { Response } from 'express';
import { randomUUID } from 'crypto';
import type { StreamEvent } from '../backend/types';

export interface StreamContext {
  res: Response;
  requestId: string;
  startedAt: number;
  heartbeatId?: NodeJS.Timeout;
  /**
   * Optional sink invoked for every emitted event. Used by the route layer
   * to accumulate partial stream state (token text, product cards, etc.) so
   * a placeholder row can be persisted with whatever was produced before
   * a stream failure / client disconnect.
   */
  onCapture?: (event: Partial<StreamEvent> & { type: StreamEvent['type'] }) => void;
}

export function initializeStream(res: Response): StreamContext {
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  return {
    res,
    requestId: randomUUID(),
    startedAt: Date.now(),
  };
}

export function writeEvent(ctx: StreamContext, event: Partial<StreamEvent> & { type: StreamEvent['type'] }) {
  const fullEvent = { ...event, requestId: ctx.requestId };
  ctx.res.write(`${JSON.stringify(fullEvent)}\n`);
  (ctx.res as any).flush?.();
  // Capture for partial-state persistence; never let capture errors break the stream.
  if (ctx.onCapture) {
    try { ctx.onCapture(event); } catch { /* swallow */ }
  }
}

export function writeStatus(ctx: StreamContext, message: string) {
  writeEvent(ctx, { type: 'status', message });
}

export function writeError(ctx: StreamContext, error: string) {
  writeEvent(ctx, { type: 'error', error });
}

export function writeProductCard(ctx: StreamContext, data: any, index: number) {
  writeEvent(ctx, { type: 'product_card', data, index });
}

export function writeResult(ctx: StreamContext, data: any) {
  writeEvent(ctx, { type: 'result', data });
}

export function writeChatSummary(ctx: StreamContext, message: string) {
  writeEvent(ctx, { type: 'chat_summary', message });
}

export function writeMessagePlaceholder(ctx: StreamContext, messageId: number) {
  writeEvent(ctx, { type: 'message_placeholder', payload: { messageId } });
}

export function writePreliminaryResponse(ctx: StreamContext, message: string) {
  writeEvent(ctx, { type: 'preliminary_response', message });
}

export async function streamTokenString(ctx: StreamContext, text: string, delayMs: number = 30) {
  for (const char of text) {
    writeEvent(ctx, { type: 'token', delta: char });
    await new Promise((r) => setTimeout(r, delayMs));
  }
  writeEvent(ctx, { type: 'token', delta: '\n' });
}

export function startHeartbeat(ctx: StreamContext, messages: string[], intervalMs: number = 4000): NodeJS.Timeout {
  let msgIndex = 0;
  
  const heartbeatId = setInterval(async () => {
    if (msgIndex < messages.length) {
      const msg = messages[msgIndex];
      const seconds = Math.floor((Date.now() - ctx.startedAt) / 1000);
      await streamTokenString(ctx, `> ${msg} (${seconds}s)`);
      msgIndex++;
    }
  }, intervalMs);

  ctx.heartbeatId = heartbeatId;
  return heartbeatId;
}

export function stopHeartbeat(ctx: StreamContext) {
  if (ctx.heartbeatId) {
    clearInterval(ctx.heartbeatId);
    ctx.heartbeatId = undefined;
  }
}

export function endStream(ctx: StreamContext) {
  stopHeartbeat(ctx);
  ctx.res.end();
}
