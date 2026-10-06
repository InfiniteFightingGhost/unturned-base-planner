import { describe, expect, it } from 'vitest';
import {
  RecipeCycleError,
  ResourceGraphSchema,
  UnknownResourceError,
  aggregateResourceAmounts,
  assertAcyclic,
  detectRecipeCycles,
  expandToRaw,
  type CraftingRecipe,
  type Resource,
  type ResourceGraph,
} from '@/domain';

type RecipeInput = Omit<CraftingRecipe, 'tools'> & { tools?: string[] };

function graph(resources: Resource[], recipes: RecipeInput[]): ResourceGraph {
  return ResourceGraphSchema.parse({ schemaVersion: 1, resources, recipes });
}

const wood: Resource = { id: 'wood', name: 'Wood', isRaw: true };

describe('expandToRaw', () => {
  it('throws for an unknown item in an empty graph', () => {
    const empty = graph([], []);
    expect(() => expandToRaw('anything', 1, empty)).toThrow(UnknownResourceError);
  });

  it('returns a raw resource directly', () => {
    const g = graph([wood], []);
    expect(expandToRaw('wood', 5, g)).toEqual([{ resourceId: 'wood', amount: 5 }]);
  });

  it('expands a single crafted item to its raw inputs', () => {
    const g = graph(
      [wood, { id: 'plank', name: 'Plank', isRaw: false }],
      [
        {
          id: 'plank_recipe',
          output: { itemId: 'plank', amount: 1 },
          inputs: [{ resourceId: 'wood', amount: 2 }],
        },
      ],
    );
    expect(expandToRaw('plank', 3, g)).toEqual([{ resourceId: 'wood', amount: 6 }]);
  });

  it('expands a nested recipe chain down to raw resources', () => {
    const g = graph(
      [
        { id: 'ore', name: 'Ore', isRaw: true },
        { id: 'ingot', name: 'Ingot', isRaw: false },
        { id: 'plate', name: 'Plate', isRaw: false },
      ],
      [
        {
          id: 'ingot_recipe',
          output: { itemId: 'ingot', amount: 1 },
          inputs: [{ resourceId: 'ore', amount: 2 }],
        },
        {
          id: 'plate_recipe',
          output: { itemId: 'plate', amount: 1 },
          inputs: [{ resourceId: 'ingot', amount: 3 }],
        },
      ],
    );
    expect(expandToRaw('plate', 1, g)).toEqual([{ resourceId: 'ore', amount: 6 }]);
  });

  it('prefers the raw interpretation when an item is both raw and craftable', () => {
    const g = graph(
      [wood, { id: 'ore', name: 'Ore', isRaw: true }],
      [
        {
          id: 'wood_recipe',
          output: { itemId: 'wood', amount: 1 },
          inputs: [{ resourceId: 'ore', amount: 5 }],
        },
      ],
    );
    expect(expandToRaw('wood', 2, g)).toEqual([{ resourceId: 'wood', amount: 2 }]);
  });

  it('throws UnknownResourceError for a dangling input reference', () => {
    const g = graph(
      [{ id: 'plank', name: 'Plank', isRaw: false }],
      [
        {
          id: 'plank_recipe',
          output: { itemId: 'plank', amount: 1 },
          inputs: [{ resourceId: 'missing', amount: 1 }],
        },
      ],
    );
    expect(() => expandToRaw('plank', 1, g)).toThrow(UnknownResourceError);
  });

  it('is deterministic regardless of input order', () => {
    const resources: Resource[] = [
      { id: 'screw', name: 'Screw', isRaw: true },
      { id: 'plank', name: 'Plank', isRaw: true },
      { id: 'glue', name: 'Glue', isRaw: true },
      { id: 'crate', name: 'Crate', isRaw: false },
    ];
    const a = graph(resources, [
      {
        id: 'crate_recipe',
        output: { itemId: 'crate', amount: 1 },
        inputs: [
          { resourceId: 'screw', amount: 4 },
          { resourceId: 'plank', amount: 2 },
          { resourceId: 'glue', amount: 1 },
        ],
      },
    ]);
    const b = graph(resources, [
      {
        id: 'crate_recipe',
        output: { itemId: 'crate', amount: 1 },
        inputs: [
          { resourceId: 'glue', amount: 1 },
          { resourceId: 'plank', amount: 2 },
          { resourceId: 'screw', amount: 4 },
        ],
      },
    ]);

    const expected = [
      { resourceId: 'glue', amount: 1 },
      { resourceId: 'plank', amount: 2 },
      { resourceId: 'screw', amount: 4 },
    ];
    expect(expandToRaw('crate', 1, a)).toEqual(expected);
    expect(expandToRaw('crate', 1, b)).toEqual(expected);
  });
});

describe('cycle detection', () => {
  const cyclic = (): ResourceGraph =>
    graph(
      [
        { id: 'A', name: 'A', isRaw: false },
        { id: 'B', name: 'B', isRaw: false },
      ],
      [
        {
          id: 'recipe_a',
          output: { itemId: 'A', amount: 1 },
          inputs: [{ resourceId: 'B', amount: 1 }],
        },
        {
          id: 'recipe_b',
          output: { itemId: 'B', amount: 1 },
          inputs: [{ resourceId: 'A', amount: 1 }],
        },
      ],
    );

  it('detects a cycle and identifies the members', () => {
    const cycles = detectRecipeCycles(cyclic());
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0]).toContain('A');
    expect(cycles[0]).toContain('B');
  });

  it('assertAcyclic throws RecipeCycleError with the cycle path', () => {
    expect(() => assertAcyclic(cyclic())).toThrow(RecipeCycleError);
    try {
      assertAcyclic(cyclic());
      expect.unreachable('expected a cycle error');
    } catch (error) {
      expect(error).toBeInstanceOf(RecipeCycleError);
      expect((error as RecipeCycleError).cycle).toEqual(['A', 'B', 'A']);
    }
  });

  it('accepts an acyclic graph', () => {
    const acyclic = graph(
      [wood, { id: 'plank', name: 'Plank', isRaw: false }],
      [
        {
          id: 'plank_recipe',
          output: { itemId: 'plank', amount: 1 },
          inputs: [{ resourceId: 'wood', amount: 2 }],
        },
      ],
    );
    expect(detectRecipeCycles(acyclic)).toEqual([]);
    expect(() => assertAcyclic(acyclic)).not.toThrow();
  });
});

describe('aggregateResourceAmounts', () => {
  it('merges duplicates and sorts by resource id', () => {
    const merged = aggregateResourceAmounts([
      { resourceId: 'b', amount: 2 },
      { resourceId: 'a', amount: 1 },
      { resourceId: 'a', amount: 3 },
    ]);
    expect(merged).toEqual([
      { resourceId: 'a', amount: 4 },
      { resourceId: 'b', amount: 2 },
    ]);
  });
});
