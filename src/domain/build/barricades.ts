import { normalizeScalar, normalizeVec3, type Vec3Tuple } from '../primitives';
import type { PieceDefinition } from '../piece-definition';
import type { PlacedPiece } from '../placed-piece';
import { MAX_PLACEMENT_DISTANCE } from './construct';
import { resolveBuild, type EBuild } from './ebuild';
import { add, distance, scale, sub, type Vec3Like } from './vec';

/**
 * Unturned barricade attachment engine (pure domain).
 *
 * Mirrors the placement branches of `UseableBarricade.checkSpace()` and the
 * rotation composition of `BarricadeManager.getRotation()` from the public
 * U3-SDK. The engine works on an abstract `SurfaceHit` instead of doing physics:
 * the caller is responsible for raycasting/`SphereCast` and reports the surface
 * kind it hit.
 *
 * APPROXIMATIONS vs. the game:
 * - Collision, clip volumes, claims and safe-zones are not modelled. Callers may
 *   flag a computed placement as `Obstructed` via `opts.obstructed`.
 * - `QuaternionLike` stores the composed rotation as Euler `{ pitch, yaw, roll }`
 *   (radians). `BarricadeManager.getRotation` composes yaw, then pitch, then
 *   roll; storing the angles separately keeps the data serializable while the
 *   caller can rebuild the exact quaternion in that order.
 * - `opts.offset` stands in for `ItemBarricadeAsset.offset`; it defaults to 0
 *   because the asset value varies per item.
 */

/** Default search/placement range, shared with the housing engine. */
export const BARRIER_RANGE = MAX_PLACEMENT_DISTANCE;

/** Surface categories a barricade can be attached to. */
export type SurfaceKind =
  | 'ground'
  | 'wall'
  | 'windowSlot'
  | 'doorSlot'
  | 'gateSlot'
  | 'holeSlot'
  | 'climbSlot'
  | 'any';

/** The abstract surface reported by the caller's raycast. */
export interface SurfaceHit {
  point: Vec3Tuple;
  normal: Vec3Tuple;
  kind: SurfaceKind;
  sourcePieceId?: string;
  sourceYaw?: number;
}

/** An attachment slot exposed by a placed piece (window, doorway, ...). */
export interface BarricadeSlot {
  kind: SurfaceKind;
  position: Vec3Tuple;
  normal: Vec3Tuple;
  yaw: number;
  sourcePieceId: string;
}

/** Composed placement rotation, stored as Euler angles in radians. */
export interface QuaternionLike {
  pitch: number;
  yaw: number;
  roll: number;
}

/** Placement outcome codes, matching `UseableBarricade`'s failure hints. */
export type BarricadePlacementResult =
  | 'Success'
  | 'MissingSlot'
  | 'Obstructed'
  | 'InvalidWindow'
  | 'InvalidDoor'
  | 'InvalidGate'
  | 'InvalidHole'
  | 'InvalidSurface'
  | 'OutOfRange';

export interface BarricadePlacement {
  result: BarricadePlacementResult;
  position?: Vec3Tuple;
  rotation?: QuaternionLike;
}

export interface BarricadeAttachmentOptions {
  /** Stand-in for `ItemBarricadeAsset.offset`. Default 0. */
  offset?: number;
  /** Slots exposed by the source piece, when the caller models them. */
  slots?: readonly BarricadeSlot[];
  /** Player aim position; when set, the final position is range-checked. */
  aimPosition?: Vec3Tuple;
  /** Maximum placement distance. Default `BARRIER_RANGE` (16 m). */
  maxDistance?: number;
  /** Free rotation input for FREEFORM/SENTRY_FREEFORM (radians). */
  angles?: Partial<QuaternionLike>;
  /** Quantize free rotation to 15 degree steps. */
  snap?: boolean;
  /** Caller-supplied collision result; forces `Obstructed` when true. */
  obstructed?: boolean;
}

const QUARTER_TURN = Math.PI / 2;
/** Snap increment used by `ControlsSettings.snap`: 15 degrees. */
export const SNAP_STEP = Math.PI / 12;
const WALL_NORMAL_EPSILON = 0.1;
const UPWARD_NORMAL_MIN = 0.01;
const UPWARD_NORMAL_MAX = 0.75;
const FREEFORM_INWARD = 0.125;
const DEFAULT_OFFSET = 0;

