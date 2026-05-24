/**
 * Teacher mode (default landing): grid + mode segmented control + AI chat.
 * Chord mode has no special UI — taps stack on the grid (cells stay lit),
 * the ♪ button at top-right plays the stack.
 */

import { useInstrument } from '../grid/InstrumentContext';
import type { PlayMode } from '../grid/api';
import { ChatProvider } from '../chat/ChatProvider';
import { ChatPanel } from '../chat/ChatPanel';
import { ChordIdentifier } from './ChordIdentifier';

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
  // Touch the instrument context so the provider stays connected even when
  // we don't render any builder UI from here.
  useInstrument();
  return (
    <>
      <div className="mode-bar" role="tablist">
        <ModeButton current={playMode} mode="notes" label="Notes" setMode={setPlayMode} />
        <ModeButton current={playMode} mode="chord-builder" label="Chord" setMode={setPlayMode} />
        <ModeButton current={playMode} mode="auto-chord" label="Auto" setMode={setPlayMode} />
      </div>
      {playMode === 'chord-builder' && <ChordIdentifier />}
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
