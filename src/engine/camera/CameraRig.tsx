/**
 * CameraRig drives drei's `CameraControls` from the pure mode taxonomy.
 *
 * Design notes:
 * - A single `CameraControls` instance is kept alive. Switching projection is done by
 *   mutating `controls.camera` (camera-controls supports this) and R3F's active camera,
 *   so no instance is torn down and control state is preserved.
 * - The perspective camera is the R3F default camera passed to `Canvas`; the
 *   orthographic camera is created once and resized from the canvas size.
 * - Mode changes are imperative and do not allocate per frame.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import { OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';
import type { Box3 } from 'three';
import type { CameraMode } from './cameraModes';
import {
  controlsForMode,
  directionForMode,
  isOrthographic,
  normalizeDirection,
  upForMode,
} from './cameraModes';
import { useEngineStore } from '../store';

export interface CameraRigHandle {
  /** Switches the active camera mode (updates the shared store). */
  setMode: (mode: CameraMode) => void;
  /** Frames a world-space bounding box. */
  focusOn: (box: Box3) => void;
  /** Returns the camera to the default orbit view. */
  reset: () => void;
  /** Escape hatch for advanced input code. */
  getControls: () => CameraControlsImpl | null;
}

export type CameraRigProps = object;

const DEFAULT_DISTANCE = 30;
const MIN_DISTANCE = 0.5;
const MAX_DISTANCE = 4000;
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 2000;
const FOCUS_PADDING = 0.2;
const FOV = 50;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function applyOrthoFrustum(camera: OrthographicCamera, width: number, height: number): void {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const zoom = clamp(camera.zoom, MIN_ZOOM, MAX_ZOOM);
  const halfHeight = safeHeight / (2 * zoom);
  const halfWidth = safeWidth / (2 * zoom);
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}

function zoomForPerspectiveDistance(distance: number, viewportHeight: number): number {
  const safeHeight = Math.max(1, viewportHeight);
  const worldHeight = 2 * Math.tan((FOV * Math.PI) / 360) * Math.max(distance, MIN_DISTANCE);
  return clamp(safeHeight / worldHeight, MIN_ZOOM, MAX_ZOOM);
}

function distanceForOrthoZoom(zoom: number, viewportHeight: number): number {
  const safeHeight = Math.max(1, viewportHeight);
  const safeZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const worldHeight = safeHeight / safeZoom;
  return clamp(worldHeight / (2 * Math.tan((FOV * Math.PI) / 360)), MIN_DISTANCE, MAX_DISTANCE);
}

function configureControls(controls: CameraControlsImpl, mode: CameraMode): void {
  const actions = controlsForMode(mode);
  const canRotate = actions.includes('rotate');
  const canTruck = actions.includes('truck');
  const canDolly = actions.includes('dolly');
  const action = CameraControlsImpl.ACTION;

  // Editor conventions: middle-drag pans, right-drag orbits, wheel dollies.
  controls.mouseButtons.left = action.NONE;
  controls.mouseButtons.middle = canTruck ? action.TRUCK : action.NONE;
  controls.mouseButtons.right = canRotate ? action.ROTATE : action.NONE;
  controls.mouseButtons.wheel = canDolly ? action.DOLLY : action.NONE;

  controls.touches.one = canRotate
    ? action.TOUCH_ROTATE
    : canTruck
      ? action.TOUCH_TRUCK
      : action.NONE;
  controls.touches.two = canDolly ? action.TOUCH_DOLLY_TRUCK : action.NONE;

  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;
  controls.minZoom = MIN_ZOOM;
  controls.maxZoom = MAX_ZOOM;
  controls.smoothTime = 0.25;
  controls.draggingSmoothTime = 0.08;
}

