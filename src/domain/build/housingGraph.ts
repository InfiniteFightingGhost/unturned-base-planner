import type { PieceDefinition } from '../piece-definition';
import type { PlacedPiece } from '../placed-piece';
import { normalizeScalar, normalizeVec3, type Vec3Tuple } from '../primitives';
import {
  type EConstruct,
  HALF_EDGE_LENGTH,
  LINK_TOLERANCE,
  RAMPART_PIVOT_OFFSET,
  TRIANGLE_APEX_PIVOT_OFFSET,
  WALL_HEIGHT,
  WALL_PIVOT_OFFSET,
  degreesToRadians,
  resolveConstruct,
} from './construct';
import {
  add,
  canonicalVec,
  dot,
  normalize,
  rotateY,
  sub,
  type Vec3Like,
} from './vec';

/**
 * Housing graph mirroring Unturned's `HousingConnections`.
 *
 * The graph is *derived* data: it is rebuilt from the placed pieces. Vertices
 * sit at pillar bases and floor corners; edges sit between two floor slots and
 * carry walls. Vertical adjacency (a wall's upper/lower edge, a pillar's
 * upper/lower vertex) is stored as nullable id references so the graph stays
 * acyclic and serializable.
 *
 * Extra fields beyond the documented core (`vertex0Id`, `upperEdgeId`, ...) are
 * required to reproduce `HasFullHeightPillar`, `CanAttachRoof`, and wall
 * placement exactly as the game does.
 */

export interface HousingVertex {
  id: string;
  /** Position at the base of the pillar. */
  position: Vec3Tuple;
  /** Yaw (radians) used when placing a pillar at this vertex. */
  rotation: number;
  /** Pillar/post piece ids occupying this slot. */
  pillars: string[];
  /** Floor/roof piece ids whose corner touches this vertex. */
  floors: string[];
  /** Edge ids that reference this vertex. */
  edges: string[];
  upperVertexId: string | null;
  lowerVertexId: string | null;
}

export interface HousingEdge {
  id: string;
  /** Center position between both floor attachments. */
  position: Vec3Tuple;
  /** Unit direction from backward floors toward forward floors. */
  direction: Vec3Tuple;
  /** Yaw (radians) used when placing a wall or triangle along the edge. */
  rotation: number;
  /** Floor/roof piece ids on the positive direction side. */
  forwardFloors: string[];
  /** Floor/roof piece ids on the negative direction side. */
  backwardFloors: string[];
  /** Wall/rampart piece ids standing on this edge. */
  walls: string[];
  vertex0Id: string | null;
  vertex1Id: string | null;
  upperEdgeId: string | null;
  lowerEdgeId: string | null;
}

export interface HousingGraph {
  vertices: Map<string, HousingVertex>;
  edges: Map<string, HousingEdge>;
  /** Construct of every piece that contributed to the graph. */
  constructs: Map<string, EConstruct>;
}

export function createHousingGraph(): HousingGraph {
  return { vertices: new Map(), edges: new Map(), constructs: new Map() };
}

function yawOf(piece: PlacedPiece): number {
  return piece.rotation[1];
}

/**
 * Remap a model-local vector onto world axes (local X -> world X, local Y ->
 * world Z, local Z -> world Y) and yaw it around the world up axis. This mirrors
 * how Unturned structure models are authored: the model lies with its up along
 * local +Z and its "north" along local +Y.
 */
export function modelDirection(local: Vec3Like, yaw: number): Vec3Tuple {
  const remapped: Vec3Tuple = [local[0], local[2], local[1]];
  return rotateY(remapped, yaw);
}

export function modelPoint(local: Vec3Like, origin: Vec3Like, yaw: number): Vec3Tuple {
  return add(origin, modelDirection(local, yaw));
}

function edgeId(position: Vec3Like): string {
  const [x, y, z] = normalizeVec3([position[0], position[1], position[2]]);
  return `e:${x},${y},${z}`;
}

function vertexId(position: Vec3Like): string {
  const [x, y, z] = normalizeVec3([position[0], position[1], position[2]]);
  return `v:${x},${y},${z}`;
}

export function findVertex(graph: HousingGraph, position: Vec3Like): HousingVertex | null {
  for (const vertex of graph.vertices.values()) {
    if (approxVec(vertex.position, position)) {
      return vertex;
    }
  }
  return null;
}

