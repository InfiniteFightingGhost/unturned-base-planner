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
