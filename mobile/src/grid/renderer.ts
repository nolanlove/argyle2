/**
 * Imperative diamond-grid DOM renderer for the mobile build.
 *
 * Owns its own DOM under a host element. React never re-renders cells —
 * `GridRenderer` rebuilds on layout / key change, mutates classes for
 * highlights, and exposes `cellAt()` for the gesture layer.
 *
 * Geometry note (corner-inclusive visibility):
 * The diamond at grid cell (gx, gy), after the container's -45° rotation
 * around the grid center, sits at screen offset
 *   rx = (√2/2) * cellSize * (a + b)
 *   ry = (√2/2) * cellSize * (b - a)
 * with a = gx + 0.5 - W/2, b = gy + 0.5 - H/2.
 * The rotated cell is a diamond of half-diagonal `halfDiag = cellSize/√2`
 * along each screen axis. The visible rectangle is [-rectW/2, rectW/2] ×
 * [-rectH/2, rectH/2].
 *
 * Distance from the diamond's center to the closest point on the rectangle is
 *   dx = max(0, |rx| - rectW/2)
 *   dy = max(0, |ry| - rectH/2)
 * A diamond `{(u,v): |u|+|v| ≤ r}` overlaps the rectangle iff (dx + dy) ≤ r
 * (L1 distance ≤ L1 radius). The cell's diamond half-extent under L1 is
 * `halfDiag * √2 = cellSize`. So the corner-inclusive condition is:
 *
 *     dx + dy < halfDiag * Math.SQRT2     (equivalently: dx + dy < cellSize)
 *
 * The frozen desktop uses `dx < halfDiag && dy < halfDiag` (an L∞ test on
 * the half-diagonal, not on the bounding box). That clips a diamond at each
 * of the rectangle's 4 corners. The L1 test above restores them. See
 * `tests/grid-geometry.test.ts` for the regression guard.
 */

import {
  getPitchAt,
  pitchClassToNote,
  noteToPitchClass,
  musicalNotes,
  keys,
} from '../core';
import type { Midi, GridCoord, KeyMode } from '../core';
import type { AudioEngine } from '../audio/engine';

export type PlayMode = 'notes' | 'chord-builder' | 'auto-chord';

export interface GridRendererOpts {
  host: HTMLElement;
  gridWidth: number;
  gridHeight: number;
  originPitch: Midi;
  /** Held so we can wire highlight-driven playback in future passes. */
  audio: AudioEngine;
}

export interface HighlightOpts {
  className?: string;
  durationMs?: number;
}

export interface HitCell {
  gx: number;
  gy: number;
  pitch: Midi;
}

interface CellRecord {
  el: HTMLDivElement;
  gx: number;
  gy: number;
  pitch: Midi;
}

const DEFAULT_HIGHLIGHT_CLASS = 'cell-highlight';

/** Corner-inclusive visibility predicate. Exported for the geometry test. */
export function isCellVisibleL1(
  gx: number,
  gy: number,
  gridWidth: number,
  gridHeight: number,
  cellSize: number,
  rectW: number,
  rectH: number,
): boolean {
  const halfDiag = cellSize * Math.SQRT1_2;
  const cgx = gridWidth / 2;
  const cgy = gridHeight / 2;
  const a = gx + 0.5 - cgx;
  const b = gy + 0.5 - cgy;
  const rx = Math.SQRT1_2 * cellSize * (a + b);
  const ry = Math.SQRT1_2 * cellSize * (b - a);
  const dx = Math.max(0, Math.abs(rx) - rectW / 2);
  const dy = Math.max(0, Math.abs(ry) - rectH / 2);
  // L1 test: dx + dy < halfDiag * √2  (== cellSize). Restores the four
  // corner diamonds the desktop's per-axis test excludes.
  return dx + dy < halfDiag * Math.SQRT2;
}

/** The desktop's (over-clipping) test. Used only by the regression test. */
export function isCellVisibleLinf(
  gx: number,
  gy: number,
  gridWidth: number,
  gridHeight: number,
  cellSize: number,
  rectW: number,
  rectH: number,
): boolean {
  const halfDiag = cellSize * Math.SQRT1_2;
  const cgx = gridWidth / 2;
  const cgy = gridHeight / 2;
  const a = gx + 0.5 - cgx;
  const b = gy + 0.5 - cgy;
  const rx = Math.SQRT1_2 * cellSize * (a + b);
  const ry = Math.SQRT1_2 * cellSize * (b - a);
  const dx = Math.max(0, Math.abs(rx) - rectW / 2);
  const dy = Math.max(0, Math.abs(ry) - rectH / 2);
  return dx < halfDiag && dy < halfDiag;
}