/** Builds that mount flush on a vertical wall face. */
const WALL_MOUNTED: ReadonlySet<EBuild> = new Set<EBuild>([
  'TORCH',
  'STORAGE_WALL',
  'SIGN_WALL',
  'CAGE',
  'BARRICADE_WALL',
]);

/** Builds that sit on an upward-ish surface. */
const GROUND_BUILDS: ReadonlySet<EBuild> = new Set<EBuild>([
  'BARRICADE',
  'BED',
  'STORAGE',
  'CAMPFIRE',
  'SPIKE',
  'CLAIM',
  'TANK',
  'LIBRARY',
  'GENERATOR',
  'SPOT',
  'SAFEZONE',
  'OVEN',
  'MANNEQUIN',
  'STEREO',
  'SIGN',
  'WIRE',
  'BARREL_RAIN',
  'VEHICLE',
  'SENTRY',
  'OXYGENATOR',
  'BEACON',
  'FARM',
  'OIL',
]);

/** Builds that receive no base `-PI/2` pitch in `getRotation`. */
const NO_BASE_PITCH: ReadonlySet<EBuild> = new Set<EBuild>([
  'DOOR',
  'GATE',
  'SHUTTER',
  'HATCH',
]);

const WINDOW_NAME = /window/i;
const DOORFRAME_NAME = /door\s*frame|doorframe/i;
const GARAGE_NAME = /garage/i;
const HOLE_NAME = /hole|hatch|trapdoor/i;

/** Unit forward vector for a world yaw, matching `Quaternion.Euler(0, yaw, 0)`. */
export function forwardFromYaw(yaw: number): Vec3Tuple {
  return [Math.sin(yaw), 0, Math.cos(yaw)];
}

/** World yaw of a surface normal, matching `Quaternion.LookRotation(normal)`. */
export function yawFromNormal(normal: Vec3Like): number {
  return normalizeScalar(Math.atan2(normal[0], normal[2]));
}

/** Wrap an angle into `[-PI, PI)`. */
export function wrapAngle(radians: number): number {
  const twoPi = Math.PI * 2;
  let value = radians % twoPi;
  if (value >= Math.PI) {
    value -= twoPi;
  } else if (value < -Math.PI) {
    value += twoPi;
  }
  return value;
}

/** Quantize an angle onto `step` (default 15 degrees). */
export function quantizeAngle(radians: number, step: number = SNAP_STEP): number {
  return normalizeScalar(Math.round(radians / step) * step);
}

function isVertical(normal: Vec3Like): boolean {
  return Math.abs(normal[1]) < WALL_NORMAL_EPSILON;
}

function canonical(position: Vec3Like): Vec3Tuple {
  return normalizeVec3([position[0], position[1], position[2]]);
}

function canonicalPoint(x: number, y: number, z: number): Vec3Tuple {
  return [normalizeScalar(x), normalizeScalar(y), normalizeScalar(z)];
}

/** Wrap an angle into `[0, 2PI)`. */
function wrapPositive(radians: number): number {
  const twoPi = Math.PI * 2;
  const value = radians % twoPi;
  return normalizeScalar(value < 0 ? value + twoPi : value);
}

/**
 * Mirror of `BarricadeManager.getRotation`: the base pitch is `-PI/2` for every
 * build except DOOR, GATE, SHUTTER and HATCH, which have none.
 */
export function barricadeRotation(
  build: EBuild,
  angles: Partial<QuaternionLike> = {},
): QuaternionLike {
  const basePitch = NO_BASE_PITCH.has(build) ? 0 : -Math.PI / 2;
  return {
    pitch: normalizeScalar(basePitch + (angles.pitch ?? 0)),
    yaw: normalizeScalar(angles.yaw ?? 0),
    roll: normalizeScalar(angles.roll ?? 0),
  };
}

/**
 * Derive the attachment slots a placed piece exposes to the barricade engine.
 *
 * A window exposes front/back `windowSlot`s, a doorway/doorframe a `doorSlot`,
 * a garage/garageframe a `gateSlot`, a hole a `holeSlot` plus a `climbSlot`,
 * walls expose `wall` faces on both sides, and floors/ground expose `ground`.
 */
