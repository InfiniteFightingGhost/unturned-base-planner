import { describe, expect, it } from 'vitest';
import { createEmptyProject, planPiece } from '@/domain';
import type { PlacedPiece, Project } from '@/domain';
import {
  createAddPiecesCommand,
  createAddZoneCommand,
  createDeleteZoneCommand,
  createEditorStore,
  createRenameZoneCommand,
  createSetZoneColorCommand,
  createSetZoneLockedCommand,
  createSetZoneVisibleCommand,
  selectCanRedo,
  selectCanUndo,
} from '@/editor';
import { makeDefinition } from './domain-fixtures';

const ISO = '2024-01-01T00:00:00.000Z';
const def = makeDefinition();

function emptyProject(): Project {
  return createEmptyProject('Test', { id: 'p1', now: ISO });
}

function makePiece(floorId: string, id: string, zoneId: string | null = null): PlacedPiece {
  return planPiece(def, { id, position: [0, 0, 0], floorId, zoneId });
}

function zoneIds(project: Project): string[] {
  return project.zones.map((zone) => zone.id);
}

describe('zone command flow', () => {
  it('adds a zone as one undoable step and makes it active', () => {
    const store = createEditorStore(emptyProject());
    store.getState().addZone('Alpha');

    const state = store.getState();
    expect(state.project.zones).toHaveLength(1);
    expect(state.project.zones[0]?.name).toBe('Alpha');
    expect(state.activeZoneId).toBe(state.project.zones[0]?.id);
    expect(selectCanUndo(state)).toBe(true);

    store.getState().undo();
    expect(store.getState().project.zones).toHaveLength(0);
    expect(store.getState().activeZoneId).toBeNull();

    store.getState().redo();
    expect(store.getState().project.zones).toHaveLength(1);
  });

  it('renames a zone as one undoable step', () => {
    const store = createEditorStore(emptyProject());
    store.getState().addZone('Alpha');
    const id = store.getState().project.zones[0]?.id ?? '';

    store.getState().renameZone(id, 'Beta');
    expect(store.getState().project.zones[0]?.name).toBe('Beta');

    store.getState().undo();
    expect(store.getState().project.zones[0]?.name).toBe('Alpha');

    store.getState().redo();
    expect(store.getState().project.zones[0]?.name).toBe('Beta');
  });

  it('sets a zone color as one undoable step', () => {
    const store = createEditorStore(emptyProject());
    store.getState().addZone('Alpha');
    const id = store.getState().project.zones[0]?.id ?? '';

    store.getState().setZoneColor(id, '#ff0000');
    expect(store.getState().project.zones[0]?.color).toBe('#ff0000');

    store.getState().undo();
    expect(store.getState().project.zones[0]?.color).toBe('#3b82f6');

    store.getState().redo();
    expect(store.getState().project.zones[0]?.color).toBe('#ff0000');
  });

  it('toggles zone visibility as one undoable step', () => {
    const store = createEditorStore(emptyProject());
    store.getState().addZone('Alpha');
    const id = store.getState().project.zones[0]?.id ?? '';

    store.getState().setZoneVisible(id, false);
    expect(store.getState().project.zones[0]?.visible).toBe(false);

    store.getState().undo();
    expect(store.getState().project.zones[0]?.visible).toBe(true);
  });

  it('toggles zone locked state as one undoable step', () => {
    const store = createEditorStore(emptyProject());
    store.getState().addZone('Alpha');
    const id = store.getState().project.zones[0]?.id ?? '';

    store.getState().setZoneLocked(id, true);
    expect(store.getState().project.zones[0]?.locked).toBe(true);

    store.getState().undo();
    expect(store.getState().project.zones[0]?.locked).toBe(false);
  });

  it('deleting a zone clears its pieces and one undo restores both', () => {
    const store = createEditorStore(emptyProject());
    store.getState().addZone('Alpha');
    const zoneId = store.getState().project.zones[0]?.id ?? '';
    const floorId = store.getState().activeFloorId;

    store
      .getState()
      .executeCommand(
        createAddPiecesCommand([makePiece(floorId, 'pa', zoneId), makePiece(floorId, 'pb', null)]),
      );

    store.getState().deleteZone(zoneId);

    expect(store.getState().project.zones).toHaveLength(0);
    expect(store.getState().activeZoneId).toBeNull();
    expect(store.getState().project.pieces.find((p) => p.id === 'pa')?.zoneId).toBeNull();
    expect(store.getState().project.pieces.find((p) => p.id === 'pb')?.zoneId).toBeNull();

    // A SINGLE undo restores the zone AND the membership together.
    store.getState().undo();
    expect(zoneIds(store.getState().project)).toEqual([zoneId]);
    expect(store.getState().project.pieces.find((p) => p.id === 'pa')?.zoneId).toBe(zoneId);
    expect(store.getState().project.pieces.find((p) => p.id === 'pb')?.zoneId).toBeNull();
    expect(selectCanRedo(store.getState())).toBe(true);

    store.getState().redo();
    expect(store.getState().project.zones).toHaveLength(0);
    expect(store.getState().project.pieces.find((p) => p.id === 'pa')?.zoneId).toBeNull();
  });

  it('assigns the selection to a zone and back to null, undoable', () => {
    const store = createEditorStore(emptyProject());
    store.getState().addZone('Alpha');
    const zoneId = store.getState().project.zones[0]?.id ?? '';
    const floorId = store.getState().activeFloorId;
    store.getState().executeCommand(createAddPiecesCommand([makePiece(floorId, 'pa')]));
    store.getState().select(['pa'], 'replace');

    store.getState().assignSelectionToZone(zoneId);
    expect(store.getState().project.pieces[0]?.zoneId).toBe(zoneId);

    store.getState().undo();
    expect(store.getState().project.pieces[0]?.zoneId).toBeNull();

    store.getState().redo();
    expect(store.getState().project.pieces[0]?.zoneId).toBe(zoneId);

    store.getState().assignSelectionToZone(null);
    expect(store.getState().project.pieces[0]?.zoneId).toBeNull();

    store.getState().undo();
    expect(store.getState().project.pieces[0]?.zoneId).toBe(zoneId);
  });

  it('ignores zone mutations with no selection or an unknown zone', () => {
    const store = createEditorStore(emptyProject());
    store.getState().addZone('Alpha');
    const before = store.getState().project;

    store.getState().assignSelectionToZone(null);
    expect(store.getState().project).toBe(before);

    store.getState().select(['missing'], 'replace');
    store.getState().assignSelectionToZone('unknown-zone');
    expect(store.getState().project).toBe(before);
  });

  it('exposes pure, cloning command factories', () => {
    const zone = { id: 'z1', name: 'Zulu', color: '#ffffff', visible: true, locked: false };
    const add = createAddZoneCommand(zone);
    const remove = createDeleteZoneCommand('z1');
    const rename = createRenameZoneCommand('z1', 'Yankee');
    const color = createSetZoneColorCommand('z1', '#000000');
    const visible = createSetZoneVisibleCommand('z1', false);
    const locked = createSetZoneLockedCommand('z1', true);
    expect(add.type).toBe('zone.add');
    expect(remove.type).toBe('zone.delete');
    expect(rename.type).toBe('zone.rename');
    expect(color.type).toBe('zone.setColor');
    expect(visible.type).toBe('zone.setVisible');
    expect(locked.type).toBe('zone.setLocked');

    const base = emptyProject();
    const draft = structuredClone(base);
    add.apply(draft);
    expect(draft.zones).toHaveLength(1);
    rename.apply(draft);
    color.apply(draft);
    visible.apply(draft);
    locked.apply(draft);
    expect(draft.zones[0]).toMatchObject({
      name: 'Yankee',
      color: '#000000',
      visible: false,
      locked: true,
    });
    remove.apply(draft);
    expect(draft.zones).toHaveLength(0);
  });
});
