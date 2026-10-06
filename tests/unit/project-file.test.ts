import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  createEmptyProject,
  parseProject,
  serializeProject,
} from '@/domain';
import {
  PROJECT_FILE_FORMAT,
  ProjectImportError,
  defaultFileName,
  exportProjectFile,
  importProjectFile,
} from '@/persistence/project-file';

const ISO = '2024-01-01T00:00:00.000Z';

function legacyV1(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    metadata: { id: 'legacy-v1', name: 'Legacy V1', createdAt: ISO, updatedAt: ISO },
    settings: {},
    floors: [{ id: 'floor-1', name: 'Ground Floor', index: 0, elevation: 0, visible: true, locked: false }],
    zones: [],
    pieces: [],
    measurements: [],
    annotations: [],
  };
}

describe('exportProjectFile', () => {
  it('writes a self-describing envelope with a canonical project', () => {
    const project = createEmptyProject('My Base', { id: 'p1', now: ISO });
    const parsed = JSON.parse(exportProjectFile(project)) as {
      format: string;
      schemaVersion: number;
      project: unknown;
    };

    expect(parsed.format).toBe(PROJECT_FILE_FORMAT);
    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(parseProject(parsed.project)).toEqual(project);
  });
});

describe('importProjectFile', () => {
  it('round-trips an exported project', () => {
    const project = createEmptyProject('My Base', { id: 'p1', now: ISO });
    const roundTripped = importProjectFile(exportProjectFile(project));
    expect(roundTripped).toEqual(project);
  });

  it('accepts a bare serialized project', () => {
    const project = createEmptyProject('Bare', { id: 'p2', now: ISO });
    const roundTripped = importProjectFile(serializeProject(project));
    expect(roundTripped).toEqual(project);
  });

  it('rejects invalid JSON with a typed error', () => {
    expect(() => importProjectFile('{ not json')).toThrow(ProjectImportError);
  });

  it('rejects an unsupported envelope format', () => {
    const bad = JSON.stringify({ format: 'something-else', project: {} });
    expect(() => importProjectFile(bad)).toThrow(ProjectImportError);
  });

  it('rejects an envelope without a project', () => {
    const bad = JSON.stringify({ format: PROJECT_FILE_FORMAT, schemaVersion: 3 });
    expect(() => importProjectFile(bad)).toThrow(ProjectImportError);
  });

  it('rejects a syntactically valid but schema-invalid document', () => {
    const bad = JSON.stringify({ schemaVersion: 3, metadata: 123, settings: {} });
    expect(() => importProjectFile(bad)).toThrow(ProjectImportError);
  });

  it('migrates a v1 project to the current schema version', () => {
    const project = importProjectFile(JSON.stringify(legacyV1()));
    expect(project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(project.prefabs).toEqual([]);
    expect(project.inventory).toEqual([]);
    expect(project.metadata.id).toBe('legacy-v1');
  });

  it('migrates a v2 project to the current schema version', () => {
    const v2 = { ...legacyV1(), schemaVersion: 2, prefabs: [] };
    const project = importProjectFile(JSON.stringify(v2));
    expect(project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(project.inventory).toEqual([]);
  });

  it('migrates a v1 project wrapped in an envelope', () => {
    const envelope = JSON.stringify({
      format: PROJECT_FILE_FORMAT,
      schemaVersion: 1,
      exportedAt: ISO,
      project: legacyV1(),
    });
    expect(importProjectFile(envelope).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});

describe('defaultFileName', () => {
  it('slugifies the project name and appends the extension', () => {
    const project = createEmptyProject('My Cool Base!', { id: 'p1', now: ISO });
    expect(defaultFileName(project)).toBe('my-cool-base.ubp.json');
  });

  it('falls back to a stable default for symbol-only names', () => {
    const project = createEmptyProject('***', { id: 'p1', now: ISO });
    expect(defaultFileName(project)).toBe('unturned-base.ubp.json');
  });
});
