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
import { Panel } from './Panel';

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

  const measuring = activeTool === 'measure';

  return (
    <Panel
      title="Measurements"
      testId="measurement-panel"
      ariaLabel="Measurements"
      className="measurement-panel"
      actions={
        <button
          type="button"
          className={measuring ? 'button small active' : 'button small'}
          data-testid="measurement-tool"
          aria-pressed={measuring}
          onClick={() => setActiveTool(measuring ? 'select' : 'measure')}
        >
          Measure
        </button>
      }
    >
      <div className="panel-toolbar row">
        <label className="field">
          <span className="field-label">Kind</span>
          <select
            className="select"
            data-testid="measurement-kind"
            value={activeMeasurementKind}
            onChange={(event) => setActiveMeasurementKind(event.target.value as MeasurementKind)}
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
          className="button small"
          data-testid="measurement-clear"
          disabled={measurements.length === 0}
          onClick={() => clearMeasurements()}
        >
          Clear all
        </button>
      </div>

      {measurements.length === 0 ? (
        <p className="empty" data-testid="measurement-empty">
          No measurements.
        </p>
      ) : (
        <ul className="list" data-testid="measurement-list">
          {measurements.map((measurement) => (
            <li
              key={measurement.id}
              className="list-item static"
              data-testid="measurement-item"
            >
              <div className="list-item-main">
                <span className="list-item-meta">{measurement.kind}</span>
                <span
                  className="list-item-name mono"
                  data-testid={`measurement-value-${measurement.id}`}
                >
                  {formatMeasurementValue(measurement.kind, measurement.value)}
                </span>
              </div>
              <button
                type="button"
                className="button small danger"
                data-testid={`measurement-delete-${measurement.id}`}
                onClick={() => deleteMeasurement(measurement.id)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
