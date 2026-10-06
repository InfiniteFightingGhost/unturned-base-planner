import { z } from 'zod';
import { IdSchema } from './ids';

/**
 * Resource & crafting graph (P4): fully data-driven.
 *
 * The graph lists raw and intermediate resources plus recipes that transform a
 * set of inputs into an output. `expandToRaw` recursively resolves any item to
 * the raw resources it ultimately requires.
 */

export const ResourceSchema = z.object({
  id: IdSchema,
  name: z.string(),
  isRaw: z.boolean(),
  source: z.string().optional(),
});

export type Resource = z.infer<typeof ResourceSchema>;

export const ResourceAmountSchema = z.object({
  resourceId: IdSchema,
  amount: z.int().positive(),
});

export type ResourceAmount = z.infer<typeof ResourceAmountSchema>;

export const RecipeOutputSchema = z.object({
  itemId: IdSchema,
  amount: z.int().min(1),
});

export type RecipeOutput = z.infer<typeof RecipeOutputSchema>;

export const CraftingRecipeSchema = z.object({
  id: IdSchema,
  output: RecipeOutputSchema,
  inputs: z.array(ResourceAmountSchema),
  source: z.string().optional(),
  workstation: z.string().optional(),
  tools: z.array(z.string()).default([]),
});

export type CraftingRecipe = z.infer<typeof CraftingRecipeSchema>;

export const ResourceGraphSchema = z.object({
  schemaVersion: z.int().positive(),
  resources: z.array(ResourceSchema),
  recipes: z.array(CraftingRecipeSchema),
});

export type ResourceGraph = z.infer<typeof ResourceGraphSchema>;

/** Thrown when an item/recipe referenced by the graph does not exist. */
export class UnknownResourceError extends Error {
  readonly resourceId: string;

  constructor(resourceId: string) {
    super(`Unknown resource: "${resourceId}"`);
    this.name = 'UnknownResourceError';
    this.resourceId = resourceId;
    Object.setPrototypeOf(this, UnknownResourceError.prototype);
  }
}

/** Thrown when a recipe graph contains a cycle. */
export class RecipeCycleError extends Error {
  readonly cycle: string[];

  constructor(cycle: string[]) {
    super(`Recipe cycle detected: ${cycle.join(' -> ')}`);
    this.name = 'RecipeCycleError';
    this.cycle = cycle;
    Object.setPrototypeOf(this, RecipeCycleError.prototype);
  }
}

interface GraphIndex {
  resourceById: ReadonlyMap<string, Resource>;
  recipeById: ReadonlyMap<string, CraftingRecipe>;
  recipeByOutput: ReadonlyMap<string, CraftingRecipe>;
}

function indexGraph(graph: ResourceGraph): GraphIndex {
  const resourceById = new Map<string, Resource>();
  for (const resource of graph.resources) {
    resourceById.set(resource.id, resource);
  }
  const recipeById = new Map<string, CraftingRecipe>();
  const recipeByOutput = new Map<string, CraftingRecipe>();
  for (const recipe of graph.recipes) {
    recipeById.set(recipe.id, recipe);
    if (!recipeByOutput.has(recipe.output.itemId)) {
      recipeByOutput.set(recipe.output.itemId, recipe);
    }
  }
  return { resourceById, recipeById, recipeByOutput };
}

/**
 * Merge duplicate resource amounts and return them sorted by `resourceId`, so
 * that identical inputs in any order produce identical output.
 */
export function aggregateResourceAmounts(amounts: ResourceAmount[]): ResourceAmount[] {
  const totals = new Map<string, number>();
  for (const amount of amounts) {
    totals.set(amount.resourceId, (totals.get(amount.resourceId) ?? 0) + amount.amount);
  }
  return [...totals.entries()]
    .map(([resourceId, amount]): ResourceAmount => ({ resourceId, amount }))
    .sort((a, b) => (a.resourceId < b.resourceId ? -1 : a.resourceId > b.resourceId ? 1 : 0));
}

/**
 * Recursively expand an item (identified by resource id and/or recipe id) down
 * to the raw resources required to produce `amount` units of it.
 *
 * - Deterministic: the result is aggregated and sorted by `resourceId`.
 * - Memoized per `(id, amount)` pair.
 * - A resource that is both raw and craftable is treated as raw.
 * - Cycles and unknown references raise clear errors.
 */