export function findEdge(graph: HousingGraph, position: Vec3Like): HousingEdge | null {
  for (const edge of graph.edges.values()) {
    if (approxVec(edge.position, position)) {
      return edge;
    }
  }
  return null;
}

function approxVec(a: Vec3Like, b: Vec3Like): boolean {
  return (
    Math.abs(a[0] - b[0]) <= LINK_TOLERANCE &&
    Math.abs(a[1] - b[1]) <= LINK_TOLERANCE &&
    Math.abs(a[2] - b[2]) <= LINK_TOLERANCE
  );
}

function createEdge(
  graph: HousingGraph,
  position: Vec3Like,
  direction: Vec3Like,
  rotation: number,
): HousingEdge {
  const edge: HousingEdge = {
    id: edgeId(position),
    position: canonicalVec(position),
    direction: canonicalVec(normalize(direction)),
    rotation: normalizeScalar(rotation),
    forwardFloors: [],
    backwardFloors: [],
    walls: [],
    vertex0Id: null,
    vertex1Id: null,
    upperEdgeId: null,
    lowerEdgeId: null,
  };
  graph.edges.set(edge.id, edge);
  return edge;
}

function findOrCreateVertex(
  graph: HousingGraph,
  position: Vec3Like,
  rotation: number,
): HousingVertex {
  const existing = findVertex(graph, position);
  if (existing !== null) {
    return existing;
  }
  const vertex: HousingVertex = {
    id: vertexId(position),
    position: canonicalVec(position),
    rotation: normalizeScalar(rotation),
    pillars: [],
    floors: [],
    edges: [],
    upperVertexId: null,
    lowerVertexId: null,
  };
  graph.vertices.set(vertex.id, vertex);
  return vertex;
}

/** Add a floor connection on an existing edge, or create a fresh edge. */
function linkFloorEdge(
  graph: HousingGraph,
  floorId: string,
  position: Vec3Like,
  direction: Vec3Like,
  rotation: number,
): HousingEdge {
  const existing = findEdge(graph, position);
  if (existing !== null) {
    if (existing.forwardFloors.length === 0 && existing.backwardFloors.length === 0) {
      // Floating wall? Reset direction and rotation.
      existing.direction = canonicalVec(normalize(direction));
      existing.rotation = normalizeScalar(rotation);
      existing.backwardFloors.push(floorId);
    } else if (dot(direction, existing.direction) > 0) {
      existing.backwardFloors.push(floorId);
    } else {
      existing.forwardFloors.push(floorId);
    }
    return existing;
  }
  const edge = createEdge(graph, position, direction, rotation);
  edge.backwardFloors.push(floorId);
  return edge;
}

function linkFloorVertex(
  graph: HousingGraph,
  floorId: string,
  position: Vec3Like,
  rotation: number,
): HousingVertex {
  const vertex = findOrCreateVertex(graph, position, rotation);
  if (vertex.floors.length < 1) {
    // Floating pillar? Reset the vertex rotation.
    vertex.rotation = normalizeScalar(rotation);
  }
  vertex.floors.push(floorId);
  return vertex;
}

function linkEdgeWithVertices(
  _graph: HousingGraph,
  edge: HousingEdge,
  vertexA: HousingVertex,
  vertexB: HousingVertex,
): void {
  for (const vertex of [vertexA, vertexB]) {
    if (edge.vertex0Id !== vertex.id && edge.vertex1Id !== vertex.id) {
      if (edge.vertex0Id === null) {
        edge.vertex0Id = vertex.id;
      } else {
        edge.vertex1Id = vertex.id;
      }
      if (!vertex.edges.includes(edge.id)) {
        vertex.edges.push(edge.id);
      }
    }
  }
}

interface SquareEdgeSpec {
  local: Vec3Tuple;
  rotationDegrees: number;
}

const SQUARE_EDGES: readonly SquareEdgeSpec[] = [
  { local: [1, 0, 0], rotationDegrees: 270 },
  { local: [-1, 0, 0], rotationDegrees: 90 },
  { local: [0, 1, 0], rotationDegrees: 0 },
  { local: [0, -1, 0], rotationDegrees: 180 },
];

