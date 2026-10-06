/**
 * Pure transform math on `PlacedPiece`.
 *
 * Everything here is plain tuple math (no three.js at runtime) so it is
 * node-safe and unit-testable. Results are canonicalized through
 * `canonicalizePlacedPiece`, which rounds components onto the serialization
 * grid and snaps `-0` to `0`, keeping undo/redo and serialization deterministic.
 *
 * Rotation convention (matches three.js `Matrix4.makeRotationY`):
 * a yaw of `θ` maps local +Z to world `(sin θ, cos θ)`, so positive `θ` rotates
 * +Z toward +X. All resulting yaws are normalized into `[0, 2π)`.
 */

import { canonicalizePlacedPiece, createId, vec3 } from '@/domain';
import type { PlacedPiece, Vec3 } from '@/domain';

export { approxEqual as approxEqualVec3 } from '@/domain';

const TAU = Math.PI * 2;

/** Below this magnitude a vector/angle is treated as degenerate or zero. */
const DIRECTION_EPSILON = 1e-9;

/** Wrap an angle into `[0, 2π)`. */
function normalizeAngle(radians: number): number {
  const wrapped = radians % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

/** Apply a translation to a piece's world position. */
export function translatePiece(piece: PlacedPiece, delta: Vec3): PlacedPiece {
  return canonicalizePlacedPiece({
    ...piece,
    position: vec3(
      piece.position[0] + delta[0],
      piece.position[1] + delta[1],
      piece.position[2] + delta[2],
    ),
  });
}

/**
 * Rotate a piece's position around a Y axis through `pivot` (default: world
 * origin) and add `radians` to its yaw. Only the X/Z components orbit; height is
 * untouched.
 */
export function rotatePieceY(piece: PlacedPiece, radians: number, pivot: Vec3 = [0, 0, 0]): PlacedPiece {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = piece.position[0] - pivot[0];
  const dz = piece.position[2] - pivot[2];

  return canonicalizePlacedPiece({
    ...piece,
    position: vec3(pivot[0] + cos * dx + sin * dz, piece.position[1], pivot[2] - sin * dx + cos * dz),
    rotation: vec3(piece.rotation[0], normalizeAngle(piece.rotation[1] + radians), piece.rotation[2]),
  });
}

/**
 * Mirror a piece across an axis-aligned plane.
 *
 * Reflection math, derived from the yaw convention above (world forward
 * `(sin θ, cos θ)`):
 *
 * - axis `'x'` (plane `x = planeOffset`): `x -> 2·offset − x`, and
 *   `rotation.y -> normalizeAngle(−rotation.y)`.
 * - axis `'z'` (plane `z = planeOffset`): `z -> 2·offset − z`, and
 *   `rotation.y -> normalizeAngle(π − rotation.y)`.
 *
 * Both formulas reflect the facing direction, so geometry mirrors instead of
 * merely sliding. Only yaw is mirrored; roll/pitch are preserved.
 */
export function mirrorPiece(piece: PlacedPiece, axis: 'x' | 'z', planeOffset = 0): PlacedPiece {
  const yaw = piece.rotation[1];
  if (axis === 'x') {
    return canonicalizePlacedPiece({
      ...piece,
      position: vec3(2 * planeOffset - piece.position[0], piece.position[1], piece.position[2]),
      rotation: vec3(piece.rotation[0], normalizeAngle(-yaw), piece.rotation[2]),
    });
  }
  return canonicalizePlacedPiece({
    ...piece,
    position: vec3(piece.position[0], piece.position[1], 2 * planeOffset - piece.position[2]),
    rotation: vec3(piece.rotation[0], normalizeAngle(Math.PI - yaw), piece.rotation[2]),
  });
}

/**
 * Deep-clone a piece into independent tuples. Used for the clipboard so a
 * stored copy can never alias a live document object.
 */
export function clonePiece(piece: PlacedPiece): PlacedPiece {
  return {
    ...piece,
    position: vec3(piece.position[0], piece.position[1], piece.position[2]),
    rotation: vec3(piece.rotation[0], piece.rotation[1], piece.rotation[2]),
    scale: vec3(piece.scale[0], piece.scale[1], piece.scale[2]),
    metadata: { ...piece.metadata, tags: [...piece.metadata.tags] },
  };
}

/**
 * Duplicate pieces with fresh ids, translating each by `offset`. Relative
 * transforms (rotation/scale and inter-piece spacing) are preserved.
 */
export function duplicatePieces(
  pieces: readonly PlacedPiece[],
  offset: Vec3,
  idFactory: () => string = () => createId('piece'),
): PlacedPiece[] {
  return pieces.map((piece) =>
    canonicalizePlacedPiece({
      ...piece,
      id: idFactory(),
      position: vec3(
        piece.position[0] + offset[0],
        piece.position[1] + offset[1],
        piece.position[2] + offset[2],
      ),
    }),
  );
}

/**
 * A deterministic line of `count` copies spaced by `spacing` along `direction`.
 * Every element gets a fresh id; the original piece is not included.
 */
export function linearArray(
  piece: PlacedPiece,
  count: number,
  spacing: number,
  direction: Vec3,
): PlacedPiece[] {
  const total = Math.max(0, Math.floor(count));
  const result: PlacedPiece[] = [];
  for (let index = 0; index < total; index += 1) {
    const step = spacing * index;
    result.push(
      canonicalizePlacedPiece({
        ...piece,
        id: createId('piece'),
        position: vec3(
          piece.position[0] + direction[0] * step,
          piece.position[1] + direction[1] * step,
          piece.position[2] + direction[2] * step,
        ),
      }),
    );
  }
  return result;
}

/**
 * A deterministic row-major grid of `rows × cols` copies: `rows` advance along
 * +X by `spacingX`, `cols` along +Z by `spacingZ`. Every element gets a fresh id.
 */
export function gridArray(
  piece: PlacedPiece,
  rows: number,
  cols: number,
  spacingX: number,
  spacingZ: number,
): PlacedPiece[] {
  const rowCount = Math.max(0, Math.floor(rows));
  const colCount = Math.max(0, Math.floor(cols));
  const result: PlacedPiece[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      result.push(
        canonicalizePlacedPiece({
          ...piece,
          id: createId('piece'),
          position: vec3(
            piece.position[0] + row * spacingX,
            piece.position[1],
            piece.position[2] + col * spacingZ,
          ),
        }),
      );
    }
  }
  return result;
}

