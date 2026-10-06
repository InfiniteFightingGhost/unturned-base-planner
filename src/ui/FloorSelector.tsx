/**
 * Floor selector panel (P16). Lists floors in display order and exposes the
 * full floor-management surface: activate (click), add, delete (disabled for the
 * last floor), rename, elevation, visibility and lock.
 *
 * Every document mutation is dispatched to the editor store, which routes it
 * through a domain command so undo/redo works. `setActiveFloor` is UI-only.
 * Name/elevation edits are committed on blur or Enter to keep one undo step per
 * meaningful edit instead of one per keystroke.
 */

import { useEffect, useState } from 'react';
import type { Floor } from '@/domain';
import { sortedFloors, useEditorStore } from '@/editor';
import { Panel } from './Panel';

function FloorRow({
  floor,
  active,
  canDelete,
}: {
  readonly floor: Floor;
  readonly active: boolean;
  readonly canDelete: boolean;
}) {
  const setActiveFloor = useEditorStore((state) => state.setActiveFloor);
  const renameFloor = useEditorStore((state) => state.renameFloor);
  const setFloorElevation = useEditorStore((state) => state.setFloorElevation);
  const setFloorVisible = useEditorStore((state) => state.setFloorVisible);
  const setFloorLocked = useEditorStore((state) => state.setFloorLocked);
  const deleteFloor = useEditorStore((state) => state.deleteFloor);

  const [name, setName] = useState(floor.name);
  const [elevation, setElevation] = useState(String(floor.elevation));

  useEffect(() => {
    setName(floor.name);
  }, [floor.name]);
  useEffect(() => {
    setElevation(String(floor.elevation));
  }, [floor.elevation]);

  const commitName = (): void => {
    const trimmed = name.trim();
    if (trimmed !== '' && trimmed !== floor.name) {
      renameFloor(floor.id, trimmed);
    } else {
      setName(floor.name);
    }
  };

  const commitElevation = (): void => {
    const parsed = Number.parseFloat(elevation);
    if (Number.isFinite(parsed) && parsed !== floor.elevation) {
      setFloorElevation(floor.id, parsed);
    } else {
      setElevation(String(floor.elevation));
    }
  };

  return (
    <li
      className={active ? 'list-item active' : 'list-item'}
      data-testid={`floor-item-${floor.id}`}
      data-active={active}
      onClick={() => setActiveFloor(floor.id)}
    >
      <div className="list-item-main">
        <span className="floor-index mono" aria-hidden="true">
          {String(floor.index + 1).padStart(2, '0')}
        </span>
        <input
          className="input"
          data-testid={`floor-name-${floor.id}`}
          value={name}
          aria-label={`Name of ${floor.name}`}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur();
            }
          }}
        />
      </div>

      <div className="list-item-controls" onClick={(event) => event.stopPropagation()}>
        <label className="field inline">
          <span className="field-label">Y</span>
          <input
            type="number"
            className="input mono"
            data-testid={`floor-elevation-${floor.id}`}
            value={elevation}
            step={0.25}
            aria-label={`Elevation of ${floor.name}`}
            onChange={(event) => setElevation(event.target.value)}
            onBlur={commitElevation}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
          />
        </label>
        <button
          type="button"
          className={floor.visible ? 'button small active' : 'button small'}
          data-testid={`floor-visible-${floor.id}`}
          aria-pressed={floor.visible}
          onClick={() => setFloorVisible(floor.id, !floor.visible)}
        >
          {floor.visible ? 'Visible' : 'Hidden'}
        </button>
        <button
          type="button"
          className={floor.locked ? 'button small active' : 'button small'}
          data-testid={`floor-locked-${floor.id}`}
          aria-pressed={floor.locked}
          onClick={() => setFloorLocked(floor.id, !floor.locked)}
        >
          {floor.locked ? 'Locked' : 'Unlocked'}
        </button>
        <button
          type="button"
          className="button small danger"
          data-testid={`floor-delete-${floor.id}`}
          disabled={!canDelete}
          onClick={() => deleteFloor(floor.id)}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

export function FloorSelector() {
  const project = useEditorStore((state) => state.project);
  const activeFloorId = useEditorStore((state) => state.activeFloorId);
  const addFloor = useEditorStore((state) => state.addFloor);

  const floors = sortedFloors(project);
  const canDelete = project.floors.length > 1;

  return (
    <Panel
      title="Floors"
      testId="floor-selector"
      ariaLabel="Floors"
      className="floor-panel"
      actions={
        <button type="button" className="button small" data-testid="add-floor" onClick={() => addFloor()}>
          Add floor
        </button>
      }
    >
      {floors.length === 0 ? (
        <p className="empty">No floors.</p>
      ) : (
        <ul className="list">
          {floors.map((floor) => (
            <FloorRow
              key={floor.id}
              floor={floor}
              active={floor.id === activeFloorId}
              canDelete={canDelete}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}
