/**
 * Chord primitives: chord type catalog, diatonic patterns, chord generation,
 * chord detection (including extended-interval + slash-chord interpretations),
 * roman numeral lookups.
 *
 * Ported verbatim from `/static/pitch-utils.js`. Math + tie-breaking quirks
 * are preserved exactly.
 */

import type { PitchClass, Midi } from './pitches';
import {
  musicalNotes,
  pitchClassToNote,
  noteToPitchClass,
  pitchClassesToNotes,
  getNoteFromPitch,
} from './pitches';
import {
  keys,
  shouldUseFlats,
  getKeyDegreeFromPitchClass,
  validateKeyType,
} from './keys';

// ---------- chord catalog ----------

export interface ChordDef {
  readonly name: string;
  readonly intervals: readonly number[];
  readonly commonness: number;
}

export const chordTypes = {
  // Basic triads
  maj: { name: '', intervals: [0, 4, 7], commonness: 10 },
  min: { name: 'm', intervals: [0, 3, 7], commonness: 10 },
  dim: { name: 'dim', intervals: [0, 3, 6], commonness: 6 },
  aug: { name: 'aug', intervals: [0, 4, 8], commonness: 4 },

  // 7ths
  min7: { name: 'min7', intervals: [0, 3, 7, 10], commonness: 9 },
  dom7: { name: '7', intervals: [0, 4, 7, 10], commonness: 9 },
  maj7: { name: 'maj7', intervals: [0, 4, 7, 11], commonness: 8 },
  'half-dim7': { name: 'ø7', intervals: [0, 3, 6, 10], commonness: 7 },
  dim7: { name: 'dim7', intervals: [0, 3, 6, 9], commonness: 6 },
  minmaj7: { name: 'minmaj7', intervals: [0, 3, 7, 11], commonness: 5 },
  'maj7#5': { name: 'maj7#5', intervals: [0, 4, 8, 11], commonness: 4 },
  min7b5: { name: 'min7b5', intervals: [0, 3, 6, 10], commonness: 4 },

  // Extended
  dom9: { name: '9', intervals: [0, 4, 7, 10, 14], commonness: 7 },
  maj9: { name: 'maj9', intervals: [0, 4, 7, 11, 14], commonness: 6 },
  min9: { name: 'min9', intervals: [0, 3, 7, 10, 14], commonness: 6 },
  dom13: { name: '13', intervals: [0, 4, 7, 10, 14, 21], commonness: 6 },
  maj13: { name: 'maj13', intervals: [0, 4, 7, 11, 14, 21], commonness: 5 },
  min13: { name: 'min13', intervals: [0, 3, 7, 10, 14, 21], commonness: 5 },
  maj11: { name: 'maj11', intervals: [0, 4, 7, 11, 14, 17], commonness: 4 },
  min11: { name: 'min11', intervals: [0, 3, 7, 10, 14, 17], commonness: 4 },
  dom11: { name: '11', intervals: [0, 4, 7, 10, 14, 17], commonness: 4 },

  // Altered
  'dom7#9': { name: '7#9', intervals: [0, 4, 7, 10, 15], commonness: 5 },
  dom7b9: { name: '7b9', intervals: [0, 4, 7, 10, 13], commonness: 5 },
  'dom7#5': { name: '7#5', intervals: [0, 4, 8, 10], commonness: 4 },
  dom7b5: { name: '7b5', intervals: [0, 4, 6, 10], commonness: 4 },
  'dom7#11': { name: '7#11', intervals: [0, 4, 7, 10, 14, 18], commonness: 3 },
  'dom9#11': { name: '9#11', intervals: [0, 4, 7, 10, 14, 18], commonness: 2 },
  dom7b13: { name: '7b13', intervals: [0, 4, 7, 10, 14, 20], commonness: 3 },
  alt: { name: 'alt', intervals: [0, 4, 6, 10, 13, 15], commonness: 3 },

  // Suspended
  sus4: { name: 'sus4', intervals: [0, 5, 7], commonness: 6 },
  sus2: { name: 'sus2', intervals: [0, 2, 7], commonness: 5 },
  sus2sus4: { name: 'sus2/4', intervals: [0, 2, 5, 7], commonness: 3 },
  '7sus4': { name: '7sus4', intervals: [0, 5, 7, 10], commonness: 5 },
  '7sus2': { name: '7sus2', intervals: [0, 2, 7, 10], commonness: 4 },

  'half-dim7sus4': { name: 'ø7sus4', intervals: [0, 5, 6, 10], commonness: 3 },
  dim7sus4: { name: 'dim7sus4', intervals: [0, 5, 6, 9], commonness: 2 },

  // Add
  add8: { name: 'add8', intervals: [0, 4, 7, 12], commonness: 5 },
  'min add8': { name: 'madd8', intervals: [0, 3, 7, 12], commonness: 5 },
  add9: { name: 'add9', intervals: [0, 4, 7, 14], commonness: 4 },
  'min add9': { name: 'madd9', intervals: [0, 3, 7, 14], commonness: 4 },
  add11: { name: 'add11', intervals: [0, 4, 7, 17], commonness: 3 },
  add13: { name: 'add13', intervals: [0, 4, 7, 21], commonness: 3 },

  // 6ths
  '6': { name: '6', intervals: [0, 4, 7, 9], commonness: 5 },
  m6: { name: 'm6', intervals: [0, 3, 7, 9], commonness: 5 },

  // Power
  '5': { name: '5', intervals: [0, 7], commonness: 7 },
} as const satisfies Record<string, ChordDef>;

