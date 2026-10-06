/**
 * Pure selection reducer.
 *
 * Selection is UI state, not document state: it never flows through a command
 * and never creates a history entry. These helpers are deterministic and keep a
 * stable, de-duplicated order so React keys and property panels don't thrash.
 */

export type SelectionMode = 'replace' | 'add' | 'toggle' | 'subtract';

/** The canonical empty selection. Frozen so accidental mutation throws early. */
export const EMPTY_SELECTION: readonly string[] = Object.freeze([]);

/** First-occurrence de-duplication that preserves caller order. */
function dedupe(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

function subtract(current: readonly string[], incoming: readonly string[]): string[] {
  const remove = new Set(incoming);
  return dedupe(current).filter((id) => !remove.has(id));
}

function add(current: readonly string[], incoming: readonly string[]): string[] {
  const result = dedupe(current);
  const present = new Set(result);
  for (const id of incoming) {
    if (present.has(id)) {
      continue;
    }
    present.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Toggle membership. Each occurrence of an id in `incoming` flips it once, so a
 * duplicate within `incoming` cancels out. Existing order is preserved and newly
 * added ids are appended in first-add order.
 */
function toggle(current: readonly string[], incoming: readonly string[]): string[] {
  const base = dedupe(current);
  const membership = new Map<string, boolean>();
  for (const id of base) {
    membership.set(id, true);
  }
  const appendOrder: string[] = [];
  for (const id of incoming) {
    const selected = membership.get(id) ?? false;
    if (selected) {
      membership.set(id, false);
    } else {
      if (!membership.has(id)) {
        appendOrder.push(id);
      }
      membership.set(id, true);
    }
  }

  const result = base.filter((id) => membership.get(id) === true);
  const present = new Set(result);
  for (const id of appendOrder) {
    if (membership.get(id) === true && !present.has(id)) {
      present.add(id);
      result.push(id);
    }
  }
  return result;
}

/** Apply an incoming batch of ids to the current selection under `mode`. */
export function applySelection(
  current: readonly string[],
  incoming: readonly string[],
  mode: SelectionMode,
): string[] {
  switch (mode) {
    case 'replace':
      return dedupe(incoming);
    case 'add':
      return add(current, incoming);
    case 'toggle':
      return toggle(current, incoming);
    case 'subtract':
      return subtract(current, incoming);
  }
}

/** Whether `id` is part of `selection`. */
export function isSelected(selection: readonly string[], id: string): boolean {
  return selection.includes(id);
}

/** Select every known piece id (de-duplicated, order preserved). */
export function selectAll(pieceIds: readonly string[]): string[] {
  return dedupe(pieceIds);
}
