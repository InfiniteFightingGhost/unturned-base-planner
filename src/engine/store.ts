/**
 * Engine-level UI state: grid configuration and active camera mode.
 *
 * This store is deliberately separate from React rendering state. It only holds
 * low-frequency, user-driven values. Per-frame transforms stay out of here so the
 * future instanced renderer can bypass React entirely.
 *
 * Uses `subscribeWithSelector` so imperative code (camera rig, input handlers) can
 * react to specific slices without re-rendering components.
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { CameraMode } from './camera/cameraModes';
import { DEFAULT_GRID_CONFIG } from './grid/gridConfig';
import type { GridConfig } from './grid/gridConfig';

export interface EngineState {
  grid: GridConfig;
  cameraMode: CameraMode;
  /** Whether the blueprint (outline) overlay is drawn. UI-only, never persisted. */
  blueprint: boolean;
  setGridConfig: (patch: Partial<GridConfig>) => void;
  toggleGrid: () => void;
  setGridVisible: (visible: boolean) => void;
  toggleSnap: () => void;
  setSnapEnabled: (enabled: boolean) => void;
  setSnapStep: (step: number) => void;
  setPrecision: (precision: number) => void;
  setCameraMode: (mode: CameraMode) => void;
  toggleBlueprint: () => void;
  setBlueprint: (enabled: boolean) => void;
}

export const useEngineStore = create<EngineState>()(
  subscribeWithSelector((set) => ({
    grid: { ...DEFAULT_GRID_CONFIG },
    cameraMode: 'ORBIT',
    blueprint: false,
    setGridConfig: (patch) => set((state) => ({ grid: { ...state.grid, ...patch } })),
    toggleGrid: () => set((state) => ({ grid: { ...state.grid, visible: !state.grid.visible } })),
    setGridVisible: (visible) => set((state) => ({ grid: { ...state.grid, visible } })),
    toggleSnap: () =>
      set((state) => ({ grid: { ...state.grid, snapEnabled: !state.grid.snapEnabled } })),
    setSnapEnabled: (snapEnabled) => set((state) => ({ grid: { ...state.grid, snapEnabled } })),
    setSnapStep: (snapStep) => set((state) => ({ grid: { ...state.grid, snapStep } })),
    setPrecision: (precision) => set((state) => ({ grid: { ...state.grid, precision } })),
    setCameraMode: (cameraMode) => set({ cameraMode }),
    toggleBlueprint: () => set((state) => ({ blueprint: !state.blueprint })),
    setBlueprint: (blueprint) => set({ blueprint }),
  })),
);

export function selectGrid(state: EngineState): GridConfig {
  return state.grid;
}

export function selectCameraMode(state: EngineState): CameraMode {
  return state.cameraMode;
}

export function selectBlueprint(state: EngineState): boolean {
  return state.blueprint;
}
