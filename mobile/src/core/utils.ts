/**
 * Tiny shared utilities. Kept separate so both pitches/chords/keys/grid-coords
 * can import without circulars.
 */

/** Strict element-wise equality. Mirrors arraysEqual in the JS source. */
export function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
