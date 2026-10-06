import { describe, expect, it } from 'vitest';
import { createEmptyProject, planPiece, serializeProject } from '@/domain';
import type { PlacedPiece, Project } from '@/domain';
import {
  createAddPiecesCommand,
  createBatchCommand,
  createDeletePiecesCommand,
  createEditorStore,
  selectCanRedo,
  selectCanUndo,
  selectPieceById,
  selectSelectedPieces,
} from '@/editor';
import { makeDefinition } from './domain-fixtures';

const ISO = '2024-01-01T00:00:00.000Z';
const def = makeDefinition();

function emptyProject(): Project {
  return createEmptyProject('Test', { id: 'p1', now: ISO });
}

function makePiece(floorId: string, id: string, x = 0): PlacedPiece {
  return planPiece(def, { id, position: [x, 0, 0], floorId });
}

function floorIdOf(project: Project): string {
  return project.floors[0]?.id ?? '';
}

describe('editor store command flow', () => {
  it('adds, moves, and deletes pieces through commands', () => {
    const project = emptyProject();
    const store = createEditorStore(project);
    const floorId = floorIdOf(project);

    store.getState().executeCommand(createAddPiecesCommand([makePiece(floorId, 'a', 1)]));
    expect(store.getState().project.pieces).toHaveLength(1);

    store.getState().select(['a'], 'replace');
    expect(selectSelectedPieces(store.getState())).toHaveLength(1);

    store.getState().moveSelected([2, 0, 0]);
    expect(selectPieceById(store.getState(), 'a')?.position).toEqual([3, 0, 0]);

    store.getState().deleteSelected();
    expect(store.getState().project.pieces).toHaveLength(0);
    expect(store.getState().selection).toEqual([]);
  });

  it('ignores duplicate ids when adding (documented overwrite/ignore policy)', () => {
    const project = emptyProject();
    const store = createEditorStore(project);
    const floorId = floorIdOf(project);

    store.getState().executeCommand(createAddPiecesCommand([makePiece(floorId, 'dup', 1)]));
    store.getState().executeCommand(createAddPiecesCommand([makePiece(floorId, 'dup', 99)]));

    const pieces = store.getState().project.pieces;
    expect(pieces).toHaveLength(1);
    expect(pieces[0]?.position).toEqual([1, 0, 0]);
  });

  it('undoes and redoes 120 operations back to identical serialized states', () => {
    const project = emptyProject();
    const store = createEditorStore(project);
    const floorId = floorIdOf(project);

    const baseline = serializeProject(store.getState().project);

    for (let i = 0; i < 120; i += 1) {
      store.getState().executeCommand(createAddPiecesCommand([makePiece(floorId, `p-${i}`, i)]));
    }
    const after = serializeProject(store.getState().project);
    expect(after).not.toBe(baseline);
    expect(store.getState().project.pieces).toHaveLength(120);

    for (let i = 0; i < 120; i += 1) {
      store.getState().undo();
    }
    expect(serializeProject(store.getState().project)).toBe(baseline);
    expect(selectCanUndo(store.getState())).toBe(false);
    expect(selectCanRedo(store.getState())).toBe(true);

    for (let i = 0; i < 120; i += 1) {
      store.getState().redo();
    }
    expect(serializeProject(store.getState().project)).toBe(after);
    expect(selectCanRedo(store.getState())).toBe(false);
  });

  it('undoes a batch that adds 50 pieces in a single step', () => {
    const project = emptyProject();
    const store = createEditorStore(project);
    const floorId = floorIdOf(project);

    const batches = Array.from({ length: 5 }, (_, batchIndex) =>
      createAddPiecesCommand(
        Array.from({ length: 10 }, (_, pieceIndex) =>
          makePiece(floorId, `batch-${batchIndex}-${pieceIndex}`, batchIndex * 10 + pieceIndex),
        ),
      ),
    );
    store.getState().executeCommand(createBatchCommand('Add 50 pieces', batches));

    expect(store.getState().project.pieces).toHaveLength(50);
    expect(selectCanUndo(store.getState())).toBe(true);

    store.getState().undo();
    expect(store.getState().project.pieces).toHaveLength(0);
    expect(selectCanUndo(store.getState())).toBe(false);
    expect(selectCanRedo(store.getState())).toBe(true);

    store.getState().redo();
    expect(store.getState().project.pieces).toHaveLength(50);
  });

  it('does not create history entries for selection/clipboard operations', () => {
    const project = emptyProject();
    const store = createEditorStore(project);
    const floorId = floorIdOf(project);

    store.getState().executeCommand(createAddPiecesCommand([makePiece(floorId, 'a', 0)]));

    store.getState().select(['a'], 'replace');
    store.getState().copy();
    store.getState().selectAll();
    store.getState().clearSelection();
    expect(store.getState().selection).toEqual([]);
    expect(store.getState().canUndo).toBe(true);

    store.getState().undo();
    expect(store.getState().project.pieces).toHaveLength(0);
    expect(store.getState().canUndo).toBe(false);
  });

  it('paste and duplicateSelected create fresh ids and select the copies', () => {
    const project = emptyProject();
    const store = createEditorStore(project);
    const floorId = floorIdOf(project);

    store.getState().executeCommand(createAddPiecesCommand([makePiece(floorId, 'a', 1)]));
    store.getState().select(['a'], 'replace');
    store.getState().copy();
    store.getState().paste([0, 0, 5]);

    expect(store.getState().project.pieces).toHaveLength(2);
    const pastedId = store.getState().selection[0];
    expect(pastedId).toBeDefined();
    expect(pastedId).not.toBe('a');
    expect(selectPieceById(store.getState(), pastedId ?? '')?.position).toEqual([1, 0, 5]);
  });

  it('setProject is the only raw setter and is load-only (clears history + UI state)', () => {
    const project = emptyProject();
    const store = createEditorStore(project);
    const floorId = floorIdOf(project);

    store.getState().executeCommand(createAddPiecesCommand([makePiece(floorId, 'a', 0)]));
    store.getState().select(['a'], 'replace');

    const next = emptyProject();
    store.getState().setProject(next);

    expect(store.getState().project).toBe(next);
    expect(store.getState().selection).toEqual([]);
    expect(store.getState().clipboard).toEqual([]);
    expect(selectCanUndo(store.getState())).toBe(false);
    expect(selectCanRedo(store.getState())).toBe(false);
  });

  it('keeps isolated stores independent', () => {
    const storeA = createEditorStore(emptyProject());
    const storeB = createEditorStore(emptyProject());
    const floorId = floorIdOf(storeA.getState().project);

    storeA.getState().executeCommand(createAddPiecesCommand([makePiece(floorId, 'a', 0)]));
    expect(storeA.getState().project.pieces).toHaveLength(1);
    expect(storeB.getState().project.pieces).toHaveLength(0);
    expect(storeB.getState().canUndo).toBe(false);
  });
});

describe('delete command', () => {
  it('ignores unknown ids', () => {
    const project = emptyProject();
    const store = createEditorStore(project);
    const floorId = floorIdOf(project);

    store.getState().executeCommand(createAddPiecesCommand([makePiece(floorId, 'a', 0)]));
    store.getState().executeCommand(createDeletePiecesCommand(['missing']));
    expect(store.getState().project.pieces).toHaveLength(1);
  });
});
