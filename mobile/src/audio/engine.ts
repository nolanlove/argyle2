/**
 * Thin Tone.js wrapper. Plain class, no React.
 *
 * `init()` MUST be called synchronously from inside a user-gesture handler
 * (touchstart/click) on iOS Safari. Critically, we create the synth in the
 * SAME tick as Tone.start() — putting `new Tone.PolySynth()` after an
 * `await` leaves the instrument bound to a context that iOS still treats
 * as suspended even after Tone.start() resolves.
 *
 * Audio: PolySynth (zero-asset boot) is created immediately so the very
 * first tap produces sound. A Salamander Grand Piano sampler loads
 * asynchronously in the background and is swapped in once buffers arrive.
 * The sampler is fire-and-forget — it does NOT block init() resolution,
 * so a slow/blocked CDN never strands the user with no audio.
 */

import * as Tone from 'tone';
import type { Midi } from '../core';

const DEFAULT_DURATION_MS = 600;
const MAX_POLYPHONY = 16;

// Subset of Salamander samples — Tone.js interpolates the gaps.
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
};

export class AudioEngine {
  private synth: Tone.PolySynth | null = null;
  private piano: Tone.Sampler | null = null;
  private started = false;
  private pianoLoading = false;
  /** Tone.start() promise; resolves when the AudioContext is running. */
  private startPromise: Promise<void> | null = null;

  /**
   * Unlock the audio context and build the synth.
   *
   * MUST be called synchronously from a user-gesture event handler. Do NOT
   * `await` anything before invoking it.
   *
   * Idempotent — subsequent calls return the same Promise.
   */
  init(): Promise<void> {
    if (this.started && this.startPromise) return this.startPromise;

    // 1. Kick Tone.start() FIRST (synchronously, inside the gesture tick).
    this.startPromise = Tone.start();

    // 2. Build the synth SYNCHRONOUSLY in the same tick. Tone.js binds it
    // to the global context that we just told to start. By the time the
    // user actually plays a note, the context will be running.
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.3, release: 0.6 },
    });
    synth.maxPolyphony = MAX_POLYPHONY;
    synth.volume.value = -6;
    synth.toDestination();
    this.synth = synth;
    this.started = true;

    // 3. Fire-and-forget piano upgrade. NOT awaited here so a slow/blocked
    // CDN never strands the user without audio.
    void this.loadPianoInBackground();

    return this.startPromise;
  }

  private async loadPianoInBackground(): Promise<void> {
    if (this.pianoLoading || this.piano) return;
    this.pianoLoading = true;
    try {
      const piano = new Tone.Sampler({
        urls: SALAMANDER_URLS,
        baseUrl: SALAMANDER_BASE,
        release: 1,
      });
      piano.volume.value = -3;
      piano.toDestination();
      // Race with a 10s timeout so a hung CDN doesn't leak the loading flag.
      await Promise.race([
        Tone.loaded(),
        new Promise<void>((_, rej) =>
          setTimeout(() => rej(new Error('piano sample load timeout')), 10000),
        ),
      ]);
      this.piano = piano;
    } catch (e) {
      console.warn('[argyle audio] piano load failed; staying on synth', e);
    } finally {
      this.pianoLoading = false;
    }
  }

  /** True once `init()` has been called and the synth is constructed. */
  isReady(): boolean {
    return this.started && this.synth !== null;
  }

  /** True if the piano sampler is loaded and being used. */
  isPianoReady(): boolean {
    return this.piano !== null;
  }

  /** Diagnostic: returns the underlying AudioContext state. */
  contextState(): 'suspended' | 'running' | 'closed' | 'uninitialized' {
    if (!this.started) return 'uninitialized';
    return Tone.getContext().rawContext.state as
      | 'suspended' | 'running' | 'closed';
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
  }
}

/** Singleton — consumers do `import { audio } from './audio/engine'`. */
export const audio = new AudioEngine();