export class GridRenderer {
  private host: HTMLElement;
  private gridWidth: number;
  private gridHeight: number;
  private originPitch: Midi;
  // Held for future highlight-driven playback; not removed under
  // noUnusedParameters because we accept it via constructor opts.
  private audio: AudioEngine;

  private container: HTMLDivElement;
  private viewport: HTMLDivElement;
  // (gx, gy) → cell record. Sparse: only cells inside the visibility rect.
  private cells = new Map<string, CellRecord>();

  private cellSize = 44;
  private rectW = 0;
  private rectH = 0;
  private minZoom = 0.4;

  private rootPitchClass = 0; // C
  private keyMode: KeyMode = 'major';
  private keyPitchClasses = new Set<number>();
  // Reserved for future per-mode rendering (chord-builder badges etc.).
  // Held as state so prop changes don't trigger a rebuild if only mode flips.
  // @ts-expect-error -- intentionally unused for now; consumed by future passes.
  private playMode: PlayMode = 'notes';

  private resizeObserver: ResizeObserver | null = null;
  private pendingClears = new Map<HTMLElement, number>();

  constructor(opts: GridRendererOpts) {
    this.host = opts.host;
    this.gridWidth = opts.gridWidth;
    this.gridHeight = opts.gridHeight;
    this.originPitch = opts.originPitch;
    this.audio = opts.audio;
    void this.audio; // silence unused; held for future passes.

    // Host is the gesture-target / clipping viewport. The inner `viewport`
    // div is what the gesture layer transforms (rotate + scale + translate).
    // Splitting them keeps gesture math independent of host layout.
    this.host.style.position = 'relative';
    this.host.style.overflow = 'hidden';
    // Do NOT set `pointer-events: none` here. Per gotcha (1), `display:contents`
    // parents leak pointer-events:none on iOS — but here host is `block`, so
    // we only need to make sure descendants stay tappable.
    this.host.style.touchAction = 'none';

    this.viewport = document.createElement('div');
    this.viewport.className = 'grid-viewport';
    this.viewport.style.position = 'absolute';
    this.viewport.style.top = '50%';
    this.viewport.style.left = '50%';
    // Gesture layer mutates this transform; do NOT add `!important` rules
    // for it in CSS (gotcha 2).
    this.viewport.style.transform = 'translate(-50%, -50%) rotate(-45deg) scale(1)';
    this.viewport.style.transformOrigin = 'center center';
    this.viewport.style.willChange = 'transform';
    this.host.appendChild(this.viewport);

    this.container = document.createElement('div');
    this.container.className = 'grid-container';
    this.container.style.display = 'grid';
    this.container.style.gap = '1px';
    this.container.style.background = 'transparent';
    this.container.style.pointerEvents = 'auto';
    this.viewport.appendChild(this.container);

    this.refreshKey();
    this.measureAndLayout();
    this.setupResizeObserver();
  }

  // ---------------- public API ----------------

  setKey(rootPitchClass: number, mode: KeyMode): void {
    if (
      rootPitchClass === this.rootPitchClass &&
      mode === this.keyMode
    ) return;
    this.rootPitchClass = ((rootPitchClass % 12) + 12) % 12;
    this.keyMode = mode;
    this.refreshKey();
    this.applyKeyStyling();
  }

  setPlayMode(mode: PlayMode): void {
    this.playMode = mode;
    // Currently visual styling is the same across modes; reserved for future.
  }

  /** Add a transient highlight class to the cells, optionally auto-clearing. */
  highlightCells(coords: readonly GridCoord[], opts: HighlightOpts = {}): void {
    const cls = opts.className ?? DEFAULT_HIGHLIGHT_CLASS;
    const ms = opts.durationMs;
    for (const { x, y } of coords) {
      const rec = this.cells.get(key(x, y));
      if (!rec) continue;
      rec.el.classList.add(cls);
      // Clear any in-flight auto-clear for this element so the latest
      // highlight call wins (avoids leftover timers stomping a fresh hit).
      const pending = this.pendingClears.get(rec.el);
      if (pending !== undefined) window.clearTimeout(pending);
      this.pendingClears.delete(rec.el);
      if (ms && ms > 0) {
        const handle = window.setTimeout(() => {
          rec.el.classList.remove(cls);
          this.pendingClears.delete(rec.el);
        }, ms);
        this.pendingClears.set(rec.el, handle);
      }
    }
  }

