/**
 * Proxy geometry factory: turns a piece definition's category, dimensions and
 * asset id into a renderable `THREE.BufferGeometry` with no external model files
 * (fully local-first).
 *
 * Pivot convention
 * ----------------
 * Every geometry is authored with its origin at the BASE CENTER of the piece:
 * the shape is built centered on the origin and then translated up by
 * `height / 2`, so it occupies `y in [0, height]` with `x`/`z` centered. This
 * matches the placement math, which treats a placed piece's `position` as the
 * point where the piece meets the ground, so the batched transform only needs
 * the plain position + rotation + scale.
 *
 * Shape selection
 * ---------------
 * The silhouette is chosen from the asset key (e.g. `asset.wall` -> `wall`) with
 * the piece `category` as a fallback, so assets that share a category but differ
 * in shape (`crate` vs `sandbag`, `window` vs `doorway`) still read distinctly.
 * Dimensions always come from the definition.
 *
 * `BatchedMesh` constraints
 * -------------------------
 * Every geometry added to one batch must consistently carry the same attributes
 * and the same indexed/non-indexed state. Boxes, cylinders and spheres are
 * indexed; `ExtrudeGeometry` is not, so extruded shapes are run through
 * `mergeVertices` to produce an indexed buffer before they are cached.
 *
 * Caching
 * -------
 * Descriptors are resolved per asset id and the resulting geometry is memoized,
 * so a single buffer is shared by every instance of that asset in the
 * `BatchedMesh` (a hard requirement of `BatchedMesh.addGeometry`). Call
 * `disposeGeometryCache()` to release all GPU buffers on teardown.
 */

import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Path,
  Shape,
  SphereGeometry,
} from 'three';
import type { BufferGeometry } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PieceCategory, PieceDimensions } from '@/domain';

/** Inputs required to author one proxy geometry. */
export interface PieceGeometryParams {
  /** Asset id from the definition's `model.assetId` (e.g. `asset.wall`). */
  readonly assetId: string;
  /** Semantic category used as a fallback when the asset key is unknown. */
  readonly category: PieceCategory;
  /** Metres, `width x height x depth`. */
  readonly dimensions: PieceDimensions;
}

/** Recognizable silhouette families authored by this factory. */
type ShapeKind =
  | 'slab'
  | 'panel'
  | 'frame'
  | 'column'
  | 'wedge'
  | 'stair'
  | 'rail'
  | 'box'
  | 'roundedBox'
  | 'spikes'
  | 'ladder';

const ASSET_KEY_PREFIX = 'asset.';

const SHAPE_BY_ASSET_KEY: Readonly<Record<string, ShapeKind>> = {
  floor: 'slab',
  tri_floor: 'slab',
  hole: 'slab',
  roof: 'slab',
  tri_roof: 'slab',
  wall: 'panel',
  ramp_wall: 'panel',
  window: 'frame',
  doorway: 'frame',
  garage: 'frame',
  doorframe: 'frame',
  garageframe: 'frame',
  door: 'panel',
  doubledoor: 'panel',
  gate: 'panel',
  hatch: 'slab',
  shutter: 'panel',
  barricade: 'panel',
  fortification: 'panel',
  pillar: 'column',
  post: 'column',
  ramp: 'wedge',
  stairs: 'stair',
  rampart: 'rail',
  fence: 'rail',
  crate: 'box',
  sandbag: 'roundedBox',
  spikes: 'spikes',
  caltrop: 'spikes',
  ladder: 'ladder',
};

const SHAPE_BY_CATEGORY: Readonly<Record<PieceCategory, ShapeKind>> = {
  foundation: 'slab',
  floor: 'slab',
  wall: 'panel',
  window: 'frame',
  doorway: 'frame',
  door: 'panel',
  pillar: 'column',
  post: 'column',
  ramp: 'wedge',
  stair: 'stair',
  roof: 'slab',
  roof_variant: 'slab',
  railing: 'rail',
  fence: 'rail',
  decorative: 'box',
  defensive: 'panel',
};

const geometryCache = new Map<string, BufferGeometry>();

