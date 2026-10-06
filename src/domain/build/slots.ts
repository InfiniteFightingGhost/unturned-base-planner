import { normalizeScalar, type Vec3Tuple } from '../primitives';
import {
  HALF_EDGE_LENGTH,
  HALF_WALL_HEIGHT,
  LINK_TOLERANCE,
  MAX_FIND_EMPTY_SLOT_SQR_DISTANCE,
  MAX_PLACEMENT_DISTANCE,
  MIN_FIND_EMPTY_SLOT_COSINE,
} from './construct';
import {
  canAttachRoof,
  type HousingGraph,
} from './housingGraph';
import { add, distance, dot, length, normalize, scale, sub, type Vec3Like } from './vec';

/** A candidate attachment slot: an exact position and yaw (radians). */
export interface HousingSlot {
  position: Vec3Tuple;
  rotation: number;
}

const OUT_OF_RANGE_SCORE = MAX_FIND_EMPTY_SLOT_SQR_DISTANCE + 1.0;

/**
 * Best-match score from `HousingConnections.ScorePosition`: rejects positions
 * beyond the search radius or too far off the view ray, then favours close,
 * view-aligned slots.
 */
function scorePosition(
  cursor: Vec3Like,
  viewDirection: Vec3Like,
  testPosition: Vec3Like,
): number {
  const delta = sub(testPosition, cursor);
  const sqrDelta = dot(delta, delta);
  if (sqrDelta > MAX_FIND_EMPTY_SLOT_SQR_DISTANCE) {
    return OUT_OF_RANGE_SCORE;
  }
  const cosine = dot(normalize(delta), viewDirection);
  if (cosine < MIN_FIND_EMPTY_SLOT_COSINE) {
    return OUT_OF_RANGE_SCORE;
  }
  return (1 - cosine) * sqrDelta;
}

function offset(position: Vec3Like, direction: Vec3Like, factor: number): Vec3Tuple {
  const scaled = scale(direction, factor);
  return add(position, scaled);
}

/**
 * Find the empty floor/roof slot the view is pointing at.
 *
 * Rooves additionally require `CanAttachRoof`. Backward slot rotation equals the
 * edge rotation; the forward slot is rotated by PI.
 */
export function findEmptyFloorSlot(
  graph: HousingGraph,
  cursor: Vec3Like,
  viewDirection: Vec3Like,
  isRoof: boolean,
): HousingSlot | null {
  let bestMatch = MAX_FIND_EMPTY_SLOT_SQR_DISTANCE;
  let best: HousingSlot | null = null;
  const view = normalize(viewDirection);
  const halfEdge = HALF_EDGE_LENGTH;
  const testOffset = HALF_EDGE_LENGTH * 0.5;

  for (const edge of graph.edges.values()) {
    if (isRoof && !canAttachRoof(graph, edge)) {
      continue;
    }

    if (edge.forwardFloors.length === 0) {
      const testPosition = offset(edge.position, edge.direction, testOffset);
      const score = scorePosition(cursor, view, testPosition);
      if (score < bestMatch) {
        bestMatch = score;
        best = {
          position: offset(edge.position, edge.direction, halfEdge),
          rotation: normalizeScalar(edge.rotation + Math.PI),
        };
      }
    }

    if (edge.backwardFloors.length === 0) {
      const testPosition = offset(edge.position, edge.direction, -testOffset);
      const score = scorePosition(cursor, view, testPosition);
      if (score < bestMatch) {
        bestMatch = score;
        best = {
          position: offset(edge.position, edge.direction, -halfEdge),
          rotation: normalizeScalar(edge.rotation),
        };
      }
    }
  }

  return best;
}

/** Find the empty wall slot the view is pointing at (also one wall below). */
export function findEmptyWallSlot(
  graph: HousingGraph,
  cursor: Vec3Like,
  viewDirection: Vec3Like,
): HousingSlot | null {
  let bestMatch = MAX_FIND_EMPTY_SLOT_SQR_DISTANCE;
  let best: HousingSlot | null = null;
  const view = normalize(viewDirection);

  for (const edge of graph.edges.values()) {
    if (edge.walls.length === 0) {
      const testPosition = add(edge.position, [0, HALF_WALL_HEIGHT, 0]);
      const score = scorePosition(cursor, view, testPosition);
      if (score < bestMatch) {
        bestMatch = score;
        best = { position: testPosition, rotation: normalizeScalar(edge.rotation) };
      }
    }

    if (edge.lowerEdgeId === null || emptyLowerEdge(graph, edge.lowerEdgeId)) {
      const testPosition = add(edge.position, [0, -HALF_WALL_HEIGHT, 0]);
      const score = scorePosition(cursor, view, testPosition);
      if (score < bestMatch) {
        bestMatch = score;
        best = { position: testPosition, rotation: normalizeScalar(edge.rotation) };
      }
    }
  }

  return best;
}

