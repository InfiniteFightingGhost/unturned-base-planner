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
import type { Vec3 } from '@/domain';

export type ActiveTool = 'select' | 'place' | 'move' | 'rotate';

/** The pending placement preview transform. */
export interface GhostState {
  position: Vec3;
  rotationY: number;
}

export interface ToolState {
  activeTool: ActiveTool;
  activeDefinitionId: string | null;
  ghost: GhostState | null;

  setActiveTool(tool: ActiveTool): void;
  setActiveDefinitionId(definitionId: string | null): void;
  setGhost(ghost: GhostState | null): void;
  clearGhost(): void;
  /** Select tool + clear any pending definition/ghost (Escape semantics). */
  cancelPlacement(): void;
}

export const useToolStore = create<ToolState>()(
  subscribeWithSelector((set) => ({
    activeTool: 'select',
    activeDefinitionId: null,
    ghost: null,

    setActiveTool: (activeTool) => set({ activeTool: activeTool }),

    setActiveDefinitionId: (activeDefinitionId) => set({ activeDefinitionId: activeDefinitionId }),

    setGhost: (ghost) => set({ ghost: ghost }),

    clearGhost: () => set({ ghost: null }),

    cancelPlacement: () => set({ activeTool: 'select', activeDefinitionId: null, ghost: null }),
  })),
);
