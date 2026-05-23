/**
 * Mode persistence tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { loadMode, saveMode, nextMode, modeLabel, MODE_STORAGE_KEY } from '../src/modes/mode-store';
import type { StorageLike } from '../src/grid/api';

class MemStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

describe('mode-store', () => {
  let storage: MemStorage;
  beforeEach(() => { storage = new MemStorage(); });

  it('defaults to teacher when storage is empty', () => {
    expect(loadMode({ storage })).toBe('teacher');
  });

  it('defaults to teacher when storage is null (no-window context)', () => {
    expect(loadMode({ storage: null })).toBe('teacher');
  });

  it('persists across "reloads"', () => {
    saveMode('songwriter', { storage });
    // Simulate a reload by reading from the same storage.
    expect(loadMode({ storage })).toBe('songwriter');
  });

  it('writes to the canonical key', () => {
    saveMode('lab', { storage });
    expect(storage.getItem(MODE_STORAGE_KEY)).toBe('lab');
  });

  it('ignores garbage values in storage', () => {
    storage.setItem(MODE_STORAGE_KEY, 'wat');
    expect(loadMode({ storage })).toBe('teacher');
  });

  it('cycles teacher → songwriter → lab → teacher', () => {
    expect(nextMode('teacher')).toBe('songwriter');
    expect(nextMode('songwriter')).toBe('lab');
    expect(nextMode('lab')).toBe('teacher');
  });

  it('labels each mode', () => {
    expect(modeLabel('teacher')).toBe('Teacher');
    expect(modeLabel('songwriter')).toBe('Songwriter');
    expect(modeLabel('lab')).toBe('Lab');
  });

  it('no-ops gracefully when storage is unavailable', () => {
    // Should not throw.
    saveMode('songwriter', { storage: null });
    expect(loadMode({ storage: null })).toBe('teacher');
  });
});
