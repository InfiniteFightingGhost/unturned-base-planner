import { describe, expect, it } from 'vitest';
import { createEmptyProject, parseProject, serializeProject } from '@/domain';
import type { Project } from '@/domain';
import {
  createEditorStore,
  createSetInventoryCommand,
  createSetInventoryResourceCommand,
  selectCanRedo,
  selectCanUndo,
} from '@/editor';

const ISO = '2024-01-01T00:00:00.000Z';

function emptyProject(): Project {
  return createEmptyProject('Inventory', { id: 'p1', now: ISO });
}

describe('inventory commands', () => {
  it('sets one resource amount and keeps the document valid', () => {
    const store = createEditorStore(emptyProject());
    store.getState().setInventoryResource('log.birch', 5);

    expect(store.getState().project.inventory).toEqual([
      { resourceId: 'log.birch', amount: 5 },
    ]);
    expect(() => parseProject(serializeProject(store.getState().project))).not.toThrow();
  });

  it('updates an existing entry rather than duplicating it', () => {
    const store = createEditorStore(emptyProject());
    store.getState().setInventoryResource('log.birch', 5);
    store.getState().setInventoryResource('log.birch', 9);

    expect(store.getState().project.inventory).toEqual([
      { resourceId: 'log.birch', amount: 9 },
    ]);
  });

  it('removes an entry when the amount is zero', () => {
    const store = createEditorStore(emptyProject());
    store.getState().setInventoryResource('log.birch', 5);
    store.getState().setInventoryResource('log.birch', 0);

    expect(store.getState().project.inventory).toEqual([]);
  });

  it('undoes and redoes inventory edits', () => {
    const store = createEditorStore(emptyProject());
    const baseline = serializeProject(store.getState().project);

    store.getState().setInventoryResource('log.birch', 5);
    const afterSet = serializeProject(store.getState().project);
    expect(selectCanUndo(store.getState())).toBe(true);

    store.getState().undo();
    expect(serializeProject(store.getState().project)).toBe(baseline);
    expect(selectCanUndo(store.getState())).toBe(false);
    expect(selectCanRedo(store.getState())).toBe(true);

    store.getState().redo();
    expect(serializeProject(store.getState().project)).toBe(afterSet);
    expect(selectCanRedo(store.getState())).toBe(false);
  });

  it('clears the whole inventory in one undoable step', () => {
    const store = createEditorStore(emptyProject());
    store.getState().setInventory([
      { resourceId: 'log.birch', amount: 5 },
      { resourceId: 'cloth', amount: 2 },
    ]);
    expect(store.getState().project.inventory).toHaveLength(2);

    store.getState().clearInventory();
    expect(store.getState().project.inventory).toEqual([]);

    store.getState().undo();
    expect(store.getState().project.inventory).toHaveLength(2);
  });

  it('does not record history when clearing an already-empty inventory', () => {
    const store = createEditorStore(emptyProject());
    store.getState().clearInventory();
    expect(store.getState().canUndo).toBe(false);
  });

  it('normalizes fractional and negative amounts through the command factory', () => {
    const store = createEditorStore(emptyProject());
    store.getState().executeCommand(createSetInventoryResourceCommand('log.birch', 3.9));
    expect(store.getState().project.inventory).toEqual([
      { resourceId: 'log.birch', amount: 3 },
    ]);

    store.getState().executeCommand(createSetInventoryResourceCommand('log.birch', -4));
    expect(store.getState().project.inventory).toEqual([]);
  });

  it('replaces the whole inventory through the batch factory', () => {
    const store = createEditorStore(emptyProject());
    store.getState().executeCommand(
      createSetInventoryCommand([
        { resourceId: 'log.maple', amount: 4 },
        { resourceId: 'scrap.metal', amount: 1 },
      ]),
    );

    expect(store.getState().project.inventory).toEqual([
      { resourceId: 'log.maple', amount: 4 },
      { resourceId: 'scrap.metal', amount: 1 },
    ]);
  });
});
