/**
 * Zone panel (P25/P26). Lists zones in display order and exposes the full
 * zone-management surface: activate (click), add, delete, rename, color,
 * visibility and lock. Below the list it assigns the current selection to a
 * zone and edits the selection's tags.
 *
 * Every document mutation is dispatched to the editor store, which routes it
 * through a domain command so undo/redo works. `setActiveZone` is UI-only.
 * Name edits are committed on blur or Enter to keep one undo step per
 * meaningful edit instead of one per keystroke.
 */

import { useEffect, useState } from 'react';
import type { Zone } from '@/domain';
import { normalizeTags, sortedZones, useEditorStore, zoneStats } from '@/editor';
import { Panel } from './Panel';

function ZoneRow({
  zone,
  active,
  canDelete,
  pieceCount,
}: {
  readonly zone: Zone;
  readonly active: boolean;
  readonly canDelete: boolean;
  readonly pieceCount: number;
}) {
  const setActiveZone = useEditorStore((state) => state.setActiveZone);
  const renameZone = useEditorStore((state) => state.renameZone);
  const setZoneColor = useEditorStore((state) => state.setZoneColor);
  const setZoneVisible = useEditorStore((state) => state.setZoneVisible);
  const setZoneLocked = useEditorStore((state) => state.setZoneLocked);
  const deleteZone = useEditorStore((state) => state.deleteZone);

  const [name, setName] = useState(zone.name);

  useEffect(() => {
    setName(zone.name);
  }, [zone.name]);

  const commitName = (): void => {
    const trimmed = name.trim();
    if (trimmed !== '' && trimmed !== zone.name) {
      renameZone(zone.id, trimmed);
    } else {
      setName(zone.name);
    }
  };

  return (
    <li
      className={active ? 'list-item active' : 'list-item'}
      data-testid={`zone-item-${zone.id}`}
      data-active={active}
      onClick={() => setActiveZone(zone.id)}
    >
      <div className="list-item-main">
        <input
          type="color"
          className="zone-color-input"
          data-testid={`zone-color-${zone.id}`}
          value={zone.color}
          aria-label={`Color of ${zone.name}`}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setZoneColor(zone.id, event.target.value)}
        />
        <input
          className="input"
          data-testid={`zone-name-${zone.id}`}
          value={name}
          aria-label={`Name of ${zone.name}`}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
        />
        <span className="badge mono" data-testid={`zone-count-${zone.id}`}>
          {pieceCount}
        </span>
      </div>

      <div className="list-item-controls" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className={zone.visible ? 'button small active' : 'button small'}
          data-testid={`zone-visible-${zone.id}`}
          aria-pressed={zone.visible}
          onClick={() => setZoneVisible(zone.id, !zone.visible)}
        >
          {zone.visible ? 'Visible' : 'Hidden'}
        </button>
        <button
          type="button"
          className={zone.locked ? 'button small active' : 'button small'}
          data-testid={`zone-locked-${zone.id}`}
          aria-pressed={zone.locked}
          onClick={() => setZoneLocked(zone.id, !zone.locked)}
        >
          {zone.locked ? 'Locked' : 'Unlocked'}
        </button>
        <button
          type="button"
          className="button small danger"
          data-testid={`zone-delete-${zone.id}`}
          disabled={!canDelete}
          onClick={() => deleteZone(zone.id)}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function ZoneSelectionControls({ zones }: { readonly zones: readonly Zone[] }) {
  const selection = useEditorStore((state) => state.selection);
  const pieces = useEditorStore((state) => state.project.pieces);
  const assignSelectionToZone = useEditorStore((state) => state.assignSelectionToZone);
  const addTagToSelection = useEditorStore((state) => state.addTagToSelection);
  const removeTagFromSelection = useEditorStore((state) => state.removeTagFromSelection);

  const [tagDraft, setTagDraft] = useState('');

  const selectedIds = new Set(selection);
  const selectedPieces = pieces.filter((piece) => selectedIds.has(piece.id));
  const hasSelection = selection.length > 0;

  const zoneIds = new Set(selectedPieces.map((piece) => piece.zoneId));
  const selectedZone = zoneIds.size === 1 ? ([...zoneIds][0] ?? null) : null;
  const zoneSelectValue = selectedZone ?? '';
  const tags = normalizeTags(selectedPieces.flatMap((piece) => piece.metadata.tags));

  const commitTag = (): void => {
    const trimmed = tagDraft.trim();
    if (trimmed !== '') {
      addTagToSelection(trimmed);
    }
    setTagDraft('');
  };

  return (
    <div className="zone-selection section">
      <div className="field">
        <label className="field-label" htmlFor="selection-zone-select">
          Selection zone
        </label>
        <select
          id="selection-zone-select"
          className="select"
          data-testid="selection-zone-select"
          value={zoneSelectValue}
          disabled={!hasSelection}
          onChange={(event) =>
            assignSelectionToZone(event.target.value === '' ? null : event.target.value)
          }
        >
          <option value="">No zone</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <span className="field-label">Tags</span>
        <div className="row">
          <input
            className="input"
            data-testid="tag-input"
            value={tagDraft}
            placeholder="Add tag"
            aria-label="Add tag to selection"
            disabled={!hasSelection}
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commitTag();
              }
            }}
          />
          <button
            type="button"
            className="button small"
            data-testid="tag-add"
            disabled={!hasSelection}
            onClick={commitTag}
          >
            Add
          </button>
        </div>
        {tags.length === 0 ? (
          <p className="empty">No tags.</p>
        ) : (
          <ul className="chip-list">
            {tags.map((tag) => (
              <li key={tag} className="chip" data-testid={`tag-chip-${tag}`}>
                <span>{tag}</span>
                <button
                  type="button"
                  className="chip-remove"
                  data-testid={`tag-remove-${tag}`}
                  aria-label={`Remove tag ${tag}`}
                  onClick={() => removeTagFromSelection(tag)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ZonePanel() {
  const project = useEditorStore((state) => state.project);
  const activeZoneId = useEditorStore((state) => state.activeZoneId);
  const addZone = useEditorStore((state) => state.addZone);

  const zones = sortedZones(project);
  const canDelete = zones.length > 0;

  return (
    <Panel
      title="Zones"
      testId="zone-panel"
      ariaLabel="Zones"
      className="zone-panel"
      actions={
        <button type="button" className="button small" data-testid="add-zone" onClick={() => addZone()}>
          Add zone
        </button>
      }
    >
      {zones.length === 0 ? (
        <p className="empty">No zones.</p>
      ) : (
        <ul className="list">
          {zones.map((zone) => (
            <ZoneRow
              key={zone.id}
              zone={zone}
              active={zone.id === activeZoneId}
              canDelete={canDelete}
              pieceCount={zoneStats(project, zone.id).pieceCount}
            />
          ))}
        </ul>
      )}

      <ZoneSelectionControls zones={zones} />
    </Panel>
  );
}
