/**
 * TopBar: application chrome.
 *
 * Row 1 carries identity and document lifecycle (inline-editable project name,
 * New / Save / Export / Import, autosave read-out). Row 2 is a flat, grouped
 * command bar (Edit / Build / View / Layout) that replaces the old sprawling
 * horizontal toolbar. All document mutations still flow through the editor
 * store's command path, so undo/redo keeps working.
 */

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { CameraMode } from '@/engine';
import type { Project } from '@/domain';
import {
  editorStore,
  selectCanRedo,
  selectCanUndo,
  selectProjectName,
  useEditorStore,
} from '@/editor';
import { useEngineStore } from '@/engine';
import {
  defaultFileName,
  downloadTextFile,
  exportProjectFile,
  flushAutosave,
  useEditorAutosave,
} from '@/persistence';
import {
  IconBuilt,
  IconDuplicate,
  IconExport,
  IconImport,
  IconNew,
  IconPlanned,
  IconRedo,
  IconSave,
  IconTrash,
  IconUndo,
} from './icons';

const CAMERA_VIEWS: ReadonlyArray<{ mode: CameraMode; label: string }> = [
  { mode: 'ORBIT', label: 'Persp' },
  { mode: 'TOP_DOWN', label: 'Top' },
  { mode: 'FRONT', label: 'Front' },
];

function formatClock(at: number | null): string {
  if (at === null) {
    return '';
  }
  return new Date(at).toLocaleTimeString();
}

export interface TopBarProps {
  readonly leftOpen: boolean;
  readonly rightOpen: boolean;
  readonly onToggleLeft: () => void;
  readonly onToggleRight: () => void;
}

