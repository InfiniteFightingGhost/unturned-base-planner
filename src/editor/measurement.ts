/**
 * Pure measurement math (P24).
 *
 * This module is deliberately free of three.js, React and store imports so it
 * can run in Node, in the render hot path and inside unit tests. Every function
 * is deterministic: identical inputs always yield identical outputs.
 *
 * `area` and `perimeter` interpret the two points as the opposite corners of an
 * AXIS-ALIGNED rectangle in the XZ plane. The rectangle's edges are parallel to
 * the world X and Z axes, so both metrics depend only on `|dx|` and `|dz|`; the
 * Y component is ignored for these two kinds. `distance` and `height` consider
 * all three dimensions, while `width` uses only X.
 */

import { createId } from '@/domain';
import type { Measurement, MeasurementKind, Vec3 } from '@/domain';

/** Distance between two points: `|b - a|`. */
export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

/** Axis-aligned X extent between two points: `|dx|`. */
export function width(a: Vec3, b: Vec3): number {
  return Math.abs(b[0] - a[0]);
}

/** Vertical extent between two points: `|dy|`. */
export function height(a: Vec3, b: Vec3): number {
  return Math.abs(b[1] - a[1]);
}

/** Area of the axis-aligned XZ rectangle: `|dx * dz|`. */
export function area(a: Vec3, b: Vec3): number {
  return Math.abs((b[0] - a[0]) * (b[2] - a[2]));
}

/** Perimeter of the axis-aligned XZ rectangle: `2 * (|dx| + |dz|)`. */
export function perimeter(a: Vec3, b: Vec3): number {
  return 2 * (Math.abs(b[0] - a[0]) + Math.abs(b[2] - a[2]));
}

/**
 * Compute the scalar value for a measurement kind. Points are the two anchors
 * supplied by the measuring tool, in click order.
 */
export function computeMeasurement(
  kind: MeasurementKind,
  points: readonly [Vec3, Vec3],
): number {
  const [a, b] = points;
  switch (kind) {
    case 'distance':
      return distance(a, b);
    case 'width':
      return width(a, b);
    case 'height':
      return height(a, b);
    case 'area':
      return area(a, b);
    case 'perimeter':
      return perimeter(a, b);
  }
}

/** Factory used to mint the measurement id. Overridable for deterministic tests. */
export type MeasurementIdFactory = () => string;

function clonePoint(point: Vec3): Vec3 {
  return [point[0], point[1], point[2]];
}

/**
 * Build a domain `Measurement` from a kind and two points. The point tuples are
 * copied so the stored measurement can never alias caller-owned arrays.
 */
export function measurementFromPoints(
  kind: MeasurementKind,
  points: readonly [Vec3, Vec3],
  idFactory: MeasurementIdFactory = () => createId('measurement'),
): Measurement {
  return {
    id: idFactory(),
    kind,
    points: [clonePoint(points[0]), clonePoint(points[1])],
    value: computeMeasurement(kind, points),
  };
}

/** Human-readable value with unit: `m` for lengths, `m²` for area. */
export function formatMeasurementValue(kind: MeasurementKind, value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const text = String(rounded);
  return kind === 'area' ? `${text} m²` : `${text} m`;
}
