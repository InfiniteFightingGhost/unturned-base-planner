import { createId } from './ids';
import { CURRENT_SCHEMA_VERSION } from './project';

/**
 * Schema migrations.
 *
 * `migrations[n]` upgrades a document FROM version `n` TO version `n + 1`.
 * Migrations are pure: they never mutate their input and always return a new
 * object. `migrate` chains them in ascending order until the document reaches
 * `CURRENT_SCHEMA_VERSION`.
 */

export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Version 0 had no settings block, no measurements and no annotations. It is
 * the synthetic legacy format used by early prototypes and tests.
 */
function migrateV0ToV1(raw: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...raw };

  const metadataInput = isRecord(next.metadata) ? { ...next.metadata } : {};
  const createdAt = asString(metadataInput.createdAt) ?? new Date(0).toISOString();
  metadataInput.id = asString(metadataInput.id) ?? createId('project');
  metadataInput.name = asString(metadataInput.name) ?? 'Untitled Project';
  metadataInput.createdAt = createdAt;
  metadataInput.updatedAt = asString(metadataInput.updatedAt) ?? createdAt;
  next.metadata = metadataInput;

  if (next.settings === undefined) {
    next.settings = {};
  }
  if (next.floors === undefined) {
    next.floors = [];
  }
  if (next.zones === undefined) {
    next.zones = [];
  }
  if (next.pieces === undefined) {
    next.pieces = [];
  }
  if (next.measurements === undefined) {
    next.measurements = [];
  }
  if (next.annotations === undefined) {
    next.annotations = [];
  }

  next.schemaVersion = 1;
  return next;
}

export const migrations: Record<number, Migration> = {
  0: migrateV0ToV1,
};

function readVersion(raw: Record<string, unknown>): number {
  const value = raw.schemaVersion;
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid project schemaVersion: ${String(value)}`);
  }
  return value;
}

/**
 * Apply migrations until the document is at the current schema version.
 * Inputs are never mutated. Future versions and invalid roots are rejected.
 */
export function migrate(raw: unknown): unknown {
  if (!isRecord(raw)) {
    throw new Error('Cannot migrate project: expected a plain object');
  }

  let current: Record<string, unknown> = { ...raw };
  let version = readVersion(current);

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported project schemaVersion ${version}; this build supports up to ${CURRENT_SCHEMA_VERSION}`,
    );
  }

  while (version < CURRENT_SCHEMA_VERSION) {
    const migration = migrations[version];
    if (migration === undefined) {
      throw new Error(`No migration registered from schemaVersion ${version} to ${version + 1}`);
    }
    current = migration(current);
    version += 1;
  }

  return current;
}
