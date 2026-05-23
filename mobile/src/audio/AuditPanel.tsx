/**
 * Floating audit panel — shows the last N audio events with the EXACT
 * MIDI pitches, frequencies, and instrument that were sent to Tone.js.
 *
 * Lets the user verify that what the AI claims it played matches what
 * the audio engine actually played. Toggle via long-press on the ♪
 * sound-check button.
 */

import { useEffect, useRef, useState } from 'react';
import { audio } from './engine';
import type { AuditEvent } from './engine';

interface Props {
  open: boolean;
  onClose: () => void;
}

const MAX_VISIBLE = 12;

export function AuditPanel({ open, onClose }: Props) {
  const [events, setEvents] = useState<AuditEvent[]>(() => [...audio.audit()]);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return audio.onPlay((e) => {
      setEvents((prev) => [...prev, e].slice(-MAX_VISIBLE));
    });
  }, []);

  // Autoscroll on new events when open.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events, open]);

  if (!open) return null;

  const recent = events.slice(-MAX_VISIBLE);

  return (
    <div className="audit-panel" role="dialog" aria-label="Audio audit log">
      <div className="audit-header">
        <span>Audio audit ({audio.audit().length} total)</span>
        <button
          type="button"
          className="audit-close"
          onClick={onClose}
          aria-label="Close audit panel"
        >×</button>
      </div>
      <div className="audit-list" ref={listRef}>
        {recent.length === 0 ? (
          <div className="audit-empty">
            No audio events yet — play a note or ask Argyle to play a chord.
          </div>
        ) : recent.map((e, i) => (
          <div key={`${e.t}-${i}`} className="audit-row">
            <div className="audit-row-head">
              <span className="audit-source">{e.source}</span>
              <span className="audit-inst">{e.instrument}</span>
              <span className="audit-dur">{e.durationMs}ms</span>
            </div>
            <div className="audit-notes">
              {e.midi.map((m, j) => (
                <span key={j} className="audit-note">
                  <span className="audit-name">{e.names[j]}</span>
                  <span className="audit-midi">midi {m}</span>
                  <span className="audit-freq">{e.freq[j]?.toFixed(1)}Hz</span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="audit-footer">
        Tap ♪ once = test C5 · long-press ♪ = toggle this panel
      </div>
    </div>
  );
}
