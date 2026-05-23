/**
 * Thin Tone.js wrapper. Plain class, no React.
 *
 * `init()` must be called from a user gesture (touchstart/click) to unlock
 * the Web Audio context on iOS Safari. The singleton `audio` export is the
 * intended consumer surface.
 *
 * Audio: starts immediately on a PolySynth so the first tap is never silent,
 * then upgrades to a Salamander Grand Piano Sampler in the background once
 * the samples load (~150KB across 5 keys). The swap is seamless because
 * playNote/playChord just route to whichever instrument is current.
 */

import * as Tone from 'tone';
import type { Midi } from '../core';

const DEFAULT_DURATION_MS = 600;
const MAX_POLYPHONY = 16;

// Subset of Salamander samples — Tone.js interpolates the gaps. CDN-hosted
// by the Tone.js project; tiny set keeps boot fast.
const SALAMANDER_URLS: Record<string, string> = {
  C2: 'C2.mp3',
  C3: 'C3.mp3',
  C4: 'C4.mp3',
  C5: 'C5.mp3',
  C6: 'C6.mp3',
};
const SALAMANDER_BASE = 'https://tonejs.github.io/audio/salamander/';

type Playable = {
  triggerAttackRelease(
    notes: string | string[] | number | number[],
    duration: number | string,
  ): unknown;
  releaseAll?(): unknown;
};

export class AudioEngine {
  private synth: Tone.PolySynth | null = null;
  private piano: Tone.Sampler | null = null;
  private started = false;
  private starting: Promise<void> | null = null;

  /**
   * Unlock the audio context, build the fallback synth, and kick off async
   * loading of the piano sampler. Idempotent.
   * MUST be called from a user-gesture handler the first time, otherwise
   * iOS Safari will keep the context suspended.
   */
  async init(): Promise<void> {
    if (this.started) return;
    if (this.starting) return this.starting;
    this.starting = (async () => {
      await Tone.start();

      // Immediate fallback: a soft triangle synth so the first tap makes
      // sound even before piano samples finish downloading.
      const synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.15, sustain: 0.3, release: 0.6 },
      });
      synth.maxPolyphony = MAX_POLYPHONY;
      synth.volume.value = -10;
      synth.toDestination();
      this.synth = synth;
      this.started = true;

      // Background upgrade to piano. If it fails (offline, blocked), we
      // just stay on the synth — no breakage.
      try {
        const piano = new Tone.Sampler({
          urls: SALAMANDER_URLS,
          baseUrl: SALAMANDER_BASE,
          release: 1,
        });
        piano.volume.value = -6;
        piano.toDestination();
        await Tone.loaded();
        this.piano = piano;
      } catch (e) {
        // Stay on the synth; log but don't surface to UI.
        console.warn('Piano samples failed to load; staying on synth', e);
      }
    })();
    return this.starting;
  }

  /** True once `init()` has resolved. Useful for first-tap gating. */
  isReady(): boolean {
    return this.started && this.synth !== null;
  }

  /** True if the piano sampler is loaded and being used. */
  isPianoReady(): boolean {
    return this.piano !== null;
  }

  private current(): Playable | null {
    return this.piano ?? this.synth;
  }

  /** Play a single MIDI note. Silently no-ops if `init()` hasn't completed. */
  playNote(midi: Midi, durationMs: number = DEFAULT_DURATION_MS): void {
    const inst = this.current();
    if (!inst) return;
    const freq = Tone.Frequency(midi, 'midi').toFrequency();
    inst.triggerAttackRelease(freq, durationMs / 1000);
  }

  /** Play multiple MIDI notes simultaneously. */
  playChord(midis: readonly Midi[], durationMs: number = DEFAULT_DURATION_MS): void {
    const inst = this.current();
    if (!inst || midis.length === 0) return;
    const freqs = midis.map((m) => Tone.Frequency(m, 'midi').toFrequency());
    inst.triggerAttackRelease(freqs, durationMs / 1000);
  }

  /** Cut all sustaining voices. */
  stopAll(): void {
    this.synth?.releaseAll();
    // Tone.Sampler doesn't expose releaseAll; trigger a hard stop on the
    // destination would cut everything but also the piano's natural decay
    // tail. For now, let voices die naturally — durations are short anyway.
  }
}

/** Singleton — consumers do `import { audio } from './audio/engine'`. */
export const audio = new AudioEngine();
