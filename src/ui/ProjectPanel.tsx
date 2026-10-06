/**
 * Project panel (P40/P41): local project management and file I/O.
 *
 * New / Save now / Export / Import live here, alongside the locally stored
 * project list (load, delete) and the autosave status indicator. All loads go
 * through the store's load-only path, so imported or migrated documents clear
 * history exactly like a fresh project.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { editorStore, selectProjectId, useEditorStore } from '@/editor';
import {
  defaultFileName,
  downloadTextFile,
  exportProjectFile,
  flushAutosave,
  listProjects,
  loadProject,
  deleteProject,
  useEditorAutosave,
} from '@/persistence';
import type { ProjectSummary } from '@/persistence';

function formatClock(at: number | null): string {
  if (at === null) {
    return '';
  }
  return new Date(at).toLocaleTimeString();
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function ProjectPanel() {
  const autosave = useEditorAutosave();
  const currentId = useEditorStore(selectProjectId);
  const newProject = useEditorStore((state) => state.newProject);
  const loadProjectFromJson = useEditorStore((state) => state.loadProjectFromJson);
  const replaceProject = useEditorStore((state) => state.replaceProject);
  const pieceCount = useEditorStore((state) => state.project.pieces.length);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setProjects(await listProjects());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Autosave writes in the background; refresh the list once a write lands.
  useEffect(() => {
    if (autosave.status === 'saved') {
      void refresh();
    }
  }, [autosave.status, autosave.lastSavedAt, refresh]);

  useEffect(() => {
    const onFocus = (): void => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const handle = useCallback(
    async (action: () => Promise<void>): Promise<void> => {
      setError(null);
      try {
        await action();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [],
  );

  const onNew = (): void =>
    void handle(async () => {
      newProject('Untitled');
      await flushAutosave();
      await refresh();
    });

  const onSaveNow = (): void =>
    void handle(async () => {
      await autosave.flush();
      await refresh();
    });

  const onExport = (): void =>
    void handle(async () => {
      const project = editorStore.getState().project;
      downloadTextFile(defaultFileName(project), exportProjectFile(project));
    });

  const onImportChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) {
      return;
    }
    void handle(async () => {
      const text = await file.text();
      loadProjectFromJson(text);
      await flushAutosave();
      await refresh();
    });
  };

  const onLoad = (id: string): void =>
    void handle(async () => {
      replaceProject(await loadProject(id));
      await flushAutosave();
      await refresh();
    });

  const onDelete = (id: string): void =>
    void handle(async () => {
      await deleteProject(id);
      await refresh();
    });

  return (
    <aside className="panel project-panel" data-testid="project-panel" aria-label="Projects">
      <div className="panel-header">
        <h2>Projects</h2>
      </div>

      <div className="project-actions">
        <button
          type="button"
          className="tool-button"
          data-testid="new-project"
          onClick={onNew}
        >
          New
        </button>
        <button
          type="button"
          className="tool-button"
          data-testid="save-now"
          onClick={onSaveNow}
        >
          Save now
        </button>
        <button
          type="button"
          className="tool-button"
          data-testid="export-project"
          onClick={onExport}
        >
          Export
        </button>
        <button
          type="button"
          className="tool-button"
          data-testid="import-project"
          onClick={() => fileInputRef.current?.click()}
        >
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.ubp.json,application/json"
          data-testid="import-input"
          className="project-file-input"
          onChange={onImportChange}
        />
      </div>

      <p className="autosave-status" data-testid="autosave-status" aria-live="polite">
        {autosave.status === 'saving'
          ? 'Saving…'
          : autosave.status === 'saved'
            ? `Saved ${formatClock(autosave.lastSavedAt)}`
            : autosave.status === 'error'
              ? `Save error: ${autosave.error ?? 'unknown'}`
              : 'Autosave idle'}
      </p>

      {error !== null && (
        <p className="project-error" data-testid="project-error" role="alert">
          {error}
        </p>
      )}

      {projects.length === 0 ? (
        <p className="panel-placeholder" data-testid="project-empty">
          No saved projects yet.
        </p>
      ) : (
        <ul className="project-list">
          {projects.map((project) => (
            <li
              key={project.id}
              className={project.id === currentId ? 'project-item active' : 'project-item'}
              data-testid={`project-item-${project.id}`}
            >
              <div className="project-item-main">
                <span className="project-item-name">{project.name}</span>
                <span className="project-item-count">
                  {project.pieceCount} {project.pieceCount === 1 ? 'piece' : 'pieces'}
                </span>
              </div>
              <span className="project-item-time">{formatTimestamp(project.updatedAt)}</span>
              <div className="project-item-controls">
                <button
                  type="button"
                  className="prefab-action"
                  data-testid={`project-load-${project.id}`}
                  onClick={() => onLoad(project.id)}
                >
                  Load
                </button>
                <button
                  type="button"
                  className="prefab-action"
                  data-testid={`project-delete-${project.id}`}
                  onClick={() => onDelete(project.id)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="project-current" data-testid="project-current">
        {pieceCount} {pieceCount === 1 ? 'piece' : 'pieces'} in the open project
      </p>
    </aside>
  );
}
