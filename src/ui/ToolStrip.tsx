/**
 * ToolStrip: the 46px vertical tool rail on the left edge.
 *
 * Icon buttons map one-to-one onto the transient tool store; Blueprint is a
 * view toggle backed by the engine store rather than an `ActiveTool`. Active
 * state uses the Blender-orange accent. Every button carries an `aria-label`
 * and a native `title` tooltip.
 */

import { useEngineStore } from '@/engine';
import { useToolStore } from '@/editor/tools/toolStore';
import type { ActiveTool } from '@/editor/tools/toolStore';
import {
  IconBlueprint,
  IconMeasure,
  IconMove,
  IconPlace,
  IconRotate,
  IconSelect,
} from './icons';

interface ToolSpec {
  readonly id: ActiveTool;
  readonly label: string;
  readonly hint: string;
  readonly Icon: typeof IconSelect;
}

const TOOLS: readonly ToolSpec[] = [
  { id: 'select', label: 'Select', hint: 'Select (V)', Icon: IconSelect },
  { id: 'place', label: 'Place', hint: 'Place piece (B)', Icon: IconPlace },
  { id: 'move', label: 'Move', hint: 'Move (G)', Icon: IconMove },
  { id: 'rotate', label: 'Rotate', hint: 'Rotate (R)', Icon: IconRotate },
  { id: 'measure', label: 'Measure', hint: 'Measure (M)', Icon: IconMeasure },
];

export function ToolStrip() {
  const activeTool = useToolStore((state) => state.activeTool);
  const setActiveTool = useToolStore((state) => state.setActiveTool);
  const blueprint = useEngineStore((state) => state.blueprint);
  const toggleBlueprint = useEngineStore((state) => state.toggleBlueprint);

  return (
    <nav className="tool-strip" data-testid="toolbar" aria-label="Tools">
      {TOOLS.map((tool) => {
        const active = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            data-testid={`tool-${tool.id}`}
            className={active ? 'tool-button active' : 'tool-button'}
            aria-label={tool.label}
            title={tool.hint}
            aria-pressed={active}
            onClick={() => setActiveTool(tool.id)}
          >
            <tool.Icon />
          </button>
        );
      })}

      <span className="tool-strip-divider" aria-hidden="true" />

      <button
        type="button"
        data-testid="tool-blueprint"
        className={blueprint ? 'tool-button active' : 'tool-button'}
        aria-label="Blueprint overlay"
        title="Blueprint overlay"
        aria-pressed={blueprint}
        onClick={() => toggleBlueprint()}
      >
        <IconBlueprint />
      </button>
    </nav>
  );
}
