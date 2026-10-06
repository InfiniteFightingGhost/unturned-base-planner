import { describe, expect, it } from 'vitest';
import { createEmptyProject, planPiece, ProjectSchema } from '@/domain';
import type { Floor, PlacedPiece, Project } from '@/domain';
import {
  floorById,
  ghostOpacityForFloor,
  isFloorLocked,
  nextFloorElevation,
  piecesOnFloor,
  sortedFloors,
  visibleFloors,
} from '@/editor';
import { makeDefinition } from './domain-fixtures';

const ISO = '2024-01-01T00:00:00.000Z';
const def = makeDefinition();

function makeFloor(id: string, index: number, overrides: Partial<Floor> = {}): Floor {
  return { id, name: id, index, elevation: 0, visible: true, locked: false, ...overrides };
}

function projectWith(floors: Floor[]): Project {
  const base = createEmptyProject('Test', { id: 'p1', now: ISO });
  return ProjectSchema.parse({ ...base, floors });
}

function pieceOn(floorId: string, id: string): PlacedPiece {
  return planPiece(def, { id, position: [0, 0, 0], floorId });
}

describe('floor helpers', () => {
  it('resolves a floor by id and returns undefined for unknown ids', () => {
    const ground = makeFloor('ground', 0);
    const upper = makeFloor('upper', 1);
    const project = projectWith([ground, upper]);

    expect(floorById(project, 'upper')).toEqual(upper);
    expect(floorById(project, 'missing')).toBeUndefined();
  });

  it('sorts floors by ascending index with a stable id tie-break', () => {
    const project = projectWith([
      makeFloor('c', 2),
      makeFloor('a', 0),
      makeFloor('b', 1),
    ]);

    expect(sortedFloors(project).map((floor) => floor.id)).toEqual(['a', 'b', 'c']);
  });

  it('filters pieces by floor id', () => {
    const project = projectWith([makeFloor('a', 0), makeFloor('b', 1)]);
    const withPieces: Project = {
      ...project,
      pieces: [pieceOn('a', 'pa'), pieceOn('b', 'pb'), pieceOn('a', 'pa2')],
    };

    expect(piecesOnFloor(withPieces, 'a').map((piece) => piece.id)).toEqual(['pa', 'pa2']);
    expect(piecesOnFloor(withPieces, 'b').map((piece) => piece.id)).toEqual(['pb']);
    expect(piecesOnFloor(withPieces, 'missing')).toEqual([]);
  });

  it('computes the next elevation above the highest floor by the default height', () => {
    const empty = projectWith([]);
    expect(nextFloorElevation(empty)).toBe(0);

    const stacked = projectWith([
      makeFloor('a', 0, { elevation: 0 }),
      makeFloor('b', 1, { elevation: 4.25 }),
      makeFloor('c', 2, { elevation: 2 }),
    ]);
    expect(nextFloorElevation(stacked)).toBe(4.25 + stacked.settings.defaultFloorHeight);
  });

  it('reports locked state only for known locked floors', () => {
    const project = projectWith([makeFloor('a', 0), makeFloor('b', 1, { locked: true })]);
    expect(isFloorLocked(project, 'a')).toBe(false);
    expect(isFloorLocked(project, 'b')).toBe(true);
    expect(isFloorLocked(project, 'missing')).toBe(false);
  });

  it('returns visible floors in display order', () => {
    const project = projectWith([
      makeFloor('c', 2, { visible: false }),
      makeFloor('a', 0),
      makeFloor('b', 1, { visible: true }),
    ]);
    expect(visibleFloors(project).map((floor) => floor.id)).toEqual(['a', 'b']);
  });
});

describe('ghostOpacityForFloor', () => {
  it('is fully opaque for the active floor', () => {
    expect(ghostOpacityForFloor(makeFloor('a', 0), 'a')).toBe(1);
  });

  it('is ghosted for a visible non-active floor', () => {
    expect(ghostOpacityForFloor(makeFloor('b', 1), 'a')).toBe(0.25);
  });

  it('is fully transparent for a hidden floor', () => {
    expect(ghostOpacityForFloor(makeFloor('c', 2, { visible: false }), 'a')).toBe(0);
  });
});
