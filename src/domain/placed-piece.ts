import { z } from 'zod';
import { IdSchema, createId } from './ids';
import {
  DEFAULT_SCALE,
  Vec3Schema,
  normalizeVec3,
  zeroVec3,
  type Vec3Tuple,
} from './primitives';
import type { PieceDefinition } from './piece-definition';

/**
 * A placed piece is a definition applied to a concrete transform inside a
 * specific floor (and optionally a zone), together with its build progress.
 */

export const BuildStateSchema = z.enum(['planned', 'collected', 'built']).default('planned');

export type BuildState = z.infer<typeof BuildStateSchema>;

export const PlacedPieceMetadataSchema = z.object({
  tags: z.array(z.string()).default([]),
  note: z.string().optional(),
});

export type PlacedPieceMetadata = z.infer<typeof PlacedPieceMetadataSchema>;

export const PlacedPieceSchema = z.object({
  id: IdSchema,
  definitionId: IdSchema,
  position: Vec3Schema,
  rotation: Vec3Schema,
  scale: Vec3Schema.default([1, 1, 1]),
  floorId: IdSchema,
  zoneId: IdSchema.nullable().default(null),
  buildState: BuildStateSchema,
  metadata: PlacedPieceMetadataSchema.default({ tags: [] }),
});

export type PlacedPiece = z.infer<typeof PlacedPieceSchema>;

/**
 * Validate that a placed piece points at known entities.
 *
 * `definitions` is required; floor and zone identifier sets are optional and,
 * when supplied, are validated too. Returns human-readable error messages (an
 * empty array means valid).
 */
export function validatePlacedPieceReferences(
  piece: PlacedPiece,
  definitions: ReadonlyMap<string, PieceDefinition>,
  floorIds?: ReadonlySet<string>,
  zoneIds?: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  if (!definitions.has(piece.definitionId)) {
    errors.push(`Unknown piece definition "${piece.definitionId}"`);
  }
  if (floorIds !== undefined && !floorIds.has(piece.floorId)) {
    errors.push(`Unknown floor "${piece.floorId}"`);
  }
  if (piece.zoneId !== null && zoneIds !== undefined && !zoneIds.has(piece.zoneId)) {
    errors.push(`Unknown zone "${piece.zoneId}"`);
  }
  return errors;
}

/** Throw when a placed piece references unknown entities. */
export function assertValidPlacedPiece(
  piece: PlacedPiece,
  definitions: ReadonlyMap<string, PieceDefinition>,
  floorIds?: ReadonlySet<string>,
  zoneIds?: ReadonlySet<string>,
): void {
  const errors = validatePlacedPieceReferences(piece, definitions, floorIds, zoneIds);
  if (errors.length > 0) {
    throw new Error(`Invalid placed piece "${piece.id}": ${errors.join('; ')}`);
  }
}

/**
 * Canonicalize a piece for deterministic serialization: round transform
 * components onto the fixed grid and snap `-0` to `0`. Tag order is preserved
 * because it is user-visible metadata, not a numeric artifact.
 */
export function canonicalizePlacedPiece(piece: PlacedPiece): PlacedPiece {
  return {
    ...piece,
    position: normalizeVec3(piece.position),
    rotation: normalizeVec3(piece.rotation),
    scale: normalizeVec3(piece.scale),
  };
}

/** Options accepted by `planPiece`. */
export interface PlanPieceOptions {
  id?: string;
  position: Vec3Tuple;
  rotation?: Vec3Tuple;
  scale?: Vec3Tuple;
  floorId: string;
  zoneId?: string | null;
  buildState?: BuildState;
  metadata?: { tags?: string[]; note?: string };
}

/**
 * Factory for a piece that has NOT been built yet: the definition supplies the
 * identity, the caller supplies the placement. Defaults are applied and the
 * result is canonicalized.
 */
export function planPiece(def: PieceDefinition, opts: PlanPieceOptions): PlacedPiece {
  const note = opts.metadata?.note;
  const candidate: unknown = {
    id: opts.id ?? createId('piece'),
    definitionId: def.id,
    position: opts.position,
    rotation: opts.rotation ?? zeroVec3(),
    scale: opts.scale ?? [DEFAULT_SCALE, DEFAULT_SCALE, DEFAULT_SCALE],
    floorId: opts.floorId,
    zoneId: opts.zoneId ?? null,
    buildState: opts.buildState ?? 'planned',
    metadata: {
      tags: opts.metadata?.tags ?? [],
      ...(note !== undefined ? { note } : {}),
    },
  };
  return canonicalizePlacedPiece(PlacedPieceSchema.parse(candidate));
}
