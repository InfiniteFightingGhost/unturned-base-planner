import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, createEmptyProject, parseProject, safeParseProject, serializeProject } from '@/domain';

const ISO = '2024-01-01T00:00:00.000Z';

function v2Project(): Record<string, unknown> {
  return {
    schemaVersion: 2,
    metadata: { id: 'p1', name: 'Base', createdAt: ISO, updatedAt: ISO },
    settings: {},
    floors: [],
    zones: [],
    pieces: [],
    measurements: [],
    annotations: [],
    prefabs: [],
  };
}

describe('inventory schema (v3)', () => {
  it('creates a current-version project with an empty inventory', () => {
    const project = createEmptyProject('Base', { id: 'p1', now: ISO });
    expect(project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(CURRENT_SCHEMA_VERSION).toBe(3);
    expect(project.inventory).toEqual([]);
  });

  it('migrates a v2 project to v3 by adding inventory: []', () => {
    const migrated = parseProject(v2Project());
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.inventory).toEqual([]);
  });

  it('does not mutate the v2 migration input', () => {
    const legacy = v2Project();
    const snapshot = JSON.parse(JSON.stringify(legacy)) as unknown;
    parseProject(legacy);
    expect(legacy).toEqual(snapshot);
  });

  it('round-trips a v3 project containing inventory', () => {
    const base = createEmptyProject('Base', { id: 'p1', now: ISO });
    const withInventory = {
      ...base,
      inventory: [
        { resourceId: 'log.birch', amount: 12 },
        { resourceId: 'scrap.metal', amount: 3 },
      ],
    };

    const roundTripped = parseProject(serializeProject(withInventory));

    expect(roundTripped).toEqual(withInventory);
    expect(roundTripped.inventory).toHaveLength(2);
  });

  it('rejects an inventory entry with a non-positive amount', () => {
    const base = createEmptyProject('Base', { id: 'p1', now: ISO });
    const invalid = { ...base, inventory: [{ resourceId: 'log.birch', amount: 0 }] };
    expect(safeParseProject(invalid).success).toBe(false);
  });

  it('rejects an inventory entry with a non-integer amount', () => {
    const base = createEmptyProject('Base', { id: 'p1', now: ISO });
    const invalid = { ...base, inventory: [{ resourceId: 'log.birch', amount: 1.5 }] };
    expect(safeParseProject(invalid).success).toBe(false);
  });

  it('rejects an inventory entry with an empty resourceId', () => {
    const base = createEmptyProject('Base', { id: 'p1', now: ISO });
    const invalid = { ...base, inventory: [{ resourceId: '', amount: 1 }] };
    expect(safeParseProject(invalid).success).toBe(false);
  });

  it('rejects a future schema version', () => {
    const future = { schemaVersion: 999, metadata: {}, settings: {} };
    expect(safeParseProject(future).success).toBe(false);
    expect(parseProject.bind(null, future)).toThrow();
  });
});
