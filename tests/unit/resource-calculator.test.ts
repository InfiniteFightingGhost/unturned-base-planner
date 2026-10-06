import { describe, expect, it } from 'vitest';
import { DATASET } from '@/data';
import {
  breakdownByCategory,
  breakdownByDefinition,
  computeRawRequirements,
  computeResourceTotals,
  createResourceCalculator,
  subtractInventory,
} from '@/resources';
import type { PlacedPiece, ResourceAmount, ResourceGraph } from '@/domain';
import { planPiece, ResourceGraphSchema } from '@/domain';

/** Build a placed piece from a real definition id. */
function pieceOf(definitionId: string, index: number): PlacedPiece {
  const definition = DATASET.definitionById.get(definitionId);
  if (definition === undefined) {
    throw new Error(`Test fixture missing definition "${definitionId}"`);
  }
  return planPiece(definition, { position: [index, 0, 0], floorId: 'floor.test' });
}

function totalsFor(pieces: readonly PlacedPiece[]) {
  return computeResourceTotals(pieces, DATASET.definitionById, DATASET.graph);
}

const WALL_BIRCH = 'wall.birch';
const FLOOR_BIRCH = 'floor.birch';
const WALL_MAPLE = 'wall.maple';
const DOOR_WOOD_BIRCH = 'door.wood.birch';

describe('resource calculator (P27)', () => {
  it('returns empty totals for an empty project', () => {
    const totals = totalsFor([]);
    expect(totals.raw).toEqual([]);
    expect(totals.pieceCount).toBe(0);
    expect(totals.byDefinition).toEqual([]);
    expect(totals.byCategory).toEqual([]);
    expect(totals.issues).toEqual([]);
  });

  it('expands a single birch wall to exactly three birch logs', () => {
    const totals = totalsFor([pieceOf(WALL_BIRCH, 0)]);
    expect(totals.raw).toEqual([{ resourceId: 'log.birch', amount: 3 }]);
    expect(totals.pieceCount).toBe(1);
  });

  it('scales linearly: 100 birch walls need 300 birch logs', () => {
    const pieces = Array.from({ length: 100 }, (_, index) => pieceOf(WALL_BIRCH, index));
    const totals = totalsFor(pieces);
    expect(totals.raw).toEqual([{ resourceId: 'log.birch', amount: 300 }]);
    expect(totals.pieceCount).toBe(100);
  });

  it('aggregates mixed pieces deterministically regardless of input order', () => {
    const pieces = [
      pieceOf(WALL_BIRCH, 0),
      pieceOf(WALL_MAPLE, 1),
      pieceOf(FLOOR_BIRCH, 2),
      pieceOf(DOOR_WOOD_BIRCH, 3),
    ];
    const forward = totalsFor(pieces);
    const reversed = totalsFor([...pieces].reverse());
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });

  it('subtracting one piece reduces totals by exactly that piece raw cost', () => {
    const pieces = [
      pieceOf(WALL_BIRCH, 0),
      pieceOf(FLOOR_BIRCH, 1),
      pieceOf(WALL_MAPLE, 2),
      pieceOf(WALL_BIRCH, 3),
    ];
    const before = totalsFor(pieces);
    const removed = pieces[0];
    if (removed === undefined) {
      throw new Error('expected a first piece');
    }
    const removedRaw = computeRawRequirements([removed], DATASET.definitionById, DATASET.graph);
    const after = totalsFor(pieces.slice(1));

    expect(after.raw).toEqual(subtractInventory(before, removedRaw).remaining);
  });

  it('expands nested recipes down to raw resources only (wooden door)', () => {
    const totals = totalsFor([pieceOf(DOOR_WOOD_BIRCH, 0)]);

    expect(totals.raw).toEqual([
      { resourceId: 'log.birch', amount: 2 },
      { resourceId: 'scrap.metal', amount: 1 },
    ]);

    for (const { resourceId } of totals.raw) {
      expect(DATASET.resourceById.get(resourceId)?.isRaw).toBe(true);
    }
    expect(totals.raw.some((entry) => entry.resourceId === 'plank.birch')).toBe(false);
  });

  it('records an unknown definition as an issue without throwing', () => {
    const valid = pieceOf(WALL_BIRCH, 0);
    const orphan: PlacedPiece = { ...valid, id: 'piece.orphan', definitionId: 'does.not.exist' };
    const totals = totalsFor([orphan, valid]);

    expect(totals.raw).toEqual([{ resourceId: 'log.birch', amount: 3 }]);
    expect(totals.pieceCount).toBe(1);
    expect(totals.issues).toHaveLength(1);
    expect(totals.issues[0]?.code).toBe('unknown_definition');
    expect(totals.issues[0]?.definitionId).toBe('does.not.exist');
  });

  it('records an invalid recipe as an issue without throwing', () => {
    const valid = pieceOf(WALL_BIRCH, 0);
    const brokenDefinition = {
      ...DATASET.definitionById.get(WALL_BIRCH)!,
      id: 'wall.broken',
      resourceRecipe: 'recipe.does.not.exist',
    };
    const definitions = new Map(DATASET.definitionById);
    definitions.set(brokenDefinition.id, brokenDefinition);
    const broken: PlacedPiece = { ...valid, id: 'piece.broken', definitionId: 'wall.broken' };

    const totals = computeResourceTotals([broken], definitions, DATASET.graph);
    expect(totals.raw).toEqual([]);
    expect(totals.issues).toHaveLength(1);
    expect(totals.issues[0]?.code).toBe('invalid_recipe');
    expect(totals.issues[0]?.recipeId).toBe('recipe.does.not.exist');
  });

  it('orders byDefinition and byCategory by stable keys', () => {
    const pieces = [pieceOf(WALL_MAPLE, 0), pieceOf(FLOOR_BIRCH, 1), pieceOf(WALL_BIRCH, 2)];

    const definitions = breakdownByDefinition(pieces, DATASET.definitionById, DATASET.graph);
    expect(definitions.map((entry) => entry.definitionId)).toEqual([
      'floor.birch',
      'wall.birch',
      'wall.maple',
    ]);
    expect(definitions.every((entry) => entry.placedCount === 1)).toBe(true);

    const categories = breakdownByCategory(pieces, DATASET.definitionById, DATASET.graph);
    expect(categories.map((entry) => entry.category)).toEqual(['floor', 'wall']);
    const wall = categories.find((entry) => entry.category === 'wall');
    expect(wall?.placedCount).toBe(2);
    expect(wall?.raw).toEqual([
      { resourceId: 'log.birch', amount: 3 },
      { resourceId: 'log.maple', amount: 3 },
    ]);
  });
});

