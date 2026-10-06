import { describe, expect, it } from 'vitest';
import { snapAngle, snapScalar, snapVec3 } from '@/lib/snap';

describe('snapScalar', () => {
  it('snaps to the nearest step', () => {
    expect(snapScalar(1.4, 0.5)).toBe(1.5);
    expect(snapScalar(1.2, 0.5)).toBe(1);
    expect(snapScalar(-0.6, 0.5)).toBe(-0.5);
  });

  it('is a no-op when the step is non-positive or invalid', () => {
    expect(snapScalar(3.14159, 0)).toBe(3.14159);
    expect(snapScalar(3.14159, -1)).toBe(3.14159);
    expect(snapScalar(Number.NaN, 0.5)).toBeNaN();
  });
});

describe('snapVec3', () => {
  it('snaps each component independently', () => {
    expect(snapVec3([1.1, -0.6, 2.24], 0.5)).toEqual([1, -0.5, 2]);
  });
});

describe('snapAngle', () => {
  it('snaps to the nearest quarter turn by default usage', () => {
    expect(snapAngle(1.5, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 10);
  });
});