function assetKey(assetId: string): string {
  return assetId.startsWith(ASSET_KEY_PREFIX)
    ? assetId.slice(ASSET_KEY_PREFIX.length)
    : assetId;
}

function resolveShapeKind(assetId: string, category: PieceCategory): ShapeKind {
  return SHAPE_BY_ASSET_KEY[assetKey(assetId)] ?? SHAPE_BY_CATEGORY[category];
}

/** Merge indexed parts, failing loudly rather than returning a partial mesh. */
function mergeOrThrow(parts: readonly BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries([...parts], false);
  if (merged === null) {
    throw new Error('proxyGeometry: failed to merge geometry parts.');
  }
  return merged;
}

/** Index an extruded shape so it is compatible with the box/cylinder batch. */
function indexed(geometry: BufferGeometry): BufferGeometry {
  return mergeVertices(geometry);
}

function buildSlab(dimensions: PieceDimensions): BufferGeometry {
  const { width, height, depth } = dimensions;
  return new BoxGeometry(width, height, depth);
}

function buildPanel(dimensions: PieceDimensions): BufferGeometry {
  const { width, height, depth } = dimensions;
  return new BoxGeometry(width, height, depth);
}

/** A rectangular panel pierced by a centered rectangular opening. */
function buildFrame(dimensions: PieceDimensions): BufferGeometry {
  const { width, height, depth } = dimensions;
  const border = Math.min(width, height) * 0.16;
  const holeWidth = Math.max(width - border * 2, width * 0.2);
  const holeHeight = Math.max(height - border * 2, height * 0.2);

  const shape = new Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(-width / 2, height / 2);
  shape.closePath();

  const hole = new Path();
  hole.moveTo(-holeWidth / 2, -holeHeight / 2);
  hole.lineTo(-holeWidth / 2, holeHeight / 2);
  hole.lineTo(holeWidth / 2, holeHeight / 2);
  hole.lineTo(holeWidth / 2, -holeHeight / 2);
  hole.closePath();
  shape.holes.push(hole);

  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, -depth / 2);
  return indexed(geometry);
}

/** A square column with a subtly wider base and cap plate. */
function buildColumn(dimensions: PieceDimensions): BufferGeometry {
  const { width, height, depth } = dimensions;
  const plateHeight = Math.min(height * 0.08, 0.12);
  const shaftHeight = Math.max(height - plateHeight * 2, height * 0.2);

  const base = new BoxGeometry(width, plateHeight, depth);
  base.translate(0, -height / 2 + plateHeight / 2, 0);

  const cap = new BoxGeometry(width, plateHeight, depth);
  cap.translate(0, height / 2 - plateHeight / 2, 0);

  const shaft = new BoxGeometry(width * 0.78, shaftHeight, depth * 0.78);

  return mergeOrThrow([base, cap, shaft]);
}

/** A right-triangle wedge: flat on the floor, rising toward +X. */
function buildWedge(dimensions: PieceDimensions): BufferGeometry {
  const { width, height, depth } = dimensions;
  const shape = new Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, -depth / 2);
  return indexed(geometry);
}

/** A staircase built from merged step solids. */
function buildStair(dimensions: PieceDimensions): BufferGeometry {
  const { width, height, depth } = dimensions;
  const steps = 5;
  const stepWidth = width / steps;
  const stepHeight = height / steps;

  const parts: BufferGeometry[] = [];
  for (let index = 0; index < steps; index += 1) {
    const solidHeight = stepHeight * (index + 1);
    const step = new BoxGeometry(stepWidth, solidHeight, depth);
    step.translate(
      -width / 2 + stepWidth * (index + 0.5),
      -height / 2 + solidHeight / 2,
      0,
    );
    parts.push(step);
  }
  return mergeOrThrow(parts);
}

