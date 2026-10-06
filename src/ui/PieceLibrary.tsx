/**
 * Left piece library (P51 partial): a searchable, category-filterable catalog of
 * every `PieceDefinition` in the dataset. Clicking an entry arms the placement
 * tool with that definition. 112 items render un-virtualized, which is well
 * within budget for a single flat list.
 */

import { useMemo, useState } from 'react';
import type { PieceCategory, PieceDefinition } from '@/domain';
import { DATASET } from '@/data';
import { useToolStore } from '@/editor/tools/toolStore';

interface CategoryGroup {
  readonly category: PieceCategory;
  readonly definitions: PieceDefinition[];
}

function groupByCategory(definitions: readonly PieceDefinition[]): CategoryGroup[] {
  const groups = new Map<PieceCategory, PieceDefinition[]>();
  for (const definition of definitions) {
    const bucket = groups.get(definition.category);
    if (bucket === undefined) {
      groups.set(definition.category, [definition]);
    } else {
      bucket.push(definition);
    }
  }
  return [...groups]
    .map(([category, items]) => ({ category, definitions: items }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

const ALL_CATEGORIES = groupByCategory(DATASET.definitions).map((group) => group.category);

export function PieceLibrary() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PieceCategory | 'all'>('all');
  const activeDefinitionId = useToolStore((state) => state.activeDefinitionId);
  const setActiveDefinitionId = useToolStore((state) => state.setActiveDefinitionId);
  const setActiveTool = useToolStore((state) => state.setActiveTool);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = DATASET.definitions.filter((definition) => {
      if (category !== 'all' && definition.category !== category) {
        return false;
      }
      if (needle === '') {
        return true;
      }
      return (
        definition.name.toLowerCase().includes(needle) ||
        definition.id.toLowerCase().includes(needle)
      );
    });
    return groupByCategory(filtered);
  }, [query, category]);

  const armDefinition = (definitionId: string): void => {
    setActiveDefinitionId(definitionId);
    setActiveTool('place');
  };

  return (
    <aside className="panel piece-library" data-testid="piece-library" aria-label="Piece library">
      <div className="panel-header">
        <h2>Pieces</h2>
      </div>

      <div className="library-controls">
        <input
          type="search"
          className="library-search"
          data-testid="piece-search"
          placeholder="Search name or id…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="library-filter"
          data-testid="category-filter"
          value={category}
          onChange={(event) => setCategory(event.target.value as PieceCategory | 'all')}
        >
          <option value="all">All categories</option>
          {ALL_CATEGORIES.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </div>

      <div className="library-scroll">
        {groups.length === 0 ? (
          <p className="library-empty">No pieces match.</p>
        ) : (
          groups.map((group) => (
            <section key={group.category} className="library-group">
              <h3>{group.category}</h3>
              <ul>
                {group.definitions.map((definition) => (
                  <li key={definition.id}>
                    <button
                      type="button"
                      data-testid={`piece-item-${definition.id}`}
                      className={
                        activeDefinitionId === definition.id
                          ? 'library-item active'
                          : 'library-item'
                      }
                      onClick={() => armDefinition(definition.id)}
                    >
                      <span className="library-item-name">{definition.name}</span>
                      <span className="library-item-id">{definition.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
