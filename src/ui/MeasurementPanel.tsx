/**
 * Measurement panel (P24).
 *
 * The kind selector configures the `measure` tool; every document mutation
 * (delete, clear all) is dispatched to the editor store so it flows through a
 * domain command and remains undoable. Activating the measure tool is UI-only.
 */

import type { MeasurementKind } from '@/domain';
import { formatMeasurementValue, useEditorStore } from '@/editor';
import { useToolStore } from '@/editor/tools/toolStore';

const KINDS: ReadonlyArray<{ kind: MeasurementKind; label: string }> = [
  { kind: 'distance', label: 'Distance' },
  { kind: 'width', label: 'Width' },
  { kind: 'height', label: 'Height' },
  { kind: 'area', label: 'Area' },
  { kind: 'perimeter', label: 'Perimeter' },
];

export function MeasurementPanel() {
  const measurements = useEditorStore((state) => state.project.measurements);
  const deleteMeasurement = useEditorStore((state) => state.deleteMeasurement);
  const clearMeasurements = useEditorStore((state) => state.clearMeasurements);
  const activeTool = useToolStore((state) => state.activeTool);
  const setActiveTool = useToolStore((state) => state.setActiveTool);
  const activeMeasurementKind = useToolStore((state) => state.activeMeasurementKind);
  const setActiveMeasurementKind = useToolStore((state) => state.setActiveMeasurementKind);

  return (
    <aside className="panel measurement-panel" data-testid="measurement-panel">
      <div className="panel-header measurement-panel-header">
        <h2>Measurements</h2>
        <button
          type="button"
          className={activeTool === 'measure' ? 'tool-button active' : 'tool-button'}
          data-testid="measurement-tool"
          aria-pressed={activeTool === 'measure'}
          onClick={() => setActiveTool(activeTool === 'measure' ? 'select' : 'measure')}
        >
          Measure
        </button>
      </div>

      <div className="measurement-body">
        <label className="measurement-field">
          <span className="measurement-field-label">Kind</span>
          <select
            className="pattern-select"
            data-testid="measurement-kind"
            value={activeMeasurementKind}
            onChange={(event) =>
              setActiveMeasurementKind(event.target.value as MeasurementKind)
            }
          >
            {KINDS.map((entry) => (
              <option key={entry.kind} value={entry.kind}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="prefab-action"
          data-testid="measurement-clear"
          disabled={measurements.length === 0}
          onClick={() => clearMeasurements()}
        >
          Clear all
        </button>
      </div>

      {measurements.length === 0 ? (
        <p className="panel-placeholder" data-testid="measurement-empty">
          No measurements.
        </p>
      ) : (
        <ul className="measurement-list" data-testid="measurement-list">
          {measurements.map((measurement) => (
            <li
              key={measurement.id}
              className="measurement-item"
              data-testid="measurement-item"
            >
              <span className="measurement-item-kind">{measurement.kind}</span>
              <span
                className="measurement-item-value"
                data-testid={`measurement-value-${measurement.id}`}
              >
                {formatMeasurementValue(measurement.kind, measurement.value)}
              </span>
              <button
                type="button"
                className="prefab-action"
                data-testid={`measurement-delete-${measurement.id}`}
                onClick={() => deleteMeasurement(measurement.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
