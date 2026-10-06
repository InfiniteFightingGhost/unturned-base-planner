import { describe, expect, it } from 'vitest';
import { vec3 } from '@/domain';
import type { PlacedPiece, Vec3 } from '@/domain';
import {
  arrayPieces,
  gridArrayPieces,
  mirrorPieces,
  radialArrayPieces,
} from '@/editor';
import { makeDefinition } from './domain-fixtures';

const def = makeDefinition();
const FLOOR = 'floor-1';

function pieceAt(
  id: string,
  position: [number, number, number],
  yaw = 0,
): PlacedPiece {
  return {
    id,
    definitionId: def.id,
    position,
    rotation: vec3(0, yaw, 0),
    scale: vec3(1, 1, 1),
    floorId: FLOOR,
    zoneId: null,
    buildState: 'planned',
    metadata: { tags: [] },
  };
}

function assertUniqueIds(pieces: readonly PlacedPiece[]): void {
  expect(new Set(pieces.map((piece) => piece.id)).size).toBe(pieces.length);
}

function distanceFromCenter(piece: PlacedPiece, center: Vec3): number {
  return Math.hypot(piece.position[0] - center[0], piece.position[2] - center[2]);
}

describe('arrayPieces', () => {
  it('produces count copies at i*spacing with unique ids and originals excluded', () => {
    const selection = [pieceAt('a', [1, 0, 1]), pieceAt('b', [2, 0, 3], 1)];
    const result = arrayPieces(selection, 3, 2, vec3(1, 0, 0));

    expect(result).toHaveLength(6);
    expect(result.map((piece) => piece.position)).toEqual([
      [3, 0, 1],
      [4, 0, 3],
      [5, 0, 1],
      [6, 0, 3],
      [7, 0, 1],
      [8, 0, 3],
    ]);
    assertUniqueIds(result);
    for (const copy of result) {
      expect(['a', 'b']).not.toContain(copy.id);
    }
  });

  it('is deterministic and treats non-positive counts as empty', () => {
    const selection = [pieceAt('a', [1, 0, 1])];
    const first = arrayPieces(selection, 2, 4, vec3(0, 0, 1));
    const second = arrayPieces(selection, 2, 4, vec3(0, 0, 1));
    expect(first.map((piece) => piece.position)).toEqual(second.map((piece) => piece.position));
    expect(arrayPieces(selection, 0, 1, vec3(1, 0, 0))).toEqual([]);
  });

  it('returns [] for an empty selection', () => {
    expect(arrayPieces([], 5, 1, vec3(1, 0, 0))).toEqual([]);
  });
});

describe('gridArrayPieces', () => {
  it('excludes the original cell and offsets columns by X, rows by Z', () => {
    const result = gridArrayPieces([pieceAt('a', [1, 0, 1])], 2, 3, 2, 5);
    expect(result).toHaveLength(5);
    expect(result.map((piece) => piece.position)).toEqual([
      [3, 0, 1],
      [5, 0, 1],
      [1, 0, 6],
      [3, 0, 6],
      [5, 0, 6],
    ]);
    assertUniqueIds(result);
  });

  it('is deterministic and handles degenerate dimensions', () => {
    const first = gridArrayPieces([pieceAt('a', [0, 0, 0])], 2, 2, 1, 1);
    const second = gridArrayPieces([pieceAt('a', [0, 0, 0])], 2, 2, 1, 1);
    expect(first.map((piece) => piece.position)).toEqual(second.map((piece) => piece.position));
    expect(first).toHaveLength(3);
    expect(gridArrayPieces([pieceAt('a', [0, 0, 0])], 0, 3, 1, 1)).toEqual([]);
    expect(gridArrayPieces([pieceAt('a', [0, 0, 0])], 1, 1, 1, 1)).toEqual([]);
  });

  it('returns [] for an empty selection', () => {
    expect(gridArrayPieces([], 2, 2, 1, 1)).toEqual([]);
  });
});

