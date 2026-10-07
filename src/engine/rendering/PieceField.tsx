/**
 * `PieceField`: R3F host for one imperative `PieceBatch` PER FLOOR.
 *
 * Per-floor batching
 * ------------------
 * A single `Map<floorId, { batch, material }>` is kept alive in an effect (so
 * React StrictMode's simulated remount disposes and rebuilds cleanly). Each
 * visible floor owns its OWN `BatchedMesh` and its OWN `MeshStandardMaterial`
 * instance, while sharing the globally cached proxy geometries through
 * `pieceProxyGeometry`. The shared geometries are borrowed from the module cache
 * and are NOT disposed per batch; `disposeGeometryCache()` runs once on field
 * teardown.
 *
 * Real models
 * -----------
 * `buildGeometries` asks the `ModelLibrary` for a real mesh per definition and
 * falls back to the proxy. The library is loaded asynchronously (never blocking
 * first paint); when it reports readiness the effect rebuilds once with the real
 * meshes. Definitions whose file is absent or fails to parse keep their proxy
 * permanently, so the editor never breaks on missing assets.
 *
 * Ghosting
 * --------
 * The active floor is opaque (`opacity = 1`, `transparent = false`,
 * `depthWrite = true`) and therefore visually dominant. Visible non-active
 * floors are translucent (`opacity = ghostOpacityForFloor(...) = 0.25`,
 * `transparent = true`, `depthWrite = false`) so they read as context without
 * occluding the active floor. Hidden floors have no batch at all: their batch
 * and material are disposed on hide / delete and rebuilt on show.
 *
 * Picking
 * -------
 * `pick` raycasts only the batches of visible, UNLOCKED floors, so locked
 * floors can never be selected. Within a floor, pieces assigned to a locked
 * zone are skipped as well. Hits are resolved per batch through its
 * `batchId -> pieceId` mapping.
 *
 * Zone visibility
 * ---------------
 * Hidden zones are filtered out before a batch syncs (via `isPieceVisible`), so
 * their pieces are not rendered; showing the zone again re-syncs and restores
 * them. Locked zones stay rendered but are non-pickable.
 *
 * Capacity
 * --------
 * `maxInstances` is the budget for EACH floor batch (default 4096), so total
 * capacity scales with the number of visible floors. A single floor exceeding
 * its budget throws the actionable `PieceBatch` capacity error; growing a batch
 * at runtime remains tracked as a P53 follow-up.
 *
 * Data flow
 * ---------
 * React never renders a per-piece element. A single transient store
 * subscription mutates the batches directly and calls `invalidate()` only when
 * `project.floors`, `project.pieces`, `selection` or `activeFloorId` actually
 * change. The only React state is the list of per-floor meshes handed to
 * `<primitive>` (structural floor changes only).
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Matrix4, MeshStandardMaterial, Raycaster } from 'three';
import type { BatchedMesh, BufferGeometry, Camera, Vector2 } from 'three';
import type { AssetDescriptor, AssetResolver, PlacedPiece, Project } from '@/domain';
import { vec3 } from '@/domain';
import { createProxyAssetResolver, DATASET, modelManifestCandidates } from '@/data';
import {
  editorStore,
  ghostOpacityForFloor,
  isFloorLocked,
  isPieceVisible,
  isZoneLocked,
  piecesOnFloor,
  sortedFloors,
  visibleFloors,
} from '@/editor';
import { pieceProxyGeometry, disposeGeometryCache } from './proxyGeometry';
import { tierColorForDefinition } from './pieceAppearance';
import { SelectionEdges } from './selectionEdges';
import type { SelectionEdgeItem } from './selectionEdges';
import { PieceBatch, composePieceMatrix } from './PieceBatch';
import type { BatchGeometry } from './PieceBatch';
import { getSharedModelLibrary } from '../assets/ModelLibrary';
import type { ModelLibrary } from '../assets/ModelLibrary';

const defaultAssetResolver: AssetResolver = createProxyAssetResolver(DATASET);

/**
 * Every manifest key any dataset definition can resolve to. Used to preload only
 * the models the planner actually uses instead of the whole extracted pack.
 */
const RELEVANT_MANIFEST_IDS: ReadonlySet<string> = (() => {
  const ids = new Set<string>();
  for (const definition of DATASET.definitions) {
    for (const candidate of modelManifestCandidates(definition.id)) {
      ids.add(candidate);
    }
  }
  return ids;
})();

