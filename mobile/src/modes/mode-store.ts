/**
 * Mode store — persists the active app mode in localStorage under
 * `argyle.mode`. Pure helpers; the hook layer lives in App.tsx.
 *
 * Cycling order is deterministic: teacher → songwriter → lab → teacher.
 * If localStorage is unavailable (SSR, private mode), reads default to
 * 'teacher' and writes silently no-op.
 */

import type { StorageLike } from '../grid/api';

export type AppMode = 'teacher' | 'songwriter' | 'lab';

export const MODE_STORAGE_KEY = 'argyle.mode';

const ORDER: readonly AppMode[] = ['teacher', 'songwriter', 'lab'];

function isAppMode(v: unknown): v is AppMode {
  return v === 'teacher' || v === 'songwriter' || v === 'lab';
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
      return ls ?? null;
    }
  } catch {
    // Some embedded contexts throw on access.
  }
  return null;
}

export interface ModeStoreDeps {
  storage?: StorageLike | null;
  storageKey?: string;
}

export function loadMode(deps: ModeStoreDeps = {}): AppMode {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const key = deps.storageKey ?? MODE_STORAGE_KEY;
  if (!storage) return 'teacher';
  try {
    const raw = storage.getItem(key);
    if (raw && isAppMode(raw)) return raw;
  } catch {
    // fall through
  }
  return 'teacher';
}

export function saveMode(mode: AppMode, deps: ModeStoreDeps = {}): void {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const key = deps.storageKey ?? MODE_STORAGE_KEY;
  if (!storage) return;
  try {
    storage.setItem(key, mode);
  } catch {
    // swallow
  }
}

export function nextMode(current: AppMode): AppMode {
  const idx = ORDER.indexOf(current);
  const nextIdx = (idx + 1) % ORDER.length;
  return ORDER[nextIdx] ?? 'teacher';
}

export function modeLabel(mode: AppMode): string {
  switch (mode) {
    case 'teacher': return 'Teacher';
    case 'songwriter': return 'Songwriter';
    case 'lab': return 'Lab';
  }
}
