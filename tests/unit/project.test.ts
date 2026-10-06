import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  createEmptyProject,
  parseProject,
  safeParseProject,
  serializeProject,
} from '@/domain';
import { makeDefinition, makePiece } from './domain-fixtures';

const ISO = '2024-01-01T00:00:00.000Z';

describe('createEmptyProject', () => {
  it('creates a current-version project with one default floor and no prefabs', () => {
    const project = createEmptyProject('My Base', { id: 'p1', now: ISO });
    expect(project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(project.metadata.id).toBe('p1');
    expect(project.metadata.name).toBe('My Base');
    expect(project.floors).toHaveLength(1);
    expect(project.floors[0]?.index).toBe(0);
    expect(project.settings.gridSize).toBe(1);
    expect(project.pieces).toEqual([]);
    expect(project.prefabs).toEqual([]);
  });
});

describe('serialize / parse round-trip', () => {
  it('preserves data through a serialize -> parse cycle', () => {
    const project = createEmptyProject('Base', { id: 'p1', now: ISO });
    const floorId = project.floors[0]?.id ?? '';
    const piece = makePiece(makeDefinition(), floorId, 'piece-1', 2);
    const withPiece = { ...project, pieces: [piece] };

    const roundTripped = parseProject(serializeProject(withPiece));

    expect(roundTripped).toEqual(withPiece);
  });
});

describe('safeParseProject', () => {
  it('rejects a project with a bad field type', () => {
    const result = safeParseProject({ schemaVersion: 1, metadata: 123, settings: {} });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });

  it('rejects a project missing required fields', () => {
    const result = safeParseProject({ schemaVersion: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects a future schema version', () => {
    const future = { schemaVersion: 999, metadata: {}, settings: {} };
    expect(parseProject.bind(null, future)).toThrow();
    expect(safeParseProject(future).success).toBe(false);
  });
});

describe('migration', () => {
  it('migrates a synthetic v0 project to the current version', () => {
    const legacy = {
      schemaVersion: 0,
      metadata: { id: 'legacy', name: 'Legacy', createdAt: ISO, updatedAt: ISO },
      floors: [],
    };

    const migrated = parseProject(legacy);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.settings.gridSize).toBe(1);
    expect(migrated.annotations).toEqual([]);
    expect(migrated.measurements).toEqual([]);
    expect(migrated.pieces).toEqual([]);
    expect(migrated.prefabs).toEqual([]);
    expect(migrated.inventory).toEqual([]);
  });

  it('migrates a v1 project to v3 by adding prefabs and inventory', () => {
    const legacy = {
      schemaVersion: 1,
      metadata: { id: 'legacy', name: 'Legacy', createdAt: ISO, updatedAt: ISO },
      settings: {},
      floors: [],
      zones: [],
      pieces: [],
      measurements: [],
      annotations: [],
    };

    const migrated = parseProject(legacy);

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.prefabs).toEqual([]);
    expect(migrated.inventory).toEqual([]);
  });

  it('migrates a v2 project to v3 by adding an empty inventory', () => {
    const legacy = {
      schemaVersion: 2,
      metadata: { id: 'legacy', name: 'Legacy', createdAt: ISO, updatedAt: ISO },
      settings: {},
      floors: [],
      zones: [],
      pieces: [],
      measurements: [],
      annotations: [],
      prefabs: [],
    };

    const migrated = parseProject(legacy);

    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.inventory).toEqual([]);
    expect(migrated.prefabs).toEqual([]);
  });

  it('does not mutate the migration input', () => {
    const legacy = {
      schemaVersion: 0,
      metadata: { id: 'legacy', name: 'Legacy', createdAt: ISO, updatedAt: ISO },
      floors: [],
    };
    const snapshot = JSON.parse(JSON.stringify(legacy)) as unknown;
    parseProject(legacy);
    expect(legacy).toEqual(snapshot);
  });
});
