import type {
  PieceCategory,
  PieceDefinition,
  PlacedPiece,
  ResourceAmount,
  ResourceGraph,
} from '@/domain';

/**
 * Pure resource-aggregation contracts (P27).
 *
 * The types here describe the result of turning a set of placed pieces into
 * the raw materials required to build them. Everything is plain data so the
 * engine can run in a worker or a test with no rendering dependencies.
 */

/** Category of a non-fatal problem encountered while aggregating. */
export type ResourceIssueCode = 'unknown_definition' | 'invalid_recipe';

/**
 * A recoverable problem. The calculator never throws on bad input; instead it
 * records an issue and keeps aggregating the remaining pieces.
 */
export interface ResourceIssue {
  readonly code: ResourceIssueCode;
  readonly message: string;
  /** Present for `unknown_definition`, and for `invalid_recipe` where known. */
  readonly definitionId?: string;
  /** Present for `invalid_recipe`. */
  readonly recipeId?: string;
}

/** Raw materials required for one piece definition, sorted by resource id. */
export interface DefinitionBreakdown {
  readonly definitionId: string;
  readonly placedCount: number;
  readonly raw: ResourceAmount[];
}

/** Raw materials required for one piece category, sorted by resource id. */
export interface CategoryBreakdown {
  readonly category: PieceCategory;
  readonly placedCount: number;
  readonly raw: ResourceAmount[];
}

/** Aggregated build cost of a set of placed pieces. */
export interface ResourceTotals {
  /** Total raw materials, merged and sorted by `resourceId`. */
  readonly raw: ResourceAmount[];
  /** Number of pieces that resolved to a known definition. */
  readonly pieceCount: number;
  /** Per-definition placed counts and raw cost, sorted by `definitionId`. */
  readonly byDefinition: DefinitionBreakdown[];
  /** Per-category placed counts and raw cost, sorted by category. */
  readonly byCategory: CategoryBreakdown[];
  /** Recoverable problems; empty when every piece resolved cleanly. */
  readonly issues: ResourceIssue[];
}

/** Input accepted by the pure calculator core. */
export interface ResourceCalculatorInput {
  readonly pieces: readonly PlacedPiece[];
  readonly definitions: ReadonlyMap<string, PieceDefinition>;
  readonly graph: ResourceGraph;
}
