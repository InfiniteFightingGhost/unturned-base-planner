import { describe, expect, it } from 'vitest';
import { rayToGroundPlane } from '@/editor/tools/groundPlane';

describe('rayToGroundPlane', () => {
  it('hits y = 0 directly below a downward ray', () => {
    const hit = rayToGroundPlane([2, 10, -3], [0, -1, 0]);
    expect(hit).toEqual([2, 0, -3]);
  });

  it('returns null for a ray parallel to the plane', () => {
    expect(rayToGroundPlane([0, 5, 0], [1, 0, 0])).toBeNull();
  });

  it('returns null when the plane lies behind the ray origin', () => {
    expect(rayToGroundPlane([0, -5, 0], [0, -1, 0])).toBeNull();
  });

  it('handles an offset origin with a diagonal ray', () => {
    const hit = rayToGroundPlane([1, 2, 1], [0, -1, 1]);
    expect(hit).not.toBeNull();
    expect(hit?.[1]).toBe(0);
    expect(hit?.[0]).toBeCloseTo(1, 10);
    expect(hit?.[2]).toBeCloseTo(3, 10);
  });

  it('respects a non-zero plane height', () => {
    const hit = rayToGroundPlane([0, 10, 0], [0, -2, 0], 4);
    expect(hit).toEqual([0, 4, 0]);
  });
});