export type ChordType = keyof typeof chordTypes;

/** Generic chord record signature for callers passing their own dictionaries. */
export type ChordRecord = Readonly<Record<string, ChordDef>>;

// ---------- arraysEqual (local copy to avoid utils circular noise) ----------

import { arraysEqual } from './utils';

// ---------- validation ----------

const CHORD_TYPE_MAPPING: Readonly<Record<string, ChordType>> = {
  '7': 'dom7',
  m7: 'min7',
  maj7: 'maj7',
  dim7: 'dim7',
  m: 'min',
  maj: 'maj',
  dim: 'dim',
  aug: 'aug',
  sus4: 'sus4',
  sus2: 'sus2',
  'sus2/4': 'sus2sus4',
  sus2sus4: 'sus2sus4',
  'ø7': 'half-dim7',
  m7b5: 'min7b5',
  '7b5': 'dom7b5',
  '7#5': 'dom7#5',
  '7b9': 'dom7b9',
  '7#9': 'dom7#9',
  '7#11': 'dom7#11',
  '9#11': 'dom9#11',
  '7b13': 'dom7b13',
  alt: 'alt',
};

export function validateChordType(chordType: unknown): boolean {
  if (!chordType || typeof chordType !== 'string') {
    console.warn('🎵 [PITCH] Invalid chord type:', chordType);
    return false;
  }
  const mapped = CHORD_TYPE_MAPPING[chordType];
  if (mapped && (mapped in chordTypes)) return true;
  if (chordType in chordTypes) return true;
  console.warn('🎵 [PITCH] Unknown chord type:', chordType);
  return false;
}

// ---------- diatonic patterns ----------

type DiatonicKey =
  | 'major' | 'natural-minor' | 'harmonic-minor' | 'melodic-minor'
  | 'dorian' | 'phrygian' | 'lydian' | 'mixolydian' | 'locrian';

