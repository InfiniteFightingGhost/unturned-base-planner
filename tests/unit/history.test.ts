import { describe, expect, it } from 'vitest';
import { History, createEmptyProject } from '@/domain';
import { addPieceCommand, addPiecesCommand, makeDefinition, makePiece } from './domain-fixtures';

const ISO = '2024-01-01T00:00:00.000Z';
const def = makeDefinition();

function makeEmpty(): { project: ReturnType<typeof createEmptyProject>; floorId: string } {
  const project = createEmptyProject('Base', { id: 'p1', now: ISO });
  return { project, floorId: project.floors[0]?.id ?? '' };
}

describe('History', () => {
  it('undos and redos 150 sequential adds back to the original', () => {
    const { project: original, floorId } = makeEmpty();
    const history = new History();
    let project = original;

    for (let i = 0; i < 150; i += 1) {
      project = history.execute(project, addPieceCommand(makePiece(def, floorId, `piece-${i}`, i)));
    }
    expect(project.pieces).toHaveLength(150);
    expect(history.depth).toBe(150);

    for (let i = 0; i < 150; i += 1) {
      project = history.undo();
    }
    expect(project).toEqual(original);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);

    for (let i = 0; i < 150; i += 1) {
      project = history.redo();
    }
    expect(project.pieces).toHaveLength(150);
    expect(history.canRedo()).toBe(false);
  });

  it('undoes a batch command that adds 50 pieces in one step', () => {
    const { project: original, floorId } = makeEmpty();
    const pieces = Array.from({ length: 50 }, (_, i) => makePiece(def, floorId, `batch-${i}`, i));
    const history = new History();

    const after = history.execute(original, addPiecesCommand(pieces));
    expect(after.pieces).toHaveLength(50);
    expect(history.depth).toBe(1);

    const undone = history.undo();
    expect(undone).toEqual(original);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
  });

  it('returns clones rather than references to previous snapshots', () => {
    const { project: original, floorId } = makeEmpty();
    const history = new History();

    const after = history.execute(original, addPieceCommand(makePiece(def, floorId, 'piece-1', 1)));
    const undone = history.undo();

    expect(undone).not.toBe(after);
    expect(undone.pieces).not.toBe(after.pieces);
    expect(undone).toEqual(original);
  });

  it('throws when undo/redo are called with empty stacks', () => {
    const history = new History();
    expect(() => history.undo()).toThrow();
    expect(() => history.redo()).toThrow();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.depth).toBe(0);
  });

  it('evicts the oldest entries when maxDepth is exceeded', () => {
    const { project: original, floorId } = makeEmpty();
    const history = new History(10);
    let project = original;

    for (let i = 0; i < 15; i += 1) {
      project = history.execute(project, addPieceCommand(makePiece(def, floorId, `piece-${i}`, i)));
    }
    expect(history.depth).toBe(10);

    for (let i = 0; i < 10; i += 1) {
      project = history.undo();
    }
    expect(history.canUndo()).toBe(false);
    expect(project.pieces).toHaveLength(5);
  });

  it('clears all undo/redo entries', () => {
    const { project, floorId } = makeEmpty();
    const history = new History();
    const after = history.execute(project, addPieceCommand(makePiece(def, floorId, 'piece-1', 1)));
    history.undo();
    history.redo();

    history.clear();

    expect(history.depth).toBe(0);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(after.pieces).toHaveLength(1);
  });
});