export function TopBar({ leftOpen, rightOpen, onToggleLeft, onToggleRight }: TopBarProps) {
  const autosave = useEditorAutosave();
  const projectName = useEditorStore(selectProjectName);
  const newProject = useEditorStore((state) => state.newProject);
  const loadProjectFromJson = useEditorStore((state) => state.loadProjectFromJson);
  const executeCommand = useEditorStore((state) => state.executeCommand);
  const canUndo = useEditorStore(selectCanUndo);
  const canRedo = useEditorStore(selectCanRedo);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const duplicateSelected = useEditorStore((state) => state.duplicateSelected);
  const deleteSelected = useEditorStore((state) => state.deleteSelected);
  const selectionCount = useEditorStore((state) => state.selection.length);
  const setSelectedBuildState = useEditorStore((state) => state.setSelectedBuildState);
  const cameraMode = useEngineStore((state) => state.cameraMode);
  const setCameraMode = useEngineStore((state) => state.setCameraMode);

  const [nameDraft, setNameDraft] = useState(projectName);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNameDraft(projectName);
  }, [projectName]);

  const commitName = (): void => {
    const trimmed = nameDraft.trim();
    if (trimmed === '' || trimmed === projectName) {
      setNameDraft(projectName);
      return;
    }
    executeCommand({
      type: 'project.rename',
      label: 'Rename project',
      apply(draft: Project): void {
        draft.metadata.name = trimmed;
      },
    });
  };

  const onNew = (): void => {
    newProject('Untitled');
    void flushAutosave();
  };

  const onSave = (): void => {
    void flushAutosave();
  };

  const onExport = (): void => {
    const project = editorStore.getState().project;
    downloadTextFile(defaultFileName(project), exportProjectFile(project));
  };

  const onImportChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) {
      return;
    }
    void (async () => {
      const text = await file.text();
      loadProjectFromJson(text);
      await flushAutosave();
    })();
  };

  const autosaveLabel =
    autosave.status === 'saving'
      ? 'Saving…'
      : autosave.status === 'saved'
        ? `Saved ${formatClock(autosave.lastSavedAt)}`
        : autosave.status === 'error'
          ? `Save error: ${autosave.error ?? 'unknown'}`
          : 'Autosave idle';

  return (
    <header className="top-bar">
      <div className="top-bar-main">
        <h1 className="brand">
          <span className="brand-mark">▣</span> Unturned Base Planner
        </h1>
        <span className="top-sep" aria-hidden="true" />
        <label className="project-name">
          <span className="sr-only">Project name</span>
          <input
            className="input project-name-input"
            value={nameDraft}
            aria-label="Project name"
            spellCheck={false}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
          />
        </label>

        <div className="top-actions">
          <button type="button" className="button" data-testid="new-project" onClick={onNew}>
            <IconNew />
            New
          </button>
          <button type="button" className="button" data-testid="save-project" onClick={onSave}>
            <IconSave />
            Save
          </button>
          <button type="button" className="button" data-testid="export-project" onClick={onExport}>
            <IconExport />
            Export
          </button>
          <button
            type="button"
            className="button"
            data-testid="import-project"
            onClick={() => fileInputRef.current?.click()}
          >
            <IconImport />
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.ubp.json,application/json"
            data-testid="import-input"
            className="visually-hidden-input"
            onChange={onImportChange}
          />
        </div>

        <span className="autosave-chip" data-testid="autosave-status" aria-live="polite">
          <span className={`dot dot-${autosave.status}`} aria-hidden="true" />
          {autosaveLabel}
        </span>
      </div>

      <div className="command-bar">
        <div className="command-group" role="group" aria-label="History">
          <span className="command-label">Edit</span>
          <button
            type="button"
            className="icon-button"
            data-testid="undo"
            aria-label="Undo"
            title="Undo"
            disabled={!canUndo}
            onClick={() => undo()}
          >
            <IconUndo />
          </button>
          <button
            type="button"
            className="icon-button"
            data-testid="redo"
            aria-label="Redo"
            title="Redo"
            disabled={!canRedo}
            onClick={() => redo()}
          >
            <IconRedo />
          </button>
          <button
            type="button"
            className="icon-button"
            data-testid="duplicate"
            aria-label="Duplicate selection"
            title="Duplicate selection"
            disabled={selectionCount === 0}
            onClick={() => duplicateSelected([1, 0, 0])}
          >
            <IconDuplicate />
          </button>
          <button
            type="button"
            className="icon-button danger"
            data-testid="delete"
            aria-label="Delete selection"
            title="Delete selection"
            disabled={selectionCount === 0}
            onClick={() => deleteSelected()}
          >
            <IconTrash />
          </button>
        </div>

        <span className="command-divider" aria-hidden="true" />

        <div className="command-group" role="group" aria-label="Build state">
          <span className="command-label">Build</span>
          <button
            type="button"
            className="button"
            data-testid="mark-built"
            disabled={selectionCount === 0}
            onClick={() => setSelectedBuildState('built')}
          >
            <IconBuilt />
            Mark built
          </button>
          <button
            type="button"
            className="button"
            data-testid="mark-planned"
            disabled={selectionCount === 0}
            onClick={() => setSelectedBuildState('planned')}
          >
            <IconPlanned />
            Mark planned
          </button>
        </div>

        <span className="command-divider" aria-hidden="true" />

        <div className="command-group" role="group" aria-label="Camera">
          <span className="command-label">View</span>
          {CAMERA_VIEWS.map((view) => (
            <button
              key={view.mode}
              type="button"
              className={cameraMode === view.mode ? 'button active' : 'button'}
              data-testid={`view-${view.mode.toLowerCase()}`}
              onClick={() => setCameraMode(view.mode)}
            >
              {view.label}
            </button>
          ))}
        </div>

        <span className="command-spacer" />

        <div className="command-group" role="group" aria-label="Layout">
          <span className="command-label">Panels</span>
          <button
            type="button"
            className={leftOpen ? 'button active' : 'button'}
            data-testid="toggle-left-dock"
            aria-pressed={leftOpen}
            onClick={onToggleLeft}
          >
            Library
          </button>
          <button
            type="button"
            className={rightOpen ? 'button active' : 'button'}
            data-testid="toggle-right-dock"
            aria-pressed={rightOpen}
            onClick={onToggleRight}
          >
            Inspector
          </button>
        </div>
      </div>
    </header>
  );
}
