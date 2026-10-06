/**
 * Project repository (P40): the only place that reads/writes full documents.
 *
 * Every load routes through `parseProject`, which migrates old schema versions
 * and validates the result, so stored documents from any supported version come
 * back as current-version `Project`s. Corrupt or missing documents reject with
 * a clear `ProjectStorageError`.
 */

import { parseProject, serializeProject } from '@/domain';
import type { Project } from '@/domain';
import { PROJECT_STORE, getDb } from './db';
import type { StoredProjectRecord } from './db';

/** Lightweight list row — enough to render the project picker. */
export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
  readonly pieceCount: number;
}

/** Raised when a stored project cannot be found or cannot be parsed. */
export class ProjectStorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProjectStorageError';
  }
}

function toRecord(project: Project): StoredProjectRecord {
  return {
    id: project.metadata.id,
    name: project.metadata.name,
    updatedAt: project.metadata.updatedAt,
    pieceCount: project.pieces.length,
    document: serializeProject(project),
  };
}

function toSummary(record: StoredProjectRecord): ProjectSummary {
  return {
    id: record.id,
    name: record.name,
    updatedAt: record.updatedAt,
    pieceCount: record.pieceCount,
  };
}

/** All stored projects as summaries, newest `updatedAt` first. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await getDb();
  const records = await db.getAll(PROJECT_STORE);
  return records
    .map(toSummary)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Load and migrate a project by id. Rejects when the id is unknown or the
 * stored JSON is corrupt.
 */
export async function loadProject(id: string): Promise<Project> {
  const db = await getDb();
  let record: StoredProjectRecord | undefined;
  try {
    record = await db.get(PROJECT_STORE, id);
  } catch (error) {
    throw new ProjectStorageError(`Failed to read stored project "${id}"`, { cause: error });
  }
  if (record === undefined) {
    throw new ProjectStorageError(`Project "${id}" was not found in local storage`);
  }
  try {
    return parseProject(record.document);
  } catch (error) {
    throw new ProjectStorageError(`Stored project "${id}" is corrupt and could not be loaded`, {
      cause: error,
    });
  }
}

/** Persist a project as canonical JSON plus denormalized summary fields. */
export async function saveProject(project: Project): Promise<void> {
  const db = await getDb();
  await db.put(PROJECT_STORE, toRecord(project));
}

/** Remove a project. Missing ids are a no-op. */
export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(PROJECT_STORE, id);
}

/**
 * The project with the greatest `updatedAt`, or `null` when the store is empty.
 * Loads through the same migration/validation path as `loadProject`.
 */
export async function getMostRecent(): Promise<Project | null> {
  const db = await getDb();
  const index = db.transaction(PROJECT_STORE).store.index('updatedAt');
  const cursor = await index.openCursor(undefined, 'prev');
  if (cursor === null) {
    return null;
  }
  const record = cursor.value;
  try {
    return parseProject(record.document);
  } catch (error) {
    throw new ProjectStorageError(`Stored project "${record.id}" is corrupt and could not be loaded`, {
      cause: error,
    });
  }
}
