/**
 * Construction progress panel (P34).
 *
 * Read-only summary of build states: how many pieces are planned, collected,
 * built and remaining, with a completion bar. Also breaks progress down per
 * floor. Uses the pure `computeConstructionProgress` helper.
 */

import { useMemo } from 'react';
import type { Floor } from '@/domain';
import { computeConstructionProgress, filterPiecesByFloor } from '@/resources';
import { useEditorStore } from '@/editor';

function sortFloors(floors: readonly Floor[]): Floor[] {
  return [...floors].sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));
}

export function ProgressPanel() {
  const pieces = useEditorStore((state) => state.project.pieces);
  const floors = useEditorStore((state) => state.project.floors);

  const progress = useMemo(() => computeConstructionProgress(pieces), [pieces]);
  const floorProgress = useMemo(
    () =>
      sortFloors(floors).map((floor) => ({
        floor,
        progress: computeConstructionProgress(filterPiecesByFloor(pieces, floor.id)),
      })),
    [floors, pieces],
  );

  return (
    <aside className="panel progress-panel" data-testid="progress-panel" aria-label="Progress">
      <div className="panel-header">
        <h2>Progress</h2>
      </div>

      <div className="progress-body">
        <div className="progress-summary">
          <span className="progress-stat">
            Total: <strong data-testid="progress-total">{progress.total}</strong>
          </span>
          <span className="progress-stat">
            Built: <strong data-testid="progress-built">{progress.built}</strong>
          </span>
          <span className="progress-stat">
            Collected: <strong data-testid="progress-collected">{progress.collected}</strong>
          </span>
          <span className="progress-stat">
            Planned: <strong data-testid="progress-planned">{progress.planned}</strong>
          </span>
          <span className="progress-stat">
            Remaining: <strong data-testid="progress-remaining">{progress.remaining}</strong>
          </span>
          <span className="progress-stat">
            Complete:{' '}
            <strong data-testid="progress-percent">{progress.percentComplete}%</strong>
          </span>
        </div>

        <div
          className="progress-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percentComplete}
          data-testid="progress-bar"
        >
          <div
            className="progress-bar-fill"
            data-testid="progress-bar-fill"
            style={{ width: `${progress.percentComplete}%` }}
          />
        </div>

        {floorProgress.length > 0 ? (
          <ul className="progress-floor-list" data-testid="progress-floor-list">
            {floorProgress.map(({ floor, progress: floorStats }) => (
              <li
                key={floor.id}
                className="progress-floor-item"
                data-testid={`progress-floor-${floor.id}`}
              >
                <span className="progress-floor-name">{floor.name}</span>
                <span className="progress-floor-counts">
                  {floorStats.built} / {floorStats.total}
                </span>
                <span
                  className="progress-floor-percent"
                  data-testid={`progress-floor-percent-${floor.id}`}
                >
                  {floorStats.percentComplete}%
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}
