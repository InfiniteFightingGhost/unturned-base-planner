import { describe, expect, it } from 'vitest';
import type { MeasurementKind, Vec3 } from '@/domain';
import {
  area,
  computeMeasurement,
  distance,
  formatMeasurementValue,
  height,
  measurementFromPoints,
  perimeter,
  width,
} from '@/editor';

const origin: Vec3 = [0, 0, 0];
const positive: Vec3 = [3, 5, 4];
const negative: Vec3 = [-5, -4, 2];
const negativeOrigin: Vec3 = [-2, 1, -3];

describe('measurement math', () => {
  it('computes exact values including negative deltas', () => {
    expect(distance(origin, positive)).toBeCloseTo(Math.hypot(3, 5, 4), 12);
    expect(width(origin, positive)).toBe(3);
    expect(height(origin, positive)).toBe(5);
    expect(area(origin, positive)).toBe(12);
    expect(perimeter(origin, positive)).toBe(14);

    expect(distance(negativeOrigin, negative)).toBeCloseTo(Math.hypot(-3, -5, 5), 12);
    expect(width(negativeOrigin, negative)).toBe(3);
    expect(height(negativeOrigin, negative)).toBe(5);
    expect(area(negativeOrigin, negative)).toBe(15);
    expect(perimeter(negativeOrigin, negative)).toBe(16);
  });

  it('is order-independent (absolute deltas)', () => {
    expect(width(positive, origin)).toBe(width(origin, positive));
    expect(height(positive, origin)).toBe(height(origin, positive));
    expect(area(positive, origin)).toBe(area(origin, positive));
    expect(perimeter(positive, origin)).toBe(perimeter(origin, positive));
    expect(distance(positive, origin)).toBe(distance(origin, positive));
  });

  it('computes every kind through computeMeasurement', () => {
    const points = [origin, positive] as const;
    const expected: Record<MeasurementKind, number> = {
      distance: distance(origin, positive),
      width: 3,
      height: 5,
      area: 12,
      perimeter: 14,
    };
    for (const kind of Object.keys(expected) as MeasurementKind[]) {
      expect(computeMeasurement(kind, points)).toBeCloseTo(expected[kind], 12);
    }
  });

  it('builds a schema-shaped measurement and copies points', () => {
    const points: [Vec3, Vec3] = [[1, 2, 3], [4, 6, 3]];
    const measurement = measurementFromPoints('distance', points, () => 'm1');

    expect(measurement).toEqual({
      id: 'm1',
      kind: 'distance',
      points: [
        [1, 2, 3],
        [4, 6, 3],
      ],
      value: 5,
    });

    measurement.points[0]![0] = 999;
    expect(points[0]).toEqual([1, 2, 3]);
  });

  it('is deterministic for a fixed id factory', () => {
    const points: readonly [Vec3, Vec3] = [origin, negative];
    let counter = 0;
    const factory = (): string => `id-${(counter += 1)}`;
    const first = measurementFromPoints('area', points, factory);
    const second = measurementFromPoints('area', points, factory);
    expect(first).toEqual({ ...second, id: first.id });
    expect(first.points).toEqual([
      [0, 0, 0],
      [-5, -4, 2],
    ]);
    expect(first.value).toBe(10);
  });

  it('formats values with units', () => {
    expect(formatMeasurementValue('distance', 5)).toBe('5 m');
    expect(formatMeasurementValue('area', 12.5)).toBe('12.5 m²');
    expect(formatMeasurementValue('perimeter', 2.3456)).toBe('2.35 m');
  });
});
