/**
 * `PieceField`: R3F host for the imperative `PieceBatch`.
 *
 * Data flow
 * ---------
 * The batch is created once per mount inside an effect (so React StrictMode's
 * simulated remount disposes and rebuilds cleanly). It then subscribes
 * transiently to the editor store's `project.pieces` and `selection` slices and
 * mutates the `BatchedMesh` directly, calling `invalidate()` exactly once per
 * change. React never renders a per-piece element and never holds transforms in
 * state; the only stateful value is the stable `mesh` object handed to
 * `<primitive>`.
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { MeshStandardMaterial, Raycaster } from 'three';
import type { BatchedMesh, BufferGeometry, Camera, Material, Vector2 } from 'three';
import type { AssetDescriptor, AssetResolver } from '@/domain';
import { vec3 } from '@/domain';
import { createProxyAssetResolver, DATASET } from '@/data';
import { editorStore } from '@/editor';
import { descriptorToGeometry, disposeGeometryCache } from './proxyGeometry';
import { PieceBatch } from './PieceBatch';
import type { BatchGeometry } from './PieceBatch';

const defaultAssetResolver: AssetResolver = createProxyAssetResolver(DATASET);

/** Instance budget for the default single-batch field. */
const DEFAULT_MAX_INSTANCES = 4096;

export interface PieceFieldHandle {
  /**
   * Raycast a normalized device coordinate against the batch and return the
   * nearest piece id (or `null`). The caller supplies the active camera so the
   * field stays agnostic to which projection the rig adopted.
   */
  pick(ndc: Vector2, camera: Camera): string | null;
  /**
   * Drag preview: shift the given pieces by `delta` without touching the
   * document. Committing the move happens through a command on pointer-up.
   */
  previewTranslate(pieceIds: readonly string[], delta: [number, number, number]): void;
  /** Discard any drag preview, re-syncing from the document. */
  clearPreview(): void;
}

export interface PieceFieldProps {
  /** Asset resolver used to size each unique `model.assetId`. */
  assetResolver?: AssetResolver;
  /** Maximum instances before `add` throws. Defaults to 4096. */
  maxInstances?: number;
}

function resolveDescriptor(
  resolver: AssetResolver,
  assetId: string,
  fallback: AssetDescriptor,
): AssetDescriptor {
  const sync = resolver.resolveSync?.(assetId);
  return sync ?? fallback;
}

/** One geometry per distinct `model.assetId` in the dataset. */
function buildGeometries(resolver: AssetResolver): BatchGeometry[] {
  const byAssetId = new Map<string, BufferGeometry>();
  for (const definition of DATASET.definitions) {
    const assetId = definition.model.assetId;
    if (byAssetId.has(assetId)) {
      continue;
    }
    const fallback: AssetDescriptor = {
      id: assetId,
      kind: 'box',
      dimensions: { ...definition.dimensions },
    };
    const descriptor = resolveDescriptor(resolver, assetId, fallback);
    byAssetId.set(assetId, descriptorToGeometry(descriptor));
  }
  return [...byAssetId].map(([assetId, geometry]) => ({ assetId, geometry }));
}

export const PieceField = forwardRef<PieceFieldHandle, PieceFieldProps>(function PieceField(
  { assetResolver, maxInstances = DEFAULT_MAX_INSTANCES },
  ref,
) {
  const resolver = useMemo(() => assetResolver ?? defaultAssetResolver, [assetResolver]);
  const invalidate = useThree((state) => state.invalidate);
  const raycaster = useMemo(() => new Raycaster(), []);

  const fieldRef = useRef<PieceBatch | null>(null);
  const [mesh, setMesh] = useState<BatchedMesh | null>(null);

  useEffect(() => {
    const material: Material = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.05,
    });
    const batch = new PieceBatch(buildGeometries(resolver), material, {
      maxInstances,
      resolveAssetId: (definitionId) => DATASET.definitionById.get(definitionId)?.model.assetId,
    });
    fieldRef.current = batch;
    setMesh(batch.mesh);

    const initial = editorStore.getState();
    batch.sync(initial.project.pieces);
    batch.setSelection(new Set(initial.selection), 'replace');
    invalidate();

    const unsubscribePieces = editorStore.subscribe((state, previous) => {
      if (state.project.pieces === previous.project.pieces) {
        return;
      }
      batch.sync(state.project.pieces);
      invalidate();
    });
    const unsubscribeSelection = editorStore.subscribe((state, previous) => {
      if (state.selection === previous.selection) {
        return;
      }
      batch.setSelection(new Set(state.selection), 'replace');
      invalidate();
    });

    return () => {
      unsubscribePieces();
      unsubscribeSelection();
      fieldRef.current = null;
      setMesh(null);
      batch.dispose();
      material.dispose();
      disposeGeometryCache();
    };
  }, [resolver, maxInstances, invalidate]);

  useImperativeHandle(
    ref,
    () => ({
      pick: (ndc: Vector2, camera: Camera): string | null => {
        const batch = fieldRef.current;
        if (batch === null) {
          return null;
        }
        raycaster.setFromCamera(ndc, camera);
        batch.mesh.updateMatrixWorld();
        const hits = raycaster.intersectObject(batch.mesh, false);
        for (const hit of hits) {
          const batchId = hit.batchId;
          if (batchId === undefined) {
            continue;
          }
          const pieceId = batch.pieceIdForBatch(batchId);
          if (pieceId !== null) {
            return pieceId;
          }
        }
        return null;
      },
      previewTranslate: (
        pieceIds: readonly string[],
        delta: [number, number, number],
      ): void => {
        const batch = fieldRef.current;
        if (batch === null) {
          return;
        }
        const wanted = new Set(pieceIds);
        for (const piece of editorStore.getState().project.pieces) {
          if (!wanted.has(piece.id)) {
            continue;
          }
          batch.update({
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
        const batch = fieldRef.current;
        if (batch === null) {
          return;
        }
        batch.sync(editorStore.getState().project.pieces);
        invalidate();
      },
    }),
    [raycaster, invalidate],
  );

  if (mesh === null) {
    return null;
  }

  return <primitive object={mesh} />;
});
