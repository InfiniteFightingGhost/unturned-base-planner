import { describe, expect, it } from 'vitest';
import { createEmptyProject, planPiece } from '@/domain';
import type { PlacedPiece, Project } from '@/domain';
import {
  createAddPiecesCommand,
  createEditorStore,
  normalizeTag,
  normalizeTags,
  selectCanUndo,
} from '@/editor';
import { makeDefinition } from './domain-fixtures';

const ISO = '2024-01-01T00:00:00.000Z';
const def = makeDefinition();

function emptyProject(): Project {
  return createEmptyProject('Test', { id: 'p1', now: ISO });
}

function makePiece(floorId: string, id: string, tags: string[] = []): PlacedPiece {
  return planPiece(def, { id, position: [0, 0, 0], floorId, metadata: { tags } });
}

function tagsOf(project: Project, id: string): string[] | undefined {
  return project.pieces.find((piece) => piece.id === id)?.metadata.tags;
}

describe('normalizeTags', () => {
  it('trims, drops empties, de-duplicates and sorts deterministically', () => {
    expect(normalizeTags(['  beta ', 'alpha', 'alpha', '', '   ', 'beta'])).toEqual([
      'alpha',
      'beta',
    ]);
  });

  it('returns a new array and leaves the input untouched', () => {
    const input = ['b', ' a '];
    const result = normalizeTags(input);
    expect(result).toEqual(['a', 'b']);
    expect(input).toEqual(['b', ' a ']);
  });

  it('normalizes a single tag and reports blanks as null', () => {
    expect(normalizeTag('  raid  ')).toBe('raid');
    expect(normalizeTag('   ')).toBeNull();
    expect(normalizeTag('')).toBeNull();
  });
});

describe('tag command flow', () => {
  it('sets normalized tags on the whole selection as one undoable step', () => {
    const store = createEditorStore(emptyProject());
    const floorId = store.getState().activeFloorId;
    store
      .getState()
      .executeCommand(createAddPiecesCommand([makePiece(floorId, 'pa'), makePiece(floorId, 'pb')]));
    store.getState().select(['pa', 'pb'], 'replace');

    store.getState().setSelectionTags(['  beta ', 'alpha', 'alpha']);
    expect(tagsOf(store.getState().project, 'pa')).toEqual(['alpha', 'beta']);
    expect(tagsOf(store.getState().project, 'pb')).toEqual(['alpha', 'beta']);

    store.getState().undo();
    expect(tagsOf(store.getState().project, 'pa')).toEqual([]);

    store.getState().redo();
    expect(tagsOf(store.getState().project, 'pa')).toEqual(['alpha', 'beta']);
  });

  it('adds and removes tags on the selection, undoable', () => {
    const store = createEditorStore(emptyProject());
    const floorId = store.getState().activeFloorId;
    store.getState().executeCommand(createAddPiecesCommand([makePiece(floorId, 'pa', ['base'])]));
    store.getState().select(['pa'], 'replace');

    store.getState().addTagToSelection('  extra ');
    expect(tagsOf(store.getState().project, 'pa')).toEqual(['base', 'extra']);

    store.getState().undo();
    expect(tagsOf(store.getState().project, 'pa')).toEqual(['base']);

    store.getState().redo();
    expect(tagsOf(store.getState().project, 'pa')).toEqual(['base', 'extra']);

    store.getState().removeTagFromSelection('base');
    expect(tagsOf(store.getState().project, 'pa')).toEqual(['extra']);

    store.getState().undo();
    expect(tagsOf(store.getState().project, 'pa')).toEqual(['base', 'extra']);
  });

  it('de-duplicates an already-present tag (idempotent add)', () => {
    const store = createEditorStore(emptyProject());
    const floorId = store.getState().activeFloorId;
    store.getState().executeCommand(createAddPiecesCommand([makePiece(floorId, 'pa', ['base'])]));
    store.getState().select(['pa'], 'replace');

    store.getState().addTagToSelection('base');
    expect(tagsOf(store.getState().project, 'pa')).toEqual(['base']);
  });

  it('no-ops without a selection', () => {
    const store = createEditorStore(emptyProject());
    const floorId = store.getState().activeFloorId;
    store.getState().executeCommand(createAddPiecesCommand([makePiece(floorId, 'pa')]));
    store.getState().clearSelection();

    store.getState().setSelectionTags(['x']);
    store.getState().addTagToSelection('y');
    store.getState().removeTagFromSelection('z');

    expect(tagsOf(store.getState().project, 'pa')).toEqual([]);
    expect(selectCanUndo(store.getState())).toBe(true);
  });

  it('no-ops for blank tags and for removing a missing tag', () => {
    const store = createEditorStore(emptyProject());
    const floorId = store.getState().activeFloorId;
    store.getState().executeCommand(createAddPiecesCommand([makePiece(floorId, 'pa', ['base'])]));
    store.getState().select(['pa'], 'replace');
    const before = store.getState().project;

    store.getState().addTagToSelection('   ');
    expect(store.getState().project).toBe(before);

    store.getState().removeTagFromSelection('missing');
    expect(store.getState().project).toBe(before);
  });
});
