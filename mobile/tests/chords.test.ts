import { describe, it, expect } from 'vitest';
import {
  chordTypes,
  generateChordPitchClasses,
  generateChordPitches,
  getShortChordName,
  validateChordType,
  getRomanNumeralForChordInKey,
  getRomanNumeralForNoteInKey,
  getDiatonicTriads,
  getDiatonicTetrads,
} from '../src/core';

describe('chord generation', () => {
  it('C major triad', () => {
    expect(generateChordPitchClasses(0, 'maj')).toEqual([0, 4, 7]);
  });

  it('C minor 7 = [0,3,7,10]', () => {
    expect(generateChordPitchClasses(0, 'min7')).toEqual([0, 3, 7, 10]);
  });

  it('A min chord pitch classes [9,0,4]', () => {
    expect(generateChordPitchClasses(9, 'min')).toEqual([9, 0, 4]);
  });

  it('C maj absolute pitches at octave 3 = [48, 52, 55]', () => {
    expect(generateChordPitches('C', 'maj')).toEqual([48, 52, 55]);
  });
});

describe('chord catalog', () => {
  it('catalog has expected entries', () => {
    expect(chordTypes.maj.intervals).toEqual([0, 4, 7]);
    expect(chordTypes.min7.intervals).toEqual([0, 3, 7, 10]);
    expect(chordTypes.dom7.intervals).toEqual([0, 4, 7, 10]);
  });

  it('validateChordType', () => {
    expect(validateChordType('maj')).toBe(true);
    expect(validateChordType('m')).toBe(true); // mapped
    expect(validateChordType('7')).toBe(true); // mapped
    expect(validateChordType('bogus')).toBe(false);
  });

  it('getShortChordName', () => {
    expect(getShortChordName('maj')).toBe('');
    expect(getShortChordName('min')).toBe('m');
    expect(getShortChordName('maj7')).toBe('M7');
  });
});

describe('roman numerals', () => {
  it('I, IV, V in C major', () => {
    const cMajor = { rootPitchClass: 0, name: 'major' };
    expect(getRomanNumeralForChordInKey(0, 'maj', cMajor)).toBe('I');
    expect(getRomanNumeralForChordInKey(5, 'maj', cMajor)).toBe('IV');
    expect(getRomanNumeralForChordInKey(7, 'maj', cMajor)).toBe('V');
  });

  it('ii in D major (E minor)', () => {
    const dMajor = { rootPitchClass: 2, name: 'major' };
    // 2nd degree of D major is E (pitch class 4), minor.
    expect(getRomanNumeralForChordInKey(4, 'min', dMajor)).toBe('ii');
  });

  it('V7 in C major', () => {
    const cMajor = { rootPitchClass: 0, name: 'major' };
    expect(getRomanNumeralForChordInKey(7, 'dom7', cMajor)).toBe('V7');
  });

  it('Roman numeral for note (no chord)', () => {
    const cMajor = { rootNote: 'C', name: 'major' };
    expect(getRomanNumeralForNoteInKey('C', cMajor)).toBe('I');
    expect(getRomanNumeralForNoteInKey('D', cMajor)).toBe('ii');
    expect(getRomanNumeralForNoteInKey('G', cMajor)).toBe('V');
  });
});

describe('diatonic patterns', () => {
  it('major triads start with maj, min, min, maj, maj, min, dim', () => {
    const t = getDiatonicTriads('major');
    expect(t.slice(0, 7)).toEqual(['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim']);
  });

  it('major tetrads start with maj7, min7, min7, maj7, dom7, min7, half-dim7', () => {
    const t = getDiatonicTetrads('major');
    expect(t.slice(0, 7)).toEqual(['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'half-dim7']);
  });

  it('falls back to major for invalid key types', () => {
    const t = getDiatonicTriads('bogus');
    expect(t.slice(0, 3)).toEqual(['maj', 'min', 'min']);
  });
});