  clearHighlights(className: string = DEFAULT_HIGHLIGHT_CLASS): void {
    for (const rec of this.cells.values()) {
      rec.el.classList.remove(className);
    }
    for (const handle of this.pendingClears.values()) {
      window.clearTimeout(handle);
    }
    this.pendingClears.clear();
  }

  /**
   * Find ALL rendered cells (visible on the grid) that play this MIDI
   * pitch. There can be multiple "clones" of the same pitch on the
   * isomorphic grid — this returns every one currently in the DOM.
   * Empty if the pitch isn't rendered (out of grid range or filtered
   * by the corner-inclusive visibility test).
   */
  cellsForPitch(midi: number): GridCoord[] {
    const out: GridCoord[] = [];
    for (const rec of this.cells.values()) {
      if (rec.pitch === midi) out.push({ x: rec.gx, y: rec.gy });
    }
    return out;
  }

  /**
   * Set the highlighted cells to EXACTLY this set — cells that were lit and
   * aren't in `coords` lose the class (and animate out via the CSS
   * transition on .cell-highlight); cells that weren't lit and are now in
   * `coords` gain the class. Cells in both sets are left alone so common
   * notes between adjacent chords don't visibly blink.
   *
   * This is the primary API for chord-progression visualization — every
   * step in a progression calls setHighlight with that step's cells, and
   * voice leading becomes visible: stable common notes stay lit, dropped
   * notes fade, new notes light up.
   */
  setHighlight(coords: readonly GridCoord[], className: string = DEFAULT_HIGHLIGHT_CLASS): void {
    const wantKeys = new Set<string>();
    for (const { x, y } of coords) wantKeys.add(key(x, y));
    for (const [k, rec] of this.cells) {
      const has = rec.el.classList.contains(className);
      const want = wantKeys.has(k);
      if (want && !has) {
        // Cancel any pending auto-clear so it doesn't strip us mid-step.
        const pending = this.pendingClears.get(rec.el);
        if (pending !== undefined) window.clearTimeout(pending);
        this.pendingClears.delete(rec.el);
        rec.el.classList.add(className);
      } else if (!want && has) {
        rec.el.classList.remove(className);
      }
    }
  }

  /**
   * Hit-test a client point. Walks up from elementFromPoint to the cell
   * carrying `data-gx`/`data-gy`. Returns null if the point isn't on a cell.
   */
  cellAt(clientX: number, clientY: number): HitCell | null {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    let node: HTMLElement | null = el as HTMLElement;
    while (node && node !== this.host) {
      if (node.dataset && node.dataset['gx'] !== undefined && node.dataset['gy'] !== undefined) {
        const gx = Number(node.dataset['gx']);
        const gy = Number(node.dataset['gy']);
        const rec = this.cells.get(key(gx, gy));
        if (rec) return { gx, gy, pitch: rec.pitch };
        return null;
      }
      node = node.parentElement;
    }
    return null;
  }

  /** Apply a new viewport transform (rotate -45° baked in). */
  setTransform(scale: number, tx: number, ty: number): void {
    const clamped = Math.max(this.minZoom, Math.min(3.0, scale));
    this.viewport.style.transform =
      `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) rotate(-45deg) scale(${clamped})`;
  }

  /** Current minimum zoom (so gestures can clamp). */
  getMinZoom(): number {
    return this.minZoom;
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    for (const handle of this.pendingClears.values()) {
      window.clearTimeout(handle);
    }
    this.pendingClears.clear();
    this.cells.clear();
    this.host.removeChild(this.viewport);
  }

  // ---------------- internals ----------------

