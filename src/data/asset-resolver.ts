import { fallbackDescriptor } from '@/domain';
import type { AssetDescriptor, AssetResolver, PieceDimensions } from '@/domain';
import type { BuildDataset } from './dataset';

/**
 * Dimensions used when an asset id is unknown to the dataset. A unit box keeps
 * the renderer safe without inventing a size.
 */
export const UNKNOWN_ASSET_DIMENSIONS: PieceDimensions = { width: 1, height: 1, depth: 1 };

/**
 * Resolves asset ids to proxy box descriptors using the dimensions declared by
 * the matching piece definitions. Asset ids are shared by every tier of a piece
 * type (e.g. `asset.wall`), whose dimensions are identical by construction.
 *
 * `resolve` is async and never throws: unknown ids receive a `fallbackDescriptor`
 * box. Results are memoized so repeated calls during render are cheap and return
 * a stable reference.
 */
export class ProxyAssetResolver implements AssetResolver {
  private readonly cache = new Map<string, AssetDescriptor>();
  private readonly dimensionsByAssetId = new Map<string, PieceDimensions>();

  constructor(dataset: BuildDataset) {
    for (const definition of dataset.definitions) {
      const assetId = definition.model.assetId;
      if (!this.dimensionsByAssetId.has(assetId)) {
        this.dimensionsByAssetId.set(assetId, { ...definition.dimensions });
      }
    }
  }

  async resolve(assetId: string): Promise<AssetDescriptor> {
    const cached = this.cache.get(assetId);
    if (cached !== undefined) {
      return cached;
    }
    const descriptor = this.build(assetId);
    this.cache.set(assetId, descriptor);
    return descriptor;
  }

  resolveSync(assetId: string): AssetDescriptor | undefined {
    const cached = this.cache.get(assetId);
    if (cached !== undefined) {
      return cached;
    }
    const dimensions = this.dimensionsByAssetId.get(assetId);
    if (dimensions === undefined) {
      return undefined;
    }
    const descriptor: AssetDescriptor = {
      id: assetId,
      kind: 'box',
      dimensions: { ...dimensions },
    };
    this.cache.set(assetId, descriptor);
    return descriptor;
  }

  private build(assetId: string): AssetDescriptor {
    const dimensions = this.dimensionsByAssetId.get(assetId);
    if (dimensions === undefined) {
      return fallbackDescriptor({ assetId, fallback: 'box' }, { ...UNKNOWN_ASSET_DIMENSIONS });
    }
    return { id: assetId, kind: 'box', dimensions: { ...dimensions } };
  }
}

export function createProxyAssetResolver(dataset: BuildDataset): ProxyAssetResolver {
  return new ProxyAssetResolver(dataset);
}
