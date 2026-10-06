/**
 * Top toolbar: tool switching, document actions and camera views.
 *
 * All document actions go through the editor store so they are undoable; the
 * camera buttons drive the engine store's camera mode. Undo/redo disabled state
 * comes from the narrow `selectCanUndo` / `selectCanRedo` selectors.
 */

import { selectCanRedo, selectCanUndo, useEditorStore } from '@/editor';
import { useEngineStore } from '@/engine';
import type { CameraMode } from '@/engine';
import { useToolStore } from '@/editor/tools/toolStore';
import type { ActiveTool } from '@/editor/tools/toolStore';

const TOOLS: ReadonlyArray<{ id: ActiveTool; label: string }> = [
  { id: 'select', label: 'Select' },
  { id: 'place', label: 'Place' },
  { id: 'move', label: 'Move' },
  { id: 'rotate', label: 'Rotate' },
];

const CAMERA_VIEWS: ReadonlyArray<{ mode: CameraMode; label: string }> = [
  { mode: 'ORBIT', label: 'Perspective' },
  { mode: 'TOP_DOWN', label: 'Top' },
  { mode: 'FRONT', label: 'Front' },
];

export function Toolbar() {
  const activeTool = useToolStore((state) => state.activeTool);
  const setActiveTool = useToolStore((state) => state.setActiveTool);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const deleteSelected = useEditorStore((state) => state.deleteSelected);
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected);
  const cameraMode = useEngineStore((state) => state.cameraMode);
  const setCameraMode = useEngineStore((state) => state.setCameraMode);

  return (
    <div className="toolbar" data-testid="toolbar">
      <div className="toolbar-group" role="group" aria-label="Tools">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            data-testid={`tool-${tool.id}`}
            className={activeTool === tool.id ? 'tool-button active' : 'tool-button'}
            aria-pressed={activeTool === tool.id}
            onClick={() => setActiveTool(tool.id)}
          >
            {tool.label}
          </button>
        ))}
      </div>

      <div className="toolbar-group" role="group" aria-label="History">
        <button
          type="button"
          className="tool-button"
          data-testid="undo"
          disabled={!canUndo}
          onClick={() => undo()}
        >
          Undo
        </button>
        <button
          type="button"
          className="tool-button"
          data-testid="redo"
          disabled={!canRedo}
          onClick={() => redo()}
        >
          Redo
        </button>
      </div>

      <div className="toolbar-group" role="group" aria-label="Edit">
        <button
          type="button"
          className="tool-button"
          data-testid="duplicate"
          onClick={() => duplicateSelected([1, 0, 0])}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="tool-button"
          data-testid="delete"
          onClick={() => deleteSelected()}
        >
          Delete
        </button>
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-group" role="group" aria-label="Camera">
        {CAMERA_VIEWS.map((view) => (
          <button
            key={view.mode}
            type="button"
            className={cameraMode === view.mode ? 'tool-button active' : 'tool-button'}
            data-testid={`view-${view.mode.toLowerCase()}`}
            onClick={() => setCameraMode(view.mode)}
          >
            {view.label}
          </button>
        ))}
      </div>
    </div>
  );
}
