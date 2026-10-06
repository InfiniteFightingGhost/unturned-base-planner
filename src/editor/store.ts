/**
 * Editor document store.
 *
 * The store owns the immutable `Project`, the UI-only selection/clipboard, and
 * the per-store `History` instance (kept in a closure, never in React state).
 * `createEditorStore` lets tests spin up isolated stores; the module-level
 * `editorStore` / `useEditorStore` are the app's default instances.
 *
 * Mutation discipline: `setProject` is the ONLY raw setter and is documented as
 * load-only (it clears history). Every other document change flows through
 * `executeCommand` -> domain `Command` -> `History`, so undo/redo always works.
 * Selection, clipboard and grid updates are UI state and never touch history.
 */

import { createEmptyProject, createId, History } from '@/domain';
import type { BuildState, Command, Floor, PlacedPiece, Prefab, Project, Vec3 } from '@/domain';
import { DEFAULT_GRID_CONFIG } from '@/engine';
import type { GridConfig } from '@/engine';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  createAddPiecesCommand,
  createDeletePiecesCommand,
  createSetBuildStateCommand,
  createTransformPiecesCommand,
} from './commands';
import {
  createAddFloorCommand,
  createDeleteFloorCommand,
  createRenameFloorCommand,
  createSetFloorElevationCommand,
  createSetFloorLockedCommand,
  createSetFloorVisibleCommand,
} from './floor-commands';
import { floorById, nextFloorElevation, sortedFloors } from './floors';
import { instantiatePrefab as instantiatePrefabPieces, prefabFromPieces } from './prefab';
import {
  createDeletePrefabCommand,
  createInstantiatePrefabCommand,
  createSavePrefabCommand,
} from './prefab-commands';
import { applySelection, selectAll as selectAllIds } from './selection';
import type { SelectionMode } from './selection';
import { clonePiece, duplicatePieces, mirrorPiece, rotatePieceY, translatePiece } from './transform';

export interface EditorState {
  /** The immutable document. Mutated only through commands. */
  readonly project: Project;
  /** Ordered, de-duplicated ids. UI state, never part of history. */
  readonly selection: string[];
  /** Pieces copied for paste. UI state, never part of history. */
  readonly clipboard: PlacedPiece[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Grid mirror for placement/snapping. UI state. */
  readonly grid: GridConfig;
  /**
   * The floor new pieces are placed on and existing pieces are ghosted
   * relative to. Transient UI state: never part of history, always reconciled
   * to reference an existing floor.
   */
  readonly activeFloorId: string;

  /**
   * Replace the whole document (project load / new project). LOAD-ONLY: this is
   * the sole raw setter and it deliberately clears history, selection and
   * clipboard. Do not use it for edits — use `executeCommand`.
   */
  setProject(project: Project): void;
  /** Apply a command through history and refresh undo/redo flags. */
  executeCommand(command: Command): void;
  undo(): void;
  redo(): void;
  select(ids: readonly string[], mode: SelectionMode): void;
  selectAll(): void;
  clearSelection(): void;
  copy(): void;
  paste(offset?: Vec3): void;
  duplicateSelected(offset?: Vec3): void;
  deleteSelected(): void;
  moveSelected(delta: Vec3): void;
  rotateSelected(radians: number, pivot?: Vec3): void;
  mirrorSelected(axis: 'x' | 'z', offset?: number): void;
  setSelectedBuildState(state: BuildState): void;
  setGrid(config: GridConfig): void;

  /** Add a floor through a command and make it active. */
  addFloor(name?: string, elevation?: number): void;
  /** Delete a floor (and its pieces) through one command. Rejects the last floor. */
  deleteFloor(id: string): void;
  renameFloor(id: string, name: string): void;
  setFloorElevation(id: string, elevation: number): void;
  setFloorVisible(id: string, visible: boolean): void;
  setFloorLocked(id: string, locked: boolean): void;
  /** Select the active floor. UI-only; never records history. */
  setActiveFloor(id: string): void;

  /**
   * Capture the current selection as a prefab and add it to the library through
   * one undoable command. Returns the created prefab, or `null` when nothing is
   * selected. The selection is left untouched.
   */
  saveSelectionAsPrefab(name: string): Prefab | null;
  /** Delete a prefab from the library. Undoable. Unknown ids are ignored. */
  deletePrefab(id: string): void;
  /**
   * Stamp a prefab's pieces into the document as one undoable step, select the
   * new pieces and return their fresh ids. Defaults: `position` is the active
   * floor origin `[0, elevation, 0]` and `floorId` is the active floor.
   */
  instantiatePrefab(prefabId: string, position?: Vec3, floorId?: string): string[];
}

export type EditorStore = StoreApi<EditorState>;

/** Arithmetic mean of the selected pieces' positions (pivot fallback). */
function centroidOf(pieces: readonly PlacedPiece[]): Vec3 {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const piece of pieces) {
    x += piece.position[0];
    y += piece.position[1];
    z += piece.position[2];
  }
  const count = pieces.length;
  return [x / count, y / count, z / count];
}