export function barricadeSlotsForPiece(
  piece: PlacedPiece,
  definition: PieceDefinition,
): BarricadeSlot[] {
  const yaw = piece.rotation[1];
  const forward = forwardFromYaw(yaw);
  const back: Vec3Tuple = canonicalPoint(-forward[0], 0, -forward[2]);
  const halfHeight = definition.dimensions.height / 2;
  const centre = canonicalPoint(
    piece.position[0],
    piece.position[1] + halfHeight,
    piece.position[2],
  );
  const sourcePieceId = piece.id;
  const slots: BarricadeSlot[] = [];

  const isWindow = definition.category === 'window' || WINDOW_NAME.test(definition.name);
  const isDoorway = definition.category === 'doorway' || DOORFRAME_NAME.test(definition.name);
  const isGarage = GARAGE_NAME.test(definition.name);
  const isHole = HOLE_NAME.test(definition.name);

  if (isWindow) {
    slots.push({ kind: 'windowSlot', position: centre, normal: forward, yaw, sourcePieceId });
    slots.push({
      kind: 'windowSlot',
      position: centre,
      normal: back,
      yaw: normalizeScalar(yaw + Math.PI),
      sourcePieceId,
    });
  }

  if (isDoorway) {
    slots.push({ kind: 'doorSlot', position: centre, normal: forward, yaw, sourcePieceId });
  }

  if (isGarage) {
    slots.push({ kind: 'gateSlot', position: centre, normal: forward, yaw, sourcePieceId });
  }

  if (isHole) {
    slots.push({ kind: 'holeSlot', position: centre, normal: forward, yaw, sourcePieceId });
    slots.push({ kind: 'climbSlot', position: centre, normal: forward, yaw, sourcePieceId });
  }

  if (definition.category === 'wall') {
    slots.push({ kind: 'wall', position: centre, normal: forward, yaw, sourcePieceId });
    slots.push({
      kind: 'wall',
      position: centre,
      normal: back,
      yaw: normalizeScalar(yaw + Math.PI),
      sourcePieceId,
    });
  } else if (definition.category === 'floor' || definition.category === 'foundation') {
    slots.push({
      kind: 'ground',
      position: canonicalPoint(piece.position[0], piece.position[1], piece.position[2]),
      normal: [0, 1, 0],
      yaw,
      sourcePieceId,
    });
  }

  return slots;
}

function findSlot(
  kind: SurfaceKind,
  hit: SurfaceHit,
  cursorYaw: number,
  opts: BarricadeAttachmentOptions,
): BarricadeSlot | null {
  const slots = opts.slots;
  if (slots !== undefined) {
    for (const slot of slots) {
      if (slot.kind !== kind) {
        continue;
      }
      if (hit.sourcePieceId !== undefined && slot.sourcePieceId !== hit.sourcePieceId) {
        continue;
      }
      return slot;
    }
  }
  if (hit.kind === kind) {
    return {
      kind,
      position: canonicalPoint(hit.point[0], hit.point[1], hit.point[2]),
      normal: [hit.normal[0], hit.normal[1], hit.normal[2]],
      yaw: hit.sourceYaw ?? cursorYaw,
      sourcePieceId: hit.sourcePieceId ?? '',
    };
  }
  return null;
}

/** Pick the slot direction nearest the cursor, then rotate 180 degrees. */
function snapHatchYaw(slotYaw: number, cursorYaw: number): number {
  let best = slotYaw;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 4; i += 1) {
    const candidate = slotYaw + i * QUARTER_TURN;
    const delta = Math.abs(wrapAngle(candidate - cursorYaw));
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }
  return wrapPositive(best + Math.PI);
}

function finalize(
  position: Vec3Tuple,
  rotation: QuaternionLike,
  opts: BarricadeAttachmentOptions,
): BarricadePlacement {
  const maxDistance = opts.maxDistance ?? BARRIER_RANGE;
  if (opts.aimPosition !== undefined && distance(opts.aimPosition, position) > maxDistance) {
    return { result: 'OutOfRange' };
  }
  if (opts.obstructed === true) {
    return { result: 'Obstructed' };
  }
  return { result: 'Success', position, rotation };
}

/**
 * Solve a barricade attachment for a definition and a surface hit.
 *
 * Unknown/unsupported builds fall back to generic free placement on any hit at
 * `hit.point + normal * offset`.
 */
