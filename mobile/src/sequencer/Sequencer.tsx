/**
 * Sequencer UI (Songwriter mode).
 *
 * Horizontal scrollable row of chord steps + transport (BPM, Play/Stop,
 * Save local, Save to cloud). Steps are derived from the instrument's chord
 * builder — pressing "+" commits the current builder chord and clears it.
 *
 * Labels: if not provided, derived via `detectChord` on the pitches in the
 * step. Falls back to pitch-class letters joined with '-' when nothing
 * matches. The label is recomputed each render — cheap relative to taps.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useInstrument } from '../grid/InstrumentContext';
import {
  getPitchAt,
  detectChord,
  chordTypes,
  getShortChordName,
  musicalNotes,
} from '../core';
import type { Sequence, Step } from './types';
import {
  loadSequences,
  saveSequence,
  newSequenceId,
  saveSequenceToCloud,
} from './storage';

const ORIGIN_PITCH = 0;
const MIN_BPM = 60;
const MAX_BPM = 200;
const DEFAULT_BPM = 120;

function durationFromBpm(bpm: number): number {
  return Math.round(60_000 / bpm);
}

/** Build a display label for a step. */
function deriveLabel(step: Step): string {
  if (step.label && step.label.trim()) return step.label;
  const pitches: number[] = [];
  for (const c of step.chordCells) {
    const info = getPitchAt(c.x, c.y, ORIGIN_PITCH);
    if (info) pitches.push(info.pitch);
  }
  if (pitches.length === 0) return '∅';
  const noteNames = pitches.map((p) => musicalNotes[p % 12]!);
  const matches = detectChord(noteNames, chordTypes, pitches);
  if (matches && matches.length > 0) {
    const m = matches[0]!;
    return `${m.rootNote}${getShortChordName(m.chordType)}`;
  }
  // De-dup pitch classes for the fallback display.
  const uniquePcs = [...new Set(pitches.map((p) => p % 12))].sort((a, b) => a - b);
  return uniquePcs.map((pc) => musicalNotes[pc]!).join('-');
}

export function Sequencer() {
  const instrument = useInstrument();
  const [bpm, setBpm] = useState<number>(DEFAULT_BPM);
  const [steps, setSteps] = useState<Step[]>([]);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [seqId] = useState<string>(() => newSequenceId());
  const createdAtRef = useRef<number>(Date.now());

  // Force chord-builder mode whenever sequencer is mounted.
  useEffect(() => {
    if (!instrument) return;
    instrument.setPlayMode('chord-builder');
  }, [instrument]);

  // On mount, hydrate from the most recent locally-saved sequence (if any).
  // This is non-destructive: we ONLY load if the user hasn't built anything
  // yet (steps still empty). Otherwise the in-progress sequence wins.
  useEffect(() => {
    const list = loadSequences();
    if (list.length === 0) return;
    const newest = list.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
    setSteps(newest.steps);
    setBpm(newest.bpm);
    createdAtRef.current = newest.createdAt;
    // Reuse the loaded id so subsequent saves overwrite.
    // (seqId state was initialized fresh; swap by reusing the same hook tick.)
    // We don't expose setSeqId — keep IDs stable per mount; cloud-save still
    // creates a NEW Song row each time, which is the desired behavior for v1.
  }, []);

  function commitBuilderAsStep(): void {
    if (!instrument) return;
    const cells = instrument.builder.current();
    if (cells.length === 0) {
      setStatus('Tap cells to build a chord first.');
      return;
    }
    const dur = durationFromBpm(bpm);
    const next: Step = { chordCells: cells, durationMs: dur };
    setSteps((s) => [...s, next]);
    instrument.builder.clear();
    setStatus('');
  }

  function removeStep(idx: number): void {
    setSteps((s) => s.filter((_, i) => i !== idx));
  }

  async function play(): Promise<void> {
    if (!instrument || steps.length === 0) return;
    setPlaying(true);
    try {
      const dur = durationFromBpm(bpm);
      await instrument.playProgression(
        steps.map((s) => ({ cells: s.chordCells, durationMs: dur, label: s.label })),
      );
    } finally {
      setPlaying(false);
    }
  }

  function stop(): void {
    instrument?.stopAll();
    setPlaying(false);
  }

  function saveLocal(): void {
    const title = window.prompt('Name this sequence', `Sequence ${new Date().toLocaleString()}`);
    if (!title || !title.trim()) return;
    const seq: Sequence = {
      id: seqId,
      title: title.trim(),
      bpm,
      steps,
      createdAt: createdAtRef.current,
      updatedAt: Date.now(),
    };
    saveSequence(seq);
    setStatus(`Saved "${seq.title}" locally.`);
  }

  async function saveCloud(): Promise<void> {
    if (steps.length === 0) {
      setStatus('Nothing to save — build a sequence first.');
      return;
    }
    const title = window.prompt('Save to cloud as', `Sequence ${new Date().toLocaleString()}`);
    if (!title || !title.trim()) return;
    setStatus('Saving to cloud…');
    try {
      const seq: Sequence = {
        id: seqId,
        title: title.trim(),
        bpm,
        steps,
        createdAt: createdAtRef.current,
        updatedAt: Date.now(),
      };
      const ref = await saveSequenceToCloud(seq);
      setStatus(`Saved to cloud as "${ref.title}" (#${ref.id}).`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Cloud save failed: ${msg}`);
    }
  }

  const labels = useMemo(() => steps.map(deriveLabel), [steps]);

  if (!instrument) return null;

  return (
    <div className="sequencer">
      <div className="sequencer-transport">
        <button
          className="seq-btn seq-btn-primary"
          onClick={() => { if (playing) stop(); else void play(); }}
          disabled={steps.length === 0}
          aria-label={playing ? 'Stop' : 'Play sequence'}
        >
          {playing ? '■ Stop' : '▶ Play'}
        </button>
        <label className="seq-bpm">
          <span className="seq-bpm-label">BPM {bpm}</span>
          <input
            type="range"
            min={MIN_BPM}
            max={MAX_BPM}
            value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
          />
        </label>
        <button className="seq-btn" onClick={saveLocal} disabled={steps.length === 0}>
          Save
        </button>
        <button className="seq-btn" onClick={() => { void saveCloud(); }} disabled={steps.length === 0}>
          ☁ Cloud
        </button>
      </div>

      <div className="sequencer-steps" role="list">
        {steps.length === 0 && (
          <span className="seq-empty">
            Tap cells on the grid, then press + to add a chord step.
          </span>
        )}
        {steps.map((_s, i) => (
          <div className="seq-step" role="listitem" key={`${i}-${labels[i]}`}>
            <span className="seq-step-num">{i + 1}</span>
            <span className="seq-step-label">{labels[i]}</span>
            <button
              className="seq-step-del"
              onClick={() => removeStep(i)}
              aria-label={`Delete step ${i + 1}`}
            >×</button>
          </div>
        ))}
        <button
          className="seq-step-add"
          onClick={commitBuilderAsStep}
          aria-label="Add step from current chord builder"
        >+</button>
      </div>

      {status && <div className="seq-status" role="status">{status}</div>}
    </div>
  );
}
