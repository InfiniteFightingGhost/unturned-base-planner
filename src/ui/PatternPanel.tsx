/**
 * Pattern tools panel (P18–P20): linear / grid / radial / mirror replication.
 *
 * The panel is a compact, collapsible section that captures its parameters in
 * local state and dispatches a single pattern command to the editor store on
 * Apply. Because every dispatch is one domain command, each pattern application
 * is a single undo step.
 *
 * All pattern commands operate on the current selection. When nothing is
 * selected the controls are disabled and a hint is shown. Numeric inputs are
 * validated (counts are integers within `[1, MAX_COUNT]`, dimensions/spacing
 * within their ranges); Apply is disabled while any input is invalid.
 *
 * Radial patterns are centred on the selection's horizontal centroid, since no
 * explicit centre is exposed.
 */

import { useMemo, useState } from 'react';
import type { PlacedPiece, Vec3 } from '@/domain';
import {
  createGridArrayCommand,
  createLinearArrayCommand,
  createMirrorCommand,
  createRadialArrayCommand,
  useEditorStore,
} from '@/editor';

const MAX_COUNT = 200;
const MAX_SPACING = 100;
const MAX_RADIUS = 1000;

type Direction = 'x' | 'z';

function parseIntInRange(raw: string, min: number, max: number): number | null {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    return null;
  }
  return value;
}

function parseNumberInRange(raw: string, min: number, max: number): number | null {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    return null;
  }
  return value;
}

function centroidOf(pieces: readonly PlacedPiece[]): Vec3 {
  if (pieces.length === 0) {
    return [0, 0, 0];
  }
  let x = 0;
  let y = 0;
  let z = 0;
  for (const piece of pieces) {
    x += piece.position[0];
    y += piece.position[1];
    z += piece.position[2];
  }
  const count = pieces.length;
  return [x / count, y / count, z / count];
}

