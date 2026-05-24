/**
 * Tool-call dispatcher: map an AI ToolCall (JSON args from the server) to a
 * call on the ArgyleInstrument. Validates argument shape and returns a
 * structured result so the chat loop can append a `role:tool` message and
 * the UI can render an inline chip.
 *
 * Pure logic: takes an instrument-shaped argument so it's straightforward
 * to test against a mock.
 */

import type {
  ArgyleInstrument,
  ProgressionStep,
} from '../grid/api';
import type { KeyMode } from '../core';
import { getAllCloneCoordsForPitch, keys } from '../core';
import type { CellCoord, ToolCall, ToolExecResult } from './types';

// Lazy-load the audio singleton so importing this module in Node tests
// doesn't transitively pull in Tone.js (which needs Web Audio APIs).
let _audio: typeof import('../audio/engine').audio | null = null;
async function getAudio() {
  if (_audio) return _audio;
  const mod = await import('../audio/engine');
  _audio = mod.audio;
  return _audio;
}

// The grid dimensions are fixed at the mount site (Grid.tsx). Keep these in
// sync — if they ever become dynamic, plumb through from there.
const GRID_WIDTH = 20;
const GRID_HEIGHT = 20;
const ORIGIN_PITCH = 0;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
function midiToLabel(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc]}${octave}`;
}
function pitchListLabel(pitches: readonly number[]): string {
  if (pitches.length === 0) return '∅';
  if (pitches.length > 5) return `${pitches.length} notes`;
  return pitches.map(midiToLabel).join('-');
}

/** Subset of ArgyleInstrument the dispatcher actually calls. */
export interface ToolTargetInstrument {
  highlight: ArgyleInstrument['highlight'];
  clearHighlight: ArgyleInstrument['clearHighlight'];
  playChord: ArgyleInstrument['playChord'];
  playNote: ArgyleInstrument['playNote'];
  playProgression: ArgyleInstrument['playProgression'];
  setKey: ArgyleInstrument['setKey'];
}

export interface ExecuteOpts {
  /** Defaults to module-level grid constants; tests can override. */
  gridWidth?: number;
  gridHeight?: number;
  originPitch?: number;
}

/**
 * Execute one tool call against the instrument. Always resolves — bad input
 * surfaces as `{ ok: false, error }`. Audio errors from the instrument do
 * not throw here; they bubble as rejections from the called method, which
 * we catch and convert.
 */
export async function executeToolCall(
  instrument: ToolTargetInstrument,
  call: ToolCall,
  opts: ExecuteOpts = {},
): Promise<ToolExecResult> {
  const gw = opts.gridWidth ?? GRID_WIDTH;
  const gh = opts.gridHeight ?? GRID_HEIGHT;
  const origin = opts.originPitch ?? ORIGIN_PITCH;

  try {
    switch (call.name) {
      case 'highlight_cells': {
        const cells = validateCells(call.arguments['cells']);
        if (!cells.ok) return cells;
        const duration = optionalPositiveInt(call.arguments['duration_ms']);
        if (!duration.ok) return duration;
        instrument.highlight(cells.value, duration.value !== undefined
          ? { durationMs: duration.value }
          : undefined);
        return { ok: true, summary: `highlighted ${cells.value.length} cell(s)` };
      }
      case 'clear_highlight': {
        instrument.clearHighlight();
        return { ok: true, summary: 'cleared highlights' };
      }
      case 'play_note': {
        const cell = validateCell(call.arguments['cell']);
        if (!cell.ok) return cell;
        const duration = optionalPositiveInt(call.arguments['duration_ms']);
        if (!duration.ok) return duration;
        await instrument.playNote(cell.value, duration.value);
        return { ok: true, summary: `played note (${cell.value.x},${cell.value.y})` };
      }
      case 'play_chord': {
        const cells = validateCells(call.arguments['cells']);
        if (!cells.ok) return cells;
        const duration = optionalPositiveInt(call.arguments['duration_ms']);
        if (!duration.ok) return duration;
        await instrument.playChord(cells.value, duration.value);
        return { ok: true, summary: `played chord of ${cells.value.length} note(s)` };
      }
      case 'play_progression': {
        const stepsArg = call.arguments['steps'];
        if (!Array.isArray(stepsArg) || stepsArg.length === 0) {
          return fail('steps must be a non-empty array');
        }
        const steps: ProgressionStep[] = [];
        for (const s of stepsArg) {
          if (!isObject(s)) return fail('each step must be an object');
          const cells = validateCells((s as Record<string, unknown>)['cells']);
          if (!cells.ok) return cells;
          const dur = (s as Record<string, unknown>)['duration_ms'];
          if (!isPositiveInt(dur)) {
            return fail('each step.duration_ms must be a positive integer');
          }
          const label = (s as Record<string, unknown>)['label'];
          const step: ProgressionStep = { cells: cells.value, durationMs: dur };
          if (typeof label === 'string') step.label = label;
          steps.push(step);
        }
        await instrument.playProgression(steps);
        return { ok: true, summary: `played progression (${steps.length} step(s))` };
      }
      case 'set_key': {
        const pc = call.arguments['root_pitch_class'];
        if (!isPositiveInt(pc, /*allowZero*/ true) || (pc as number) > 11) {
          return fail('root_pitch_class must be 0..11');
        }
        const mode = call.arguments['mode'];
        if (typeof mode !== 'string' || !(mode in keys)) {
          return fail(`unknown key mode: ${String(mode)}`);
        }
        instrument.setKey(pc as number, mode as KeyMode);
        return { ok: true, summary: `set key to pc=${pc} ${mode}` };
      }
      case 'play_pattern_from_pitches': {
        const pitchesArg = call.arguments['pitches'];
        if (!Array.isArray(pitchesArg) || pitchesArg.length === 0) {
          return fail('pitches must be a non-empty array');
        }
        const pitches: number[] = [];
        for (const p of pitchesArg) {
          if (!isPositiveInt(p, true) || (p as number) > 127) {
            return fail('each pitch must be a MIDI integer 0..127');
          }
          pitches.push(p as number);
        }
        const voicing = call.arguments['voicing'];
        if (voicing !== 'block' && voicing !== 'arpeggio_up' && voicing !== 'arpeggio_down') {
          return fail('voicing must be block | arpeggio_up | arpeggio_down');
        }
        const durRes = optionalPositiveInt(call.arguments['duration_ms']);
        if (!durRes.ok) return durRes;
        const stepRes = optionalPositiveInt(call.arguments['step_ms']);
        if (!stepRes.ok) return stepRes;
        const duration = durRes.value ?? 600;
        const stepMs = stepRes.value ?? 300;

        const cellsForPitch = (p: number): CellCoord | null => {
          const clones = getAllCloneCoordsForPitch(p, origin, gw, gh);
          if (clones.length === 0) return null;
          // Prefer the smallest-y (lowest visual position) clone.
          const sorted = [...clones].sort((a, b) => a.y - b.y || a.x - b.x);
          const first = sorted[0];
          return first ? { x: first.x, y: first.y } : null;
        };

        // CRITICAL: we audio.playChord/playNote the AI's EXACT pitches.
        // The cell coords are only for visual highlight. Going through
        // instrument.playChord(cells) would round-trip MIDI → cell → MIDI
        // via getPitchAt() and the grid math is NOT a perfect inverse —
        // pitches that don't decompose cleanly come back wrong octave or
        // semitone (the porter flagged this in core/grid-coords). So we
        // bypass the cell layer for audio and only use it for highlight.
        const audio = await getAudio();
        if (voicing === 'block') {
          const cells: CellCoord[] = [];
          for (const p of pitches) {
            const c = cellsForPitch(p);
            if (c) cells.push(c);
          }
          if (cells.length > 0) instrument.highlight(cells, { durationMs: duration });
          audio.tag('ai-chord').playChord(pitches, duration);
          await new Promise<void>((r) => setTimeout(r, duration));
          instrument.clearHighlight();
          return { ok: true, summary: `played block chord ${pitchListLabel(pitches)}` };
        }
        const ordered = voicing === 'arpeggio_up'
          ? [...pitches].sort((a, b) => a - b)
          : [...pitches].sort((a, b) => b - a);
        for (const p of ordered) {
          const c = cellsForPitch(p);
          if (c) instrument.highlight([c], { durationMs: stepMs });
          audio.tag('ai-arp').playNote(p, stepMs);
          await new Promise<void>((r) => setTimeout(r, stepMs));
          instrument.clearHighlight();
        }
        return { ok: true, summary: `played ${voicing} ${ordered.length} note(s)` };
      }
      case 'play_progression_from_pitches': {
        const stepsArg = call.arguments['steps'];
        if (!Array.isArray(stepsArg) || stepsArg.length === 0) {
          return fail('steps must be a non-empty array');
        }
        // Top-level bpm — used to convert each step's `beats` into ms.
        const bpmArg = call.arguments['bpm'];
        let bpm: number | null = null;
        if (bpmArg !== undefined) {
          if (typeof bpmArg !== 'number' || bpmArg < 30 || bpmArg > 240) {
            return fail('bpm must be a number 30..240');
          }
          bpm = bpmArg;
        }
        const beatsToMs = (beats: number): number => {
          // Floor 50ms so a sixteenth at 240 BPM still has audible length.
          return Math.max(50, Math.round(beats * (60000 / (bpm ?? 90))));
        };
        // Validate every step up front so we don't half-play on bad input.
        type Step = { pitches: number[]; durationMs: number; label?: string };
        const parsed: Step[] = [];
        for (let i = 0; i < stepsArg.length; i++) {
          const s = stepsArg[i];
          if (!s || typeof s !== 'object') return fail(`step ${i}: must be object`);
          const sp = s as Record<string, unknown>;
          const pitches = sp['pitches'];
          if (!Array.isArray(pitches) || pitches.length === 0) {
            return fail(`step ${i}: pitches must be non-empty array`);
          }
          const ps: number[] = [];
          for (const p of pitches) {
            if (typeof p !== 'number' || !Number.isInteger(p) || p < 0 || p > 127) {
              return fail(`step ${i}: each pitch must be MIDI 0..127`);
            }
            ps.push(p);
          }
          // Prefer beats+bpm; fall back to duration_ms; final default 700ms.
          let durationMs: number;
          const beatsArg = sp['beats'];
          const dArg = sp['duration_ms'];
          if (typeof beatsArg === 'number' && beatsArg > 0) {
            durationMs = beatsToMs(beatsArg);
          } else if (typeof dArg === 'number' && Number.isInteger(dArg) && dArg >= 1) {
            durationMs = dArg;
          } else {
            durationMs = 700;
          }
          const step: Step = { pitches: ps, durationMs };
          if (typeof sp['label'] === 'string') step.label = sp['label'];
          parsed.push(step);
        }
        const cellsForPitch = (p: number): CellCoord | null => {
          const clones = getAllCloneCoordsForPitch(p, origin, gw, gh);
          if (clones.length === 0) return null;
          const sorted = [...clones].sort((a, b) => a.y - b.y || a.x - b.x);
          const first = sorted[0];
          return first ? { x: first.x, y: first.y } : null;
        };
        const audio = await getAudio();
        for (const step of parsed) {
          const cells: CellCoord[] = [];
          for (const p of step.pitches) {
            const c = cellsForPitch(p);
            if (c) cells.push(c);
          }
          if (cells.length > 0) instrument.highlight(cells, { durationMs: step.durationMs });
          audio.tag(`ai-prog${step.label ? `:${step.label}` : ''}`)
               .playChord(step.pitches, step.durationMs);
          await new Promise<void>((r) => setTimeout(r, step.durationMs));
          instrument.clearHighlight();
        }
        const summary = parsed
          .map((s) => s.label ?? pitchListLabel(s.pitches))
          .join(' → ');
        return { ok: true, summary: `progression: ${summary}` };
      }
      default:
        return fail(`unknown tool: ${call.name}`);
    }
  } catch (err) {
    return fail(`execution error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---- validators ----

type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPositiveInt(v: unknown, allowZero = false): v is number {
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) return false;
  return allowZero ? v >= 0 : v > 0;
}

function validateCell(v: unknown): Validated<CellCoord> {
  if (!isObject(v)) return fail('cell must be an object');
  const x = v['x'];
  const y = v['y'];
  if (!isPositiveInt(x, true) || !isPositiveInt(y, true)) {
    return fail('cell.x and cell.y must be non-negative integers');
  }
  return { ok: true, value: { x: x as number, y: y as number } };
}

function validateCells(v: unknown): Validated<CellCoord[]> {
  if (!Array.isArray(v) || v.length === 0) {
    return fail('cells must be a non-empty array');
  }
  const out: CellCoord[] = [];
  for (const c of v) {
    const r = validateCell(c);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return { ok: true, value: out };
}

function optionalPositiveInt(v: unknown): Validated<number | undefined> {
  if (v === undefined || v === null) return { ok: true, value: undefined };
  if (!isPositiveInt(v)) return fail('duration_ms must be a positive integer');
  return { ok: true, value: v as number };
}
