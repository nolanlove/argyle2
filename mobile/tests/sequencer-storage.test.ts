/**
 * Sequencer storage tests — localStorage round-trip + cloud-save POST shape.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSequences,
  saveSequence,
  deleteSequence,
  newSequenceId,
  saveSequenceToCloud,
} from '../src/sequencer/storage';
import type { Sequence } from '../src/sequencer/types';
import type { StorageLike } from '../src/grid/api';

class MemStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

function mkSeq(partial: Partial<Sequence> = {}): Sequence {
  const now = Date.now();
  return {
    id: partial.id ?? newSequenceId(),
    title: partial.title ?? 'Untitled',
    bpm: partial.bpm ?? 120,
    steps: partial.steps ?? [
      { chordCells: [{ x: 0, y: 0 }, { x: 1, y: 1 }], durationMs: 500 },
    ],
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
  };
}

describe('sequencer storage', () => {
  let storage: MemStorage;
  beforeEach(() => { storage = new MemStorage(); });

  it('returns [] when nothing stored', () => {
    expect(loadSequences({ storage })).toEqual([]);
  });

  it('round-trips a single sequence', () => {
    const seq = mkSeq({ title: 'Tune A' });
    saveSequence(seq, { storage });
    const loaded = loadSequences({ storage });
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.title).toBe('Tune A');
    expect(loaded[0]?.steps[0]?.chordCells).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  });

  it('upserts by id', () => {
    const seq = mkSeq({ title: 'v1' });
    saveSequence(seq, { storage });
    const updated: Sequence = { ...seq, title: 'v2', updatedAt: seq.updatedAt + 1 };
    saveSequence(updated, { storage });
    const loaded = loadSequences({ storage });
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.title).toBe('v2');
  });

  it('appends distinct ids', () => {
    saveSequence(mkSeq({ title: 'A' }), { storage });
    saveSequence(mkSeq({ title: 'B' }), { storage });
    const loaded = loadSequences({ storage });
    expect(loaded.map((s) => s.title).sort()).toEqual(['A', 'B']);
  });

  it('deletes by id', () => {
    const a = mkSeq({ title: 'A' });
    const b = mkSeq({ title: 'B' });
    saveSequence(a, { storage });
    saveSequence(b, { storage });
    deleteSequence(a.id, { storage });
    const loaded = loadSequences({ storage });
    expect(loaded.map((s) => s.title)).toEqual(['B']);
  });

  it('drops malformed entries silently', () => {
    storage.setItem('argyle.sequences', JSON.stringify([
      { id: 'ok', title: 't', bpm: 120, steps: [], createdAt: 1, updatedAt: 1 },
      { id: 42, title: 'bad' }, // bad shape
      null,
    ]));
    const loaded = loadSequences({ storage });
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe('ok');
  });

  it('survives invalid JSON in storage', () => {
    storage.setItem('argyle.sequences', '{not json');
    expect(loadSequences({ storage })).toEqual([]);
  });
});

describe('cloud save', () => {
  it('POSTs to /api/songs/ with JSON-stringified sequence', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, init });
      return new Response(
        JSON.stringify({ id: 7, title: 'Tune A', created_at: '2026-05-23T00:00:00Z' }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      );
    };
    const seq = mkSeq({ title: 'Tune A', bpm: 90 });
    const ref = await saveSequenceToCloud(seq, { fetchImpl: fakeFetch });
    expect(ref).toEqual({ id: 7, title: 'Tune A', createdAt: '2026-05-23T00:00:00Z' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('/api/songs/');
    const body = JSON.parse((calls[0]?.init?.body as string) ?? '{}') as {
      title: string; sequence: string; bpm: number;
    };
    expect(body.title).toBe('Tune A');
    expect(body.bpm).toBe(90);
    const inner = JSON.parse(body.sequence) as { version: number; steps: unknown[] };
    expect(inner.version).toBe(1);
    expect(inner.steps).toHaveLength(1);
  });

  it('throws on non-2xx', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response('nope', { status: 401, statusText: 'Unauthorized' });
    await expect(
      saveSequenceToCloud(mkSeq(), { fetchImpl: fakeFetch }),
    ).rejects.toThrow(/401/);
  });
});