function emptyLowerEdge(graph: HousingGraph, lowerEdgeId: string): boolean {
  const lower = graph.edges.get(lowerEdgeId);
  return lower === undefined || lower.walls.length === 0;
}

/** Find the empty pillar/post slot the view is pointing at (also below). */
export function findEmptyPillarSlot(
  graph: HousingGraph,
  cursor: Vec3Like,
  viewDirection: Vec3Like,
): HousingSlot | null {
  let bestMatch = MAX_FIND_EMPTY_SLOT_SQR_DISTANCE;
  let best: HousingSlot | null = null;
  const view = normalize(viewDirection);

  for (const vertex of graph.vertices.values()) {
    if (vertex.pillars.length === 0) {
      const testPosition = add(vertex.position, [0, HALF_WALL_HEIGHT, 0]);
      const score = scorePosition(cursor, view, testPosition);
      if (score < bestMatch) {
        bestMatch = score;
        best = { position: testPosition, rotation: normalizeScalar(vertex.rotation) };
      }
    }

    if (vertex.lowerVertexId === null || emptyLowerVertex(graph, vertex.lowerVertexId)) {
      const testPosition = add(vertex.position, [0, -HALF_WALL_HEIGHT, 0]);
      const score = scorePosition(cursor, view, testPosition);
      if (score < bestMatch) {
        bestMatch = score;
        best = { position: testPosition, rotation: normalizeScalar(vertex.rotation) };
      }
    }
  }

  return best;
}

function emptyLowerVertex(graph: HousingGraph, lowerVertexId: string): boolean {
  const lower = graph.vertices.get(lowerVertexId);
  return lower === undefined || lower.pillars.length === 0;
}

/**
 * Copy a found slot's exact transform when the incoming position is within one
 * edge length plus tolerance, otherwise leave it alone.
 */
export function snapPlacementToSlot(
  _isRoof: boolean,
  position: Vec3Like,
  slot: HousingSlot | null,
): Vec3Tuple | null {
  if (slot === null) {
    return null;
  }
  if (distance(position, slot.position) > HALF_EDGE_LENGTH + LINK_TOLERANCE) {
    return null;
  }
  return slot.position;
}

/**
 * Snap a floor/roof placement position onto an adjacent edge slot, mirroring
 * `SnapFloorPlacementToEdge`. Returns the exact slot position or `null` when no
 * eligible edge is within range.
 */
export function snapFloorPlacementToEdge(
  graph: HousingGraph,
  position: Vec3Like,
  isRoof: boolean,
): Vec3Tuple | null {
  const searchRadius = HALF_EDGE_LENGTH + LINK_TOLERANCE;

  for (const edge of graph.edges.values()) {
    if (distance(edge.position, position) > searchRadius) {
      continue;
    }
    if (edge.forwardFloors.length > 0 && edge.backwardFloors.length > 0) {
      continue;
    }
    if (isRoof && !canAttachRoof(graph, edge)) {
      continue;
    }

    const forwardTest = offset(edge.position, edge.direction, HALF_EDGE_LENGTH);
    if (withinTolerance(forwardTest, position)) {
      return forwardTest;
    }

    const backwardTest = offset(edge.position, edge.direction, -HALF_EDGE_LENGTH);
    if (withinTolerance(backwardTest, position)) {
      return backwardTest;
    }
  }

  return null;
}

function withinTolerance(a: Vec3Like, b: Vec3Like): boolean {
  return (
    Math.abs(a[0] - b[0]) <= LINK_TOLERANCE &&
    Math.abs(a[1] - b[1]) <= LINK_TOLERANCE &&
    Math.abs(a[2] - b[2]) <= LINK_TOLERANCE
  );
}

/** Keep `position` within `maxDistance` of the aim point (default 16m). */
export function clampPlacementToRange(
  aimPosition: Vec3Like,
  position: Vec3Like,
  maxDistance: number = MAX_PLACEMENT_DISTANCE,
): Vec3Tuple {
  const delta = sub(position, aimPosition);
  const len = length(delta);
  if (len <= maxDistance || len <= 1e-9) {
    return [position[0], position[1], position[2]];
  }
  const clamped = scale(delta, maxDistance / len);
  return add(aimPosition, clamped);
}
