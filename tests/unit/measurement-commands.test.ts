import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@/domain';
import type { Project } from '@/domain';
import {
  createAddMeasurementCommand,
  createClearMeasurementsCommand,
  createDeleteMeasurementCommand,
  createEditorStore,
  measurementFromPoints,
} from '@/editor';

const ISO = '2024-01-01T00:00:00.000Z';

function emptyProject(): Project {
  return createEmptyProject('Test', { id: 'p1', now: ISO });
}

describe('measurement command flow', () => {
  it('adds a measurement as one undoable step', () => {
    const store = createEditorStore(emptyProject());
    store.getState().addMeasurement('distance', [[0, 0, 0], [3, 4, 0]]);

    expect(store.getState().project.measurements).toHaveLength(1);
    expect(store.getState().project.measurements[0]?.value).toBe(5);
    expect(store.getState().canUndo).toBe(true);

    store.getState().undo();
    expect(store.getState().project.measurements).toHaveLength(0);

    store.getState().redo();
    expect(store.getState().project.measurements).toHaveLength(1);
  });

  it('deletes a measurement by id as one undoable step', () => {
    const store = createEditorStore(emptyProject());
    store.getState().addMeasurement('width', [[0, 0, 0], [2, 0, 0]]);
    store.getState().addMeasurement('height', [[0, 0, 0], [0, 3, 0]]);

    const target = store.getState().project.measurements[0];
    expect(target).toBeDefined();
    if (target === undefined) {
      return;
    }

    store.getState().deleteMeasurement(target.id);
    expect(store.getState().project.measurements).toHaveLength(1);
    expect(store.getState().project.measurements[0]?.kind).toBe('height');

    store.getState().undo();
    expect(store.getState().project.measurements).toHaveLength(2);
  });

  it('ignores deleting an unknown id without recording history', () => {
    const store = createEditorStore(emptyProject());
    store.getState().deleteMeasurement('missing');
    expect(store.getState().canUndo).toBe(false);
  });

  it('clears all measurements in a single undo step', () => {
    const store = createEditorStore(emptyProject());
    store.getState().addMeasurement('distance', [[0, 0, 0], [1, 0, 0]]);
    store.getState().addMeasurement('area', [[0, 0, 0], [4, 0, 6]]);

    store.getState().clearMeasurements();
    expect(store.getState().project.measurements).toHaveLength(0);
    expect(store.getState().canRedo).toBe(false);

    store.getState().undo();
    expect(store.getState().project.measurements).toHaveLength(2);

    store.getState().redo();
    expect(store.getState().project.measurements).toHaveLength(0);
  });

  it('does not record a clear when there is nothing to clear', () => {
    const store = createEditorStore(emptyProject());
    store.getState().clearMeasurements();
    expect(store.getState().canUndo).toBe(false);
  });

  it('exposes pure command factories that clone their input', () => {
    const measurement = measurementFromPoints('width', [[0, 0, 0], [5, 0, 0]], () => 'm1');
    const add = createAddMeasurementCommand(measurement);
    const remove = createDeleteMeasurementCommand('m1');
    const clear = createClearMeasurementsCommand();
    expect(add.type).toBe('measurement.add');
    expect(remove.type).toBe('measurement.delete');
    expect(clear.type).toBe('measurement.clear');

    const project = emptyProject();
    project.measurements.push(measurement);
    const removeDraft = structuredClone(project);
    remove.apply(removeDraft);
    expect(removeDraft.measurements).toHaveLength(0);
    const clearDraft = structuredClone(project);
    clear.apply(clearDraft);
    expect(clearDraft.measurements).toHaveLength(0);
  });
});
