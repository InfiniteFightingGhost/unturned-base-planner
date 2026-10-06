import { z } from 'zod';
import { IdSchema } from './ids';
import { Vec3Schema } from './primitives';

/**
 * Piece definitions describe WHAT a buildable part is, independent of whether
 * or where it has been placed. Definitions are data: no editor state, no
 * transform, no floor assignment lives here.
 */

export const PieceCategorySchema = z.enum([
  'foundation',
  'floor',
  'wall',
  'window',
  'doorway',
  'door',
  'pillar',
  'post',
  'ramp',
  'stair',
  'roof',
  'roof_variant',
  'railing',
  'fence',
  'decorative',
  'defensive',
]);

export type PieceCategory = z.infer<typeof PieceCategorySchema>;

export const PieceDimensionsSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  depth: z.number().positive(),
});

export type PieceDimensions = z.infer<typeof PieceDimensionsSchema>;

export const SnapPointSchema = z.object({
  id: IdSchema,
  type: z.string(),
  position: Vec3Schema,
  rotation: Vec3Schema.optional(),
});

export type SnapPoint = z.infer<typeof SnapPointSchema>;

export const VariantRefSchema = z.object({
  id: IdSchema,
  name: z.string(),
  definitionId: IdSchema,
});

export type VariantRef = z.infer<typeof VariantRefSchema>;

export const CollisionSchema = z.object({
  enabled: z.boolean().default(true),
  shape: z.enum(['box', 'none']).default('box'),
});

export type Collision = z.infer<typeof CollisionSchema>;

export const PieceModelSchema = z.object({
  assetId: z.string(),
  fallback: z.enum(['box', 'prism', 'hidden']).default('box'),
});

export type PieceModel = z.infer<typeof PieceModelSchema>;

export const DEFAULT_ALLOWED_ROTATIONS: readonly number[] = [0, 90, 180, 270];

export const PieceDefinitionSchema = z.object({
  id: IdSchema,
  name: z.string(),
  category: PieceCategorySchema,
  dimensions: PieceDimensionsSchema,
  model: PieceModelSchema,
  variants: z.array(VariantRefSchema).default([]),
  snapPoints: z.array(SnapPointSchema).default([]),
  allowedRotations: z.array(z.number()).default([...DEFAULT_ALLOWED_ROTATIONS]),
  collision: CollisionSchema.default({ enabled: true, shape: 'box' }),
  resourceRecipe: z.string(),
});

export type PieceDefinition = z.infer<typeof PieceDefinitionSchema>;

function normalizeDegrees(degrees: number): number {
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * The deduplicated, ascending list of legal rotation angles (in degrees) for a
 * definition. Values are normalized into `[0, 360)` so `450` and `-90` collapse
 * onto `90` and `270` respectively.
 */
export function getRotationCandidates(def: PieceDefinition): number[] {
  const normalized = def.allowedRotations.map(normalizeDegrees);
  const unique = new Set(normalized);
  return [...unique].sort((a, b) => a - b);
}
