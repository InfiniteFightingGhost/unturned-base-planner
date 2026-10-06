import { z } from 'zod';
import { IdSchema, createId } from './ids';
import { Vec3Schema } from './primitives';
import { PlacedPieceSchema, canonicalizePlacedPiece } from './placed-piece';
import { migrate } from './migration';

/**
 * Project (P1): the serializable root document.
 *
 * The document is plain data. Every mutation must go through the command /
 * history contract in `commands.ts` and `history.ts`; nothing in this module
 * mutates a project in place.
 */

export const CURRENT_SCHEMA_VERSION = 1;

export const FloorSchema = z.object({
  id: IdSchema,
  name: z.string(),
  index: z.int().min(0),
  elevation: z.number().default(0),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
});

export type Floor = z.infer<typeof FloorSchema>;

export const ZoneSchema = z.object({
  id: IdSchema,
  name: z.string(),
  color: z.string().default('#3b82f6'),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
});

export type Zone = z.infer<typeof ZoneSchema>;

export const MeasurementKindSchema = z.enum([
  'distance',
  'width',
  'height',
  'area',
  'perimeter',
]);

export type MeasurementKind = z.infer<typeof MeasurementKindSchema>;

export const MeasurementSchema = z.object({
  id: IdSchema,
  kind: MeasurementKindSchema,
  points: z.array(Vec3Schema),
  value: z.number(),
});

export type Measurement = z.infer<typeof MeasurementSchema>;

export const AnnotationKindSchema = z.enum(['note', 'label']);

export type AnnotationKind = z.infer<typeof AnnotationKindSchema>;

export const AnnotationSchema = z.object({
  id: IdSchema,
  kind: AnnotationKindSchema,
  position: Vec3Schema,
  text: z.string(),
});

export type Annotation = z.infer<typeof AnnotationSchema>;

export const ProjectSettingsSchema = z.object({
  gridSize: z.number().positive().default(1),
  snapEnabled: z.boolean().default(true),
  defaultFloorHeight: z.number().positive().default(4.25),
  units: z.literal('m').default('m'),
});

export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export const ProjectMetadataSchema = z.object({
  id: IdSchema,
  name: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  author: z.string().optional(),
});

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>;

export const ProjectSchema = z.object({
  schemaVersion: z.int().positive(),
  metadata: ProjectMetadataSchema,
  settings: ProjectSettingsSchema,
  floors: z.array(FloorSchema).default([]),
  zones: z.array(ZoneSchema).default([]),
  pieces: z.array(PlacedPieceSchema).default([]),
  measurements: z.array(MeasurementSchema).default([]),
  annotations: z.array(AnnotationSchema).default([]),
});

export type Project = z.infer<typeof ProjectSchema>;

/** Options for `createEmptyProject`. */
export interface CreateProjectOptions {
  id?: string;
  author?: string;
  now?: string;
}

/**
 * Create a valid, empty project at the current schema version with a single
 * default ground floor. Timestamps come from the caller or the clock.
 */
export function createEmptyProject(name: string, opts: CreateProjectOptions = {}): Project {
  const now = opts.now ?? new Date().toISOString();
  const candidate: unknown = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: {
      id: opts.id ?? createId('project'),
      name,
      createdAt: now,
      updatedAt: now,
      ...(opts.author !== undefined ? { author: opts.author } : {}),
    },
    settings: {},
    floors: [
      {
        id: createId('floor'),
        name: 'Ground Floor',
        index: 0,
        elevation: 0,
        visible: true,
        locked: false,
      },
    ],
    zones: [],
    pieces: [],
    measurements: [],
    annotations: [],
  };
  return ProjectSchema.parse(candidate);
}

/**
 * Serialize a project deterministically. Placed-piece transforms are
 * canonicalized first so logically-equal documents produce identical strings.
 */
export function serializeProject(project: Project): string {
  const canonical: Project = {
    ...project,
    pieces: project.pieces.map(canonicalizePlacedPiece),
  };
  return JSON.stringify(ProjectSchema.parse(canonical));
}

function parseRawInput(raw: unknown): unknown {
  if (typeof raw === 'string') {
    return JSON.parse(raw) as unknown;
  }
  return raw;
}

/**
 * Parse and validate a project, running any required migrations first. Accepts
 * either a plain object or a JSON string (as produced by `serializeProject`).
 * Throws on invalid data (including unknown or future schema versions).
 */
export function parseProject(raw: unknown): Project {
  const migrated = migrate(parseRawInput(raw));
  return ProjectSchema.parse(migrated);
}

/** Result of `safeParseProject`. */
export type SafeParseResult =
  | { success: true; data: Project }
  | { success: false; error: z.ZodError };

function toZodError(error: unknown): z.ZodError {
  const message = error instanceof Error ? error.message : String(error);
  return new z.ZodError([{ code: 'custom', message, path: [], input: undefined }]);
}

/**
 * Non-throwing variant of `parseProject`. Migration failures (future versions,
 * malformed roots) are surfaced as a `ZodError` rather than exceptions.
 */
export function safeParseProject(raw: unknown): SafeParseResult {
  let migrated: unknown;
  try {
    migrated = migrate(parseRawInput(raw));
  } catch (error) {
    return { success: false, error: toZodError(error) };
  }
  const result = ProjectSchema.safeParse(migrated);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
