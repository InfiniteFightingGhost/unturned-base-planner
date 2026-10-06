/**
 * Context carrying the `PieceField` imperative handle to sibling controllers.
 *
 * The field and the interaction controllers are all children of the same R3F
 * canvas; a mutable ref object via context lets select/move tools perform picking
 * without lifting transforms into React state.
 */

import { createContext } from 'react';
import type { PieceFieldHandle } from '@/engine';

export interface PieceFieldRef {
  current: PieceFieldHandle | null;
}

export const PieceFieldContext = createContext<PieceFieldRef | null>(null);
