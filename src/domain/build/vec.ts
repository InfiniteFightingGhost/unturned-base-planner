import { normalizeVec3, type Vec3Tuple } from '../primitives';

/**
 * Minimal pure 3D math used by the housing engine.
 *
 * The domain deliberately avoids three.js; these helpers are plain tuple math so
 * the building logic stays deterministic and unit-testable. All angles are in
 * radians and rotations happen around the world +Y (up) axis.
 */

/** Anything readable as a 3-component vector. */
export type Vec3Like = readonly [number, number, number];

export function add(a: Vec3Like, b: Vec3Like): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3Like, b: Vec3Like): Vec3Tuple {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3Like, factor: number): Vec3Tuple {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

export function dot(a: Vec3Like, b: Vec3Like): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function length(a: Vec3Like): number {
  return Math.sqrt(dot(a, a));
}

export function distance(a: Vec3Like, b: Vec3Like): number {
  return length(sub(a, b));
}

/** Horizontal (XZ) distance, ignoring the Y component. */
export function horizontalDistance(a: Vec3Like, b: Vec3Like): number {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dz * dz);
}

export function normalize(a: Vec3Like): Vec3Tuple {
  const len = length(a);
  if (len <= 1e-12) {
    return [0, 0, 0];
  }
  return [a[0] / len, a[1] / len, a[2] / len];
}

/**
 * Rotate a vector around the world +Y axis by `radians`.
 *
 * Uses the right-handed rotation matrix:
 *   x' =  x*cos + z*sin
 *   z' = -x*sin + z*cos
 */
export function rotateY(a: Vec3Like, radians: number): Vec3Tuple {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [a[0] * cos + a[2] * sin, a[1], -a[0] * sin + a[2] * cos];
}

/** Component-wise approximate equality. */
export function approxEquals(a: Vec3Like, b: Vec3Like, epsilon = 1e-6): boolean {
  return (
    Math.abs(a[0] - b[0]) <= epsilon &&
    Math.abs(a[1] - b[1]) <= epsilon &&
    Math.abs(a[2] - b[2]) <= epsilon
  );
}

/** Canonicalize a vector for deterministic storage / serialization. */
export function canonicalVec(a: Vec3Like): Vec3Tuple {
  return normalizeVec3([a[0], a[1], a[2]]);
}
