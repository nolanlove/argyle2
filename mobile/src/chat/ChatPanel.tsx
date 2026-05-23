/**
 * Collapsible bottom-sheet chat panel.
 *
 * Auto-expands on first visit so the user discovers it; collapse state then
 * persists to localStorage under `argyle.chat_expanded`.
 */

import { useEffect, useRef, useState } from 'react';
import { useChat } from './ChatProvider';
import type { ChatMessage } from './types';

const EXPANDED_KEY = 'argyle.chat_expanded';
const SUGGESTIONS = [
  'play me a C major chord',
  'show me the blues scale',
  'play a I–V–vi–IV in G',
  'what does a dim7 sound like?',
];

export function ChatPanel() {
  const { messages, busy, error, send } = useChat();

  // First-visit auto-expand. After that, respect the user's last choice.
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(EXPANDED_KEY);
      return v === null ? true : v === '1';
    } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(EXPANDED_KEY, expanded ? '1' : '0'); } catch {}
  }, [expanded]);

  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  // Autoscroll on new messages while expanded.
  useEffect(() => {
    if (!expanded) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, expanded, busy]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input;
    if (!text.trim() || busy) return;
    setInput('');
    send(text);
  };

  const onSuggest = (text: string) => {
    if (busy) return;
    send(text);
  };

  // Show suggestions only on the welcome-only state (1 message, no user turns).
  const showSuggestions =
    messages.length === 1 && messages[0]?.role === 'assistant';

  return (
    <div className={`chat-panel ${expanded ? 'chat-panel-open' : 'chat-panel-collapsed'}`}>
      <button
        type="button"
        className="chat-handle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="chat-handle-grip" aria-hidden />
        <span className="chat-handle-label">
          {busy ? 'Argyle is thinking…' : expanded ? 'Argyle' : 'Tap to chat with Argyle'}
        </span>
      </button>

      {expanded && (
        <>
          <div className="chat-messages" ref={listRef}>
            {messages.map((m, i) => (
              <Bubble key={i} msg={m} />
            ))}
            {busy && <div className="chat-typing"><span/><span/><span/></div>}
            {error && <div className="chat-error">{error}</div>}

            {showSuggestions && !busy && (
              <div className="chat-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="chat-suggestion"
                    onClick={() => onSuggest(s)}
                  >{s}</button>
                ))}
              </div>
            )}
          </div>

          <form className="chat-input-row" onSubmit={onSubmit}>
            <input
              className="chat-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Argyle to play something…"
              disabled={busy}
            />
            <button
              className="chat-send"
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
            >→</button>
          </form>
        </>
      )}
    </div>
  );
}

function Bubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === 'tool') {
    const label = msg.content.startsWith('error:')
      ? `⚠ ${msg.content}`
      : `▶ ${msg.content}`;
    return <div className="chat-tool-chip">{label}</div>;
  }
  if (msg.role === 'system') return null;
  const cls = msg.role === 'user' ? 'chat-bubble chat-bubble-user' : 'chat-bubble chat-bubble-assistant';
  return (
    <div className={cls}>
      {msg.content || (msg.tool_calls && msg.tool_calls.length > 0 ? '…' : '')}
    </div>
  );
}