describe('radialArrayPieces', () => {
  it('places a full turn on the circle at the expected radius and rotates copies', () => {
    const center = vec3(0, 0, 0);
    const result = radialArrayPieces([pieceAt('a', [3, 0, 0])], 4, 3, Math.PI * 2, center);

    expect(result).toHaveLength(4);
    assertUniqueIds(result);
    for (const copy of result) {
      expect(distanceFromCenter(copy, center)).toBeCloseTo(3, 6);
    }
    expect(result.map((piece) => piece.position)).toEqual([
      [3, 0, 0],
      [0, 0, 3],
      [-3, 0, 0],
      [0, 0, -3],
    ]);
    const fullTurnYaws = result.map((piece) => piece.rotation[1]);
    expect(fullTurnYaws).toHaveLength(4);
    expect(fullTurnYaws[0]).toBeCloseTo(0, 6);
    expect(fullTurnYaws[1]).toBeCloseTo(Math.PI / 2, 6);
    expect(fullTurnYaws[2]).toBeCloseTo(Math.PI, 6);
    expect(fullTurnYaws[3]).toBeCloseTo((3 * Math.PI) / 2, 6);
  });

  it('does not duplicate the start point on a partial arc', () => {
    const center = vec3(0, 0, 0);
    const result = radialArrayPieces([pieceAt('a', [3, 0, 0])], 2, 3, Math.PI, center);

    expect(result).toHaveLength(2);
    for (const copy of result) {
      expect(distanceFromCenter(copy, center)).toBeCloseTo(3, 6);
      expect(copy.position).not.toEqual([3, 0, 0]);
    }
    expect(result.map((piece) => piece.position)).toEqual([
      [0, 0, 3],
      [-3, 0, 0],
    ]);
    const partialYaws = result.map((piece) => piece.rotation[1]);
    expect(partialYaws).toHaveLength(2);
    expect(partialYaws[0]).toBeCloseTo(Math.PI / 2, 6);
    expect(partialYaws[1]).toBeCloseTo(Math.PI, 6);
  });

  it('is deterministic, honors the center and returns [] for an empty selection', () => {
    const center = vec3(10, 0, 0);
    const first = radialArrayPieces([pieceAt('a', [13, 0, 0])], 3, 4, Math.PI * 2, center);
    const second = radialArrayPieces([pieceAt('a', [13, 0, 0])], 3, 4, Math.PI * 2, center);
    expect(first.map((piece) => piece.position)).toEqual(second.map((piece) => piece.position));
    for (const copy of first) {
      expect(distanceFromCenter(copy, center)).toBeCloseTo(4, 6);
    }
    expect(radialArrayPieces([], 3, 4, Math.PI * 2, center)).toEqual([]);
  });
});

describe('mirrorPieces', () => {
  it('mirrors position and rotation on axis x with a non-zero offset', () => {
    const result = mirrorPieces([pieceAt('a', [3, 1, 2], Math.PI / 2)], 'x', 10);
    expect(result).toHaveLength(1);
    expect(result[0]?.position).toEqual([17, 1, 2]);
    expect(result[0]?.rotation[1]).toBeCloseTo((3 * Math.PI) / 2, 6);
    expect(result[0]?.id).not.toBe('a');
    assertUniqueIds(result);
  });

  it('mirrors position and rotation on axis z with a non-zero offset', () => {
    const result = mirrorPieces([pieceAt('a', [0, 1, 4])], 'z', 1);
    expect(result[0]?.position).toEqual([0, 1, -2]);
    expect(result[0]?.rotation[1]).toBeCloseTo(Math.PI, 6);
    expect(result[0]?.id).not.toBe('a');
  });

  it('does not mutate the source, is deterministic and returns [] for an empty selection', () => {
    const source = pieceAt('a', [3, 1, 2], Math.PI / 2);
    const first = mirrorPieces([source], 'x', 0);
    const second = mirrorPieces([source], 'x', 0);
    expect(first.map((piece) => piece.position)).toEqual(second.map((piece) => piece.position));
    expect(source.position).toEqual([3, 1, 2]);
    expect(source.rotation[1]).toBe(Math.PI / 2);
    expect(mirrorPieces([], 'z', 0)).toEqual([]);
  });
});
