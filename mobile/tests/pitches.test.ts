import { describe, it, expect } from 'vitest';
import {
  noteToPitchClass,
  pitchClassToNote,
  getPitchFromNote,
  getNoteFromPitch,
  pitchToNoteAndOctave,
  getPitchInfo,
  getChromaticOffset,
  normalizeNoteName,
  musicalNotes,
  musicalNotesFlats,
  isMusicalKey,
} from '../src/core';

describe('note <-> pitch round trips', () => {
  it('C4 = 60', () => {
    expect(getPitchFromNote('C', 4)).toBe(60);
    const info = getNoteFromPitch(60);
    expect(info?.note).toBe('C');
    expect(info?.octave).toBe(4);
  });

  it('A4 = 69', () => {
    expect(getPitchFromNote('A', 4)).toBe(69);
    const info = getNoteFromPitch(69);
    expect(info?.note).toBe('A');
    expect(info?.octave).toBe(4);
  });

  it('C2 = 36 (MIDI convention)', () => {
    expect(getPitchFromNote('C', 2)).toBe(36);
  });

  it('edge: lowest C-1 (0) and highest G9 (127)', () => {
    expect(getPitchFromNote('C', -1)).toBe(0);
    expect(getPitchFromNote('G', 9)).toBe(127);
  });

  it('flat names map to same pitch class as sharps', () => {
    expect(noteToPitchClass('Db')).toBe(noteToPitchClass('C#'));
    expect(noteToPitchClass('Eb')).toBe(noteToPitchClass('D#'));
    expect(noteToPitchClass('Bb')).toBe(noteToPitchClass('A#'));
  });

  it('pitch class wrap', () => {
    expect(getChromaticOffset(0, 11)).toBe(1);
    expect(getChromaticOffset(11, 0)).toBe(11);
    expect(getChromaticOffset(5, 5)).toBe(0);
  });
});

describe('pitchClassToNote / pitchToNoteAndOctave', () => {
  it('out-of-range returns null', () => {
    expect(pitchClassToNote(-1)).toBeNull();
    expect(pitchClassToNote(12)).toBeNull();
  });

  it('useFlats switch', () => {
    expect(pitchClassToNote(1, false)).toBe('C#');
    expect(pitchClassToNote(1, true)).toBe('Db');
  });

  it('pitchToNoteAndOctave for C4', () => {
    expect(pitchToNoteAndOctave(60)).toEqual({ note: 'C', octave: 4 });
  });
});

describe('getPitchInfo', () => {
  it('returns enharmonics flag', () => {
    const info = getPitchInfo(61); // C#4 / Db4
    expect(info?.sharp).toBe('C#');
    expect(info?.flat).toBe('Db');
    expect(info?.hasEnharmonics).toBe(true);
    expect(info?.sharpWithOctave).toBe('C#4');
  });

  it('natural notes have no enharmonics', () => {
    const info = getPitchInfo(60); // C4
    expect(info?.hasEnharmonics).toBe(false);
  });
});

describe('misc', () => {
  it('normalizeNoteName converts flats to sharps', () => {
    expect(normalizeNoteName('Db')).toBe('C#');
    expect(normalizeNoteName('Bb')).toBe('A#');
    expect(normalizeNoteName('C')).toBe('C');
  });

  it('musicalNotes constants are length 12', () => {
    expect(musicalNotes.length).toBe(12);
    expect(musicalNotesFlats.length).toBe(12);
  });

  it('isMusicalKey is case-insensitive', () => {
    expect(isMusicalKey('A')).toBe(true);
    expect(isMusicalKey('a')).toBe(true);
    expect(isMusicalKey('z')).toBe(false);
  });
});
