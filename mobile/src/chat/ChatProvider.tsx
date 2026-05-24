/**
 * ChatProvider owns the conversation state and the send/receive loop.
 *
 * Responsibilities:
 *   - hold messages[] (UI-visible) and a parallel set of streaming markers
 *   - POST to /api/mobile/chat/ and consume the SSE generator
 *   - on each tool_call event: execute against the live instrument, append
 *     a `role:tool` message to history, and if the assistant's turn finished
 *     with finish_reason='tool_calls', automatically fire a follow-up turn
 *     so the model can produce its closing narration.
 *
 * Owned by the panel — descendants consume via useChat().
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useInstrument } from '../grid/InstrumentContext';
import type { ArgyleInstrument } from '../grid/api';
import { streamChat } from './api';
import { executeToolCall } from './tool-calls';
import { setLastPlay } from '../audio/last-play';
import type {
  ChatMessage,
  ToolCall,
  ToolExecResult,
} from './types';

interface ChatContextValue {
  messages: ChatMessage[];
  /** True while a request is in flight (network OR tool execution loop). */
  busy: boolean;
  /** Last error message, if any. Cleared on next send. */
  error: string | null;
  send(text: string): void;
  /** Re-execute a previously-emitted tool call locally — no AI round-trip.
   *  Lets the UI surface a "play again" button on past tool chips. */
  replay(call: ToolCall): Promise<void>;
  /** Inline-rendered chip log of executed tool calls for the UI. */
  toolLog: ExecutedTool[];
}

export interface ExecutedTool {
  id: string;
  name: string;
  result: ToolExecResult;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const WELCOME: ChatMessage = {
  role: 'assistant',
  content: "Welcome — want to explore a key, learn a progression, or just play?",
};

export function ChatProvider(props: { children: ReactNode }) {
  const instrument = useInstrument();
  const instrumentRef = useRef<ArgyleInstrument | null>(instrument);
  useEffect(() => { instrumentRef.current = instrument; }, [instrument]);

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolLog, setToolLog] = useState<ExecutedTool[]>([]);

