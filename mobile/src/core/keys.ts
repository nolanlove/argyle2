/**
 * Key/scale primitives: key definitions, key signatures, sharps-vs-flats,
 * scale generation, key-degree lookups.
 *
 * Ported verbatim from `/static/pitch-utils.js`.
 */

import type { PitchClass, Midi } from './pitches';
import {
  pitchClassToNote,
  noteToPitchClass,
  pitchClassesToNotes,
  validatePitch,
  validatePitchClass,
} from './pitches';

// ---------- key data ----------

export interface KeyDef {
  readonly name: string;
  readonly intervals: readonly number[];
}

export const keys = {
  major: { name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  'natural-minor': { name: 'Natural Minor (Aeolian)', intervals: [0, 2, 3, 5, 7, 8, 10] },
  'harmonic-minor': { name: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
  'melodic-minor': { name: 'Melodic Minor', intervals: [0, 2, 3, 5, 7, 9, 11] },

  dorian: { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
  locrian: { name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10] },

  'major-pentatonic': { name: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9] },
  'minor-pentatonic': { name: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10] },
  blues: { name: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },

  chromatic: { name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  'whole-tone': { name: 'Whole Tone', intervals: [0, 2, 4, 6, 8, 10] },
  diminished: { name: 'Diminished (Octatonic)', intervals: [0, 2, 3, 5, 6, 8, 9, 11] },

  'hungarian-minor': { name: 'Hungarian Minor', intervals: [0, 2, 3, 6, 7, 8, 11] },
  'hungarian-major': { name: 'Hungarian Major', intervals: [0, 3, 4, 6, 7, 9, 10] },
  persian: { name: 'Persian', intervals: [0, 1, 4, 5, 6, 8, 11] },
  byzantine: { name: 'Byzantine', intervals: [0, 1, 4, 5, 7, 8, 11] },
  arabic: { name: 'Arabic', intervals: [0, 1, 4, 5, 7, 8, 10] },
  egyptian: { name: 'Egyptian', intervals: [0, 2, 5, 7, 10] },
  japanese: { name: 'Japanese (In)', intervals: [0, 1, 5, 7, 8] },
  chinese: { name: 'Chinese (Pentatonic)', intervals: [0, 2, 4, 7, 9] },

  'bebop-major': { name: 'Bebop Major', intervals: [0, 2, 4, 5, 7, 8, 9, 11] },
  'bebop-dominant': { name: 'Bebop Dominant', intervals: [0, 2, 4, 5, 7, 9, 10, 11] },
  'bebop-minor': { name: 'Bebop Minor', intervals: [0, 2, 3, 5, 7, 8, 9, 10] },
  'lydian-dominant': { name: 'Lydian Dominant', intervals: [0, 2, 4, 6, 7, 9, 10] },
  altered: { name: 'Altered', intervals: [0, 1, 3, 4, 6, 8, 10] },
  'locrian-natural2': { name: 'Locrian Natural 2', intervals: [0, 2, 3, 5, 6, 8, 10] },

  'neapolitan-major': { name: 'Neapolitan Major', intervals: [0, 1, 3, 5, 7, 9, 11] },
  'neapolitan-minor': { name: 'Neapolitan Minor', intervals: [0, 1, 3, 5, 7, 8, 11] },

  enigmatic: { name: 'Enigmatic', intervals: [0, 1, 4, 6, 8, 10, 11] },
  'double-harmonic': { name: 'Double Harmonic', intervals: [0, 1, 4, 5, 7, 8, 11] },
  overtone: { name: 'Overtone', intervals: [0, 2, 4, 6, 7, 9, 10] },
  'leading-whole-tone': { name: 'Leading Whole Tone', intervals: [0, 2, 4, 6, 8, 10, 11] },
  augmented: { name: 'Augmented', intervals: [0, 3, 4, 7, 8, 11] },
  prometheus: { name: 'Prometheus', intervals: [0, 2, 4, 6, 9, 10] },
  tritone: { name: 'Tritone', intervals: [0, 1, 4, 6, 7, 10] },
} as const satisfies Record<string, KeyDef>;

export type KeyMode = keyof typeof keys;

/** Generic key record signature so consumers can pass external key dictionaries. */
export type KeyRecord = Readonly<Record<string, KeyDef>>;

// ---------- validation ----------

export function validateKeyType(keyType: unknown): keyType is KeyMode {
  if (!keyType || typeof keyType !== 'string') {
    console.warn('🎵 [PITCH] Invalid key type:', keyType);
    return false;
  }
  if (!(keyType in keys)) {
    console.warn('🎵 [PITCH] Unknown key type:', keyType);
    return false;
  }
  return true;
}

// ---------- key signature ----------

export type AccidentalType = '#' | 'b';

export interface Accidental {
  note: string;
  type: AccidentalType;
}

export interface KeySignature {
  accidentals: Accidental[];
}

const MAJOR_KEY_SIGNATURES: Readonly<Record<string, KeySignature>> = {
  C: { accidentals: [] },
  G: { accidentals: [{ note: 'F', type: '#' }] },
  D: { accidentals: [{ note: 'F', type: '#' }, { note: 'C', type: '#' }] },
  A: { accidentals: [{ note: 'F', type: '#' }, { note: 'C', type: '#' }, { note: 'G', type: '#' }] },
  E: { accidentals: [{ note: 'F', type: '#' }, { note: 'C', type: '#' }, { note: 'G', type: '#' }, { note: 'D', type: '#' }] },
  B: { accidentals: [{ note: 'F', type: '#' }, { note: 'C', type: '#' }, { note: 'G', type: '#' }, { note: 'D', type: '#' }, { note: 'A', type: '#' }] },
  'F#': { accidentals: [{ note: 'F', type: '#' }, { note: 'C', type: '#' }, { note: 'G', type: '#' }, { note: 'D', type: '#' }, { note: 'A', type: '#' }, { note: 'E', type: '#' }] },
  F: { accidentals: [{ note: 'B', type: 'b' }] },
  Bb: { accidentals: [{ note: 'B', type: 'b' }, { note: 'E', type: 'b' }] },
  Eb: { accidentals: [{ note: 'B', type: 'b' }, { note: 'E', type: 'b' }, { note: 'A', type: 'b' }] },
  Ab: { accidentals: [{ note: 'B', type: 'b' }, { note: 'E', type: 'b' }, { note: 'A', type: 'b' }, { note: 'D', type: 'b' }] },
  Db: { accidentals: [{ note: 'B', type: 'b' }, { note: 'E', type: 'b' }, { note: 'A', type: 'b' }, { note: 'D', type: 'b' }, { note: 'G', type: 'b' }] },
  Gb: { accidentals: [{ note: 'B', type: 'b' }, { note: 'E', type: 'b' }, { note: 'A', type: 'b' }, { note: 'D', type: 'b' }, { note: 'G', type: 'b' }, { note: 'C', type: 'b' }] },
  Cb: { accidentals: [{ note: 'B', type: 'b' }, { note: 'E', type: 'b' }, { note: 'A', type: 'b' }, { note: 'D', type: 'b' }, { note: 'G', type: 'b' }, { note: 'C', type: 'b' }, { note: 'F', type: 'b' }] },
};

const ENHARMONIC_EQUIVALENTS: Readonly<Record<string, string>> = {
  'D#': 'Eb', 'G#': 'Ab', 'A#': 'Bb', 'C#': 'Db', 'F#': 'Gb',
};

const MINOR_RELATIVE_MAJORS: Readonly<Record<string, string>> = {
  a: 'C', e: 'G', b: 'D', 'f#': 'A', 'c#': 'E', 'g#': 'B', 'd#': 'F#',
  d: 'F', g: 'Bb', c: 'Eb', f: 'Ab', bb: 'Db', eb: 'Gb', ab: 'Cb',
};

/**
 * Get the key signature for a given root pitch class + key type.
 * Returns `{ accidentals: [] }` for unknown / mode-not-handled cases.
 */
export function getKeySignature(
  rootPitchClass: PitchClass,
  keyType: string,
): KeySignature {
  const rootNote = pitchClassToNote(rootPitchClass, false);
  if (rootNote === null) return { accidentals: [] };

  if (keyType === 'major') {
    const equivalent = ENHARMONIC_EQUIVALENTS[rootNote];
    const actualRootNote = equivalent ?? rootNote;
    return MAJOR_KEY_SIGNATURES[actualRootNote] ?? { accidentals: [] };
  }

  if (
    keyType === 'natural-minor' ||
    keyType === 'harmonic-minor' ||
    keyType === 'melodic-minor'
  ) {
    const relativeMajor = MINOR_RELATIVE_MAJORS[rootNote.toLowerCase()];
    if (!relativeMajor) return { accidentals: [] };
    return MAJOR_KEY_SIGNATURES[relativeMajor] ?? { accidentals: [] };
  }

  if (
    keyType === 'dorian' ||
    keyType === 'phrygian' ||
    keyType === 'locrian'
  ) {
    const relativeMajor = MINOR_RELATIVE_MAJORS[rootNote.toLowerCase()];
    if (!relativeMajor) return { accidentals: [] };
    return MAJOR_KEY_SIGNATURES[relativeMajor] ?? { accidentals: [] };
  }

  if (keyType === 'lydian' || keyType === 'mixolydian') {
    return MAJOR_KEY_SIGNATURES[rootNote] ?? { accidentals: [] };
  }

  return { accidentals: [] };
}

/** True if conventional notation for this key uses flats. */
export function shouldUseFlats(
  rootPitchClass: PitchClass,
  keyType: string,
): boolean {
  const sig = getKeySignature(rootPitchClass, keyType);
  return sig.accidentals.some((acc) => acc.type === 'b');
}

// ---------- interval names ----------

const INTERVAL_NAMES: Readonly<Record<number, string>> = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4',
  6: 'b5', 7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7',
};

