/**
 * Tool-call dispatcher tests. Uses a mock ArgyleInstrument subset — the
 * dispatcher only needs the imperative methods, not the gesture/builder/
 * onUserPlay surface.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// tool-calls.ts dynamically imports the real audio engine (Tone.js) for the
// play_pattern_from_pitches path. Tone touches browser globals at import time
// and throws under the node test env, which the dispatcher catches as
// { ok: false }. Stub the engine with a chainable no-op so the dispatcher
// reaches the instrument calls we actually assert on.
vi.mock('../src/audio/engine', () => {
  const playNote = vi.fn();
  const playChord = vi.fn();
  const audio = {
    // tag() is chainable: audio.tag('x').playChord(...).
    tag: () => audio,
    playNote,
    playChord,
    isReady: () => true,
    init: async () => {},
    stopAll: () => {},
  };
  return { audio };
});

import { executeToolCall } from '../src/chat/tool-calls';
import { audio as mockAudio } from '../src/audio/engine';
import type { ToolTargetInstrument } from '../src/chat/tool-calls';
import type { ToolCall } from '../src/chat/types';
import type { GridCoord, KeyMode } from '../src/core';
import type { HighlightOpts, ProgressionStep } from '../src/grid/api';

interface RecordedCall {
  name: string;
  args: unknown[];
}

function makeMockInstrument() {
  const calls: RecordedCall[] = [];
  const record = (name: string, ...args: unknown[]) => {
    calls.push({ name, args });
  };
  const instrument: ToolTargetInstrument = {
    highlight: (cells: GridCoord[], opts?: HighlightOpts) => {
      record('highlight', cells, opts);
    },
    setHighlight: (cells: GridCoord[]) => {
      record('setHighlight', cells);
    },
    cellsForPitch: (midi: number) => {
      record('cellsForPitch', midi);
      // Return a single representative rendered cell per pitch so the
      // dispatcher highlights one cell per note (real renderer behavior) and
      // doesn't fall back to the all-clones path.
      return [{ x: ((midi % 20) + 20) % 20, y: 0 }];
    },
    clearHighlight: () => { record('clearHighlight'); },
    playChord: async (cells: GridCoord[], durationMs?: number) => {
      record('playChord', cells, durationMs);
    },
    playNote: async (cell: GridCoord, durationMs?: number) => {
      record('playNote', cell, durationMs);
    },
    playProgression: async (steps: ProgressionStep[]) => {
      record('playProgression', steps);
    },
    setKey: (pc: number, mode: KeyMode) => {
      record('setKey', pc, mode);
    },
  };
  return { instrument, calls };
}

function call(name: string, args: Record<string, unknown>): ToolCall {
  return { id: 'call_1', name, arguments: args };
}

describe('executeToolCall — happy path', () => {
  let mock: ReturnType<typeof makeMockInstrument>;
  beforeEach(() => {
    mock = makeMockInstrument();
    vi.mocked(mockAudio.playNote).mockClear();
    vi.mocked(mockAudio.playChord).mockClear();
  });

  it('highlights cells', async () => {
    const res = await executeToolCall(mock.instrument, call('highlight_cells', {
      cells: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
      duration_ms: 500,
    }));
    expect(res.ok).toBe(true);
    expect(mock.calls[0]?.name).toBe('highlight');
    expect(mock.calls[0]?.args[0]).toEqual([{ x: 1, y: 2 }, { x: 3, y: 4 }]);
    expect(mock.calls[0]?.args[1]).toEqual({ durationMs: 500 });
  });

  it('clears highlights', async () => {
    const res = await executeToolCall(mock.instrument, call('clear_highlight', {}));
    expect(res.ok).toBe(true);
    expect(mock.calls[0]?.name).toBe('clearHighlight');
  });

  it('plays a note', async () => {
    const res = await executeToolCall(mock.instrument, call('play_note', {
      cell: { x: 5, y: 5 },
    }));
    expect(res.ok).toBe(true);
    expect(mock.calls[0]?.name).toBe('playNote');
    expect(mock.calls[0]?.args[0]).toEqual({ x: 5, y: 5 });
  });

  it('plays a chord', async () => {
    const res = await executeToolCall(mock.instrument, call('play_chord', {
      cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      duration_ms: 700,
    }));
    expect(res.ok).toBe(true);
    expect(mock.calls[0]?.args[1]).toBe(700);
  });

  it('plays a progression', async () => {
    const res = await executeToolCall(mock.instrument, call('play_progression', {
      steps: [
        { cells: [{ x: 0, y: 0 }], duration_ms: 400, label: 'I' },
        { cells: [{ x: 1, y: 1 }, { x: 2, y: 2 }], duration_ms: 600 },
      ],
    }));
    expect(res.ok).toBe(true);
    expect(mock.calls[0]?.name).toBe('playProgression');
    const steps = mock.calls[0]?.args[0] as ProgressionStep[];
    expect(steps.length).toBe(2);
    expect(steps[0]?.label).toBe('I');
    expect(steps[0]?.durationMs).toBe(400);
    expect(steps[1]?.label).toBeUndefined();
  });

  it('sets key', async () => {
    const res = await executeToolCall(mock.instrument, call('set_key', {
      root_pitch_class: 7,
      mode: 'dorian',
    }));
    expect(res.ok).toBe(true);
    expect(mock.calls[0]).toEqual({ name: 'setKey', args: [7, 'dorian'] });
  });

  it('plays pattern from pitches (block voicing)', async () => {
    const res = await executeToolCall(mock.instrument, call('play_pattern_from_pitches', {
      pitches: [60, 64, 67],
      voicing: 'block',
      duration_ms: 800,
    }));
    expect(res.ok).toBe(true);
    // Audio gets the AI's EXACT pitches (the dispatcher bypasses the instrument
    // for sound — see the round-trip comment in tool-calls.ts — and uses the
    // instrument only to highlight the matching cells).
    expect(vi.mocked(mockAudio.playChord)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mockAudio.playChord).mock.calls[0]).toEqual([[60, 64, 67], 800]);
    // 3 pitches → 3 highlighted cells via setHighlight.
    const setHi = mock.calls.find((c) => c.name === 'setHighlight' && (c.args[0] as GridCoord[]).length > 0);
    expect((setHi?.args[0] as GridCoord[]).length).toBe(3);
  });

  it('plays pattern from pitches (arpeggio_up sorts ascending)', async () => {
    const res = await executeToolCall(mock.instrument, call('play_pattern_from_pitches', {
      pitches: [67, 60, 64],
      voicing: 'arpeggio_up',
      step_ms: 200,
    }));
    expect(res.ok).toBe(true);
    // Arpeggio plays one note per step, in ascending pitch order, each for step_ms.
    expect(vi.mocked(mockAudio.playNote)).toHaveBeenCalledTimes(3);
    const noteCalls = vi.mocked(mockAudio.playNote).mock.calls;
    expect(noteCalls.map((c) => c[0])).toEqual([60, 64, 67]);
    expect(noteCalls.every((c) => c[1] === 200)).toBe(true);
  });
});

describe('executeToolCall — validation rejects bad shapes', () => {
  let mock: ReturnType<typeof makeMockInstrument>;
  beforeEach(() => { mock = makeMockInstrument(); });

  it('rejects unknown tool', async () => {
    const res = await executeToolCall(mock.instrument, call('not_a_tool', {}));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('unknown tool');
  });

  it('rejects empty cells array', async () => {
    const res = await executeToolCall(mock.instrument, call('highlight_cells', { cells: [] }));
    expect(res.ok).toBe(false);
  });

  it('rejects non-array cells', async () => {
    const res = await executeToolCall(mock.instrument, call('play_chord', { cells: 'nope' }));
    expect(res.ok).toBe(false);
  });

  it('rejects negative or non-integer coords', async () => {
    const r1 = await executeToolCall(mock.instrument, call('play_chord', {
      cells: [{ x: -1, y: 0 }],
    }));
    expect(r1.ok).toBe(false);
    const r2 = await executeToolCall(mock.instrument, call('play_note', {
      cell: { x: 1.5, y: 0 },
    }));
    expect(r2.ok).toBe(false);
  });

  it('rejects bad duration_ms', async () => {
    const res = await executeToolCall(mock.instrument, call('play_chord', {
      cells: [{ x: 0, y: 0 }],
      duration_ms: -100,
    }));
    expect(res.ok).toBe(false);
  });

  it('rejects set_key out of range', async () => {
    const res = await executeToolCall(mock.instrument, call('set_key', {
      root_pitch_class: 12,
      mode: 'major',
    }));
    expect(res.ok).toBe(false);
  });

  it('rejects unknown key mode', async () => {
    const res = await executeToolCall(mock.instrument, call('set_key', {
      root_pitch_class: 0,
      mode: 'bogus-mode',
    }));
    expect(res.ok).toBe(false);
  });

  it('rejects play_pattern with bad voicing', async () => {
    const res = await executeToolCall(mock.instrument, call('play_pattern_from_pitches', {
      pitches: [60],
      voicing: 'sideways',
    }));
    expect(res.ok).toBe(false);
  });

  it('rejects play_pattern with out-of-range MIDI', async () => {
    const res = await executeToolCall(mock.instrument, call('play_pattern_from_pitches', {
      pitches: [200],
      voicing: 'block',
    }));
    expect(res.ok).toBe(false);
  });
});
