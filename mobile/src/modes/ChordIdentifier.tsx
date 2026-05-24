/**
 * Floating chord-name pill — shows the identified chord (e.g. "Cmaj7",
 * "G/B", "Dm9") as the user stacks notes in chord-builder mode.
 *
 * Pure read-only — no buttons. Sits at the top under the mode pill so
 * it doesn't compete with the chat panel below.
 */

import { useEffect, useState } from 'react';
import { useInstrument } from '../grid/InstrumentContext';
import {
  getPitchAt, musicalNotes, detectChord, chordTypes,
} from '../core';

const ORIGIN_PITCH = 0;

export function ChordIdentifier() {
  const instrument = useInstrument();
  const [cells, setCells] = useState(() => instrument?.builder.current() ?? []);

  useEffect(() => {
    if (!instrument) return;
    return instrument.builder.onChange((next) => setCells(next));
  }, [instrument]);

  if (cells.length === 0) return null;

  const noteNames: string[] = [];
  const midiPitches: number[] = [];
  for (const c of cells) {
    const info = getPitchAt(c.x, c.y, ORIGIN_PITCH);
    if (!info) continue;
    noteNames.push(musicalNotes[info.pitch % 12]!);
    midiPitches.push(info.pitch);
  }

  // detectChord wants the unique note names sorted by lowest pitch;
  // pass the actual pitches so it can pick the bass for slash chords.
  const sortedByPitch = noteNames
    .map((name, i) => ({ name, midi: midiPitches[i]! }))
    .sort((a, b) => a.midi - b.midi);
  const orderedNames = sortedByPitch.map((p) => p.name);
  const orderedPitches = sortedByPitch.map((p) => p.midi);

  const matches = noteNames.length >= 2
    ? detectChord(orderedNames, chordTypes, orderedPitches)
    : null;
  const best = matches && matches[0];

  // Single-note: show the note name.
  if (cells.length === 1) {
    const single = noteNames[0];
    return (
      <div className="chord-identifier" role="status">
        <span className="chord-id-name">{single}</span>
      </div>
    );
  }

  return (
    <div className="chord-identifier" role="status">
      {best ? (
        <>
          <span className="chord-id-name">{best.fullName}</span>
          <span className="chord-id-notes">
            {' '}— {orderedNames.join(' ')}
          </span>
        </>
      ) : (
        <span className="chord-id-notes">{orderedNames.join(' ')}</span>
      )}
    </div>
  );
}
