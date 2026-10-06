import { describe, expect, it } from 'vitest';
import {
  PrefabSchema,
  createEmptyProject,
  parseProject,
  safeParseProject,
  serializeProject,
} from '@/domain';

const ISO = '2024-01-01T00:00:00.000Z';

function makePrefab() {
  return PrefabSchema.parse({
    id: 'pf1',
    name: 'Wall',
    createdAt: ISO,
    origin: [0, 0, 0],
    pieces: [
      {
        definitionId: 'wall_wood',
        position: [1, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        buildState: 'planned',
        metadata: { tags: [] },
      },
    ],
  });
}

describe('prefab schema', () => {
  it('applies defaults to a minimal prefab piece', () => {
    const prefab = PrefabSchema.parse({
      id: 'pf1',
      name: 'Wall',
      createdAt: ISO,
      origin: [0, 0, 0],
      pieces: [{ definitionId: 'wall_wood', position: [0, 0, 0], rotation: [0, 0, 0] }],
    });

    expect(prefab.pieces[0]?.scale).toEqual([1, 1, 1]);
    expect(prefab.pieces[0]?.buildState).toBe('planned');
    expect(prefab.pieces[0]?.metadata).toEqual({ tags: [] });
  });

  it('migrates a v1 project to v2 with an empty prefab library', () => {
    const v1 = {
      schemaVersion: 1,
      metadata: { id: 'p1', name: 'Base', createdAt: ISO, updatedAt: ISO },
      settings: {},
      floors: [],
      zones: [],
      pieces: [],
      measurements: [],
      annotations: [],
    };

    const migrated = parseProject(v1);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.prefabs).toEqual([]);
  });

  it('round-trips a v2 project containing a prefab through serialize/parse', () => {
    const base = createEmptyProject('Base', { id: 'p1', now: ISO });
    const withPrefab = { ...base, prefabs: [makePrefab()] };

    const roundTripped = parseProject(serializeProject(withPrefab));

    expect(roundTripped).toEqual(withPrefab);
  });

  it('rejects a project containing an invalid prefab piece', () => {
    const base = createEmptyProject('Base', { id: 'p1', now: ISO });
    const invalid = {
      ...base,
      prefabs: [
        {
          id: 'pf1',
          name: 'Broken',
          createdAt: ISO,
          origin: [0, 0, 0],
          pieces: [{ position: [0, 0, 0] }],
        },
      ],
    };

    expect(safeParseProject(invalid).success).toBe(false);
  });

  it('rejects a project with a schema version newer than the current one', () => {
    const future = { schemaVersion: 999, metadata: {}, settings: {} };
    expect(safeParseProject(future).success).toBe(false);
    expect(parseProject.bind(null, future)).toThrow();
  });
});
