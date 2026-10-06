import { describe, expect, it } from 'vitest';
import { DATASET, DATASET_VERSION, validateDataset } from '@/data';
import { EBuildSchema, EConstructSchema, type PieceCategory } from '@/domain';

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      dupes.push(id);
    } else {
      seen.add(id);
    }
  }
  return dupes;
}

const BARRICADE_CATEGORIES: ReadonlySet<PieceCategory> = new Set<PieceCategory>([
  'door',
  'defensive',
  'decorative',
  'fence',
]);

function isBarricadeLike(category: PieceCategory, build: unknown): boolean {
  return build !== undefined || BARRICADE_CATEGORIES.has(category);
}

const STRUCTURES = DATASET.definitions.filter(
  (definition) => !isBarricadeLike(definition.category, definition.build),
);
const BARRICADES = DATASET.definitions.filter((definition) =>
  isBarricadeLike(definition.category, definition.build),
);

describe('dataset integrity', () => {
  it('validateDataset reports zero issues for the shipped dataset', () => {
    const issues = validateDataset(DATASET);
    expect(issues.map((issue) => issue.message)).toEqual([]);
  });

  it('exposes a non-empty dataset version', () => {
    expect(typeof DATASET_VERSION).toBe('string');
    expect(DATASET_VERSION.length).toBeGreaterThan(0);
    expect(DATASET.version).toBe(DATASET_VERSION);
  });

  it('records the game-accuracy pass with the 0.2.0 dataset version', () => {
    expect(DATASET_VERSION).toBe('0.2.0');
    expect(DATASET.version).toBe('0.2.0');
  });

  it('has unique piece, recipe, and resource ids', () => {
    expect(duplicates(DATASET.definitions.map((definition) => definition.id))).toEqual([]);
    expect(duplicates(DATASET.graph.recipes.map((recipe) => recipe.id))).toEqual([]);
    expect(duplicates(DATASET.graph.resources.map((resource) => resource.id))).toEqual([]);
  });

  it('gives every piece positive dimensions and a resolvable recipe', () => {
    for (const definition of DATASET.definitions) {
      expect(definition.dimensions.width).toBeGreaterThan(0);
      expect(definition.dimensions.height).toBeGreaterThan(0);
      expect(definition.dimensions.depth).toBeGreaterThan(0);
      expect(DATASET.recipeById.get(definition.resourceRecipe)).toBeDefined();
      expect(DATASET.definitionById.get(definition.id)).toBe(definition);
    }
  });

  it('uses the U3-SDK HousingConnections dimensions for floor and wall families', () => {
    expect(DATASET.definitionById.get('floor.birch')?.dimensions).toEqual({
      width: 6.0,
      height: 0.5,
      depth: 6.0,
    });
    expect(DATASET.definitionById.get('wall.birch')?.dimensions).toEqual({
      width: 6.0,
      height: 4.25,
      depth: 0.5,
    });
    expect(DATASET.definitionById.get('pillar.metal')?.dimensions).toEqual({
      width: 0.5,
      height: 4.25,
      depth: 0.5,
    });
    expect(DATASET.definitionById.get('post.birch')?.dimensions).toEqual({
      width: 0.5,
      height: 2.125,
      depth: 0.5,
    });
    expect(DATASET.definitionById.get('rampart.brick')?.dimensions).toEqual({
      width: 6.0,
      height: 1.8,
      depth: 0.5,
    });
    expect(DATASET.definitionById.get('ramp.metal')?.dimensions).toEqual({
      width: 6.0,
      height: 4.25,
      depth: 6.0,
    });
  });

  it('gives every structure definition a valid explicit construct', () => {
    expect(STRUCTURES.length).toBeGreaterThan(0);
    for (const definition of STRUCTURES) {
      expect(definition.construct).toBeDefined();
      expect(EConstructSchema.safeParse(definition.construct).success).toBe(true);
      expect(definition.build).toBeUndefined();
    }
  });

  it('gives every barricade definition a valid explicit build', () => {
    expect(BARRICADES.length).toBeGreaterThan(0);
    for (const definition of BARRICADES) {
      expect(definition.build).toBeDefined();
      expect(EBuildSchema.safeParse(definition.build).success).toBe(true);
      expect(definition.construct).toBeUndefined();
    }
  });

  it('classifies every definition as exactly one of structure or barricade', () => {
    expect(STRUCTURES.length + BARRICADES.length).toBe(DATASET.definitions.length);
  });

  it('attributes every recipe to a source', () => {
    for (const recipe of DATASET.graph.recipes) {
      expect(recipe.source).toBeDefined();
      expect(recipe.source?.startsWith('https://unturned.wiki.gg/')).toBe(true);
    }
  });

  it('covers the required piece categories', () => {
    const categories = new Set<PieceCategory>(
      DATASET.definitions.map((definition) => definition.category),
    );
    const required: PieceCategory[] = [
      'floor',
      'wall',
      'window',
      'doorway',
      'door',
      'pillar',
      'ramp',
      'stair',
      'roof',
      'fence',
    ];
    for (const category of required) {
      expect(categories.has(category)).toBe(true);
    }
    expect(categories.has('decorative') || categories.has('defensive')).toBe(true);
  });
});
