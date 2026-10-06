/**
 * Slot-aware placement resolution for the editor.
 *
 * This module bridges the pure housing/barricade engine in `@/domain` to the
 * interactive placement tool. It is deliberately free of React and three.js: a
 * pointer move can call it hundreds of times per second and the result is plain
 * data. The engine's own slot finders are view-scored (they mirror the game's
 * first-person `ScorePosition`), which is too strict for an orbiting CAD camera,
 * so each finder is backed by a deterministic XZ-proximity fallback. That keeps
 * placement predictable while still honouring the engine's snapping/validation.
 *
 * APPROXIMATIONS vs. the game:
 * - Walls/ramparts may be placed freestanding (with no floor/roof base) on the
 *   ground. This preserves the planner's long-standing "drop pieces anywhere"
 *   behaviour while a house is being started; once any floor/roof exists the
 *   strict pillar rules apply.
 * - Ground is the flat plane at the active floor elevation, as elsewhere.
 */

import {
  HALF_EDGE_LENGTH,
  LINK_TOLERANCE,
  MAX_FIND_EMPTY_SLOT_DISTANCE,
  RAMPART_PIVOT_OFFSET,
  WALL_PIVOT_OFFSET,
  barricadeSlotsForPiece,
  buildHousingGraph,
  canAttachRoof,
  findEmptyFloorSlot,
  findEmptyPillarSlot,
  findEmptyWallSlot,
  resolveBuild,
  resolveConstruct,
  rotationStep,
  canRotate,
  snapPlacementToSlot,
  solveBarricadeAttachment,
  validatePlacement,
} from '@/domain';
import type {
  BarricadePlacementResult,
  EConstruct,
  EHousingPlacementResult,
  HousingGraph,
  HousingSlot,
  PieceDefinition,
  PlacedPiece,
  SurfaceHit,
  Vec3,
} from '@/domain';

/** Outcome of a structure placement attempt. */
export interface StructurePlacement {
  readonly result: EHousingPlacementResult;
  readonly position: Vec3;
  readonly rotationY: number;
  readonly valid: boolean;
}

/** Outcome of a barricade placement attempt. */
export interface BarricadeResolution {
  readonly result: BarricadePlacementResult;
  readonly position: Vec3;
  readonly rotationY: number;
  readonly valid: boolean;
}

export interface ResolveStructureOptions {
  /** Requested ghost yaw (radians). Quantized by the construct's rotation step. */
  readonly rotationY?: number;
}

/**
 * Memoized housing graphs keyed by the `pieces` array identity. The editor
 * replaces the array on every document change, so the cache is invalidated for
 * free while pointer moves (which reuse the same array) hit the cache.
 */
const graphCache = new WeakMap<readonly PlacedPiece[], HousingGraph>();

function graphFor(
  pieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
): HousingGraph {
  const cached = graphCache.get(pieces);
  if (cached !== undefined) {
    return cached;
  }
  const graph = buildHousingGraph(pieces, definitions);
  graphCache.set(pieces, graph);
  return graph;
}

function normalizeYaw(value: number, step: number): number {
  if (step <= 0) {
    return 0;
  }
  return Math.round(value / step) * step;
}

function horizontalDistance(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}

/**
 * Nearest empty floor/roof slot to the cursor in plan space. Empty means the
 * forward or backward side of an edge has no floor yet; rooves additionally
 * require the edge to be attachable.
 */
function nearestFloorSlot(
  graph: HousingGraph,
  cursor: Vec3,
  isRoof: boolean,
): HousingSlot | null {
  const tolerance = HALF_EDGE_LENGTH + LINK_TOLERANCE;
  let best: HousingSlot | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const edge of graph.edges.values()) {
    if (Math.abs(edge.position[1] - cursor[1]) > LINK_TOLERANCE) {
      continue;
    }
    if (isRoof && !canAttachRoof(graph, edge)) {
      continue;
    }
    const forward: Vec3 = [
      edge.position[0] + edge.direction[0] * HALF_EDGE_LENGTH,
      edge.position[1],
      edge.position[2] + edge.direction[2] * HALF_EDGE_LENGTH,
    ];
    const backward: Vec3 = [
      edge.position[0] - edge.direction[0] * HALF_EDGE_LENGTH,
      edge.position[1],
      edge.position[2] - edge.direction[2] * HALF_EDGE_LENGTH,
    ];
    const candidates: readonly { empty: boolean; position: Vec3; rotation: number }[] = [
      {
        empty: edge.forwardFloors.length === 0,
        position: forward,
        rotation: edge.rotation + Math.PI,
      },
      {
        empty: edge.backwardFloors.length === 0,
        position: backward,
        rotation: edge.rotation,
      },
    ];
    for (const candidate of candidates) {
      if (!candidate.empty) {
        continue;
      }
      const score = horizontalDistance(
        candidate.position[0],
        candidate.position[2],
        cursor[0],
        cursor[2],
      );
      if (score <= tolerance && score < bestScore) {
        bestScore = score;
        best = { position: candidate.position, rotation: candidate.rotation };
      }
    }
  }

  return best;
}

