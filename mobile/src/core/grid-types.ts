/**
 * Shared grid type definitions.
 *
 * We use `{x: number; y: number}` (object form) rather than tuples because the
 * JS source always returned objects and many call sites rely on `.x` / `.y`.
 */

import type { Midi } from './pitches';
import type { PitchAtResult } from './pitches';

export interface GridCoord {
  x: number;
  y: number;
}

export interface CloneCoord extends GridCoord {
  cloneIndex: number;
}

export interface CoordWithOctave extends GridCoord {
  octave: number;
  cloneIndex: number;
}

/** Matches `getPitchAt` signature from pitches.ts. */
export type GetPitchAtFn = (
  x: number,
  y: number,
  originPitch: number,
) => PitchAtResult | null;

/** Matches `getCoordinatesForNote` shape (used by stackChordNotes etc.). */
export type GetCoordinatesForNoteFn = (note: string) => GridCoord[];

export type { Midi };
