/**
 * Songwriter mode: grid + sequencer panel. No AI chat.
 *
 * Forces playMode to chord-builder via the Sequencer's own effect.
 */

import { Sequencer } from '../sequencer/Sequencer';

export function SongwriterMode() {
  return (
    <>
      <Sequencer />
    </>
  );
}
