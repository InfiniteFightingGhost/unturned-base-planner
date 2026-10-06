/**
 * Public surface of the persistence layer (P40–P42).
 */

export {
  DB_NAME,
  DB_VERSION,
  PROJECT_STORE,
  getDb,
  resetPlannerDatabase,
} from './db';
export type { PlannerDb, PlannerDbSchema, StoredProjectRecord } from './db';

export {
  ProjectStorageError,
  deleteProject,
  getMostRecent,
  listProjects,
  loadProject,
  saveProject,
} from './repository';
export type { ProjectSummary } from './repository';

export { createAutosave } from './autosave';
export type {
  AutosaveController,
  AutosaveOptions,
  AutosaveScheduler,
  AutosaveStatus,
} from './autosave';

export { flushAutosave, useEditorAutosave } from './editor-autosave';
export type { AutosaveSnapshot } from './editor-autosave';

export {
  PROJECT_FILE_EXTENSION,
  PROJECT_FILE_FORMAT,
  ProjectImportError,
  defaultFileName,
  downloadTextFile,
  exportProjectFile,
  importProjectFile,
} from './project-file';
