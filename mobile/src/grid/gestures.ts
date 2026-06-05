/**
 * Touch / pointer gesture layer for the diamond grid.
 *
 * Multi-touch is the default: every finger that lands on a cell plays that
 * cell's note independently, so a chord is just several fingers tapping
 * different cells at once. Each finger also glides — when it crosses into a
 * new cell it re-triggers, so two fingers sweeping the grid play a moving
 * two-note line.
 *
 * Responsibilities:
 *   - per-finger tap: hit-test → play note (fires onTap on touchstart, NOT
 *     mousedown — gotcha #4). N fingers down = N simultaneous notes.
 *   - per-finger drag: continuous melody; fires onDrag when that finger
 *     crosses into a new cell.
 *   - two-finger pinch: scales the renderer's viewport (zoom).
 *   - two-finger pan: translates the renderer's viewport.
 *
 * Reconciling polyphony with pinch/pan: a two-finger gesture starts as two
 * independent note taps. Only once the fingers move far enough to clearly be
 * a viewport gesture (inter-finger distance change for a pinch, or a shared
 * translation for a pan, past TRANSFORM_THRESHOLD_PX) do we commit to a
 * transform and stop those fingers from playing. Because chord taps are
 * (near-)stationary, they register as notes before any threshold trips. Three
 * or more fingers is always pure polyphony — only an *exactly* two-finger drag
 * can zoom/pan.
 *
 * preventDefault is scoped — only called when a touch lands on / moves over a
 * cell, or while actively transforming (so a future toolbar inside `host`
 * keeps native tap behavior).
 *
 * Uses raw Touch events because the desktop reference works and pointer
 * coalescence on iOS Safari can drop gesturechange-style updates.
 */

import type { GridRenderer, HitCell } from './renderer';
import type { AudioEngine } from '../audio/engine';

/**
 * How far (px) two fingers must move before a two-finger gesture is
 * reclassified from "two notes" to a viewport pinch/pan. Large enough that a
 * chord tap with a little jitter stays a chord; small enough that a deliberate
 * pinch feels responsive.
 */
const TRANSFORM_THRESHOLD_PX = 24;

export interface GridGesturesOpts {
  host: HTMLElement;
  renderer: GridRenderer;
  audio: AudioEngine;
  onTap?: (cell: HitCell) => void;
  onDrag?: (cell: HitCell) => void;
  /**
   * If true (default), gestures plays the tapped note via `audio.playNote`
   * directly on touchstart. Set false when a higher-level instrument owns
   * playback and routes through onTap/onDrag instead.
   */
  autoPlayOnHit?: boolean;
}

/** Anchor for a two-finger gesture (captured when 2 fingers are present). */
interface TwoFingerState {
  startDist: number;
  startMidX: number;
  startMidY: number;
  startScale: number;
  startTx: number;
  startTy: number;
}

export class GridGestures {
  private host: HTMLElement;
  private renderer: GridRenderer;
  private audio: AudioEngine;
  private onTap?: (cell: HitCell) => void;
  private onDrag?: (cell: HitCell) => void;
  private autoPlayOnHit: boolean;

  // Active note-playing fingers: touch id → last cell key it played ("gx,gy").
  // Every entry is a finger that landed on a cell and is gliding melodically.
  private notes = new Map<number, string>();

  // Two-finger anchor (captured whenever exactly 2 fingers are down) and
  // whether we've committed to a viewport pinch/pan with them.
  private twoFinger: TwoFingerState | null = null;
  private transforming = false;

  // Current applied transform (so we can mutate from gestures).
  private scale = 1;
  private tx = 0;
  private ty = 0;

