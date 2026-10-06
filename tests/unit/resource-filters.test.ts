import { describe, expect, it } from 'vitest';
import { DATASET } from '@/data';
import { planPiece } from '@/domain';
import type { BuildState, PlacedPiece } from '@/domain';
import {
  computeConstructionProgress,
  computeInventoryBalance,
  computeRawRequirements,
  computeRemainingMaterials,
  filterPiecesByBuildState,
  filterPiecesByFloor,
  filterPiecesByZone,
  filterUnbuiltPieces,
} from '@/resources';

interface PieceOptions {
  floorId?: string;
  zoneId?: string | null;
  buildState?: BuildState;
}

function makePiece(index: number, overrides: PieceOptions = {}): PlacedPiece {
  const definition = DATASET.definitionById.get('wall.birch');
  if (definition === undefined) {
    throw new Error('Test fixture missing definition "wall.birch"');
  }
  return planPiece(definition, {
    id: `piece-${index}`,
    position: [index, 0, 0],
    floorId: overrides.floorId ?? 'floor.a',
    zoneId: overrides.zoneId ?? null,
    buildState: overrides.buildState ?? 'planned',
  });
}

describe('piece filters (P30)', () => {
  const pieces: PlacedPiece[] = [
    makePiece(0, { floorId: 'floor.a', zoneId: 'zone.x' }),
    makePiece(1, { floorId: 'floor.a', zoneId: 'zone.y' }),
    makePiece(2, { floorId: 'floor.b', zoneId: null }),
    makePiece(3, { floorId: 'floor.b', zoneId: 'zone.x' }),
  ];

  it('filters by floor preserving document order', () => {
    expect(filterPiecesByFloor(pieces, 'floor.a').map((p) => p.id)).toEqual([
      'piece-0',
      'piece-1',
    ]);
    expect(filterPiecesByFloor(pieces, 'floor.missing')).toEqual([]);
  });

  it('filters by zone, with null selecting unassigned pieces', () => {
    expect(filterPiecesByZone(pieces, 'zone.x').map((p) => p.id)).toEqual([
      'piece-0',
      'piece-3',
    ]);
    expect(filterPiecesByZone(pieces, null).map((p) => p.id)).toEqual(['piece-2']);
  });

  it('filters by one or more build states', () => {
    const mixed = [makePiece(0, { buildState: 'planned' }), makePiece(1, { buildState: 'built' })];
    expect(filterPiecesByBuildState(mixed, ['built']).map((p) => p.id)).toEqual(['piece-1']);
    expect(filterPiecesByBuildState(mixed, ['built', 'planned'])).toHaveLength(2);
    expect(filterPiecesByBuildState(mixed, [])).toEqual([]);
  });

  it('treats collected and planned as unbuilt', () => {
    const mixed = [
      makePiece(0, { buildState: 'planned' }),
      makePiece(1, { buildState: 'collected' }),
      makePiece(2, { buildState: 'built' }),
    ];
    expect(filterUnbuiltPieces(mixed).map((p) => p.id)).toEqual(['piece-0', 'piece-1']);
  });
});

describe('computeConstructionProgress (P34)', () => {
  it('returns all-zero progress for empty input', () => {
    expect(computeConstructionProgress([])).toEqual({
      total: 0,
      built: 0,
      collected: 0,
      planned: 0,
      remaining: 0,
      percentComplete: 0,
    });
  });

  it('reports 100% when every piece is built', () => {
    const pieces = [makePiece(0, { buildState: 'built' }), makePiece(1, { buildState: 'built' })];
    expect(computeConstructionProgress(pieces)).toEqual({
      total: 2,
      built: 2,
      collected: 0,
      planned: 0,
      remaining: 0,
      percentComplete: 100,
    });
  });

  it('counts mixed states and rounds the percentage to one decimal', () => {
    const pieces = [
      makePiece(0, { buildState: 'built' }),
      makePiece(1, { buildState: 'planned' }),
      makePiece(2, { buildState: 'planned' }),
    ];
    expect(computeConstructionProgress(pieces)).toEqual({
      total: 3,
      built: 1,
      collected: 0,
      planned: 2,
      remaining: 2,
      percentComplete: 33.3,
    });
  });
});

describe('computeRemainingMaterials (P31)', () => {
  it('excludes built pieces and equals the raw requirements of the unbuilt subset', () => {
    const pieces = [
      makePiece(0, { buildState: 'planned' }),
      makePiece(1, { buildState: 'built' }),
      makePiece(2, { buildState: 'collected' }),
    ];
    const unbuilt = filterUnbuiltPieces(pieces);

    expect(computeRemainingMaterials(pieces, DATASET.definitionById, DATASET.graph)).toEqual([
      { resourceId: 'log.birch', amount: 6 },
    ]);
    expect(computeRemainingMaterials(pieces, DATASET.definitionById, DATASET.graph)).toEqual(
      computeRawRequirements(unbuilt, DATASET.definitionById, DATASET.graph),
    );
  });

  it('returns an empty list when every piece is built', () => {
    const pieces = [makePiece(0, { buildState: 'built' })];
    expect(computeRemainingMaterials(pieces, DATASET.definitionById, DATASET.graph)).toEqual([]);
  });
});

describe('computeInventoryBalance (P35)', () => {
  const pieces = [makePiece(0, { buildState: 'planned' }), makePiece(1, { buildState: 'planned' })];

  it('clamps remaining at zero and reports surplus for excess inventory', () => {
    const balance = computeInventoryBalance(pieces, DATASET.definitionById, DATASET.graph, [
      { resourceId: 'log.birch', amount: 6 },
    ]);

    expect(balance).toEqual([
      { resourceId: 'log.birch', required: 6, owned: 6, remaining: 0, surplus: 0 },
    ]);
  });

  it('reports a shortage when inventory is insufficient', () => {
    const balance = computeInventoryBalance(pieces, DATASET.definitionById, DATASET.graph, [
      { resourceId: 'log.birch', amount: 4 },
    ]);

    expect(balance).toEqual([
      { resourceId: 'log.birch', required: 6, owned: 4, remaining: 2, surplus: 0 },
    ]);
  });

  it('includes owned resources that are not required, sorted by resource id', () => {
    const balance = computeInventoryBalance(pieces, DATASET.definitionById, DATASET.graph, [
      { resourceId: 'log.birch', amount: 8 },
      { resourceId: 'cloth', amount: 3 },
    ]);

    expect(balance).toEqual([
      { resourceId: 'cloth', required: 0, owned: 3, remaining: 0, surplus: 3 },
      { resourceId: 'log.birch', required: 6, owned: 8, remaining: 0, surplus: 2 },
    ]);
  });

  it('drops built pieces from the requirement', () => {
    const built = [makePiece(0, { buildState: 'built' }), makePiece(1, { buildState: 'built' })];
    const balance = computeInventoryBalance(built, DATASET.definitionById, DATASET.graph, [
      { resourceId: 'log.birch', amount: 2 },
    ]);

    expect(balance).toEqual([
      { resourceId: 'log.birch', required: 0, owned: 2, remaining: 0, surplus: 2 },
    ]);
  });
});