const LEFT_LOCAL_DIRECTION: Vec3Tuple = [0.8660254037844386, -0.5, 0];
const RIGHT_LOCAL_DIRECTION: Vec3Tuple = [-0.8660254037844386, -0.5, 0];

const TRIANGLE_EDGE_ANGLE_OFFSET_Y = 0.4019237886466841;

export function linkSquareFloor(graph: HousingGraph, piece: PlacedPiece): void {
  const yaw = yawOf(piece);
  const edges: HousingEdge[] = [];
  for (const spec of SQUARE_EDGES) {
    const direction = modelDirection(spec.local, yaw);
    const position = add(piece.position, [
      direction[0] * HALF_EDGE_LENGTH,
      direction[1] * HALF_EDGE_LENGTH,
      direction[2] * HALF_EDGE_LENGTH,
    ]);
    edges.push(
      linkFloorEdge(
        graph,
        piece.id,
        position,
        direction,
        yaw + degreesToRadians(spec.rotationDegrees),
      ),
    );
  }

  // Game order: (+H,+H), (-H,+H), (+H,-H), (-H,-H).
  const corners: readonly Vec3Tuple[] = [
    [HALF_EDGE_LENGTH, HALF_EDGE_LENGTH, 0],
    [-HALF_EDGE_LENGTH, HALF_EDGE_LENGTH, 0],
    [HALF_EDGE_LENGTH, -HALF_EDGE_LENGTH, 0],
    [-HALF_EDGE_LENGTH, -HALF_EDGE_LENGTH, 0],
  ];
  const vertices = corners.map((corner) =>
    linkFloorVertex(graph, piece.id, modelPoint(corner, piece.position, yaw), yaw),
  );

  const edgesByIndex = edges;
  const verticesByIndex = vertices;
  const edge0 = edgesByIndex[0];
  const edge1 = edgesByIndex[1];
  const edge2 = edgesByIndex[2];
  const edge3 = edgesByIndex[3];
  const v0 = verticesByIndex[0];
  const v1 = verticesByIndex[1];
  const v2 = verticesByIndex[2];
  const v3 = verticesByIndex[3];
  if (
    edge0 === undefined ||
    edge1 === undefined ||
    edge2 === undefined ||
    edge3 === undefined ||
    v0 === undefined ||
    v1 === undefined ||
    v2 === undefined ||
    v3 === undefined
  ) {
    return;
  }

  linkEdgeWithVertices(graph, edge0, v0, v2);
  linkEdgeWithVertices(graph, edge1, v1, v3);
  linkEdgeWithVertices(graph, edge2, v0, v1);
  linkEdgeWithVertices(graph, edge3, v2, v3);
}

export function linkTriangularFloor(graph: HousingGraph, piece: PlacedPiece): void {
  const yaw = yawOf(piece);
  const forward = modelDirection([0, 1, 0], yaw);
  const edge0 = linkFloorEdge(
    graph,
    piece.id,
    add(piece.position, [forward[0] * HALF_EDGE_LENGTH, forward[1] * HALF_EDGE_LENGTH, forward[2] * HALF_EDGE_LENGTH]),
    forward,
    yaw,
  );

  const leftPosition = modelPoint([1.5, TRIANGLE_EDGE_ANGLE_OFFSET_Y, 0], piece.position, yaw);
  const leftDirection = modelDirection(LEFT_LOCAL_DIRECTION, yaw);
  const edge1 = linkFloorEdge(
    graph,
    piece.id,
    leftPosition,
    leftDirection,
    yaw + degreesToRadians(240),
  );

  const rightPosition = modelPoint([-1.5, TRIANGLE_EDGE_ANGLE_OFFSET_Y, 0], piece.position, yaw);
  const rightDirection = modelDirection(RIGHT_LOCAL_DIRECTION, yaw);
  const edge2 = linkFloorEdge(
    graph,
    piece.id,
    rightPosition,
    rightDirection,
    yaw + degreesToRadians(120),
  );

  const v0 = linkFloorVertex(
    graph,
    piece.id,
    modelPoint([HALF_EDGE_LENGTH, HALF_EDGE_LENGTH, 0], piece.position, yaw),
    yaw,
  );
  const v1 = linkFloorVertex(
    graph,
    piece.id,
    modelPoint([-HALF_EDGE_LENGTH, HALF_EDGE_LENGTH, 0], piece.position, yaw),
    yaw,
  );
  const v2 = linkFloorVertex(
    graph,
    piece.id,
    modelPoint([0, -TRIANGLE_APEX_PIVOT_OFFSET, 0], piece.position, yaw),
    yaw,
  );

  linkEdgeWithVertices(graph, edge0, v0, v1);
  linkEdgeWithVertices(graph, edge1, v0, v2);
  linkEdgeWithVertices(graph, edge2, v1, v2);
}

