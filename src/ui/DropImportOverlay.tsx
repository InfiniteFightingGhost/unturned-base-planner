/**
 * Full-window drag-and-drop import (P41).
 *
 * Listens at the window level so a project file can be dropped anywhere. The
 * dropped text is parsed and migrated by the store's load-only path, then
 * autosave is flushed so the imported document is persisted immediately.
 */

import { useEffect, useState } from 'react';
import { editorStore } from '@/editor';
import { flushAutosave } from '@/persistence';

function looksLikeProjectFile(name: string): boolean {
  return name.toLowerCase().endsWith('.json');
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false;
}

export function DropImportOverlay() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onDragOver = (event: DragEvent): void => {
      if (!hasFiles(event)) {
        return;
      }
      event.preventDefault();
      setActive(true);
      setError(null);
    };
    const onDragLeave = (event: DragEvent): void => {
      if (event.relatedTarget === null) {
        setActive(false);
      }
    };
    const onDrop = (event: DragEvent): void => {
      event.preventDefault();
      setActive(false);
      const file = event.dataTransfer?.files[0];
      if (file === undefined || !looksLikeProjectFile(file.name)) {
        setError('Drop a .json or .ubp.json project file.');
        return;
      }
      void (async () => {
        try {
          const text = await file.text();
          editorStore.getState().loadProjectFromJson(text);
          await flushAutosave();
          setError(null);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })();
    };

    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  if (!active && error === null) {
    return null;
  }

  return (
    <div
      className={active ? 'drop-overlay' : 'drop-overlay drop-overlay-error'}
      data-testid="drop-overlay"
    >
      <div className="drop-overlay-card">
        {error === null ? (
          <p>Drop a project file to import it.</p>
        ) : (
          <p data-testid="drop-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
