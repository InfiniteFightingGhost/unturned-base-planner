/**
 * IndexedDB connection for the local project store (P40).
 *
 * One database (`unturned-planner`, version 1) holds a single `projects`
 * object store keyed by project id, with a `updatedAt` index used to find the
 * most recent document without scanning everything. `getDb` memoizes the
 * connection promise; `resetPlannerDatabase` is a test seam that closes it and
 * drops the database.
 */

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

export const DB_NAME = 'unturned-planner';
export const DB_VERSION = 1;
export const PROJECT_STORE = 'projects';

/**
 * The persisted shape. `document` is the canonical `serializeProject` output;
 * `id` / `name` / `updatedAt` / `pieceCount` are replicated at the top level so
 * the project list can be rendered without parsing every full document.
 */
export interface StoredProjectRecord {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
  readonly pieceCount: number;
  readonly document: string;
}

export interface PlannerDbSchema extends DBSchema {
  projects: {
    key: string;
    value: StoredProjectRecord;
    indexes: { updatedAt: string };
  };
}

export type PlannerDb = IDBPDatabase<PlannerDbSchema>;

let dbPromise: Promise<PlannerDb> | null = null;

/** Open (once) and return the shared planner database connection. */
export function getDb(): Promise<PlannerDb> {
  if (dbPromise === null) {
    dbPromise = openDB<PlannerDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      },
    });
  }
  return dbPromise;
}

/**
 * Close the shared connection and delete the database. Intended for tests and
 * explicit "reset local data" flows; the next `getDb` call reopens cleanly.
 */
export async function resetPlannerDatabase(): Promise<void> {
  if (dbPromise !== null) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to delete database'));
    request.onblocked = () => resolve();
  });
}
