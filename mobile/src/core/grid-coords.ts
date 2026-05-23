/**
 * Isomorphic diamond grid coordinate math.
 *
 * Horizontal step = +4 semitones (major third).
 * Vertical step = +3 semitones (minor third).
 *
 * Cloned notes (octave duplicates) shift by (x-3, y+4) per clone.
 *
 * Ported verbatim from `/static/pitch-utils.js`. Math is preserved — including
 * negative-offset behavior of `Math.floor(pitchOffset / 12)` for pitches below
 * the origin, and the "+4 fallback" in calculateChromaticPosition.
 */

import type { PitchClass, Midi, PitchAtResult } from './pitches';
import {
  getPitchAt,
  getPitchFromNote,
  pitchClassToNote,
  noteToPitchClass,
  getNoteFromPitch,
} from './pitches';
import { getDiatonicTetrads } from './chords';
import type {
  GridCoord,
  CloneCoord,
  CoordWithOctave,
  GetPitchAtFn,
} from './grid-types';

export type { GridCoord, CloneCoord, CoordWithOctave };

// ---------- semitone -> base coord lookup ----------

interface SemitoneCoord {
  x: number;
  y: number;
  octaveOffset: number;
}

function calculateSemitoneMapping(): Readonly<Record<number, SemitoneCoord>> {
  const mapping: Record<number, SemitoneCoord> = {};
  // x:0..2, y:0..3 yields exactly the 12 semitones of an octave.
  for (let x = 0; x < 3; x++) {
    for (let y = 0; y < 4; y++) {
      const semitones = x * 4 + y * 3;
      const semitoneInOctave = semitones % 12;
      if (mapping[semitoneInOctave] === undefined) {
        mapping[semitoneInOctave] = {
          x, y, octaveOffset: semitones >= 12 ? 1 : 0,
        };
      }
    }
  }
  return mapping;
}

const SEMITONE_TO_COORD = calculateSemitoneMapping();

// ---------- main API ----------

/**
 * Get all visible clone coordinates for a given absolute pitch.
 * Each clone shifts by (x-3, y+4) from the previous one. Stops when out of
 * grid bounds.
 */
export function getAllCloneCoordsForPitch(
  pitch: Midi,
  originPitch: number,
  gridWidth: number,
  gridHeight: number,
): CloneCoord[] {
  const pitchOffset = pitch - originPitch;
  // The JS source uses raw `%` and `Math.floor` here. For non-negative
  // pitchOffset this matches a positive modulo; for negative offsets it
  // doesn't, but the original behavior is preserved.
  const semitoneInOctave = pitchOffset % 12;
  const baseCoord = SEMITONE_TO_COORD[semitoneInOctave];
  if (!baseCoord) {
    console.warn(`No coordinate mapping found for semitone ${semitoneInOctave}`);
    return [];
  }

  const clone0X = baseCoord.x + ((Math.floor(pitchOffset / 12) - baseCoord.octaveOffset) * 3);
  const clone0Y = baseCoord.y;

  const clones: CloneCoord[] = [];
  let cloneIndex = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const x = clone0X - 3 * cloneIndex;
    const y = clone0Y + 4 * cloneIndex;
    if (x < 0 || y >= gridHeight) break;
    clones.push({ x, y, cloneIndex });
    cloneIndex++;
  }
  // Note: gridWidth is unused in JS source loop — preserved.
  void gridWidth;
  return clones;
}

export interface PitchAndClone {
  pitch: Midi;
  cloneIndex: number;
}

export function getPitchAndCloneFromCoord(
  x: number,
  y: number,
  originPitch: number,
): PitchAndClone | null {
  const pitchInfo = getPitchAt(x, y, originPitch);
  if (!pitchInfo) return null;
  return { pitch: pitchInfo.pitch, cloneIndex: Math.floor(y / 4) };
}

