/**
 * Pure placement logic: turning a definition + cursor state into a candidate
 * `PlacedPiece`, snapping the cursor position, and detecting no-ops.
 *
 * Nothing here writes to a store. A placement preview can be recomputed on every
 * pointer move and discarded on Escape without leaving a trace — canceling is
 * simply dropping the candidate value.
 */

import { approxEqual, planPiece } from '@/domain';
import type { PieceDefinition, PlacedPiece, Vec3 } from '@/domain';
import { applySnap } from '@/engine';
import type { GridConfig } from '@/engine';

/**
 * Build the pending piece for a placement preview. The result references the
 * given definition and floor and is canonicalized by `planPiece`. It is NOT
 * inserted into the document; the caller turns it into an add command only once
 * the placement is committed.
 */
export function resolvePlacement(
  def: PieceDefinition,
  position: Vec3,
  rotationY: number,
  floorId: string,
): PlacedPiece {
  return planPiece(def, {
    position,
    rotation: [0, rotationY, 0],
    floorId,
  });
}

/**
 * Snap a cursor position to the grid. Delegates to the engine's `applySnap`,
 * which is a no-op when `snapEnabled` is false (or the step is non-positive) and
 * otherwise rounds to the step and the configured precision.
 */
export function snapPlacementPosition(position: Vec3, grid: GridConfig): Vec3 {
  const [x, y, z] = applySnap(position, grid);
  return [x, y, z];
}

/**
 * Whether `candidate` would leave the document semantically unchanged relative
 * to an `existing` piece. Compares identity and transform only; ids and metadata
 * are intentionally ignored, since a re-placement at the same spot is a no-op
 * regardless of which piece currently occupies it.
 */
export function placementIsNoop(existing: PlacedPiece, candidate: PlacedPiece): boolean {
  return (
    existing.definitionId === candidate.definitionId &&
    existing.floorId === candidate.floorId &&
    existing.zoneId === candidate.zoneId &&
    existing.buildState === candidate.buildState &&
    approxEqual(existing.position, candidate.position) &&
    approxEqual(existing.rotation, candidate.rotation) &&
    approxEqual(existing.scale, candidate.scale)
  );
}

/** Whether a candidate id already exists in the supplied document pieces. */
export function wouldCreateDuplicateId(
  existing: readonly PlacedPiece[],
  candidate: PlacedPiece,
): boolean {
  return existing.some((piece) => piece.id === candidate.id);
}
