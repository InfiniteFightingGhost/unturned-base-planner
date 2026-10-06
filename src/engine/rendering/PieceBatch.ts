/**
 * `PieceBatch`: an imperative wrapper around `THREE.BatchedMesh`.
 *
 * Why a class instead of JSX
 * --------------------------
 * The hot path must never flow through React state. The field component keeps a
 * single `BatchedMesh` alive and mutates its instance matrices/colors directly in
 * response to transient store subscriptions; R3F only ever renders the immutable
 * `mesh` object via `<primitive>`. No per-piece React elements are created, so
 * thousands of pieces stay a single draw call.
 *
 * Capacity model (P53 follow-up: grow beyond the initial budget)
 * --------------------------------------------------------------
 * `BatchedMesh` allocates its vertex/index buffers up front and does not grow
 * them in-place. We size those buffers from the SUM of the unique geometries'
 * vertex/index counts plus a headroom factor (default 1.2x) so a modest number of
 * heavier meshes can be swapped in later. The instance budget is supplied by the
 * caller (`maxInstances`, default 4096). When `add` would exceed it, we throw a
 * clear, actionable error rather than silently dropping pieces; growing the batch
 * at runtime is tracked as a P53 follow-up.
 *
 * Id mapping
 * ----------
 * - `instanceByPiece: Map<pieceId, BatchedMesh instanceId>`
 * - `pieceByInstance: Int32Array` (instanceId -> slot, `-1` when free)
 * - `pieceIds: slot -> pieceId`
 * `pieceIdForBatch(batchId)` resolves a raycast's `batchId` back to a piece id.
 *
 * Culling (correctness-first)
 * ---------------------------
 * `BatchedMesh`'s per-object frustum culling derives each instance's bounds from
 * the geometry + instance matrix, but those per-geometry bounds are computed
 * lazily and are NOT invalidated by `setMatrixAt`. A piece that is moved can
 * therefore keep stale bounds and be culled while still on screen (the reported
 * "pieces disappear then reappear" bug). Correctness wins here: both
 * `frustumCulled` and `perObjectFrustumCulled` are disabled so every instance is
 * always submitted. The floor is still a single draw call, so the cost is
 * negligible. As defence in depth, `add` re-applies the instance's geometry id
 * with `setGeometryIdAt` after `addInstance`, which also covers slot reuse.
 */

import { BatchedMesh, Color, Matrix4, Quaternion, Vector3 } from 'three';
import type { BufferGeometry, Material } from 'three';
import type { PlacedPiece } from '@/domain';

/** One unique geometry, keyed by the asset id every placed piece resolves to. */
export interface BatchGeometry {
  readonly assetId: string;
  readonly geometry: BufferGeometry;
}

export interface PieceBatchOptions {
  /** Maximum simultaneous instances. Defaults to 4096. */
  readonly maxInstances?: number;
  /** Multiplier applied to the summed vertex counts. Defaults to 1.2. */
  readonly vertexHeadroom?: number;
  /** Multiplier applied to the summed index counts. Defaults to 1.2. */
  readonly indexHeadroom?: number;
  /**
   * Maps a piece's `definitionId` to its `model.assetId`. Defaults to identity,
   * which is convenient for tests whose pieces already carry an asset id.
   */
  readonly resolveAssetId?: (definitionId: string) => string | undefined;
  /** Tint applied to selected instances. Defaults to a blue accent. */
  readonly selectedColor?: number;
  /** Tint applied to every non-selected instance. Defaults to white. */
  readonly baseColor?: number;
  /**
   * Per-definition base tint. When supplied it overrides `baseColor` for
   * non-selected instances, which is how material tiers are differentiated
   * within a single floor material. Unknown definitions fall back to
   * `baseColor`.
   */
  readonly resolveBaseColor?: (definitionId: string) => number;
}

/** Selection-application mode, mirroring the editor's `SelectionMode`. */
export type BatchSelectionMode = 'replace' | 'add' | 'subtract' | 'toggle';