export function expandToRaw(
  recipeIdOrItemId: string,
  amount: number,
  graph: ResourceGraph,
): ResourceAmount[] {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`expandToRaw amount must be a positive integer, received ${String(amount)}`);
  }

  const { resourceById, recipeById, recipeByOutput } = indexGraph(graph);
  const memo = new Map<string, ResourceAmount[]>();
  const visiting = new Set<string>();

  const resolve = (id: string, quantity: number): ResourceAmount[] => {
    const resource = resourceById.get(id);
    if (resource !== undefined && resource.isRaw) {
      return [{ resourceId: id, amount: quantity }];
    }

    const recipe = recipeById.get(id) ?? recipeByOutput.get(id);
    if (recipe === undefined) {
      throw new UnknownResourceError(id);
    }

    const key = `${id}#${quantity}`;
    const cached = memo.get(key);
    if (cached !== undefined) {
      return cached;
    }

    if (visiting.has(id)) {
      throw new RecipeCycleError([...visiting, id]);
    }

    visiting.add(id);
    const batches = Math.ceil(quantity / recipe.output.amount);
    const produced: ResourceAmount[] = [];
    for (const input of recipe.inputs) {
      produced.push(...resolve(input.resourceId, input.amount * batches));
    }
    visiting.delete(id);

    const result = aggregateResourceAmounts(produced);
    memo.set(key, result);
    return result;
  };

  return resolve(recipeIdOrItemId, amount);
}

function canonicalCycleKey(cycle: string[]): string {
  let bestIndex = 0;
  for (let i = 1; i < cycle.length; i += 1) {
    const candidate = cycle[i];
    const best = cycle[bestIndex];
    if (candidate !== undefined && best !== undefined && candidate < best) {
      bestIndex = i;
    }
  }
  const rotated = [...cycle.slice(bestIndex), ...cycle.slice(0, bestIndex)];
  return rotated.join('>');
}

/**
 * Find all directed cycles in the recipe graph. An edge `X -> Y` means
 * "crafting X consumes Y". Returns each cycle as a path of item ids without a
 * repeated closing node, e.g. `[['A', 'B']]` for `A -> B -> A`.
 */
export function detectRecipeCycles(graph: ResourceGraph): string[][] {
  const adjacency = new Map<string, string[]>();
  const addEdge = (from: string, to: string): void => {
    const existing = adjacency.get(from);
    if (existing === undefined) {
      adjacency.set(from, [to]);
    } else if (!existing.includes(to)) {
      existing.push(to);
    }
  };
  for (const recipe of graph.recipes) {
    for (const input of recipe.inputs) {
      addEdge(recipe.output.itemId, input.resourceId);
    }
  }

  const allNodes = new Set<string>();
  for (const [from, targets] of adjacency) {
    allNodes.add(from);
    for (const target of targets) {
      allNodes.add(target);
    }
  }
  const sortedNodes = [...allNodes].sort();

  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const indexInStack = new Map<string, number>();
  const seen = new Set<string>();
  const cycles: string[][] = [];

  const visit = (node: string): void => {
    state.set(node, 1);
    indexInStack.set(node, stack.length);
    stack.push(node);

    for (const next of adjacency.get(node) ?? []) {
      const nextState = state.get(next) ?? 0;
      if (nextState === 1) {
        const start = indexInStack.get(next);
        if (start !== undefined) {
          const cycle = stack.slice(start);
          const key = canonicalCycleKey(cycle);
          if (!seen.has(key)) {
            seen.add(key);
            cycles.push(cycle);
          }
        }
      } else if (nextState === 0) {
        visit(next);
      }
    }

    stack.pop();
    indexInStack.delete(node);
    state.set(node, 2);
  };

  for (const node of sortedNodes) {
    if ((state.get(node) ?? 0) === 0) {
      visit(node);
    }
  }

  return cycles;
}

/** Throw a `RecipeCycleError` (with the cycle path) if the graph is cyclic. */
export function assertAcyclic(graph: ResourceGraph): void {
  const cycles = detectRecipeCycles(graph);
  const first = cycles[0];
  if (first !== undefined && first.length > 0) {
    const start = first[0];
    const closed = start === undefined ? first : [...first, start];
    throw new RecipeCycleError(closed);
  }
}
