/**
 * `PlacementController`: slot-aware structure + barricade placement.
 *
 * On every pointer move the controller raycasts the ground plane (for a plan
 * position) and the `PieceField` (for an attachment surface), then asks the pure
 * `resolveStructurePlacement` / `resolveBarricadePlacement` helpers where the
 * piece belongs. The resulting ghost transform and validity live in the tool
 * store; the ghost is tinted green when valid and red when not. A left click
 * commits ONE `piece.add` command through the editor store only when the
 * placement is valid, so invalid placements never mutate the document. Escape
 * (global shortcut) drops the ghost with no mutation.
 */

import { useContext, useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { BoxGeometry, MeshStandardMaterial } from 'three';
import type { Mesh } from 'three';
import type { PieceDefinition, PlacedPiece, SurfaceHit, SurfaceKind, Vec3 } from '@/domain';
import { barricadeSlotsForPiece } from '@/domain';
import {
  createAddPiecesCommand,
  editorStore,
  floorById,
  isBarricadeDefinition,
  placementMessageFor,
  resolveBarricadePlacement,
  resolvePlacement,
  resolveStructurePlacement,
  snapPlacementPosition,
} from '@/editor';
import { DATASET } from '@/data';
import { useEngineStore } from '@/engine';
import type { PieceSurfaceHit } from '@/engine';
import { groundPointFromEvent, ndcFromEvent, viewDirectionFromEvent } from './pointer';
import { PieceFieldContext } from './PieceFieldContext';
import { useToolStore } from './toolStore';
import type { GhostState } from './toolStore';

const VALID_COLOR = 0x4ade80;
const INVALID_COLOR = 0xef4444;
const GHOST_OPACITY = 0.35;
const GROUND_NORMAL: [number, number, number] = [0, 1, 0];

interface Candidate {
  readonly ghost: GhostState;
  readonly valid: boolean;
  readonly message: string | null;
}

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
        color: VALID_COLOR,
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
    const apply = (): void => {
      const mesh = ref.current;
      if (mesh === null) {
        return;
      }
      const state = useToolStore.getState();
      const ghost = state.ghost;
      if (ghost === null) {
        mesh.visible = false;
      } else {
        mesh.position.set(ghost.position[0], ghost.position[1], ghost.position[2]);
        mesh.rotation.y = ghost.rotationY;
        mesh.visible = true;
      }
      material.color.setHex(state.ghostValid ? VALID_COLOR : INVALID_COLOR);
      invalidate();
    };
    apply();
    const unsubscribeGhost = useToolStore.subscribe((state) => state.ghost, apply);
    const unsubscribeValid = useToolStore.subscribe((state) => state.ghostValid, apply);
    return () => {
      unsubscribeGhost();
      unsubscribeValid();
    };
  }, [invalidate, material]);

  return <mesh ref={ref} geometry={geometry} material={material} visible={false} />;
}

/** Resolve the attachment surface kind exposed by a picked piece. */
function surfaceKindForPiece(piece: PlacedPiece, definition: PieceDefinition): SurfaceKind {
  const slots = barricadeSlotsForPiece(piece, definition);
  const first = slots[0];
  return first === undefined ? 'any' : first.kind;
}

/** Build a domain `SurfaceHit` from a picked piece, else a ground hit. */
function surfaceHitFor(
  picked: PieceSurfaceHit | null,
  pieces: readonly PlacedPiece[],
  groundPoint: Vec3,
): SurfaceHit {
  if (picked !== null) {
    const piece = pieces.find((candidate) => candidate.id === picked.pieceId);
    const definition =
      piece === undefined ? undefined : DATASET.definitionById.get(piece.definitionId);
    if (piece !== undefined && definition !== undefined) {
      return {
        point: picked.point,
        normal: picked.normal,
        kind: surfaceKindForPiece(piece, definition),
        sourcePieceId: piece.id,
        sourceYaw: piece.rotation[1],
      };
    }
  }
  return { point: groundPoint, normal: GROUND_NORMAL, kind: 'ground' };
}

export function PlacementController() {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const activeTool = useToolStore((state) => state.activeTool);
  const activeDefinitionId = useToolStore((state) => state.activeDefinitionId);
  const grid = useEngineStore((state) => state.grid);
  const fieldRef = useContext(PieceFieldContext);

  useEffect(() => {
    if (activeTool !== 'place' || activeDefinitionId === null) {
      return;
    }
    const definition = DATASET.definitionById.get(activeDefinitionId);
    if (definition === undefined) {
      return;
    }
    const element = gl.domElement;
    const isBarricade = isBarricadeDefinition(definition);

    const computeCandidate = (event: MouseEvent): Candidate | null => {
      const { project, activeFloorId } = editorStore.getState();
      const elevation = floorById(project, activeFloorId)?.elevation ?? 0;
      const point = groundPointFromEvent(event, element, camera, elevation);
      if (point === null) {
        return null;
      }
      const position = snapPlacementPosition(point, grid);
      position[1] = elevation;
      const rotationY = useToolStore.getState().ghost?.rotationY ?? 0;
      const viewDir = viewDirectionFromEvent(event, element, camera) ?? [0, 0, 1];

      if (isBarricade) {
        const ndc = ndcFromEvent(event, element);
        const picked = ndc === null ? null : (fieldRef?.current?.pickSurface(ndc, camera) ?? null);
        const hit = surfaceHitFor(picked, project.pieces, position);
        const resolution = resolveBarricadePlacement(
          definition,
          hit,
          rotationY,
          project.pieces,
          DATASET.definitionById,
        );
        return {
          ghost: { position: resolution.position, rotationY: resolution.rotationY },
          valid: resolution.valid,
          message: resolution.valid ? null : placementMessageFor(resolution.result),
        };
      }

      const resolution = resolveStructurePlacement(
        definition,
        position,
        viewDir,
        project.pieces,
        DATASET.definitionById,
        { rotationY },
      );
      return {
        ghost: { position: resolution.position, rotationY: resolution.rotationY },
        valid: resolution.valid,
        message: resolution.valid ? null : placementMessageFor(resolution.result),
      };
    };

    const applyCandidate = (candidate: Candidate): void => {
      const tool = useToolStore.getState();
      tool.setGhost(candidate.ghost);
      tool.setGhostValid(candidate.valid);
      tool.setPlacementMessage(candidate.message);
    };

    const onPointerMove = (event: PointerEvent): void => {
      const candidate = computeCandidate(event);
      if (candidate !== null) {
        applyCandidate(candidate);
        invalidate();
      }
    };

    const onPointerLeave = (): void => {
      useToolStore.getState().clearGhost();
      invalidate();
    };

    const onClick = (event: MouseEvent): void => {
      if (event.button !== 0) {
        return;
      }
      const candidate = computeCandidate(event);
      if (candidate === null) {
        return;
      }
      applyCandidate(candidate);
      if (!candidate.valid) {
        invalidate();
        return;
      }
      const { project, activeFloorId } = editorStore.getState();
      const floor = floorById(project, activeFloorId);
      if (floor === undefined) {
        return;
      }
      const piece = resolvePlacement(
        definition,
        candidate.ghost.position,
        candidate.ghost.rotationY,
        floor.id,
      );
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
  }, [gl, camera, invalidate, activeTool, activeDefinitionId, grid, fieldRef]);

  const definition =
    activeTool === 'place' && activeDefinitionId !== null
      ? (DATASET.definitionById.get(activeDefinitionId) ?? null)
      : null;

  if (definition === null) {
    return null;
  }
  return <GhostPreview definition={definition} />;
}
