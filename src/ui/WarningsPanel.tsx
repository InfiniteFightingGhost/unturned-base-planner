/**
 * `WarningsPanel`: lists the current design warnings and lets the user jump to
 * the affected pieces. Warnings are pure derived data (`computeDesignWarnings`),
 * recomputed only when the piece list changes; the panel is docked in the right
 * inspector and never mutates the document.
 */

import { useMemo } from 'react';
import { computeDesignWarnings, useEditorStore } from '@/editor';
import type { DesignWarning } from '@/editor';
import { DATASET } from '@/data';
import { Panel } from './Panel';

function WarningRow({ warning }: { warning: DesignWarning }) {
  const select = useEditorStore((state) => state.select);
  const count = warning.pieceIds.length;

  return (
    <li>
      <button
        type="button"
        className={`warning-item warning-${warning.severity}`}
        data-testid={`warning-item-${warning.code}`}
        onClick={() => select(warning.pieceIds, 'replace')}
      >
        <span className="warning-badge" aria-hidden="true">
          {count}
        </span>
        <span className="warning-text">{warning.message}</span>
      </button>
    </li>
  );
}

export function WarningsPanel() {
  const pieces = useEditorStore((state) => state.project.pieces);
  const warnings = useMemo(
    () => computeDesignWarnings(pieces, DATASET.definitionById),
    [pieces],
  );

  return (
    <Panel
      title="Warnings"
      testId="warnings-panel"
      headingTestId="warnings-panel-heading"
      ariaLabel="Design warnings"
      className="warnings-panel"
      actions={
        <span className="panel-count mono" data-testid="warning-count">
          {warnings.length}
        </span>
      }
    >
      {warnings.length === 0 ? (
        <p className="empty">No issues</p>
      ) : (
        <ul className="warning-list" data-testid="warning-list">
          {warnings.map((warning) => (
            <WarningRow key={warning.code} warning={warning} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
