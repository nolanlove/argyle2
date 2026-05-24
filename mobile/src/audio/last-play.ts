/**
 * Tiny global registry for "the last thing the user heard". Anything that
 * produces a self-contained musical event (a tool call from the AI, a
 * single tapped cell, a chord-builder Play, a sequencer transport run)
 * registers a replay thunk here.
 *
 * The ♪ button (and any other "replay last" affordance) calls
 * `replayLast()` to re-run whatever was most recently registered.
 *
 * Module-level singleton because the registrants and the consumer live
 * in different React trees (instrument, chat provider, sequencer) and
 * threading a context through all of them is overkill for one global
 * pointer.
 */

export type ReplayThunk = () => void | Promise<void>;

interface Registered {
  label: string;
  thunk: ReplayThunk;
}

let registered: Registered | null = null;
const listeners = new Set<() => void>();

export function setLastPlay(label: string, thunk: ReplayThunk): void {
  registered = { label, thunk };
  for (const cb of listeners) {
    try { cb(); } catch { /* swallow */ }
  }
}

export function getLastPlayLabel(): string | null {
  return registered?.label ?? null;
}

export function hasLastPlay(): boolean {
  return registered !== null;
}

export async function replayLast(): Promise<boolean> {
  if (!registered) return false;
  try { await registered.thunk(); } catch { /* swallow */ }
  return true;
}

/** Subscribe to "last play changed" events. Returns unsubscribe. */
export function onLastPlayChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
