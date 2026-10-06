/**
 * Viewport: the R3F canvas host for the editor stage.
 *
 * Resize strategy
 * ---------------
 * The canvas fills `.app-stage` via CSS (`position: absolute; inset: 0`), and R3F's
 * built-in ResizeObserver (react-use-measure) reacts to container size changes by
 * updating the renderer and camera. We deliberately avoid a second ResizeObserver:
 * R3F already invalidates the demand-driven frameloop on resize, so an extra observer
 * would only duplicate work. The wrapper below exists purely to position the canvas.
 *
 * Memory hygiene
 * --------------
 * - No geometries or materials are created per render; everything is JSX-declared and
 *   disposed automatically by R3F on unmount.
 * - The custom cameras and scratch vectors in the camera rig are stable `useMemo`
 *   values; they are not GPU resources, but their references are released when the rig
 *   unmounts and the previous R3F camera is restored.
 * - The frameloop is `demand`, so nothing is drawn unless something calls
 *   `invalidate()`. This keeps the door open for a batched instanced renderer that
 *   mutates buffers directly and invalidates once per change.
 */

import { forwardRef, Suspense, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { CameraRig } from './camera/CameraRig';
import type { CameraRigHandle } from './camera/CameraRig';
import type { CameraMode } from './camera/cameraModes';
import { SceneContent } from './scene/SceneContent';
import { useEngineStore } from './store';

export type ViewportHandle = CameraRigHandle;

export interface ViewportProps {
  /** Camera mode applied once on mount. Defaults to the store value (ORBIT). */
  initialCameraMode?: CameraMode;
  /** Extra scene content rendered inside the canvas. */
  children?: ReactNode;
}

export const Viewport = forwardRef<ViewportHandle, ViewportProps>(function Viewport(
  { initialCameraMode, children },
  ref,
) {
  useEffect(() => {
    if (initialCameraMode) {
      useEngineStore.getState().setCameraMode(initialCameraMode);
    }
  }, [initialCameraMode]);

  return (
    <div className="viewport-root">
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        shadows={false}
        camera={{ fov: 50, near: 0.1, far: 40000, position: [30, 30, 30] }}
      >
        <Suspense fallback={null}>
          <SceneContent />
          <CameraRig ref={ref} />
          {children}
        </Suspense>
      </Canvas>
    </div>
  );
});
