import { describe, expect, it } from 'vitest';
import {
  applySnap,
  DEFAULT_GRID_CONFIG,
  screenAdaptiveSpacing,
  SPACING_PRESETS,
} from '@/engine/grid/gridConfig';
import type { GridConfig } from '@/engine/grid/gridConfig';

function config(patch: Partial<GridConfig> = {}): GridConfig {
  return { ...DEFAULT_GRID_CONFIG, ...patch };
}

describe('applySnap', () => {
  it('snaps each axis independently when snapping is enabled', () => {
    const result = applySnap([1.24, -0.6, 2.9], config({ snapStep: 0.5 }));
    expect(result).toEqual([1, -0.5, 3]);
  });

  it('cleans floating point noise using precision', () => {
    const result = applySnap([0.30000000000000004, 0, 0], config({ snapStep: 0.1, precision: 3 }));
    expect(result).toEqual([0.3, 0, 0]);
  });

  it('is a no-op when snapping is disabled', () => {
    const position: [number, number, number] = [1.24, -0.6, 2.9];
    expect(applySnap(position, config({ snapEnabled: false }))).toEqual(position);
  });

  it('is a no-op for a non-positive step', () => {
    const position: [number, number, number] = [1.24, -0.6, 2.9];
    expect(applySnap(position, config({ snapStep: 0 }))).toEqual(position);
    expect(applySnap(position, config({ snapStep: -1 }))).toEqual(position);
  });

  it('does not mutate the input tuple', () => {
    const position: [number, number, number] = [1.24, -0.6, 2.9];
    applySnap(position, config());
    expect(position).toEqual([1.24, -0.6, 2.9]);
  });
});

describe('screenAdaptiveSpacing', () => {
  it('exposes the expected spacing presets', () => {
    expect(SPACING_PRESETS).toEqual([0.5, 1, 2, 5, 10]);
  });

  it('returns a decade-ladder value for any distance', () => {
    for (const distance of [0.5, 1, 3, 7, 12, 45, 130, 800, 2000]) {
      const spacing = screenAdaptiveSpacing(distance);
      const exponent = Math.floor(Math.log10(spacing));
      const mantissa = spacing / 10 ** exponent;
      expect([1, 2, 5]).toContain(Number(mantissa.toFixed(6)));
    }
  });

  it('is monotonically non-decreasing with distance', () => {
    const distances = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 5000];
    let previous = 0;
    for (const distance of distances) {
      const spacing = screenAdaptiveSpacing(distance);
      expect(spacing).toBeGreaterThanOrEqual(previous);
      previous = spacing;
    }
  });

  it('falls back safely for invalid distances', () => {
    expect(screenAdaptiveSpacing(0)).toBe(1);
    expect(screenAdaptiveSpacing(-10)).toBe(1);
    expect(screenAdaptiveSpacing(Number.NaN)).toBe(1);
  });
});
