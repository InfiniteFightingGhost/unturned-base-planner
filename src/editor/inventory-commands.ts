/**
 * Command factories for the stored inventory.
 *
 * Like the other command modules, every factory is pure: it captures its
 * arguments and returns a domain `Command` whose `apply` mutates only the
 * supplied immer draft. All inventory edits therefore flow through history and
 * remain undoable. Amounts are normalized to positive integers so a command can
 * never produce a document that fails `ResourceAmountSchema`.
 */

import type { Command, Project, ResourceAmount } from '@/domain';

/** Replace the whole inventory with a normalized copy of `amounts`. */
export function createSetInventoryCommand(amounts: readonly ResourceAmount[]): Command {
  const snapshot: ResourceAmount[] = amounts.map(({ resourceId, amount }) => ({
    resourceId,
    amount: Math.trunc(amount),
  }));
  return {
    type: 'inventory.set',
    label: `Set inventory (${snapshot.length} resource${snapshot.length === 1 ? '' : 's'})`,
    apply(draft: Project): void {
      draft.inventory = snapshot.map((entry) => ({ ...entry }));
    },
  };
}

/**
 * Set the owned amount of a single resource. A non-positive or non-finite
 * amount removes the entry entirely so the inventory never stores zeroes.
 */
export function createSetInventoryResourceCommand(resourceId: string, amount: number): Command {
  const normalized = Number.isFinite(amount) ? Math.trunc(amount) : 0;
  return {
    type: 'inventory.setResource',
    label: normalized > 0 ? `Set ${resourceId} to ${normalized}` : `Clear ${resourceId}`,
    apply(draft: Project): void {
      const index = draft.inventory.findIndex((entry) => entry.resourceId === resourceId);
      if (normalized <= 0) {
        if (index >= 0) {
          draft.inventory.splice(index, 1);
        }
        return;
      }
      const existing = index >= 0 ? draft.inventory[index] : undefined;
      if (existing === undefined) {
        draft.inventory.push({ resourceId, amount: normalized });
      } else {
        existing.amount = normalized;
      }
    },
  };
}
