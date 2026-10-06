import type { PieceDefinition } from '../piece-definition';
import type { PlacedPiece } from '../placed-piece';
import { type Vec3Tuple } from '../primitives';
import {
  HALF_EDGE_LENGTH,
  RAMPART_PIVOT_OFFSET,
  TRIANGLE_APEX_PIVOT_OFFSET,
  TRIANGLE_INNER_RADIUS,
  WALL_HEIGHT,
  WALL_PIVOT_OFFSET,
  resolveConstruct,
} from './construct';
import {
  buildHousingGraph,
  findEdge,
  findVertex,
  hasFullHeightPillar,
  modelPoint,
  type HousingEdge,
  type HousingGraph,
  type HousingVertex,
} from './housingGraph';
import { snapFloorPlacementToEdge } from './slots';
import { GROUND_Y, boxForPiece, boxesOverlap } from './support';
import { add, horizontalDistance, sub, type Vec3Like } from './vec';

/** Placement outcome codes, matching `EHousingPlacementResult`. */
export type EHousingPlacementResult =
  | 'Success'
  | 'MissingSlot'
  | 'Obstructed'
  | 'MissingPillar'
  | 'MissingGround'
  | 'ObstructedByGround';

export interface PlacementValidation {
  result: EHousingPlacementResult;
  position: Vec3Tuple;
  yaw: number;
}

export interface ValidateOptions {
  definitions?: ReadonlyMap<string, PieceDefinition>;
  pieces?: readonly PlacedPiece[];
  /** Downward ray length used to require ground under a floor. Default 10. */
  terrainTestHeight?: number;
  /** Walls/ramparts require pillars at both endpoints. Default true. */
  requiresPillars?: boolean;
  /** `true` for WALL, `false` for RAMPART. */
  isFullWall?: boolean;
}

const SQUARE_CORNERS: readonly Vec3Tuple[] = [
  [HALF_EDGE_LENGTH, HALF_EDGE_LENGTH, 0],
  [-HALF_EDGE_LENGTH, HALF_EDGE_LENGTH, 0],
  [HALF_EDGE_LENGTH, -HALF_EDGE_LENGTH, 0],
  [-HALF_EDGE_LENGTH, -HALF_EDGE_LENGTH, 0],
];

const TRIANGLE_CORNERS: readonly Vec3Tuple[] = [
  [HALF_EDGE_LENGTH, HALF_EDGE_LENGTH, 0],
  [-HALF_EDGE_LENGTH, HALF_EDGE_LENGTH, 0],
  [0, -TRIANGLE_APEX_PIVOT_OFFSET, 0],
];

const SQUARE_EDGE_LOCALS: readonly Vec3Tuple[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
];

function piecePosition(
  piecesById: ReadonlyMap<string, PlacedPiece> | undefined,
  id: string,
): Vec3Tuple | null {
  const piece = piecesById?.get(id);
  return piece === undefined ? null : piece.position;
}

function addAll(target: Set<string>, values: readonly string[]): void {
  for (const value of values) {
    target.add(value);
  }
}

function ignoreVertexExpectations(
  ignored: Set<string>,
  graph: HousingGraph,
  vertex: HousingVertex,
): void {
  addAll(ignored, vertex.pillars);
  addAll(ignored, vertex.floors);
  for (const edgeId of vertex.edges) {
    const edge = graph.edges.get(edgeId);
    if (edge !== undefined) {
      addAll(ignored, edge.walls);
    }
  }
}

function ignoreVertexAttachments(
  ignored: Set<string>,
  _graph: HousingGraph,
  vertex: HousingVertex,
): void {
  addAll(ignored, vertex.pillars);
  addAll(ignored, vertex.floors);
}

/**
 * Collect the pieces that are *expected* to overlap a floor/roof candidate:
 * pillars/walls at its corners and floors far enough away to be neighbours.
 * Mirrors the game's `IgnoreVertex*` helpers.
 */
