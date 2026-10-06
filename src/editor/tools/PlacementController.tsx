/**
 * `PlacementController`: ground-plane placement tool.
 *
 * Active only while the tool store reports `activeTool === 'place'` with a
 * definition selected. Pointer moves raycast the ground plane, snap through the
 * editor's placement helper and push a transient ghost into the tool store. A
 * left click commits ONE `piece.add` command through the editor store, so the
 * placement is undoable; Escape (handled by the global shortcuts) simply drops
 * the ghost with no document mutation.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { BoxGeometry, MeshStandardMaterial } from 'three';
import type { Mesh } from 'three';
import type { PieceDefinition } from '@/domain';
import { createAddPiecesCommand, editorStore, resolvePlacement, snapPlacementPosition } from '@/editor';
import { DATASET } from '@/data';
import { useEngineStore } from '@/engine';
import { groundPointFromEvent } from './pointer';
import { useToolStore } from './toolStore';
import type { GhostState } from './toolStore';

const GHOST_COLOR = 0x60a5fa;
const GHOST_OPACITY = 0.35;

/** Translucent preview box, driven imperatively from the tool store. */
function GhostPreview({ definition }: { definition: PieceDefinition }) {
  const ref = useRef<Mesh>(null);
  const invalidate = useThree((state) => state.invalidate);

  const geometry = useMemo(() => {
    const { width, height, depth } = definition.dimensions;
    const box = new BoxGeometry(width, height, depth);
    box.translate(0, height / 2, 0);
    return box;
  }, [definition]);

  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: GHOST_COLOR,
        transparent: true,
        opacity: GHOST_OPACITY,
        depthWrite: false,
        roughness: 0.6,
      }),
    [],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const apply = (ghost: GhostState | null): void => {
      const mesh = ref.current;
      if (mesh === null) {
        return;
      }
      if (ghost === null) {
        mesh.visible = false;
      } else {
        mesh.position.set(ghost.position[0], ghost.position[1], ghost.position[2]);
        mesh.rotation.y = ghost.rotationY;
        mesh.visible = true;
      }
      invalidate();
    };
    apply(useToolStore.getState().ghost);
    return useToolStore.subscribe((state) => state.ghost, apply);
  }, [invalidate]);

  return <mesh ref={ref} geometry={geometry} material={material} visible={false} />;
}

export function PlacementController() {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const activeTool = useToolStore((state) => state.activeTool);
  const activeDefinitionId = useToolStore((state) => state.activeDefinitionId);
  const grid = useEngineStore((state) => state.grid);

  useEffect(() => {
    if (activeTool !== 'place' || activeDefinitionId === null) {
      return;
    }
    const definition = DATASET.definitionById.get(activeDefinitionId);
    if (definition === undefined) {
      return;
    }
    const element = gl.domElement;

    const computeGhost = (event: MouseEvent): GhostState | null => {
      const point = groundPointFromEvent(event, element, camera);
      if (point === null) {
        return null;
      }
      const position = snapPlacementPosition(point, grid);
      const rotationY = useToolStore.getState().ghost?.rotationY ?? 0;
      return { position, rotationY };
    };

    const onPointerMove = (event: PointerEvent): void => {
      const ghost = computeGhost(event);
      if (ghost !== null) {
        useToolStore.getState().setGhost(ghost);
      }
    };

    const onPointerLeave = (): void => {
      useToolStore.getState().clearGhost();
    };

    const onClick = (event: MouseEvent): void => {
      if (event.button !== 0) {
        return;
      }
      const ghost = computeGhost(event) ?? useToolStore.getState().ghost;
      if (ghost === null) {
        return;
      }
      const floorId = editorStore.getState().project.floors[0]?.id;
      if (floorId === undefined) {
        return;
      }
      const piece = resolvePlacement(definition, ghost.position, ghost.rotationY, floorId);
      editorStore.getState().executeCommand(createAddPiecesCommand([piece]));
      editorStore.getState().select([piece.id], 'replace');
      invalidate();
    };

    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerleave', onPointerLeave);
    element.addEventListener('click', onClick);
    return () => {
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerleave', onPointerLeave);
      element.removeEventListener('click', onClick);
    };
  }, [gl, camera, invalidate, activeTool, activeDefinitionId, grid]);

  const definition =
    activeTool === 'place' && activeDefinitionId !== null
      ? (DATASET.definitionById.get(activeDefinitionId) ?? null)
      : null;

  if (definition === null) {
    return null;
  }
  return <GhostPreview definition={definition} />;
}
