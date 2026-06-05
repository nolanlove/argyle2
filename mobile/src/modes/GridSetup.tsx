/**
 * GridSetup — the "C Major" key pill plus the bottom Setup sheet it opens.
 *
 * One discoverable entry point for the crucial playing controls so the play
 * surface stays minimal: key root, scale/mode, what the cells print (label
 * mode), and whether clones light up. State is owned by App.tsx and persisted;
 * this component is presentational and reports edits via `onChange`.
 */

import { useState } from 'react';
import { musicalNotes, keys } from '../core';
import type { KeyMode } from '../core';
import type { LabelMode } from '../grid/renderer';
import type { Setup } from './setup-store';

interface GridSetupProps {
  setup: Setup;
  onChange: (next: Setup) => void;
}

// Scale options in declaration order (core groups them sensibly already).
const SCALES: ReadonlyArray<{ value: KeyMode; name: string }> =
  (Object.entries(keys) as Array<[KeyMode, { name: string }]>)
    .map(([value, def]) => ({ value, name: def.name }));

const LABEL_OPTIONS: ReadonlyArray<{ value: LabelMode; label: string; title: string }> = [
  { value: 'notes', label: 'Notes', title: 'Note names (C, C#…)' },
  { value: 'degrees', label: 'Degrees', title: 'Scale degrees (1, ♭2, 2…)' },
  { value: 'roman', label: 'Roman', title: 'Roman numerals for in-key notes' },
  { value: 'none', label: '⌀', title: 'No labels' },
];

export function GridSetup({ setup, onChange }: GridSetupProps) {
  const [open, setOpen] = useState(false);
  const keyLabel = `${musicalNotes[setup.rootPc]} ${keys[setup.scale].name}`;

  return (
    <>
      <button
        className="key-pill"
        aria-label={`Key: ${keyLabel}. Tap to change key, scale, and labels.`}
        onClick={() => setOpen(true)}
      >
        <span className="key-pill-text">{keyLabel}</span>
        <span className="key-pill-caret" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="setup-backdrop" onClick={() => setOpen(false)}>
          <div
            className="setup-sheet"
            role="dialog"
            aria-label="Grid setup"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="setup-header">
              <span className="setup-title">Setup</span>
              <button className="setup-close" aria-label="Close setup" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>

            <div className="setup-body">
              <section className="setup-section">
                <div className="setup-label">Root</div>
                <div className="root-grid">
                  {musicalNotes.map((name, pc) => (
                    <button
                      key={pc}
                      className={`root-chip ${pc === setup.rootPc ? 'root-chip-active' : ''}`}
                      aria-pressed={pc === setup.rootPc}
                      onClick={() => onChange({ ...setup, rootPc: pc })}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </section>

              <section className="setup-section">
                <div className="setup-label">Scale</div>
                <div className="scale-list">
                  {SCALES.map((s) => (
                    <button
                      key={s.value}
                      className={`scale-row ${s.value === setup.scale ? 'scale-row-active' : ''}`}
                      aria-pressed={s.value === setup.scale}
                      onClick={() => onChange({ ...setup, scale: s.value })}
                    >
                      <span className="scale-radio" aria-hidden>{s.value === setup.scale ? '◉' : '○'}</span>
                      {s.name}
                    </button>
                  ))}
                </div>
              </section>

              <section className="setup-section">
                <div className="setup-label">Labels</div>
                <div className="segmented">
                  {LABEL_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      className={`seg-btn ${o.value === setup.labelMode ? 'seg-btn-active' : ''}`}
                      title={o.title}
                      aria-pressed={o.value === setup.labelMode}
                      onClick={() => onChange({ ...setup, labelMode: o.value })}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="setup-section setup-row">
                <div className="setup-label">Clones</div>
                <button
                  className={`switch ${setup.clones ? 'switch-on' : ''}`}
                  role="switch"
                  aria-checked={setup.clones}
                  aria-label="Light every clone of a played note"
                  onClick={() => onChange({ ...setup, clones: !setup.clones })}
                >
                  <span className="switch-knob" aria-hidden />
                </button>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
