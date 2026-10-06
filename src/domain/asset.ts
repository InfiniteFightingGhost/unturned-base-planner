import { z } from 'zod';
import { PieceDimensionsSchema, type PieceDimensions } from './piece-definition';

/**
 * The asset seam: pure data describing how a piece definition maps onto a
 * renderable asset. This module never imports three.js; it only defines the
 * contract implemented by the engine-side resolver.
 */

export const AssetRefSchema = z.object({
  assetId: z.string(),
  fallback: z.enum(['box', 'prism', 'hidden']).default('box'),
});

export type AssetRef = z.infer<typeof AssetRefSchema>;

export const AssetDescriptorSchema = z.object({
  id: z.string(),
  kind: z.enum(['box', 'prism', 'model']),
  dimensions: PieceDimensionsSchema,
  materialKey: z.string().optional(),
  modelId: z.string().optional(),
});

export type AssetDescriptor = z.infer<typeof AssetDescriptorSchema>;

/**
 * Resolves asset ids to descriptors. Implementations live in the engine layer;
 * the domain only depends on this interface.
 */
export interface AssetResolver {
  resolve(assetId: string): Promise<AssetDescriptor>;
  resolveSync?(assetId: string): AssetDescriptor | undefined;
}

/**
 * Graceful fallback used when an asset cannot be resolved: a plain box matching
 * the piece's declared dimensions. Never throws.
 */
export function fallbackDescriptor(ref: AssetRef, dimensions: PieceDimensions): AssetDescriptor {
  return {
    id: ref.assetId,
    kind: 'box',
    dimensions,
  };
}