/**
 * Build an isolated editor store. History max depth is the domain default (500).
 */
export function createEditorStore(initialProject: Project): EditorStore {
  const history = new History();

  return createStore<EditorState>()(
    subscribeWithSelector((set, get) => {
      const syncHistoryFlags = (): void => {
        set({ canUndo: history.canUndo(), canRedo: history.canRedo() });
      };

      const execute = (command: Command): void => {
        const next = history.execute(get().project, command);
        set({ project: next, canUndo: history.canUndo(), canRedo: history.canRedo() });
      };

      /**
       * Resolve a floor id that definitely exists in `project`. Prefers the
       * supplied candidate, then the lowest-index floor, then the empty string
       * for a document with no floors.
       */
      const reconcileActiveFloorId = (project: Project, preferred?: string): string => {
        if (preferred !== undefined && floorById(project, preferred) !== undefined) {
          return preferred;
        }
        return sortedFloors(project)[0]?.id ?? '';
      };

      const selectedPieces = (): PlacedPiece[] => {
        const { project, selection } = get();
        if (selection.length === 0) {
          return [];
        }
        const wanted = new Set(selection);
        return project.pieces.filter((piece) => wanted.has(piece.id));
      };

      const transformSelected = (fn: (piece: PlacedPiece) => PlacedPiece): void => {
        const pieces = selectedPieces();
        if (pieces.length === 0) {
          return;
        }
        execute(createTransformPiecesCommand(pieces.map((piece) => piece.id), fn));
      };

      return {
        project: initialProject,
        selection: [],
        clipboard: [],
        canUndo: false,
        canRedo: false,
        grid: { ...DEFAULT_GRID_CONFIG },
        activeFloorId: reconcileActiveFloorId(initialProject),

        setProject: (project) => {
          history.clear();
          set({
            project,
            selection: [],
            clipboard: [],
            canUndo: false,
            canRedo: false,
            activeFloorId: reconcileActiveFloorId(project),
          });
        },

        executeCommand: execute,

        undo: () => {
          if (!history.canUndo()) {
            return;
          }
          const next = history.undo();
          set({ project: next, activeFloorId: reconcileActiveFloorId(next, get().activeFloorId) });
          syncHistoryFlags();
        },

        redo: () => {
          if (!history.canRedo()) {
            return;
          }
          const next = history.redo();
          set({ project: next, activeFloorId: reconcileActiveFloorId(next, get().activeFloorId) });
          syncHistoryFlags();
        },

        select: (ids, mode) => {
          set((state) => ({ selection: applySelection(state.selection, ids, mode) }));
        },

        selectAll: () => {
          set((state) => ({ selection: selectAllIds(state.project.pieces.map((piece) => piece.id)) }));
        },

        clearSelection: () => set({ selection: [] }),

        copy: () => {
          set({ clipboard: selectedPieces().map(clonePiece) });
        },

        paste: (offset) => {
          const { clipboard } = get();
          if (clipboard.length === 0) {
            return;
          }
          const placed = duplicatePieces(clipboard, offset ?? [0, 0, 0]);
          execute(createAddPiecesCommand(placed));
          set({ selection: placed.map((piece) => piece.id) });
        },

        duplicateSelected: (offset) => {
          const pieces = selectedPieces();
          if (pieces.length === 0) {
            return;
          }
          const placed = duplicatePieces(pieces, offset ?? [0, 0, 0]);
          execute(createAddPiecesCommand(placed));
          set({ selection: placed.map((piece) => piece.id) });
        },

        deleteSelected: () => {
          const { selection } = get();
          if (selection.length === 0) {
            return;
          }
          execute(createDeletePiecesCommand(selection));
          set({ selection: [] });
        },

        moveSelected: (delta) => {
          transformSelected((piece) => translatePiece(piece, delta));
        },

        rotateSelected: (radians, pivot) => {
          const pieces = selectedPieces();
          if (pieces.length === 0) {
            return;
          }
          const resolvedPivot = pivot ?? centroidOf(pieces);
          execute(
            createTransformPiecesCommand(
              pieces.map((piece) => piece.id),
              (piece) => rotatePieceY(piece, radians, resolvedPivot),
            ),
          );
        },

        mirrorSelected: (axis, offset) => {
          transformSelected((piece) => mirrorPiece(piece, axis, offset ?? 0));
        },

        setSelectedBuildState: (buildState) => {
          const { selection } = get();
          if (selection.length === 0) {
            return;
          }
          execute(createSetBuildStateCommand(selection, buildState));
        },

        setGrid: (grid) => set({ grid }),

        addFloor: (name, elevation) => {
          const { project } = get();
          const index = project.floors.length;
          const floor: Floor = {
            id: createId('floor'),
            name: name ?? `Floor ${index + 1}`,
            index,
            elevation: elevation ?? nextFloorElevation(project),
            visible: true,
            locked: false,
          };
          execute(createAddFloorCommand(floor));
          set({ activeFloorId: floor.id });
        },

        deleteFloor: (id) => {
          const { project } = get();
          if (project.floors.length <= 1 || floorById(project, id) === undefined) {
            return;
          }
          execute(createDeleteFloorCommand(id));
          const next = get().project;
          const surviving = new Set(next.pieces.map((piece) => piece.id));
          set((state) => ({
            activeFloorId: reconcileActiveFloorId(next, state.activeFloorId),
            selection: state.selection.filter((pieceId) => surviving.has(pieceId)),
          }));
        },

        renameFloor: (id, name) => {
          if (floorById(get().project, id) === undefined) {
            return;
          }
          execute(createRenameFloorCommand(id, name));
        },

        setFloorElevation: (id, elevation) => {
          if (floorById(get().project, id) === undefined) {
            return;
          }
          execute(createSetFloorElevationCommand(id, elevation));
        },

        setFloorVisible: (id, visible) => {
          if (floorById(get().project, id) === undefined) {
            return;
          }
          execute(createSetFloorVisibleCommand(id, visible));
        },

        setFloorLocked: (id, locked) => {
          if (floorById(get().project, id) === undefined) {
            return;
          }
          execute(createSetFloorLockedCommand(id, locked));
        },

        setActiveFloor: (id) => {
          if (floorById(get().project, id) === undefined) {
            return;
          }
          set({ activeFloorId: id });
        },

        saveSelectionAsPrefab: (name) => {
          const pieces = selectedPieces();
          if (pieces.length === 0) {
            return null;
          }
          const prefab = prefabFromPieces(pieces, name);
          execute(createSavePrefabCommand(prefab));
          return prefab;
        },

        deletePrefab: (id) => {
          if (!get().project.prefabs.some((prefab) => prefab.id === id)) {
            return;
          }
          execute(createDeletePrefabCommand(id));
        },

        instantiatePrefab: (prefabId, position, floorId) => {
          const { project, activeFloorId } = get();
          const prefab = project.prefabs.find((candidate) => candidate.id === prefabId);
          if (prefab === undefined) {
            return [];
          }
          const targetFloor = floorById(project, floorId ?? activeFloorId) ?? sortedFloors(project)[0];
          if (targetFloor === undefined) {
            return [];
          }
          const origin: Vec3 = position ?? [0, targetFloor.elevation, 0];
          const placed = instantiatePrefabPieces(prefab, origin, targetFloor.id);
          execute(createInstantiatePrefabCommand(placed));
          const ids = placed.map((piece) => piece.id);
          set({ selection: ids });
          return ids;
        },
      };
    }),
  );
}

/** Default store used by the app. */
export const editorStore: EditorStore = createEditorStore(createEmptyProject('Untitled'));

/**
 * React hook bound to the default store. Pass a selector for narrow subscriptions;
 * with no selector it returns the whole state.
 */
export function useEditorStore<T = EditorState>(selector?: (state: EditorState) => T): T {
  return useStore(editorStore, selector ?? ((state) => state as unknown as T));
}

/** Look up a single piece by id. */
export function selectPieceById(state: EditorState, id: string): PlacedPiece | undefined {
  return state.project.pieces.find((piece) => piece.id === id);
}

/** Resolve the selected ids to pieces in document order. */
export function selectSelectedPieces(state: EditorState): PlacedPiece[] {
  const wanted = new Set(state.selection);
  return state.project.pieces.filter((piece) => wanted.has(piece.id));
}

/** Whether an undo step is available. */
export function selectCanUndo(state: EditorState): boolean {
  return state.canUndo;
}

/** Whether a redo step is available. */
export function selectCanRedo(state: EditorState): boolean {
  return state.canRedo;
}

/** Alias selector matching the `canUndo` state flag name. */
export const canUndo = selectCanUndo;

/** Alias selector matching the `canRedo` state flag name. */
export const canRedo = selectCanRedo;
