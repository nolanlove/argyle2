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
import { TeacherMode } from './modes/TeacherMode';
import { SongwriterMode } from './modes/SongwriterMode';
import { LabMode } from './modes/LabMode';
import { loadMode, saveMode, type AppMode, nextMode, modeLabel } from './modes/mode-store';

export function App() {
  const [audioReady, setAudioReady] = useState(false);
  const [mode, setModeState] = useState<AppMode>(() => loadMode());
  const [playMode, setPlayMode] = useState<PlayMode>('notes');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<GridHandle | null>(null);

  const setMode = useCallback((m: AppMode) => {
    setModeState(m);
    saveMode(m);
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
        <Grid ref={gridRef} playMode={playMode} rootNote="C" keyMode="major">
          {mode === 'teacher' && (
            <TeacherMode playMode={playMode} setPlayMode={setPlayMode} />
          )}
          {mode === 'songwriter' && <SongwriterMode />}
        </Grid>
      )}

      <button
        className="mode-switcher"
        aria-label={`Current mode: ${modeLabel(mode)}. Tap to switch to ${modeLabel(nextMode(mode))}.`}
        onClick={() => setMode(nextMode(mode))}
      >
        {modeLabel(mode)[0]}
      </button>

      {/* Sound check button — visible until audio is verified, then quiet.
          Plays a test C5 note synchronously inside the click handler so
          the user can confirm output even before any AI/chord flow runs. */}
      <button
        className={`sound-check ${audioReady ? 'sound-check-ready' : ''}`}
        aria-label="Test sound"
        onClick={() => {
          audio.init();
          // Defer the test tone one tick so Tone.start() promise lands.
          setTimeout(() => {
            audio.playNote(72, 400);
            if (audio.isReady()) setAudioReady(true);
          }, 50);
        }}
      >
        ♪
      </button>

      {!audioReady && (
        <div className="audio-hint" aria-hidden>
          Tap anywhere or the ♪ to start
        </div>
      )}
    </main>
  );
}