  // Single in-flight request guard — abort + ignore late events on resend.
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    void runTurn([...messagesRef.current, userMsg]);
  // We thread the latest messages array through a ref to avoid stale-closure
  // bugs across the multi-step tool-result loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep a live ref to messages for the async loop.
  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Debug hook: ?say=... in the URL auto-sends that message once on mount,
  // for headless verification of the AI flow without keystroke injection.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const say = params.get('say');
    if (say) send(say);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Run one assistant turn (with up to N follow-up turns if the model only
   * emitted tool calls). Each iteration:
   *   1. POST current history → stream events
   *   2. accumulate text into a placeholder assistant message
   *   3. on tool_call events: execute, append `role:tool` result, remember
   *      we owe the model another turn if it finished with tool_calls only
   *   4. loop until finish_reason !== 'tool_calls' or budget exhausted.
   */
  const runTurn = useCallback(async (initial: ChatMessage[]) => {
    setBusy(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    let history = initial;
    // 8 follow-ups = up to 9 model turns total. Lets the AI sequence a
    // set_key + N play_pattern_from_pitches calls comfortably, though the
    // preferred path for multi-chord requests is play_progression_from_pitches
    // which collapses everything into one call.
    const maxFollowups = 8;
    let followups = 0;

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // Add an empty assistant placeholder we'll mutate as text streams in.
        const placeholder: ChatMessage = { role: 'assistant', content: '' };
        setMessages((prev) => [...prev, placeholder]);
        history = [...history, placeholder];
        const assistantIdx = history.length - 1;

        let finishReason = 'stop';
        const collectedToolCalls: ToolCall[] = [];
        let accumulatedText = '';

        const stream = streamChat({
          messages: messagesForServer(history.slice(0, -1)),
          signal: ac.signal,
        });

        for await (const evt of stream) {
          if (ac.signal.aborted) return;
          if (evt.type === 'text') {
            accumulatedText += evt.delta;
            const snapshot = accumulatedText;
            setMessages((prev) => updateAt(prev, assistantIdx, (m) => ({
              ...m,
              content: snapshot,
            })));
          } else if (evt.type === 'tool_call') {
            collectedToolCalls.push(evt.call);
          } else if (evt.type === 'done') {
            finishReason = evt.finishReason;
          } else if (evt.type === 'error') {
            setError(evt.error);
            return;
          }
        }

        // Persist tool_calls on the assistant message so the next request's
        // history (and the OpenAI server-side expectation that tool messages
        // follow an assistant message with tool_calls) is consistent.
        if (collectedToolCalls.length > 0) {
          setMessages((prev) => updateAt(prev, assistantIdx, (m) => ({
            ...m,
            tool_calls: collectedToolCalls,
          })));
          history = updateAt(history, assistantIdx, (m) => ({
            ...m,
            tool_calls: collectedToolCalls,
          }));
        }

        // Execute each tool call sequentially. Sequential because the
        // instrument's playProgression / playChord are timed — running in
        // parallel would stack audio + highlights chaotically and the model
        // typically intends them as an ordered demonstration.
        for (const call of collectedToolCalls) {
          const inst = instrumentRef.current;
          let result: ToolExecResult;
          if (!inst) {
            result = { ok: false, error: 'instrument not mounted' };
          } else {
            result = await executeToolCall(inst, call);
            // Register this call as "last played" so the ♪ button replays it.
            // Audio-producing tools only; set_key/highlight are state changes,
            // not "things you heard".
            if (isAudioProducingToolCall(call.name)) {
              setLastPlay(call.name, async () => {
                const i = instrumentRef.current;
                if (i) await executeToolCall(i, call);
              });
            }
          }
          setToolLog((prev) => [...prev, { id: call.id, name: call.name, result }]);
          const toolMsg: ChatMessage = {
            role: 'tool',
            tool_call_id: call.id,
            content: result.ok ? result.summary : `error: ${result.error}`,
            tool_call: call,
          };
          setMessages((prev) => [...prev, toolMsg]);
          history = [...history, toolMsg];
        }

        if (finishReason !== 'tool_calls' || collectedToolCalls.length === 0) {
          return;
        }
        followups++;
        if (followups >= maxFollowups) return;
      }
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (abortRef.current === ac) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const replay = useCallback(async (call: ToolCall): Promise<void> => {
    const inst = instrumentRef.current;
    if (!inst) return;
    // We deliberately do NOT append the result back to chat history —
    // replay is a UI affordance, not a new conversational turn. The
    // audit panel (long-press ♪) is the record of what played.
    await executeToolCall(inst, call);
    // Tapping ▶ on a chip ALSO updates "last played" so the ♪ button
    // mirrors what just happened.
    if (isAudioProducingToolCall(call.name)) {
      setLastPlay(call.name, async () => {
        const i = instrumentRef.current;
        if (i) await executeToolCall(i, call);
      });
    }
  }, []);

  const value = useMemo<ChatContextValue>(() => ({
    messages, busy, error, send, replay, toolLog,
  }), [messages, busy, error, send, replay, toolLog]);

  return <ChatContext.Provider value={value}>{props.children}</ChatContext.Provider>;
}

const AUDIO_TOOLS = new Set([
  'play_chord',
  'play_note',
  'play_progression',
  'play_pattern_from_pitches',
  'play_progression_from_pitches',
]);
function isAudioProducingToolCall(name: string): boolean {
  return AUDIO_TOOLS.has(name);
}

export function useChat(): ChatContextValue {
  const v = useContext(ChatContext);
  if (!v) throw new Error('useChat must be used inside <ChatProvider>');
  return v;
}

// ---- helpers ----

function updateAt<T>(arr: T[], idx: number, fn: (item: T) => T): T[] {
  if (idx < 0 || idx >= arr.length) return arr;
  const next = arr.slice();
  const item = next[idx];
  if (item === undefined) return arr;
  next[idx] = fn(item);
  return next;
}

/**
 * Strip UI-only fields and reshape our internal tool_call format into the
 * shape OpenAI's Chat Completions API requires when replaying an assistant
 * turn:
 *
 *   { id, type: "function", function: { name, arguments: <JSON string> } }
 *
 * Our internal shape is the flatter { id, name, arguments: object } that the
 * server emits as SSE events. Without this reshape OpenAI returns
 * `Missing required parameter: messages[N].tool_calls[0].type`.
 */
type OpenAIToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};
type ServerMessage =
  | { role: 'user' | 'system'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: OpenAIToolCall[] }
  | { role: 'tool'; content: string; tool_call_id?: string };

function messagesForServer(history: ChatMessage[]): ServerMessage[] {
  return history.map((m): ServerMessage => {
    if (m.role === 'assistant') {
      const out: ServerMessage = { role: 'assistant', content: m.content };
      if (m.tool_calls && m.tool_calls.length > 0) {
        out.tool_calls = m.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments ?? {}),
          },
        }));
      }
      return out;
    }
    if (m.role === 'tool') {
      const out: ServerMessage = { role: 'tool', content: m.content };
      if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
      return out;
    }
    return { role: m.role as 'user' | 'system', content: m.content };
  });
}