/** Nearest empty wall/rampart edge slot to the cursor in plan space. */
function nearestWallSlot(
  graph: HousingGraph,
  cursor: Vec3,
  pivotOffset: number,
): HousingSlot | null {
  const tolerance = HALF_EDGE_LENGTH + LINK_TOLERANCE;
  let best: HousingSlot | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const edge of graph.edges.values()) {
    if (edge.walls.length > 0) {
      continue;
    }
    if (Math.abs(edge.position[1] - cursor[1]) > LINK_TOLERANCE) {
      continue;
    }
    const score = horizontalDistance(edge.position[0], edge.position[2], cursor[0], cursor[2]);
    if (score <= tolerance && score < bestScore) {
      bestScore = score;
      best = {
        position: [
          edge.position[0],
          edge.position[1] + pivotOffset,
          edge.position[2],
        ],
        rotation: edge.rotation,
      };
    }
  }

  return best;
}

/** Nearest empty pillar/post vertex slot to the cursor in plan space. */
function nearestPillarSlot(
  graph: HousingGraph,
  cursor: Vec3,
  pivotOffset: number,
): HousingSlot | null {
  let best: HousingSlot | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const vertex of graph.vertices.values()) {
    if (vertex.pillars.length > 0) {
      continue;
    }
    if (Math.abs(vertex.position[1] - cursor[1]) > LINK_TOLERANCE) {
      continue;
    }
    const score = horizontalDistance(
      vertex.position[0],
      vertex.position[2],
      cursor[0],
      cursor[2],
    );
    if (score <= MAX_FIND_EMPTY_SLOT_DISTANCE && score < bestScore) {
      bestScore = score;
      best = {
        position: [vertex.position[0], vertex.position[1] + pivotOffset, vertex.position[2]],
        rotation: vertex.rotation,
      };
    }
  }

  return best;
}

/** Whether the graph already contains a floor/roof base that anchors a house. */
function hasFloorBase(graph: HousingGraph): boolean {
  for (const construct of graph.constructs.values()) {
    if (
      construct === 'FLOOR' ||
      construct === 'FLOOR_POLY' ||
      construct === 'ROOF' ||
      construct === 'ROOF_POLY'
    ) {
      return true;
    }
  }
  return false;
}

function pivotOffsetFor(construct: EConstruct): number {
  return construct === 'RAMPART' || construct === 'POST'
    ? RAMPART_PIVOT_OFFSET
    : WALL_PIVOT_OFFSET;
}

function resolveRotationY(construct: EConstruct, requested: number): number {
  return canRotate(construct) ? normalizeYaw(requested, rotationStep(construct)) : 0;
}

function toPlacement(validation: {
  result: EHousingPlacementResult;
  position: readonly [number, number, number];
  yaw: number;
}): StructurePlacement {
  return {
    result: validation.result,
    position: [validation.position[0], validation.position[1], validation.position[2]],
    rotationY: validation.yaw,
    valid: validation.result === 'Success',
  };
}

function isSameSlot(a: HousingSlot, b: HousingSlot): boolean {
  return (
    Math.abs(a.position[0] - b.position[0]) <= LINK_TOLERANCE &&
    Math.abs(a.position[1] - b.position[1]) <= LINK_TOLERANCE &&
    Math.abs(a.position[2] - b.position[2]) <= LINK_TOLERANCE
  );
}

/**
 * Validate each candidate slot in order and return the first successful
 * placement. The engine's view-scored slot can be the "build downward" variant,
 * which may be obstructed by the very floor it hangs from; the proximity slot
 * (the intuitive spot) is tried next. When every candidate fails the first
 * failure is returned so the caller can show a specific reason.
 */
function attemptCandidates(
  definition: PieceDefinition,
  candidates: readonly HousingSlot[],
  fallback: HousingSlot,
  pieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
  validateOpts: { isFullWall?: boolean },
): StructurePlacement {
  let firstFailure: StructurePlacement | null = null;
  for (const candidate of candidates) {
    const placement = toPlacement(
      validatePlacement(
        definition,
        candidate.position,
        candidate.rotation,
        pieces,
        definitions,
        validateOpts,
      ),
    );
    if (placement.valid) {
      return placement;
    }
    firstFailure = firstFailure ?? placement;
  }

  const fallbackPlacement = toPlacement(
    validatePlacement(
      definition,
      fallback.position,
      fallback.rotation,
      pieces,
      definitions,
      validateOpts,
    ),
  );
  if (fallbackPlacement.valid) {
    return fallbackPlacement;
  }
  return firstFailure ?? fallbackPlacement;
}

/**
 * Resolve a structure placement from the cursor, view direction and document.
 *
 * Slots are snapped exactly when found; otherwise floors/polys fall back to the
 * cursor position (validation then reports `MissingGround` for mid-air floors)
 * and rooves report `MissingSlot`. Walls/ramparts on an empty base are allowed
 * to stand freely so a build can be started.
 */
