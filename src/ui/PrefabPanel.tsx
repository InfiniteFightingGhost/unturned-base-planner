/**
 * Prefab library panel (P21).
 *
 * Lists saved prefabs (name + piece count), captures the current selection as a
 * named prefab, and stamps / deletes prefabs. Saving and deleting go through the
 * editor store, so every mutation is a single undoable domain command; the save
 * button is disabled while nothing is selected.
 */

import { useState } from 'react';
import { useEditorStore } from '@/editor';
import { Panel } from './Panel';

export function PrefabPanel() {
  const prefabs = useEditorStore((state) => state.project.prefabs);
  const selection = useEditorStore((state) => state.selection);
  const saveSelectionAsPrefab = useEditorStore((state) => state.saveSelectionAsPrefab);
  const deletePrefab = useEditorStore((state) => state.deletePrefab);
  const instantiatePrefab = useEditorStore((state) => state.instantiatePrefab);

  const [name, setName] = useState('');

  const hasSelection = selection.length > 0;

  const save = (): void => {
    const trimmed = name.trim();
    const created = saveSelectionAsPrefab(trimmed === '' ? 'Prefab' : trimmed);
    if (created !== null) {
      setName('');
    }
  };

  return (
    <Panel
      title="Prefabs"
      testId="prefab-panel"
      ariaLabel="Prefabs"
      className="prefab-panel"
      actions={<span className="panel-count mono">{prefabs.length}</span>}
    >
      <div className="panel-toolbar">
        <input
          className="input"
          data-testid="prefab-name"
          placeholder="Prefab name"
          aria-label="Prefab name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="button"
          className="button primary"
          data-testid="prefab-save"
          disabled={!hasSelection}
          onClick={save}
        >
          Save selection
        </button>
      </div>

      {prefabs.length === 0 ? (
        <p className="empty" data-testid="prefab-empty">
          No prefabs saved.
        </p>
      ) : (
        <ul className="list">
          {prefabs.map((prefab) => (
            <li key={prefab.id} className="list-item static" data-testid={`prefab-item-${prefab.id}`}>
              <div className="list-item-main">
                <span className="list-item-name">{prefab.name}</span>
                <span className="list-item-meta mono" data-testid={`prefab-count-${prefab.id}`}>
                  {prefab.pieces.length} {prefab.pieces.length === 1 ? 'piece' : 'pieces'}
                </span>
              </div>
              <div className="list-item-controls">
                <button
                  type="button"
                  className="button small"
                  data-testid={`prefab-instantiate-${prefab.id}`}
                  onClick={() => instantiatePrefab(prefab.id)}
                >
                  Instantiate
                </button>
                <button
                  type="button"
                  className="button small danger"
                  data-testid={`prefab-delete-${prefab.id}`}
                  onClick={() => deletePrefab(prefab.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