export function PatternPanel() {
  const selection = useEditorStore((state) => state.selection);
  const allPieces = useEditorStore((state) => state.project.pieces);
  const executeCommand = useEditorStore((state) => state.executeCommand);

  const [open, setOpen] = useState(true);

  const [linearCount, setLinearCount] = useState('3');
  const [linearSpacing, setLinearSpacing] = useState('2');
  const [linearDirection, setLinearDirection] = useState<Direction>('x');

  const [gridRows, setGridRows] = useState('2');
  const [gridCols, setGridCols] = useState('2');
  const [gridSpacingX, setGridSpacingX] = useState('2');
  const [gridSpacingZ, setGridSpacingZ] = useState('2');

  const [radialCount, setRadialCount] = useState('4');
  const [radialRadius, setRadialRadius] = useState('4');
  const [radialAngle, setRadialAngle] = useState('360');

  const selectedPieces = useMemo(() => {
    const wanted = new Set(selection);
    return allPieces.filter((piece) => wanted.has(piece.id));
  }, [selection, allPieces]);

  const hasSelection = selectedPieces.length > 0;
  const center = useMemo(() => centroidOf(selectedPieces), [selectedPieces]);

  const linearCountValue = parseIntInRange(linearCount, 1, MAX_COUNT);
  const linearSpacingValue = parseNumberInRange(linearSpacing, -MAX_SPACING, MAX_SPACING);

  const gridRowsValue = parseIntInRange(gridRows, 1, MAX_COUNT);
  const gridColsValue = parseIntInRange(gridCols, 1, MAX_COUNT);
  const gridSpacingXValue = parseNumberInRange(gridSpacingX, -MAX_SPACING, MAX_SPACING);
  const gridSpacingZValue = parseNumberInRange(gridSpacingZ, -MAX_SPACING, MAX_SPACING);

  const radialCountValue = parseIntInRange(radialCount, 1, MAX_COUNT);
  const radialRadiusValue = parseNumberInRange(radialRadius, 0, MAX_RADIUS);
  const radialAngleValue = parseNumberInRange(radialAngle, 0, 360);

  const applyLinear = (): void => {
    if (!hasSelection || linearCountValue === null || linearSpacingValue === null) {
      return;
    }
    const direction: Vec3 = linearDirection === 'x' ? [1, 0, 0] : [0, 0, 1];
    executeCommand(
      createLinearArrayCommand(
        selectedPieces,
        linearCountValue,
        linearSpacingValue,
        direction,
      ),
    );
  };

  const applyGrid = (): void => {
    if (
      !hasSelection ||
      gridRowsValue === null ||
      gridColsValue === null ||
      gridSpacingXValue === null ||
      gridSpacingZValue === null
    ) {
      return;
    }
    executeCommand(
      createGridArrayCommand(
        selectedPieces,
        gridRowsValue,
        gridColsValue,
        gridSpacingXValue,
        gridSpacingZValue,
      ),
    );
  };

  const applyRadial = (): void => {
    if (!hasSelection || radialCountValue === null || radialRadiusValue === null || radialAngleValue === null) {
      return;
    }
    const totalAngleRadians = (radialAngleValue * Math.PI) / 180;
    executeCommand(
      createRadialArrayCommand(
        selectedPieces,
        radialCountValue,
        radialRadiusValue,
        totalAngleRadians,
        center,
      ),
    );
  };

  const applyMirror = (axis: Direction): void => {
    if (!hasSelection) {
      return;
    }
    executeCommand(createMirrorCommand(selectedPieces, axis));
  };

  return (
    <aside className="panel pattern-panel" data-testid="pattern-panel" aria-label="Patterns">
      <div className="panel-header pattern-panel-header">
        <h2>Patterns</h2>
        <button
          type="button"
          className="tool-button"
          data-testid="pattern-toggle"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      {open ? (
        hasSelection ? (
          <div className="pattern-body">
            <section className="pattern-section">
              <h3>Linear</h3>
              <div className="pattern-row">
                <label className="pattern-field">
                  <span className="pattern-field-label">Count</span>
                  <input
                    type="number"
                    className="pattern-input"
                    data-testid="pattern-linear-count"
                    min={1}
                    max={MAX_COUNT}
                    step={1}
                    value={linearCount}
                    onChange={(event) => setLinearCount(event.target.value)}
                  />
                </label>
                <label className="pattern-field">
                  <span className="pattern-field-label">Spacing</span>
                  <input
                    type="number"
                    className="pattern-input"
                    data-testid="pattern-linear-spacing"
                    step={0.25}
                    value={linearSpacing}
                    onChange={(event) => setLinearSpacing(event.target.value)}
                  />
                </label>
                <label className="pattern-field">
                  <span className="pattern-field-label">Axis</span>
                  <select
                    className="pattern-select"
                    data-testid="pattern-linear-direction"
                    value={linearDirection}
                    onChange={(event) => setLinearDirection(event.target.value as Direction)}
                  >
                    <option value="x">X</option>
                    <option value="z">Z</option>
                  </select>
                </label>
              </div>
              <button
                type="button"
                className="pattern-apply"
                data-testid="pattern-linear-apply"
                disabled={linearCountValue === null || linearSpacingValue === null}
                onClick={applyLinear}
              >
                Apply linear
              </button>
            </section>

            <section className="pattern-section">
              <h3>Grid</h3>
              <div className="pattern-row">
                <label className="pattern-field">
                  <span className="pattern-field-label">Rows</span>
                  <input
                    type="number"
                    className="pattern-input"
                    data-testid="pattern-grid-rows"
                    min={1}
                    max={MAX_COUNT}
                    step={1}
                    value={gridRows}
                    onChange={(event) => setGridRows(event.target.value)}
                  />
                </label>
                <label className="pattern-field">
                  <span className="pattern-field-label">Cols</span>
                  <input
                    type="number"
                    className="pattern-input"
                    data-testid="pattern-grid-cols"
                    min={1}
                    max={MAX_COUNT}
                    step={1}
                    value={gridCols}
                    onChange={(event) => setGridCols(event.target.value)}
                  />
                </label>
                <label className="pattern-field">
                  <span className="pattern-field-label">Spacing X</span>
                  <input
                    type="number"
                    className="pattern-input"
                    data-testid="pattern-grid-spacing-x"
                    step={0.25}
                    value={gridSpacingX}
                    onChange={(event) => setGridSpacingX(event.target.value)}
                  />
                </label>
                <label className="pattern-field">
                  <span className="pattern-field-label">Spacing Z</span>
                  <input
                    type="number"
                    className="pattern-input"
                    data-testid="pattern-grid-spacing-z"
                    step={0.25}
                    value={gridSpacingZ}
                    onChange={(event) => setGridSpacingZ(event.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="pattern-apply"
                data-testid="pattern-grid-apply"
                disabled={
                  gridRowsValue === null ||
                  gridColsValue === null ||
                  gridSpacingXValue === null ||
                  gridSpacingZValue === null
                }
                onClick={applyGrid}
              >
                Apply grid
              </button>
            </section>

            <section className="pattern-section">
              <h3>Radial</h3>
              <div className="pattern-row">
                <label className="pattern-field">
                  <span className="pattern-field-label">Count</span>
                  <input
                    type="number"
                    className="pattern-input"
                    data-testid="pattern-radial-count"
                    min={1}
                    max={MAX_COUNT}
                    step={1}
                    value={radialCount}
                    onChange={(event) => setRadialCount(event.target.value)}
                  />
                </label>
                <label className="pattern-field">
                  <span className="pattern-field-label">Radius</span>
                  <input
                    type="number"
                    className="pattern-input"
                    data-testid="pattern-radial-radius"
                    min={0}
                    step={0.25}
                    value={radialRadius}
                    onChange={(event) => setRadialRadius(event.target.value)}
                  />
                </label>
                <label className="pattern-field">
                  <span className="pattern-field-label">Angle°</span>
                  <input
                    type="number"
                    className="pattern-input"
                    data-testid="pattern-radial-angle"
                    min={0}
                    max={360}
                    step={5}
                    value={radialAngle}
                    onChange={(event) => setRadialAngle(event.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="pattern-apply"
                data-testid="pattern-radial-apply"
                disabled={
                  radialCountValue === null ||
                  radialRadiusValue === null ||
                  radialAngleValue === null
                }
                onClick={applyRadial}
              >
                Apply radial
              </button>
            </section>

            <section className="pattern-section">
              <h3>Mirror</h3>
              <div className="pattern-row">
                <button
                  type="button"
                  className="pattern-apply"
                  data-testid="pattern-mirror-x"
                  onClick={() => applyMirror('x')}
                >
                  Mirror X
                </button>
                <button
                  type="button"
                  className="pattern-apply"
                  data-testid="pattern-mirror-z"
                  onClick={() => applyMirror('z')}
                >
                  Mirror Z
                </button>
              </div>
            </section>
          </div>
        ) : (
          <p className="panel-placeholder" data-testid="pattern-hint">
            Select at least one piece to apply a pattern.
          </p>
        )
      ) : null}
    </aside>
  );
}
