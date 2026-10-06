/**
 * Inventory panel (P32 / P35).
 *
 * One row per raw resource with an editable "owned" amount and the derived
 * Required (un-built) / Owned / Remaining / Surplus columns, plus totals. Every
 * edit dispatches `setInventoryResource` through the editor store, so inventory
 * changes are undoable. Uses the pure `computeInventoryBalance` helper.
 */

import { useMemo, useState } from 'react';
import { DATASET, RAW_RESOURCES } from '@/data';
import { computeInventoryBalance } from '@/resources';
import { useEditorStore } from '@/editor';

interface InventoryRow {
  readonly resourceId: string;
  readonly required: number;
  readonly owned: number;
  readonly remaining: number;
  readonly surplus: number;
}

function parseAmount(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function InventoryPanel() {
  const pieces = useEditorStore((state) => state.project.pieces);
  const inventory = useEditorStore((state) => state.project.inventory);
  const setInventoryResource = useEditorStore((state) => state.setInventoryResource);
  const clearInventory = useEditorStore((state) => state.clearInventory);

  const balances = useMemo(
    () => computeInventoryBalance(pieces, DATASET.definitionById, DATASET.graph, inventory),
    [pieces, inventory],
  );

  const balanceById = useMemo(() => {
    const map = new Map<string, InventoryRow>();
    for (const entry of balances) {
      map.set(entry.resourceId, entry);
    }
    return map;
  }, [balances]);

  const rows = useMemo(() => {
    const ids = new Set<string>(RAW_RESOURCES.map((resource) => resource.id));
    for (const entry of balances) {
      ids.add(entry.resourceId);
    }
    return [...ids].sort((a, b) => a.localeCompare(b)).map((resourceId): InventoryRow => {
      return (
        balanceById.get(resourceId) ?? {
          resourceId,
          required: 0,
          owned: 0,
          remaining: 0,
          surplus: 0,
        }
      );
    });
  }, [balances, balanceById]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          required: acc.required + row.required,
          owned: acc.owned + row.owned,
          remaining: acc.remaining + row.remaining,
          surplus: acc.surplus + row.surplus,
        }),
        { required: 0, owned: 0, remaining: 0, surplus: 0 },
      ),
    [rows],
  );

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const ownedById = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of inventory) {
      map.set(entry.resourceId, (map.get(entry.resourceId) ?? 0) + entry.amount);
    }
    return map;
  }, [inventory]);

  const handleChange = (resourceId: string, value: string): void => {
    setDrafts((previous) => ({ ...previous, [resourceId]: value }));
    setInventoryResource(resourceId, parseAmount(value));
  };

  const handleBlur = (resourceId: string): void => {
    setDrafts((previous) => {
      if (!(resourceId in previous)) {
        return previous;
      }
      const next = { ...previous };
      delete next[resourceId];
      return next;
    });
  };

  return (
    <aside className="panel inventory-panel" data-testid="inventory-panel" aria-label="Inventory">
      <div className="panel-header inventory-panel-header">
        <h2>Inventory</h2>
        <button
          type="button"
          className="prefab-action"
          data-testid="inventory-clear"
          disabled={inventory.length === 0}
          onClick={() => clearInventory()}
        >
          Clear inventory
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="panel-placeholder">No raw resources.</p>
      ) : (
        <div className="inventory-table-wrap">
          <table className="inventory-table">
            <thead>
              <tr>
                <th scope="col">Resource</th>
                <th scope="col">Owned</th>
                <th scope="col">Required</th>
                <th scope="col">Remaining</th>
                <th scope="col">Surplus</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const owned = ownedById.get(row.resourceId) ?? row.owned;
                const draft = drafts[row.resourceId];
                return (
                  <tr key={row.resourceId} data-testid={`inventory-row-${row.resourceId}`}>
                    <td className="inventory-name">
                      {DATASET.resourceById.get(row.resourceId)?.name ?? row.resourceId}
                    </td>
                    <td>
                      <input
                        type="number"
                        min={0}
                        className="inventory-input"
                        data-testid={`inventory-input-${row.resourceId}`}
                        aria-label={`Owned ${row.resourceId}`}
                        value={draft ?? (owned > 0 ? String(owned) : '')}
                        onChange={(event) => handleChange(row.resourceId, event.target.value)}
                        onBlur={() => handleBlur(row.resourceId)}
                      />
                    </td>
                    <td
                      className="inventory-number"
                      data-testid={`inventory-required-${row.resourceId}`}
                    >
                      {row.required}
                    </td>
                    <td
                      className="inventory-number"
                      data-testid={`inventory-remaining-${row.resourceId}`}
                    >
                      {row.remaining}
                    </td>
                    <td
                      className="inventory-number"
                      data-testid={`inventory-surplus-${row.resourceId}`}
                    >
                      {row.surplus}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr data-testid="inventory-totals">
                <th scope="row">Totals</th>
                <td className="inventory-number" data-testid="inventory-total-owned">
                  {totals.owned}
                </td>
                <td className="inventory-number" data-testid="inventory-total-required">
                  {totals.required}
                </td>
                <td className="inventory-number" data-testid="inventory-total-remaining">
                  {totals.remaining}
                </td>
                <td className="inventory-number" data-testid="inventory-total-surplus">
                  {totals.surplus}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </aside>
  );
}
