/**
 * Pure snapping math shared by the grid, transform tools, and placement.
 * Kept free of three.js so it can be unit-tested and reused on any axis.
 */

export type Vec3Tuple = readonly [number, number, number];

export function snapScalar(value: number, step: number): number {
  if (!Number.isFinite(value) || step <= 0) {
    return value;
  }
  return Math.round(value / step) * step;
}

export function snapVec3(value: Vec3Tuple, step: number): [number, number, number] {
  return [snapScalar(value[0], step), snapScalar(value[1], step), snapScalar(value[2], step)];
}

export function snapAngle(radians: number, stepRadians: number): number {
  if (stepRadians <= 0) {
    return radians;
  }
  return Math.round(radians / stepRadians) * stepRadians;
}
