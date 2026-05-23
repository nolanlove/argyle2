/**
 * Touch / pointer gesture layer for the diamond grid.
 *
 * Responsibilities:
 *   - one-finger tap: hit-test → play note (fires onTap on touchstart, NOT
 *     mousedown — gotcha #4).
 *   - one-finger drag: continuous melody; fires onDrag when finger crosses
 *     into a new cell.
 *   - two-finger pinch: scales the renderer's viewport.
 *   - two-finger pan: translates the renderer's viewport.
 *
 * preventDefault is scoped — only called when the touch lands on a cell (so
 * a future toolbar inside `host` keeps native tap behavior).
 *
 * Uses raw Touch events because the desktop reference works and pointer
 * coalescence on iOS Safari can drop gesturechange-style updates.
 */

import type { GridRenderer, HitCell } from './renderer';
import type { AudioEngine } from '../audio/engine';

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

  // Single-finger drag tracking.
  private activeTouchId: number | null = null;
  private lastDragKey: string | null = null;

  // Two-finger state.
  private pinch: TwoFingerState | null = null;

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
    const touches = e.touches;

    if (touches.length === 2) {
      // Begin pinch / two-finger pan. Cancel any in-flight single-finger drag.
      this.activeTouchId = null;
      this.lastDragKey = null;
      const t0 = touches[0]!;
      const t1 = touches[1]!;
      this.pinch = {
        startDist: dist(t0, t1),
        startMidX: (t0.clientX + t1.clientX) / 2,
        startMidY: (t0.clientY + t1.clientY) / 2,
        startScale: this.scale,
        startTx: this.tx,
        startTy: this.ty,
      };
      // Prevent the page from scrolling/zooming during a two-finger gesture.
      e.preventDefault();
      return;
    }

    if (touches.length === 1 && !this.pinch) {
      const t = touches[0]!;
      const hit = this.renderer.cellAt(t.clientX, t.clientY);
      if (!hit) return;
      // Scoped preventDefault (per gotcha at end of brief): only when on cell.
      e.preventDefault();
      this.activeTouchId = t.identifier;
      this.lastDragKey = `${hit.gx},${hit.gy}`;
      // Play immediately on touchstart, not on the synthesized mousedown
      // (gotcha #4: synthesized mousedown only fires at tap-end).
      this.firePlay(hit);
      this.onTap?.(hit);
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (this.pinch && e.touches.length >= 2) {
      const t0 = e.touches[0]!;
      const t1 = e.touches[1]!;
      const d = dist(t0, t1);
      const midX = (t0.clientX + t1.clientX) / 2;
      const midY = (t0.clientY + t1.clientY) / 2;
      const min = this.renderer.getMinZoom();
      const rawScale = this.pinch.startScale * (d / Math.max(1, this.pinch.startDist));
      this.scale = clamp(rawScale, min, 3.0);
      this.tx = this.pinch.startTx + (midX - this.pinch.startMidX);
      this.ty = this.pinch.startTy + (midY - this.pinch.startMidY);
      this.renderer.setTransform(this.scale, this.tx, this.ty);
      e.preventDefault();
      return;
    }

    if (this.activeTouchId === null) return;
    const t = findTouch(e.changedTouches, this.activeTouchId)
      ?? findTouch(e.touches, this.activeTouchId);
    if (!t) return;
    const hit = this.renderer.cellAt(t.clientX, t.clientY);
    if (!hit) return;
    const k = `${hit.gx},${hit.gy}`;
    if (k === this.lastDragKey) return;
    this.lastDragKey = k;
    this.firePlay(hit);
    this.onDrag?.(hit);
    e.preventDefault();
  }

  private handleTouchEnd(e: TouchEvent): void {
    // End pinch when fewer than 2 fingers remain.
    if (this.pinch && e.touches.length < 2) {
      this.pinch = null;
    }
    if (this.activeTouchId !== null) {
      const stillThere = findTouch(e.touches, this.activeTouchId);
      if (!stillThere) {
        this.activeTouchId = null;
        this.lastDragKey = null;
      }
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    // Desktop dev convenience only; touch path covers real iOS.
    const hit = this.renderer.cellAt(e.clientX, e.clientY);
    if (!hit) return;
    this.firePlay(hit);
    this.onTap?.(hit);
  }

  private firePlay(hit: HitCell): void {
    if (!this.autoPlayOnHit) return;
    if (this.audio.isReady()) {
      this.audio.playNote(hit.pitch);
    }
  }
}

function dist(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function findTouch(list: TouchList, id: number): Touch | null {
  for (let i = 0; i < list.length; i++) {
    const t = list.item(i);
    if (t && t.identifier === id) return t;
  }
  return null;
}
