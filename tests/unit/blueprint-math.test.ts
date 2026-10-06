import { describe, expect, it } from 'vitest';
import type { Floor, PieceDimensions, Vec3 } from '@/domain';
import { activeFloorPieces, boxEdgesFor } from '@/engine';
import { makeDefinition, makePiece } from './domain-fixtures';

const def = makeDefinition();
const dimensions: PieceDimensions = { width: 2, height: 4, depth: 6 };
const center: Vec3 = [0, 0, 0];

function extents(segments: ReturnType<typeof boxEdgesFor>): {
  min: Vec3;
  max: Vec3;
} {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const [from, to] of segments) {
    for (const point of [from, to]) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis]!, point[axis]!);
        max[axis] = Math.max(max[axis]!, point[axis]!);
      }
    }
  }
  return { min, max };
}

function floorsFixture(): Floor[] {
  return [
    { id: 'a', name: 'A', index: 0, elevation: 0, visible: true, locked: false },
    { id: 'b', name: 'B', index: 1, elevation: 3, visible: true, locked: false },
  ];
}

describe('blueprint math', () => {
  it('returns 12 box edges', () => {
    expect(boxEdgesFor(center, dimensions, 0)).toHaveLength(12);
  });

  it('matches the box extents for a rotation of 0', () => {
    const { min, max } = extents(boxEdgesFor(center, dimensions, 0));
    expect(min).toEqual([-1, -2, -3]);
    expect(max).toEqual([1, 2, 3]);
  });

  it('swaps the XZ footprint for a 90 degree rotation', () => {
    const { min, max } = extents(boxEdgesFor(center, dimensions, Math.PI / 2));
    expect(min[0]).toBeCloseTo(-3, 10);
    expect(max[0]).toBeCloseTo(3, 10);
    expect(min[2]).toBeCloseTo(-1, 10);
    expect(max[2]).toBeCloseTo(1, 10);
    expect(min[1]).toBe(-2);
    expect(max[1]).toBe(2);
  });

  it('offsets every edge by the provided center', () => {
    const { min, max } = extents(boxEdgesFor([10, 20, 30], dimensions, 0));
    expect(min).toEqual([9, 18, 27]);
    expect(max).toEqual([11, 22, 33]);
  });

  it('keeps only pieces on the active floor', () => {
    const floors = floorsFixture();
    const pieces = [
      makePiece(def, 'a', 'pa'),
      makePiece(def, 'b', 'pb'),
      makePiece(def, 'a', 'pc'),
    ];
    expect(activeFloorPieces(pieces, floors, 'a').map((piece) => piece.id)).toEqual(['pa', 'pc']);
    expect(activeFloorPieces(pieces, floors, 'b').map((piece) => piece.id)).toEqual(['pb']);
    expect(activeFloorPieces(pieces, floors, 'missing')).toEqual([]);
  });
});
