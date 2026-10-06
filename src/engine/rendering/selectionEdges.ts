/**
 * Selection edges: a single `LineSegments` overlay that outlines the currently
 * selected pieces of one floor.
 *
 * Why a separate object instead of per-instance meshes
 * ----------------------------------------------------
 * A `BatchedMesh` can only draw triangles, so crisp CAD edges cannot be a
 * material variant of the batch. Instead we keep ONE line object per floor and
 * rebuild its vertex buffer only when the selection or the pieces change (never
 * per frame). The source edge lists are memoized per unique proxy geometry, and
 * only selected pieces contribute, so the overlay stays cheap.
 */

import {
  BufferGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Vector3,
} from 'three';
import type { Matrix4 } from 'three';

/** One selected instance: a shared proxy geometry plus its world matrix. */
export interface SelectionEdgeItem {
  readonly geometry: BufferGeometry;
  readonly matrix: Matrix4;
}

const DEFAULT_EDGE_COLOR = 0xbfe0ff;

export class SelectionEdges {
  readonly object: LineSegments;

  private readonly material: LineBasicMaterial;
  private readonly edgesByGeometry = new WeakMap<BufferGeometry, EdgesGeometry>();
  private readonly scratch = new Vector3();

  constructor(color: number = DEFAULT_EDGE_COLOR) {
    this.material = new LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    this.object = new LineSegments(new BufferGeometry(), this.material);
    this.object.frustumCulled = false;
  }

  private edgesFor(geometry: BufferGeometry): EdgesGeometry {
    const cached = this.edgesByGeometry.get(geometry);
    if (cached !== undefined) {
      return cached;
    }
    const edges = new EdgesGeometry(geometry, 30);
    this.edgesByGeometry.set(geometry, edges);
    return edges;
  }

  /** Rebuild the outline for the given selected instances. */
  update(items: readonly SelectionEdgeItem[]): void {
    const positions: number[] = [];
    for (const item of items) {
      const source = this.edgesFor(item.geometry).getAttribute('position');
      for (let index = 0; index < source.count; index += 1) {
        this.scratch.fromBufferAttribute(source, index).applyMatrix4(item.matrix);
        positions.push(this.scratch.x, this.scratch.y, this.scratch.z);
      }
    }

    const previous = this.object.geometry;
    const next = new BufferGeometry();
    next.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.object.geometry = next;
    previous.dispose();
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.material.dispose();
  }
}