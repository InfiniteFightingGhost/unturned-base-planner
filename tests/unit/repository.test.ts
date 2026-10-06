import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, createEmptyProject } from '@/domain';
import { PROJECT_STORE, getDb, resetPlannerDatabase } from '@/persistence/db';
import {
  ProjectStorageError,
  deleteProject,
  getMostRecent,
  listProjects,
  loadProject,
  saveProject,
} from '@/persistence/repository';

const ISO_EARLY = '2024-01-01T00:00:00.000Z';
const ISO_LATE = '2024-06-01T00:00:00.000Z';

beforeEach(async () => {
  await resetPlannerDatabase();
});

describe('project repository', () => {
  it('saves, loads, lists and deletes a project', async () => {
    const project = createEmptyProject('Base One', { id: 'base-1', now: ISO_EARLY });
    await saveProject(project);

    expect(await loadProject('base-1')).toEqual(project);

    const list = await listProjects();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      id: 'base-1',
      name: 'Base One',
      updatedAt: ISO_EARLY,
      pieceCount: 0,
    });

    await deleteProject('base-1');
    expect(await listProjects()).toEqual([]);
    await expect(loadProject('base-1')).rejects.toBeInstanceOf(ProjectStorageError);
  });

  it('getMostRecent returns the latest updated project', async () => {
    await saveProject(createEmptyProject('Older', { id: 'older', now: ISO_EARLY }));
    await saveProject(createEmptyProject('Newer', { id: 'newer', now: ISO_LATE }));

    const recent = await getMostRecent();
    expect(recent?.metadata.id).toBe('newer');
  });

  it('returns null from getMostRecent when nothing is stored', async () => {
    expect(await getMostRecent()).toBeNull();
  });

  it('surfaces an error when stored data is corrupt', async () => {
    const db = await getDb();
    await db.put(PROJECT_STORE, {
      id: 'broken',
      name: 'Broken',
      updatedAt: ISO_EARLY,
      pieceCount: 0,
      document: '{ definitely not json',
    });

    await expect(loadProject('broken')).rejects.toBeInstanceOf(ProjectStorageError);
  });

  it('migrates an old stored schemaVersion on load', async () => {
    const db = await getDb();
    await db.put(PROJECT_STORE, {
      id: 'legacy',
      name: 'Legacy',
      updatedAt: ISO_EARLY,
      pieceCount: 0,
      document: JSON.stringify({
        schemaVersion: 1,
        metadata: { id: 'legacy', name: 'Legacy', createdAt: ISO_EARLY, updatedAt: ISO_EARLY },
        settings: {},
        floors: [{ id: 'f1', name: 'Ground', index: 0, elevation: 0, visible: true, locked: false }],
        zones: [],
        pieces: [],
        measurements: [],
        annotations: [],
      }),
    });

    const loaded = await loadProject('legacy');
    expect(loaded.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(loaded.prefabs).toEqual([]);
    expect(loaded.inventory).toEqual([]);
  });
});
