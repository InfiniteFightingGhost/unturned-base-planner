import { expandToRaw } from '@/domain';
import type {
  PieceCategory,
  PieceDefinition,
  PlacedPiece,
  ResourceAmount,
  ResourceGraph,
} from '@/domain';
import type {
  CategoryBreakdown,
  DefinitionBreakdown,
  ResourceCalculatorInput,
  ResourceIssue,
  ResourceTotals,
} from './types';

/**
 * Pure resource-aggregation engine (P27 + P29).
 *
 * Given placed pieces, the piece-definition catalog, and the crafting graph, it
 * computes the total raw materials required to build them by expanding every
 * piece recipe through its intermediate crafting hierarchy.
 *
 * Guarantees:
 * - Pure: depends only on the domain + data contracts, runs in a worker.
 * - Deterministic: identical inputs in any order produce byte-identical output.
 * - Total: never throws on bad input; unknown definitions and broken recipes
 *   are surfaced as `issues` while the remaining pieces are still counted.
 */

const UNKNOWN_DEFINITION = 'unknown_definition';
const INVALID_RECIPE = 'invalid_recipe';

function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function accumulate(into: Map<string, number>, amounts: readonly ResourceAmount[]): void {
  for (const { resourceId, amount } of amounts) {
    into.set(resourceId, (into.get(resourceId) ?? 0) + amount);
  }
}