/**
 * Place a wall/rampart on the edge above its pivot, creating or reusing the
 * lower and upper edges and their end vertices.
 *
 * `pivotOffset` is `WALL_PIVOT_OFFSET` for walls and `RAMPART_PIVOT_OFFSET` for
 * ramparts. `piece.position` is the placement pivot, i.e. the lower edge plus
 * `pivotOffset * up`.
 */
export function linkWall(graph: HousingGraph, piece: PlacedPiece, pivotOffset: number): void {
  const yaw = yawOf(piece);
  const lowerPosition = sub(piece.position, [0, pivotOffset, 0]);
  const upperPosition = add(lowerPosition, [0, WALL_HEIGHT, 0]);
  const direction = modelDirection([0, 1, 0], yaw);
  const localX = modelDirection([1, 0, 0], yaw);

  const lowerEdge = findEdge(graph, lowerPosition);
  const lower =
    lowerEdge ??
    (() => {
      const created = createEdge(graph, lowerPosition, direction, yaw);
      const v0 = findOrCreateVertex(
        graph,
        add(lowerPosition, [localX[0] * HALF_EDGE_LENGTH, 0, localX[2] * HALF_EDGE_LENGTH]),
        yaw,
      );
      const v1 = findOrCreateVertex(
        graph,
        add(lowerPosition, [-localX[0] * HALF_EDGE_LENGTH, 0, -localX[2] * HALF_EDGE_LENGTH]),
        yaw,
      );
      created.vertex0Id = v0.id;
      created.vertex1Id = v1.id;
      if (!v0.edges.includes(created.id)) {
        v0.edges.push(created.id);
      }
      if (!v1.edges.includes(created.id)) {
        v1.edges.push(created.id);
      }
      return created;
    })();

  const upperEdge = findEdge(graph, upperPosition);
  const upper =
    upperEdge ??
    (() => {
      const created = createEdge(graph, upperPosition, direction, yaw);
      const v0 = findOrCreateVertex(
        graph,
        add(upperPosition, [localX[0] * HALF_EDGE_LENGTH, 0, localX[2] * HALF_EDGE_LENGTH]),
        yaw,
      );
      const v1 = findOrCreateVertex(
        graph,
        add(upperPosition, [-localX[0] * HALF_EDGE_LENGTH, 0, -localX[2] * HALF_EDGE_LENGTH]),
        yaw,
      );
      created.vertex0Id = v0.id;
      created.vertex1Id = v1.id;
      if (!v0.edges.includes(created.id)) {
        v0.edges.push(created.id);
      }
      if (!v1.edges.includes(created.id)) {
        v1.edges.push(created.id);
      }
      return created;
    })();

  upper.lowerEdgeId = lower.id;
  lower.upperEdgeId = upper.id;
  lower.walls.push(piece.id);
}

/**
 * Place a pillar/post, creating or reusing the lower and upper vertices and
 * linking them vertically.
 */
export function linkPillar(graph: HousingGraph, piece: PlacedPiece, pivotOffset: number): void {
  const yaw = yawOf(piece);
  const lowerPosition = sub(piece.position, [0, pivotOffset, 0]);
  const upperPosition = add(lowerPosition, [0, WALL_HEIGHT, 0]);
  const lower = findOrCreateVertex(graph, lowerPosition, yaw);
  const upper = findOrCreateVertex(graph, upperPosition, yaw);
  lower.upperVertexId = upper.id;
  upper.lowerVertexId = lower.id;
  lower.pillars.push(piece.id);
}

