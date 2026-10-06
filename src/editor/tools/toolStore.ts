/**
 * Transient editor-tool store.
 *
 * This store is deliberately separate from the document store: it holds only
 * ephemeral UI state that must never be undoable (the active tool, the pending
 * definition, and the placement ghost). Mutating it does not touch history and
 * does not flow through commands. `subscribeWithSelector` lets controllers react
 * to slices without re-rendering.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { MeasurementKind, Vec3 } from '@/domain';

export type ActiveTool = 'select' | 'place' | 'move' | 'rotate' | 'measure';

/** The pending placement preview transform. */
export interface GhostState {
  position: Vec3;
  rotationY: number;
}

export interface ToolState {
  activeTool: ActiveTool;
  activeDefinitionId: string | null;
  ghost: GhostState | null;
  /** Whether the current ghost would place a valid piece. */
  ghostValid: boolean;
  /** Human-readable reason the ghost is invalid, else `null`. */
  placementMessage: string | null;
  /** Measurement kind produced by the `measure` tool. UI-only. */
  activeMeasurementKind: MeasurementKind;

  setActiveTool(tool: ActiveTool): void;
  setActiveDefinitionId(definitionId: string | null): void;
  setGhost(ghost: GhostState | null): void;
  setGhostValid(valid: boolean): void;
  setPlacementMessage(message: string | null): void;
  clearGhost(): void;
  setActiveMeasurementKind(kind: MeasurementKind): void;
  /** Select tool + clear any pending definition/ghost (Escape semantics). */
  cancelPlacement(): void;
}

export const useToolStore = create<ToolState>()(
  subscribeWithSelector((set) => ({
    activeTool: 'select',
    activeDefinitionId: null,
    ghost: null,
    ghostValid: true,
    placementMessage: null,
    activeMeasurementKind: 'distance',

    setActiveTool: (activeTool) => set({ activeTool: activeTool }),

    setActiveDefinitionId: (activeDefinitionId) => set({ activeDefinitionId: activeDefinitionId }),

    setGhost: (ghost) => set({ ghost: ghost }),

    setGhostValid: (ghostValid) => set({ ghostValid }),

    setPlacementMessage: (placementMessage) => set({ placementMessage }),

    clearGhost: () => set({ ghost: null, ghostValid: true, placementMessage: null }),

    setActiveMeasurementKind: (activeMeasurementKind) => set({ activeMeasurementKind }),

    cancelPlacement: () =>
      set({
        activeTool: 'select',
        activeDefinitionId: null,
        ghost: null,
        ghostValid: true,
        placementMessage: null,
      }),
  })),
);
