import { describe, expect, it } from 'vitest';
import { createEmptyProject, planPiece } from '@/domain';
import type { PlacedPiece, Project } from '@/domain';
import {
  createAddPiecesCommand,
  createEditorStore,
  selectCanRedo,
  selectCanUndo,
} from '@/editor';
import { makeDefinition } from './domain-fixtures';

const ISO = '2024-01-01T00:00:00.000Z';
const def = makeDefinition();

function emptyProject(): Project {
  return createEmptyProject('Prefabs', { id: 'p1', now: ISO });
}

function makePiece(floorId: string, id: string, x: number): PlacedPiece {
  return planPiece(def, { id, position: [x, 0, 0], floorId });
}

function seedSelection(store: ReturnType<typeof createEditorStore>): string {
  const floorId = store.getState().activeFloorId;
  store
    .getState()
    .executeCommand(createAddPiecesCommand([makePiece(floorId, 'a', 1), makePiece(floorId, 'b', 2)]));
  store.getState().select(['a', 'b'], 'replace');
  return floorId;
}

describe('prefab command flow', () => {
  it('saves the selection as a prefab and undo/redo restores it', () => {
    const store = createEditorStore(emptyProject());
    seedSelection(store);

    const prefab = store.getState().saveSelectionAsPrefab('Wall');
    expect(prefab).not.toBeNull();
    expect(store.getState().project.prefabs).toHaveLength(1);
    expect(store.getState().project.prefabs[0]?.pieces).toHaveLength(2);
    expect(selectCanUndo(store.getState())).toBe(true);

    store.getState().undo();
    expect(store.getState().project.prefabs).toHaveLength(0);

    store.getState().redo();
    expect(store.getState().project.prefabs).toHaveLength(1);
    expect(selectCanRedo(store.getState())).toBe(false);
  });

  it('does not save a prefab when nothing is selected', () => {
    const store = createEditorStore(emptyProject());
    store.getState().clearSelection();

    const prefab = store.getState().saveSelectionAsPrefab('Empty');

    expect(prefab).toBeNull();
    expect(store.getState().project.prefabs).toHaveLength(0);
    expect(selectCanUndo(store.getState())).toBe(false);
  });

  it('instantiates all pieces in a single history step and selects them', () => {
    const store = createEditorStore(emptyProject());
    seedSelection(store);
    const prefab = store.getState().saveSelectionAsPrefab('Wall');
    if (prefab === null) {
      throw new Error('prefab was not created');
    }

    const ids = store.getState().instantiatePrefab(prefab.id);

    expect(ids).toHaveLength(2);
    expect(store.getState().project.pieces).toHaveLength(4);
    expect([...store.getState().selection].sort()).toEqual([...ids].sort());

    store.getState().undo();
    expect(store.getState().project.pieces).toHaveLength(2);

    store.getState().redo();
    expect(store.getState().project.pieces).toHaveLength(4);
  });

  it('defaults the stamp position to the active floor elevation and floor', () => {
    const store = createEditorStore(emptyProject());
    const floorId = seedSelection(store);
    store.getState().setFloorElevation(floorId, 3);
    const prefab = store.getState().saveSelectionAsPrefab('Wall');
    if (prefab === null) {
      throw new Error('prefab was not created');
    }

    const ids = store.getState().instantiatePrefab(prefab.id);
    const created = store.getState().project.pieces.find((piece) => piece.id === ids[0]);
    expect(created?.floorId).toBe(floorId);
    expect(created?.position[1]).toBe(3);
  });

  it('deletes a prefab and undo restores it', () => {
    const store = createEditorStore(emptyProject());
    seedSelection(store);
    const prefab = store.getState().saveSelectionAsPrefab('Wall');
    if (prefab === null) {
      throw new Error('prefab was not created');
    }

    store.getState().deletePrefab(prefab.id);
    expect(store.getState().project.prefabs).toHaveLength(0);

    store.getState().undo();
    expect(store.getState().project.prefabs).toHaveLength(1);
    expect(store.getState().project.prefabs[0]?.id).toBe(prefab.id);
  });

  it('ignores instantiate and delete for unknown prefab ids', () => {
    const store = createEditorStore(emptyProject());

    expect(store.getState().instantiatePrefab('missing')).toEqual([]);
    store.getState().deletePrefab('missing');
    expect(selectCanUndo(store.getState())).toBe(false);
  });
});