export function getIntervalName(interval: number): string {
  return INTERVAL_NAMES[interval] ?? interval.toString();
}

// ---------- key membership ----------

export function isPitchClassInKey(
  pitchClass: PitchClass,
  rootPitchClass: PitchClass,
  keyType: string,
  keysRecord: KeyRecord = keys,
): boolean {
  const def = keysRecord[keyType];
  if (!def) return false;
  const intervalFromRoot = (((pitchClass - rootPitchClass) % 12) + 12) % 12;
  return def.intervals.includes(intervalFromRoot);
}

export function isPitchInKey(
  pitch: Midi,
  rootPitchClass: PitchClass,
  keyType: string,
  keysRecord: KeyRecord = keys,
): boolean {
  return isPitchClassInKey(pitch % 12, rootPitchClass, keyType, keysRecord);
}

// ---------- key generation ----------

export function generateKeyPitchClasses(
  rootPitchClass: PitchClass,
  keyType: string,
  keysRecord: KeyRecord = keys,
): PitchClass[] {
  const def = keysRecord[keyType];
  if (!def) return [];
  return def.intervals.map((interval) => (rootPitchClass + interval) % 12);
}

export function generateKeyNotes(
  rootPitchClass: PitchClass,
  keyType: string,
  keysRecord: KeyRecord = keys,
): Array<string | null> {
  const keyPCs = generateKeyPitchClasses(rootPitchClass, keyType, keysRecord);
  const useFlats = shouldUseFlats(rootPitchClass, keyType);
  return pitchClassesToNotes(keyPCs, useFlats);
}

