/**
 * Teacher mode (default landing): grid + mode segmented control + chord chip
 * bar + AI ChatPanel. Lifted from the original App.tsx wholesale.
 */

import { useEffect, useState } from 'react';
import { useInstrument } from '../grid/InstrumentContext';
import type { PlayMode } from '../grid/api';
import { getPitchAt, musicalNotes } from '../core';
import { ChatProvider } from '../chat/ChatProvider';
import { ChatPanel } from '../chat/ChatPanel';

const ORIGIN_PITCH = 0;

interface TeacherModeProps {
  playMode: PlayMode;
  setPlayMode: (m: PlayMode) => void;
}

export function TeacherMode(props: TeacherModeProps) {
  return (
    <ChatProvider>
      <Overlay playMode={props.playMode} setPlayMode={props.setPlayMode} />
      <ChatPanel />
    </ChatProvider>
  );
}

interface OverlayProps {
  playMode: PlayMode;
  setPlayMode: (m: PlayMode) => void;
}

function Overlay({ playMode, setPlayMode }: OverlayProps) {
  const instrument = useInstrument();

  return (
    <>
      <div className="mode-bar" role="tablist">
        <ModeButton current={playMode} mode="notes" label="Notes" setMode={setPlayMode} />
        <ModeButton current={playMode} mode="chord-builder" label="Chord" setMode={setPlayMode} />
        <ModeButton current={playMode} mode="auto-chord" label="Auto" setMode={setPlayMode} />
      </div>

      {playMode === 'chord-builder' && instrument && <ChordChipBar />}
    </>
  );
}

function ModeButton(props: {
  current: PlayMode;
  mode: PlayMode;
  label: string;
  setMode: (m: PlayMode) => void;
}) {
  const active = props.current === props.mode;
  return (
    <button
      role="tab"
      aria-selected={active}
      className={`mode-btn ${active ? 'mode-btn-active' : ''}`}
      onClick={() => props.setMode(props.mode)}
    >
      {props.label}
    </button>
  );
}

function ChordChipBar() {
  const instrument = useInstrument();
  const [cells, setCells] = useState(() => instrument?.builder.current() ?? []);

  useEffect(() => {
    if (!instrument) return;
    return instrument.builder.onChange((next) => setCells(next));
  }, [instrument]);

  if (!instrument) return null;

  const noteNames = cells.map((c) => {
    const info = getPitchAt(c.x, c.y, ORIGIN_PITCH);
    if (!info) return '?';
    return `${musicalNotes[info.pitch % 12]!}${info.octave}`;
  });

  return (
    <div className="chip-bar">
      <div className="chip-list">
        {noteNames.length === 0 ? (
          <span className="chip-empty">Tap cells to build a chord</span>
        ) : (
          noteNames.map((n, i) => <span key={`${n}-${i}`} className="chip">{n}</span>)
        )}
      </div>
      <div className="chip-actions">
        <button
          className="chip-btn"
          disabled={cells.length === 0}
          onClick={() => { void instrument.builder.play(); }}
        >▶ Play</button>
        <button
          className="chip-btn"
          disabled={cells.length === 0}
          onClick={() => instrument.builder.clear()}
        >✕ Clear</button>
        <button
          className="chip-btn"
          disabled={cells.length === 0}
          onClick={() => {
            const name = window.prompt('Name this chord');
            if (name && name.trim()) instrument.builder.save(name.trim());
          }}
        >Save</button>
      </div>
    </div>
  );
}