/**
 * Replicate an entire selection along a straight line.
 *
 * Returns `count` **new** copies of the whole selection: copy `i` (for
 * `i = 1..count`) is the selection translated by `spacing * i` along
 * `direction`. The originals are never included in the result and every copy
 * receives a fresh id from `idFactory`. Ordering is deterministic: copies are
 * grouped by step (step `1`, then its pieces, then step `2`, ...).
 *
 * `count` is floored and clamped to zero, so non-positive/fractional inputs are
 * handled defensively.
 */
export function arrayPieces(
  pieces: readonly PlacedPiece[],
  count: number,
  spacing: number,
  direction: Vec3,
  idFactory: () => string = () => createId('piece'),
): PlacedPiece[] {
  const total = Math.max(0, Math.floor(count));
  const result: PlacedPiece[] = [];
  for (let index = 1; index <= total; index += 1) {
    const step = spacing * index;
    result.push(
      ...duplicatePieces(
        pieces,
        vec3(direction[0] * step, direction[1] * step, direction[2] * step),
        idFactory,
      ),
    );
  }
  return result;
}

/**
 * Replicate an entire selection across a `rows × cols` grid.
 *
 * Copy offset for cell `(row, col)` is `(col * spacingX, 0, row * spacingZ)`
 * — columns advance along +X, rows along +Z. **The original cell `(0, 0)` is
 * excluded**, so the result contains `rows * cols - 1` copies (or `[]` when
 * either dimension is less than one). Traversal is row-major and every copy
 * receives a fresh id; the originals are never included.
 */
export function gridArrayPieces(
  pieces: readonly PlacedPiece[],
  rows: number,
  cols: number,
  spacingX: number,
  spacingZ: number,
  idFactory: () => string = () => createId('piece'),
): PlacedPiece[] {
  const rowCount = Math.max(0, Math.floor(rows));
  const colCount = Math.max(0, Math.floor(cols));
  const result: PlacedPiece[] = [];
  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      if (row === 0 && col === 0) {
        continue;
      }
      result.push(...duplicatePieces(pieces, vec3(col * spacingX, 0, row * spacingZ), idFactory));
    }
  }
  return result;
}