export const CameraRig = forwardRef<CameraRigHandle, CameraRigProps>(function CameraRig(_props, ref) {
  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const size = useThree((state) => state.size);
  const set = useThree((state) => state.set);
  const invalidate = useThree((state) => state.invalidate);
  const initialCamera = useThree((state) => state.camera);
  const fallbackCameraRef = useRef(initialCamera);

  const perspective = useMemo(() => {
    const camera = new PerspectiveCamera(FOV, 1, 0.1, 40000);
    camera.position.set(DEFAULT_DISTANCE, DEFAULT_DISTANCE, DEFAULT_DISTANCE);
    return camera;
  }, []);

  const orthographic = useMemo(() => {
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 40000);
    camera.zoom = 40;
    camera.position.set(0, DEFAULT_DISTANCE * 2, 0);
    return camera;
  }, []);

  const scratchTarget = useMemo(() => new Vector3(), []);
  const scratchPosition = useMemo(() => new Vector3(), []);
  const scratchDirection = useMemo(() => new Vector3(), []);

  const mode = useEngineStore((state) => state.cameraMode);

  // Keep both custom cameras in sync with the canvas size.
  useEffect(() => {
    perspective.aspect = size.width / Math.max(size.height, 1);
    perspective.updateProjectionMatrix();
    applyOrthoFrustum(orthographic, size.width, size.height);
    invalidate();
  }, [perspective, orthographic, size.width, size.height, invalidate]);

  // Adopt the perspective camera as the rendered camera, restoring the previous one on unmount.
  useEffect(() => {
    const fallbackCamera = fallbackCameraRef.current;
    set({ camera: perspective });
    invalidate();
    return () => {
      set({ camera: fallbackCamera });
    };
  }, [perspective, set, invalidate]);

  // Apply the active mode: projection, orientation and control mapping.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    configureControls(controls, mode);

    const wantOrthographic = isOrthographic(mode);
    const targetCamera = wantOrthographic ? orthographic : perspective;

    controls.getTarget(scratchTarget, false);
    controls.getPosition(scratchPosition, false);
    let distance = clamp(scratchPosition.distanceTo(scratchTarget), MIN_DISTANCE, MAX_DISTANCE);

    if (controls.camera !== targetCamera) {
      if (wantOrthographic) {
        orthographic.zoom = zoomForPerspectiveDistance(distance, size.height);
        applyOrthoFrustum(orthographic, size.width, size.height);
      } else {
        distance = distanceForOrthoZoom(orthographic.zoom, size.height);
      }
      controls.camera = targetCamera;
      set({ camera: targetCamera });
    }

    const up = upForMode(mode);
    targetCamera.up.set(up[0], up[1], up[2]);

    if (mode === 'FIRST_PERSON') {
      controls.setLookAt(6, 1.7, 6, 0, 1.7, 0, true);
    } else {
      const direction = normalizeDirection(directionForMode(mode));
      scratchDirection.set(direction[0], direction[1], direction[2]);
      const positionX = scratchTarget.x + scratchDirection.x * distance;
      const positionY = scratchTarget.y + scratchDirection.y * distance;
      const positionZ = scratchTarget.z + scratchDirection.z * distance;
      controls.setLookAt(
        positionX,
        positionY,
        positionZ,
        scratchTarget.x,
        scratchTarget.y,
        scratchTarget.z,
        true,
      );
    }

    invalidate();
  }, [mode, perspective, orthographic, size.width, size.height, set, invalidate, scratchDirection, scratchPosition, scratchTarget]);

  useImperativeHandle(
    ref,
    () => ({
      setMode: (nextMode: CameraMode) => {
        useEngineStore.getState().setCameraMode(nextMode);
      },
      focusOn: (box: Box3) => {
        const controls = controlsRef.current;
        if (!controls) {
          return;
        }
        void controls.fitToBox(box, true, {
          paddingLeft: FOCUS_PADDING,
          paddingRight: FOCUS_PADDING,
          paddingTop: FOCUS_PADDING,
          paddingBottom: FOCUS_PADDING,
        });
        invalidate();
      },
      reset: () => {
        const controls = controlsRef.current;
        useEngineStore.getState().setCameraMode('ORBIT');
        if (!controls) {
          return;
        }
        const direction = normalizeDirection(directionForMode('ORBIT'));
        controls.setLookAt(
          direction[0] * DEFAULT_DISTANCE,
          direction[1] * DEFAULT_DISTANCE,
          direction[2] * DEFAULT_DISTANCE,
          0,
          0,
          0,
          true,
        );
        invalidate();
      },
      getControls: () => controlsRef.current,
    }),
    [invalidate],
  );

  return <CameraControls ref={controlsRef} makeDefault camera={perspective} />;
});
