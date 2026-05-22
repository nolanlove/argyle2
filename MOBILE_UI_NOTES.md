# Mobile UI overhaul — 2026-05-22

Snapshot of the mobile experience after tonight's work. Live at https://argyletheory.com/ (?v=42 onward).

## What's on screen

```
┌─────────────────────────────┐
│ [✨]              [auth]    │  ← Chatbot toggle + auth icon (40px round, top corners)
│                              │
│ [▶|Key: C Major][Chord:…|▶] │  ← Split-pill: play-tab + label, opens picker on tap
│                              │
│      ◇ ◇ ◇ ◇ ◇ ◇ ◇          │
│     ◇ ◇ ◇ ◇ ◇ ◇ ◇           │  ← Diamond grid, fills the middle row
│      ◇ ◇ ◇ ◇ ◇ ◇ ◇          │
│                              │
│ [Mode][Labels][Clear][More]  │  ← Bottom action bar
└─────────────────────────────┘
```

Safe-area insets (notch + home indicator) respected throughout — when installed to the home screen, the app launches full-screen with no Safari chrome.

## The grid

- **One finger** on a cell — plays the note. In **Tap Notes** mode, drag continues playing each cell as the finger crosses it.
- **Two fingers pinch** — zoom (clamped 0.4× ... 3.0×; the lower bound dynamically clamps so the rotated 20×20 diamond always covers the canvas — no diamond-bbox reveal at zoom-out).
- **Two fingers drag** — pan.
- `touch-action: none` on the canvas + descendants — browser's native pinch-zoom doesn't fight us.

## The split-pill buttons

`▶|Key: C Major` and `Chord: Cmaj7|▶` each behave as two buttons:

- The **▶ tab** plays the scale / chord.
- The **label area** opens the key / chord picker modal.

This collapses what used to be four overlay buttons into two compact pills.

## The "More" sheet

Tap **More** in the bottom bar — a bottom-anchored sheet slides up over the grid with these sections:

- 🎹 **Chord buttons** — grid of triads / tetrads / dominants for quick chord selection (4 columns).
- ⏯ **Sequencer** — Prev / Play / Next, speed slider, current sequence display, Add Chord / Key / Rest, Save, Open, paste-sequence input.
- 🎤 **Tuner** — mic toggle, pitch variance histogram.
- 🎵 **Note Detection** — chord / note detection from mic with notes + chords lists.
- ⚙ **Settings** — grid size + chord display.

The sheet:

- **Tap the backdrop** or the **×** to close.
- **Swipe down** on the panel (when scrolled to top) to dismiss — native iOS bottom-sheet behavior.
- The header sticks to the top of the panel as the body scrolls.

Each section keeps its own card styling (background + border) so they read as distinct surfaces.

## Notable plumbing

- `.grid-wrapper` is `position: fixed; inset: 0` on mobile and uses CSS Grid: `auto / 1fr / auto` rows × 4 columns.
- `#info-background` has `display: contents` on mobile so its child buttons become layout-children of `.grid-wrapper`.
- The cell DOM and tapTarget overlays carry `data-grid-x / -grid-y / -note / -octave` so the touch-drag handler can find them via `document.elementFromPoint`.
- `applyGridTransform()` composes pan + zoom on top of the inline `rotate(-45deg)` that `createGridVisualization` writes. **Watch out for `!important` on `#grid-container { transform: ... }` — it silently overrides the inline transform and breaks gestures.** (See `~/.claude/projects/-Users-nolanlove-dev-cursor/memory/feedback_important_overrides_inline_transform.md`.)
- `setupMoreSheet()` reparents `.musical-section` and `.grid-controls` out of `.main` and into the sheet body when opening, and puts them back on close — so desktop layout is preserved if the viewport changes.

## Known limitations / next ideas

- **State persistence** — key, chord, mode, label mode reset on every page reload. Easy localStorage win for a future iteration.
- **Mode button label** — the bottom-bar button shows the current mode (e.g. "Tap Chords") but doesn't visually signal that it cycles. Considered prefixing "Mode: " but the bottom button is too narrow on a phone. Worth a re-think.
- **iPad portrait (768/820px)** uses the same full-viewport mobile layout. Untested but the layout should be the same with denser cells (target 7 across instead of 5).
- **React port** — Nolan asked. Not done — the app is a 7700-line vanilla JS class. A real port is a multi-day project. Leaving for a separate discussion before committing. The data attributes + clean component boundaries in this iteration set the table for a future migration (each section in the More sheet could become a self-contained React component).
