import { z } from 'zod';

/**
 * Deterministic canonicalization helpers shared by every domain module.
 *
 * Positions, rotations and scales live in the document as plain tuples. When the
 * document is serialized we want logically-equal transforms to produce identical
 * bytes, so values are rounded onto a fixed epsilon grid and `-0` is snapped to
 * `0` (JSON.stringify would emit `-0` otherwise, and `-0 >= 0` is `true`).
 */

/** Default uniform scale applied to placed pieces. */
export const DEFAULT_SCALE = 1;

/** Number of decimal places kept when canonicalizing transform components. */
export const SERIALIZATION_DECIMALS = 6;

/** Epsilon used by `approxEqual`; matches the canonicalization resolution. */
export const SERIALIZATION_EPSILON = 1e-6;

const FiniteNumberSchema = z.number().finite();

/** A tuple of exactly three finite numbers: the wire format for every vector. */
export const Vec3Schema = z.tuple([FiniteNumberSchema, FiniteNumberSchema, FiniteNumberSchema]);

export type Vec3 = z.infer<typeof Vec3Schema>;

/** Explicit alias used across the domain: a plain, serializable 3-tuple. */
export type Vec3Tuple = [number, number, number];

/** Construct a vector tuple. */
export function vec3(x: number, y: number, z: number): Vec3Tuple {
  return [x, y, z];
}

/** The origin, as a fresh mutable tuple. */
export function zeroVec3(): Vec3Tuple {
  return [0, 0, 0];
}

/**
 * Canonicalize a single component: snap `-0` to `0` and round to
 * `SERIALIZATION_DECIMALS` places. `Number((-0).toFixed(6))` is `-0`, so the
 * explicit zero check is required.
 */
export function normalizeScalar(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const rounded = Number(value.toFixed(SERIALIZATION_DECIMALS));
  return rounded === 0 ? 0 : rounded;
}

/** Canonicalize each component of a vector for deterministic serialization. */
export function normalizeVec3(value: Vec3Tuple): Vec3Tuple {
  return [
    normalizeScalar(value[0]),
    normalizeScalar(value[1]),
    normalizeScalar(value[2]),
  ];
}

/** Component-wise approximate equality with a defined epsilon. */
export function approxEqual(
  a: Vec3Tuple,
  b: Vec3Tuple,
  epsilon: number = SERIALIZATION_EPSILON,
): boolean {
  return (
    Math.abs(a[0] - b[0]) <= epsilon &&
    Math.abs(a[1] - b[1]) <= epsilon &&
    Math.abs(a[2] - b[2]) <= epsilon
  );
}

/** A position/rotation/scale transform in its serialized tuple form. */
export interface TransformTuple {
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  scale: Vec3Tuple;
}

/** Canonicalize every vector of a transform. */
export function normalizeTransform(transform: TransformTuple): TransformTuple {
  return {
    position: normalizeVec3(transform.position),
    rotation: normalizeVec3(transform.rotation),
    scale: normalizeVec3(transform.scale),
  };
}
