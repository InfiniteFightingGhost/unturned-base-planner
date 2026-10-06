import { z } from 'zod';
import { IdSchema } from './ids';
import { Vec3Schema, normalizeVec3 } from './primitives';
import { BuildStateSchema, PlacedPieceMetadataSchema } from './placed-piece';

/**
 * Prefabs (P21): reusable, identity-free groups of pieces.
 *
 * A `PrefabPiece` is a placement WITHOUT identity or ownership: it has no id,
 * no floor and no zone. Its position is stored RELATIVE to the prefab origin so
 * a prefab can be stamped anywhere. Only the placement fields that define the
 * shape survive; instantiating a prefab mints fresh ids and assigns the target
 * floor at stamp time.
 */

export const PrefabPieceSchema = z.object({
  definitionId: IdSchema,
  position: Vec3Schema,
  rotation: Vec3Schema,
  scale: Vec3Schema.default([1, 1, 1]),
  buildState: BuildStateSchema,
  metadata: PlacedPieceMetadataSchema.default({ tags: [] }),
});

export type PrefabPiece = z.infer<typeof PrefabPieceSchema>;

export const PrefabSchema = z.object({
  id: IdSchema,
  name: z.string(),
  createdAt: z.iso.datetime(),
  origin: Vec3Schema,
  pieces: z.array(PrefabPieceSchema).default([]),
});

export type Prefab = z.infer<typeof PrefabSchema>;

/**
 * Canonicalize a stored prefab piece for deterministic serialization. Mirrors
 * `canonicalizePlacedPiece`: transform components are rounded onto the fixed
 * grid and `-0` is snapped to `0`.
 */
export function canonicalizePrefabPiece(piece: PrefabPiece): PrefabPiece {
  return {
    ...piece,
    position: normalizeVec3(piece.position),
    rotation: normalizeVec3(piece.rotation),
    scale: normalizeVec3(piece.scale),
  };
}

/**
 * Canonicalize a prefab (origin + every stored piece) and return a deep copy so
 * serialization is byte-stable and no aliases leak to the caller.
 */
export function canonicalizePrefab(prefab: Prefab): Prefab {
  return {
    ...prefab,
    origin: normalizeVec3(prefab.origin),
    pieces: prefab.pieces.map(canonicalizePrefabPiece),
  };
}