const DEFAULT_MAX_INSTANCES = 4096;
const DEFAULT_VERTEX_HEADROOM = 1.2;
const DEFAULT_INDEX_HEADROOM = 1.2;
const DEFAULT_SELECTED_COLOR = 0x5b9dff;
const DEFAULT_BASE_COLOR = 0xffffff;

// Module-scope scratch objects: zero allocation inside sync/update loops.
const Y_AXIS = /*@__PURE__*/ new Vector3(0, 1, 0);
const scratchMatrix = /*@__PURE__*/ new Matrix4();
const scratchQuaternion = /*@__PURE__*/ new Quaternion();
const scratchPosition = /*@__PURE__*/ new Vector3();
const scratchScale = /*@__PURE__*/ new Vector3();
const scratchColor = /*@__PURE__*/ new Color();

/**
 * Compose a placed piece's local transform (translation + Y rotation + scale)
 * into `target`. Shared by the batch and the selection-edge overlay so the two
 * can never drift apart. Uses module-scope scratch vectors: callers must not
 * rely on the temporaries between calls.
 */
export function composePieceMatrix(piece: PlacedPiece, target: Matrix4): Matrix4 {
  scratchPosition.set(piece.position[0], piece.position[1], piece.position[2]);
  scratchScale.set(piece.scale[0], piece.scale[1], piece.scale[2]);
  scratchQuaternion.setFromAxisAngle(Y_AXIS, piece.rotation[1]);
  return target.compose(scratchPosition, scratchQuaternion, scratchScale);
}

function indexedVertexCount(geometry: BufferGeometry): number {
  const position = geometry.getAttribute('position');
  if (!position) {
    return 0;
  }
  return position.count;
}

function geometryIndexCount(geometry: BufferGeometry): number {
  return geometry.index === null ? indexedVertexCount(geometry) : geometry.index.count;
}

export class PieceBatch {
  readonly mesh: BatchedMesh;

  private readonly geometryIdByAssetId = new Map<string, number>();
  private readonly resolveAssetId: (definitionId: string) => string | undefined;
  private readonly resolveBaseColor: ((definitionId: string) => number) | undefined;
  private readonly instanceByPiece = new Map<string, number>();
  private readonly definitionIdByPiece = new Map<string, string>();
  private readonly pieceByInstance: Int32Array;
  private readonly pieceIds: (string | undefined)[] = [];
  private readonly freeSlots: number[] = [];
  private readonly uniqueGeometryCount: number;
  private readonly selectedColor: number;
  private readonly baseColor: number;
  private selectedIds = new Set<string>();
  private disposed = false;

  constructor(
    geometries: readonly BatchGeometry[],
    material: Material,
    options: PieceBatchOptions = {},
  ) {
    if (geometries.length === 0) {
      throw new Error('PieceBatch requires at least one geometry.');
    }

    const maxInstances = options.maxInstances ?? DEFAULT_MAX_INSTANCES;
    const vertexHeadroom = options.vertexHeadroom ?? DEFAULT_VERTEX_HEADROOM;
    const indexHeadroom = options.indexHeadroom ?? DEFAULT_INDEX_HEADROOM;

    let vertexSum = 0;
    let indexSum = 0;
    for (const entry of geometries) {
      vertexSum += indexedVertexCount(entry.geometry);
      indexSum += geometryIndexCount(entry.geometry);
    }

    const maxVertexCount = Math.max(1, Math.ceil(vertexSum * vertexHeadroom));
    const maxIndexCount = Math.max(1, Math.ceil(indexSum * indexHeadroom));

    this.mesh = new BatchedMesh(maxInstances, maxVertexCount, maxIndexCount, material);
    // Correctness-first: never let stale per-instance bounds cull a live piece.
    this.mesh.perObjectFrustumCulled = false;
    this.mesh.frustumCulled = false;
    this.mesh.sortObjects = false;

    this.uniqueGeometryCount = geometries.length;
    this.resolveAssetId = options.resolveAssetId ?? ((definitionId) => definitionId);
    this.resolveBaseColor = options.resolveBaseColor;
    this.selectedColor = options.selectedColor ?? DEFAULT_SELECTED_COLOR;
    this.baseColor = options.baseColor ?? DEFAULT_BASE_COLOR;

    this.pieceByInstance = new Int32Array(maxInstances);
    this.pieceByInstance.fill(-1);

    for (let index = 0; index < geometries.length; index += 1) {
      const entry = geometries[index];
      if (entry === undefined) {
        continue;
      }
      const geometryId = this.mesh.addGeometry(entry.geometry);
      this.geometryIdByAssetId.set(entry.assetId, geometryId);
    }
  }

