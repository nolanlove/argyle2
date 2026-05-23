/**
 * SSE client for /api/mobile/chat/.
 *
 * Native EventSource doesn't support POST + JSON bodies, so we use fetch +
 * a hand-rolled SSE parser. The format we handle is the strict subset our
 * server emits:
 *
 *     event: <name>\n
 *     data: <one-line JSON>\n
 *     \n
 *
 * (No multi-line data, no `id:`, no `retry:` — keeps the parser tiny.)
 */

import type { ChatStreamEvent, ToolCall } from './types';

/**
 * Wire shape for messages POSTed to the chat endpoint. Loose by design — the
 * caller (ChatProvider.messagesForServer) is responsible for reshaping our
 * internal `ChatMessage` into something OpenAI's API accepts (notably the
 * nested `tool_calls[].function.{name,arguments:string}` shape).
 */
export type WireMessage = Record<string, unknown>;

export interface StreamChatOpts {
  messages: WireMessage[];
  /** AbortController signal for cancelling mid-stream. */
  signal?: AbortSignal;
  /** Optional override (defaults to `/api/mobile/chat/`). */
  endpoint?: string;
}

/**
 * POST to the chat endpoint and yield parsed events as they arrive.
 *
 * Throws on network failure or non-2xx HTTP. The 429-rate-limited case
 * surfaces as a thrown Error so callers can show a clear message.
 */
export async function* streamChat(
  opts: StreamChatOpts,
): AsyncGenerator<ChatStreamEvent, void, void> {
  const endpoint = opts.endpoint ?? '/api/mobile/chat/';
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ messages: opts.messages }),
    signal: opts.signal,
    credentials: 'same-origin',
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.text();
      detail = body.slice(0, 200);
    } catch {
      // ignore
    }
    throw new Error(`Chat request failed: ${res.status} ${detail}`);
  }
  if (!res.body) {
    throw new Error('Chat response has no body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line ("\n\n"). Process all
      // complete frames; leave any trailing partial in the buffer.
      let sepIdx = buffer.indexOf('\n\n');
      while (sepIdx !== -1) {
        const frame = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        const evt = parseFrame(frame);
        if (evt) yield evt;
        sepIdx = buffer.indexOf('\n\n');
      }
    }
    // Flush any final frame (no trailing blank line).
    const tail = buffer.trim();
    if (tail) {
      const evt = parseFrame(tail);
      if (evt) yield evt;
    }
  } finally {
    try { reader.releaseLock(); } catch { /* noop */ }
  }
}

/** Parse a single SSE frame into a typed event. Returns null on unknowns. */
export function parseFrame(frame: string): ChatStreamEvent | null {
  let eventName = 'message';
  const dataLines: string[] = [];
  for (const raw of frame.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line) continue;
    if (line.startsWith(':')) continue; // comment
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon);
    // Per spec, a single optional space after the colon is stripped.
    const value = line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') eventName = value;
    else if (field === 'data') dataLines.push(value);
  }
  if (dataLines.length === 0) return null;
  const payload = parseJson(dataLines.join('\n'));
  if (payload === null) return null;

  switch (eventName) {
    case 'text': {
      const delta = typeof (payload as { delta?: unknown }).delta === 'string'
        ? (payload as { delta: string }).delta
        : '';
      return { type: 'text', delta };
    }
    case 'tool_call': {
      const p = payload as Partial<ToolCall> & { arguments?: unknown };
      if (typeof p.id !== 'string' || typeof p.name !== 'string') return null;
      const args = (p.arguments && typeof p.arguments === 'object')
        ? (p.arguments as Record<string, unknown>)
        : {};
      return { type: 'tool_call', call: { id: p.id, name: p.name, arguments: args } };
    }
    case 'done': {
      const fr = (payload as { finish_reason?: unknown }).finish_reason;
      return { type: 'done', finishReason: typeof fr === 'string' ? fr : 'stop' };
    }
    case 'error': {
      const err = (payload as { error?: unknown }).error;
      return { type: 'error', error: typeof err === 'string' ? err : 'Unknown error' };
    }
    default:
      return null;
  }
}

function parseJson(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return null; }
}
