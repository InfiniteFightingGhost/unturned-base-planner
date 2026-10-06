import { describe, expect, it } from 'vitest';
import {
  EDGE_LENGTH,
  HALF_EDGE_LENGTH,
  RAMPART_PIVOT_OFFSET,
  WALL_PIVOT_OFFSET,
  planPiece,
} from '@/domain';
import type { PieceDefinition, PlacedPiece, SurfaceHit, Vec3 } from '@/domain';
import { resolveBarricadePlacement, resolveStructurePlacement } from '@/editor';
import { DATASET } from '@/data';

const DEFINITIONS = DATASET.definitionById;

function def(id: string): PieceDefinition {
  const definition = DEFINITIONS.get(id);
  if (definition === undefined) {
    throw new Error(`Missing test definition "${id}"`);
  }
  return definition;
}

function makePiece(
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
const POST = def('post.birch');
const WALL = def('wall.birch');
const RAMPART = def('rampart.birch');
const ROOF = def('roof.birch');
const DOORWAY = def('doorway.birch');
const DOOR = def('door.wood.birch');

const VIEW_FORWARD: Vec3 = [0, 0, 1];

describe('resolveStructurePlacement - floors', () => {
  it('resolves the first square floor on the ground', () => {
    const result = resolveStructurePlacement(FLOOR, [0, 0, 0], VIEW_FORWARD, [], DEFINITIONS);
    expect(result.result).toBe('Success');
    expect(result.valid).toBe(true);
    expect(result.position).toEqual([0, 0, 0]);
  });

  it('snaps a second floor exactly to the neighbouring edge slot', () => {
    const first = makePiece(FLOOR, 'floor-a', [0, 0, 0]);
    const result = resolveStructurePlacement(
      FLOOR,
      [0, 0, 4],
      VIEW_FORWARD,
      [first],
      DEFINITIONS,
    );
    expect(result.result).toBe('Success');
    expect(result.position[0]).toBeCloseTo(0, 6);
    expect(result.position[1]).toBeCloseTo(0, 6);
    expect(result.position[2]).toBeCloseTo(EDGE_LENGTH, 6);
  });

  it('reports MissingGround for a floor floating away from any edge', () => {
    const result = resolveStructurePlacement(FLOOR, [50, 20, 50], VIEW_FORWARD, [], DEFINITIONS);
    expect(result.result).toBe('MissingGround');
    expect(result.valid).toBe(false);
  });
});

describe('resolveStructurePlacement - pillars', () => {
  it('snaps a pillar aimed at a floor corner exactly to the vertex', () => {
    const floor = makePiece(FLOOR, 'floor-a', [0, 0, 0]);
    const result = resolveStructurePlacement(
      PILLAR,
      [HALF_EDGE_LENGTH, 0, HALF_EDGE_LENGTH],
      VIEW_FORWARD,
      [floor],
      DEFINITIONS,
    );
    expect(result.result).toBe('Success');
    expect(result.position).toEqual([HALF_EDGE_LENGTH, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
  });

  it('reports MissingSlot when there is no vertex', () => {
    const floor = makePiece(FLOOR, 'floor-a', [0, 0, 0]);
    const result = resolveStructurePlacement(PILLAR, [50, 0, 50], VIEW_FORWARD, [floor], DEFINITIONS);
    expect(result.result).toBe('MissingSlot');
    expect(result.valid).toBe(false);
  });
});

describe('resolveStructurePlacement - walls', () => {
  it('succeeds between two full-height pillars', () => {
    const floor = makePiece(FLOOR, 'floor-a', [0, 0, 0]);
    const pillarA = makePiece(PILLAR, 'pillar-a', [HALF_EDGE_LENGTH, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
    const pillarB = makePiece(PILLAR, 'pillar-b', [-HALF_EDGE_LENGTH, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
    const result = resolveStructurePlacement(
      WALL,
      [0, 0, HALF_EDGE_LENGTH],
      VIEW_FORWARD,
      [floor, pillarA, pillarB],
      DEFINITIONS,
    );
    expect(result.result).toBe('Success');
    expect(result.position).toEqual([0, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
  });

  it('reports MissingPillar with no pillars', () => {
    const floor = makePiece(FLOOR, 'floor-a', [0, 0, 0]);
    const result = resolveStructurePlacement(
      WALL,
      [0, 0, HALF_EDGE_LENGTH],
      VIEW_FORWARD,
      [floor],
      DEFINITIONS,
    );
    expect(result.result).toBe('MissingPillar');
    expect(result.valid).toBe(false);
  });

  it('succeeds for a rampart between two posts', () => {
    const floor = makePiece(FLOOR, 'floor-a', [0, 0, 0]);
    const postA = makePiece(POST, 'post-a', [HALF_EDGE_LENGTH, RAMPART_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
    const postB = makePiece(POST, 'post-b', [-HALF_EDGE_LENGTH, RAMPART_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
    const result = resolveStructurePlacement(
      RAMPART,
      [0, 0, HALF_EDGE_LENGTH],
      VIEW_FORWARD,
      [floor, postA, postB],
      DEFINITIONS,
    );
    expect(result.result).toBe('Success');
    expect(result.position).toEqual([0, RAMPART_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
  });
});

describe('resolveStructurePlacement - roofs', () => {
  it('succeeds on an attachable edge above a wall', () => {
    const floor = makePiece(FLOOR, 'floor-a', [0, 0, 0]);
    const pillarA = makePiece(PILLAR, 'pillar-a', [HALF_EDGE_LENGTH, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
    const pillarB = makePiece(PILLAR, 'pillar-b', [-HALF_EDGE_LENGTH, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
    const wall = makePiece(WALL, 'wall-a', [0, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
    const result = resolveStructurePlacement(
      ROOF,
      [0, WALL_PIVOT_OFFSET * 2, 5],
      VIEW_FORWARD,
      [floor, pillarA, pillarB, wall],
      DEFINITIONS,
    );
    expect(result.result).toBe('Success');
    expect(result.position[1]).toBeCloseTo(WALL_PIVOT_OFFSET * 2, 6);
    expect(result.position[2]).toBeCloseTo(EDGE_LENGTH, 6);
  });

  it('reports MissingSlot without an attachable edge', () => {
    const result = resolveStructurePlacement(ROOF, [0, 0, 0], VIEW_FORWARD, [], DEFINITIONS);
    expect(result.result).toBe('MissingSlot');
    expect(result.valid).toBe(false);
  });
});

describe('resolveBarricadePlacement', () => {
  it('resolves a door into a doorway slot', () => {
    const doorway = makePiece(DOORWAY, 'doorway-a', [0, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
    const hit: SurfaceHit = {
      point: [0, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH],
      normal: [0, 0, 1],
      kind: 'wall',
      sourcePieceId: doorway.id,
      sourceYaw: 0,
    };
    const result = resolveBarricadePlacement(DOOR, hit, 0, [doorway], DEFINITIONS);
    expect(result.result).toBe('Success');
    expect(result.valid).toBe(true);
  });

  it('reports InvalidDoor without a doorway', () => {
    const hit: SurfaceHit = {
      point: [0, 0, 0],
      normal: [0, 1, 0],
      kind: 'ground',
    };
    const result = resolveBarricadePlacement(DOOR, hit, 0, [], DEFINITIONS);
    expect(result.result).toBe('InvalidDoor');
    expect(result.valid).toBe(false);
  });
});

describe('determinism', () => {
  it('yields identical results for identical inputs', () => {
    const floor = makePiece(FLOOR, 'floor-a', [0, 0, 0]);
    const pillarA = makePiece(PILLAR, 'pillar-a', [HALF_EDGE_LENGTH, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
    const args = [WALL, [0, 0, HALF_EDGE_LENGTH] as Vec3, VIEW_FORWARD, [floor, pillarA]] as const;
    const first = resolveStructurePlacement(...args, DEFINITIONS);
    const second = resolveStructurePlacement(...args, DEFINITIONS);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