/** A low rail with a top beam and evenly spaced posts. */
function buildRail(dimensions: PieceDimensions): BufferGeometry {
  const { width, height, depth } = dimensions;
  const postWidth = Math.min(width * 0.1, 0.2);
  const beamHeight = Math.max(height * 0.22, 0.08);

  const parts: BufferGeometry[] = [];
  const beam = new BoxGeometry(width, beamHeight, depth);
  beam.translate(0, height / 2 - beamHeight / 2, 0);
  parts.push(beam);

  const postCenters = [-width / 2 + postWidth / 2, 0, width / 2 - postWidth / 2];
  for (const x of postCenters) {
    const post = new BoxGeometry(postWidth, height, depth);
    post.translate(x, 0, 0);
    parts.push(post);
  }
  return mergeOrThrow(parts);
}

function buildBox(dimensions: PieceDimensions): BufferGeometry {
  const { width, height, depth } = dimensions;
  return new BoxGeometry(width, height, depth);
}

/** A softened box: a unit sphere scaled to the piece's extents. */
function buildRoundedBox(dimensions: PieceDimensions): BufferGeometry {
  const { width, height, depth } = dimensions;
  const geometry = new SphereGeometry(0.5, 12, 8);
  geometry.scale(width, height, depth);
  return geometry;
}

/** A row of cones across the width, sized to fit the declared depth. */
function buildSpikes(dimensions: PieceDimensions): BufferGeometry {
  const { width, height, depth } = dimensions;
  const count = 5;
  const radius = Math.min(width / (2 * count), depth * 0.45);

  const parts: BufferGeometry[] = [];
  for (let index = 0; index < count; index += 1) {
    const cone = new CylinderGeometry(0, radius, height, 8, 1, false);
    cone.translate(-width / 2 + (width / count) * (index + 0.5), 0, 0);
    parts.push(cone);
  }
  return mergeOrThrow(parts);
}

/** Two side rails joined by rungs. */
function buildLadder(dimensions: PieceDimensions): BufferGeometry {
  const { width, height, depth } = dimensions;
  const railWidth = Math.min(width * 0.18, 0.12);
  const railOffset = width / 2 - railWidth / 2;

  const parts: BufferGeometry[] = [];
  for (const x of [-railOffset, railOffset]) {
    const rail = new BoxGeometry(railWidth, height, depth);
    rail.translate(x, 0, 0);
    parts.push(rail);
  }

  const rungs = 5;
  for (let index = 0; index < rungs; index += 1) {
    const rung = new BoxGeometry(width * 0.8, Math.min(height * 0.06, 0.08), depth * 0.7);
    rung.translate(0, -height / 2 + (height / (rungs + 1)) * (index + 1), 0);
    parts.push(rung);
  }
  return mergeOrThrow(parts);
}

function buildShape(kind: ShapeKind, dimensions: PieceDimensions): BufferGeometry {
  switch (kind) {
    case 'slab':
      return buildSlab(dimensions);
    case 'panel':
      return buildPanel(dimensions);
    case 'frame':
      return buildFrame(dimensions);
    case 'column':
      return buildColumn(dimensions);
    case 'wedge':
      return buildWedge(dimensions);
    case 'stair':
      return buildStair(dimensions);
    case 'rail':
      return buildRail(dimensions);
    case 'box':
      return buildBox(dimensions);
    case 'roundedBox':
      return buildRoundedBox(dimensions);
    case 'spikes':
      return buildSpikes(dimensions);
    case 'ladder':
      return buildLadder(dimensions);
  }
}

function buildGeometry(params: PieceGeometryParams): BufferGeometry {
  const kind = resolveShapeKind(params.assetId, params.category);
  const geometry = buildShape(kind, params.dimensions);
  geometry.translate(0, params.dimensions.height / 2, 0);
  return geometry;
}

/**
 * Resolve (and cache) the proxy geometry for a piece. The returned buffer is
 * owned by the module cache and must not be disposed by callers; use
 * `disposeGeometryCache()` instead.
 */
export function pieceProxyGeometry(params: PieceGeometryParams): BufferGeometry {
  const cached = geometryCache.get(params.assetId);
  if (cached !== undefined) {
    return cached;
  }
  const geometry = buildGeometry(params);
  geometryCache.set(params.assetId, geometry);
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