  private setupResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => this.measureAndLayout());
    this.resizeObserver.observe(this.host);
  }

  private measureAndLayout(): void {
    const rect = this.host.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);

    // Pick a cell size that gives roughly 6 cells along the shorter axis at
    // 1x zoom. Tuned to feel right on a phone (~60–70px cells on a 390px
    // wide viewport).
    const target = Math.min(w, h) / 6;
    this.cellSize = Math.max(36, Math.min(96, Math.round(target)));

    // Min zoom such that the rotated 20×20 grid still covers the viewport.
    // The rotated grid is a diamond whose half-diagonal along screen axes
    // is gridWidth * cellSize / √2. We need that to span the viewport's
    // half-diagonal (w+h)/2 so cells exist in every corner at min zoom.
    const diamondHalfDiag = (this.gridWidth * this.cellSize) / Math.SQRT2;
    const canvasReach = (w + h) / 2;
    const minZoomFloor = canvasReach / diamondHalfDiag;
    this.minZoom = Math.max(0.4, Math.min(0.95, minZoomFloor + 0.02));

    // Pre-scale the visible rect by 1/minZoom so cells already exist in the
    // DOM when the user pinches all the way out — we never re-render on zoom.
    const slack = 1 / this.minZoom;
    this.rectW = Math.round(w * slack);
    this.rectH = Math.round(h * slack);

    this.rebuildCells();
  }

  private refreshKey(): void {
    const def = keys[this.keyMode];
    this.keyPitchClasses = new Set(
      def.intervals.map((iv) => (this.rootPitchClass + iv) % 12),
    );
  }

  private rebuildCells(): void {
    this.cells.clear();
    this.container.innerHTML = '';

    const dims = { w: this.gridWidth, h: this.gridHeight };
    const cs = this.cellSize;
    this.container.style.gridTemplateColumns = `repeat(${dims.w}, ${cs}px)`;
    this.container.style.gridTemplateRows = `repeat(${dims.h}, ${cs}px)`;
    this.container.style.width = `${dims.w * cs + (dims.w - 1)}px`;
    this.container.style.height = `${dims.h * cs + (dims.h - 1)}px`;

    // Render bottom-up so origin is bottom-left (matches desktop convention).
    for (let displayY = 0; displayY < dims.h; displayY++) {
      const actualY = dims.h - 1 - displayY;
      for (let x = 0; x < dims.w; x++) {
        const visible = isCellVisibleL1(
          x, displayY, dims.w, dims.h, cs, this.rectW, this.rectH,
        );
        if (!visible) {
          // Keep grid slot occupied with a hidden placeholder so the grid
          // layout indices line up.
          const ph = document.createElement('div');
          ph.style.visibility = 'hidden';
          this.container.appendChild(ph);
          continue;
        }
        const pitchInfo = getPitchAt(x, actualY, this.originPitch);
        if (!pitchInfo) {
          const ph = document.createElement('div');
          ph.style.visibility = 'hidden';
          this.container.appendChild(ph);
          continue;
        }

        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.style.width = `${cs}px`;
        cell.style.height = `${cs}px`;
        cell.style.display = 'flex';
        cell.style.alignItems = 'center';
        cell.style.justifyContent = 'center';
        cell.style.borderRadius = '2px';
        cell.style.background = '#e5e7eb';
        cell.style.color = '#0f172a';
        cell.style.fontFamily = "'Inter', -apple-system, sans-serif";
        cell.style.fontWeight = '600';
        cell.style.userSelect = 'none';
        // Per gotcha 1: explicit pointer-events:auto on tappable descendants
        // so iOS Safari can't strip it via a `display:contents` ancestor.
        cell.style.pointerEvents = 'auto';

        cell.dataset['gx'] = String(x);
        cell.dataset['gy'] = String(actualY);
        cell.dataset['pitch'] = String(pitchInfo.pitch);

        // Counter-rotate the label so it reads upright despite -45° parent.
        const label = document.createElement('span');
        label.className = 'grid-cell-label';
        label.style.transform = 'rotate(45deg)';
        label.style.display = 'inline-block';
        label.style.pointerEvents = 'none';
        label.style.fontSize = `${Math.max(9, Math.floor(cs * 0.32))}px`;
        label.textContent = musicalNotes[pitchInfo.pitch % 12]!;
        cell.appendChild(label);

        this.container.appendChild(cell);
        this.cells.set(key(x, actualY), {
          el: cell, gx: x, gy: actualY, pitch: pitchInfo.pitch,
        });
      }
    }
    this.applyKeyStyling();
  }

  private applyKeyStyling(): void {
    for (const rec of this.cells.values()) {
      const pc = rec.pitch % 12;
      const inKey = this.keyPitchClasses.has(pc);
      const isRoot = pc === this.rootPitchClass;
      if (isRoot) {
        rec.el.style.background = '#3b82f6';
        rec.el.style.color = '#ffffff';
      } else if (inKey) {
        rec.el.style.background = '#c7d4e8';
        rec.el.style.color = '#0f172a';
      } else {
        rec.el.style.background = '#e5e7eb';
        rec.el.style.color = '#64748b';
      }
    }
  }
}

function key(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

// Re-export for convenience in tests that want to compare both predicates.
export const __test__ = {
  isCellVisibleL1,
  isCellVisibleLinf,
};

// Silence "unused" on imports that are part of the future API surface.
void pitchClassToNote;
void noteToPitchClass;
