/**
 * Pure prefab operations (P21).
 *
 * A prefab stores pieces relative to its own origin so it can be stamped
 * anywhere. These helpers are plain data transformations — no store, clock or
 * module state — which keeps them node-safe, unit-testable and deterministic
 * when an explicit `idFactory` / `createdAt` is supplied.
 *
 * Deep-clone guarantee: `prefabFromPieces` copies every transform and metadata,
 * and `instantiatePrefab` builds fresh pieces from the stored copies. Mutating
 * either side afterwards can never affect the other.
 */

import {
  PlacedPieceSchema,
  PrefabSchema,
  canonicalizePlacedPiece,
  canonicalizePrefab,
  createId,
  vec3,
  zeroVec3,
} from '@/domain';
import type { PlacedPiece, Prefab, Vec3 } from '@/domain';

type PieceMetadata = PlacedPiece['metadata'];

/** Deep-clone piece metadata so no tag array or note aliases the source. */
function cloneMetadata(metadata: PieceMetadata): PieceMetadata {
  return { ...metadata, tags: [...metadata.tags] };
}

/** Axis-aligned minimum corner of a non-empty set of placements. */
function minCorner(pieces: readonly PlacedPiece[]): Vec3 {
  let x = Infinity;
  let y = Infinity;
  let z = Infinity;
  for (const piece of pieces) {
    if (piece.position[0] < x) x = piece.position[0];
    if (piece.position[1] < y) y = piece.position[1];
    if (piece.position[2] < z) z = piece.position[2];
  }
  return [x, y, z];
}

/**
 * Capture a selection as a prefab.
 *
 * The origin is the minimum corner (min x/y/z) of the selection and each stored
 * piece position is the absolute position minus that origin. Ordering is
 * deterministic (sorted by piece id). An empty selection yields an empty prefab
 * at the world origin, which the editor UI never produces (its save action is
 * disabled), but keeps the function total.
 */
export function prefabFromPieces(
  pieces: readonly PlacedPiece[],
  name: string,
  idFactory: () => string = () => createId('prefab'),
  createdAt: string = new Date().toISOString(),
): Prefab {
  const ordered = [...pieces].sort((a, b) => a.id.localeCompare(b.id));
  const origin: Vec3 = ordered.length === 0 ? zeroVec3() : minCorner(ordered);
  const candidate: unknown = {
    id: idFactory(),
    name,
    createdAt,
    origin,
    pieces: ordered.map((piece) => ({
      definitionId: piece.definitionId,
      position: vec3(
        piece.position[0] - origin[0],
        piece.position[1] - origin[1],
        piece.position[2] - origin[2],
      ),
      rotation: vec3(piece.rotation[0], piece.rotation[1], piece.rotation[2]),
      scale: vec3(piece.scale[0], piece.scale[1], piece.scale[2]),
      buildState: piece.buildState,
      metadata: cloneMetadata(piece.metadata),
    })),
  };
  return canonicalizePrefab(PrefabSchema.parse(candidate));
}

/**
 * Stamp a prefab into the document as NEW pieces.
 *
 * Every piece receives a fresh id, its absolute position is `position + stored
 * relative`, and the target `floorId` is assigned while `zoneId` is cleared and
 * `buildState` / metadata are copied. Returns plain pieces; the caller adds them
 * through a single command.
 */
export function instantiatePrefab(
  prefab: Prefab,
  position: Vec3,
  floorId: string,
  idFactory: () => string = () => createId('piece'),
): PlacedPiece[] {
  return prefab.pieces.map((piece) =>
    canonicalizePlacedPiece(
      PlacedPieceSchema.parse({
        id: idFactory(),
        definitionId: piece.definitionId,
        position: vec3(
          position[0] + piece.position[0],
          position[1] + piece.position[1],
          position[2] + piece.position[2],
        ),
        rotation: vec3(piece.rotation[0], piece.rotation[1], piece.rotation[2]),
        scale: vec3(piece.scale[0], piece.scale[1], piece.scale[2]),
        floorId,
        zoneId: null,
        buildState: piece.buildState,
        metadata: cloneMetadata(piece.metadata),
      }),
    ),
  );
}

/**
 * Deep-clone a prefab into independent tuples/objects. Commands use this so a
 * captured snapshot can never alias a live document or the caller's object.
 */
export function clonePrefab(prefab: Prefab): Prefab {
  return {
    ...prefab,
    origin: vec3(prefab.origin[0], prefab.origin[1], prefab.origin[2]),
    pieces: prefab.pieces.map((piece) => ({
      ...piece,
      position: vec3(piece.position[0], piece.position[1], piece.position[2]),
      rotation: vec3(piece.rotation[0], piece.rotation[1], piece.rotation[2]),
      scale: vec3(piece.scale[0], piece.scale[1], piece.scale[2]),
      metadata: cloneMetadata(piece.metadata),
    })),
  };
}
