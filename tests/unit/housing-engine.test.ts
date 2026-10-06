import { describe, expect, it } from 'vitest';
import {
  EDGE_LENGTH,
  HALF_EDGE_LENGTH,
  RAMPART_PIVOT_OFFSET,
  WALL_PIVOT_OFFSET,
  PieceDefinitionSchema,
  buildHousingGraph,
  clampPlacementToRange,
  findEmptyFloorSlot,
  findFloatingPieces,
  findVertex,
  isGrounded,
  planPiece,
  resolveConstruct,
  rotationStep,
  serializeHousingGraph,
  snapFloorPlacementToEdge,
  snapPlacementToSlot,
  unlinkPiece,
  validateFloorPlacement,
  validatePillarPlacement,
  validatePlacement,
  validateRoofPlacement,
  validateWallPlacement,
  type PieceDefinition,
  type PlacedPiece,
} from '@/domain';

const FLOOR_DEF: PieceDefinition = PieceDefinitionSchema.parse({
  id: 'floor_wood',
  name: 'Wood Floor',
  category: 'floor',
  dimensions: { width: EDGE_LENGTH, height: 0.5, depth: EDGE_LENGTH },
  model: { assetId: 'floor_wood_asset' },
  resourceRecipe: 'floor_wood_recipe',
});

const WALL_DEF: PieceDefinition = PieceDefinitionSchema.parse({
  id: 'wall_wood',
  name: 'Wood Wall',
  category: 'wall',
  dimensions: { width: EDGE_LENGTH, height: 4.25, depth: 0.5 },
  model: { assetId: 'wall_wood_asset' },
  resourceRecipe: 'wall_wood_recipe',
});

const RAMPART_DEF: PieceDefinition = PieceDefinitionSchema.parse({
  id: 'rampart_wood',
  name: 'Wood Rampart',
  category: 'railing',
  dimensions: { width: EDGE_LENGTH, height: 1.8, depth: 0.5 },
  model: { assetId: 'rampart_wood_asset' },
  resourceRecipe: 'rampart_wood_recipe',
});

const PILLAR_DEF: PieceDefinition = PieceDefinitionSchema.parse({
  id: 'pillar_wood',
  name: 'Wood Pillar',
  category: 'pillar',
  dimensions: { width: 0.5, height: 4.25, depth: 0.5 },
  model: { assetId: 'pillar_wood_asset' },
  resourceRecipe: 'pillar_wood_recipe',
});

const POST_DEF: PieceDefinition = PieceDefinitionSchema.parse({
  id: 'post_wood',
  name: 'Wood Post',
  category: 'post',
  dimensions: { width: 0.5, height: 1.8, depth: 0.5 },
  model: { assetId: 'post_wood_asset' },
  resourceRecipe: 'post_wood_recipe',
});

const ROOF_DEF: PieceDefinition = PieceDefinitionSchema.parse({
  id: 'roof_wood',
  name: 'Wood Roof',
  category: 'roof',
  dimensions: { width: EDGE_LENGTH, height: 0.5, depth: EDGE_LENGTH },
  model: { assetId: 'roof_wood_asset' },
  resourceRecipe: 'roof_wood_recipe',
});

const RAMP_DEF: PieceDefinition = PieceDefinitionSchema.parse({
  id: 'ramp_wood',
  name: 'Wood Ramp',
  category: 'ramp',
  dimensions: { width: EDGE_LENGTH, height: 4.25, depth: EDGE_LENGTH },
  model: { assetId: 'ramp_wood_asset' },
  resourceRecipe: 'ramp_wood_recipe',
});

const TRIANGLE_FLOOR_DEF: PieceDefinition = PieceDefinitionSchema.parse({
  id: 'floor_tri',
  name: 'Triangle Floor',
  category: 'floor',
  dimensions: { width: EDGE_LENGTH, height: 0.5, depth: EDGE_LENGTH },
  model: { assetId: 'floor_tri_asset' },
  resourceRecipe: 'floor_tri_recipe',
});

