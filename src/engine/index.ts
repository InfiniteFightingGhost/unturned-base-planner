/**
 * Public engine surface.
 *
 * Consumers (the app shell and future editor UI) should import from `@/engine`
 * rather than reaching into submodules, so the rendering layer can evolve — for
 * example swapping in a batched instanced renderer — without touching call sites.
 */

export { Viewport } from './Viewport';
export type { ViewportHandle, ViewportProps } from './Viewport';

export { SceneContent } from './scene/SceneContent';

export { CameraRig } from './camera/CameraRig';
export type { CameraRigHandle, CameraRigProps } from './camera/CameraRig';
export {
  CAMERA_MODES,
  CAMERA_MODE_CONFIG,
  controlsForMode,
  directionForMode,
  isOrthographic,
  normalizeDirection,
  projectionForMode,
  upForMode,
} from './camera/cameraModes';
export type {
  CameraMode,
  CameraModeConfig,
  ControlAction,
  ProjectionType,
} from './camera/cameraModes';

export { EditorGrid } from './grid/EditorGrid';
export type { EditorGridProps } from './grid/EditorGrid';
export {
  applySnap,
  DEFAULT_GRID_CONFIG,
  screenAdaptiveSpacing,
  SPACING_PRESETS,
} from './grid/gridConfig';
export type { GridConfig } from './grid/gridConfig';

export { useEngineStore, selectBlueprint, selectCameraMode, selectGrid } from './store';
export type { EngineState } from './store';

export {
  descriptorToGeometry,
  disposeGeometryCache,
  geometryCacheSize,
} from './rendering/proxyGeometry';
export { PieceBatch } from './rendering/PieceBatch';
export type {
  BatchGeometry,
  BatchSelectionMode,
  PieceBatchOptions,
} from './rendering/PieceBatch';
export { PieceField } from './rendering/PieceField';
export type { PieceFieldHandle, PieceFieldProps } from './rendering/PieceField';

export { BlueprintOverlay } from './blueprint/BlueprintOverlay';
export { activeFloorPieces, boxEdgesFor } from './blueprint/blueprintMath';
export type { Segment } from './blueprint/blueprintMath';
