/**
 * Pitch / note name primitives.
 *
 * MIDI convention: C2 = 36, C4 = 60. Pitch classes are 0-11.
 *
 * Ported from `/static/pitch-utils.js` (frozen desktop). Math is preserved
 * verbatim including quirks (e.g. `Math.floor(pitchOffset / 12)` for negative
 * offsets — see `getAllCloneCoordsForPitch` in grid-coords.ts).
 */

// ---------- shared types ----------

/** MIDI pitch number 0-127. Branded would be nicer but we keep it simple. */
export type Midi = number;

/** Chromatic pitch class 0-11. */
export type PitchClass = number;

/** Note name with sharp accidentals (the canonical internal form). */
export type SharpNoteName =
  | 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F'
  | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

/** Note name with flat accidentals. */
export type FlatNoteName =
  | 'C' | 'Db' | 'D' | 'Eb' | 'E' | 'F'
  | 'Gb' | 'G' | 'Ab' | 'A' | 'Bb' | 'B';

/** Either spelling; many functions accept any string and validate at runtime. */
export type NoteName = SharpNoteName | FlatNoteName | string;

// ---------- constants ----------

export const musicalNotes = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const satisfies readonly SharpNoteName[];

export const musicalNotesFlats = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
] as const satisfies readonly FlatNoteName[];

// ---------- validation ----------

export function validatePitchClass(pitchClass: unknown): pitchClass is PitchClass {
  if (typeof pitchClass !== 'number' || pitchClass < 0 || pitchClass > 11) {
    console.warn('🎵 [PITCH] Invalid pitch class:', pitchClass);
    return false;
  }
  return true;
}

export function validatePitch(pitch: unknown): pitch is Midi {
  if (typeof pitch !== 'number' || pitch < 0 || pitch > 127) {
    console.warn('🎵 [PITCH] Invalid pitch:', pitch);
    return false;
  }
  return true;
}

// ---------- note <-> pitch class ----------

const NOTE_TO_PITCH_CLASS: Readonly<Record<string, PitchClass>> = {
  C: 0, 'C#': 1, Db: 1,
  D: 2, 'D#': 3, Eb: 3,
  E: 4,
  F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10,
  B: 11,
};

/**
 * Convert a note name (sharp or flat) to a chromatic index (0-11).
 * Returns -1 on invalid input. Source quirk: splits on '/' and uses the
 * left side, so slash-chord-y inputs like 'C/G' resolve to 'C'.
 */
export function noteToPitchClass(note: unknown): PitchClass | -1 {
  if (!note || typeof note !== 'string') {
    console.warn('🎵 [PITCH] Invalid note input:', note);
    return -1;
  }
  const baseNote = note.split('/')[0]!;
  const pitchClass = NOTE_TO_PITCH_CLASS[baseNote];
  if (pitchClass === undefined) {
    console.warn('🎵 [PITCH] Unknown note name:', note);
    return -1;
  }
  return pitchClass;
}

/** Convert pitch class to note name. Returns null for out-of-range input. */
export function pitchClassToNote(
  pitchClass: number,
  useFlats: boolean = false,
): string | null {
  if (pitchClass < 0 || pitchClass >= 12) return null;
  const arr = useFlats ? musicalNotesFlats : musicalNotes;
  // Bounds checked above; assertion safe and required under noUncheckedIndexedAccess.
  return arr[pitchClass]!;
}

// ---------- grid origin ----------

/**
 * Default pitch at grid origin (0,0). Source comment notes this was lowered
 * from C2 (36) to C-1 (0) so the 20x20 rectangle stays within MIDI 0-127.
 */
export function getOriginPitch(): Midi {
  return 0;
}

// ---------- pitch at coord ----------

export interface PitchAtResult {
  note: SharpNoteName;
  octave: number;
  totalSemitones: number;
  pitch: Midi;
}

/**
 * Compute pitch info at grid coordinates (x, y) for an isomorphic diamond
 * grid: horizontal step = +4 semitones, vertical step = +3 semitones.
 */