const DEFINITIONS = new Map<string, PieceDefinition>([
  [FLOOR_DEF.id, FLOOR_DEF],
  [WALL_DEF.id, WALL_DEF],
  [RAMPART_DEF.id, RAMPART_DEF],
  [PILLAR_DEF.id, PILLAR_DEF],
  [POST_DEF.id, POST_DEF],
  [ROOF_DEF.id, ROOF_DEF],
  [RAMP_DEF.id, RAMP_DEF],
  [TRIANGLE_FLOOR_DEF.id, TRIANGLE_FLOOR_DEF],
]);

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

const FLOOR = makePiece(FLOOR_DEF, 'floor', [0, 0, 0]);

function graphOf(pieces: readonly PlacedPiece[]) {
  return buildHousingGraph(pieces, DEFINITIONS);
}

describe('resolveConstruct / rotationStep', () => {
  it('maps piece categories onto EConstruct values', () => {
    expect(resolveConstruct(FLOOR_DEF)).toBe('FLOOR');
    expect(resolveConstruct(WALL_DEF)).toBe('WALL');
    expect(resolveConstruct(RAMPART_DEF)).toBe('RAMPART');
    expect(resolveConstruct(PILLAR_DEF)).toBe('PILLAR');
    expect(resolveConstruct(POST_DEF)).toBe('POST');
    expect(resolveConstruct(ROOF_DEF)).toBe('ROOF');
    expect(resolveConstruct(RAMP_DEF)).toBe('ROOF');
    expect(resolveConstruct(TRIANGLE_FLOOR_DEF)).toBe('FLOOR_POLY');
  });

  it('honours an explicit construct override', () => {
    const definition = PieceDefinitionSchema.parse({
      id: 'custom',
      name: 'Custom',
      category: 'decorative',
      dimensions: { width: 1, height: 1, depth: 1 },
      model: { assetId: 'custom_asset' },
      resourceRecipe: 'custom_recipe',
      construct: 'RAMPART',
    });
    expect(resolveConstruct(definition)).toBe('RAMPART');
  });

  it('returns the documented rotation steps (radians)', () => {
    expect(rotationStep('FLOOR')).toBeCloseTo(Math.PI / 2);
    expect(rotationStep('ROOF')).toBeCloseTo(Math.PI / 2);
    expect(rotationStep('WALL')).toBeCloseTo(Math.PI);
    expect(rotationStep('RAMPART')).toBeCloseTo(Math.PI);
    expect(rotationStep('PILLAR')).toBeCloseTo(Math.PI / 6);
    expect(rotationStep('FLOOR_POLY')).toBe(0);
  });
});

describe('floor placement', () => {
  it('succeeds for a square floor resting on the ground', () => {
    const result = validateFloorPlacement(graphOf([]), FLOOR_DEF, [0, 0, 0], 0, {
      definitions: DEFINITIONS,
      pieces: [],
    });
    expect(result.result).toBe('Success');
    expect(result.position).toEqual([0, 0, 0]);
  });

  it('reports MissingGround when too high with no edge to snap to', () => {
    const result = validateFloorPlacement(graphOf([]), FLOOR_DEF, [0, 20, 0], 0, {
      definitions: DEFINITIONS,
      pieces: [],
    });
    expect(result.result).toBe('MissingGround');
  });

  it('dispatches through validatePlacement', () => {
    const result = validatePlacement(FLOOR_DEF, [0, 0, 0], 0, [], DEFINITIONS);
    expect(result.result).toBe('Success');
  });
});

