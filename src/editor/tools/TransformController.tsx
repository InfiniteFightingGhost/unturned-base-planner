/**
 * `TransformController`: pointer-driven move tool.
 *
 * Under the `move` tool, pressing on a piece that is already selected starts a
 * ground-plane drag. Pointer moves preview the translation directly on the batch
 * (never through React state and never by mutating the document); pointer-up
 * commits a SINGLE `piece.transform` command, so the whole multi-selection move
 * undoes as one step and relative transforms are preserved. Rotation, delete,
 * duplicate and copy/paste are keyboard actions owned by `useGlobalShortcuts`,
 * so this component has exactly one gesture to reason about.
 */

import { useContext, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { Vec3 } from '@/domain';
import {
  createTransformPiecesCommand,
  editorStore,
  snapPlacementPosition,
  translatePiece,
} from '@/editor';
import { useEngineStore } from '@/engine';
import { groundPointFromEvent, ndcFromEvent } from './pointer';
import { PieceFieldContext } from './PieceFieldContext';
import { useToolStore } from './toolStore';

export function TransformController() {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const activeTool = useToolStore((state) => state.activeTool);
  const fieldRef = useContext(PieceFieldContext);

  useEffect(() => {
    if (activeTool !== 'move') {
      return;
    }
    const element = gl.domElement;

    let dragging = false;
    let dragIds: readonly string[] = [];
    let start: Vec3 | null = null;
    let delta: [number, number, number] = [0, 0, 0];

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }
      const handle = fieldRef?.current ?? null;
      if (handle === null) {
        return;
      }
      const ndc = ndcFromEvent(event, element);
      if (ndc === null) {
        return;
      }
      const id = handle.pick(ndc, camera);
      if (id === null) {
        return;
      }
      const editor = editorStore.getState();
      if (!editor.selection.includes(id)) {
        return;
      }
      const point = groundPointFromEvent(event, element, camera);
      if (point === null) {
        return;
      }
      dragging = true;
      dragIds = editor.selection.slice();
      start = point;
      delta = [0, 0, 0];
      element.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (!dragging || start === null) {
        return;
      }
      const point = groundPointFromEvent(event, element, camera);
      if (point === null) {
        return;
      }
      const grid = useEngineStore.getState().grid;
      const snapped = snapPlacementPosition(point, grid);
      const startSnapped = snapPlacementPosition(start, grid);
      delta = [
        snapped[0] - startSnapped[0],
        snapped[1] - startSnapped[1],
        snapped[2] - startSnapped[2],
      ];
      fieldRef?.current?.previewTranslate(dragIds, delta);
    };

    const finish = (): void => {
      if (!dragging) {
        return;
      }
      dragging = false;
      const total = delta;
      const moved = total[0] !== 0 || total[1] !== 0 || total[2] !== 0;
      if (moved) {
        const ids = dragIds;
        editorStore
          .getState()
          .executeCommand(
            createTransformPiecesCommand(ids, (piece) => translatePiece(piece, total)),
          );
      } else {
        fieldRef?.current?.clearPreview();
      }
      dragIds = [];
      start = null;
      delta = [0, 0, 0];
      invalidate();
    };

    const onPointerUp = (event: PointerEvent): void => {
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
      finish();
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('pointercancel', onPointerUp);
    return () => {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerUp);
    };
  }, [gl, camera, invalidate, activeTool, fieldRef]);

  return null;
}
