import { describe, it, expect } from 'vitest';
import {
  keys,
  generateKeyPitchClasses,
  generateKeyNotes,
  getKeySignature,
  shouldUseFlats,
  isPitchClassInKey,
  isPitchInKey,
  getKeyDegree,
  generateAscendingScalePattern,
  validateKeyType,
  getIntervalName,
} from '../src/core';

describe('key pitch classes', () => {
  it('C major = [0,2,4,5,7,9,11]', () => {
    expect(generateKeyPitchClasses(0, 'major')).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });

  it('A natural minor = [9,11,0,2,4,5,7]', () => {
    expect(generateKeyPitchClasses(9, 'natural-minor')).toEqual([9, 11, 0, 2, 4, 5, 7]);
  });

  it('C major key notes use sharps', () => {
    expect(generateKeyNotes(0, 'major')).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  });

  it('F major key notes use flats (Bb)', () => {
    expect(generateKeyNotes(5, 'major')).toEqual(['F', 'G', 'A', 'Bb', 'C', 'D', 'E']);
  });
});

describe('key signatures', () => {
  it('C major has no accidentals', () => {
    expect(getKeySignature(0, 'major').accidentals).toHaveLength(0);
  });

  it('G major has one sharp (F#)', () => {
    const sig = getKeySignature(7, 'major');
    expect(sig.accidentals).toEqual([{ note: 'F', type: '#' }]);
  });

  it('F major has one flat (Bb)', () => {
    const sig = getKeySignature(5, 'major');
    expect(sig.accidentals).toEqual([{ note: 'B', type: 'b' }]);
  });

  it('shouldUseFlats — F major yes, G major no', () => {
    expect(shouldUseFlats(5, 'major')).toBe(true);
    expect(shouldUseFlats(7, 'major')).toBe(false);
  });
});

describe('key membership', () => {
  it('E is in C major', () => {
    expect(isPitchClassInKey(4, 0, 'major')).toBe(true);
  });

  it('F# is not in C major', () => {
    expect(isPitchClassInKey(6, 0, 'major')).toBe(false);
  });

  it('isPitchInKey wraps octaves', () => {
    expect(isPitchInKey(60 /* C4 */, 0, 'major')).toBe(true);
    expect(isPitchInKey(66 /* F#4 */, 0, 'major')).toBe(false);
  });

  it('getKeyDegree for G in C major = 5', () => {
    const result = getKeyDegree('G', 0, 'major', keys.major.intervals);
    expect(result?.degree).toBe(5);
  });
});

describe('ascending scale pattern', () => {
  it('C major from octave 2, 1 octave', () => {
    const pattern = generateAscendingScalePattern(0, 'major', keys, 2, 1);
    // First 7 = C2 major scale: 24, 26, 28, 29, 31, 33, 35; then final tonic C3 = 36
    expect(pattern.slice(0, 7)).toEqual([24, 26, 28, 29, 31, 33, 35]);
    expect(pattern[pattern.length - 1]).toBe(36);
  });

  it('returns [] for invalid pitch class', () => {
    expect(generateAscendingScalePattern(-1, 'major', keys, 2, 1)).toEqual([]);
  });
});

describe('misc', () => {
  it('validateKeyType', () => {
    expect(validateKeyType('major')).toBe(true);
    expect(validateKeyType('bogus')).toBe(false);
  });

  it('getIntervalName', () => {
    expect(getIntervalName(0)).toBe('1');
    expect(getIntervalName(7)).toBe('5');
    expect(getIntervalName(11)).toBe('7');
  });
});
