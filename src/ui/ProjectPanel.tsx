/**
 * Project panel (P40/P41): locally stored project list.
 *
 * Document lifecycle (New / Save / Export / Import) and the autosave read-out
 * live in the top bar; this inspector lists saved projects, lets the user load
 * or delete them, and exposes a "Save now" flush. All loads go through the
 * store's load-only path, so imported or migrated documents clear history
 * exactly like a fresh project.
 */

import { useCallback, useEffect, useState } from 'react';
import { selectProjectId, useEditorStore } from '@/editor';
import { deleteProject, listProjects, loadProject, useEditorAutosave } from '@/persistence';
import type { ProjectSummary } from '@/persistence';
import { Panel } from './Panel';

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function ProjectPanel() {
  const autosave = useEditorAutosave();
  const currentId = useEditorStore(selectProjectId);
  const replaceProject = useEditorStore((state) => state.replaceProject);
  const pieceCount = useEditorStore((state) => state.project.pieces.length);

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  const handle = useCallback(async (action: () => Promise<void>): Promise<void> => {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const onSaveNow = (): void =>
    void handle(async () => {
      await autosave.flush();
      await refresh();
    });

  const onLoad = (id: string): void =>
    void handle(async () => {
      replaceProject(await loadProject(id));
      await autosave.flush();
      await refresh();
    });

  const onDelete = (id: string): void =>
    void handle(async () => {
      await deleteProject(id);
      await refresh();
    });

  return (
    <Panel
      title="Projects"
      testId="project-panel"
      ariaLabel="Projects"
      className="project-panel"
      actions={
        <button type="button" className="button small" data-testid="save-now" onClick={onSaveNow}>
          Save now
        </button>
      }
    >
      {error !== null && (
        <p className="error-text" data-testid="project-error" role="alert">
          {error}
        </p>
      )}

      {projects.length === 0 ? (
        <p className="empty" data-testid="project-empty">
          No saved projects yet.
        </p>
      ) : (
        <ul className="list">
          {projects.map((project) => (
            <li
              key={project.id}
              className={project.id === currentId ? 'list-item active' : 'list-item static'}
              data-testid={`project-item-${project.id}`}
            >
              <div className="list-item-main">
                <span className="list-item-name">{project.name}</span>
                <span className="list-item-meta mono">
                  {project.pieceCount} {project.pieceCount === 1 ? 'piece' : 'pieces'}
                </span>
              </div>
              <span className="list-item-sub mono">{formatTimestamp(project.updatedAt)}</span>
              <div className="list-item-controls">
                <button
                  type="button"
                  className="button small"
                  data-testid={`project-load-${project.id}`}
                  onClick={() => onLoad(project.id)}
                >
                  Load
                </button>
                <button
                  type="button"
                  className="button small danger"
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

      <p className="list-item-sub mono" data-testid="project-current">
        {pieceCount} {pieceCount === 1 ? 'piece' : 'pieces'} in the open project
      </p>
    </Panel>
  );
}
