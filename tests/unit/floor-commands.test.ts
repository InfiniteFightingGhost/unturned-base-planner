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
  return createEmptyProject('Test', { id: 'p1', now: ISO });
}

function makePiece(floorId: string, id: string): PlacedPiece {
  return planPiece(def, { id, position: [0, 0, 0], floorId });
}

function floorIds(project: Project): string[] {
  return [...project.floors].map((floor) => floor.id).sort();
}

function pieceIds(project: Project): string[] {
  return [...project.pieces].map((piece) => piece.id).sort();
}

describe('floor command flow', () => {
  it('adds a floor as one undoable step and makes it active', () => {
    const store = createEditorStore(emptyProject());
    const groundId = store.getState().activeFloorId;

    store.getState().addFloor('Upper');
    const upperId = store.getState().activeFloorId;

    expect(upperId).not.toBe(groundId);
    expect(store.getState().project.floors).toHaveLength(2);
    expect(selectCanUndo(store.getState())).toBe(true);

    store.getState().undo();
    expect(store.getState().project.floors).toHaveLength(1);
    expect(store.getState().activeFloorId).toBe(groundId);

    store.getState().redo();
    expect(store.getState().project.floors).toHaveLength(2);
  });

  it('renames a floor as one undoable step', () => {
    const store = createEditorStore(emptyProject());
    const id = store.getState().activeFloorId;

    store.getState().renameFloor(id, 'Base');
    expect(store.getState().project.floors[0]?.name).toBe('Base');

    store.getState().undo();
    expect(store.getState().project.floors[0]?.name).toBe('Ground Floor');

    store.getState().redo();
    expect(store.getState().project.floors[0]?.name).toBe('Base');
  });

  it('sets a floor elevation as one undoable step', () => {
    const store = createEditorStore(emptyProject());
    const id = store.getState().activeFloorId;

    store.getState().setFloorElevation(id, 3.5);
    expect(store.getState().project.floors[0]?.elevation).toBe(3.5);

    store.getState().undo();
    expect(store.getState().project.floors[0]?.elevation).toBe(0);

    store.getState().redo();
    expect(store.getState().project.floors[0]?.elevation).toBe(3.5);
  });

  it('toggles visibility as one undoable step', () => {
    const store = createEditorStore(emptyProject());
    const id = store.getState().activeFloorId;

    store.getState().setFloorVisible(id, false);
    expect(store.getState().project.floors[0]?.visible).toBe(false);

    store.getState().undo();
    expect(store.getState().project.floors[0]?.visible).toBe(true);
  });

  it('toggles locked state as one undoable step', () => {
    const store = createEditorStore(emptyProject());
    const id = store.getState().activeFloorId;

    store.getState().setFloorLocked(id, true);
    expect(store.getState().project.floors[0]?.locked).toBe(true);

    store.getState().undo();
    expect(store.getState().project.floors[0]?.locked).toBe(false);
  });

  it('cannot delete the last remaining floor', () => {
    const store = createEditorStore(emptyProject());
    const id = store.getState().activeFloorId;

    store.getState().deleteFloor(id);

    expect(store.getState().project.floors).toHaveLength(1);
    expect(selectCanUndo(store.getState())).toBe(false);
  });

  it('deleting a floor removes its pieces and one undo restores both', () => {
    const store = createEditorStore(emptyProject());
    const groundId = store.getState().activeFloorId;
    store.getState().addFloor('Upper');
    const upperId = store.getState().activeFloorId;

    store
      .getState()
      .executeCommand(
        createAddPiecesCommand([makePiece(groundId, 'pa'), makePiece(upperId, 'pb')]),
      );
    expect(store.getState().project.pieces).toHaveLength(2);

    store.getState().deleteFloor(upperId);

    expect(floorIds(store.getState().project)).toEqual([groundId]);
    expect(pieceIds(store.getState().project)).toEqual(['pa']);
    expect(store.getState().activeFloorId).toBe(groundId);

    store.getState().undo();

    expect(floorIds(store.getState().project)).toEqual([groundId, upperId].sort());
    expect(pieceIds(store.getState().project)).toEqual(['pa', 'pb']);
    expect(selectCanRedo(store.getState())).toBe(true);
  });

  it('reconciles the active floor when its floor is undone away', () => {
    const store = createEditorStore(emptyProject());
    const groundId = store.getState().activeFloorId;

    store.getState().addFloor('Upper');
    const upperId = store.getState().activeFloorId;
    expect(upperId).toBe(store.getState().activeFloorId);

    store.getState().undo();

    expect(store.getState().activeFloorId).toBe(groundId);
  });

  it('setActiveFloor is UI-only and never records history', () => {
    const store = createEditorStore(emptyProject());
    const groundId = store.getState().activeFloorId;
    store.getState().addFloor('Upper');
    const upperId = store.getState().activeFloorId;
    const depthBefore = store.getState().canUndo;

    store.getState().setActiveFloor(groundId);
    expect(store.getState().activeFloorId).toBe(groundId);
    expect(store.getState().canUndo).toBe(depthBefore);

    store.getState().setActiveFloor(upperId);
    expect(store.getState().activeFloorId).toBe(upperId);
  });

  it('loads a new project and reconciles the active floor', () => {
    const store = createEditorStore(emptyProject());
    store.getState().addFloor('Upper');

    const replacement = emptyProject();
    const replacementFloorId = replacement.floors[0]?.id ?? '';
    store.getState().setProject(replacement);

    expect(store.getState().activeFloorId).toBe(replacementFloorId);
  });
});
