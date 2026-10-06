import { describe, expect, it } from 'vitest';
import { planPiece } from '@/domain';
import type { PlacedPiece } from '@/domain';
import { instantiatePrefab, prefabFromPieces } from '@/editor';
import { makeDefinition } from './domain-fixtures';

const def = makeDefinition();

function piece(id: string, x: number, y: number, z: number): PlacedPiece {
  return planPiece(def, { id, position: [x, y, z], floorId: 'floor-a' });
}

function counterFactory(prefix: string): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}-${next}`;
  };
}

describe('prefabFromPieces', () => {
  it('stores the minimum corner as origin and relative positions, ordered by id', () => {
    const a = piece('a', 5, 1, 1);
    const b = piece('b', 2, 0, 3);

    const prefab = prefabFromPieces([a, b], 'Group', () => 'prefab-1', '2024-01-01T00:00:00.000Z');

    expect(prefab.origin).toEqual([2, 0, 1]);
    expect(prefab.pieces.map((entry) => entry.position)).toEqual([
      [3, 1, 0],
      [0, 0, 2],
    ]);
    expect(prefab.pieces[0]?.definitionId).toBe('wall_wood');
  });

  it('does not alias piece metadata (deep clone)', () => {
    const source = planPiece(def, {
      id: 'a',
      position: [0, 0, 0],
      floorId: 'floor-a',
      metadata: { tags: ['keep'], note: 'hi' },
    });

    const prefab = prefabFromPieces([source], 'Group', () => 'prefab-1');

    prefab.pieces[0]?.metadata.tags.push('mutated');
    expect(source.metadata.tags).toEqual(['keep']);
  });

  it('is deterministic for a fixed id factory and timestamp', () => {
    const pieces = [piece('b', 1, 0, 0), piece('a', 0, 0, 0)];

    const first = prefabFromPieces(pieces, 'Group', () => 'prefab-1', '2024-01-01T00:00:00.000Z');
    const second = prefabFromPieces(
      [...pieces].reverse(),
      'Group',
      () => 'prefab-1',
      '2024-01-01T00:00:00.000Z',
    );

    expect(first).toEqual(second);
  });

  it('returns an empty prefab at the origin for an empty selection', () => {
    const prefab = prefabFromPieces([], 'Empty', () => 'prefab-1');
    expect(prefab.pieces).toEqual([]);
    expect(prefab.origin).toEqual([0, 0, 0]);
  });
});

describe('instantiatePrefab', () => {
  it('mints fresh unique ids, absolute positions, target floor and null zone', () => {
    const prefab = prefabFromPieces(
      [piece('a', 5, 1, 1), piece('b', 2, 0, 3)],
      'Group',
      () => 'prefab-1',
    );

    const instantiated = instantiatePrefab(prefab, [10, 0, 20], 'floor-b', counterFactory('p'));

    expect(instantiated.map((entry) => entry.id)).toEqual(['p-1', 'p-2']);
    expect(instantiated.map((entry) => entry.position)).toEqual([
      [13, 1, 20],
      [10, 0, 22],
    ]);
    expect(instantiated.every((entry) => entry.floorId === 'floor-b')).toBe(true);
    expect(instantiated.every((entry) => entry.zoneId === null)).toBe(true);
  });

  it('copies build state and metadata from the prefab', () => {
    const source = planPiece(def, {
      id: 'a',
      position: [0, 0, 0],
      floorId: 'floor-a',
      buildState: 'built',
      metadata: { tags: ['tag'], note: 'note' },
    });
    const prefab = prefabFromPieces([source], 'Group', () => 'prefab-1');

    const [instantiated] = instantiatePrefab(prefab, [0, 0, 0], 'floor-b', () => 'p-1');

    expect(instantiated?.buildState).toBe('built');
    expect(instantiated?.metadata).toEqual({ tags: ['tag'], note: 'note' });
  });

  it('instantiates the same prefab twice into independent sets', () => {
    const prefab = prefabFromPieces([piece('a', 1, 0, 2)], 'Group', () => 'prefab-1');

    const first = instantiatePrefab(prefab, [0, 0, 0], 'floor-a', () => 'p-1');
    const second = instantiatePrefab(prefab, [100, 0, 100], 'floor-a', () => 'p-2');

    first[0]!.position[0] = 999;
    first[0]!.metadata.tags.push('mutated');

    expect(second[0]!.position[0]).toBe(100);
    expect(second[0]!.metadata.tags).toEqual([]);
    expect(prefab.pieces[0]!.position[0]).toBe(0);
    expect(prefab.pieces[0]!.metadata.tags).toEqual([]);
  });
});
