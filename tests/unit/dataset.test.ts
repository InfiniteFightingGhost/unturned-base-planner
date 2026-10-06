import { describe, expect, it } from 'vitest';
import { DATASET, DATASET_VERSION, validateDataset } from '@/data';
import type { PieceCategory } from '@/domain';

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
