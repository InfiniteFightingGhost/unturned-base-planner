import type { PieceDefinition } from '../piece-definition';
import type { PlacedPiece } from '../placed-piece';
import type { Vec3Tuple } from '../primitives';
import {
  LINK_TOLERANCE,
  RAMPART_PIVOT_OFFSET,
  WALL_PIVOT_OFFSET,
  resolveConstruct,
} from './construct';
import { buildHousingGraph, type HousingGraph } from './housingGraph';

/** Approximated flat ground plane. The game raycasts against terrain instead. */
export const GROUND_Y = 0;

/** Tolerance used when a piece is considered to rest on the ground plane. */
export const GROUND_TOLERANCE = LINK_TOLERANCE;

/** The transform components needed to place a piece box. */
export interface PieceTransform {
  position: Vec3Tuple;
  rotation: Vec3Tuple;
}

/** An axis-aligned, yaw-aware bounding box approximation of a piece. */
export interface Aabb {
  center: Vec3Tuple;
  halfExtents: Vec3Tuple;
}

/**
 * Build an AABB for a piece.
 *
 * APPROXIMATION: the real game queries the piece's collider(s) with physics.
 * Here we use the declared `dimensions` and a base-center pivot (the box spans
 * `position.y .. position.y + height`). For rotated pieces we take the
 * conservative axis-aligned bounds of the rotated footprint.
 */
export function boxForPiece(piece: PieceTransform, definition: PieceDefinition): Aabb {
  const { width, height, depth } = definition.dimensions;
  const yaw = piece.rotation[1];
  const absCos = Math.abs(Math.cos(yaw));
  const absSin = Math.abs(Math.sin(yaw));
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const halfX = halfWidth * absCos + halfDepth * absSin;
  const halfZ = halfWidth * absSin + halfDepth * absCos;
  const center: Vec3Tuple = [
    piece.position[0],
    piece.position[1] + height / 2,
    piece.position[2],
  ];
  return { center, halfExtents: [halfX, height / 2, halfZ] };
}

/**
 * AABB overlap test with optional padding. APPROXIMATION: terrain and character
 * collisions are not modelled; only declared piece boxes are compared.
 */
export function boxesOverlap(a: Aabb, b: Aabb, padding = 0.02): boolean {
  return (
    Math.abs(a.center[0] - b.center[0]) <= a.halfExtents[0] + b.halfExtents[0] + padding &&
    Math.abs(a.center[1] - b.center[1]) <= a.halfExtents[1] + b.halfExtents[1] + padding &&
    Math.abs(a.center[2] - b.center[2]) <= a.halfExtents[2] + b.halfExtents[2] + padding
  );
}

/**
 * Bottom of a piece's housing pivot. Walls/pillars are stored at their center
 * pivot, so their base is one pivot offset lower; floors/roofs use their stored
 * position directly.
 */
export function pieceBaseY(piece: PlacedPiece, definition: PieceDefinition): number {
  switch (resolveConstruct(definition)) {
    case 'WALL':
    case 'PILLAR':
      return piece.position[1] - WALL_PIVOT_OFFSET;
    case 'RAMPART':
    case 'POST':
      return piece.position[1] - RAMPART_PIVOT_OFFSET;
    default:
      return piece.position[1];
  }
}

type NodeKind = 'vertex' | 'edge';

interface Node {
  kind: NodeKind;
  id: string;
  position: Vec3Tuple;
  pieces: string[];
  neighbours: string[];
}

function nodeKey(kind: NodeKind, id: string): string {
  return `${kind}:${id}`;
}

