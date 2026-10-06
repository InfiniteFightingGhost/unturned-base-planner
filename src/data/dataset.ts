import { ResourceGraphSchema, detectRecipeCycles } from '@/domain';
import type {
  CraftingRecipe,
  PieceDefinition,
  Resource,
  ResourceGraph,
} from '@/domain';
import { RESOURCES } from './resources';
import { RECIPES } from './recipes';
import { PIECE_DEFINITIONS } from './piece-definitions';

/** Semver of the composed data layer (resources + recipes + definitions). */
export const DATASET_VERSION = '0.1.0';

/** Version of the `ResourceGraph` wire shape itself. */
export const RESOURCE_GRAPH_SCHEMA_VERSION = 1;

export interface BuildDataset {
  readonly version: string;
  readonly graph: ResourceGraph;
  readonly definitions: PieceDefinition[];
  readonly definitionById: ReadonlyMap<string, PieceDefinition>;
  readonly resourceById: ReadonlyMap<string, Resource>;
  readonly recipeById: ReadonlyMap<string, CraftingRecipe>;
}

function indexById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return map;
}

export const RESOURCE_GRAPH: ResourceGraph = ResourceGraphSchema.parse({
  schemaVersion: RESOURCE_GRAPH_SCHEMA_VERSION,
  resources: RESOURCES,
  recipes: RECIPES,
});

export const DATASET: BuildDataset = {
  version: DATASET_VERSION,
  graph: RESOURCE_GRAPH,
  definitions: PIECE_DEFINITIONS,
  definitionById: indexById(PIECE_DEFINITIONS),
  resourceById: indexById(RESOURCES),
  recipeById: indexById(RECIPES),
};

export type DatasetIssueCode =
  | 'duplicate_piece_id'
  | 'duplicate_recipe_id'
  | 'duplicate_resource_id'
  | 'missing_piece_recipe'
  | 'unknown_recipe_input'
  | 'missing_recipe_source'
  | 'recipe_cycle'
  | 'non_positive_dimension';

export interface DatasetIssue {
  readonly code: DatasetIssueCode;
  readonly message: string;
  readonly id: string;
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      dupes.add(id);
    } else {
      seen.add(id);
    }
  }
  return [...dupes].sort();
}

/**
 * Structural + semantic validation of a composed dataset. Returns an empty
 * array when the dataset is coherent; otherwise one issue per problem. Pure and
 * side-effect free so it can run in CI and in the browser.
 */
export function validateDataset(dataset: BuildDataset): DatasetIssue[] {
  const issues: DatasetIssue[] = [];

  for (const id of duplicates(dataset.graph.resources.map((resource) => resource.id))) {
    issues.push({ code: 'duplicate_resource_id', message: `Duplicate resource id "${id}"`, id });
  }
  for (const id of duplicates(dataset.graph.recipes.map((recipe) => recipe.id))) {
    issues.push({ code: 'duplicate_recipe_id', message: `Duplicate recipe id "${id}"`, id });
  }
  for (const id of duplicates(dataset.definitions.map((definition) => definition.id))) {
    issues.push({ code: 'duplicate_piece_id', message: `Duplicate piece id "${id}"`, id });
  }

  const resourceIds = new Set(dataset.graph.resources.map((resource) => resource.id));
  const recipeIds = new Set(dataset.graph.recipes.map((recipe) => recipe.id));
  const recipeOutputIds = new Set(dataset.graph.recipes.map((recipe) => recipe.output.itemId));

  for (const definition of dataset.definitions) {
    if (!recipeIds.has(definition.resourceRecipe)) {
      issues.push({
        code: 'missing_piece_recipe',
        message: `Piece "${definition.id}" references unknown recipe "${definition.resourceRecipe}"`,
        id: definition.id,
      });
    }
    const { width, height, depth } = definition.dimensions;
    if (!(width > 0 && height > 0 && depth > 0)) {
      issues.push({
        code: 'non_positive_dimension',
        message: `Piece "${definition.id}" has non-positive dimensions`,
        id: definition.id,
      });
    }
  }

  for (const recipe of dataset.graph.recipes) {
    if (recipe.source === undefined || recipe.source.trim() === '') {
      issues.push({
        code: 'missing_recipe_source',
        message: `Recipe "${recipe.id}" is missing a source`,
        id: recipe.id,
      });
    }
    for (const input of recipe.inputs) {
      if (!resourceIds.has(input.resourceId) && !recipeOutputIds.has(input.resourceId)) {
        issues.push({
          code: 'unknown_recipe_input',
          message: `Recipe "${recipe.id}" references unknown input "${input.resourceId}"`,
          id: recipe.id,
        });
      }
    }
  }

  for (const cycle of detectRecipeCycles(dataset.graph)) {
    issues.push({
      code: 'recipe_cycle',
      message: `Recipe cycle detected: ${cycle.join(' -> ')}`,
      id: cycle.join(' -> '),
    });
  }

  return issues;
}
