/**
 * `SelectionController`: click-to-select picking.
 *
 * Active only under the `select` tool. A left click raycasts the `PieceField`
 * through its imperative handle; a plain click replaces the selection, Shift adds
 * and Ctrl/Cmd toggles. Clicking empty space clears the selection. Selection is
 * UI state and never produces a history entry; the visual highlight is the batch
 * tint applied by `PieceField`.
 */

import { useContext, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { editorStore } from '@/editor';
import { ndcFromEvent } from './pointer';
import { PieceFieldContext } from './PieceFieldContext';
import { useToolStore } from './toolStore';

export function SelectionController() {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const activeTool = useToolStore((state) => state.activeTool);
  const fieldRef = useContext(PieceFieldContext);

  useEffect(() => {
    if (activeTool !== 'select') {
      return;
    }
    const element = gl.domElement;

    const onClick = (event: MouseEvent): void => {
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
      const editor = editorStore.getState();
      if (id === null) {
        editor.clearSelection();
      } else if (event.shiftKey) {
        editor.select([id], 'add');
      } else if (event.ctrlKey || event.metaKey) {
        editor.select([id], 'toggle');
      } else {
        editor.select([id], 'replace');
      }
      invalidate();
    };

    element.addEventListener('click', onClick);
    return () => element.removeEventListener('click', onClick);
  }, [gl, camera, invalidate, activeTool, fieldRef]);

  return null;
}
