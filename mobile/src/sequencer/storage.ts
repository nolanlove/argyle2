/**
 * Sequencer persistence — localStorage list + cloud save via /api/songs/.
 *
 * Local storage shape (key `argyle.sequences`):
 *   [{ id, title, bpm, steps, createdAt, updatedAt }, ...]
 *
 * Storage is injectable for tests; if no storage is available (SSR, private
 * mode throwing), reads return [] and writes are silently dropped.
 */

import type { Sequence, CloudSongRef } from './types';
import type { StorageLike } from '../grid/api';

const DEFAULT_KEY = 'argyle.sequences';

export interface StorageDeps {
  storage?: StorageLike | null;
  storageKey?: string;
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

function resolveStorage(deps: StorageDeps): { storage: StorageLike | null; key: string } {
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const key = deps.storageKey ?? DEFAULT_KEY;
  return { storage, key };
}

function isSequence(v: unknown): v is Sequence {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Sequence;
  return (
    typeof s.id === 'string' &&
    typeof s.title === 'string' &&
    typeof s.bpm === 'number' &&
    Array.isArray(s.steps) &&
    typeof s.createdAt === 'number' &&
    typeof s.updatedAt === 'number'
  );
}

export function loadSequences(deps: StorageDeps = {}): Sequence[] {
  const { storage, key } = resolveStorage(deps);
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSequence);
  } catch {
    return [];
  }
}

function persistAll(list: Sequence[], deps: StorageDeps): void {
  const { storage, key } = resolveStorage(deps);
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(list));
  } catch {
    // Quota / private mode: swallow.
  }
}

/** Upsert by id. Returns the updated list. */
export function saveSequence(seq: Sequence, deps: StorageDeps = {}): Sequence[] {
  const list = loadSequences(deps);
  const idx = list.findIndex((s) => s.id === seq.id);
  if (idx >= 0) list[idx] = seq;
  else list.push(seq);
  persistAll(list, deps);
  return list;
}

export function deleteSequence(id: string, deps: StorageDeps = {}): Sequence[] {
  const list = loadSequences(deps).filter((s) => s.id !== id);
  persistAll(list, deps);
  return list;
}

export function newSequenceId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  const r = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `${r()}${r()}-${r()}-${r()}-${r()}-${r()}${r()}${r()}`;
}

// ---------- cloud save ----------

export interface CloudSaveOpts {
  /** Base URL for the API; default '' (same-origin). */
  baseUrl?: string;
  /** Override fetch (for tests). */
  fetchImpl?: typeof fetch;
}

/**
 * POST the sequence to /api/songs/. The Song model has:
 *   title:str, sequence:TEXT(json), bpm:int, key_info:str?, notes:str?
 *
 * We stuff `steps` (the full chord-cell list) into `sequence` as JSON. This
 * fits the existing model without a migration. Returns the created song's
 * id + title for the UI to confirm.
 */
export async function saveSequenceToCloud(
  seq: Sequence,
  opts: CloudSaveOpts = {},
): Promise<CloudSongRef> {
  const baseUrl = opts.baseUrl ?? '';
  const fetchImpl = opts.fetchImpl ?? fetch;
  const body = {
    title: seq.title,
    sequence: JSON.stringify({ version: 1, steps: seq.steps }),
    bpm: seq.bpm,
  };
  const res = await fetchImpl(`${baseUrl}/api/songs/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Cloud save failed (${res.status}): ${text || res.statusText}`);
  }
  const json = await res.json() as { id: number; title: string; created_at: string };
  return { id: json.id, title: json.title, createdAt: json.created_at };
}
