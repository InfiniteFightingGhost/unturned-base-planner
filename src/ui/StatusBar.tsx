/**
 * Bottom status/materials bar. Reports document totals, selection size, the
 * active floor and a per-category breakdown. The inventory-ready totals
 * placeholder (real `expandToRaw` call) is explicitly deferred: for now the bar
 * shows piece counts only.
 */

import { useMemo } from 'react';
import type { PieceCategory } from '@/domain';
import { useEditorStore } from '@/editor';
import { DATASET } from '@/data';

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

  return (
    <footer className="status-bar" data-testid="status-bar">
      <span className="status-item">
        Pieces:{' '}
        <strong data-testid="piece-count">{pieces.length}</strong>
      </span>
      <span className="status-item">
        Selected: <strong data-testid="selected-count">{selection.length}</strong>
      </span>
      <span className="status-item">
        Floor:{' '}
        <strong data-testid="active-floor">{activeFloor?.name ?? '—'}</strong>
      </span>
      <span className="status-item status-categories" data-testid="category-counts">
        {categoryCounts.length === 0
          ? 'No pieces placed'
          : categoryCounts.map(([category, count]) => `${category}: ${count}`).join('  ·  ')}
      </span>
      <span className="status-item status-placeholder">Materials: pending raw expansion</span>
    </footer>
  );
}
