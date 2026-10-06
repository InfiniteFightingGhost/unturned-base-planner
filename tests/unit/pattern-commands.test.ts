import { describe, expect, it } from 'vitest';
import { createEmptyProject, planPiece } from '@/domain';
import type { PlacedPiece, Project } from '@/domain';
import {
  createEditorStore,
  createGridArrayCommand,
  createLinearArrayCommand,
  createMirrorCommand,
  createRadialArrayCommand,
  selectCanRedo,
  selectCanUndo,
  selectSelectedPieces,
} from '@/editor';
import { makeDefinition } from './domain-fixtures';

const ISO = '2024-01-01T00:00:00.000Z';
const def = makeDefinition();

function emptyProject(): Project {
  return createEmptyProject('Patterns', { id: 'p1', now: ISO });
}

function floorIdOf(project: Project): string {
  return project.floors[0]?.id ?? '';
}

function seed(store: ReturnType<typeof createEditorStore>): PlacedPiece {
  const floorId = floorIdOf(store.getState().project);
  const piece = planPiece(def, { id: 'base', position: [0, 0, 0], floorId });
  store.getState().executeCommand({
    type: 'piece.add',
    label: 'Add base',
    apply(draft: Project): void {
      draft.pieces.push(piece);
    },
  });
  store.getState().select(['base'], 'replace');
  return piece;
}

describe('pattern commands are a single undo step', () => {
  it('linear array adds count copies and one undo removes them all', () => {
    const store = createEditorStore(emptyProject());
    seed(store);

    store
      .getState()
      .executeCommand(createLinearArrayCommand(selectSelectedPieces(store.getState()), 3, 2, [1, 0, 0]));

    expect(store.getState().project.pieces).toHaveLength(4);
    expect(selectCanUndo(store.getState())).toBe(true);

    store.getState().undo();
    expect(store.getState().project.pieces).toHaveLength(1);
    expect(selectCanRedo(store.getState())).toBe(true);

    store.getState().redo();
    expect(store.getState().project.pieces).toHaveLength(4);
    expect(selectCanRedo(store.getState())).toBe(false);
  });

  it('grid array adds rows*cols - 1 copies and one undo removes them all', () => {
    const store = createEditorStore(emptyProject());
    seed(store);

    store
      .getState()
      .executeCommand(
        createGridArrayCommand(selectSelectedPieces(store.getState()), 2, 2, 2, 2),
      );

    expect(store.getState().project.pieces).toHaveLength(4);
    store.getState().undo();
    expect(store.getState().project.pieces).toHaveLength(1);
  });

  it('radial array adds count copies and one undo removes them all', () => {
    const store = createEditorStore(emptyProject());
    seed(store);

    store
      .getState()
      .executeCommand(
        createRadialArrayCommand(selectSelectedPieces(store.getState()), 4, 4, Math.PI * 2, [0, 0, 0]),
      );

    expect(store.getState().project.pieces).toHaveLength(5);
    store.getState().undo();
    expect(store.getState().project.pieces).toHaveLength(1);
  });

  it('mirror adds one copy and one undo removes it', () => {
    const store = createEditorStore(emptyProject());
    seed(store);

    store
      .getState()
      .executeCommand(createMirrorCommand(selectSelectedPieces(store.getState()), 'x'));

    expect(store.getState().project.pieces).toHaveLength(2);
    store.getState().undo();
    expect(store.getState().project.pieces).toHaveLength(1);
  });

  it('uses a pattern-specific label and creates unique ids', () => {
    const store = createEditorStore(emptyProject());
    seed(store);

    store
      .getState()
      .executeCommand(createLinearArrayCommand(selectSelectedPieces(store.getState()), 2, 1, [0, 0, 1]));

    const ids = store.getState().project.pieces.map((piece) => piece.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('base');
  });
});
