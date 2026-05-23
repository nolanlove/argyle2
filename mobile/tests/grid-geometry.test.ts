/**
 * Regression guard for the corner-inclusive visibility test.
 *
 * The frozen desktop uses `dx < halfDiag && dy < halfDiag` (the L∞ test on
 * the rotated cell's half-diagonal). That misses a diamond at each of the
 * 4 corners of the visible rectangle. The mobile renderer uses the L1 test
 * `dx + dy < halfDiag * √2` (== `dx + dy < cellSize`), which restores them.
 *
 * Strategy: pick a layout, find the four corner regions, and assert that
 * AT LEAST ONE cell exists in each of the four quadrant-corners that is
 * accepted by L1 but rejected by L∞.
 */

import { describe, it, expect } from 'vitest';
import { isCellVisibleL1, isCellVisibleLinf } from '../src/grid/renderer';

const W = 20;
const H = 20;
const CELL = 60;
// Pick a rectangle smaller than the full rotated diamond bbox so corner
// clipping is meaningful but cells still exist along the diagonals.
const RECT_W = Math.round(W * CELL * 0.55);
const RECT_H = Math.round(H * CELL * 0.55);

interface Diff {
  l1Only: Array<{ gx: number; gy: number }>;
  both: number;
  linfOnly: Array<{ gx: number; gy: number }>;
}

function classify(): Diff {
  const l1Only: Diff['l1Only'] = [];
  const linfOnly: Diff['linfOnly'] = [];
  let both = 0;
  for (let gy = 0; gy < H; gy++) {
    for (let gx = 0; gx < W; gx++) {
      const l1 = isCellVisibleL1(gx, gy, W, H, CELL, RECT_W, RECT_H);
      const linf = isCellVisibleLinf(gx, gy, W, H, CELL, RECT_W, RECT_H);
      if (l1 && linf) both++;
      else if (l1 && !linf) l1Only.push({ gx, gy });
      else if (!l1 && linf) linfOnly.push({ gx, gy });
    }
  }
  return { l1Only, both, linfOnly };
}

/**
 * Map a grid cell back to its rotated screen offset (rx, ry). Used to bucket
 * a cell into one of the 4 rectangle-corner quadrants.
 */
function rotatedOffset(gx: number, gy: number): { rx: number; ry: number } {
  const cgx = W / 2;
  const cgy = H / 2;
  const a = gx + 0.5 - cgx;
  const b = gy + 0.5 - cgy;
  const rx = Math.SQRT1_2 * CELL * (a + b);
  const ry = Math.SQRT1_2 * CELL * (b - a);
  return { rx, ry };
}

describe('grid-geometry: corner-inclusive L1 visibility', () => {
  it('L∞ test never accepts cells that L1 rejects (L1 is a superset)', () => {
    const { linfOnly } = classify();
    expect(linfOnly).toEqual([]);
  });

  it('L1 test accepts strictly more cells than L∞ (corner diamonds restored)', () => {
    const { l1Only } = classify();
    expect(l1Only.length).toBeGreaterThan(0);
  });

  it('each of the 4 visible-rect corners has at least one L1-only cell', () => {
    const { l1Only } = classify();
    // Bucket each L1-only cell by which quadrant of the visible rect its
    // rotated center sits in. We require all 4 quadrants to be represented
    // — that's the geometric statement "diamond restored at every corner".
    const quadrants = { tr: 0, tl: 0, br: 0, bl: 0 };
    for (const { gx, gy } of l1Only) {
      const { rx, ry } = rotatedOffset(gx, gy);
      // Only count cells whose center is outside the rect along at least one
      // axis (those are the ones the L∞ test would have wrongly clipped).
      const outsideX = Math.abs(rx) > RECT_W / 2;
      const outsideY = Math.abs(ry) > RECT_H / 2;
      if (!outsideX && !outsideY) continue;
      if (rx >= 0 && ry >= 0) quadrants.tr++;
      else if (rx < 0 && ry >= 0) quadrants.tl++;
      else if (rx >= 0 && ry < 0) quadrants.br++;
      else quadrants.bl++;
    }
    expect(quadrants.tr).toBeGreaterThan(0);
    expect(quadrants.tl).toBeGreaterThan(0);
    expect(quadrants.br).toBeGreaterThan(0);
    expect(quadrants.bl).toBeGreaterThan(0);
  });

  it('center cell is visible under both tests (sanity)', () => {
    const gx = Math.floor(W / 2);
    const gy = Math.floor(H / 2);
    expect(isCellVisibleL1(gx, gy, W, H, CELL, RECT_W, RECT_H)).toBe(true);
    expect(isCellVisibleLinf(gx, gy, W, H, CELL, RECT_W, RECT_H)).toBe(true);
  });
});