// ---------- key degree ----------

export interface KeyDegreeResult {
  degree: number;
  intervalName: string;
}

export function getKeyDegreeFromPitchClass(
  pitchClass: PitchClass,
  rootPitchClass: PitchClass,
  _keyType: string,
  intervals: readonly number[] | undefined,
): KeyDegreeResult | null {
  if (!intervals) return null;
  const interval = (((pitchClass - rootPitchClass) % 12) + 12) % 12;
  const degreeIndex = intervals.indexOf(interval);
  if (degreeIndex === -1) return null;
  return { degree: degreeIndex + 1, intervalName: getIntervalName(interval) };
}

export function getKeyDegree(
  note: string,
  rootPitchClass: PitchClass,
  keyType: string,
  intervals: readonly number[] | undefined,
): KeyDegreeResult | null {
  const pitchClass = noteToPitchClass(note);
  if (pitchClass === -1) return null;
  return getKeyDegreeFromPitchClass(pitchClass, rootPitchClass, keyType, intervals);
}

// ---------- ascending scale pattern ----------

/**
 * Generate an ascending sequence of MIDI pitches for the given key.
 * Behavior matches JS source including the trailing tonic-in-final-octave
 * append (which is independent of the interval walk).
 */
export function generateAscendingScalePattern(
  rootPitchClass: PitchClass,
  keyType: string,
  keysRecord: KeyRecord = keys,
  startOctave: number = 2,
  numOctaves: number = 3,
): Midi[] {
  if (!validatePitchClass(rootPitchClass)) {
    console.warn('🎵 [PITCH] Invalid root pitch class:', rootPitchClass);
    return [];
  }
  if (!keyType || typeof keyType !== 'string' || !keysRecord[keyType]) {
    console.warn('🎵 [PITCH] Invalid key type:', keyType);
    return [];
  }
  if (!keysRecord || typeof keysRecord !== 'object') {
    console.warn('🎵 [PITCH] Invalid keys object:', keysRecord);
    return [];
  }

  let start = startOctave;
  if (typeof start !== 'number' || start < -1 || start > 9) {
    console.warn('🎵 [PITCH] Invalid start octave:', start);
    start = 2;
  }

  let num = numOctaves;
  if (typeof num !== 'number' || num < 1 || num > 8) {
    console.warn('🎵 [PITCH] Invalid number of octaves:', num);
    num = 3;
  }

  const keyData = keysRecord[keyType];
  if (!keyData?.intervals) {
    console.warn('🎵 [PITCH] Invalid key data for key type:', keyType);
    return [];
  }

  const pattern: Midi[] = [];
  let currentOctave = start;
  let lastPitchClass = rootPitchClass;

  for (let repeat = 0; repeat < num; repeat++) {
    keyData.intervals.forEach((interval) => {
      const pitchClass = (rootPitchClass + interval) % 12;
      if (pitchClass < lastPitchClass) currentOctave++;
      const pitch = currentOctave * 12 + pitchClass;
      if (validatePitch(pitch)) {
        pattern.push(pitch);
      } else {
        console.warn('🎵 [PITCH] Generated invalid pitch:', pitch, 'for interval:', interval);
      }
      lastPitchClass = pitchClass;
    });
  }

  const finalOctave = start + num;
  const finalPitch = finalOctave * 12 + rootPitchClass;
  if (validatePitch(finalPitch)) {
    pattern.push(finalPitch);
  } else {
    console.warn('🎵 [PITCH] Generated invalid final pitch:', finalPitch);
  }
  return pattern;
}

/** Generate an absolute MIDI pitch from note + octave. Throws on invalid note. */
export function generateNotePitch(note: string, octave: number = 3): Midi {
  const pitchClass = noteToPitchClass(note);
  if (pitchClass === -1) {
    throw new Error(`Invalid note: ${note}`);
  }
  return (octave + 1) * 12 + pitchClass;
}
