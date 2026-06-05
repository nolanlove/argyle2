/**
 * Setup store — persists the player's grid setup (key root, scale, label
 * mode, clone display) in localStorage under `argyle.setup`. Pure helpers;
 * the hook layer lives in App.tsx.
 *
 * If localStorage is unavailable (SSR, private mode), reads default to a C
 * Major / note-name / clones-on setup and writes silently no-op.
 */

import type { StorageLike } from '../grid/api';
import type { LabelMode } from '../grid/renderer';
import type { KeyMode } from '../core';
import { validateKeyType } from '../core';

export interface Setup {
  /** Key root pitch class, 0..11 (C..B). */
  rootPc: number;
  /** Scale / mode. */
  scale: KeyMode;
  /** What each cell prints. */
  labelMode: LabelMode;
  /** Light every clone of a played pitch. */
  clones: boolean;
}

export const SETUP_STORAGE_KEY = 'argyle.setup';

export const DEFAULT_SETUP: Setup = {
  rootPc: 0,
  scale: 'major',
  labelMode: 'notes',
  clones: true,
};

const LABEL_MODES: readonly LabelMode[] = ['notes', 'degrees', 'roman', 'none'];

function isLabelMode(v: unknown): v is LabelMode {
  return typeof v === 'string' && (LABEL_MODES as readonly string[]).includes(v);
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

export interface SetupStoreDeps {
  storage?: StorageLike | null;
  storageKey?: string;
}

export function loadSetup(deps: SetupStoreDeps = {}): Setup {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const key = deps.storageKey ?? SETUP_STORAGE_KEY;
  if (!storage) return { ...DEFAULT_SETUP };
  try {
    const raw = storage.getItem(key);
    if (!raw) return { ...DEFAULT_SETUP };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETUP };
    const p = parsed as Record<string, unknown>;
    return {
      rootPc: typeof p['rootPc'] === 'number' ? ((p['rootPc'] % 12) + 12) % 12 : DEFAULT_SETUP.rootPc,
      scale: validateKeyType(p['scale']) ? p['scale'] : DEFAULT_SETUP.scale,
      labelMode: isLabelMode(p['labelMode']) ? p['labelMode'] : DEFAULT_SETUP.labelMode,
      clones: typeof p['clones'] === 'boolean' ? p['clones'] : DEFAULT_SETUP.clones,
    };
  } catch {
    return { ...DEFAULT_SETUP };
  }
}

export function saveSetup(setup: Setup, deps: SetupStoreDeps = {}): void {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const key = deps.storageKey ?? SETUP_STORAGE_KEY;
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(setup));
  } catch {
    // swallow (quota / private mode)
  }
}
