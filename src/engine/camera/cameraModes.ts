/**
 * Pure camera-mode taxonomy for the editor viewport.
 *
 * This module intentionally has NO three.js imports: modes are described with plain
 * tuples so they can be unit-tested and consumed by UI code without pulling in WebGL.
 *
 * Convention used throughout the engine:
 * - `direction` is the normalized offset from the focus target toward the camera
 *   (i.e. "where the eye sits" relative to what it is looking at).
 * - `up` is the camera's world up vector. TOP_DOWN uses (0, 0, -1) so that -Z points
 *   up on screen, avoiding the gimbal flip that happens when up is parallel to view.
 */

export type CameraMode =
  | 'ORBIT'
  | 'PAN'
  | 'FIRST_PERSON'
  | 'TOP_DOWN'
  | 'FRONT'
  | 'BACK'
  | 'LEFT'
  | 'RIGHT';

export type ProjectionType = 'perspective' | 'orthographic';

/** Camera-controls capabilities that a mode allows. */
export type ControlAction = 'rotate' | 'truck' | 'dolly';

export interface CameraModeConfig {
  readonly projection: ProjectionType;
  readonly direction: readonly [number, number, number];
  readonly up: readonly [number, number, number];
  readonly controls: readonly ControlAction[];
}

const Y_UP: readonly [number, number, number] = [0, 1, 0];
const Z_UP_SCREEN: readonly [number, number, number] = [0, 0, -1];

const ORBIT_CONTROLS: readonly ControlAction[] = ['rotate', 'truck', 'dolly'];
const PAN_CONTROLS: readonly ControlAction[] = ['truck', 'dolly'];
const LOOK_CONTROLS: readonly ControlAction[] = ['rotate', 'truck'];

export const CAMERA_MODE_CONFIG: Readonly<Record<CameraMode, CameraModeConfig>> = {
  ORBIT: {
    projection: 'perspective',
    direction: [1, 1, 1],
    up: Y_UP,
    controls: ORBIT_CONTROLS,
  },
  PAN: {
    projection: 'orthographic',
    direction: [0, 1, 0],
    up: Z_UP_SCREEN,
    controls: PAN_CONTROLS,
  },
  FIRST_PERSON: {
    projection: 'perspective',
    direction: [1, 0, 1],
    up: Y_UP,
    controls: LOOK_CONTROLS,
  },
  TOP_DOWN: {
    projection: 'orthographic',
    direction: [0, 1, 0],
    up: Z_UP_SCREEN,
    controls: PAN_CONTROLS,
  },
  FRONT: {
    projection: 'orthographic',
    direction: [0, 0, 1],
    up: Y_UP,
    controls: PAN_CONTROLS,
  },
  BACK: {
    projection: 'orthographic',
    direction: [0, 0, -1],
    up: Y_UP,
    controls: PAN_CONTROLS,
  },
  LEFT: {
    projection: 'orthographic',
    direction: [-1, 0, 0],
    up: Y_UP,
    controls: PAN_CONTROLS,
  },
  RIGHT: {
    projection: 'orthographic',
    direction: [1, 0, 0],
    up: Y_UP,
    controls: PAN_CONTROLS,
  },
};

export const CAMERA_MODES: readonly CameraMode[] = [
  'ORBIT',
  'PAN',
  'FIRST_PERSON',
  'TOP_DOWN',
  'FRONT',
  'BACK',
  'LEFT',
  'RIGHT',
];

export function projectionForMode(mode: CameraMode): ProjectionType {
  return CAMERA_MODE_CONFIG[mode].projection;
}

export function isOrthographic(mode: CameraMode): boolean {
  return CAMERA_MODE_CONFIG[mode].projection === 'orthographic';
}

export function directionForMode(mode: CameraMode): [number, number, number] {
  const direction = CAMERA_MODE_CONFIG[mode].direction;
  return [direction[0], direction[1], direction[2]];
}

export function upForMode(mode: CameraMode): [number, number, number] {
  const up = CAMERA_MODE_CONFIG[mode].up;
  return [up[0], up[1], up[2]];
}

export function controlsForMode(mode: CameraMode): readonly ControlAction[] {
  return CAMERA_MODE_CONFIG[mode].controls;
}

/** Returns a unit-length copy of `vector`, falling back to +Z for the degenerate case. */
export function normalizeDirection(
  vector: readonly [number, number, number],
): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (!Number.isFinite(length) || length === 0) {
    return [0, 0, 1];
  }
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}
