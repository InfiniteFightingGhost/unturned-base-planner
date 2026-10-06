/**
 * Pure ray/plane intersection for placement and dragging.
 *
 * Kept free of three.js so it can be unit-tested and used from any controller.
 * The ray is parameterized as `origin + t * direction`; the plane is horizontal
 * (`y = planeY`). `direction` need not be normalized — only its Y component
 * matters for the parameter, and the returned point is computed from the full
 * direction.
 */

import type { Vec3 } from '@/domain';

const PARALLEL_EPSILON = 1e-8;

/**
 * Intersect a ray with the horizontal plane `y = planeY`.
 *
 * Returns `null` when the ray is parallel to the plane or when the intersection
 * lies behind the origin (`t < 0`), i.e. there is no forward hit.
 */
export function rayToGroundPlane(origin: Vec3, direction: Vec3, planeY = 0): Vec3 | null {
  const denominator = direction[1];
  if (Math.abs(denominator) < PARALLEL_EPSILON) {
    return null;
  }
  const t = (planeY - origin[1]) / denominator;
  if (t < 0) {
    return null;
  }
  return [origin[0] + direction[0] * t, planeY, origin[2] + direction[2] * t];
}
