/**
 * Minimal sequencer types.
 *
 * A Sequence is an ordered list of Steps. Each Step is a chord (set of grid
 * cells) plus an optional human-readable label and a duration in ms.
 *
 * v1 keeps the schema flat — per-step duration is computed from BPM at the
 * caller; we still store it on each Step so future per-step overrides drop in
 * without a migration.
 */

import type { GridCoord } from '../core';

export interface Step {
  chordCells: GridCoord[];
  label?: string;
  durationMs: number;
}

export interface Sequence {
  /** Persisted ID (uuid). */
  id: string;
  /** Human-supplied title. */
  title: string;
  bpm: number;
  steps: Step[];
  /** Local-only timestamps (ms since epoch). */
  createdAt: number;
  updatedAt: number;
}

/** Subset returned by the cloud-save endpoint. */
export interface CloudSongRef {
  id: number;
  title: string;
  createdAt: string;
}
