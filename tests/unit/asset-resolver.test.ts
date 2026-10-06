import { describe, expect, it } from 'vitest';
import { DATASET, createProxyAssetResolver, UNKNOWN_ASSET_DIMENSIONS } from '@/data';

describe('ProxyAssetResolver', () => {
  it('resolves a known asset to a box descriptor with the declared dimensions', async () => {
    const resolver = createProxyAssetResolver(DATASET);
    const descriptor = await resolver.resolve('asset.wall');
    expect(descriptor.kind).toBe('box');
    expect(descriptor.id).toBe('asset.wall');
    expect(descriptor.dimensions).toEqual({ width: 6.0, height: 4.25, depth: 0.5 });
  });

  it('returns a fallback box for an unknown asset without throwing', async () => {
    const resolver = createProxyAssetResolver(DATASET);
    await expect(resolver.resolve('asset.does.not.exist')).resolves.toMatchObject({
      id: 'asset.does.not.exist',
      kind: 'box',
      dimensions: UNKNOWN_ASSET_DIMENSIONS,
    });
  });

  it('resolveSync returns a descriptor for a known asset', () => {
    const resolver = createProxyAssetResolver(DATASET);
    const descriptor = resolver.resolveSync('asset.pillar');
    expect(descriptor).toBeDefined();
    expect(descriptor?.dimensions).toEqual({ width: 0.5, height: 4.25, depth: 0.5 });
  });

  it('resolveSync returns undefined for an unknown asset', () => {
    const resolver = createProxyAssetResolver(DATASET);
    expect(resolver.resolveSync('asset.does.not.exist')).toBeUndefined();
  });

  it('caches resolved descriptors and returns a stable reference', async () => {
    const resolver = createProxyAssetResolver(DATASET);
    const first = await resolver.resolve('asset.wall');
    const second = await resolver.resolve('asset.wall');
    expect(second).toBe(first);
    expect(resolver.resolveSync('asset.wall')).toBe(first);
  });

  it('caches fallback descriptors too', async () => {
    const resolver = createProxyAssetResolver(DATASET);
    const first = await resolver.resolve('asset.does.not.exist');
    const second = await resolver.resolve('asset.does.not.exist');
    expect(second).toBe(first);
  });
});