export function getPitchAt(
  x: number,
  y: number,
  originPitch: number,
): PitchAtResult | null {
  if (typeof x !== 'number' || typeof y !== 'number') {
    console.warn('🎵 [PITCH] Invalid grid coordinates:', { x, y });
    return null;
  }
  let origin = originPitch;
  if (typeof origin !== 'number' || origin < 0 || origin > 127) {
    console.warn('🎵 [PITCH] Invalid origin pitch:', origin);
    origin = 36; // Default to C2 (matches JS source fallback).
  }

  const horizontalSemitones = x * 4;
  const verticalSemitones = y * 3;
  const totalSemitones = horizontalSemitones + verticalSemitones;
  const pitch = totalSemitones + origin;

  if (pitch < 0 || pitch > 127) {
    console.warn(
      '🎵 [PITCH] Calculated pitch out of MIDI range:',
      pitch,
      'at coordinates:',
      { x, y },
    );
    return null;
  }

  const octave = Math.floor(pitch / 12) - 1;
  const pitchClass = pitch % 12;
  return {
    note: musicalNotes[pitchClass]!,
    octave,
    totalSemitones,
    pitch,
  };
}

// ---------- note <-> pitch ----------

/** Convert note + octave to MIDI pitch. Returns null on invalid input. */
export function getPitchFromNote(
  note: unknown,
  octave: number = 3,
): Midi | null {
  if (!note || typeof note !== 'string') {
    console.warn('🎵 [PITCH] Invalid note input:', note);
    return null;
  }
  if (typeof octave !== 'number' || octave < -1 || octave > 9) {
    console.warn('🎵 [PITCH] Invalid octave:', octave);
    return null;
  }
  const pitchClass = noteToPitchClass(note);
  if (pitchClass === -1) {
    console.warn('🎵 [PITCH] Could not convert note to pitch class:', note);
    return null;
  }
  const pitch = pitchClass + (octave + 1) * 12;
  if (pitch < 0 || pitch > 127) {
    console.warn(
      '🎵 [PITCH] Pitch out of MIDI range:',
      pitch,
      'for note:',
      note,
      'octave:',
      octave,
    );
    return null;
  }
  return pitch;
}

export interface NoteFromPitchResult {
  note: string;
  octave: number;
  pitch: Midi;
}

export function getNoteFromPitch(
  pitch: number,
  useFlats: boolean = false,
): NoteFromPitchResult | null {
  if (typeof pitch !== 'number' || pitch < 0 || pitch > 127) {
    console.warn('🎵 [PITCH] Invalid pitch value:', pitch);
    return null;
  }
  let flats = useFlats;
  if (typeof flats !== 'boolean') {
    console.warn('🎵 [PITCH] Invalid useFlats parameter:', flats);
    flats = false;
  }
  const pitchClass = pitch % 12;
  const octave = Math.floor(pitch / 12) - 1;
  const note = flats ? musicalNotesFlats[pitchClass]! : musicalNotes[pitchClass]!;
  return { note, octave, pitch };
}

/** Simplified pitch -> note + octave (no validation, no useFlats option). */
export function pitchToNoteAndOctave(pitch: number): {
  note: SharpNoteName;
  octave: number;
} {
  const octave = Math.floor(pitch / 12) - 1;
  const pitchClass = pitch % 12;
  return { note: musicalNotes[pitchClass]!, octave };
}

export interface PitchInfo {
  pitch: Midi;
  pitchClass: PitchClass;
  octave: number;
  sharp: SharpNoteName;
  flat: FlatNoteName;
  hasEnharmonics: boolean;
  sharpWithOctave: string;
  flatWithOctave: string;
}

