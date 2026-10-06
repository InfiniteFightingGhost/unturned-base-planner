import { describe, expect, it } from 'vitest';
import * as engine from '@/engine';

describe('engine public surface', () => {
  it('exposes the rendering components', () => {
    expect(engine.Viewport).toBeDefined();
    expect(engine.CameraRig).toBeDefined();
    expect(engine.SceneContent).toBeDefined();
    expect(engine.EditorGrid).toBeDefined();
  });

  it('exposes the pure camera and grid helpers', () => {
    expect(typeof engine.directionForMode).toBe('function');
    expect(typeof engine.upForMode).toBe('function');
    expect(typeof engine.isOrthographic).toBe('function');
    expect(typeof engine.normalizeDirection).toBe('function');
    expect(typeof engine.applySnap).toBe('function');
    expect(typeof engine.screenAdaptiveSpacing).toBe('function');
    expect(engine.CAMERA_MODES.length).toBeGreaterThan(0);
    expect(engine.SPACING_PRESETS.length).toBeGreaterThan(0);
  });

  it('exposes a working engine store', () => {
    expect(typeof engine.useEngineStore.getState).toBe('function');
    const state = engine.useEngineStore.getState();
    expect(state.cameraMode).toBeTypeOf('string');
    expect(state.grid).toBeDefined();
    expect(typeof state.setCameraMode).toBe('function');
    expect(typeof state.toggleGrid).toBe('function');
  });
});
