import { describe, expect, it } from 'vitest';
import { WALL_PIVOT_OFFSET, planPiece } from '@/domain';
import type { PieceDefinition, PlacedPiece } from '@/domain';
import { computeDesignWarnings } from '@/editor';
import { DATASET } from '@/data';

const DEFINITIONS = DATASET.definitionById;

function def(id: string): PieceDefinition {
  const definition = DEFINITIONS.get(id);
  if (definition === undefined) {
    throw new Error(`Missing test definition "${id}"`);
  }
  return definition;
}

function piece(
  definition: PieceDefinition,
  id: string,
  position: [number, number, number],
  yaw = 0,
): PlacedPiece {
  return planPiece(definition, {
    id,
    position,
    rotation: [0, yaw, 0],
    floorId: 'floor-1',
  });
}

const FLOOR = def('floor.birch');
const PILLAR = def('pillar.birch');
const WALL = def('wall.birch');
const ROOF = def('roof.birch');

function codes(pieces: readonly PlacedPiece[]): string[] {
  return computeDesignWarnings(pieces, DEFINITIONS).map((warning) => warning.code);
}

describe('computeDesignWarnings', () => {
  it('detects a floating (unsupported) piece', () => {
    const floating = piece(PILLAR, 'floating', [50, 8, 50]);
    const warnings = computeDesignWarnings([floating], DEFINITIONS);
    const match = warnings.find((warning) => warning.code === 'floating');
    expect(match).toBeDefined();
    expect(match?.severity).toBe('error');
    expect(match?.pieceIds).toContain('floating');
  });

  it('detects an unattached piece on the ground', () => {
    const lone = piece(FLOOR, 'lone', [0, 0, 0]);
    const warnings = computeDesignWarnings([lone], DEFINITIONS);
    const match = warnings.find((warning) => warning.code === 'unattached');
    expect(match).toBeDefined();
    expect(match?.pieceIds).toEqual(['lone']);
  });

  it('detects a wall without pillars', () => {
    const floor = piece(FLOOR, 'floor', [0, 0, 0]);
    const wall = piece(WALL, 'wall', [0, WALL_PIVOT_OFFSET, 3]);
    const warnings = computeDesignWarnings([floor, wall], DEFINITIONS);
    const match = warnings.find((warning) => warning.code === 'wall-missing-pillars');
    expect(match).toBeDefined();
    expect(match?.pieceIds).toEqual(['wall']);
  });

  it('yields no warnings for a well-formed house', () => {
    const pieces: PlacedPiece[] = [
      piece(FLOOR, 'floor', [0, 0, 0]),
      piece(PILLAR, 'p-pp', [3, WALL_PIVOT_OFFSET, 3]),
      piece(PILLAR, 'p-np', [-3, WALL_PIVOT_OFFSET, 3]),
      piece(PILLAR, 'p-pn', [3, WALL_PIVOT_OFFSET, -3]),
      piece(PILLAR, 'p-nn', [-3, WALL_PIVOT_OFFSET, -3]),
      piece(WALL, 'w-pz', [0, WALL_PIVOT_OFFSET, 3], 0),
      piece(WALL, 'w-nz', [0, WALL_PIVOT_OFFSET, -3], Math.PI),
      piece(WALL, 'w-px', [3, WALL_PIVOT_OFFSET, 0], (3 * Math.PI) / 2),
      piece(WALL, 'w-nx', [-3, WALL_PIVOT_OFFSET, 0], Math.PI / 2),
      piece(ROOF, 'roof', [0, WALL_PIVOT_OFFSET * 2, 0], 0),
    ];
    expect(computeDesignWarnings(pieces, DEFINITIONS)).toEqual([]);
    expect(codes(pieces)).toEqual([]);
  });

  it('orders warnings deterministically', () => {
    const lone = piece(FLOOR, 'lone', [0, 0, 0]);
    const first = JSON.stringify(computeDesignWarnings([lone], DEFINITIONS));
    const second = JSON.stringify(computeDesignWarnings([lone], DEFINITIONS));
    expect(first).toBe(second);
  });
});