const DIATONIC_TRIADS: Readonly<Record<DiatonicKey, readonly string[]>> = {
  major: ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim', 'maj'],
  'natural-minor': ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj', 'min'],
  'harmonic-minor': ['min', 'dim', 'aug', 'min', 'maj', 'maj', 'dim', 'min', 'dim', 'aug', 'min', 'maj', 'maj', 'dim', 'min'],
  'melodic-minor': ['min', 'min', 'aug', 'maj', 'maj', 'dim', 'dim', 'min', 'min', 'aug', 'maj', 'maj', 'dim', 'dim', 'min'],
  dorian: ['min', 'min', 'maj', 'maj', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim', 'maj', 'min'],
  phrygian: ['min', 'maj', 'maj', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim', 'maj', 'min', 'min'],
  lydian: ['maj', 'maj', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim', 'maj', 'min', 'min', 'maj'],
  mixolydian: ['maj', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'],
  locrian: ['dim', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim', 'maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'],
};

const DIATONIC_TETRADS: Readonly<Record<DiatonicKey, readonly string[]>> = {
  major: ['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'half-dim7', 'maj7'],
  'natural-minor': ['min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7'],
  'harmonic-minor': ['minmaj7', 'half-dim7', 'maj7#5', 'min7', 'dom7', 'maj7', 'dim7', 'minmaj7', 'half-dim7', 'maj7#5', 'min7', 'dom7', 'maj7', 'dim7', 'minmaj7'],
  'melodic-minor': ['minmaj7', 'min7', 'aug', 'maj7', 'dom7', 'half-dim7', 'half-dim7', 'minmaj7', 'min7', 'aug', 'maj7', 'dom7', 'half-dim7', 'half-dim7', 'minmaj7'],
  dorian: ['min7', 'min7', 'maj7', 'maj7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'maj7', 'min7', 'half-dim7', 'maj7', 'min7'],
  phrygian: ['min7', 'maj7', 'maj7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'maj7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7'],
  lydian: ['maj7', 'maj7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'maj7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7'],
  mixolydian: ['dom7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'dom7'],
  locrian: ['half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'maj7', 'min7', 'half-dim7', 'maj7', 'min7', 'min7', 'maj7', 'maj7', 'min7', 'half-dim7'],
};

export function getDiatonicTriads(keyType: string): readonly string[] {
  let kt = keyType;
  if (!validateKeyType(kt)) {
    console.warn('🎵 [PITCH] Falling back to major key pattern for invalid key type:', kt);
    kt = 'major';
  }
  return DIATONIC_TRIADS[kt as DiatonicKey] ?? DIATONIC_TRIADS.major;
}

export function getDiatonicTetrads(keyType: string): readonly string[] {
  let kt = keyType;
  if (!validateKeyType(kt)) {
    console.warn('🎵 [PITCH] Falling back to major key pattern for invalid key type:', kt);
    kt = 'major';
  }
  return DIATONIC_TETRADS[kt as DiatonicKey] ?? DIATONIC_TETRADS.major;
}

// ---------- display ----------

const SHORT_NAMES: Readonly<Record<string, string>> = {
  maj: '', min: 'm', dim: 'o', aug: '+',
  min7: 'm7', dom7: '7', maj7: 'M7',
  'half-dim7': 'ø7', dim7: 'o7', minmaj7: 'mM7',
  'maj7#5': 'M7#5', min7b5: 'm7b5',
  dom9: '9', maj9: 'M9', min9: 'm9',
  dom13: '13', maj13: 'M13', min13: 'm13',
  maj11: 'M11', min11: 'm11', dom11: '11',
  'dom7#9': '7#9', dom7b9: '7b9', 'dom7#5': '7#5', dom7b5: '7b5',
  'dom7#11': '7#11', 'dom9#11': '9#11', dom7b13: '7b13', alt: 'alt',
  sus4: 'sus4', sus2: 'sus2', sus2sus4: 'sus2/4',
  '7sus4': '7sus4', '7sus2': '7sus2',
  add9: 'add9', madd9: 'madd9', add11: 'add11', add13: 'add13',
  '6': '6', m6: 'm6', '5': '5',
};

export function getShortChordName(chordType: string): string {
  const v = SHORT_NAMES[chordType];
  return v !== undefined ? v : chordType;
}

// ---------- chord generation ----------

export function generateChordPitchClasses(
  rootPitchClass: PitchClass,
  chordType: string,
  chordsRecord: ChordRecord = chordTypes,
): PitchClass[] {
  const data = chordsRecord[chordType];
  if (!data) return [];
  return data.intervals.map((interval) => (rootPitchClass + interval) % 12);
}

export function generateChordNotes(
  rootPitchClass: PitchClass,
  chordType: string,
  bassNote: string | null | undefined,
  chordsRecord: ChordRecord = chordTypes,
): Array<string | null> {
  const chordPCs = generateChordPitchClasses(rootPitchClass, chordType, chordsRecord);
  const useFlats = shouldUseFlats(rootPitchClass, 'major'); // chord accidentals follow major
  const notes = pitchClassesToNotes(chordPCs, useFlats);
  if (bassNote && !notes.includes(bassNote)) {
    notes.unshift(bassNote);
  }
  return notes;
}

export function generateChordPitches(
  rootNote: string,
  chordType: string,
  chordsRecord: ChordRecord = chordTypes,
  rootOctave: number = 3,
): Midi[] {
  const data = chordsRecord[chordType];
  if (!data) return [];
  const rootPitchClass = noteToPitchClass(rootNote);
  if (rootPitchClass === -1) return [];
  const rootPitch = (rootOctave + 1) * 12 + rootPitchClass;
  return data.intervals.map((interval) => rootPitch + interval);
}

// ---------- chord detection ----------

export interface ChordMatch {
  rootNote: string;
  chordType: string;
  chordName: string;
  fullName: string;
  commonness: number;
  bassNote?: string;
  isSlashChord?: boolean;
}

/**
 * Detect chord interpretations from an array of note names.
 *
 * The JS source uses many shadowed `lowestPitchNote` variables and a
 * branching cascade of extended-interval rewrites (2→9, 3→10, 4→11, 6→13,
 * and pairs/triples/quad combos thereof). Ported VERBATIM — do not "simplify"
 * the combination explosion; some of those produce specific extended-chord
 * matches that callers rely on.
 *
 * Returns the highest-commonness match list, or null if nothing matched.
 */
export function detectChord(
  notes: readonly string[],
  chordsRecord: ChordRecord,
  actualPitches: readonly Midi[] | null = null,
): ChordMatch[] | null {
  if (notes.length < 2) return null;

  const semitones = notes
    .map((note) => noteToPitchClass(note))
    .filter((index): index is PitchClass => index !== -1)
    .sort((a, b) => a - b);

  const allMatches: ChordMatch[] = [];

  for (let i = 0; i < semitones.length; i++) {
    const potentialRoot = semitones[i]!;

    const potentialIntervals = semitones.map((s) => {
      let interval = s - potentialRoot;
      if (interval < 0) interval += 12;
      return interval;
    });
    const uniquePotentialIntervals = [...new Set(potentialIntervals)].sort((a, b) => a - b);

    for (const chordType of Object.keys(chordsRecord)) {
      const chordData = chordsRecord[chordType]!;
      const chordIntervals = [...chordData.intervals].sort((a, b) => a - b);
      if (arraysEqual(uniquePotentialIntervals, chordIntervals)) {
        if (chordType === '5' && uniquePotentialIntervals.length !== 2) continue;
        const rootNote = pitchClassToNote(potentialRoot, false)!;
        allMatches.push({
          rootNote,
          chordType,
          chordName: chordData.name,
          fullName: `${rootNote}${chordData.name}`,
          commonness: chordData.commonness ?? 1,
        });
      }
    }

    if (semitones.length >= 4) {
      const baseIntervals = semitones.map((s) => {
        let interval = s - potentialRoot;
        if (interval < 0) interval += 12;
        return interval;
      });

      const combinations: number[][] = [[...baseIntervals]];

      if (semitones.length === 4 || semitones.length === 5) {
        for (let j = 0; j < baseIntervals.length; j++) {
          if (baseIntervals[j] === 2) {
            const newIntervals = [...baseIntervals];
            newIntervals[j] = 14;
            combinations.push(newIntervals);
          }
        }
      } else if (semitones.length >= 6) {
        // 2 -> 9 (14)
        for (let j = 0; j < baseIntervals.length; j++) {
          if (baseIntervals[j] === 2) {
            const n = [...baseIntervals]; n[j] = 14; combinations.push(n);
          }
        }
        // 3 -> 10 (16)
        for (let j = 0; j < baseIntervals.length; j++) {
          if (baseIntervals[j] === 4) {
            const n = [...baseIntervals]; n[j] = 16; combinations.push(n);
          }
        }
        // 4 -> 11 (17)
        for (let j = 0; j < baseIntervals.length; j++) {
          if (baseIntervals[j] === 5) {
            const n = [...baseIntervals]; n[j] = 17; combinations.push(n);
          }
        }
        // 6 -> 13 (21)
        for (let j = 0; j < baseIntervals.length; j++) {
          if (baseIntervals[j] === 9) {
            const n = [...baseIntervals]; n[j] = 21; combinations.push(n);
          }
        }
        // pair: 2->9 AND 3->10
        for (let a = 0; a < baseIntervals.length; a++) {
          if (baseIntervals[a] !== 2) continue;
          for (let b = 0; b < baseIntervals.length; b++) {
            if (baseIntervals[b] !== 4) continue;
            const n = [...baseIntervals]; n[a] = 14; n[b] = 16; combinations.push(n);
          }
        }
        // pair: 2->9 AND 4->11
        for (let a = 0; a < baseIntervals.length; a++) {
          if (baseIntervals[a] !== 2) continue;
          for (let b = 0; b < baseIntervals.length; b++) {
            if (baseIntervals[b] !== 5) continue;
            const n = [...baseIntervals]; n[a] = 14; n[b] = 17; combinations.push(n);
          }
        }
        // pair: 2->9 AND 6->13
        for (let a = 0; a < baseIntervals.length; a++) {
          if (baseIntervals[a] !== 2) continue;
          for (let b = 0; b < baseIntervals.length; b++) {
            if (baseIntervals[b] !== 9) continue;
            const n = [...baseIntervals]; n[a] = 14; n[b] = 21; combinations.push(n);
          }
        }
        // pair: 3->10 AND 4->11
        for (let a = 0; a < baseIntervals.length; a++) {
          if (baseIntervals[a] !== 4) continue;
          for (let b = 0; b < baseIntervals.length; b++) {
            if (baseIntervals[b] !== 5) continue;
            const n = [...baseIntervals]; n[a] = 16; n[b] = 17; combinations.push(n);
          }
        }
        // pair: 4->11 AND 6->13
        for (let a = 0; a < baseIntervals.length; a++) {
          if (baseIntervals[a] !== 5) continue;
          for (let b = 0; b < baseIntervals.length; b++) {
            if (baseIntervals[b] !== 9) continue;
            const n = [...baseIntervals]; n[a] = 17; n[b] = 21; combinations.push(n);
          }
        }
        // triple: 2->9, 3->10, 4->11
        for (let a = 0; a < baseIntervals.length; a++) {
          if (baseIntervals[a] !== 2) continue;
          for (let b = 0; b < baseIntervals.length; b++) {
            if (baseIntervals[b] !== 4) continue;
            for (let c = 0; c < baseIntervals.length; c++) {
              if (baseIntervals[c] !== 5) continue;
              const n = [...baseIntervals]; n[a] = 14; n[b] = 16; n[c] = 17;
              combinations.push(n);
            }
          }
        }
        // quad: 2->9, 3->10, 4->11, 6->13
        for (let a = 0; a < baseIntervals.length; a++) {
          if (baseIntervals[a] !== 2) continue;
          for (let b = 0; b < baseIntervals.length; b++) {
            if (baseIntervals[b] !== 4) continue;
            for (let c = 0; c < baseIntervals.length; c++) {
              if (baseIntervals[c] !== 5) continue;
              for (let d = 0; d < baseIntervals.length; d++) {
                if (baseIntervals[d] !== 9) continue;
                const n = [...baseIntervals];
                n[a] = 14; n[b] = 16; n[c] = 17; n[d] = 21;
                combinations.push(n);
              }
            }
          }
        }
      }

      for (const intervals of combinations) {
        const uniqueIntervals = [...new Set(intervals)].sort((a, b) => a - b);
        for (const chordType of Object.keys(chordsRecord)) {
          const chordData = chordsRecord[chordType]!;
          const chordIntervals = [...chordData.intervals].sort((a, b) => a - b);
          if (arraysEqual(uniqueIntervals, chordIntervals)) {
            const rootNote = musicalNotes[potentialRoot]!;
            allMatches.push({
              rootNote,
              chordType,
              chordName: chordData.name,
              fullName: `${rootNote}${chordData.name}`,
              commonness: chordData.commonness ?? 1,
            });
          }
        }
      }
    }
  }

  // Symmetric / lowest-pitch-priority pass.
  const symmetricMatches: ChordMatch[] = [];
  let lowestPitchNote: string;
  if (actualPitches && actualPitches.length > 0) {
    const lowestPitch = Math.min(...actualPitches);
    const lowestPitchInfo = getNoteFromPitch(lowestPitch, false);
    lowestPitchNote = lowestPitchInfo ? lowestPitchInfo.note : '';
  } else {
    const lowestPitchIndex = Math.min(...semitones);
    lowestPitchNote = pitchClassToNote(lowestPitchIndex, false) ?? '';
  }

  for (const match of allMatches) {
    if (match.chordType === 'dim' || match.chordType === 'dim7') {
      if (match.chordType === 'dim7') {
        const primaryRootIndex = noteToPitchClass(lowestPitchNote);
        if (primaryRootIndex === -1) {
          symmetricMatches.push(match);
          continue;
        }
        const primaryRoot = pitchClassToNote(primaryRootIndex, false)!;
        symmetricMatches.push({
          rootNote: primaryRoot,
          chordType: 'dim7',
          chordName: 'dim7',
          fullName: `${primaryRoot}dim7`,
          commonness: match.commonness + 1,
        });
        for (let k = 0; k < 4; k++) {
          const enharmonicRootIndex = (primaryRootIndex + k * 3) % 12;
          if (enharmonicRootIndex === primaryRootIndex) continue;
          const enharmonicRoot = pitchClassToNote(enharmonicRootIndex, false)!;
          const exists = symmetricMatches.some(
            (m) => m.rootNote === enharmonicRoot && m.chordType === 'dim7',
          );
          if (!exists) {
            symmetricMatches.push({
              rootNote: enharmonicRoot,
              chordType: 'dim7',
              chordName: 'dim7',
              fullName: `${enharmonicRoot}dim7`,
              commonness: match.commonness,
            });
          }
        }
      } else {
        symmetricMatches.push({
          rootNote: lowestPitchNote,
          chordType: 'dim',
          chordName: 'dim',
          fullName: `${lowestPitchNote}dim`,
          commonness: match.commonness + 1,
        });
      }
    } else {
      const lowestPitchIndex = noteToPitchClass(lowestPitchNote);
      const matchRootIndex = noteToPitchClass(match.rootNote);
      if (lowestPitchIndex !== -1 && lowestPitchIndex === matchRootIndex) {
        symmetricMatches.push({ ...match, commonness: match.commonness + 2 });
      } else {
        symmetricMatches.push(match);
      }
    }
  }

  let finalMatches: ChordMatch[] = [...symmetricMatches];

  // 6+ notes: extended interval pass against actual pitches.
  if (notes.length >= 6 && actualPitches && actualPitches.length > 0) {
    const lowestPitch = Math.min(...actualPitches);
    const lowestPitchInfo = getNoteFromPitch(lowestPitch, false);
    const lpNote = lowestPitchInfo ? lowestPitchInfo.note : '';

    const baseIntervals = actualPitches
      .map((pitch) => pitch - lowestPitch)
      .sort((a, b) => a - b);

    const extendedCombinations: number[][] = [[...baseIntervals]];
    for (let j = 0; j < baseIntervals.length; j++) {
      if (baseIntervals[j] === 18) {
        const n = [...baseIntervals]; n[j] = 17; extendedCombinations.push(n);
      }
    }

    for (const intervals of extendedCombinations) {
      const uniqueIntervals = [...new Set(intervals)].sort((a, b) => a - b);
      for (const chordType of Object.keys(chordsRecord)) {
        const chordData = chordsRecord[chordType]!;
        const chordIntervals = [...chordData.intervals].sort((a, b) => a - b);
        if (arraysEqual(uniqueIntervals, chordIntervals)) {
          const extendedMatch: ChordMatch = {
            rootNote: lpNote,
            chordType,
            chordName: chordData.name,
            fullName: `${lpNote}${chordData.name}`,
            commonness: chordData.commonness ?? 1,
          };
          const exists = finalMatches.some(
            (m) => m.rootNote === extendedMatch.rootNote && m.chordType === extendedMatch.chordType,
          );
          if (!exists) finalMatches.push(extendedMatch);
        }
      }
    }
  }

  if (actualPitches && actualPitches.length > 0) {
    const slashChordMatches = detectSlashChords(notes, chordsRecord, actualPitches);
    if (slashChordMatches && slashChordMatches.length > 0) {
      finalMatches = [...finalMatches, ...slashChordMatches];
    }
  }

  if (finalMatches.length > 0) {
    finalMatches.sort((a, b) => b.commonness - a.commonness);
    return finalMatches;
  }

  const slashChordMatches = detectSlashChords(notes, chordsRecord, actualPitches);
  if (slashChordMatches && slashChordMatches.length > 0) return slashChordMatches;

  return null;
}

function detectSlashChords(
  notes: readonly string[],
  chordsRecord: ChordRecord,
  actualPitches: readonly Midi[] | null = null,
): ChordMatch[] | null {
  if (notes.length < 3) return null;
  if (!actualPitches || actualPitches.length === 0) return null;

  const lowestPitch = Math.min(...actualPitches);
  const lowestPitchIndex = actualPitches.indexOf(lowestPitch);
  const bassNote = notes[lowestPitchIndex];
  if (!bassNote) return null;

  const otherNotes = notes.filter((_, index) => index !== lowestPitchIndex);
  const otherPitches = actualPitches.filter((_, index) => index !== lowestPitchIndex);

  const chordMatches = detectChord(otherNotes, chordsRecord, otherPitches);
  if (chordMatches && chordMatches.length > 0) {
    const primaryChord = chordMatches[0]!;
    const rootPitchClass = noteToPitchClass(primaryChord.rootNote);
    if (rootPitchClass === -1) return null;
    const chordTypeObj = chordsRecord[primaryChord.chordType];
    if (!chordTypeObj) return null;
    const chordIntervals = chordTypeObj.intervals;
    const chordTones = chordIntervals.map((interval) => (rootPitchClass + interval) % 12);
    const bassPitchClass = noteToPitchClass(bassNote);
    if (bassPitchClass === -1) return null;
    if (!chordTones.includes(bassPitchClass)) chordTones.push(bassPitchClass);

    const allNotePitchClasses = notes.map((n) => noteToPitchClass(n));
    const allAreChordTones = allNotePitchClasses.every(
      (pc) => pc !== -1 && chordTones.includes(pc),
    );
    if (!allAreChordTones) return null;

    return [{
      rootNote: primaryChord.rootNote,
      chordType: primaryChord.chordType,
      chordName: primaryChord.chordName,
      bassNote,
      fullName: `${primaryChord.rootNote}${primaryChord.chordName}/${bassNote}`,
      isSlashChord: true,
      commonness: primaryChord.commonness - 3,
    }];
  }

  return null;
}

// ---------- chord stacking ----------

import type { GridCoord, GetPitchAtFn, GetCoordinatesForNoteFn } from './grid-types';

export interface StackedChordEntry {
  note: string;
  coord: GridCoord;
  pitch: { pitch: Midi; octave: number; note: string; totalSemitones: number };
}

/**
 * Stack chord notes onto the grid with an optimal voicing.
 *
 * Behavior is preserved verbatim from JS source. Callers provide
 * `getCoordinatesForNote` and `getPitchAt` so this function stays pure of
 * grid-dim assumptions. `isSlashChord + bassNote` takes the bass to octave 2
 * (or lowest available), then stacks the remaining notes from octave 3 up.
 */
export function stackChordNotes(
  notes: readonly string[],
  isSlashChord: boolean,
  bassNote: string | null,
  getCoordinatesForNote: GetCoordinatesForNoteFn,
  getPitchAt: GetPitchAtFn,
  originPitch: number,
  _gridWidth: number,
  _gridHeight: number,
): StackedChordEntry[] {
  const selectedCoords: StackedChordEntry[] = [];

  const noteCoords: Record<string, GridCoord[]> = {};
  notes.forEach((note) => {
    noteCoords[note] = getCoordinatesForNote(note);
  });

  const placeRoot = (rootNoteName: string): StackedChordEntry | null => {
    const rootCoords = noteCoords[rootNoteName];
    if (!rootCoords || rootCoords.length === 0) return null;
    let bestRootCoord: GridCoord | null = null;
    let targetPitch: ReturnType<GetPitchAtFn> = null;

    for (const coord of rootCoords) {
      const pitch = getPitchAt(coord.x, coord.y, originPitch);
      if (pitch && pitch.octave === 3) { bestRootCoord = coord; targetPitch = pitch; break; }
    }
    if (!bestRootCoord) {
      bestRootCoord = rootCoords[0]!;
      targetPitch = getPitchAt(bestRootCoord.x, bestRootCoord.y, originPitch);
      for (const coord of rootCoords) {
        const pitch = getPitchAt(coord.x, coord.y, originPitch);
        if (pitch && targetPitch && pitch.pitch < targetPitch.pitch) {
          targetPitch = pitch; bestRootCoord = coord;
        }
      }
    }
    if (!bestRootCoord || !targetPitch) return null;
    return { note: rootNoteName, coord: bestRootCoord, pitch: targetPitch };
  };

  const stackAbove = (
    note: string,
    prevEntry: StackedChordEntry,
  ): StackedChordEntry | null => {
    const coords = noteCoords[note];
    if (!coords || coords.length === 0) return null;
    const prevPitch = prevEntry.pitch;
    let bestCoord: GridCoord | null = null;
    let bestPitch: ReturnType<GetPitchAtFn> = null;
    let bestScore = Infinity;

    for (const coord of coords) {
      const pitch = getPitchAt(coord.x, coord.y, originPitch);
      if (pitch && pitch.pitch > prevPitch.pitch) {
        const pitchDistance = pitch.pitch - prevPitch.pitch;
        const physicalDistance =
          Math.abs(coord.x - prevEntry.coord.x) + Math.abs(coord.y - prevEntry.coord.y);
        const score = pitchDistance * 2 + physicalDistance;
        if (score < bestScore) { bestScore = score; bestCoord = coord; bestPitch = pitch; }
      }
    }
    if (!bestCoord) {
      let lowest = getPitchAt(coords[0]!.x, coords[0]!.y, originPitch);
      bestCoord = coords[0]!;
      for (const coord of coords) {
        const pitch = getPitchAt(coord.x, coord.y, originPitch);
        if (pitch && lowest && pitch.pitch < lowest.pitch) { lowest = pitch; bestCoord = coord; }
      }
      bestPitch = lowest;
    }
    if (!bestCoord || !bestPitch) return null;
    return { note, coord: bestCoord, pitch: bestPitch };
  };

  if (isSlashChord && bassNote) {
    const bassCoords = noteCoords[bassNote];
    if (bassCoords && bassCoords.length > 0) {
      let bestBassCoord: GridCoord | null = null;
      let bassPitch: ReturnType<GetPitchAtFn> = null;
      for (const coord of bassCoords) {
        const pitch = getPitchAt(coord.x, coord.y, originPitch);
        if (pitch && pitch.octave === 2) { bestBassCoord = coord; bassPitch = pitch; break; }
      }
      if (!bestBassCoord) {
        bestBassCoord = bassCoords[0]!;
        bassPitch = getPitchAt(bestBassCoord.x, bestBassCoord.y, originPitch);
        for (const coord of bassCoords) {
          const pitch = getPitchAt(coord.x, coord.y, originPitch);
          if (pitch && bassPitch && pitch.pitch < bassPitch.pitch) {
            bassPitch = pitch; bestBassCoord = coord;
          }
        }
      }
      if (bestBassCoord && bassPitch) {
        selectedCoords.push({ note: bassNote, coord: bestBassCoord, pitch: bassPitch });
      }
    }

    const chordNotes = notes.filter((n) => n !== bassNote);
    const root = chordNotes[0];
    if (root) {
      const rootEntry = placeRoot(root);
      if (rootEntry) selectedCoords.push(rootEntry);
      for (let i = 1; i < chordNotes.length; i++) {
        const prev = selectedCoords[selectedCoords.length - 1];
        if (!prev) break;
        const entry = stackAbove(chordNotes[i]!, prev);
        if (entry) selectedCoords.push(entry);
      }
    }
  } else {
    const root = notes[0];
    if (root) {
      const rootEntry = placeRoot(root);
      if (rootEntry) selectedCoords.push(rootEntry);
      for (let i = 1; i < notes.length; i++) {
        const prev = selectedCoords[i - 1];
        if (!prev) break;
        const entry = stackAbove(notes[i]!, prev);
        if (entry) selectedCoords.push(entry);
      }
    }
  }

  return selectedCoords;
}

// ---------- roman numerals ----------

/**
 * Build a Roman numeral string for a chord in a key.
 * Mirrors the JS source's case/suffix decision table exactly.
 */
export function getRomanNumeralForChordInKey(
  rootPitchClass: PitchClass,
  chordType: string,
  key: { rootPitchClass: PitchClass; name: string },
): string {
  if (typeof rootPitchClass !== 'number' || rootPitchClass < 0 || rootPitchClass > 11) {
    console.warn('🎵 [PITCH] Invalid rootPitchClass:', rootPitchClass);
    return '';
  }
  const chordTypeMapping: Readonly<Record<string, string>> = {
    ...CHORD_TYPE_MAPPING,
    '': 'maj',
  };
  const mappedChordType = chordTypeMapping[chordType] ?? chordType;

  if (!validateChordType(mappedChordType)) {
    console.warn('🎵 [PITCH] Invalid chordType:', chordType);
    return '';
  }
  if (!key || typeof key !== 'object' || key.rootPitchClass === undefined || !key.name) {
    console.warn('🎵 [PITCH] Invalid key object:', key);
    return '';
  }

  const keyDef = keys[key.name as keyof typeof keys];
  let keyDegreeResult = getKeyDegreeFromPitchClass(
    rootPitchClass, key.rootPitchClass, key.name, keyDef?.intervals,
  );
  let keyDegree = keyDegreeResult ? keyDegreeResult.degree : -1;
  let accidental = '';

  if (keyDegree === -1) {
    const keyIntervals = keyDef?.intervals;
    if (!keyIntervals) {
      console.warn('🎵 [PITCH] Invalid key intervals for:', key.name);
      return '';
    }
    let minDistance = Infinity;
    let closestDegree = 1;
    for (let degree = 1; degree <= 7; degree++) {
      const interval = keyIntervals[degree - 1];
      if (interval === undefined) continue;
      const scalePitchClass = (key.rootPitchClass + interval) % 12;
      const distance = Math.min(
        ((rootPitchClass - scalePitchClass + 12) % 12),
        ((scalePitchClass - rootPitchClass + 12) % 12),
      );
      if (distance < minDistance) { minDistance = distance; closestDegree = degree; }
    }
    const interval = keyIntervals[closestDegree - 1]!;
    const scalePitchClass = (key.rootPitchClass + interval) % 12;
    const semitoneDiff = ((rootPitchClass - scalePitchClass + 12) % 12);
    if (semitoneDiff === 1 || semitoneDiff === 11) accidental = '#';
    else if (semitoneDiff === 10 || semitoneDiff === 2) accidental = 'b';
    keyDegree = closestDegree;
  }

  const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  let romanNumeral = accidental + (romanNumerals[keyDegree] ?? '');
  let suffix = '';

  switch (mappedChordType) {
    case 'maj':
    case 'maj7':
    case 'maj9':
    case 'maj13':
      break;
    case 'min':
    case 'min7':
    case 'min9':
    case 'min13':
      romanNumeral = romanNumeral.toLowerCase();
      break;
    case 'dom7':
    case 'dom9':
    case 'dom13':
      suffix = '7';
      break;
    case 'half-dim7':
    case 'min7b5':
      romanNumeral = romanNumeral.toLowerCase();
      suffix = 'ø7';
      break;
    case 'dim':
    case 'dim7':
      romanNumeral = romanNumeral.toLowerCase();
      suffix = chordType === 'dim' ? '°' : '°7';
      break;
    case 'aug':
      suffix = '+';
      break;
    case 'sus4':
      suffix = 'sus4';
      break;
    case 'sus2':
      suffix = 'sus2';
      break;
    default:
      suffix = chordType;
      break;
  }
  return romanNumeral + suffix;
}

export function getRomanNumeralForNoteInKey(
  note: string,
  key: { rootNote: string; name: string },
): string {
  if (!note || !key || !key.rootNote || !key.name) return '';
  const notePitchClass = noteToPitchClass(note);
  if (notePitchClass === -1) return '';
  const keyRootPitchClass = noteToPitchClass(key.rootNote);
  if (keyRootPitchClass === -1) return '';

  const keyDef = keys[key.name as keyof typeof keys];
  let keyDegreeResult = getKeyDegreeFromPitchClass(
    notePitchClass, keyRootPitchClass, key.name, keyDef?.intervals,
  );
  let keyDegree = keyDegreeResult ? keyDegreeResult.degree : -1;
  let accidental = '';

  if (keyDegree === -1) {
    const keyIntervals = keyDef?.intervals;
    if (!keyIntervals) return '';
    let minDistance = Infinity;
    let closestDegree = 1;
    for (let degree = 1; degree <= 7; degree++) {
      const interval = keyIntervals[degree - 1];
      if (interval === undefined) continue;
      const scalePitchClass = (keyRootPitchClass + interval) % 12;
      const distance = Math.min(
        ((notePitchClass - scalePitchClass + 12) % 12),
        ((scalePitchClass - notePitchClass + 12) % 12),
      );
      if (distance < minDistance) { minDistance = distance; closestDegree = degree; }
    }
    const interval = keyIntervals[closestDegree - 1]!;
    const scalePitchClass = (keyRootPitchClass + interval) % 12;
    const semitoneDiff = ((notePitchClass - scalePitchClass + 12) % 12);
    if (semitoneDiff === 1 || semitoneDiff === 11) accidental = '#';
    else if (semitoneDiff === 10 || semitoneDiff === 2) accidental = 'b';
    keyDegree = closestDegree;
  }

  const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  let romanNumeral = accidental + (romanNumerals[keyDegree] ?? '');

  if (key.name === 'major') {
    if (keyDegree === 2 || keyDegree === 3 || keyDegree === 6 || keyDegree === 7) {
      romanNumeral = romanNumeral.toLowerCase();
    }
  } else if (key.name === 'natural-minor') {
    if (keyDegree === 1 || keyDegree === 4 || keyDegree === 5) {
      romanNumeral = romanNumeral.toLowerCase();
    }
  } else if (key.name === 'harmonic-minor') {
    if (keyDegree === 1 || keyDegree === 4) {
      romanNumeral = romanNumeral.toLowerCase();
    }
  } else if (key.name === 'melodic-minor') {
    if (keyDegree === 1) romanNumeral = romanNumeral.toLowerCase();
  } else {
    const diatonicTriads = getDiatonicTriads(key.name);
    const chordType = diatonicTriads[keyDegree - 1];
    if (chordType === 'min' || chordType === 'dim') {
      romanNumeral = romanNumeral.toLowerCase();
    }
  }
  return romanNumeral;
}