export function getCoordFromPitchAndClone(
  pitch: Midi,
  cloneIndex: number,
  originPitch: number,
): GridCoord {
  const pitchOffset = pitch - originPitch;
  return {
    x: Math.floor(pitchOffset / 4) - 3 * cloneIndex,
    y: (pitchOffset % 4) + 4 * cloneIndex,
  };
}

// ---------- clone selection ----------

export interface SelectedClone {
  pitch: Midi;
  coord: CloneCoord;
}

/**
 * Pick a clone for each pitch by Manhattan distance to the previous selected
 * clone. First pitch uses the first available clone (or preferred index).
 */
export function selectChordClonesManhattan(
  pitches: readonly Midi[],
  originPitch: number,
  gridWidth: number,
  gridHeight: number,
  preferredCloneIndices: readonly (number | undefined)[] | null = null,
): SelectedClone[] {
  const selectedClones: SelectedClone[] = [];

  for (let i = 0; i < pitches.length; i++) {
    const pitch = pitches[i]!;
    const allClones = getAllCloneCoordsForPitch(pitch, originPitch, gridWidth, gridHeight);
    if (allClones.length === 0) {
      console.warn(`No clones found for pitch ${pitch}`);
      continue;
    }

    let bestClone: CloneCoord = allClones[0]!;

    if (preferredCloneIndices && preferredCloneIndices[i] !== undefined) {
      const preferredIndex = preferredCloneIndices[i]!;
      const preferredClone = allClones.find((c) => c.cloneIndex === preferredIndex);
      if (preferredClone) {
        bestClone = preferredClone;
      } else {
        console.warn(
          `Preferred clone index ${preferredIndex} not found for pitch ${pitch}, using default`,
        );
      }
    } else if (i > 0 && selectedClones.length > 0) {
      const prevCoord = selectedClones[i - 1]!.coord;
      let minDistance = Infinity;
      for (const clone of allClones) {
        const distance = Math.abs(clone.x - prevCoord.x) + Math.abs(clone.y - prevCoord.y);
        if (distance < minDistance) {
          minDistance = distance;
          bestClone = clone;
        }
      }
    }

    selectedClones.push({ pitch, coord: bestClone });
  }

  return selectedClones;
}

export function selectChordClonesWithIndices(
  pitches: readonly Midi[],
  cloneIndices: readonly number[],
  originPitch: number,
  gridWidth: number,
  gridHeight: number,
): SelectedClone[] {
  if (pitches.length !== cloneIndices.length) {
    throw new Error('Pitches and clone indices arrays must have the same length');
  }
  const selectedClones: SelectedClone[] = [];

  for (let i = 0; i < pitches.length; i++) {
    const pitch = pitches[i]!;
    const targetCloneIndex = cloneIndices[i]!;
    const allClones = getAllCloneCoordsForPitch(pitch, originPitch, gridWidth, gridHeight);
    if (allClones.length === 0) {
      console.warn(`No clones found for pitch ${pitch}`);
      continue;
    }
    const targetClone = allClones.find((c) => c.cloneIndex === targetCloneIndex);
    if (!targetClone) {
      console.warn(
        `Clone index ${targetCloneIndex} not found for pitch ${pitch}, using first available`,
      );
      selectedClones.push({ pitch, coord: allClones[0]! });
    } else {
      selectedClones.push({ pitch, coord: targetClone });
    }
  }
  return selectedClones;
}

// ---------- tonic + chromatic placement ----------

export interface TonicCoordinates {
  octave3: CloneCoord;
  octave4: CloneCoord;
  octave5: CloneCoord;
}

/**
 * Compute tonic positions in 3 octaves (3, 4, 5) by stepping +3x per octave.
 *
 * Note: JS source ignores `keyType` here; we keep the parameter for API parity.
 */