describe('pillar placement', () => {
  it('succeeds on a floor corner vertex', () => {
    const result = validatePillarPlacement(graphOf([FLOOR]), PILLAR_DEF, [HALF_EDGE_LENGTH, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH], {
      definitions: DEFINITIONS,
      pieces: [FLOOR],
    });
    expect(result.result).toBe('Success');
    expect(result.position).toEqual([HALF_EDGE_LENGTH, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
  });

  it('reports MissingSlot when placed in mid-air', () => {
    const result = validatePillarPlacement(graphOf([FLOOR]), PILLAR_DEF, [50, WALL_PIVOT_OFFSET, 50], {
      definitions: DEFINITIONS,
      pieces: [FLOOR],
    });
    expect(result.result).toBe('MissingSlot');
  });

  it('reports Obstructed when the vertex already has a pillar', () => {
    const pillar = makePiece(PILLAR_DEF, 'pillar-1', [HALF_EDGE_LENGTH, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
    const result = validatePillarPlacement(
      graphOf([FLOOR, pillar]),
      PILLAR_DEF,
      [HALF_EDGE_LENGTH, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH],
      { definitions: DEFINITIONS, pieces: [FLOOR, pillar] },
    );
    expect(result.result).toBe('Obstructed');
  });
});

describe('wall placement', () => {
  const cornerA = makePiece(PILLAR_DEF, 'pillar-a', [HALF_EDGE_LENGTH, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
  const cornerB = makePiece(PILLAR_DEF, 'pillar-b', [-HALF_EDGE_LENGTH, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);

  it('succeeds between two full-height pillars', () => {
    const result = validateWallPlacement(
      graphOf([FLOOR, cornerA, cornerB]),
      WALL_DEF,
      [0, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH],
      { definitions: DEFINITIONS, pieces: [FLOOR, cornerA, cornerB], isFullWall: true },
    );
    expect(result.result).toBe('Success');
  });

  it('reports MissingPillar with no pillars', () => {
    const result = validateWallPlacement(
      graphOf([FLOOR]),
      WALL_DEF,
      [0, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH],
      { definitions: DEFINITIONS, pieces: [FLOOR], isFullWall: true },
    );
    expect(result.result).toBe('MissingPillar');
  });

  it('reports MissingPillar when one end only has a POST', () => {
    const post = makePiece(POST_DEF, 'post-a', [-HALF_EDGE_LENGTH, RAMPART_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
    const pieces = [FLOOR, cornerA, post];
    const result = validateWallPlacement(
      graphOf(pieces),
      WALL_DEF,
      [0, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH],
      { definitions: DEFINITIONS, pieces, isFullWall: true },
    );
    expect(result.result).toBe('MissingPillar');
  });

  it('accepts a RAMPART between two POSTs', () => {
    const postA = makePiece(POST_DEF, 'post-a', [HALF_EDGE_LENGTH, RAMPART_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
    const postB = makePiece(POST_DEF, 'post-b', [-HALF_EDGE_LENGTH, RAMPART_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
    const pieces = [FLOOR, postA, postB];
    const result = validateWallPlacement(
      graphOf(pieces),
      RAMPART_DEF,
      [0, RAMPART_PIVOT_OFFSET, HALF_EDGE_LENGTH],
      { definitions: DEFINITIONS, pieces, isFullWall: false },
    );
    expect(result.result).toBe('Success');
  });
});

describe('roof placement', () => {
  const cornerA = makePiece(PILLAR_DEF, 'pillar-a', [HALF_EDGE_LENGTH, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
  const cornerB = makePiece(PILLAR_DEF, 'pillar-b', [-HALF_EDGE_LENGTH, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
  const wall = makePiece(WALL_DEF, 'wall', [0, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);

  it('succeeds on the edge above a full-height wall', () => {
    const pieces = [FLOOR, cornerA, cornerB, wall];
    const result = validateRoofPlacement(
      graphOf(pieces),
      ROOF_DEF,
      [0, 4.25, EDGE_LENGTH],
      0,
      { definitions: DEFINITIONS, pieces },
    );
    expect(result.result).toBe('Success');
  });

  it('reports MissingSlot when no edge can attach a roof', () => {
    const result = validateRoofPlacement(graphOf([]), ROOF_DEF, [0, 0, 0], 0, {
      definitions: DEFINITIONS,
      pieces: [],
    });
    expect(result.result).toBe('MissingSlot');
  });
});

describe('slot search and snapping', () => {
  it('finds the neighbour floor slot transform and snaps exactly', () => {
    const graph = graphOf([FLOOR]);
    const slot = findEmptyFloorSlot(graph, [0, 0, 4], [0, 0, 1], false);
    expect(slot).not.toBeNull();
    expect(slot?.position).toEqual([0, 0, EDGE_LENGTH]);
    expect(slot?.rotation).toBeCloseTo(Math.PI);

    const snapped = snapPlacementToSlot(false, [0.005, 0, EDGE_LENGTH + 0.005], slot);
    expect(snapped).toEqual([0, 0, EDGE_LENGTH]);

    const edgeSnap = snapFloorPlacementToEdge(graph, [0.01, 0, EDGE_LENGTH], false);
    expect(edgeSnap).toEqual([0, 0, EDGE_LENGTH]);
  });

  it('does not snap when outside the link tolerance', () => {
    const graph = graphOf([FLOOR]);
    expect(snapFloorPlacementToEdge(graph, [1, 0, EDGE_LENGTH], false)).toBeNull();
  });

  it('clamps placement to the maximum range', () => {
    const clamped = clampPlacementToRange([0, 0, 0], [40, 0, 0], 16);
    expect(clamped[0]).toBeCloseTo(16);
    expect(clamped[1]).toBe(0);
    expect(clamped[2]).toBe(0);
  });
});

describe('graph build / unlink', () => {
  const a = makePiece(FLOOR_DEF, 'floor-a', [0, 0, 0]);
  const b = makePiece(FLOOR_DEF, 'floor-b', [EDGE_LENGTH, 0, 0]);
  const c = makePiece(FLOOR_DEF, 'floor-c', [0, 0, EDGE_LENGTH]);
  const d = makePiece(FLOOR_DEF, 'floor-d', [EDGE_LENGTH, 0, EDGE_LENGTH]);

  it('shares vertices and edges between adjacent floors', () => {
    const graph = graphOf([a, b, c, d]);
    const sharedVertex = findVertex(graph, [HALF_EDGE_LENGTH, 0, HALF_EDGE_LENGTH]);
    expect(sharedVertex?.floors.length).toBe(4);
    const sharedEdge = [...graph.edges.values()].find(
      (edge) => Math.abs(edge.position[0] - HALF_EDGE_LENGTH) < 1e-6 && Math.abs(edge.position[2]) < 1e-6,
    );
    expect(sharedEdge).toBeDefined();
    expect(sharedEdge?.forwardFloors.length).toBeGreaterThan(0);
    expect(sharedEdge?.backwardFloors.length).toBeGreaterThan(0);
  });

  it('prunes empty nodes on unlink without corrupting neighbours', () => {
    const graph = graphOf([a, b, c, d]);
    unlinkPiece(graph, a.id);
    expect(findVertex(graph, [-HALF_EDGE_LENGTH, 0, -HALF_EDGE_LENGTH])).toBeNull();
    const sharedVertex = findVertex(graph, [HALF_EDGE_LENGTH, 0, HALF_EDGE_LENGTH]);
    expect(sharedVertex).not.toBeNull();
    const sharedEdge = [...graph.edges.values()].find(
      (edge) => Math.abs(edge.position[0] - HALF_EDGE_LENGTH) < 1e-6 && Math.abs(edge.position[2]) < 1e-6,
    );
    expect(sharedEdge).toBeDefined();
    expect(sharedEdge?.forwardFloors.concat(sharedEdge?.backwardFloors ?? [])).not.toContain(a.id);
  });

  it('serializes deterministically for identical inputs', () => {
    const first = serializeHousingGraph(graphOf([a, b, c, d]));
    const second = serializeHousingGraph(graphOf([a, b, c, d]));
    expect(first).toBe(second);
  });
});

describe('grounded / floating', () => {
  const cornerA = makePiece(PILLAR_DEF, 'pillar-a', [HALF_EDGE_LENGTH, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
  const cornerB = makePiece(PILLAR_DEF, 'pillar-b', [-HALF_EDGE_LENGTH, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
  const wall = makePiece(WALL_DEF, 'wall', [0, WALL_PIVOT_OFFSET, HALF_EDGE_LENGTH]);
  const roof = makePiece(ROOF_DEF, 'roof', [0, 4.25, EDGE_LENGTH]);

  it('treats a floor, pillar and wall as grounded', () => {
    const pieces = [FLOOR, cornerA, cornerB, wall];
    expect(findFloatingPieces(pieces, DEFINITIONS)).toEqual([]);
    expect(isGrounded(FLOOR, graphOf(pieces), DEFINITIONS)).toBe(true);
  });

  it('treats a roof placed via an edge on pillars as grounded', () => {
    const pieces = [FLOOR, cornerA, cornerB, wall, roof];
    expect(findFloatingPieces(pieces, DEFINITIONS)).toEqual([]);
  });

  it('treats an isolated pillar at height as floating', () => {
    const floating = makePiece(PILLAR_DEF, 'floating-pillar', [50, 4 + WALL_PIVOT_OFFSET, 50]);
    expect(findFloatingPieces([floating], DEFINITIONS)).toEqual([floating.id]);
  });
});
