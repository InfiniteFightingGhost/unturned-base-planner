/**
 * Public API of the pure domain layer.
 *
 * Nothing outside `src/domain` should deep-import from these modules; import
 * from `@/domain` instead. All exports are pure data, schemas, and functions —
 * no three.js, React, DOM, editor or engine dependency.
 */

export {
  DEFAULT_SCALE,
  SERIALIZATION_DECIMALS,
  SERIALIZATION_EPSILON,
  Vec3Schema,
  vec3,
  zeroVec3,
  normalizeScalar,
  normalizeVec3,
  approxEqual,
  normalizeTransform,
} from './primitives';
export type { Vec3, Vec3Tuple, TransformTuple } from './primitives';

export { IdSchema, createId } from './ids';
export type { Id } from './ids';

export {
  CURRENT_SCHEMA_VERSION,
  FloorSchema,
  ZoneSchema,
  MeasurementKindSchema,
  MeasurementSchema,
  AnnotationKindSchema,
  AnnotationSchema,
  ProjectSettingsSchema,
  ProjectMetadataSchema,
  ProjectSchema,
  createEmptyProject,
  serializeProject,
  parseProject,
  safeParseProject,
} from './project';
export type {
  Floor,
  Zone,
  MeasurementKind,
  Measurement,
  AnnotationKind,
  Annotation,
  ProjectSettings,
  ProjectMetadata,
  Project,
  CreateProjectOptions,
  SafeParseResult,
} from './project';

export {
  PieceCategorySchema,
  PieceDimensionsSchema,
  SnapPointSchema,
  VariantRefSchema,
  CollisionSchema,
  PieceModelSchema,
  PieceDefinitionSchema,
  DEFAULT_ALLOWED_ROTATIONS,
  getRotationCandidates,
} from './piece-definition';
export type {
  PieceCategory,
  PieceDimensions,
  SnapPoint,
  VariantRef,
  Collision,
  PieceModel,
  PieceDefinition,
} from './piece-definition';

export {
  BuildStateSchema,
  PlacedPieceMetadataSchema,
  PlacedPieceSchema,
  validatePlacedPieceReferences,
  assertValidPlacedPiece,
  canonicalizePlacedPiece,
  planPiece,
} from './placed-piece';
export type {
  BuildState,
  PlacedPieceMetadata,
  PlacedPiece,
  PlanPieceOptions,
} from './placed-piece';

export {
  ResourceSchema,
  ResourceAmountSchema,
  RecipeOutputSchema,
  CraftingRecipeSchema,
  ResourceGraphSchema,
  UnknownResourceError,
  RecipeCycleError,
  aggregateResourceAmounts,
  expandToRaw,
  detectRecipeCycles,
  assertAcyclic,
} from './resources';
export type {
  Resource,
  ResourceAmount,
  RecipeOutput,
  CraftingRecipe,
  ResourceGraph,
} from './resources';

export type { Command, Patch, HistoryEntry } from './commands';

export { History } from './history';

export { AssetRefSchema, AssetDescriptorSchema, fallbackDescriptor } from './asset';
export type { AssetRef, AssetDescriptor, AssetResolver } from './asset';

export { validateProjectReferences } from './validation';
export type { ValidationIssue } from './validation';

export { migrations, migrate } from './migration';
export type { Migration } from './migration';
