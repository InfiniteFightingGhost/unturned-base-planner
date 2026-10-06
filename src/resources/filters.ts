import type {
  BuildState,
  PieceDefinition,
  PlacedPiece,
  ResourceAmount,
  ResourceGraph,
} from '@/domain';
import { computeResourceTotals, subtractInventory } from './calculator';
import type { ResourceTotals } from './types';

/**
 * Pure piece filtering, construction-progress and inventory-balance helpers
 * (P30 / P31 / P34 / P35).
 *
 * These functions only read plain data and delegate material expansion to the
 * calculator, so they stay deterministic and free of React, three.js or DOM
 * dependencies. "Unbuilt" is defined as any build state other than `built`
 * (i.e. both `planned` and `collected` still require their materials).
 */

function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

/** Pieces placed on a single floor, in document order. */
export function filterPiecesByFloor(
  pieces: readonly PlacedPiece[],
  floorId: string,
): PlacedPiece[] {
  return pieces.filter((piece) => piece.floorId === floorId);
}

/**
 * Pieces assigned to a single zone, in document order. Passing `null` selects
 * the pieces that are not assigned to any zone.
 */
export function filterPiecesByZone(
  pieces: readonly PlacedPiece[],
  zoneId: string | null,
): PlacedPiece[] {
  return pieces.filter((piece) => piece.zoneId === zoneId);
}

/** Pieces whose build state is one of `states`, in document order. */
export function filterPiecesByBuildState(
  pieces: readonly PlacedPiece[],
  states: readonly BuildState[],
): PlacedPiece[] {
  const wanted = new Set(states);
  return pieces.filter((piece) => wanted.has(piece.buildState));
}

/** Pieces still requiring materials: everything that is not `built`. */
export function filterUnbuiltPieces(pieces: readonly PlacedPiece[]): PlacedPiece[] {
  return pieces.filter((piece) => piece.buildState !== 'built');
}

/** Aggregate construction progress for a set of pieces. */
export interface ConstructionProgress {
  readonly total: number;
  readonly built: number;
  readonly collected: number;
  readonly planned: number;
  /** Pieces that are not `built` yet (`built` subtracted from `total`). */
  readonly remaining: number;
  /** `built / total * 100`, rounded to one decimal; `0` when `total` is `0`. */
  readonly percentComplete: number;
}

/**
 * Count pieces by build state and derive a completion percentage. Empty input
 * yields all-zero progress (including a `0` percentage rather than `NaN`).
 */
export function computeConstructionProgress(
  pieces: readonly PlacedPiece[],
): ConstructionProgress {
  let built = 0;
  let collected = 0;
  let planned = 0;

  for (const piece of pieces) {
    if (piece.buildState === 'built') {
      built += 1;
    } else if (piece.buildState === 'collected') {
      collected += 1;
    } else {
      planned += 1;
    }
  }

  const total = pieces.length;
  const remaining = total - built;
  const percentComplete = total === 0 ? 0 : Math.round((built / total) * 1000) / 10;

  return { total, built, collected, planned, remaining, percentComplete };
}

/**
 * Raw materials still required to finish construction: the raw requirements of
 * every piece that is not `built`. Sorted by `resourceId`.
 */
export function computeRemainingMaterials(
  pieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
  graph: ResourceGraph,
): ResourceAmount[] {
  return computeResourceTotals(filterUnbuiltPieces(pieces), definitions, graph).raw;
}

/** Per-resource balance of requirements against an owned inventory. */
export interface InventoryBalance {
  readonly resourceId: string;
  /** Raw amount required by pieces that are not `built`. */
  readonly required: number;
  /** Amount owned in the stored inventory. */
  readonly owned: number;
  /** Shortfall (`required - owned`, clamped at zero). */
  readonly remaining: number;
  /** Leftover (`owned - required`, clamped at zero). */
  readonly surplus: number;
}

function aggregateInventory(inventory: readonly ResourceAmount[]): Map<string, number> {
  const owned = new Map<string, number>();
  for (const { resourceId, amount } of inventory) {
    owned.set(resourceId, (owned.get(resourceId) ?? 0) + amount);
  }
  return owned;
}

/**
 * Compare the raw materials needed by un-built pieces against `inventory`.
 *
 * Returns one entry per raw resource that is either required or owned, sorted
 * by `resourceId`. `remaining` and `surplus` clamp at zero and are derived with
 * the shared `subtractInventory` helper so totals never disagree.
 */
export function computeInventoryBalance(
  pieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
  graph: ResourceGraph,
  inventory: readonly ResourceAmount[],
): InventoryBalance[] {
  const totals: ResourceTotals = computeResourceTotals(
    filterUnbuiltPieces(pieces),
    definitions,
    graph,
  );
  const diff = subtractInventory(totals, inventory);

  const required = new Map<string, number>();
  for (const { resourceId, amount } of totals.raw) {
    required.set(resourceId, (required.get(resourceId) ?? 0) + amount);
  }
  const owned = aggregateInventory(inventory);
  const remaining = new Map<string, number>(
    diff.remaining.map((entry): [string, number] => [entry.resourceId, entry.amount]),
  );
  const surplus = new Map<string, number>(
    diff.surplus.map((entry): [string, number] => [entry.resourceId, entry.amount]),
  );

  const ids = new Set<string>([
    ...required.keys(),
    ...owned.keys(),
    ...diff.surplus.map((entry) => entry.resourceId),
  ]);

  return [...ids]
    .sort(compareStrings)
    .map((resourceId): InventoryBalance => ({
      resourceId,
      required: required.get(resourceId) ?? 0,
      owned: owned.get(resourceId) ?? 0,
      remaining: remaining.get(resourceId) ?? 0,
      surplus: surplus.get(resourceId) ?? 0,
    }));
}