  /** Number of active instances (diagnostics / tests). */
  get instanceCount(): number {
    return this.mesh.instanceCount;
  }

  /** Number of unique geometries held by the batch. */
  get geometryCount(): number {
    return this.uniqueGeometryCount;
  }

  /**
   * Resolve the geometry id for a piece. Unknown definitions fall back to the
   * first geometry so a malformed reference renders as *something* instead of
   * corrupting the batch; callers should keep the resolver in sync with data.
   */
  private geometryIdForPiece(piece: PlacedPiece): number {
    const assetId = this.resolveAssetId(piece.definitionId);
    if (assetId !== undefined) {
      const geometryId = this.geometryIdByAssetId.get(assetId);
      if (geometryId !== undefined) {
        return geometryId;
      }
    }
    return 0;
  }

  private allocateSlot(pieceId: string): number {
    const reused = this.freeSlots.pop();
    if (reused !== undefined) {
      this.pieceIds[reused] = pieceId;
      return reused;
    }
    this.pieceIds.push(pieceId);
    return this.pieceIds.length - 1;
  }

  /** Add a new piece instance. Throws when the instance budget is exhausted. */
  add(piece: PlacedPiece): void {
    if (this.instanceByPiece.has(piece.id)) {
      this.update(piece);
      return;
    }
    if (this.mesh.instanceCount >= this.mesh.maxInstanceCount) {
      throw new Error(
        `PieceBatch capacity exceeded (max ${this.mesh.maxInstanceCount} instances). ` +
          'Growing the batch at runtime is a P53 follow-up.',
      );
    }

    const geometryId = this.geometryIdForPiece(piece);
    const instanceId = this.mesh.addInstance(geometryId);
    // Explicitly re-assert the geometry after slot reuse: `addInstance` uses the
    // requested id, but re-setting removes any doubt and keeps the batch honest.
    this.mesh.setGeometryIdAt(instanceId, geometryId);
    const slot = this.allocateSlot(piece.id);
    this.pieceByInstance[instanceId] = slot;
    this.instanceByPiece.set(piece.id, instanceId);
    this.definitionIdByPiece.set(piece.id, piece.definitionId);

    this.writeMatrix(instanceId, piece);
    this.writeColor(instanceId, piece.definitionId, this.selectedIds.has(piece.id));
  }

  /** Update an existing instance's transform. Unknown ids are ignored. */
  update(piece: PlacedPiece): void {
    const instanceId = this.instanceByPiece.get(piece.id);
    if (instanceId === undefined) {
      return;
    }
    this.writeMatrix(instanceId, piece);
  }

  /** Remove a piece instance, freeing its id and slot. Unknown ids are ignored. */
  remove(pieceId: string): void {
    const instanceId = this.instanceByPiece.get(pieceId);
    if (instanceId === undefined) {
      return;
    }
    const slot = this.pieceByInstance[instanceId];
    this.pieceByInstance[instanceId] = -1;
    if (slot !== undefined && slot >= 0) {
      this.pieceIds[slot] = undefined;
      this.freeSlots.push(slot);
    }
    this.instanceByPiece.delete(pieceId);
    this.definitionIdByPiece.delete(pieceId);
    this.selectedIds.delete(pieceId);
    this.mesh.deleteInstance(instanceId);
  }

