/**
 * Instrument API.
 *
 * The single surface the React UI AND the AI tool-call layer (Phase 5) both
 * drive. Sits on top of GridRenderer (visual) + AudioEngine (sound) and adds:
 *   - chord builder with localStorage persistence
 *   - sequential progression playback
 *   - playMode-aware tap/drag routing
 *   - onUserPlay subscription for UI / AI listeners
 *
 * Pure logic. Owns no DOM of its own — orchestrates the renderer + audio.
 */

import type { GridRenderer, HitCell } from './renderer';
import type { AudioEngine } from '../audio/engine';
import type { GridCoord, KeyMode } from '../core';
import {
  getPitchAt,
  generateChordPitchClasses,
  getDiatonicTetrads,
  keys,
} from '../core';

export type PlayMode = 'notes' | 'chord-builder' | 'auto-chord';

export interface HighlightOpts {
  /** CSS class to apply (default: 'cell-highlight'). */
  className?: string;
  /** Auto-clear after this many ms (default: persistent). */
  durationMs?: number;
}

export interface ProgressionStep {
  cells: GridCoord[];
  durationMs: number;
  label?: string;
}

export interface SavedChord {
  id: string;
  name: string;
  cells: GridCoord[];
  pitches: number[];
  createdAt: number;
}

export interface ChordBuilder {
  add(cell: GridCoord): void;
  remove(cell: GridCoord): void;
  clear(): void;
  play(durationMs?: number): Promise<void>;
  save(name: string): SavedChord;
  current(): GridCoord[];
  saved(): SavedChord[];
  onChange(cb: (cells: GridCoord[]) => void): () => void;
}

export interface ArgyleInstrument {
  highlight(cells: GridCoord[], opts?: HighlightOpts): void;
  /** Set the highlighted set to exactly these cells. Cells previously lit
   *  but not in `cells` fade out via the CSS transition; cells in `cells`
   *  not previously lit fade in. Common cells stay steady — primary API
   *  for voice-leading visualization across a progression. */
  setHighlight(cells: GridCoord[]): void;
  /** Return every visible/rendered cell whose pitch matches `midi`. Use
   *  this from chat tool calls so the highlight lands on ACTUALLY-rendered
   *  cells (the smallest-y-clone heuristic in tool-calls.ts often picked
   *  cells outside the visible diamond). */
  cellsForPitch(midi: number): GridCoord[];
  clearHighlight(): void;
  playChord(cells: GridCoord[], durationMs?: number): Promise<void>;
  playNote(cell: GridCoord, durationMs?: number): Promise<void>;
  playProgression(steps: ProgressionStep[]): Promise<void>;
  stopAll(): void;
  setKey(rootPitchClass: number, mode: KeyMode): void;
  setPlayMode(mode: PlayMode): void;
  getPlayMode(): PlayMode;
  builder: ChordBuilder;
  /** Called for every user-driven hit (tap or drag-into-cell). */
  onUserPlay(cb: (cells: GridCoord[]) => void): () => void;
  /** Internal: invoked by the gesture layer for each hit. */
  __handleUserHit(hit: HitCell): void;
}

export interface CreateInstrumentOpts {
  renderer: GridRenderer;
  audio: AudioEngine;
  originPitch: number;
  gridWidth: number;
  gridHeight: number;
  /** Override storage (tests inject a stub). Defaults to window.localStorage if present. */
  storage?: StorageLike | null;
  /** Override storage key. */
  storageKey?: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const DEFAULT_STORAGE_KEY = 'argyle.saved_chords';
const DEFAULT_NOTE_DURATION = 600;
const DEFAULT_CHORD_DURATION = 800;

/** Generate a uuid with a fallback for environments without crypto.randomUUID. */
function newId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // RFC4122-ish v4 fallback.
  const r = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `${r()}${r()}-${r()}-${r()}-${r()}-${r()}${r()}${r()}`;
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
      return ls ?? null;
    }
  } catch {
    // Some embedded contexts throw on access. Treat as unavailable.
  }
  return null;
}

function coordKey(c: GridCoord): string {
  return `${c.x},${c.y}`;
}