export function linkPiece(
  graph: HousingGraph,
  piece: PlacedPiece,
  construct: EConstruct,
): void {
  switch (construct) {
    case 'FLOOR':
    case 'ROOF':
      linkSquareFloor(graph, piece);
      return;
    case 'FLOOR_POLY':
    case 'ROOF_POLY':
      linkTriangularFloor(graph, piece);
      return;
    case 'WALL':
      linkWall(graph, piece, WALL_PIVOT_OFFSET);
      return;
    case 'RAMPART':
      linkWall(graph, piece, RAMPART_PIVOT_OFFSET);
      return;
    case 'PILLAR':
      linkPillar(graph, piece, WALL_PIVOT_OFFSET);
      return;
    case 'POST':
      linkPillar(graph, piece, RAMPART_PIVOT_OFFSET);
      return;
    default: {
      const exhaustive: never = construct;
      return exhaustive;
    }
  }
}

/**
 * Build the housing graph from placed pieces. Unsupported categories are
 * ignored. Pieces are linked in input order, matching the order they would have
 * been spawned in game; serialization sorts by node id for stability.
 */
export function buildHousingGraph(
  pieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
): HousingGraph {
  const graph = createHousingGraph();
  for (const piece of pieces) {
    const definition = definitions.get(piece.definitionId);
    if (definition === undefined) {
      continue;
    }
    const construct = resolveConstruct(definition);
    graph.constructs.set(piece.id, construct);
    linkPiece(graph, piece, construct);
  }
  return graph;
}

export function shouldRemoveEdge(graph: HousingGraph, edge: HousingEdge): boolean {
  if (edge.forwardFloors.length > 0 || edge.backwardFloors.length > 0 || edge.walls.length > 0) {
    return false;
  }
  if (edge.lowerEdgeId === null) {
    return true;
  }
  const lower = graph.edges.get(edge.lowerEdgeId);
  return lower === undefined || lower.walls.length === 0;
}

export function shouldRemoveVertex(graph: HousingGraph, vertex: HousingVertex): boolean {
  if (vertex.pillars.length > 0 || vertex.floors.length > 0 || vertex.edges.length > 0) {
    return false;
  }
  if (vertex.lowerVertexId === null) {
    return true;
  }
  const lower = graph.vertices.get(vertex.lowerVertexId);
  return lower === undefined || lower.pillars.length === 0;
}

function removeEdge(graph: HousingGraph, edge: HousingEdge): void {
  if (edge.vertex0Id !== null) {
    const vertex = graph.vertices.get(edge.vertex0Id);
    if (vertex !== undefined) {
      vertex.edges = vertex.edges.filter((id) => id !== edge.id);
    }
  }
  if (edge.vertex1Id !== null) {
    const vertex = graph.vertices.get(edge.vertex1Id);
    if (vertex !== undefined) {
      vertex.edges = vertex.edges.filter((id) => id !== edge.id);
    }
  }
  if (edge.upperEdgeId !== null) {
    const upper = graph.edges.get(edge.upperEdgeId);
    if (upper !== undefined && upper.lowerEdgeId === edge.id) {
      upper.lowerEdgeId = null;
    }
  }
  if (edge.lowerEdgeId !== null) {
    const lower = graph.edges.get(edge.lowerEdgeId);
    if (lower !== undefined && lower.upperEdgeId === edge.id) {
      lower.upperEdgeId = null;
    }
  }
  edge.vertex0Id = null;
  edge.vertex1Id = null;
  graph.edges.delete(edge.id);
}

function removeVertex(graph: HousingGraph, vertex: HousingVertex): void {
  for (const edgeId of vertex.edges) {
    const edge = graph.edges.get(edgeId);
    if (edge !== undefined) {
      if (edge.vertex0Id === vertex.id) {
        edge.vertex0Id = null;
      } else if (edge.vertex1Id === vertex.id) {
        edge.vertex1Id = null;
      }
    }
  }
  vertex.edges = [];

  if (vertex.upperVertexId !== null) {
    const upper = graph.vertices.get(vertex.upperVertexId);
    if (upper !== undefined && upper.lowerVertexId === vertex.id) {
      upper.lowerVertexId = null;
    }
  }
  if (vertex.lowerVertexId !== null) {
    const lower = graph.vertices.get(vertex.lowerVertexId);
    if (lower !== undefined && lower.upperVertexId === vertex.id) {
      lower.upperVertexId = null;
    }
  }
  vertex.upperVertexId = null;
  vertex.lowerVertexId = null;
  graph.vertices.delete(vertex.id);
}