export function resolveStructurePlacement(
  definition: PieceDefinition,
  cursor: Vec3,
  viewDir: Vec3,
  pieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
  opts: ResolveStructureOptions = {},
): StructurePlacement {
  const construct = resolveConstruct(definition);
  const graph = graphFor(pieces, definitions);
  const requested = opts.rotationY ?? 0;
  const fallbackRotation = resolveRotationY(construct, requested);

  if (construct === 'WALL' || construct === 'RAMPART') {
    if (!hasFloorBase(graph)) {
      return { result: 'Success', position: cursor, rotationY: fallbackRotation, valid: true };
    }
    const pivotOffset = pivotOffsetFor(construct);
    const slots: HousingSlot[] = [];
    const domain = findEmptyWallSlot(graph, cursor, viewDir);
    if (domain !== null) {
      slots.push(domain);
    }
    const near = nearestWallSlot(graph, cursor, pivotOffset);
    if (near !== null && !slots.some((slot) => isSameSlot(slot, near))) {
      slots.push(near);
    }
    return attemptCandidates(
      definition,
      slots,
      { position: cursor, rotation: fallbackRotation },
      pieces,
      definitions,
      { isFullWall: construct === 'WALL' },
    );
  }

  if (construct === 'PILLAR' || construct === 'POST') {
    const pivotOffset = pivotOffsetFor(construct);
    const slots: HousingSlot[] = [];
    const domain = findEmptyPillarSlot(graph, cursor, viewDir);
    if (domain !== null) {
      slots.push(domain);
    }
    const near = nearestPillarSlot(graph, cursor, pivotOffset);
    if (near !== null && !slots.some((slot) => isSameSlot(slot, near))) {
      slots.push(near);
    }
    return attemptCandidates(
      definition,
      slots,
      { position: cursor, rotation: fallbackRotation },
      pieces,
      definitions,
      {},
    );
  }

  const isRoof = construct === 'ROOF' || construct === 'ROOF_POLY';
  const slots: HousingSlot[] = [];
  const domain = findEmptyFloorSlot(graph, cursor, viewDir, isRoof);
  if (domain !== null) {
    const snapped = snapPlacementToSlot(isRoof, cursor, domain) ?? domain.position;
    slots.push({ position: snapped, rotation: domain.rotation });
  }
  const near = nearestFloorSlot(graph, cursor, isRoof);
  if (near !== null && !slots.some((slot) => isSameSlot(slot, near))) {
    slots.push(near);
  }

  if (slots.length === 0) {
    if (isRoof) {
      return { result: 'MissingSlot', position: cursor, rotationY: 0, valid: false };
    }
    return toPlacement(
      validatePlacement(definition, cursor, fallbackRotation, pieces, definitions),
    );
  }

  return attemptCandidates(
    definition,
    slots,
    { position: cursor, rotation: fallbackRotation },
    pieces,
    definitions,
    {},
  );
}

/** Whether a definition is a barricade (resolves to an `EBuild`) rather than a structure. */
export function isBarricadeDefinition(definition: PieceDefinition): boolean {
  return resolveBuild(definition) !== undefined;
}

/**
 * Resolve a barricade attachment. The source piece (when the pointer hit one)
 * contributes its `barricadeSlotsForPiece` slots; falling back to the raw hit
 * lets free-standing builds attach to the ground.
 */
export function resolveBarricadePlacement(
  definition: PieceDefinition,
  hit: SurfaceHit,
  cursorYaw: number,
  pieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
): BarricadeResolution {
  const sourceId = hit.sourcePieceId;
  let slots: ReturnType<typeof barricadeSlotsForPiece> = [];
  if (sourceId !== undefined) {
    const source = pieces.find((piece) => piece.id === sourceId);
    const sourceDefinition =
      source === undefined ? undefined : definitions.get(source.definitionId);
    if (source !== undefined && sourceDefinition !== undefined) {
      slots = barricadeSlotsForPiece(source, sourceDefinition);
    }
  }

  const placement = solveBarricadeAttachment(definition, hit, cursorYaw, { slots });
  const position: Vec3 = placement.position ?? [hit.point[0], hit.point[1], hit.point[2]];
  const rotationY = placement.rotation?.yaw ?? cursorYaw;
  return {
    result: placement.result,
    position,
    rotationY,
    valid: placement.result === 'Success',
  };
}

const PLACEMENT_MESSAGES: Readonly<Record<string, string>> = {
  Success: '',
  MissingSlot: 'Needs a supporting slot',
  MissingPillar: 'Needs pillars at both ends',
  MissingGround: 'Needs a floor below',
  Obstructed: 'Blocked by another piece',
  ObstructedByGround: 'Blocked by the ground',
  InvalidWindow: 'Needs a window frame',
  InvalidDoor: 'Needs a doorway',
  InvalidGate: 'Needs a garage frame',
  InvalidHole: 'Needs a floor hole',
  InvalidSurface: "Can't attach to this surface",
  OutOfRange: 'Too far away',
};

/** Human-readable reason for an unsuccessful placement result, else `null`. */
export function placementMessageFor(result: string): string | null {
  const message = PLACEMENT_MESSAGES[result];
  if (message === undefined || message === '') {
    return null;
  }
  return message;
}