function collectFloorRoofIgnore(
  graph: HousingGraph,
  piecesById: ReadonlyMap<string, PlacedPiece> | undefined,
  position: Vec3Like,
  yaw: number,
  isRoof: boolean,
  isTriangle: boolean,
): Set<string> {
  const ignored = new Set<string>();
  const corners = isTriangle ? TRIANGLE_CORNERS : SQUARE_CORNERS;
  const half = isTriangle ? TRIANGLE_INNER_RADIUS : HALF_EDGE_LENGTH;
  const threshold = half + half * 0.95;

  for (const corner of corners) {
    const world = modelPoint(corner, position, yaw);
    const vertex = findVertex(graph, world);
    if (vertex !== null) {
      ignoreVertexExpectations(ignored, graph, vertex);
      for (const floorId of vertex.floors) {
        const floorPosition = piecePosition(piecesById, floorId);
        if (floorPosition !== null && horizontalDistance(floorPosition, position) > threshold) {
          ignored.add(floorId);
        }
      }
    }

    const above = findVertex(graph, add(world, [0, WALL_HEIGHT, 0]));
    if (above !== null) {
      // Low-hanging roofs like ramps/stairs may collide.
      addAll(ignored, above.floors);
    }

    if (isRoof) {
      const below = findVertex(graph, sub(world, [0, WALL_HEIGHT, 0]));
      if (below !== null) {
        ignoreVertexExpectations(ignored, graph, below);
      }
    }
  }

  const edges = isTriangle
    ? [modelPoint([0, HALF_EDGE_LENGTH, 0], position, yaw)]
    : SQUARE_EDGE_LOCALS.map((local) => modelPoint(local, position, yaw));
  for (const world of edges) {
    const edge = findEdge(graph, world);
    if (edge !== null) {
      addAll(ignored, edge.walls);
      addAll(ignored, edge.forwardFloors);
      addAll(ignored, edge.backwardFloors);
    }
  }

  return ignored;
}

function collectWallIgnore(
  graph: HousingGraph,
  vertex0: HousingVertex | null,
  vertex1: HousingVertex | null,
): Set<string> {
  const ignored = new Set<string>();
  for (const vertex of [vertex0, vertex1]) {
    if (vertex === null) {
      continue;
    }
    ignoreVertexExpectations(ignored, graph, vertex);
    const above = findVertex(graph, add(vertex.position, [0, WALL_HEIGHT, 0]));
    if (above !== null) {
      ignoreVertexExpectations(ignored, graph, above);
    }
    const below = findVertex(graph, sub(vertex.position, [0, WALL_HEIGHT, 0]));
    if (below !== null) {
      ignoreVertexAttachments(ignored, graph, below);
      for (const edgeId of below.edges) {
        const edge = graph.edges.get(edgeId);
        if (edge !== undefined) {
          addAll(ignored, edge.walls);
        }
      }
    }
  }
  return ignored;
}

function collectPillarIgnore(graph: HousingGraph, vertex: HousingVertex | null): Set<string> {
  const ignored = new Set<string>();
  if (vertex === null) {
    return ignored;
  }
  ignoreVertexExpectations(ignored, graph, vertex);
  const above = findVertex(graph, add(vertex.position, [0, WALL_HEIGHT, 0]));
  if (above !== null) {
    ignoreVertexExpectations(ignored, graph, above);
  }
  const below = findVertex(graph, sub(vertex.position, [0, WALL_HEIGHT, 0]));
  if (below !== null) {
    ignoreVertexAttachments(ignored, graph, below);
    for (const edgeId of below.edges) {
      const edge = graph.edges.get(edgeId);
      if (edge !== undefined) {
        addAll(ignored, edge.walls);
      }
    }
  }
  return ignored;
}

function isObstructed(
  pieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
  definition: PieceDefinition,
  position: Vec3Like,
  yaw: number,
  ignored: ReadonlySet<string>,
): boolean {
  const candidate = boxForPiece({ position: [position[0], position[1], position[2]], rotation: [0, yaw, 0] }, definition);
  for (const piece of pieces) {
    if (ignored.has(piece.id)) {
      continue;
    }
    const pieceDefinition = definitions.get(piece.definitionId);
    if (pieceDefinition === undefined) {
      continue;
    }
    if (boxesOverlap(candidate, boxForPiece(piece, pieceDefinition))) {
      return true;
    }
  }
  return false;
}

/**
 * Validate a square/triangular floor placement.
 *
 * The position is first snapped onto an adjacent edge slot when possible;
 * otherwise the base must sit within `terrainTestHeight` above the flat ground
 * plane. APPROXIMATION: ground is a flat plane, not a terrain raycast.
 */