  /**
   * Reconcile the batch with `pieces`: remove instances whose id disappeared, add
   * new ones, and update the transform of the rest. O(n) in the collection size,
   * runs once per document change (never per frame).
   */
  sync(pieces: readonly PlacedPiece[]): void {
    const incoming = new Set<string>();
    for (const piece of pieces) {
      incoming.add(piece.id);
    }

    const staleIds: string[] = [];
    for (const id of this.instanceByPiece.keys()) {
      if (!incoming.has(id)) {
        staleIds.push(id);
      }
    }
    for (const id of staleIds) {
      this.remove(id);
    }

    for (const piece of pieces) {
      if (this.instanceByPiece.has(piece.id)) {
        this.update(piece);
      } else {
        this.add(piece);
      }
    }
  }

  /**
   * Apply a selection state to the tints. `mode` mirrors the editor's selection
   * reducer; the default `replace` treats `ids` as the complete selection.
   */
  setSelection(ids: ReadonlySet<string>, mode: BatchSelectionMode = 'replace'): void {
    const previous = this.selectedIds;
    const next = new Set(previous);
    switch (mode) {
      case 'replace':
        next.clear();
        for (const id of ids) {
          next.add(id);
        }
        break;
      case 'add':
        for (const id of ids) {
          next.add(id);
        }
        break;
      case 'subtract':
        for (const id of ids) {
          next.delete(id);
        }
        break;
      case 'toggle':
        for (const id of ids) {
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
        }
        break;
    }

    for (const id of previous) {
      if (!next.has(id)) {
        this.recolor(id, false);
      }
    }
    for (const id of next) {
      if (!previous.has(id)) {
        this.recolor(id, true);
      }
    }
    this.selectedIds = next;
  }

  /** Set one instance's visibility (used by future hide/isolate tools). */
  setPieceVisible(pieceId: string, visible: boolean): void {
    const instanceId = this.instanceByPiece.get(pieceId);
    if (instanceId === undefined) {
      return;
    }
    this.mesh.setVisibleAt(instanceId, visible);
  }

  /** Resolve a raycast `batchId` back to a piece id, or `null` when unknown. */
  pieceIdForBatch(batchId: number): string | null {
    if (batchId < 0 || batchId >= this.pieceByInstance.length) {
      return null;
    }
    const slot = this.pieceByInstance[batchId];
    if (slot === undefined || slot < 0) {
      return null;
    }
    return this.pieceIds[slot] ?? null;
  }

  /** Whether the batch currently holds the given piece. */
  has(pieceId: string): boolean {
    return this.instanceByPiece.has(pieceId);
  }

  private recolor(pieceId: string, selected: boolean): void {
    const instanceId = this.instanceByPiece.get(pieceId);
    if (instanceId === undefined) {
      return;
    }
    const definitionId = this.definitionIdByPiece.get(pieceId) ?? '';
    this.writeColor(instanceId, definitionId, selected);
  }

  private writeMatrix(instanceId: number, piece: PlacedPiece): void {
    composePieceMatrix(piece, scratchMatrix);
    this.mesh.setMatrixAt(instanceId, scratchMatrix);
  }

  private writeColor(instanceId: number, definitionId: string, selected: boolean): void {
    const hex = selected
      ? this.selectedColor
      : (this.resolveBaseColor?.(definitionId) ?? this.baseColor);
    scratchColor.setHex(hex);
    this.mesh.setColorAt(instanceId, scratchColor);
  }

  /**
   * Release the `BatchedMesh`'s GPU buffers. Idempotent (React StrictMode runs
   * effect cleanups twice in development). Source geometries and the shared
   * material are borrowed and must be disposed by their owner.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.mesh.dispose();
  }
}
