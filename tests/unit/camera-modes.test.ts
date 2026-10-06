import { describe, expect, it } from 'vitest';
import {
  CAMERA_MODES,
  CAMERA_MODE_CONFIG,
  controlsForMode,
  directionForMode,
  isOrthographic,
  normalizeDirection,
  projectionForMode,
  upForMode,
} from '@/engine/camera/cameraModes';

describe('cameraModes', () => {
  it('exposes a finite direction and up vector for every mode', () => {
    for (const mode of CAMERA_MODES) {
      const direction = directionForMode(mode);
      const up = upForMode(mode);

      expect(direction).toHaveLength(3);
      expect(up).toHaveLength(3);
      for (const component of [...direction, ...up]) {
        expect(Number.isFinite(component)).toBe(true);
      }
      expect(Math.hypot(direction[0], direction[1], direction[2])).toBeGreaterThan(0);
      expect(Math.hypot(up[0], up[1], up[2])).toBeGreaterThan(0);
    }
  });

  it('uses a screen-up -Z vector for TOP_DOWN to avoid gimbal flip', () => {
    expect(upForMode('TOP_DOWN')).toEqual([0, 0, -1]);
    expect(directionForMode('TOP_DOWN')).toEqual([0, 1, 0]);
  });

  it('classifies orthographic modes consistently', () => {
    expect(isOrthographic('ORBIT')).toBe(false);
    expect(isOrthographic('FIRST_PERSON')).toBe(false);
    expect(isOrthographic('TOP_DOWN')).toBe(true);
    expect(isOrthographic('PAN')).toBe(true);
    expect(isOrthographic('FRONT')).toBe(true);
    expect(isOrthographic('BACK')).toBe(true);
    expect(isOrthographic('LEFT')).toBe(true);
    expect(isOrthographic('RIGHT')).toBe(true);

    for (const mode of CAMERA_MODES) {
      expect(isOrthographic(mode)).toBe(projectionForMode(mode) === 'orthographic');
    }
  });

  it('only enables rotate for the free look modes', () => {
    expect(controlsForMode('ORBIT')).toContain('rotate');
    expect(controlsForMode('FIRST_PERSON')).toContain('rotate');
    expect(controlsForMode('TOP_DOWN')).not.toContain('rotate');
    expect(controlsForMode('FRONT')).not.toContain('rotate');
  });

  it('normalizes directions and falls back to +Z for the zero vector', () => {
    const normalized = normalizeDirection([3, 0, 4]);
    expect(Math.hypot(normalized[0], normalized[1], normalized[2])).toBeCloseTo(1, 10);
    expect(normalizeDirection([0, 0, 0])).toEqual([0, 0, 1]);
  });

  it('keeps the config in sync with the mode list', () => {
    expect(new Set(CAMERA_MODES).size).toBe(CAMERA_MODES.length);
    for (const mode of CAMERA_MODES) {
      expect(CAMERA_MODE_CONFIG[mode]).toBeDefined();
    }
  });
});