export function createInstrument(opts: CreateInstrumentOpts): ArgyleInstrument {
  const { renderer, audio, originPitch } = opts;
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const storageKey = opts.storageKey ?? DEFAULT_STORAGE_KEY;

  let playMode: PlayMode = 'notes';
  let rootPitchClass = 0;
  let keyMode: KeyMode = 'major';

  // Cancellation token for in-flight progressions.
  let progressionToken = 0;

  // ---- saved chords ----

  const savedList: SavedChord[] = (() => {
    if (!storage) return [];
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Loose runtime validation — drop malformed entries silently.
      return parsed.filter((e): e is SavedChord =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as SavedChord).id === 'string' &&
        typeof (e as SavedChord).name === 'string' &&
        Array.isArray((e as SavedChord).cells) &&
        Array.isArray((e as SavedChord).pitches) &&
        typeof (e as SavedChord).createdAt === 'number',
      );
    } catch {
      return [];
    }
  })();

  function persist(): void {
    if (!storage) return;
    try {
      storage.setItem(storageKey, JSON.stringify(savedList));
    } catch {
      // Quota exceeded / private mode: swallow.
    }
  }

  // ---- chord builder ----

  const builderCells: GridCoord[] = [];
  const onChangeCbs = new Set<(cells: GridCoord[]) => void>();

  function emitChange(): void {
    const snapshot = builderCells.map((c) => ({ x: c.x, y: c.y }));
    for (const cb of onChangeCbs) {
      try { cb(snapshot); } catch { /* listener error swallowed */ }
    }
  }

  function builderAdd(cell: GridCoord): void {
    const k = coordKey(cell);
    if (builderCells.some((c) => coordKey(c) === k)) return;
    builderCells.push({ x: cell.x, y: cell.y });
    emitChange();
  }

  function builderRemove(cell: GridCoord): void {
    const k = coordKey(cell);
    const idx = builderCells.findIndex((c) => coordKey(c) === k);
    if (idx < 0) return;
    builderCells.splice(idx, 1);
    emitChange();
  }

  function builderClear(): void {
    if (builderCells.length === 0) return;
    builderCells.length = 0;
    emitChange();
  }

  function pitchesFor(cells: readonly GridCoord[]): number[] {
    const pitches: number[] = [];
    for (const c of cells) {
      const info = getPitchAt(c.x, c.y, originPitch);
      if (info) pitches.push(info.pitch);
    }
    return pitches;
  }

  async function builderPlay(durationMs: number = DEFAULT_CHORD_DURATION): Promise<void> {
    const pitches = pitchesFor(builderCells);
    if (pitches.length === 0) return;
    const cellsSnap = builderCells.map((c) => ({ x: c.x, y: c.y }));
    renderer.highlightCells(cellsSnap, { durationMs });
    audio.tag('builder').playChord(pitches, durationMs);
    await sleep(durationMs);
  }

  function builderSave(name: string): SavedChord {
    const entry: SavedChord = {
      id: newId(),
      name,
      cells: builderCells.map((c) => ({ x: c.x, y: c.y })),
      pitches: pitchesFor(builderCells),
      createdAt: Date.now(),
    };
    savedList.push(entry);
    persist();
    return entry;
  }

  const builder: ChordBuilder = {
    add: builderAdd,
    remove: builderRemove,
    clear: builderClear,
    play: builderPlay,
    save: builderSave,
    current: () => builderCells.map((c) => ({ x: c.x, y: c.y })),
    saved: () => savedList.map((s) => ({ ...s, cells: s.cells.map((c) => ({ ...c })), pitches: [...s.pitches] })),
    onChange(cb) {
      onChangeCbs.add(cb);
      return () => { onChangeCbs.delete(cb); };
    },
  };

  // ---- user-play subscriptions ----

  const userPlayCbs = new Set<(cells: GridCoord[]) => void>();
  function emitUserPlay(cells: GridCoord[]): void {
    const snapshot = cells.map((c) => ({ x: c.x, y: c.y }));
    for (const cb of userPlayCbs) {
      try { cb(snapshot); } catch { /* swallow */ }
    }
  }

  // ---- auto-chord mapping ----

  /**
   * Map a tapped cell to the diatonic-tetrad chord rooted at that cell's
   * pitch class within the current key. If the tapped pitch class isn't
   * in the key, we fall back to the chord type at the nearest scale degree
   * (defaulting to a maj7 if no key info available).
   *
   * Returns the absolute MIDI pitches for the chord, voiced around the
   * tapped cell's octave.
   */
  function autoChordPitches(cell: GridCoord): number[] {
    const info = getPitchAt(cell.x, cell.y, originPitch);
    if (!info) return [];
    const tappedPc = info.pitch % 12;
    const keyDef = keys[keyMode];
    // Widen the readonly tuple of literal numbers so `.indexOf(number)` typechecks.
    const intervals: readonly number[] = keyDef.intervals;
    const interval = (((tappedPc - rootPitchClass) % 12) + 12) % 12;
    const degreeIdx = intervals.indexOf(interval);
    const tetrads = getDiatonicTetrads(keyMode);
    let chordType: string;
    if (degreeIdx >= 0 && degreeIdx < tetrads.length) {
      chordType = tetrads[degreeIdx] ?? 'maj7';
    } else {
      // Out-of-key tap: best-effort dom7 voicing on the tapped pitch.
      chordType = 'dom7';
    }
    const pcs = generateChordPitchClasses(tappedPc, chordType);
    // Voice each interval above the tapped pitch (climbing).
    const root = info.pitch;
    const voiced: number[] = [];
    let cursor = root;
    for (const pc of pcs) {
      // Find smallest pitch >= cursor with this pitch class.
      let p = cursor;
      while (p % 12 !== pc) p++;
      voiced.push(p);
      cursor = p;
    }
    return voiced;
  }

  // ---- public methods ----

  function instrumentHighlight(cells: GridCoord[], opts?: HighlightOpts): void {
    renderer.highlightCells(cells, opts);
  }

  function instrumentSetHighlight(cells: GridCoord[]): void {
    renderer.setHighlight(cells);
  }

  function instrumentCellsForPitch(midi: number): GridCoord[] {
    return renderer.cellsForPitch(midi);
  }

  function instrumentClearHighlight(): void {
    renderer.clearHighlights();
  }

  async function instrumentPlayChord(
    cells: GridCoord[],
    durationMs: number = DEFAULT_CHORD_DURATION,
  ): Promise<void> {
    const pitches = pitchesFor(cells);
    if (pitches.length === 0) return;
    renderer.highlightCells(cells, { durationMs });
    audio.tag('cells-chord').playChord(pitches, durationMs);
    await sleep(durationMs);
  }

  async function instrumentPlayNote(
    cell: GridCoord,
    durationMs: number = DEFAULT_NOTE_DURATION,
  ): Promise<void> {
    const info = getPitchAt(cell.x, cell.y, originPitch);
    if (!info) return;
    renderer.highlightCells([cell], { durationMs });
    audio.tag('cells-note').playNote(info.pitch, durationMs);
    await sleep(durationMs);
  }

  async function instrumentPlayProgression(steps: ProgressionStep[]): Promise<void> {
    progressionToken++;
    const myToken = progressionToken;
    for (const step of steps) {
      if (myToken !== progressionToken) return; // cancelled
      const pitches = pitchesFor(step.cells);
      if (pitches.length === 0) {
        await sleep(step.durationMs);
        continue;
      }
      // setHighlight (not highlightCells) so common notes between adjacent
      // steps stay steady — voice leading is visible.
      renderer.setHighlight(step.cells);
      audio.tag('progression').playChord(pitches, step.durationMs);
      await sleep(step.durationMs);
      if (myToken !== progressionToken) return;
      // Don't clear here — next iteration's setHighlight handles the diff
      // (cells that drop out fade via the CSS transition, common cells
      // stay lit, new cells fade in).
    }
    // Final step: fade everything out at end of progression.
    renderer.setHighlight([]);
  }

  function instrumentStopAll(): void {
    progressionToken++; // invalidate any in-flight progression
    audio.stopAll();
    renderer.clearHighlights();
  }

  function instrumentSetKey(pc: number, mode: KeyMode): void {
    rootPitchClass = ((pc % 12) + 12) % 12;
    keyMode = mode;
    renderer.setKey(rootPitchClass, mode);
  }

  function instrumentSetPlayMode(mode: PlayMode): void {
    playMode = mode;
    renderer.setPlayMode(mode);
  }

  // ---- gesture routing ----

  function handleUserHit(hit: HitCell): void {
    const cell: GridCoord = { x: hit.gx, y: hit.gy };
    if (playMode === 'notes') {
      audio.tag('user-tap').playNote(hit.pitch);
      emitUserPlay([cell]);
      return;
    }
    if (playMode === 'chord-builder') {
      builderAdd(cell);
      emitUserPlay([cell]);
      return;
    }
    if (playMode === 'auto-chord') {
      const pitches = autoChordPitches(cell);
      if (pitches.length > 0) {
        audio.tag('auto-chord').playChord(pitches, DEFAULT_CHORD_DURATION);
        // Highlight just the root cell; resolving chord-cell coords across
        // clones is out of scope for this pass.
        renderer.highlightCells([cell], { durationMs: DEFAULT_CHORD_DURATION });
      }
      emitUserPlay([cell]);
      return;
    }
  }

  return {
    highlight: instrumentHighlight,
    setHighlight: instrumentSetHighlight,
    cellsForPitch: instrumentCellsForPitch,
    clearHighlight: instrumentClearHighlight,
    playChord: instrumentPlayChord,
    playNote: instrumentPlayNote,
    playProgression: instrumentPlayProgression,
    stopAll: instrumentStopAll,
    setKey: instrumentSetKey,
    setPlayMode: instrumentSetPlayMode,
    getPlayMode: () => playMode,
    builder,
    onUserPlay(cb) {
      userPlayCbs.add(cb);
      return () => { userPlayCbs.delete(cb); };
    },
    __handleUserHit: handleUserHit,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