export function validateFloorPlacement(
  graph: HousingGraph,
  definition: PieceDefinition,
  position: Vec3Like,
  yaw: number,
  opts: ValidateOptions = {},
): PlacementValidation {
  const terrainTestHeight = opts.terrainTestHeight ?? 10;
  const construct = resolveConstruct(definition);
  const isTriangle = construct === 'FLOOR_POLY';
  const snapped = snapFloorPlacementToEdge(graph, position, false);
  const finalPosition: Vec3Tuple = snapped ?? [position[0], position[1], position[2]];

  if (snapped === null) {
    const base = finalPosition[1];
    if (base < GROUND_Y || base > terrainTestHeight) {
      return { result: 'MissingGround', position: finalPosition, yaw };
    }
  }

  const definitions = opts.definitions;
  if (definitions !== undefined) {
    const piecesById = new Map((opts.pieces ?? []).map((piece) => [piece.id, piece] as const));
    const ignored = collectFloorRoofIgnore(
      graph,
      piecesById,
      finalPosition,
      yaw,
      false,
      isTriangle,
    );
    const obstructed = isObstructed(
      opts.pieces ?? [],
      definitions,
      definition,
      finalPosition,
      yaw,
      ignored,
    );
    if (obstructed) {
      return { result: 'Obstructed', position: finalPosition, yaw };
    }
  }

  return { result: 'Success', position: finalPosition, yaw };
}

/** Validate a pillar/post placement. */
export function validatePillarPlacement(
  graph: HousingGraph,
  definition: PieceDefinition,
  position: Vec3Like,
  opts: ValidateOptions = {},
): PlacementValidation {
  const construct = resolveConstruct(definition);
  const pivotOffset = construct === 'POST' ? RAMPART_PIVOT_OFFSET : WALL_PIVOT_OFFSET;
  const base = sub(position, [0, pivotOffset, 0]);
  const fallbackYaw = 0;

  let vertex = findVertex(graph, base);
  if (vertex === null) {
    const upper = findVertex(graph, add(base, [0, WALL_HEIGHT, 0]));
    if (upper === null) {
      return { result: 'MissingSlot', position: [position[0], position[1], position[2]], yaw: fallbackYaw };
    }
    vertex = findVertex(graph, sub(upper.position, [0, WALL_HEIGHT, 0]));
  } else if (vertex.pillars.length > 0) {
    return { result: 'Obstructed', position: [position[0], position[1], position[2]], yaw: fallbackYaw };
  }

  const vertexPosition = vertex?.position ?? base;
  const finalPosition: Vec3Tuple = add(vertexPosition, [0, pivotOffset, 0]);
  const top = add(vertexPosition, [0, pivotOffset * 2, 0]);
  if (top[1] < GROUND_Y) {
    return { result: 'ObstructedByGround', position: finalPosition, yaw: fallbackYaw };
  }

  const definitions = opts.definitions;
  if (definitions !== undefined) {
    const ignored = collectPillarIgnore(graph, vertex);
    if (
      isObstructed(opts.pieces ?? [], definitions, definition, finalPosition, fallbackYaw, ignored)
    ) {
      return { result: 'Obstructed', position: finalPosition, yaw: fallbackYaw };
    }
  }

  return { result: 'Success', position: finalPosition, yaw: fallbackYaw };
}

/**
 * Validate a wall/rampart placement.
 *
 * Looks for the edge one pivot offset below the pending position, falling back
 * to the bottom of an existing wall one `WALL_HEIGHT` above. Requires both end
 * vertices to hold pillars (full-height for a WALL; any post for a RAMPART).
 */