export function calculateTonicCoordinates(
  tonicNote: string,
  _keyType: string,
  gridWidth: number,
  gridHeight: number,
  originPitch: number,
): TonicCoordinates {
  const tonicPitch = getPitchFromNote(tonicNote, 3);
  if (tonicPitch === null) {
    throw new Error(`Could not get pitch for tonic note: ${tonicNote}`);
  }
  const gridFormat = { width: gridWidth, height: gridHeight, originPitch };
  const octave3Coord = getLeftMiddleGridCoordFromPitch(tonicPitch, gridFormat);
  const octave4Coord: CloneCoord = {
    x: octave3Coord.x + 3, y: octave3Coord.y, cloneIndex: octave3Coord.cloneIndex,
  };
  const octave5Coord: CloneCoord = {
    x: octave3Coord.x + 6, y: octave3Coord.y, cloneIndex: octave3Coord.cloneIndex,
  };
  return { octave3: octave3Coord, octave4: octave4Coord, octave5: octave5Coord };
}

const CHROMATIC_PLACEMENT_RULES: readonly GridCoord[] = [
  { x: 0, y: 0 },   // root
  { x: 1, y: -1 },  // +1
  { x: 2, y: -2 },  // +2
  { x: 0, y: 1 },   // +3
  { x: 1, y: 0 },   // +4
  { x: 2, y: -1 },  // +5
  { x: 3, y: -2 },  // +6
  { x: 1, y: 1 },   // +7
  { x: 2, y: 0 },   // +8
  { x: 3, y: -1 },  // +9
  { x: 4, y: -2 },  // +10
  { x: 2, y: 1 },   // +11
];

export function calculateChromaticPosition(
  baseCoord: GridCoord,
  chromaticOffset: number,
  gridWidth: number,
  gridHeight: number,
): GridCoord {
  const rule = CHROMATIC_PLACEMENT_RULES[chromaticOffset];
  if (!rule) return baseCoord;
  const calculatedCoord: GridCoord = {
    x: baseCoord.x + rule.x,
    y: baseCoord.y + rule.y,
  };
  if (
    calculatedCoord.x < 0 || calculatedCoord.y < 0 ||
    calculatedCoord.x >= gridWidth || calculatedCoord.y >= gridHeight
  ) {
    const adjustedCoord: GridCoord = {
      x: calculatedCoord.x,
      y: calculatedCoord.y + 4,
    };
    if (adjustedCoord.y >= gridHeight) return baseCoord;
    return adjustedCoord;
  }
  return calculatedCoord;
}

// ---------- chord button position layout ----------

export interface ChordButtonPosition {
  note: string;
  chordType: string;
  coord: GridCoord;
}

export interface ChordButtonPositions {
  octave3: ChordButtonPosition[];
  octave4: ChordButtonPosition[];
  octave5: ChordButtonPosition[];
}

export function calculateAllChordButtonPositions(
  tonicCoord: GridCoord,
  keyNotes: readonly string[],
  chordTypesArr: readonly string[],
  gridWidth: number,
  gridHeight: number,
  _originPitch: number,
): ChordButtonPositions {
  const positions: ChordButtonPositions = { octave3: [], octave4: [], octave5: [] };
  const tonicOctave3 = tonicCoord;
  const tonicOctave4: GridCoord = { x: tonicCoord.x + 3, y: tonicCoord.y };
  const tonicOctave5: GridCoord = { x: tonicCoord.x + 6, y: tonicCoord.y };

  const tonicNoteIndex = noteToPitchClass(keyNotes[0] ?? '');
  if (tonicNoteIndex === -1) {
    throw new Error(`Tonic note not found in musical notes: ${keyNotes[0]}`);
  }

  for (let octave = 3; octave <= 5; octave++) {
    const baseCoord =
      octave === 3 ? tonicOctave3 : octave === 4 ? tonicOctave4 : tonicOctave5;

    for (let buttonIndex = 0; buttonIndex < 10; buttonIndex++) {
      const keyDegree = buttonIndex + 1;
      const keyNoteIndex = (keyDegree - 1) % keyNotes.length;
      const note = keyNotes[keyNoteIndex]!;
      const pitchClass = noteToPitchClass(note);
      if (pitchClass === -1) continue;
      const chromaticOffset = (pitchClass - tonicNoteIndex + 12) % 12;
      const coord = calculateChromaticPosition(baseCoord, chromaticOffset, gridWidth, gridHeight);
      const chordType = chordTypesArr[buttonIndex] ?? 'maj7';
      const entry: ChordButtonPosition = { note, chordType, coord };
      if (octave === 3) positions.octave3.push(entry);
      else if (octave === 4) positions.octave4.push(entry);
      else positions.octave5.push(entry);
    }
  }
  return positions;
}