function buildNodes(graph: HousingGraph): Map<string, Node> {
  const nodes = new Map<string, Node>();

  for (const vertex of graph.vertices.values()) {
    const neighbours: string[] = vertex.edges.map((id) => nodeKey('edge', id));
    if (vertex.upperVertexId !== null) {
      neighbours.push(nodeKey('vertex', vertex.upperVertexId));
    }
    if (vertex.lowerVertexId !== null) {
      neighbours.push(nodeKey('vertex', vertex.lowerVertexId));
    }
    nodes.set(nodeKey('vertex', vertex.id), {
      kind: 'vertex',
      id: vertex.id,
      position: vertex.position,
      pieces: [...vertex.pillars, ...vertex.floors],
      neighbours,
    });
  }

  for (const edge of graph.edges.values()) {
    const neighbours: string[] = [];
    if (edge.vertex0Id !== null) {
      neighbours.push(nodeKey('vertex', edge.vertex0Id));
    }
    if (edge.vertex1Id !== null) {
      neighbours.push(nodeKey('vertex', edge.vertex1Id));
    }
    if (edge.upperEdgeId !== null) {
      neighbours.push(nodeKey('edge', edge.upperEdgeId));
    }
    if (edge.lowerEdgeId !== null) {
      neighbours.push(nodeKey('edge', edge.lowerEdgeId));
    }
    nodes.set(nodeKey('edge', edge.id), {
      kind: 'edge',
      id: edge.id,
      position: edge.position,
      pieces: [...edge.forwardFloors, ...edge.backwardFloors, ...edge.walls],
      neighbours,
    });
  }

  return nodes;
}

/**
 * Compute the set of grounded piece ids by BFS over the housing graph.
 *
 * A connected component of graph nodes is grounded when any of its nodes sits
 * within `GROUND_TOLERANCE` of the ground plane. APPROXIMATION: the game
 * raycasts against terrain; here the ground is the flat plane `y = GROUND_Y`.
 */
export function computeGroundedPieceIds(
  graph: HousingGraph,
  pieces: readonly PlacedPiece[] = [],
  definitions?: ReadonlyMap<string, PieceDefinition>,
): Set<string> {
  const nodes = buildNodes(graph);
  const visited = new Set<string>();
  const grounded = new Set<string>();

  const seeds = new Set<string>();
  if (definitions !== undefined) {
    for (const piece of pieces) {
      const definition = definitions.get(piece.definitionId);
      if (definition === undefined) {
        continue;
      }
      if (Math.abs(pieceBaseY(piece, definition) - GROUND_Y) <= GROUND_TOLERANCE) {
        seeds.add(piece.id);
      }
    }
  }

  for (const startKey of nodes.keys()) {
    if (visited.has(startKey)) {
      continue;
    }
    const componentNodes: Node[] = [];
    const componentPieces = new Set<string>();
    const queue: string[] = [startKey];
    visited.add(startKey);

    while (queue.length > 0) {
      const currentKey = queue.pop();
      if (currentKey === undefined) {
        continue;
      }
      const node = nodes.get(currentKey);
      if (node === undefined) {
        continue;
      }
      componentNodes.push(node);
      for (const pieceId of node.pieces) {
        componentPieces.add(pieceId);
      }
      for (const neighbour of node.neighbours) {
        if (!visited.has(neighbour) && nodes.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }

    const touchesGround = componentNodes.some(
      (node) => Math.abs(node.position[1] - GROUND_Y) <= GROUND_TOLERANCE,
    );
    const hasSeed = [...componentPieces].some((id) => seeds.has(id));
    if (touchesGround || hasSeed) {
      for (const pieceId of componentPieces) {
        grounded.add(pieceId);
      }
    }
  }

  return grounded;
}

/** Is a piece resting on the ground or connected to a grounded piece? */
export function isGrounded(
  piece: PlacedPiece,
  graph: HousingGraph,
  definitions?: ReadonlyMap<string, PieceDefinition>,
): boolean {
  const grounded = computeGroundedPieceIds(graph, [piece], definitions);
  return grounded.has(piece.id);
}

/**
 * Return the ids of pieces that are neither on the ground nor connected to a
 * grounded piece via the housing graph.
 */
export function findFloatingPieces(
  pieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
): string[] {
  const graph = buildHousingGraph(pieces, definitions);
  const grounded = computeGroundedPieceIds(graph, pieces, definitions);
  return pieces
    .filter((piece) => !grounded.has(piece.id))
    .map((piece) => piece.id)
    .sort((a, b) => a.localeCompare(b));
}
