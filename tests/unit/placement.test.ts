import { describe, expect, it } from 'vitest';
import { createEmptyProject, planPiece } from '@/domain';
import type { PlacedPiece } from '@/domain';
import { DEFAULT_GRID_CONFIG } from '@/engine';
import type { GridConfig } from '@/engine';
import {
  createEditorStore,
  placementIsNoop,
  resolvePlacement,
  snapPlacementPosition,
  wouldCreateDuplicateId,
} from '@/editor';
import { makeDefinition } from './domain-fixtures';

const def = makeDefinition();
const FLOOR = 'floor-1';

function grid(overrides: Partial<GridConfig> = {}): GridConfig {
  return { ...DEFAULT_GRID_CONFIG, ...overrides };
}

describe('resolvePlacement', () => {
  it('yields a planned piece referencing the definition and floor', () => {
    const piece = resolvePlacement(def, [1, 0, 2], Math.PI / 2, FLOOR);
    expect(piece.definitionId).toBe(def.id);
    expect(piece.floorId).toBe(FLOOR);
    expect(piece.zoneId).toBeNull();
    expect(piece.buildState).toBe('planned');
    expect(piece.position).toEqual([1, 0, 2]);
    expect(piece.rotation[1]).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('snapPlacementPosition', () => {
  it('snaps to the configured step and precision when enabled', () => {
    expect(snapPlacementPosition([1.26, 2.7, -3.2], grid())).toEqual([1, 3, -3]);
  });

  it('returns the position unchanged when snapping is disabled', () => {
    expect(snapPlacementPosition([1.26, 2.7, -3.2], grid({ snapEnabled: false }))).toEqual([
      1.26, 2.7, -3.2,
    ]);
  });

  it('honors a non-default step and precision', () => {
    const config = grid({ snapStep: 0.25, precision: 3 });
    expect(snapPlacementPosition([1.26, 2.7, -3.2], config)).toEqual([1.25, 2.75, -3.25]);
  });

  it('rounds to the configured precision', () => {
    const config = grid({ snapStep: 0.25, precision: 0 });
    expect(snapPlacementPosition([1.26, 2.7, -3.2], config)).toEqual([1, 3, -3]);
  });

  it('ignores a non-positive step', () => {
    expect(snapPlacementPosition([1.26, 2.7, -3.2], grid({ snapStep: 0 }))).toEqual([1.26, 2.7, -3.2]);
  });
});

describe('placement guards', () => {
  const existing: PlacedPiece = planPiece(def, { id: 'a', position: [1, 0, 0], floorId: FLOOR });

  it('detects a no-op candidate regardless of id', () => {
    const candidate = { ...existing, id: 'b' };
    expect(placementIsNoop(existing, candidate)).toBe(true);
  });

  it('treats a moved candidate as a real change', () => {
    const candidate = { ...existing, position: [2, 0, 0] as [number, number, number] };
    expect(placementIsNoop(existing, candidate)).toBe(false);
  });

  it('detects duplicate ids', () => {
    expect(wouldCreateDuplicateId([existing], { ...existing })).toBe(true);
    expect(wouldCreateDuplicateId([existing], { ...existing, id: 'c' })).toBe(false);
  });
});

describe('placement does not mutate the store', () => {
  it('leaves the store project reference unchanged through a canceled preview', () => {
    const project = createEmptyProject('Test', { id: 'p1', now: '2024-01-01T00:00:00.000Z' });
    const store = createEditorStore(project);
    const before = store.getState().project;
    const selectionBefore = store.getState().selection;

    // Preview + snap + discard (no commit command issued).
    resolvePlacement(def, [1.26, 2.7, -3.2], 0, FLOOR);
    snapPlacementPosition([1.26, 2.7, -3.2], grid());

    expect(store.getState().project).toBe(before);
    expect(store.getState().selection).toBe(selectionBefore);
    expect(store.getState().canUndo).toBe(false);
  });
});
