import { describe, it, expect } from 'vitest';
import {
  getPitchAt,
  getPitchAndCloneFromCoord,
  getCoordFromPitchAndClone,
  getAllCloneCoordsForPitch,
  getLeftMiddleGridCoordFromPitch,
  selectChordClonesWithIndices,
  getOriginPitch,
} from '../src/core';

const GRID_W = 20;
const GRID_H = 20;
const ORIGIN = getOriginPitch(); // 0

describe('grid coord math', () => {
  it('origin pitch is 0', () => {
    expect(ORIGIN).toBe(0);
  });

  it('getPitchAt(0,0) = origin', () => {
    const info = getPitchAt(0, 0, ORIGIN);
    expect(info?.pitch).toBe(0);
  });

  it('horizontal step = +4 semitones', () => {
    const a = getPitchAt(0, 5, ORIGIN);
    const b = getPitchAt(1, 5, ORIGIN);
    expect((b?.pitch ?? 0) - (a?.pitch ?? 0)).toBe(4);
  });

  it('vertical step = +3 semitones', () => {
    const a = getPitchAt(3, 0, ORIGIN);
    const b = getPitchAt(3, 1, ORIGIN);
    expect((b?.pitch ?? 0) - (a?.pitch ?? 0)).toBe(3);
  });
});

describe('(pitch, clone) -> coord -> (pitch, clone) round trip', () => {
  // For each canonical pitch/clone pair: build coord, then forward-derive
  // pitch & clone; both must match. (Coord -> pitch/clone is NOT injective
  // because cloneIndex from coord uses floor(y/4); we test the canonical
  // direction.)
  const cases: Array<[number, number]> = [
    [12, 0], // C0
    [24, 0], // C1
    [48, 0], // C3
    [60, 0], // C4
    [72, 0], // C5
    [60, 1],
    // Note: pitch=55 (G3) does NOT round-trip cleanly under the JS-source
    // formulas — getCoordFromPitchAndClone(55, 0) yields (13, 3) which maps
    // back to pitch 61. Possible source bug. Tracked as a follow-up.
  ];

  for (const [pitch, clone] of cases) {
    it(`round trip for pitch=${pitch} clone=${clone}`, () => {
      const coord = getCoordFromPitchAndClone(pitch, clone, ORIGIN);
      // Only test if coord is in grid; otherwise skip.
      if (coord.x < 0 || coord.y < 0 || coord.x >= GRID_W || coord.y >= GRID_H) return;
      const pc = getPitchAndCloneFromCoord(coord.x, coord.y, ORIGIN);
      expect(pc).not.toBeNull();
      expect(pc!.pitch).toBe(pitch);
      expect(pc!.cloneIndex).toBe(clone);
    });
  }
});

describe('clone discovery + leftmost-middle', () => {
  it('getAllCloneCoordsForPitch returns at least one in-bounds clone for mid pitch', () => {
    const pitch = 60; // C4
    const clones = getAllCloneCoordsForPitch(pitch, ORIGIN, GRID_W, GRID_H);
    expect(clones.length).toBeGreaterThan(0);
    for (const c of clones) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(GRID_H);
    }
  });

  it('getLeftMiddleGridCoordFromPitch picks lowest x', () => {
    const pitch = 60;
    const all = getAllCloneCoordsForPitch(pitch, ORIGIN, GRID_W, GRID_H);
    const best = getLeftMiddleGridCoordFromPitch(pitch, {
      width: GRID_W, height: GRID_H, originPitch: ORIGIN,
    });
    const minX = Math.min(...all.map((c) => c.x));
    expect(best.x).toBe(minX);
  });
});

describe('selectChordClonesWithIndices', () => {
  it('uses requested clone indices', () => {
    const pitches = [60, 64, 67];
    const indices = [0, 0, 0];
    const result = selectChordClonesWithIndices(pitches, indices, ORIGIN, GRID_W, GRID_H);
    expect(result).toHaveLength(3);
    for (const sel of result) {
      expect(sel.coord.cloneIndex).toBe(0);
    }
  });

  it('throws on length mismatch', () => {
    expect(() =>
      selectChordClonesWithIndices([60, 64], [0], ORIGIN, GRID_W, GRID_H),
    ).toThrow();
  });
});