  // Bound handlers (so removeEventListener works).
  private boundTouchStart: (e: TouchEvent) => void;
  private boundTouchMove: (e: TouchEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;
  // Mouse fallback for desktop dev.
  private boundMouseDown: (e: MouseEvent) => void;

  constructor(opts: GridGesturesOpts) {
    this.host = opts.host;
    this.renderer = opts.renderer;
    this.audio = opts.audio;
    this.onTap = opts.onTap;
    this.onDrag = opts.onDrag;
    this.autoPlayOnHit = opts.autoPlayOnHit ?? true;

    this.boundTouchStart = (e) => this.handleTouchStart(e);
    this.boundTouchMove = (e) => this.handleTouchMove(e);
    this.boundTouchEnd = (e) => this.handleTouchEnd(e);
    this.boundMouseDown = (e) => this.handleMouseDown(e);

    // passive:false because we conditionally preventDefault inside.
    this.host.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    this.host.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    this.host.addEventListener('touchend', this.boundTouchEnd, { passive: false });
    this.host.addEventListener('touchcancel', this.boundTouchEnd, { passive: false });
    this.host.addEventListener('mousedown', this.boundMouseDown);
  }

  destroy(): void {
    this.host.removeEventListener('touchstart', this.boundTouchStart);
    this.host.removeEventListener('touchmove', this.boundTouchMove);
    this.host.removeEventListener('touchend', this.boundTouchEnd);
    this.host.removeEventListener('touchcancel', this.boundTouchEnd);
    this.host.removeEventListener('mousedown', this.boundMouseDown);
  }

  // -------- handlers --------

  private handleTouchStart(e: TouchEvent): void {
    // Each new finger that lands on a cell plays its note immediately — even
    // while other fingers are already down, so a chord is just several fingers
    // landing on different cells. While a viewport transform is in progress we
    // suppress new note starts so a third finger doesn't blip mid-zoom.
    if (!this.transforming) {
      for (const t of Array.from(e.changedTouches)) {
        const hit = this.renderer.cellAt(t.clientX, t.clientY);
        if (!hit) continue;
        // Scoped preventDefault: only when the finger is on a cell.
        e.preventDefault();
        this.notes.set(t.identifier, cellKey(hit));
        // Play immediately on touchstart, not on the synthesized mousedown
        // (gotcha #4: synthesized mousedown only fires at tap-end).
        this.firePlay(hit);
        this.onTap?.(hit);
      }
    }

    // Maintain the two-finger anchor. Exactly two fingers arms pinch/pan
    // detection; any other count cancels it (3+ fingers stays pure polyphony).
    this.syncTwoFinger(e.touches);
  }

  private handleTouchMove(e: TouchEvent): void {
    // 1. Committed pinch/pan owns the gesture.
    if (this.transforming && this.twoFinger && e.touches.length === 2) {
      this.applyTwoFinger(e.touches[0]!, e.touches[1]!);
      e.preventDefault();
      return;
    }

    // 2. Exactly two fingers down but not yet classified: decide whether this
    //    is still two notes gliding or has become a viewport pinch/pan.
    if (!this.transforming && this.twoFinger && e.touches.length === 2) {
      const t0 = e.touches[0]!;
      const t1 = e.touches[1]!;
      const d = dist(t0, t1);
      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;
      const distDelta = Math.abs(d - this.twoFinger.startDist);
      const midDelta = Math.hypot(midX - this.twoFinger.startMidX, midY - this.twoFinger.startMidY);
      if (Math.max(distDelta, midDelta) > TRANSFORM_THRESHOLD_PX) {
        // Commit to a viewport transform: stop these fingers from playing and
        // re-anchor at the current positions so the viewport tracks smoothly
        // from here (no jump by the threshold distance).
        this.transforming = true;
        this.notes.clear();
        this.captureTwoFinger(t0, t1);
        this.applyTwoFinger(t0, t1);
        e.preventDefault();
        return;
      }
      // Below threshold — fall through and let each finger glide as a note.
    }

    // 3. Note glide: every active note-finger that crosses into a new cell
    //    re-triggers. Multiple fingers gliding = a moving chord.
    let played = false;
    for (const t of Array.from(e.changedTouches)) {
      if (!this.notes.has(t.identifier)) continue;
      const hit = this.renderer.cellAt(t.clientX, t.clientY);
      if (!hit) continue;
      const k = cellKey(hit);
      if (this.notes.get(t.identifier) === k) continue;
      this.notes.set(t.identifier, k);
      this.firePlay(hit);
      this.onDrag?.(hit);
      played = true;
    }
    if (played) e.preventDefault();
  }

  private handleTouchEnd(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      this.notes.delete(t.identifier);
    }
    // End any transform once fewer than two fingers remain; otherwise re-arm
    // the two-finger anchor for whatever fingers are still down.
    if (e.touches.length < 2) {
      this.transforming = false;
    }
    this.syncTwoFinger(e.touches);
  }

  private handleMouseDown(e: MouseEvent): void {
    // Desktop dev convenience only; touch path covers real iOS.
    const hit = this.renderer.cellAt(e.clientX, e.clientY);
    if (!hit) return;
    this.firePlay(hit);
    this.onTap?.(hit);
  }

  // -------- two-finger helpers --------

  /** Arm/refresh or clear the two-finger anchor based on finger count. */
  private syncTwoFinger(touches: TouchList): void {
    if (touches.length === 2) {
      // Re-anchor only while not mid-transform (a committed transform keeps
      // its own anchor until it ends).
      if (!this.transforming) this.captureTwoFinger(touches[0]!, touches[1]!);
    } else {
      this.twoFinger = null;
      if (touches.length < 2) this.transforming = false;
    }
  }

  private captureTwoFinger(t0: Touch, t1: Touch): void {
    this.twoFinger = {
      startDist: dist(t0, t1),
      startMidX: (t0.clientX + t1.clientX) / 2,
      startMidY: (t0.clientY + t1.clientY) / 2,
      startScale: this.scale,
      startTx: this.tx,
      startTy: this.ty,
    };
  }

  private applyTwoFinger(t0: Touch, t1: Touch): void {
    const b = this.twoFinger;
    if (!b) return;
    const d = dist(t0, t1);
    const midX = (t0.clientX + t1.clientX) / 2;
    const midY = (t0.clientY + t1.clientY) / 2;
    const min = this.renderer.getMinZoom();
    const rawScale = b.startScale * (d / Math.max(1, b.startDist));
    this.scale = clamp(rawScale, min, 3.0);
    this.tx = b.startTx + (midX - b.startMidX);
    this.ty = b.startTy + (midY - b.startMidY);
    this.renderer.setTransform(this.scale, this.tx, this.ty);
  }

  private firePlay(hit: HitCell): void {
    // Visual feedback fires on every tap/drag-into-cell regardless of who
    // owns audio playback (autoPlayOnHit=false routes audio through the
    // instrument layer, but the user still deserves a flash).
    this.renderer.highlightCells(
      [{ x: hit.gx, y: hit.gy }],
      { className: 'cell-flash', durationMs: 350 },
    );
    if (!this.autoPlayOnHit) return;
    if (this.audio.isReady()) {
      this.audio.playNote(hit.pitch);
    }
  }
}

function cellKey(hit: HitCell): string {
  return `${hit.gx},${hit.gy}`;
}

function dist(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
