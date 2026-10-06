/**
 * Right properties inspector (P52 partial). Shows read-only identity/transform
 * details for a single selected piece and lets the user change its build state
 * through a command so the edit is undoable.
 */

import type { BuildState } from '@/domain';
import { useEditorStore } from '@/editor';
import { DATASET } from '@/data';
import { Panel } from './Panel';

const BUILD_STATES: readonly BuildState[] = ['planned', 'collected', 'built'];

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function formatDegrees(radians: number): string {
  const degrees = (radians * 180) / Math.PI;
  return `${Math.round(degrees * 100) / 100}°`;
}

export function PropertiesPanel() {
  const selection = useEditorStore((state) => state.selection);
  const pieces = useEditorStore((state) => state.project.pieces);
  const floors = useEditorStore((state) => state.project.floors);
  const zones = useEditorStore((state) => state.project.zones);
  const setSelectedBuildState = useEditorStore((state) => state.setSelectedBuildState);

  const selectedId = selection.length === 1 ? selection[0] : undefined;
  const piece = selectedId === undefined ? undefined : pieces.find((p) => p.id === selectedId);
  const zone = piece === undefined ? undefined : zones.find((z) => z.id === piece.zoneId);
  const tags = piece?.metadata.tags ?? [];

  return (
    <Panel
      title="Properties"
      testId="properties-panel"
      ariaLabel="Properties"
      className="properties-panel"
    >
      {piece === undefined ? (
        <p className="empty">
          {selection.length === 0 ? 'Nothing selected.' : `${selection.length} pieces selected.`}
        </p>
      ) : (
        <div className="property-list">
          <div className="property-row">
            <span className="property-label">Name</span>
            <span className="property-value" data-testid="prop-name">
              {DATASET.definitionById.get(piece.definitionId)?.name ?? piece.definitionId}
            </span>
          </div>
          <div className="property-row">
            <span className="property-label">Position</span>
            <span className="property-value mono" data-testid="prop-position">
              {piece.position.map((component) => formatNumber(component)).join(', ')}
            </span>
          </div>
          <div className="property-row">
            <span className="property-label">Rotation</span>
            <span className="property-value mono">{formatDegrees(piece.rotation[1])}</span>
          </div>
          <div className="property-row">
            <span className="property-label">Floor</span>
            <span className="property-value">
              {floors.find((floor) => floor.id === piece.floorId)?.name ?? 'floor'}
            </span>
          </div>
          <div className="property-row">
            <span className="property-label">Zone</span>
            <span className="property-value" data-testid="prop-zone">
              {zone?.name ?? piece.zoneId ?? '—'}
            </span>
          </div>
          <div className="property-row">
            <span className="property-label">Tags</span>
            <span className="property-value" data-testid="prop-tags">
              {tags.length === 0 ? '—' : tags.join(', ')}
            </span>
          </div>
          <div className="property-row">
            <span className="property-label">Build state</span>
            <select
              className="select"
              data-testid="prop-build-state"
              aria-label="Build state"
              value={piece.buildState}
              onChange={(event) => setSelectedBuildState(event.target.value as BuildState)}
            >
              {BUILD_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </Panel>
  );
}
