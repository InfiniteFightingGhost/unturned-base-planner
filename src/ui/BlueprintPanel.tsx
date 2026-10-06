/**
 * Blueprint panel (P22/P23): toggles the outline overlay and drives the camera
 * into the orthographic elevation views.
 *
 * Blueprint visibility lives in the engine store (UI-only, never persisted) and
 * the view buttons reuse the existing camera-mode taxonomy, so no new camera
 * code is introduced here.
 */

import { useEngineStore } from '@/engine';
import type { CameraMode } from '@/engine';

const VIEWS: ReadonlyArray<{ mode: CameraMode; label: string }> = [
  { mode: 'TOP_DOWN', label: 'Top' },
  { mode: 'FRONT', label: 'Front' },
  { mode: 'BACK', label: 'Back' },
  { mode: 'LEFT', label: 'Left' },
  { mode: 'RIGHT', label: 'Right' },
];

export function BlueprintPanel() {
  const blueprint = useEngineStore((state) => state.blueprint);
  const toggleBlueprint = useEngineStore((state) => state.toggleBlueprint);
  const cameraMode = useEngineStore((state) => state.cameraMode);
  const setCameraMode = useEngineStore((state) => state.setCameraMode);

  return (
    <aside className="panel blueprint-panel" data-testid="blueprint-panel">
      <div className="panel-header blueprint-panel-header">
        <h2>Blueprint</h2>
        <button
          type="button"
          className={blueprint ? 'tool-button active' : 'tool-button'}
          data-testid="toggle-blueprint"
          aria-pressed={blueprint}
          onClick={() => toggleBlueprint()}
        >
          {blueprint ? 'On' : 'Off'}
        </button>
      </div>

      <div className="blueprint-body">
        <div className="blueprint-views" role="group" aria-label="Elevation views">
          {VIEWS.map((view) => (
            <button
              key={view.mode}
              type="button"
              className={cameraMode === view.mode ? 'tool-button active' : 'tool-button'}
              data-testid={`blueprint-view-${view.mode.toLowerCase()}`}
              onClick={() => setCameraMode(view.mode)}
            >
              {view.label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