export function validateWallPlacement(
  graph: HousingGraph,
  definition: PieceDefinition,
  position: Vec3Like,
  opts: ValidateOptions = {},
): PlacementValidation {
  const construct = resolveConstruct(definition);
  const isFullWall = opts.isFullWall ?? construct === 'WALL';
  const pivotOffset = isFullWall ? WALL_PIVOT_OFFSET : RAMPART_PIVOT_OFFSET;
  const requested: Vec3Tuple = [position[0], position[1], position[2]];

  let edgePosition = sub(position, [0, pivotOffset, 0]);
  let vertex0: HousingVertex | null;
  let vertex1: HousingVertex | null;
  let rotation = 0;

  const lowerEdge: HousingEdge | null = findEdge(graph, edgePosition);
  if (lowerEdge === null) {
    const upperEdge = findEdge(graph, add(edgePosition, [0, WALL_HEIGHT, 0]));
    if (upperEdge === null) {
      return { result: 'MissingSlot', position: requested, yaw: rotation };
    }
    if (upperEdge.vertex0Id === null || upperEdge.vertex1Id === null) {
      return { result: 'MissingPillar', position: requested, yaw: upperEdge.rotation };
    }
    const upper0 = graph.vertices.get(upperEdge.vertex0Id);
    const upper1 = graph.vertices.get(upperEdge.vertex1Id);
    if (upper0 === undefined || upper1 === undefined) {
      return { result: 'MissingPillar', position: requested, yaw: upperEdge.rotation };
    }
    edgePosition = sub(upperEdge.position, [0, WALL_HEIGHT, 0]);
    vertex0 = findVertex(graph, sub(upper0.position, [0, WALL_HEIGHT, 0]));
    vertex1 = findVertex(graph, sub(upper1.position, [0, WALL_HEIGHT, 0]));
    rotation = upperEdge.rotation;
  } else {
    if (lowerEdge.walls.length > 0) {
      return { result: 'Obstructed', position: requested, yaw: lowerEdge.rotation };
    }
    if (lowerEdge.vertex0Id === null || lowerEdge.vertex1Id === null) {
      return { result: 'MissingPillar', position: requested, yaw: lowerEdge.rotation };
    }
    vertex0 = graph.vertices.get(lowerEdge.vertex0Id) ?? null;
    vertex1 = graph.vertices.get(lowerEdge.vertex1Id) ?? null;
    if (vertex0 === null || vertex1 === null) {
      return { result: 'MissingPillar', position: requested, yaw: lowerEdge.rotation };
    }
    rotation = lowerEdge.rotation;
  }

  const finalPosition: Vec3Tuple = add(edgePosition, [0, pivotOffset, 0]);

  if (opts.requiresPillars ?? true) {
    if (
      vertex0 === null ||
      vertex1 === null ||
      vertex0.pillars.length === 0 ||
      vertex1.pillars.length === 0
    ) {
      return { result: 'MissingPillar', position: finalPosition, yaw: rotation };
    }
    if (isFullWall && (!hasFullHeightPillar(graph, vertex0) || !hasFullHeightPillar(graph, vertex1))) {
      return { result: 'MissingPillar', position: finalPosition, yaw: rotation };
    }
  }

  const topY = edgePosition[1] + pivotOffset * 2;
  if (topY < GROUND_Y) {
    return { result: 'ObstructedByGround', position: finalPosition, yaw: rotation };
  }

  const definitions = opts.definitions;
  if (definitions !== undefined) {
    const ignored = collectWallIgnore(graph, vertex0, vertex1);
    if (isObstructed(opts.pieces ?? [], definitions, definition, finalPosition, rotation, ignored)) {
      return { result: 'Obstructed', position: finalPosition, yaw: rotation };
    }
  }

  return { result: 'Success', position: finalPosition, yaw: rotation };
}

/** Validate a square or triangular roof placement (ramps/stairs included). */
export function validateRoofPlacement(
  graph: HousingGraph,
  definition: PieceDefinition,
  position: Vec3Like,
  yaw: number,
  opts: ValidateOptions = {},
): PlacementValidation {
  const construct = resolveConstruct(definition);
  const isTriangle = construct === 'ROOF_POLY';
  const snapped = snapFloorPlacementToEdge(graph, position, true);
  if (snapped === null) {
    return { result: 'MissingSlot', position: [position[0], position[1], position[2]], yaw };
  }

  const definitions = opts.definitions;
  if (definitions !== undefined) {
    const piecesById = new Map((opts.pieces ?? []).map((piece) => [piece.id, piece] as const));
    const ignored = collectFloorRoofIgnore(graph, piecesById, snapped, yaw, true, isTriangle);
    if (isObstructed(opts.pieces ?? [], definitions, definition, snapped, yaw, ignored)) {
      return { result: 'Obstructed', position: snapped, yaw };
    }
  }

  return { result: 'Success', position: snapped, yaw };
}

/**
 * Dispatch to the correct validator by resolving the definition's construct.
 * Ramps and stairs are treated as roofs, per the U3-SDK source.
 */
export function validatePlacement(
  definition: PieceDefinition,
  position: Vec3Like,
  yaw: number,
  placedPieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
  opts: ValidateOptions = {},
): PlacementValidation {
  const graph = buildHousingGraph(placedPieces, definitions);
  const context: ValidateOptions = {
    definitions,
    pieces: placedPieces,
    ...opts,
  };
  const construct = resolveConstruct(definition);
  switch (construct) {
    case 'FLOOR':
    case 'FLOOR_POLY':
      return validateFloorPlacement(graph, definition, position, yaw, context);
    case 'WALL':
      return validateWallPlacement(graph, definition, position, {
        ...context,
        isFullWall: true,
      });
    case 'RAMPART':
      return validateWallPlacement(graph, definition, position, {
        ...context,
        isFullWall: false,
      });
    case 'ROOF':
    case 'ROOF_POLY':
      return validateRoofPlacement(graph, definition, position, yaw, context);
    case 'PILLAR':
    case 'POST':
      return validatePillarPlacement(graph, definition, position, context);
    default: {
      const exhaustive: never = construct;
      return exhaustive;
    }
  }
}