export function calculateAllChordButtonPositionsFromPitchClasses(
  tonicPitchClass: PitchClass,
  keyPitchClasses: readonly PitchClass[],
  _chordsRecord: unknown,
  gridWidth: number,
  gridHeight: number,
  originPitch: number,
): ChordButtonPositions {
  const positions: ChordButtonPositions = { octave3: [], octave4: [], octave5: [] };

  const tonicNote = pitchClassToNote(tonicPitchClass, false);
  if (tonicNote === null) return positions;
  const tonicCoord = calculateTonicCoordinates(tonicNote, 'major', gridWidth, gridHeight, originPitch);
  const tonicOctave3 = tonicCoord.octave3;
  const tonicOctave4 = tonicCoord.octave4;
  const tonicOctave5 = tonicCoord.octave5;

  for (let octave = 3; octave <= 5; octave++) {
    const baseCoord =
      octave === 3 ? tonicOctave3 : octave === 4 ? tonicOctave4 : tonicOctave5;

    for (let buttonIndex = 0; buttonIndex < 10; buttonIndex++) {
      const keyDegree = buttonIndex + 1;
      const keyPitchClassIndex = (keyDegree - 1) % keyPitchClasses.length;
      const keyPitchClass = keyPitchClasses[keyPitchClassIndex]!;
      const chromaticOffset = (((keyPitchClass - tonicPitchClass) % 12) + 12) % 12;
      const coord = calculateChromaticPosition(baseCoord, chromaticOffset, gridWidth, gridHeight);
      const chordType = getDiatonicTetrads('major')[buttonIndex] ?? 'maj7';
      const note = pitchClassToNote(keyPitchClass, false)!;
      const entry: ChordButtonPosition = { note, chordType, coord };
      if (octave === 3) positions.octave3.push(entry);
      else if (octave === 4) positions.octave4.push(entry);
      else positions.octave5.push(entry);
    }
  }
  return positions;
}

// ---------- note coord lookups ----------

/**
 * Get all coordinates that correspond to a specific note name.
 *
 * Note: JS source took `getPitchAt` as a parameter (which is shadowing). We
 * preserve that surface so the desktop call sites map cleanly, but pass the
 * default by reference if you don't have a custom one.
 */
export function getCoordinatesForNote(
  note: string,
  getPitchAtFn: GetPitchAtFn,
  originPitch: number,
  gridWidth: number,
  gridHeight: number,
): CoordWithOctave[] {
  const coordinates: CoordWithOctave[] = [];
  if (!note) return coordinates;

  for (let octave = 2; octave <= 5; octave++) {
    const pitch = getPitchFromNote(note, octave);
    if (pitch === null) continue;
    const allClones = getAllCloneCoordsForPitch(pitch, originPitch, gridWidth, gridHeight);
    allClones.forEach(({ x, y, cloneIndex }) => {
      if (x >= 0 && x < gridWidth && y >= 0 && y < gridHeight) {
        const actualPitch = getPitchAtFn(x, y, originPitch);
        if (!actualPitch) return;
        coordinates.push({ x, y, octave: actualPitch.octave, cloneIndex });
      }
    });
  }
  return coordinates;
}

