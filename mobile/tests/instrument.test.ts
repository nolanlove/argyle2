/**
 * Instrument API tests — pure-logic surface only (chord builder, saved-chord
 * persistence, listener subscribe/unsubscribe). Renderer + audio integration
 * is verified manually (requires DOM canvas + Web Audio).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createInstrument } from '../src/grid/api';
import type {
  ArgyleInstrument,
  StorageLike,
  SavedChord,
} from '../src/grid/api';
import type { GridCoord } from '../src/core';

// ---- stubs ----

function makeStubRenderer() {
  return {
    setKey: () => {},
    setPlayMode: () => {},
    highlightCells: () => {},
    clearHighlights: () => {},
    setHighlight: () => {},
    cellsForPitch: () => [],
  } as unknown as Parameters<typeof createInstrument>[0]['renderer'];
}

function makeStubAudio() {
  const stub = {
    init: async () => {},
    isReady: () => true,
    // tag() is chainable on the real engine (audio.tag('x').playNote(...)) —
    // return the stub so the chain resolves.
    tag: () => stub,
    playNote: () => {},
    playChord: () => {},
    stopAll: () => {},
  };
  return stub as unknown as Parameters<typeof createInstrument>[0]['audio'];
}

class MemStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

function make(storage?: MemStorage): ArgyleInstrument {
  return createInstrument({
    renderer: makeStubRenderer(),
    audio: makeStubAudio(),
    originPitch: 0,
    gridWidth: 20,
    gridHeight: 20,
    storage: storage ?? null,
  });
}

// ---- tests ----

describe('chord builder', () => {
  let inst: ArgyleInstrument;
  beforeEach(() => { inst = make(); });

  it('add/remove/clear/current', () => {
    expect(inst.builder.current()).toEqual([]);
    inst.builder.add({ x: 1, y: 1 });
    inst.builder.add({ x: 2, y: 2 });
    expect(inst.builder.current()).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
    // dedupe
    inst.builder.add({ x: 1, y: 1 });
    expect(inst.builder.current()).toHaveLength(2);
    inst.builder.remove({ x: 1, y: 1 });
    expect(inst.builder.current()).toEqual([{ x: 2, y: 2 }]);
    inst.builder.clear();
    expect(inst.builder.current()).toEqual([]);
  });

  it('current() returns a snapshot, not the live array', () => {
    inst.builder.add({ x: 3, y: 3 });
    const snap = inst.builder.current();
    snap.push({ x: 99, y: 99 });
    expect(inst.builder.current()).toEqual([{ x: 3, y: 3 }]);
  });
});

describe('chord builder onChange', () => {
  it('fires on add/remove/clear and unsubscribe stops it', () => {
    const inst = make();
    const calls: GridCoord[][] = [];
    const off = inst.builder.onChange((cells) => calls.push(cells));

    inst.builder.add({ x: 0, y: 0 });
    inst.builder.add({ x: 1, y: 1 });
    inst.builder.remove({ x: 0, y: 0 });
    inst.builder.clear();
    expect(calls).toHaveLength(4);
    expect(calls[3]).toEqual([]);

    off();
    inst.builder.add({ x: 5, y: 5 });
    expect(calls).toHaveLength(4);
  });

  it('does not fire on dedup add or on no-op clear', () => {
    const inst = make();
    let n = 0;
    inst.builder.onChange(() => { n++; });

    inst.builder.add({ x: 0, y: 0 });
    expect(n).toBe(1);
    inst.builder.add({ x: 0, y: 0 }); // dedup
    expect(n).toBe(1);
    inst.builder.clear();
    expect(n).toBe(2);
    inst.builder.clear(); // already empty
    expect(n).toBe(2);
  });
});

describe('saved-chord localStorage round trip', () => {
  let storage: MemStorage;
  beforeEach(() => { storage = new MemStorage(); });

  it('save persists to storage and survives reconstruction', () => {
    const a = make(storage);
    a.builder.add({ x: 0, y: 0 });    // C-1 (pitch 0)
    a.builder.add({ x: 1, y: 1 });    // 4+3 = 7 (G-1)
    const entry = a.builder.save('test');
    expect(entry.name).toBe('test');
    expect(entry.cells).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(entry.pitches).toEqual([0, 7]);
    expect(typeof entry.id).toBe('string');
    expect(entry.id.length).toBeGreaterThan(0);

    // Hydrate a fresh instrument from the same storage.
    const b = make(storage);
    const restored = b.builder.saved();
    expect(restored).toHaveLength(1);
    expect(restored[0]?.name).toBe('test');
    expect(restored[0]?.cells).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    expect(restored[0]?.pitches).toEqual([0, 7]);
  });

  it('saved() returns deep copies (mutation does not leak)', () => {
    const a = make(storage);
    a.builder.add({ x: 2, y: 0 });
    a.builder.save('x');
    const list = a.builder.saved();
    list[0]!.cells[0]!.x = 999;
    list[0]!.pitches[0] = 999;
    const fresh = a.builder.saved();
    expect(fresh[0]?.cells[0]?.x).toBe(2);
    expect(fresh[0]?.pitches[0]).not.toBe(999);
  });

  it('drops malformed entries on hydrate', () => {
    storage.setItem(
      'argyle.saved_chords',
      JSON.stringify([
        { id: 'ok', name: 'ok', cells: [], pitches: [], createdAt: 1 },
        { name: 'missing fields' },
        'not an object',
        null,
      ]),
    );
    const inst = make(storage);
    const saved = inst.builder.saved();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.id).toBe('ok');
  });

  it('survives non-JSON in storage', () => {
    storage.setItem('argyle.saved_chords', 'garbage{{');
    const inst = make(storage);
    expect(inst.builder.saved()).toEqual([]);
  });
});

describe('onUserPlay subscribe/unsubscribe', () => {
  it('fires on simulated hits and unsubscribe stops it (no leak)', () => {
    const inst = make();
    const events: GridCoord[][] = [];
    const off = inst.onUserPlay((cells) => events.push(cells));

    inst.__handleUserHit({ gx: 1, gy: 2, pitch: 10 });
    inst.__handleUserHit({ gx: 3, gy: 4, pitch: 21 });
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual([{ x: 1, y: 2 }]);

    off();
    inst.__handleUserHit({ gx: 5, gy: 5, pitch: 35 });
    expect(events).toHaveLength(2);
  });

  it('multiple subscribers all receive events; one unsubscribe does not affect others', () => {
    const inst = make();
    let a = 0, b = 0;
    const offA = inst.onUserPlay(() => { a++; });
    inst.onUserPlay(() => { b++; });

    inst.__handleUserHit({ gx: 0, gy: 0, pitch: 0 });
    expect(a).toBe(1);
    expect(b).toBe(1);

    offA();
    inst.__handleUserHit({ gx: 0, gy: 0, pitch: 0 });
    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  it('chord-builder mode adds to builder AND fires onUserPlay', () => {
    const inst = make();
    inst.setPlayMode('chord-builder');
    const evs: GridCoord[][] = [];
    inst.onUserPlay((c) => evs.push(c));

    inst.__handleUserHit({ gx: 2, gy: 3, pitch: 17 });
    expect(inst.builder.current()).toEqual([{ x: 2, y: 3 }]);
    expect(evs).toEqual([[{ x: 2, y: 3 }]]);
  });
});

describe('saved-chord shape', () => {
  it('SavedChord typed entries carry createdAt timestamps', () => {
    const inst = make(new MemStorage());
    inst.builder.add({ x: 0, y: 0 });
    const entry: SavedChord = inst.builder.save('t');
    expect(entry.createdAt).toBeGreaterThan(0);
    expect(entry.createdAt).toBeLessThanOrEqual(Date.now());
  });
});
