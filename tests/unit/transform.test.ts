import { describe, expect, it } from 'vitest';
import { vec3 } from '@/domain';
import type { PlacedPiece } from '@/domain';
import {
  approxEqualVec3,
  duplicatePieces,
  gridArray,
  linearArray,
  mirrorPiece,
  rotatePieceY,
  translatePiece,
} from '@/editor';
import { makeDefinition } from './domain-fixtures';

const def = makeDefinition();
const FLOOR = 'floor-1';

function pieceAt(position: [number, number, number], yaw = 0): PlacedPiece {
  return {
    id: 'piece-base',
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

describe('translatePiece', () => {
  it('adds the delta component-wise', () => {
    const result = translatePiece(pieceAt([1, 2, 3]), vec3(0.5, -0.5, 2));
    expect(result.position).toEqual([1.5, 1.5, 5]);
  });

  it('does not mutate the source piece', () => {
    const source = pieceAt([1, 2, 3]);
    translatePiece(source, vec3(9, 9, 9));
    expect(source.position).toEqual([1, 2, 3]);
  });
});

describe('rotatePieceY', () => {
  it('rotates position around the origin by 90 degrees (three.js convention)', () => {
    const result = rotatePieceY(pieceAt([1, 0, 0]), Math.PI / 2);
    expect(approxEqualVec3(result.position, vec3(0, 0, -1))).toBe(true);
    expect(result.rotation[1]).toBeCloseTo(Math.PI / 2, 6);
  });

  it('rotates position around a pivot and leaves height untouched', () => {
    const result = rotatePieceY(pieceAt([2, 5, 0]), Math.PI / 2, vec3(1, 0, 0));
    expect(approxEqualVec3(result.position, vec3(1, 5, -1))).toBe(true);
  });

  it('adds to the existing yaw and normalizes into [0, 2pi)', () => {
    const result = rotatePieceY(pieceAt([0, 0, 0], Math.PI * 1.5), Math.PI);
    expect(result.rotation[1]).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('mirrorPiece', () => {
  it("axis x: x -> 2*offset - x and rotation.y -> normalize(-yaw)", () => {
    const result = mirrorPiece(pieceAt([3, 1, 2], 0), 'x', 0);
    expect(result.position).toEqual([-3, 1, 2]);
    expect(result.rotation[1]).toBeCloseTo(0, 6);
  });

  it('axis x at 90deg yields 270deg (reflected facing)', () => {
    const result = mirrorPiece(pieceAt([3, 0, 0], Math.PI / 2), 'x', 0);
    expect(result.position[0]).toBeCloseTo(-3, 6);
    expect(result.rotation[1]).toBeCloseTo((3 * Math.PI) / 2, 6);
  });

  it('axis x at 180deg stays 180deg', () => {
    const result = mirrorPiece(pieceAt([3, 0, 0], Math.PI), 'x', 0);
    expect(result.rotation[1]).toBeCloseTo(Math.PI, 6);
  });

  it('axis x honors the plane offset', () => {
    const result = mirrorPiece(pieceAt([3, 0, 0], 0), 'x', 10);
    expect(result.position[0]).toBeCloseTo(17, 6);
  });

  it('axis z: z -> 2*offset - z and rotation.y -> normalize(pi - yaw)', () => {
    const result = mirrorPiece(pieceAt([1, 1, 4], 0), 'z', 0);
    expect(result.position).toEqual([1, 1, -4]);
    expect(result.rotation[1]).toBeCloseTo(Math.PI, 6);
  });

  it('axis z at 90deg stays 90deg', () => {
    const result = mirrorPiece(pieceAt([0, 0, 4], Math.PI / 2), 'z', 0);
    expect(result.rotation[1]).toBeCloseTo(Math.PI / 2, 6);
  });

  it('axis z at 270deg stays 270deg', () => {
    const result = mirrorPiece(pieceAt([0, 0, 4], (3 * Math.PI) / 2), 'z', 0);
    expect(result.rotation[1]).toBeCloseTo((3 * Math.PI) / 2, 6);
  });

  it('axis z honors the plane offset', () => {
    const result = mirrorPiece(pieceAt([0, 0, 4], 0), 'z', 1);
    expect(result.position[2]).toBeCloseTo(-2, 6);
  });

  it('never mutates the source piece', () => {
    const source = pieceAt([3, 1, 2], Math.PI / 2);
    mirrorPiece(source, 'x');
    expect(source.position).toEqual([3, 1, 2]);
    expect(source.rotation[1]).toBe(Math.PI / 2);
  });
});

describe('duplicatePieces', () => {
  it('assigns fresh unique ids and preserves relative transforms', () => {
    const originals = [pieceAt([0, 0, 0], 1), pieceAt([2, 0, 5], 2)];
    const copies = duplicatePieces(originals, vec3(10, 0, -1));

    const ids = copies.map((piece) => piece.id);
    expect(new Set(ids).size).toBe(copies.length);
    for (const id of ids) {
      expect(originals.some((piece) => piece.id === id)).toBe(false);
    }

    expect(copies[0]?.position).toEqual([10, 0, -1]);
    expect(copies[1]?.position).toEqual([12, 0, 4]);
    expect(approxEqualVec3(copies[0]?.rotation ?? [0, 0, 0], originals[0]?.rotation ?? [0, 0, 0])).toBe(
      true,
    );
    expect(approxEqualVec3(copies[1]?.rotation ?? [0, 0, 0], originals[1]?.rotation ?? [0, 0, 0])).toBe(
      true,
    );
  });

  it('accepts an injected id factory for deterministic tests', () => {
    let counter = 0;
    const copies = duplicatePieces([pieceAt([0, 0, 0])], vec3(0, 0, 0), () => {
      counter += 1;
      return `copy-${counter}`;
    });
    expect(copies.map((piece) => piece.id)).toEqual(['copy-1']);
  });
});

describe('linearArray', () => {
  it('produces a deterministic, evenly spaced line with unique ids', () => {
    const result = linearArray(pieceAt([1, 0, 1]), 4, 2, vec3(1, 0, 0));
    expect(result.map((piece) => piece.position)).toEqual([
      [1, 0, 1],
      [3, 0, 1],
      [5, 0, 1],
      [7, 0, 1],
    ]);
    expect(new Set(result.map((piece) => piece.id)).size).toBe(4);
  });

  it('treats non-positive counts as empty and floors fractional counts', () => {
    expect(linearArray(pieceAt([0, 0, 0]), 0, 1, vec3(1, 0, 0))).toEqual([]);
    expect(linearArray(pieceAt([0, 0, 0]), 2.9, 1, vec3(1, 0, 0))).toHaveLength(2);
  });
});

describe('gridArray', () => {
  it('produces a row-major rows x cols grid with unique ids', () => {
    const result = gridArray(pieceAt([0, 0, 0]), 2, 3, 1, 10);
    expect(result).toHaveLength(6);
    expect(result.map((piece) => piece.position)).toEqual([
      [0, 0, 0],
      [0, 0, 10],
      [0, 0, 20],
      [1, 0, 0],
      [1, 0, 10],
      [1, 0, 20],
    ]);
    expect(new Set(result.map((piece) => piece.id)).size).toBe(6);
  });

  it('is deterministic in geometry across calls', () => {
    const first = gridArray(pieceAt([2, 0, 3]), 2, 2, 4, 5);
    const second = gridArray(pieceAt([2, 0, 3]), 2, 2, 4, 5);
    expect(first.map((piece) => piece.position)).toEqual(second.map((piece) => piece.position));
  });
});
