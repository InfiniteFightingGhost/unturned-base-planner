/**
 * Proxy geometry factory: turns a domain `AssetDescriptor` into a renderable
 * `THREE.BufferGeometry` with no external model files (fully local-first).
 *
 * Pivot convention
 * ----------------
 * Every geometry is authored with its origin at the BASE CENTER of the piece,
 * i.e. the geometry is translated up by `height / 2`. This matches the placement
 * math, which treats a placed piece's `position` as the point where the piece
 * meets the ground, so the batched transform only needs the plain position +
 * rotation + scale.
 *
 * Caching
 * -------
 * Descriptors are resolved per asset id and the resulting geometry is memoized,
 * so a single buffer is shared by every instance of that asset in the
 * `BatchedMesh` (a hard requirement of `BatchedMesh.addGeometry`). Call
 * `disposeGeometryCache()` to release all GPU buffers on teardown.
 */

import { BoxGeometry, CylinderGeometry } from 'three';
import type { BufferGeometry } from 'three';
import type { AssetDescriptor } from '@/domain';

const geometryCache = new Map<string, BufferGeometry>();

const PRISM_RADIAL_SEGMENTS = 6;

function buildBox(descriptor: AssetDescriptor): BufferGeometry {
  const { width, height, depth } = descriptor.dimensions;
  const geometry = new BoxGeometry(width, height, depth);
  geometry.translate(0, height / 2, 0);
  return geometry;
}

/**
 * A prism is approximated by a low-segment cylinder scaled to the descriptor's
 * bounding box. A unit radius/height cylinder is scaled so the X/Z extents match
 * `width`/`depth` and the Y extent matches `height`, then lifted onto its base.
 */
function buildPrism(descriptor: AssetDescriptor): BufferGeometry {
  const { width, height, depth } = descriptor.dimensions;
  const geometry = new CylinderGeometry(1, 1, 1, PRISM_RADIAL_SEGMENTS, 1, false);
  geometry.scale(width / 2, height, depth / 2);
  geometry.translate(0, height / 2, 0);
  return geometry;
}

function buildGeometry(descriptor: AssetDescriptor): BufferGeometry {
  if (descriptor.kind === 'prism') {
    return buildPrism(descriptor);
  }
  // `model` has no local mesh source yet, so it falls back to its proxy box.
  return buildBox(descriptor);
}

/**
 * Resolve (and cache) the proxy geometry for a descriptor. The returned buffer is
 * owned by the module cache and must not be disposed by callers; use
 * `disposeGeometryCache()` instead.
 */
export function descriptorToGeometry(descriptor: AssetDescriptor): BufferGeometry {
  const cached = geometryCache.get(descriptor.id);
  if (cached !== undefined) {
    return cached;
  }
  const geometry = buildGeometry(descriptor);
  geometryCache.set(descriptor.id, geometry);
  return geometry;
}

/** Number of geometries currently held by the cache (diagnostics / tests). */
export function geometryCacheSize(): number {
  return geometryCache.size;
}

/** Dispose every cached geometry and clear the cache. Safe to call repeatedly. */
export function disposeGeometryCache(): void {
  for (const geometry of geometryCache.values()) {
    geometry.dispose();
  }
  geometryCache.clear();
}
