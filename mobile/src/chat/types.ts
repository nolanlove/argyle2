/**
 * Wire types for the mobile chat panel.
 *
 * Mirrors the OpenAI Chat Completions message shape closely so the same
 * `messages` array can be sent verbatim to the server, which prepends the
 * fixed system prompt.
 */

export type Role = 'user' | 'assistant' | 'tool' | 'system';

/** A single grid cell coordinate, matching `GridCoord` in core/. */
export interface CellCoord {
  x: number;
  y: number;
}

/** One AI tool invocation. The server emits one of these per assembled call. */
export interface ToolCall {
  id: string;
  name: string;
  /** Parsed JSON arguments. Empty object if the model emitted none. */
  arguments: Record<string, unknown>;
}

/** A chat message in the conversation. */
export interface ChatMessage {
  role: Role;
  /** Assistant/user text, or the tool-call result string for role='tool'. */
  content: string;
  /** Tool calls emitted by the assistant on this turn (assistant role only). */
  tool_calls?: ToolCall[];
  /** Set on role='tool' messages to bind the result to its call. */
  tool_call_id?: string;
}

/** Discriminated union of events streamed from the server over SSE. */
export type ChatStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done'; finishReason: string }
  | { type: 'error'; error: string };

/** Outcome of executing one tool call client-side. */
export type ToolExecResult =
  | { ok: true; summary: string }
  | { ok: false; error: string };