/** Instance budget for each per-floor batch. */
const DEFAULT_MAX_INSTANCES = 4096;

/** One floor's batch plus its independent material instance and edge overlay. */
interface FloorBatchEntry {
  readonly batch: PieceBatch;
  readonly material: MeshStandardMaterial;
  readonly edges: SelectionEdges;
}

/** A raycast hit against a placed piece, including the world-space surface. */
export interface PieceSurfaceHit {
  readonly pieceId: string;
  readonly point: [number, number, number];
  readonly normal: [number, number, number];
  readonly distance: number;
}

export interface PieceFieldHandle {
  /**
   * Raycast a normalized device coordinate against the visible, unlocked floor
   * batches and return the nearest piece id (or `null`). The caller supplies the
   * active camera so the field stays agnostic to which projection the rig
   * adopted.
   */
  pick(ndc: Vector2, camera: Camera): string | null;
  /**
   * Like `pick`, but also returns the world-space hit point, face normal and
   * distance. Used by placement to resolve attachment surfaces.
   */
  pickSurface(ndc: Vector2, camera: Camera): PieceSurfaceHit | null;
  /**
   * Drag preview: shift the given pieces by `delta` without touching the
   * document. Committing the move happens through a command on pointer-up.
   */
  previewTranslate(pieceIds: readonly string[], delta: [number, number, number]): void;
  /** Discard any drag preview, re-syncing from the document. */
  clearPreview(): void;
}

export interface PieceFieldProps {
  /** Asset resolver used to size each definition's proxy fallback. */
  assetResolver?: AssetResolver;
  /** Maximum instances per floor batch before `add` throws. Defaults to 4096. */
  maxInstances?: number;
  /** Model provider override (tests / embedding). Defaults to the shared one. */
  modelLibrary?: ModelLibrary;
}

function resolveDescriptor(
  resolver: AssetResolver,
  assetId: string,
  fallback: AssetDescriptor,
): AssetDescriptor {
  const sync = resolver.resolveSync?.(assetId);
  return sync ?? fallback;
}

/**
 * One geometry per dataset definition. A definition whose real model is loaded
 * uses that mesh; every other definition (no manifest entry, file missing, still
 * loading or parse failure) gets the shared proxy geometry. Keying by
 * `definitionId` — rather than `model.assetId` — is what lets tiers diverge.
 */
function buildGeometries(
  resolver: AssetResolver,
  library: ModelLibrary,
): {
  entries: BatchGeometry[];
  byDefinitionId: Map<string, BufferGeometry>;
} {
  const byDefinitionId = new Map<string, BufferGeometry>();
  const entries: BatchGeometry[] = [];
  for (const definition of DATASET.definitions) {
    let geometry = library.getGeometry(definition.id);
    if (geometry === undefined) {
      const assetId = definition.model.assetId;
      const fallback: AssetDescriptor = {
        id: assetId,
        kind: 'box',
        dimensions: { ...definition.dimensions },
      };
      const descriptor = resolveDescriptor(resolver, assetId, fallback);
      geometry = pieceProxyGeometry({
        assetId,
        category: definition.category,
        dimensions: descriptor.dimensions,
      });
    }
    byDefinitionId.set(definition.id, geometry);
    entries.push({ definitionId: definition.id, geometry });
  }
  return { entries, byDefinitionId };
}

/** Apply a ghost opacity to a floor's material, keeping flags consistent. */
function applyOpacity(material: MeshStandardMaterial, opacity: number): void {
  material.opacity = opacity;
  const transparent = opacity < 1;
  material.transparent = transparent;
  material.depthWrite = !transparent;
}

