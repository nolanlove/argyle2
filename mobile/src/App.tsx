/**
 * Mobile shell — three modes (Teacher / Songwriter / Lab) routed via simple
 * React state and persisted to localStorage under `argyle.mode`.
 *
 * Single Grid mounts once at this layer and is shared across modes. That
 * means the instrument instance PERSISTS across mode switches — chord
 * builder contents, saved chords, and key state survive a switch. The grid
 * renderer itself is also retained (no remount), so audio/Web-Audio nodes
 * don't get torn down on every switch.
 *
 * Mode switcher: a small cycling button in the top-right corner that taps
 * through Teacher → Songwriter → Lab → Teacher. Chosen over a popup menu
 * because (a) only 3 modes, (b) one-tap is faster than tap-menu-pick, and
 * (c) zero new UI primitives. Label shows the NEXT mode to clarify intent.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Grid } from './grid/Grid';
import type { GridHandle } from './grid/Grid';
import type { PlayMode } from './grid/api';
import { audio } from './audio/engine';
import { AuditPanel } from './audio/AuditPanel';
import {
  hasLastPlay, replayLast, onLastPlayChange, getLastPlayLabel,
} from './audio/last-play';
import { TeacherMode } from './modes/TeacherMode';
import { SongwriterMode } from './modes/SongwriterMode';
import { LabMode } from './modes/LabMode';
import { loadMode, saveMode, type AppMode, nextMode, modeLabel } from './modes/mode-store';
import { GridSetup } from './modes/GridSetup';
import { loadSetup, saveSetup, type Setup } from './modes/setup-store';

export function App() {
  const [audioReady, setAudioReady] = useState(false);
  const [mode, setModeState] = useState<AppMode>(() => loadMode());
  const [playMode, setPlayMode] = useState<PlayMode>('notes');
  const [setup, setSetupState] = useState<Setup>(() => loadSetup());
  const [auditOpen, setAuditOpen] = useState(false);
  const [lastPlayLabel, setLastPlayLabel] = useState<string | null>(getLastPlayLabel());
  const longPressTimer = useRef<number | null>(null);

  useEffect(
    () => onLastPlayChange(() => setLastPlayLabel(getLastPlayLabel())),
    [],
  );
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<GridHandle | null>(null);

  const setMode = useCallback((m: AppMode) => {
    setModeState(m);
    saveMode(m);
  }, []);

  const setSetup = useCallback((s: Setup) => {
    setSetupState(s);
    saveSetup(s);
  }, []);

  // Pin wrapper height to innerHeight (iOS 100dvh occasionally resolves to
  // 100vh) AND measure Safari's URL bar intrusion via visualViewport, so the
  // top/bottom overlays clear it regardless of whether the bar is at top or
  // bottom (an iOS Safari setting under the user's control).
  //
  // We set --argyle-pad-top and --argyle-pad-bot CSS variables on :root. CSS
  // uses these via max(<floor>, var(--argyle-pad-top)) etc.
  useEffect(() => {
    const apply = () => {
      const w = wrapRef.current;
      if (!w) return;
      const innerH = window.innerHeight;
      const vv = window.visualViewport;
      w.style.height = `${innerH}px`;

      // visualViewport.offsetTop is the pixel distance from the layout
      // viewport top to the visual viewport top — that's how much of the
      // top is being occluded by Safari chrome (or nothing if URL bar is
      // bottom-anchored). offsetBottom is similar.
      const vTop = vv ? vv.offsetTop : 0;
      const vH = vv ? vv.height : innerH;
      const vBot = vv ? Math.max(0, innerH - vH - vTop) : 0;

      // Floors keep things sensible when offsets are 0 (PWA / desktop /
      // bar-collapsed). The notch is already inside safe-area-inset-top.
      const root = document.documentElement;
      root.style.setProperty('--argyle-pad-top', `${Math.max(vTop, 0)}px`);
      root.style.setProperty('--argyle-pad-bot', `${vBot}px`);
      // Visual viewport height — used by .chat-panel-open so it shrinks
      // when the iOS keyboard pops up (vh-based heights don't react to
      // the keyboard intrusion).
      root.style.setProperty('--argyle-vp-h', `${vH}px`);

      // Compute where the chat panel's TOP edge should be.
      // - No keyboard: ~35% down so the grid is the hero, chat panel
      //   takes the bottom ~65% (~480px of 740px visible).
      // - Keyboard up: just below the top URL bar / notch + a small gap,
      //   so as much of the chat history as possible stays visible while
      //   the user is typing.
      const kbUp = vBot > 100;
      const chatTop = kbUp
        ? Math.max(vTop + 56, 60)
        : Math.round(vTop + vH * 0.40);
      root.style.setProperty('--argyle-chat-top', `${chatTop}px`);
    };
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    window.visualViewport?.addEventListener('resize', apply);
    window.visualViewport?.addEventListener('scroll', apply);
    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      window.visualViewport?.removeEventListener('resize', apply);
      window.visualViewport?.removeEventListener('scroll', apply);
    };
  }, []);

  // Unlock audio on the first user gesture. CRITICAL: `audio.init()` is
  // synchronous in its critical path (Tone.start() + new PolySynth() must
  // happen in the same tick as the user gesture). We don't await it inline
  // — the gesture handler must complete before the audio engine can wait
  // on the AudioContext to actually transition to 'running'.
  useEffect(() => {
    if (audioReady) return;
    const unlock = (): void => {
      // Synchronous: Tone.start() fires + synth is constructed in this tick.
      const p = audio.init();
      // Async: wait for the AudioContext to reach 'running' before we mark
      // ready (or settle into a brief poll if Tone.start never resolves).
      p.then(() => {
        if (audio.isReady()) setAudioReady(true);
      }).catch(() => { /* will retry on next gesture */ });
    };
    const opts: AddEventListenerOptions = { capture: true };
    window.addEventListener('touchstart', unlock, opts);
    window.addEventListener('mousedown', unlock, opts);
    return () => {
      window.removeEventListener('touchstart', unlock, opts);
      window.removeEventListener('mousedown', unlock, opts);
    };
  }, [audioReady]);

  // Dev-only debug hook: window.__audio so we can poke from the console
  // (or via simctl openurl javascript:... not, since iOS blocks that, but
  // useful when DevTools is attached over USB).
  useEffect(() => {
    if (import.meta.env.DEV || true) {
      (window as unknown as { __audio: typeof audio }).__audio = audio;
    }
  }, []);

  return (
    <main className="app-shell" ref={wrapRef}>
      {mode === 'lab' ? (
        <LabMode />
      ) : (
        <Grid
          ref={gridRef}
          playMode={playMode}
          rootPitchClass={setup.rootPc}
          keyMode={setup.scale}
          labelMode={setup.labelMode}
          clones={setup.clones}
        >
          {mode === 'teacher' && (
            <TeacherMode playMode={playMode} setPlayMode={setPlayMode} />
          )}
          {mode === 'songwriter' && <SongwriterMode />}
          <GridSetup setup={setup} onChange={setSetup} />
        </Grid>
      )}

      <button
        className="mode-switcher"
        aria-label={`Current mode: ${modeLabel(mode)}. Tap to switch to ${modeLabel(nextMode(mode))}.`}
        onClick={() => setMode(nextMode(mode))}
      >
        {modeLabel(mode)[0]}
      </button>

      {/* ♪ replay-last button.
          Tap → replays the most recent thing that played (AI chord/progression,
                a cell you tapped, a chord-builder Play, etc.). Falls back to a
                test C5 if nothing has played yet.
          Long-press → toggles the audit panel (last ~12 audio events with
                exact MIDI/freq/instrument). */}
      <button
        className={`sound-check ${audioReady ? 'sound-check-ready' : ''}`}
        aria-label={lastPlayLabel ? `Replay last (${lastPlayLabel})` : 'Test sound'}
        title={lastPlayLabel ? `Replay: ${lastPlayLabel}` : 'Tap to test audio'}
        onClick={() => {
          if (longPressTimer.current === -1) {
            longPressTimer.current = null;
            return;
          }
          audio.init();
          setTimeout(() => {
            if (hasLastPlay()) {
              void replayLast();
            } else {
              audio.tag('test').playNote(72, 400);
            }
            if (audio.isReady()) setAudioReady(true);
          }, 50);
        }}
        onPointerDown={() => {
          longPressTimer.current = window.setTimeout(() => {
            longPressTimer.current = -1; // signal: ignore the upcoming click
            setAuditOpen((v) => !v);
          }, 500);
        }}
        onPointerUp={() => {
          if (longPressTimer.current && longPressTimer.current > 0) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
        }}
        onPointerCancel={() => {
          if (longPressTimer.current && longPressTimer.current > 0) {
            clearTimeout(longPressTimer.current);
          }
          longPressTimer.current = null;
        }}
      >
        ♪
      </button>

      <AuditPanel open={auditOpen} onClose={() => setAuditOpen(false)} />

      {!audioReady && (
        <div className="audio-hint" aria-hidden>
          Tap anywhere or the ♪ to start
        </div>
      )}
    </main>
  );
}