export function solveBarricadeAttachment(
  definition: PieceDefinition,
  hit: SurfaceHit,
  cursorYaw: number,
  opts: BarricadeAttachmentOptions = {},
): BarricadePlacement {
  const offset = opts.offset ?? DEFAULT_OFFSET;
  const build = resolveBuild(definition);

  if (build === undefined) {
    const position = canonical(add(hit.point, scale(hit.normal, offset)));
    return finalize(position, barricadeRotation('FREEFORM', { yaw: cursorYaw }), opts);
  }

  if (build === 'FORTIFICATION' || build === 'SHUTTER' || build === 'GLASS') {
    const slot = findSlot('windowSlot', hit, cursorYaw, opts);
    if (slot === null) {
      return { result: 'InvalidWindow' };
    }
    const position = canonical(sub(slot.position, scale(hit.normal, offset)));
    return finalize(position, barricadeRotation(build, { yaw: slot.yaw }), opts);
  }

  if (build === 'DOOR') {
    const slot = findSlot('doorSlot', hit, cursorYaw, opts);
    if (slot === null) {
      return { result: 'InvalidDoor' };
    }
    return finalize(canonical(slot.position), barricadeRotation(build, { yaw: slot.yaw }), opts);
  }

  if (build === 'GATE') {
    const slot = findSlot('gateSlot', hit, cursorYaw, opts);
    if (slot === null) {
      return { result: 'InvalidGate' };
    }
    return finalize(canonical(slot.position), barricadeRotation(build, { yaw: slot.yaw }), opts);
  }

  if (build === 'HATCH') {
    const slot = findSlot('holeSlot', hit, cursorYaw, opts);
    if (slot === null) {
      return { result: 'InvalidHole' };
    }
    const yaw = snapHatchYaw(slot.yaw, cursorYaw);
    return finalize(canonical(slot.position), barricadeRotation(build, { yaw }), opts);
  }

  if (build === 'LADDER') {
    const slot = findSlot('climbSlot', hit, cursorYaw, opts);
    if (slot !== null) {
      return finalize(canonical(slot.position), barricadeRotation(build, { yaw: slot.yaw }), opts);
    }
    if (isVertical(hit.normal)) {
      const position = canonical(add(hit.point, scale(hit.normal, offset)));
      return finalize(position, barricadeRotation(build, { yaw: yawFromNormal(hit.normal) }), opts);
    }
    return { result: 'MissingSlot' };
  }

  if (WALL_MOUNTED.has(build)) {
    if (!isVertical(hit.normal)) {
      return { result: 'InvalidSurface' };
    }
    const position = canonical(add(hit.point, scale(hit.normal, offset)));
    return finalize(position, barricadeRotation(build, { yaw: yawFromNormal(hit.normal) }), opts);
  }

  if (build === 'FREEFORM' || build === 'SENTRY_FREEFORM') {
    const angles = opts.angles ?? {};
    const snap = opts.snap === true;
    const yawInput = angles.yaw ?? cursorYaw;
    const pitchInput = angles.pitch ?? 0;
    const rollInput = angles.roll ?? 0;
    const rotation = barricadeRotation(build, {
      pitch: snap ? quantizeAngle(pitchInput) : pitchInput,
      yaw: snap ? quantizeAngle(yawInput) : yawInput,
      roll: snap ? quantizeAngle(rollInput) : rollInput,
    });
    const forward = forwardFromYaw(rotation.yaw);
    const position = canonical(
      add(add(hit.point, scale(hit.normal, -FREEFORM_INWARD)), scale(forward, offset)),
    );
    return finalize(position, rotation, opts);
  }

  if (GROUND_BUILDS.has(build)) {
    if (hit.normal[1] < UPWARD_NORMAL_MIN) {
      return { result: 'InvalidSurface' };
    }
    const position =
      hit.normal[1] > UPWARD_NORMAL_MAX
        ? canonical(add(hit.point, scale(hit.normal, offset)))
        : canonical(add(hit.point, [0, offset, 0]));
    return finalize(position, barricadeRotation(build, { yaw: cursorYaw }), opts);
  }

  const position = canonical(add(hit.point, scale(hit.normal, offset)));
  return finalize(position, barricadeRotation(build, { yaw: cursorYaw }), opts);
}

/** Wrapper returning only the placement result code. */
export function validateBarricadePlacement(
  definition: PieceDefinition,
  hit: SurfaceHit,
  cursorYaw: number,
  opts: BarricadeAttachmentOptions = {},
): BarricadePlacementResult {
  return solveBarricadeAttachment(definition, hit, cursorYaw, opts).result;
}