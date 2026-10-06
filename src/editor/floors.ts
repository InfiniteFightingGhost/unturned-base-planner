/**
 * Pure floor helpers.
 *
 * No three.js, React or store dependency: these functions only read a
 * `Project` document, so they are safe to call from the render hot path, the UI
 * and unit tests alike. `activeFloorId` is transient UI state and is passed in
 * explicitly rather than read from a store.
 */

import type { Floor, PlacedPiece, Project } from '@/domain';

/** Opacity applied to a visible, non-active (ghosted) floor. */
export const GHOST_FLOOR_OPACITY = 0.25;
/** Opacity applied to the active floor. */
export const ACTIVE_FLOOR_OPACITY = 1;
/** Opacity applied to a hidden floor (which the renderer does not draw). */
export const HIDDEN_FLOOR_OPACITY = 0;

/** Resolve a floor by id, or `undefined` when the document has no such floor. */
export function floorById(project: Project, id: string): Floor | undefined {
  return project.floors.find((floor) => floor.id === id);
}

/**
 * Floors in display order: ascending by `index`, with the id as a stable
 * tie-breaker so equal indices never reorder between reads.
 */
export function sortedFloors(project: Project): Floor[] {
  return [...project.floors].sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));
}

/** Pieces assigned to a single floor, in document order. */
export function piecesOnFloor(project: Project, floorId: string): PlacedPiece[] {
  return project.pieces.filter((piece) => piece.floorId === floorId);
}

/**
 * Elevation for a newly added floor: one default floor height above the
 * highest existing floor, or `0` for an empty document.
 */
export function nextFloorElevation(project: Project): number {
  if (project.floors.length === 0) {
    return 0;
  }
  let highest = -Infinity;
  for (const floor of project.floors) {
    if (floor.elevation > highest) {
      highest = floor.elevation;
    }
  }
  return highest + project.settings.defaultFloorHeight;
}

/** Whether the given floor exists and is locked. Unknown floors are unlocked. */
export function isFloorLocked(project: Project, floorId: string): boolean {
  return floorById(project, floorId)?.locked ?? false;
}

/** Visible floors in display order. */
export function visibleFloors(project: Project): Floor[] {
  return sortedFloors(project).filter((floor) => floor.visible);
}

/**
 * Opacity for a floor's batch material. The active floor is always opaque;
 * otherwise a hidden floor is fully transparent and a visible floor is ghosted
 * at `GHOST_FLOOR_OPACITY`. The field only builds batches for visible floors,
 * so a hidden value of `0` is informational.
 */
export function ghostOpacityForFloor(floor: Floor, activeFloorId: string): number {
  if (floor.id === activeFloorId) {
    return ACTIVE_FLOOR_OPACITY;
  }
  if (!floor.visible) {
    return HIDDEN_FLOOR_OPACITY;
  }
  return GHOST_FLOOR_OPACITY;
}