describe('subtractInventory (P32 helper)', () => {
  it('clamps remaining at zero and reports the correct shortage', () => {
    const totals = totalsFor([pieceOf(WALL_BIRCH, 0), pieceOf(WALL_BIRCH, 1)]);
    const diff = subtractInventory(totals, [{ resourceId: 'log.birch', amount: 4 }]);
    expect(diff.remaining).toEqual([{ resourceId: 'log.birch', amount: 2 }]);
    expect(diff.surplus).toEqual([]);
  });

  it('reports surplus, including resources not required, and keeps sorted order', () => {
    const totals = totalsFor([pieceOf(WALL_BIRCH, 0), pieceOf(WALL_BIRCH, 1)]);
    const inventory: ResourceAmount[] = [
      { resourceId: 'log.birch', amount: 8 },
      { resourceId: 'cloth', amount: 3 },
    ];
    const diff = subtractInventory(totals, inventory);
    expect(diff.remaining).toEqual([]);
    expect(diff.surplus).toEqual([
      { resourceId: 'cloth', amount: 3 },
      { resourceId: 'log.birch', amount: 2 },
    ]);
  });

  it('is deterministic for shuffled inventory input', () => {
    const totals = totalsFor([pieceOf(WALL_BIRCH, 0), pieceOf(FLOOR_BIRCH, 1)]);
    const inventory: ResourceAmount[] = [
      { resourceId: 'log.birch', amount: 1 },
      { resourceId: 'cloth', amount: 5 },
    ];
    const a = subtractInventory(totals, inventory);
    const b = subtractInventory(totals, [...inventory].reverse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('createResourceCalculator factory', () => {
  it('binds the dataset and matches the free functions', () => {
    const calculator = createResourceCalculator(DATASET);
    const pieces = [pieceOf(WALL_BIRCH, 0), pieceOf(FLOOR_BIRCH, 1)];
    expect(calculator.computeTotals(pieces)).toEqual(totalsFor(pieces));
    expect(calculator.computeRawRequirements(pieces)).toEqual(
      computeRawRequirements(pieces, DATASET.definitionById, DATASET.graph),
    );
  });

  it('produces an empty graph result without throwing', () => {
    const emptyGraph: ResourceGraph = ResourceGraphSchema.parse({
      schemaVersion: 1,
      resources: [],
      recipes: [],
    });
    const totals = computeResourceTotals([], new Map(), emptyGraph);
    expect(totals.raw).toEqual([]);
    expect(totals.issues).toEqual([]);
  });
});
