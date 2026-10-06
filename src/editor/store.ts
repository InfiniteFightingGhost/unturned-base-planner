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

import { createEmptyProject, History } from '@/domain';
import type { BuildState, Command, PlacedPiece, Project, Vec3 } from '@/domain';
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

        setProject: (project) => {
          history.clear();
          set({ project, selection: [], clipboard: [], canUndo: false, canRedo: false });
        },

        executeCommand: execute,

        undo: () => {
          if (!history.canUndo()) {
            return;
          }
          set({ project: history.undo() });
          syncHistoryFlags();
        },

        redo: () => {
          if (!history.canRedo()) {
            return;
          }
          set({ project: history.redo() });
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
