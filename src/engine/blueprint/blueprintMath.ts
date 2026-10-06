/**
 * Pure blueprint geometry helpers (P22/P23).
 *
 * No three.js, React or store imports: everything here is plain tuple math so it
 * is node-safe and unit-testable. The renderer builds a single merged
 * `LineSegments` buffer from these segments, but this module never touches GPU
 * resources.
 */

import type { Floor, PieceDimensions, PlacedPiece, Vec3 } from '@/domain';

/** A line segment expressed as its two world-space endpoints. */
export type Segment = readonly [Vec3, Vec3];

const EDGE_INDICES: readonly (readonly [number, number])[] = [
  // bottom face
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  // top face
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  // vertical edges
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

/**
 * The 12 edges of an axis-aligned box centred on `center`, rotated about the Y
 * axis by `rotationY`. The rotation convention matches `Matrix4.makeRotationY`:
 * a positive angle maps local +Z toward +X.
 *
 * The returned segments are ordered deterministically (bottom, top, verticals)
 * so callers can rely on stable geometry across rebuilds.
 */
export function boxEdgesFor(
  center: Vec3,
  dimensions: PieceDimensions,
  rotationY: number,
): Segment[] {
  const hw = dimensions.width / 2;
  const hh = dimensions.height / 2;
  const hd = dimensions.depth / 2;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);

  const localCorners: readonly Vec3[] = [
    [-hw, -hh, -hd],
    [hw, -hh, -hd],
    [hw, -hh, hd],
    [-hw, -hh, hd],
    [-hw, hh, -hd],
    [hw, hh, -hd],
    [hw, hh, hd],
    [-hw, hh, hd],
  ];

  const corners: Vec3[] = localCorners.map(([x, y, z]): Vec3 => {
    const worldX = x * cos + z * sin;
    const worldZ = -x * sin + z * cos;
    return [center[0] + worldX, center[1] + y, center[2] + worldZ];
  });

  return EDGE_INDICES.map(([from, to]): Segment => {
    const start = corners[from];
    const end = corners[to];
    if (start === undefined || end === undefined) {
      // Unreachable for the fixed corner/edge tables above, but keeps the
      // noUncheckedIndexedAccess contract explicit.
      throw new Error('boxEdgesFor: invalid edge index');
    }
    return [start, end];
  });
}

/**
 * Pieces assigned to the active floor. Returns an empty array when the active
 * floor does not exist in the document.
 */
export function activeFloorPieces(
  pieces: readonly PlacedPiece[],
  floors: readonly Floor[],
  activeFloorId: string,
): PlacedPiece[] {
  if (!floors.some((floor) => floor.id === activeFloorId)) {
    return [];
  }
  return pieces.filter((piece) => piece.floorId === activeFloorId);
}