/**
 * Get all 12 notes mapped to their coordinate arrays.
 *
 * The JS source took two callbacks; we keep the surface but the second
 * (`indexToNote`) was unused in the source, so we ignore it here too.
 */
export function getAllNoteCoordinates(
  getCoordinatesForNoteFn: (note: string) => CoordWithOctave[],
  _indexToNote?: unknown,
): Record<string, CoordWithOctave[]> {
  const noteMap: Record<string, CoordWithOctave[]> = {};
  for (let i = 0; i < 12; i++) {
    const note = pitchClassToNote(i, false);
    if (note === null) continue;
    noteMap[note] = getCoordinatesForNoteFn(note);
  }
  return noteMap;
}

/**
 * All unique pitches on the grid (as `Note<Octave>` strings).
 *
 * Source uses an outer `originPitch` variable name (not a param) — that was a
 * scoping bug in the JS file. Here we require originPitch as the 5th argument
 * (added to fix; behavior otherwise identical).
 */
export function getAllGridPitches(
  getPitchAtFn: GetPitchAtFn,
  getNoteFromPitchFn: typeof getNoteFromPitch,
  gridWidth: number,
  gridHeight: number,
  originPitch: number,
): string[] {
  let minPitch = Infinity;
  let maxPitch = -Infinity;
  for (let displayY = 0; displayY < gridHeight; displayY++) {
    const actualY = gridHeight - 1 - displayY;
    for (let x = 0; x < gridWidth; x++) {
      const pitch = getPitchAtFn(x, actualY, originPitch);
      if (!pitch) continue;
      minPitch = Math.min(minPitch, pitch.pitch);
      maxPitch = Math.max(maxPitch, pitch.pitch);
    }
  }
  const pitches: string[] = [];
  for (let pitch = minPitch; pitch <= maxPitch; pitch++) {
    const noteInfo = getNoteFromPitchFn(pitch, false);
    if (!noteInfo) continue;
    pitches.push(`${noteInfo.note}${noteInfo.octave}`);
  }
  return pitches;
}

export function getCoordinatesForNoteInOctave(
  note: string,
  targetOctave: number,
  originPitch: number,
  gridWidth: number,
  gridHeight: number,
): GridCoord[] {
  const pitch = getPitchFromNote(note, targetOctave);
  if (pitch === null) return [];
  const allClones = getAllCloneCoordsForPitch(pitch, originPitch, gridWidth, gridHeight);
  return allClones
    .filter(({ x, y }) => x >= 0 && x < gridWidth && y >= 0 && y < gridHeight)
    .map(({ x, y }) => ({ x, y }));
}

export interface GridFormat {
  width: number;
  height: number;
  originPitch: number;
}

/**
 * Find the leftmost coordinate (lowest x) for a given pitch, breaking ties by
 * proximity to the vertical middle of the grid.
 */
export function getLeftMiddleGridCoordFromPitch(
  pitch: Midi,
  gridFormat: GridFormat,
): CloneCoord {
  const { width, height, originPitch } = gridFormat;
  const allCoords = getAllCloneCoordsForPitch(pitch, originPitch, width, height);
  if (allCoords.length === 0) {
    throw new Error(`No coordinates found for pitch ${pitch}`);
  }
  const middleY = (height - 1) / 2;
  let bestCoord: CloneCoord = allCoords[0]!;
  let minX = Infinity;
  let minDistanceToMiddleY = Infinity;
  for (const coord of allCoords) {
    if (coord.x < minX) {
      minX = coord.x;
      minDistanceToMiddleY = Math.abs(coord.y - middleY);
      bestCoord = coord;
    } else if (coord.x === minX) {
      const distanceToMiddleY = Math.abs(coord.y - middleY);
      if (distanceToMiddleY < minDistanceToMiddleY) {
        minDistanceToMiddleY = distanceToMiddleY;
        bestCoord = coord;
      }
    }
  }
  return bestCoord;
}

// Re-export helper types used by chords.ts.
export type { PitchAtResult };
