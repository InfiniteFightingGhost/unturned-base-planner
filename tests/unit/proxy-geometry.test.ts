import { afterEach, describe, expect, it } from 'vitest';
import { Box3, MeshBasicMaterial, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { PieceCategorySchema } from '@/domain';
import type { PieceCategory, PieceDimensions } from '@/domain';
import { DATASET } from '@/data';
import { disposeGeometryCache, pieceProxyGeometry } from '@/engine/rendering/proxyGeometry';
import { PieceBatch } from '@/engine/rendering/PieceBatch';
import type { BatchGeometry } from '@/engine/rendering/PieceBatch';

const CATEGORIES: readonly PieceCategory[] = PieceCategorySchema.options;

const SAMPLE_DIMENSIONS: PieceDimensions = { width: 2, height: 3, depth: 0.4 };

function boundingSize(geometry: BufferGeometry): Vector3 {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new Box3();
  return box.getSize(new Vector3());
}

function boundingCenter(geometry: BufferGeometry): Vector3 {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new Box3();
  return box.getCenter(new Vector3());
}

function expectSize(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

/**
 * Assert a geometry is non-empty, base-centered (`min.y === 0`, centered X/Z)
 * and roughly the declared size. `loose` tolerates the rounded/tapered shapes
 * (spikes, rounded boxes) whose bounding box intentionally under-fills a corner
 * of the declared box.
 */
function assertBaseCentered(
  geometry: BufferGeometry,
  dimensions: PieceDimensions,
  loose = false,
): void {
  const size = boundingSize(geometry);
  const center = boundingCenter(geometry);
  const toleranceFor = (value: number): number => (loose ? Math.max(0.5, value * 0.6) : 0.05);

  expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
  expectSize(size.x, dimensions.width, toleranceFor(dimensions.width));
  expectSize(size.y, dimensions.height, toleranceFor(dimensions.height));
  expectSize(size.z, dimensions.depth, toleranceFor(dimensions.depth));
  expect(geometry.boundingBox?.min.y ?? Number.NaN).toBeCloseTo(0, 6);
  expect(Math.abs(center.x)).toBeLessThanOrEqual(toleranceFor(dimensions.width));
  expect(Math.abs(center.z)).toBeLessThanOrEqual(toleranceFor(dimensions.depth));
}

afterEach(() => {
  disposeGeometryCache();
});

describe('pieceProxyGeometry', () => {
  it('builds a non-empty, base-centered geometry for every category', () => {
    for (const category of CATEGORIES) {
      const geometry = pieceProxyGeometry({
        assetId: `asset.test.${category}`,
        category,
        dimensions: SAMPLE_DIMENSIONS,
      });
      assertBaseCentered(geometry, SAMPLE_DIMENSIONS);
    }
  });

  it('builds distinct geometries for distinct shape families', () => {
    const categories: readonly PieceCategory[] = ['wall', 'window', 'ramp', 'stair', 'pillar'];
    const signatures = categories.map((category) => {
      const geometry = pieceProxyGeometry({
        assetId: `asset.shape.${category}`,
        category,
        dimensions: SAMPLE_DIMENSIONS,
      });
      const position = geometry.getAttribute('position');
      return `${position.count}:${geometry.index?.count ?? 0}`;
    });
    expect(new Set(signatures).size).toBe(categories.length);
  });

  it('uses the asset key so assets in one category can differ in shape', () => {
    const crate = pieceProxyGeometry({
      assetId: 'asset.crate',
      category: 'decorative',
      dimensions: { width: 1.5, height: 1.5, depth: 1.5 },
    });
    const sandbag = pieceProxyGeometry({
      assetId: 'asset.sandbag',
      category: 'defensive',
      dimensions: { width: 1.5, height: 0.75, depth: 1 },
    });
    expect(boundingSize(crate).x).toBeCloseTo(1.5, 1);
    expect(boundingSize(sandbag).y).toBeCloseTo(0.75, 1);
    expect(crate.getAttribute('position').count).not.toBe(
      sandbag.getAttribute('position').count,
    );
  });

  it('produces base-centered geometry for every dataset definition', () => {
    for (const definition of DATASET.definitions) {
      const geometry = pieceProxyGeometry({
        assetId: definition.model.assetId,
        category: definition.category,
        dimensions: definition.dimensions,
      });
      assertBaseCentered(geometry, definition.dimensions, true);
    }
  });

  it('caches one geometry per asset id', () => {
    const params = {
      assetId: 'asset.cache.check',
      category: 'wall' as const,
      dimensions: SAMPLE_DIMENSIONS,
    };
    const first = pieceProxyGeometry(params);
    const second = pieceProxyGeometry(params);
    expect(second).toBe(first);
  });

  it('keeps every geometry indexed and attribute-compatible for batching', () => {
    for (const definition of DATASET.definitions) {
      const geometry = pieceProxyGeometry({
        assetId: definition.model.assetId,
        category: definition.category,
        dimensions: definition.dimensions,
      });
      expect(geometry.index).not.toBeNull();
      expect(geometry.getAttribute('position')).toBeDefined();
      expect(geometry.getAttribute('normal')).toBeDefined();
      expect(geometry.getAttribute('uv')).toBeDefined();
    }
  });

  it('is accepted as one BatchedMesh, matching how a floor is rendered', () => {
    const entries: BatchGeometry[] = [];
    const seen = new Set<string>();
    for (const definition of DATASET.definitions) {
      const assetId = definition.model.assetId;
      if (seen.has(assetId)) {
        continue;
      }
      seen.add(assetId);
      entries.push({
        definitionId: assetId,
        geometry: pieceProxyGeometry({
          assetId,
          category: definition.category,
          dimensions: definition.dimensions,
        }),
      });
    }

    const material = new MeshBasicMaterial();
    const batch = new PieceBatch(entries, material, { maxInstances: 8 });
    try {
      expect(batch.geometryCount).toBe(entries.length);
    } finally {
      batch.dispose();
      material.dispose();
    }
  });
});