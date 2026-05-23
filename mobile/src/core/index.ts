/**
 * Music theory core. Pure functions (no DOM / audio). MIDI-based.
 *
 * Ported from `/static/pitch-utils.js` (frozen desktop). See per-file docs.
 */

export * from './utils';
export * from './pitches';
export * from './keys';
export * from './chords';
export * from './grid-coords';
export type { GridCoord, CloneCoord, CoordWithOctave, GetPitchAtFn, GetCoordinatesForNoteFn } from './grid-types';
