/**
 * React wrapper for the imperative GridRenderer + GridGestures + Instrument.
 *
 * React owns the host <div>; it NEVER re-renders cells. Cell DOM is owned
 * exclusively by GridRenderer. Prop changes are proxied through useEffect
 * via the instrument's setKey() / setPlayMode().
 *
 * The instrument is exposed two ways:
 *   - imperatively via the `ref` (so the App.tsx layer can pass it around)
 *   - reactively via `<InstrumentProvider>` so descendants can `useInstrument()`
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { noteToPitchClass } from '../core';
import type { KeyMode } from '../core';
import { audio } from '../audio/engine';
import { GridRenderer } from './renderer';
import { GridGestures } from './gestures';
import { createInstrument } from './api';
import type { ArgyleInstrument, PlayMode } from './api';
import type { LabelMode } from './renderer';
import { InstrumentProvider } from './InstrumentContext';

const GRID_WIDTH = 20;
const GRID_HEIGHT = 20;
// Default origin keeps a 20x20 grid inside MIDI 0-127. Matches core default.
const ORIGIN_PITCH = 0;

export interface GridProps {
  playMode?: PlayMode;
  /** Either a note name ("C") or an explicit pitch class (0-11). */
  rootNote?: string;
  rootPitchClass?: number;
  keyMode?: KeyMode;
  /** What each cell prints (note name / degree / roman / none). */
  labelMode?: LabelMode;
  /** Light every clone of a played pitch across the grid. */
  clones?: boolean;
  /** Rendered alongside the grid, inside the instrument provider. */
  children?: ReactNode;
}

export interface GridHandle {
  instrument: ArgyleInstrument | null;
}

export const Grid = forwardRef<GridHandle, GridProps>(function Grid(props, ref) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<GridRenderer | null>(null);
  const gesturesRef = useRef<GridGestures | null>(null);
  const instrumentRef = useRef<ArgyleInstrument | null>(null);

  // Trigger a render once the instrument is mounted so the provider value
  // updates from null → instrument. (We avoid putting the instrument itself
  // in state to keep it stable across renders.)
  const [mounted, setMounted] = useState(false);

  useImperativeHandle(ref, () => ({
    get instrument() { return instrumentRef.current; },
  }), []);

  // Mount once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new GridRenderer({
      host,
      gridWidth: GRID_WIDTH,
      gridHeight: GRID_HEIGHT,
      originPitch: ORIGIN_PITCH,
      audio,
    });
    const instrument = createInstrument({
      renderer,
      audio,
      originPitch: ORIGIN_PITCH,
      gridWidth: GRID_WIDTH,
      gridHeight: GRID_HEIGHT,
    });
    const gestures = new GridGestures({
      host,
      renderer,
      audio,
      // Instrument owns playback (per-playMode behavior).
      autoPlayOnHit: false,
      onTap: (hit) => instrument.__handleUserHit(hit),
      onDrag: (hit) => instrument.__handleUserHit(hit),
    });
    rendererRef.current = renderer;
    gesturesRef.current = gestures;
    instrumentRef.current = instrument;
    setMounted(true);

    // Dev-only debug hook so we can poke from iOS Safari console.
    if (import.meta.env.DEV) {
      (globalThis as { __argyle?: ArgyleInstrument }).__argyle = instrument;
    }

    return () => {
      gestures.destroy();
      renderer.destroy();
      rendererRef.current = null;
      gesturesRef.current = null;
      instrumentRef.current = null;
      if (import.meta.env.DEV) {
        delete (globalThis as { __argyle?: ArgyleInstrument }).__argyle;
      }
    };
  }, []);

  // Key / mode proxy — drive through the instrument so its internal state
  // stays in sync with the renderer.
  useEffect(() => {
    const inst = instrumentRef.current;
    if (!inst) return;
    const pc = resolveRootPitchClass(props.rootPitchClass, props.rootNote);
    inst.setKey(pc, props.keyMode ?? 'major');
  }, [props.rootPitchClass, props.rootNote, props.keyMode, mounted]);

  useEffect(() => {
    instrumentRef.current?.setPlayMode(props.playMode ?? 'notes');
  }, [props.playMode, mounted]);

  useEffect(() => {
    instrumentRef.current?.setLabelMode(props.labelMode ?? 'notes');
  }, [props.labelMode, mounted]);

  useEffect(() => {
    instrumentRef.current?.setClones(props.clones ?? true);
  }, [props.clones, mounted]);

  return (
    <InstrumentProvider instrument={instrumentRef.current}>
      <div ref={hostRef} className="grid-host" />
      {props.children}
    </InstrumentProvider>
  );
});

function resolveRootPitchClass(
  explicit: number | undefined,
  note: string | undefined,
): number {
  if (typeof explicit === 'number') return ((explicit % 12) + 12) % 12;
  if (note) {
    const pc = noteToPitchClass(note);
    if (pc !== -1) return pc;
  }
  return 0;
}
