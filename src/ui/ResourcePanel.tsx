/**
 * Resource breakdown panel (P28).
 *
 * Aggregates the raw materials required by the placed pieces using the pure
 * `@/resources` calculator, grouped by all pieces, floor, zone or category.
 * Purely read-only: it never mutates the document. Raw amounts come from
 * `expandToRaw` through the calculator and are always sorted by resource id.
 */

import { useMemo, useState } from 'react';
import type { Floor, PlacedPiece, ResourceAmount, Zone } from '@/domain';
import { DATASET } from '@/data';
import {
  createResourceCalculator,
  filterPiecesByFloor,
  filterPiecesByZone,
} from '@/resources';
import { useEditorStore } from '@/editor';

type Grouping = 'all' | 'floor' | 'zone' | 'category';

const GROUPINGS: ReadonlyArray<{ value: Grouping; label: string }> = [
  { value: 'all', label: 'All pieces' },
  { value: 'floor', label: 'By floor' },
  { value: 'zone', label: 'By zone' },
  { value: 'category', label: 'By category' },
];

function resourceName(resourceId: string): string {
  return DATASET.resourceById.get(resourceId)?.name ?? resourceId;
}

function sortFloors(floors: readonly Floor[]): Floor[] {
  return [...floors].sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));
}

function sortZones(zones: readonly Zone[]): Zone[] {
  return [...zones].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function unassignedCount(pieces: readonly PlacedPiece[]): number {
  return pieces.filter((piece) => piece.zoneId === null).length;
}

function AmountList({
  amounts,
  testIdPrefix,
}: {
  amounts: readonly ResourceAmount[];
  testIdPrefix: string;
}) {
  if (amounts.length === 0) {
    return <p className="resource-empty">No materials</p>;
  }
  return (
    <ul className="resource-amounts">
      {amounts.map((entry) => (
        <li
          key={entry.resourceId}
          className="resource-amount"
          data-testid={`${testIdPrefix}-${entry.resourceId}`}
        >
          <span className="resource-amount-name">{resourceName(entry.resourceId)}</span>
          <span className="resource-amount-value">{entry.amount}</span>
        </li>
      ))}
    </ul>
  );
}

export function ResourcePanel() {
  const pieces = useEditorStore((state) => state.project.pieces);
  const floors = useEditorStore((state) => state.project.floors);
  const zones = useEditorStore((state) => state.project.zones);
  const [grouping, setGrouping] = useState<Grouping>('all');

  const calculator = useMemo(() => createResourceCalculator(DATASET), []);
  const totals = useMemo(() => calculator.computeTotals(pieces), [calculator, pieces]);

  return (
    <aside className="panel resource-panel" data-testid="resource-panel" aria-label="Resources">
      <div className="panel-header resource-panel-header">
        <h2>Resources</h2>
      </div>

      <div className="resource-controls">
        <label className="resource-field">
          <span className="resource-field-label">Group by</span>
          <select
            className="pattern-select"
            data-testid="resource-grouping"
            value={grouping}
            onChange={(event) => setGrouping(event.target.value as Grouping)}
          >
            {GROUPINGS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {grouping === 'all' ? (
        <div className="resource-group" data-testid="resource-group-all">
          <div className="resource-group-header">
            <span className="resource-group-title">All pieces</span>
            <span className="resource-group-count" data-testid="resource-count-all">
              {totals.pieceCount} pieces
            </span>
          </div>
          <AmountList amounts={totals.raw} testIdPrefix="resource-amount" />
        </div>
      ) : null}

      {grouping === 'category' ? (
        <div className="resource-groups" data-testid="resource-groups-category">
          {totals.byCategory.length === 0 ? (
            <p className="panel-placeholder">No pieces placed.</p>
          ) : (
            totals.byCategory.map((entry) => (
              <div
                key={entry.category}
                className="resource-group"
                data-testid={`resource-category-${entry.category}`}
              >
                <div className="resource-group-header">
                  <span className="resource-group-title">{entry.category}</span>
                  <span className="resource-group-count">{entry.placedCount} pieces</span>
                </div>
                <AmountList
                  amounts={entry.raw}
                  testIdPrefix={`resource-amount-category-${entry.category}`}
                />
              </div>
            ))
          )}
        </div>
      ) : null}

      {grouping === 'floor' ? (
        <div className="resource-groups" data-testid="resource-groups-floor">
          {floors.length === 0 ? (
            <p className="panel-placeholder">No floors.</p>
          ) : (
            sortFloors(floors).map((floor) => {
              const groupPieces = filterPiecesByFloor(pieces, floor.id);
              const raw = calculator.computeRawRequirements(groupPieces);
              return (
                <div
                  key={floor.id}
                  className="resource-group"
                  data-testid={`resource-floor-${floor.id}`}
                >
                  <div className="resource-group-header">
                    <span className="resource-group-title">{floor.name}</span>
                    <span
                      className="resource-group-count"
                      data-testid={`resource-count-floor-${floor.id}`}
                    >
                      {groupPieces.length} pieces
                    </span>
                  </div>
                  <AmountList
                    amounts={raw}
                    testIdPrefix={`resource-amount-floor-${floor.id}`}
                  />
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {grouping === 'zone' ? (
        <div className="resource-groups" data-testid="resource-groups-zone">
          {zones.length === 0 ? <p className="panel-placeholder">No zones.</p> : null}
          {sortZones(zones).map((zone) => {
            const groupPieces = filterPiecesByZone(pieces, zone.id);
            const raw = calculator.computeRawRequirements(groupPieces);
            return (
              <div
                key={zone.id}
                className="resource-group"
                data-testid={`resource-zone-${zone.id}`}
              >
                <div className="resource-group-header">
                  <span className="resource-group-title">{zone.name}</span>
                  <span
                    className="resource-group-count"
                    data-testid={`resource-count-zone-${zone.id}`}
                  >
                    {groupPieces.length} pieces
                  </span>
                </div>
                <AmountList amounts={raw} testIdPrefix={`resource-amount-zone-${zone.id}`} />
              </div>
            );
          })}
          {unassignedCount(pieces) > 0 ? (
            <div className="resource-group" data-testid="resource-zone-unassigned">
              <div className="resource-group-header">
                <span className="resource-group-title">Unassigned</span>
                <span
                  className="resource-group-count"
                  data-testid="resource-count-zone-unassigned"
                >
                  {unassignedCount(pieces)} pieces
                </span>
              </div>
              <AmountList
                amounts={calculator.computeRawRequirements(filterPiecesByZone(pieces, null))}
                testIdPrefix="resource-amount-zone-unassigned"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
