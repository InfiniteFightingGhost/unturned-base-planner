/**
 * Bottom status/materials bar. Reports document totals, selection size, the
 * active floor and a per-category breakdown. All numeric cells use the
 * monospace face so columns stay aligned as counts change.
 */

import { useMemo } from 'react';
import type { PieceCategory } from '@/domain';
import { useEditorStore } from '@/editor';
import { DATASET } from '@/data';
import { computeConstructionProgress } from '@/resources';

export function StatusBar() {
  const pieces = useEditorStore((state) => state.project.pieces);
  const selection = useEditorStore((state) => state.selection);
  const floors = useEditorStore((state) => state.project.floors);
  const activeFloorId = useEditorStore((state) => state.activeFloorId);

  const categoryCounts = useMemo(() => {
    const counts = new Map<PieceCategory, number>();
    for (const piece of pieces) {
      const definition = DATASET.definitionById.get(piece.definitionId);
      if (definition === undefined) {
        continue;
      }
      counts.set(definition.category, (counts.get(definition.category) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
  }, [pieces]);

  const activeFloor = floors.find((floor) => floor.id === activeFloorId);

  const progress = useMemo(() => computeConstructionProgress(pieces), [pieces]);

  return (
    <footer className="status-bar" data-testid="status-bar">
      <span className="status-item">
        Pieces <strong className="mono" data-testid="piece-count">{pieces.length}</strong>
      </span>
      <span className="status-item">
        Built{' '}
        <strong className="mono" data-testid="status-built">
          {progress.built}/{progress.total}
        </strong>
        <span className="status-percent mono">{progress.percentComplete}%</span>
      </span>
      <span className="status-item">
        Selected <strong className="mono" data-testid="selected-count">{selection.length}</strong>
      </span>
      <span className="status-item">
        Floor <strong data-testid="active-floor">{activeFloor?.name ?? '—'}</strong>
      </span>
      <span className="status-item status-categories" data-testid="category-counts">
        {categoryCounts.length === 0
          ? 'No pieces placed'
          : categoryCounts.map(([category, count]) => `${category}:${count}`).join('  ·  ')}
      </span>
      <span className="status-spacer" />
      <span className="status-item status-placeholder mono">Materials: pending raw expansion</span>
    </footer>
  );
}