export function getPitchInfo(pitch: number): PitchInfo | null {
  if (pitch < 0 || pitch > 127) return null;
  const pitchClass = pitch % 12;
  const octave = Math.floor(pitch / 12) - 1;
  const sharp = musicalNotes[pitchClass]!;
  const flat = musicalNotesFlats[pitchClass]!;
  const hasEnharmonics = sharp !== flat;
  return {
    pitch,
    pitchClass,
    octave,
    sharp,
    flat,
    hasEnharmonics,
    sharpWithOctave: `${sharp}${octave}`,
    flatWithOctave: `${flat}${octave}`,
  };
}

// ---------- offsets / batches ----------

/** Chromatic offset between two pitch classes (positive, 0-11). */
export function getChromaticOffset(
  pitchClass1: number,
  pitchClass2: number,
): PitchClass {
  return (((pitchClass1 - pitchClass2) % 12) + 12) % 12;
}

export function pitchClassesToNotes(
  pitchClasses: readonly number[],
  useFlats: boolean = false,
): Array<string | null> {
  return pitchClasses.map((pc) => pitchClassToNote(pc, useFlats));
}

export function notesToPitchClasses(notes: readonly string[]): PitchClass[] {
  return notes
    .map((note) => noteToPitchClass(note))
    .filter((index): index is PitchClass => index !== -1);
}

// ---------- name normalization ----------

const FLAT_TO_SHARP: Readonly<Record<string, string>> = {
  Db: 'C#', 'D♭': 'C#',
  Eb: 'D#', 'E♭': 'D#',
  Gb: 'F#', 'G♭': 'F#',
  Ab: 'G#', 'A♭': 'G#',
  Bb: 'A#', 'B♭': 'A#',
};

export function normalizeNoteName(noteName: string): string {
  return FLAT_TO_SHARP[noteName] ?? noteName;
}

// ---------- musical-typing helpers ----------

const MUSICAL_KEYS: readonly string[] = [
  'a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k',
  'o', 'l', 'p', ';', "'", ']', '\\', ':', '"', '}', '|', 'enter',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '!', '@', '#', '$', '%', '^', '&', '*', '(', ')',
];

export function isMusicalKey(key: string): boolean {
  return MUSICAL_KEYS.includes(key.toLowerCase());
}

export interface NoteFromMusicalKeyResult {
  note: string;
  octave: number;
}

/**
 * Map a typed key (qwerty musical-typing layout) to {note, octave}.
 *
 * Note: in the JS source this also handled diatonic chord number keys via a
 * `getDiatonicChordFromNumber` callback. That callback only made sense inside
 * the desktop app's stateful key/chord context. Here we preserve the callback
 * shape so callers can wire it in; pass a no-op function (or null) if you
 * don't care about number-key diatonic lookups.
 */
export function getNoteFromMusicalKey(
  key: string,
  getDiatonicChordFromNumber:
    | ((n: number) => NoteFromMusicalKeyResult | null)
    | null,
  _getNoteFromPitch: typeof getNoteFromPitch = getNoteFromPitch,
): NoteFromMusicalKeyResult | null {
  const shiftedNumberMap: Readonly<Record<string, string>> = {
    '!': '1', '@': '2', '#': '3', '$': '4', '%': '5',
    '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
  };

  let k = key;
  const shifted = shiftedNumberMap[k];
  if (shifted) k = shifted;

  const numberKey = parseInt(k, 10);
  if (!Number.isNaN(numberKey) && numberKey >= 0 && numberKey <= 9) {
    return getDiatonicChordFromNumber ? getDiatonicChordFromNumber(numberKey) : null;
  }

  const keyMap: Readonly<Record<string, number>> = {
    a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7,
    y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14,
    p: 15, ';': 16, "'": 17, ']': 18,
    ':': 16, '"': 17, '}': 18,
    '\\': 20, '|': 20, enter: 19,
  };

  const semitoneOffset = keyMap[k.toLowerCase()];
  if (semitoneOffset === undefined) return null;

  const basePitch = 48; // C3
  const pitch = basePitch + semitoneOffset;
  const noteInfo = _getNoteFromPitch(pitch, false);
  if (!noteInfo) return null;
  return { note: noteInfo.note, octave: noteInfo.octave };
}
