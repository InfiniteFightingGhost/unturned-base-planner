/**
 * Public surface of the editor core (command/state layer).
 *
 * The 3D interaction layer should import from `@/editor` rather than reaching
 * into submodules.
 */

export {
  createAddPiecesCommand,
  createBatchCommand,
  createDeletePiecesCommand,
  createSetBuildStateCommand,
  createSetTagsCommand,
  createSetZoneCommand,
  createTransformPiecesCommand,
} from './commands';

export {
  createAddFloorCommand,
  createDeleteFloorCommand,
  createRenameFloorCommand,
  createSetFloorElevationCommand,
  createSetFloorLockedCommand,
  createSetFloorVisibleCommand,
} from './floor-commands';

export {
  ACTIVE_FLOOR_OPACITY,
  GHOST_FLOOR_OPACITY,
  HIDDEN_FLOOR_OPACITY,
  floorById,
  ghostOpacityForFloor,
  isFloorLocked,
  nextFloorElevation,
  piecesOnFloor,
  sortedFloors,
  visibleFloors,
} from './floors';

export { EMPTY_SELECTION, applySelection, isSelected, selectAll } from './selection';
export type { SelectionMode } from './selection';

export {
  approxEqualVec3,
  arrayPieces,
  clonePiece,
  duplicatePieces,
  gridArray,
  gridArrayPieces,
  linearArray,
  mirrorPiece,
  mirrorPieces,
  radialArrayPieces,
  rotatePieceY,
  translatePiece,
} from './transform';

export {
  createGridArrayCommand,
  createLinearArrayCommand,
  createMirrorCommand,
  createRadialArrayCommand,
} from './pattern-commands';

export {
  placementIsNoop,
  resolvePlacement,
  snapPlacementPosition,
  wouldCreateDuplicateId,
} from './placement';

export {
  canRedo,
  canUndo,
  createEditorStore,
  editorStore,
  selectCanRedo,
  selectCanUndo,
  selectPieceById,
  selectSelectedPieces,
  useEditorStore,
} from './store';
export type { EditorState, EditorStore } from './store';
