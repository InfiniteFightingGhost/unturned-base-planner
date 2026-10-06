/**
 * Pure zone helpers.
 *
 * No three.js, React or store dependency: these functions only read a
 * `Project` document, so they are safe to call from the render hot path, the UI
 * and unit tests alike. `activeZoneId` is transient UI state and is passed in
 * explicitly rather than read from a store.
 *
 * Zone visibility is a display concern (hidden zones are not rendered) while
 * zone locking is an interaction concern (locked zones cannot be picked or
 * selected). Floors and zones compose: a piece is only visible when BOTH its
 * floor and (if assigned) its zone are visible.
 */

import type { PlacedPiece, Project, Zone } from '@/domain';
import { floorById } from './floors';

/** Resolve a zone by id, or `undefined` when the document has no such zone. */
export function zoneById(project: Project, id: string): Zone | undefined {
  return project.zones.find((zone) => zone.id === id);
}

/**
 * Zones in display order: ascending by name, with the id as a stable
 * tie-breaker so equal names never reorder between reads.
 */
export function sortedZones(project: Project): Zone[] {
  return [...project.zones].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
}

/**
 * Pieces assigned to a single zone, in document order. Passing `null` selects
 * the pieces that are not assigned to any zone.
 */
export function piecesInZone(project: Project, zoneId: string | null): PlacedPiece[] {
  return project.pieces.filter((piece) => piece.zoneId === zoneId);
}

/** Visible zones in display order. */
export function visibleZones(project: Project): Zone[] {
  return sortedZones(project).filter((zone) => zone.visible);
}

/** Whether the given zone exists and is locked. Unknown zones are unlocked. */
export function isZoneLocked(project: Project, zoneId: string | null): boolean {
  if (zoneId === null) {
    return false;
  }
  return zoneById(project, zoneId)?.locked ?? false;
}

/** Whether the given zone exists and is hidden. Unknown zones are not hidden. */
export function isZoneHidden(project: Project, zoneId: string | null): boolean {
  if (zoneId === null) {
    return false;
  }
  const zone = zoneById(project, zoneId);
  return zone !== undefined && !zone.visible;
}

/** Piece count for a zone. Unknown zones report zero. */
export function zoneStats(project: Project, zoneId: string): { pieceCount: number } {
  let pieceCount = 0;
  for (const piece of project.pieces) {
    if (piece.zoneId === zoneId) {
      pieceCount += 1;
    }
  }
  return { pieceCount };
}

/**
 * Whether a piece should be rendered: its floor must be visible AND, when it is
 * assigned to a zone, that zone must not be hidden. A piece with no zone is
 * visible whenever its floor is; an unknown floor or zone does not hide it
 * beyond what the floor rule already says (an unknown floor hides the piece).
 */
export function isPieceVisible(piece: PlacedPiece, project: Project): boolean {
  if (floorById(project, piece.floorId)?.visible !== true) {
    return false;
  }
  return !isZoneHidden(project, piece.zoneId);
}
