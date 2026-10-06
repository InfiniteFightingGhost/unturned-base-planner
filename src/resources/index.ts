/**
 * Public API of the pure resource-aggregation layer (P27 + P29).
 *
 * Turns placed pieces into raw material requirements. Depends only on the
 * domain and data contracts; safe to use in a worker or in tests. Import from
 * `@/resources`.
 */

export type {
  ResourceTotals,
  ResourceIssue,
  ResourceIssueCode,
  CategoryBreakdown,
  DefinitionBreakdown,
  ResourceCalculatorInput,
} from './types';

export {
  computeResourceTotals,
  computeRawRequirements,
  breakdownByDefinition,
  breakdownByCategory,
  subtractInventory,
  createResourceCalculator,
} from './calculator';
export type {
  InventoryDiff,
  ResourceCalculator,
  ResourceCalculatorDataset,
} from './calculator';

export {
  filterPiecesByFloor,
  filterPiecesByZone,
  filterPiecesByBuildState,
  filterUnbuiltPieces,
  computeConstructionProgress,
  computeRemainingMaterials,
  computeInventoryBalance,
} from './filters';
export type { ConstructionProgress, InventoryBalance } from './filters';