function toSortedAmounts(totals: ReadonlyMap<string, number>): ResourceAmount[] {
  return [...totals.entries()]
    .map(([resourceId, amount]): ResourceAmount => ({ resourceId, amount }))
    .sort((a, b) => compareStrings(a.resourceId, b.resourceId));
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface CategoryAccumulator {
  placedCount: number;
  raw: Map<string, number>;
}

interface DefinitionAccumulator {
  category: PieceCategory;
  placedCount: number;
  raw: Map<string, number>;
}

/**
 * Core aggregation over a `ResourceCalculatorInput`. Pure and deterministic.
 */
function analyzeResources(input: ResourceCalculatorInput): ResourceTotals {
  const { pieces, definitions, graph } = input;

  const raw = new Map<string, number>();
  const byDefinition = new Map<string, DefinitionAccumulator>();
  const byCategory = new Map<PieceCategory, CategoryAccumulator>();
  const issues: ResourceIssue[] = [];

  const expansionByRecipe = new Map<string, ResourceAmount[] | null>();
  const reportedIssueKeys = new Set<string>();

  let pieceCount = 0;

  for (const piece of pieces) {
    const definition = definitions.get(piece.definitionId);
    if (definition === undefined) {
      const key = `${UNKNOWN_DEFINITION}:${piece.definitionId}`;
      if (!reportedIssueKeys.has(key)) {
        reportedIssueKeys.add(key);
        issues.push({
          code: UNKNOWN_DEFINITION,
          message: `Unknown piece definition "${piece.definitionId}"`,
          definitionId: piece.definitionId,
        });
      }
      continue;
    }

    pieceCount += 1;

    let definitionEntry = byDefinition.get(definition.id);
    if (definitionEntry === undefined) {
      definitionEntry = { category: definition.category, placedCount: 0, raw: new Map<string, number>() };
      byDefinition.set(definition.id, definitionEntry);
    }
    definitionEntry.placedCount += 1;

    let categoryEntry = byCategory.get(definition.category);
    if (categoryEntry === undefined) {
      categoryEntry = { placedCount: 0, raw: new Map<string, number>() };
      byCategory.set(definition.category, categoryEntry);
    }
    categoryEntry.placedCount += 1;

    const recipeId = definition.resourceRecipe;
    let expansion = expansionByRecipe.get(recipeId);
    if (expansion === undefined) {
      try {
        expansion = expandToRaw(recipeId, 1, graph);
      } catch (error) {
        expansion = null;
        const key = `${INVALID_RECIPE}:${recipeId}`;
        if (!reportedIssueKeys.has(key)) {
          reportedIssueKeys.add(key);
          issues.push({
            code: INVALID_RECIPE,
            message: `Recipe "${recipeId}" for piece definition "${definition.id}" could not be expanded: ${describeError(error)}`,
            definitionId: definition.id,
            recipeId,
          });
        }
      }
      expansionByRecipe.set(recipeId, expansion);
    }

    if (expansion === null) {
      continue;
    }

    accumulate(raw, expansion);
    accumulate(definitionEntry.raw, expansion);
    accumulate(categoryEntry.raw, expansion);
  }

  const definitionBreakdown: DefinitionBreakdown[] = [...byDefinition.entries()]
    .map(([definitionId, entry]): DefinitionBreakdown => ({
      definitionId,
      placedCount: entry.placedCount,
      raw: toSortedAmounts(entry.raw),
    }))
    .sort((a, b) => compareStrings(a.definitionId, b.definitionId));

  const categoryBreakdown: CategoryBreakdown[] = [...byCategory.entries()]
    .map(([category, entry]): CategoryBreakdown => ({
      category,
      placedCount: entry.placedCount,
      raw: toSortedAmounts(entry.raw),
    }))
    .sort((a, b) => compareStrings(a.category, b.category));

  issues.sort((a, b) => {
    const byCode = compareStrings(a.code, b.code);
    if (byCode !== 0) {
      return byCode;
    }
    const byDefinition = compareStrings(a.definitionId ?? '', b.definitionId ?? '');
    if (byDefinition !== 0) {
      return byDefinition;
    }
    const byRecipe = compareStrings(a.recipeId ?? '', b.recipeId ?? '');
    if (byRecipe !== 0) {
      return byRecipe;
    }
    return compareStrings(a.message, b.message);
  });

  return {
    raw: toSortedAmounts(raw),
    pieceCount,
    byDefinition: definitionBreakdown,
    byCategory: categoryBreakdown,
    issues,
  };
}

/** Aggregate the raw build cost of `pieces`. */
export function computeResourceTotals(
  pieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
  graph: ResourceGraph,
): ResourceTotals {
  return analyzeResources({ pieces, definitions, graph });
}

/** Raw materials required to build `pieces`, sorted by `resourceId`. */
export function computeRawRequirements(
  pieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
  graph: ResourceGraph,
): ResourceAmount[] {
  return analyzeResources({ pieces, definitions, graph }).raw;
}

/** Per-definition breakdown, sorted by `definitionId`. */
export function breakdownByDefinition(
  pieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
  graph: ResourceGraph,
): DefinitionBreakdown[] {
  return analyzeResources({ pieces, definitions, graph }).byDefinition;
}

/** Per-category breakdown, sorted by category. */
export function breakdownByCategory(
  pieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
  graph: ResourceGraph,
): CategoryBreakdown[] {
  return analyzeResources({ pieces, definitions, graph }).byCategory;
}

/** Result of subtracting an available inventory from a requirement. */
export interface InventoryDiff {
  /** Requirements not covered by inventory, sorted by `resourceId`. */
  readonly remaining: ResourceAmount[];
  /** Inventory left over after covering the requirements, sorted. */
  readonly surplus: ResourceAmount[];
}

/**
 * Deterministically subtract `inventory` from `totals.raw`.
 *
 * Amounts clamp at zero: a shortage appears in `remaining`, an excess in
 * `surplus`. Both lists stay sorted by `resourceId`.
 */
export function subtractInventory(
  totals: ResourceTotals,
  inventory: readonly ResourceAmount[],
): InventoryDiff {
  const required = new Map<string, number>();
  for (const { resourceId, amount } of totals.raw) {
    required.set(resourceId, (required.get(resourceId) ?? 0) + amount);
  }

  const available = new Map<string, number>();
  for (const { resourceId, amount } of inventory) {
    available.set(resourceId, (available.get(resourceId) ?? 0) + amount);
  }

  const ids = new Set<string>([...required.keys(), ...available.keys()]);
  const remaining = new Map<string, number>();
  const surplus = new Map<string, number>();

  for (const resourceId of [...ids].sort(compareStrings)) {
    const need = required.get(resourceId) ?? 0;
    const have = available.get(resourceId) ?? 0;
    if (need > have) {
      remaining.set(resourceId, need - have);
    } else if (have > need) {
      surplus.set(resourceId, have - need);
    }
  }

  return {
    remaining: toSortedAmounts(remaining),
    surplus: toSortedAmounts(surplus),
  };
}

/** Catalog binding used by the calculator factory. */
export interface ResourceCalculatorDataset {
  readonly graph: ResourceGraph;
  readonly definitionById: ReadonlyMap<string, PieceDefinition>;
}

/** Convenience facade with the catalog pre-bound. */
export interface ResourceCalculator {
  computeTotals(pieces: readonly PlacedPiece[]): ResourceTotals;
  computeRawRequirements(pieces: readonly PlacedPiece[]): ResourceAmount[];
  breakdownByDefinition(pieces: readonly PlacedPiece[]): DefinitionBreakdown[];
  breakdownByCategory(pieces: readonly PlacedPiece[]): CategoryBreakdown[];
  subtractInventory(totals: ResourceTotals, inventory: readonly ResourceAmount[]): InventoryDiff;
}

/**
 * Bind a dataset's graph and definition index once so callers do not thread
 * them through every call. `DATASET` from `@/data` satisfies the shape.
 */
export function createResourceCalculator(dataset: ResourceCalculatorDataset): ResourceCalculator {
  const definitions = dataset.definitionById;
  const graph = dataset.graph;
  return {
    computeTotals: (pieces) => computeResourceTotals(pieces, definitions, graph),
    computeRawRequirements: (pieces) => computeRawRequirements(pieces, definitions, graph),
    breakdownByDefinition: (pieces) => breakdownByDefinition(pieces, definitions, graph),
    breakdownByCategory: (pieces) => breakdownByCategory(pieces, definitions, graph),
    subtractInventory: (totals, inventory) => subtractInventory(totals, inventory),
  };
}