export const PieceField = forwardRef<PieceFieldHandle, PieceFieldProps>(function PieceField(
  { assetResolver, maxInstances = DEFAULT_MAX_INSTANCES, modelLibrary },
  ref,
) {
  const resolver = useMemo(() => assetResolver ?? defaultAssetResolver, [assetResolver]);
  const library = useMemo(
    () => modelLibrary ?? getSharedModelLibrary((manifestId) => RELEVANT_MANIFEST_IDS.has(manifestId)),
    [modelLibrary],
  );
  const invalidate = useThree((state) => state.invalidate);
  const raycaster = useMemo(() => new Raycaster(), []);

  const batchesRef = useRef<Map<string, FloorBatchEntry>>(new Map());
  const meshToFloorRef = useRef<Map<BatchedMesh, string>>(new Map());
  const [meshes, setMeshes] = useState<BatchedMesh[]>([]);
  // Bumped once the model library finishes so the effect below rebuilds the
  // batches with real meshes (or keeps proxies where a model is unavailable).
  const [modelVersion, setModelVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let bumped = false;
    const bump = (): void => {
      if (!cancelled && !bumped) {
        bumped = true;
        setModelVersion((version) => version + 1);
      }
    };
    const unsubscribe = library.subscribe(() => {
      if (library.isLoaded) {
        bump();
      }
    });
    void library.load().then(() => {
      if (library.isLoaded) {
        bump();
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [library]);

  useEffect(() => {
    const { entries, byDefinitionId } = buildGeometries(resolver, library);
    const batches = new Map<string, FloorBatchEntry>();
    const meshToFloor = new Map<BatchedMesh, string>();
    batchesRef.current = batches;
    meshToFloorRef.current = meshToFloor;

    const createEntry = (): FloorBatchEntry => {
      const material = new MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.7,
        metalness: 0.15,
      });
      const batch = new PieceBatch(entries, material, {
        maxInstances,
        resolveBaseColor: tierColorForDefinition,
      });
      const edges = new SelectionEdges();
      batch.mesh.add(edges.object);
      return { batch, material, edges };
    };

    const removeBatch = (floorId: string): void => {
      const entry = batches.get(floorId);
      if (entry === undefined) {
        return;
      }
      batches.delete(floorId);
      meshToFloor.delete(entry.batch.mesh);
      entry.batch.mesh.remove(entry.edges.object);
      entry.edges.dispose();
      entry.batch.dispose();
      entry.material.dispose();
    };

    const renderableOnFloor = (project: Project, floorId: string): PlacedPiece[] =>
      piecesOnFloor(project, floorId).filter((piece) => isPieceVisible(piece, project));

    const rebuildEdges = (project: Project): void => {
      const selection = new Set(editorStore.getState().selection);
      for (const [floorId, entry] of batches) {
        const items: SelectionEdgeItem[] = [];
        for (const piece of renderableOnFloor(project, floorId)) {
          if (!selection.has(piece.id)) {
            continue;
          }
          const geometry = byDefinitionId.get(piece.definitionId);
          if (geometry === undefined) {
            continue;
          }
          items.push({ geometry, matrix: composePieceMatrix(piece, new Matrix4()) });
        }
        entry.edges.update(items);
      }
    };

    const syncPieces = (project: Project): void => {
      for (const [floorId, entry] of batches) {
        entry.batch.sync(renderableOnFloor(project, floorId));
      }
      rebuildEdges(project);
    };

    const applySelection = (selection: readonly string[]): void => {
      const ids = new Set(selection);
      for (const entry of batches.values()) {
        entry.batch.setSelection(ids, 'replace');
      }
      rebuildEdges(editorStore.getState().project);
    };

    const reconcileFloors = (project: Project, activeFloorId: string): void => {
      const visible = visibleFloors(project);
      const visibleIds = new Set(visible.map((floor) => floor.id));

      for (const floorId of [...batches.keys()]) {
        if (!visibleIds.has(floorId)) {
          removeBatch(floorId);
        }
      }

      for (const floor of visible) {
        let entry = batches.get(floor.id);
        if (entry === undefined) {
          entry = createEntry();
          batches.set(floor.id, entry);
          meshToFloor.set(entry.batch.mesh, floor.id);
        }
        applyOpacity(entry.material, ghostOpacityForFloor(floor, activeFloorId));
        entry.batch.sync(renderableOnFloor(project, floor.id));
      }

      const nextMeshes: BatchedMesh[] = [];
      for (const floor of sortedFloors(project)) {
        const entry = batches.get(floor.id);
        if (entry !== undefined) {
          nextMeshes.push(entry.batch.mesh);
        }
      }
      applySelection(editorStore.getState().selection);
      setMeshes(nextMeshes);
    };

    const updateOpacities = (project: Project, activeFloorId: string): void => {
      for (const floor of project.floors) {
        const entry = batches.get(floor.id);
        if (entry !== undefined) {
          applyOpacity(entry.material, ghostOpacityForFloor(floor, activeFloorId));
        }
      }
    };

    const initial = editorStore.getState();
    reconcileFloors(initial.project, initial.activeFloorId);
    applySelection(initial.selection);
    invalidate();

    const unsubscribe = editorStore.subscribe((state, previous) => {
      let dirty = false;
      if (state.project !== previous.project) {
        if (state.project.floors !== previous.project.floors) {
          reconcileFloors(state.project, state.activeFloorId);
        } else if (
          state.project.pieces !== previous.project.pieces ||
          state.project.zones !== previous.project.zones
        ) {
          syncPieces(state.project);
        }
        dirty = true;
      }
      if (state.selection !== previous.selection) {
        applySelection(state.selection);
        dirty = true;
      }
      if (state.activeFloorId !== previous.activeFloorId) {
        updateOpacities(state.project, state.activeFloorId);
        dirty = true;
      }
      if (dirty) {
        invalidate();
      }
    });

    return () => {
      unsubscribe();
      for (const floorId of [...batches.keys()]) {
        removeBatch(floorId);
      }
      batchesRef.current = new Map();
      meshToFloorRef.current = new Map();
      setMeshes([]);
      disposeGeometryCache();
    };
  }, [resolver, library, maxInstances, invalidate, modelVersion]);

  useImperativeHandle(
    ref,
    () => {
      const resolveSurface = (ndc: Vector2, camera: Camera): PieceSurfaceHit | null => {
        const project = editorStore.getState().project;
        const targets: BatchedMesh[] = [];
        for (const [floorId, entry] of batchesRef.current) {
          if (!isFloorLocked(project, floorId)) {
            targets.push(entry.batch.mesh);
          }
        }
        if (targets.length === 0) {
          return null;
        }
        raycaster.setFromCamera(ndc, camera);
        for (const mesh of targets) {
          mesh.updateMatrixWorld();
        }
        const hits = raycaster.intersectObjects(targets, false);
        for (const hit of hits) {
          const batchId = hit.batchId;
          if (batchId === undefined) {
            continue;
          }
          const floorId = meshToFloorRef.current.get(hit.object as BatchedMesh);
          if (floorId === undefined) {
            continue;
          }
          const entry = batchesRef.current.get(floorId);
          const pieceId = entry?.batch.pieceIdForBatch(batchId) ?? null;
          if (pieceId === null) {
            continue;
          }
          const piece = project.pieces.find((candidate) => candidate.id === pieceId);
          if (piece === undefined || isZoneLocked(project, piece.zoneId)) {
            continue;
          }
          const normal = hit.face?.normal;
          return {
            pieceId,
            point: [hit.point.x, hit.point.y, hit.point.z],
            normal: normal === undefined ? [0, 1, 0] : [normal.x, normal.y, normal.z],
            distance: hit.distance,
          };
        }
        return null;
      };

      return {
        pick: (ndc: Vector2, camera: Camera): string | null =>
          resolveSurface(ndc, camera)?.pieceId ?? null,
        pickSurface: (ndc: Vector2, camera: Camera): PieceSurfaceHit | null =>
          resolveSurface(ndc, camera),
        previewTranslate: (pieceIds: readonly string[], delta: [number, number, number]): void => {
          const wanted = new Set(pieceIds);
          const batches = batchesRef.current;
          for (const piece of editorStore.getState().project.pieces) {
            if (!wanted.has(piece.id)) {
              continue;
            }
            const entry = batches.get(piece.floorId);
            if (entry === undefined) {
              continue;
            }
            entry.batch.update({
              ...piece,
              position: vec3(
                piece.position[0] + delta[0],
                piece.position[1] + delta[1],
                piece.position[2] + delta[2],
              ),
            });
          }
          invalidate();
        },
        clearPreview: (): void => {
          const project = editorStore.getState().project;
          for (const [floorId, entry] of batchesRef.current) {
            entry.batch.sync(piecesOnFloor(project, floorId));
          }
          invalidate();
        },
      };
    },
    [raycaster, invalidate],
  );

  if (meshes.length === 0) {
    return null;
  }

  return (
    <>
      {meshes.map((mesh) => (
        <primitive key={mesh.id} object={mesh} />
      ))}
    </>
  );
});