/**
 * Replicate an entire selection around a Y axis through `center`.
 *
 * The selection is anchored at the horizontal centroid of its pieces. Copy `i`
 * (for `i = 0..count-1`) rotates the anchor by `angle = (first + i) * step`
 * where `step = totalAngleRadians / count`. The anchor is then placed on the
 * circle of `radius` centred on `center`, so the horizontal distance from
 * `center` to the anchor is exactly `|radius|`. Every piece in the copy keeps
 * its relative offset from the anchor and has its yaw increased by the same
 * `angle` (deterministic, matching `rotatePieceY`).
 *
 * Start-point semantics: for a partial arc (`totalAngleRadians` is not a whole
 * number of turns) the first copy starts at `step`, so it never coincides with
 * the original. For a full turn the copies start at angle `0` and are spread by
 * `step`, so exactly `count` distinct slots are produced and the start point
 * (`angle == totalAngleRadians`) is not repeated. Since `step` is
 * `totalAngleRadians / count`, a full turn naturally avoids duplicating the
 * start. The originals are never included; every copy gets a fresh id.
 *
 * A selection whose centroid lies on `center` has no defined start direction
 * and is treated as starting from +X.
 */
export function radialArrayPieces(
  pieces: readonly PlacedPiece[],
  count: number,
  radius: number,
  totalAngleRadians: number,
  center: Vec3,
  idFactory: () => string = () => createId('piece'),
): PlacedPiece[] {
  const total = Math.max(0, Math.floor(count));
  if (total === 0 || pieces.length === 0) {
    return [];
  }

  let sumX = 0;
  let sumZ = 0;
  for (const piece of pieces) {
    sumX += piece.position[0];
    sumZ += piece.position[2];
  }
  const anchorX = sumX / pieces.length;
  const anchorZ = sumZ / pieces.length;
  const offsetX = anchorX - center[0];
  const offsetZ = anchorZ - center[2];
  const baseAngle =
    Math.hypot(offsetX, offsetZ) > DIRECTION_EPSILON ? Math.atan2(offsetZ, offsetX) : 0;

  const wrapped = Math.abs(totalAngleRadians % TAU);
  const isFullTurn = wrapped < DIRECTION_EPSILON && Math.abs(totalAngleRadians) > DIRECTION_EPSILON;
  const firstIndex = isFullTurn ? 0 : 1;
  const step = totalAngleRadians / total;

  const result: PlacedPiece[] = [];
  for (let index = 0; index < total; index += 1) {
    const angle = (firstIndex + index) * step;
    const rotated = baseAngle + angle;
    const targetX = center[0] + radius * Math.cos(rotated);
    const targetZ = center[2] + radius * Math.sin(rotated);
    const deltaX = targetX - anchorX;
    const deltaZ = targetZ - anchorZ;
    for (const piece of pieces) {
      result.push(
        canonicalizePlacedPiece({
          ...clonePiece(piece),
          id: idFactory(),
          position: vec3(piece.position[0] + deltaX, piece.position[1], piece.position[2] + deltaZ),
          rotation: vec3(
            piece.rotation[0],
            normalizeAngle(piece.rotation[1] + angle),
            piece.rotation[2],
          ),
        }),
      );
    }
  }
  return result;
}

/**
 * Create freshly-id'd mirrored copies of the whole selection using
 * `mirrorPiece` (position reflected across the plane `axis = planeOffset`, yaw
 * mirrored accordingly, roll/pitch preserved). The originals are not included;
 * geometry/order is deterministic (`pieces` order) and every copy receives a
 * fresh id.
 */
export function mirrorPieces(
  pieces: readonly PlacedPiece[],
  axis: 'x' | 'z',
  planeOffset = 0,
  idFactory: () => string = () => createId('piece'),
): PlacedPiece[] {
  return pieces.map((piece) => ({
    ...clonePiece(mirrorPiece(piece, axis, planeOffset)),
    id: idFactory(),
  }));
}
