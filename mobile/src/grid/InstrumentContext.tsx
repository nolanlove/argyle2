/**
 * React context exposing the active ArgyleInstrument to descendant components.
 *
 * `<Grid />` mounts the renderer + gestures + instrument and wraps its
 * children in `<InstrumentProvider>`. Sibling UI (mode toggles, chord chips,
 * progression-demo buttons) reaches the instrument via `useInstrument()`.
 */

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ArgyleInstrument } from './api';

const InstrumentContext = createContext<ArgyleInstrument | null>(null);

export interface InstrumentProviderProps {
  instrument: ArgyleInstrument | null;
  children: ReactNode;
}

export function InstrumentProvider(props: InstrumentProviderProps) {
  return (
    <InstrumentContext.Provider value={props.instrument}>
      {props.children}
    </InstrumentContext.Provider>
  );
}

/** Returns the instrument or null if not yet mounted. */
export function useInstrument(): ArgyleInstrument | null {
  return useContext(InstrumentContext);
}
