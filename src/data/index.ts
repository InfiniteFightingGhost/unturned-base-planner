/**
 * Public API of the Unturned build-data layer (P5–P7).
 *
 * Data-driven, independently versioned catalog of resources, recipes, piece
 * definitions, the composed dataset, and the proxy asset resolver. Depends only
 * on the pure domain contracts; no engine or editor imports.
 */

export { RAW_RESOURCES, INTERMEDIATE_RESOURCES, RESOURCES } from './resources';
export { INTERMEDIATE_RECIPES, RECIPES } from './recipes';
export {
  PROXY_DIMENSIONS,
  PIECE_DEFINITIONS,
  PIECE_RECIPES,
} from './piece-definitions';
export {
  DATASET_VERSION,
  RESOURCE_GRAPH_SCHEMA_VERSION,
  RESOURCE_GRAPH,
  DATASET,
  validateDataset,
} from './dataset';
export type { BuildDataset, DatasetIssue, DatasetIssueCode } from './dataset';
export {
  ProxyAssetResolver,
  createProxyAssetResolver,
  UNKNOWN_ASSET_DIMENSIONS,
} from './asset-resolver';