/** Iteratively drop empty edges and vertices until the graph is stable. */
export function pruneHousingGraph(graph: HousingGraph): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of [...graph.edges.values()]) {
      if (shouldRemoveEdge(graph, edge)) {
        removeEdge(graph, edge);
        changed = true;
      }
    }
    for (const vertex of [...graph.vertices.values()]) {
      if (shouldRemoveVertex(graph, vertex)) {
        removeVertex(graph, vertex);
        changed = true;
      }
    }
  }
}

/** Remove a piece from every slot it occupies, then prune empty nodes. */
export function unlinkPiece(graph: HousingGraph, pieceId: string): void {
  for (const vertex of graph.vertices.values()) {
    vertex.pillars = vertex.pillars.filter((id) => id !== pieceId);
    vertex.floors = vertex.floors.filter((id) => id !== pieceId);
  }
  for (const edge of graph.edges.values()) {
    edge.forwardFloors = edge.forwardFloors.filter((id) => id !== pieceId);
    edge.backwardFloors = edge.backwardFloors.filter((id) => id !== pieceId);
    edge.walls = edge.walls.filter((id) => id !== pieceId);
  }
  graph.constructs.delete(pieceId);
  pruneHousingGraph(graph);
}

/** Is there a full-height pillar (not a post) at this vertex? */
export function hasFullHeightPillar(graph: HousingGraph, vertex: HousingVertex): boolean {
  return vertex.pillars.some((id) => graph.constructs.get(id) === 'PILLAR');
}

/** Is there a full-height wall (not a rampart) on this edge? */
export function hasFullHeightWall(graph: HousingGraph, edge: HousingEdge): boolean {
  return edge.walls.some((id) => graph.constructs.get(id) === 'WALL');
}

/**
 * Mirrors `HousingEdge.CanAttachRoof`: a roof may snap onto an edge that has a
 * floor/roof already, sits on top of a full-height wall, or is supported by two
 * full-height pillars below.
 */
export function canAttachRoof(graph: HousingGraph, edge: HousingEdge): boolean {
  if (edge.forwardFloors.length + edge.backwardFloors.length + edge.walls.length > 0) {
    return true;
  }
  if (edge.lowerEdgeId !== null) {
    const lower = graph.edges.get(edge.lowerEdgeId);
    if (lower !== undefined && hasFullHeightWall(graph, lower)) {
      return true;
    }
  }
  if (edge.vertex0Id !== null && edge.vertex1Id !== null) {
    const v0 = graph.vertices.get(edge.vertex0Id);
    const v1 = graph.vertices.get(edge.vertex1Id);
    if (v0 !== undefined && v1 !== undefined && v0.lowerVertexId !== null && v1.lowerVertexId !== null) {
      const l0 = graph.vertices.get(v0.lowerVertexId);
      const l1 = graph.vertices.get(v1.lowerVertexId);
      if (
        l0 !== undefined &&
        l1 !== undefined &&
        hasFullHeightPillar(graph, l0) &&
        hasFullHeightPillar(graph, l1)
      ) {
        return true;
      }
    }
  }
  return false;
}

function sortedCopy(values: readonly string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

/** Deterministic JSON representation, used by the determinism test. */
export function serializeHousingGraph(graph: HousingGraph): string {
  const vertices = [...graph.vertices.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((vertex) => ({
      id: vertex.id,
      position: vertex.position,
      rotation: vertex.rotation,
      pillars: sortedCopy(vertex.pillars),
      floors: sortedCopy(vertex.floors),
      edges: sortedCopy(vertex.edges),
      upperVertexId: vertex.upperVertexId,
      lowerVertexId: vertex.lowerVertexId,
    }));
  const edges = [...graph.edges.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((edge) => ({
      id: edge.id,
      position: edge.position,
      direction: edge.direction,
      rotation: edge.rotation,
      forwardFloors: sortedCopy(edge.forwardFloors),
      backwardFloors: sortedCopy(edge.backwardFloors),
      walls: sortedCopy(edge.walls),
      vertex0Id: edge.vertex0Id,
      vertex1Id: edge.vertex1Id,
      upperEdgeId: edge.upperEdgeId,
      lowerEdgeId: edge.lowerEdgeId,
    }));
  const constructs = [...graph.constructs.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, construct]) => [id, construct] as const);
  return JSON.stringify({ vertices, edges, constructs });
}
