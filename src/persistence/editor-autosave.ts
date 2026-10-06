/**
 * Editor ⇄ autosave wiring (P40).
 *
 * Starts a single autosave controller bound to the default editor store,
 * subscribes to `project` reference changes (transient subscription, never a
 * React render loop), flushes on `visibilitychange`/`beforeunload`, and exposes
 * the status snapshot for the UI via `useEditorAutosave`.
 *
 * The controller also restores the most recently updated project on first
 * start. That path goes through `getMostRecent` → `parseProject`, so a stored
 * old-version document is migrated before it reaches the editor (P42).
 */

import { useEffect, useSyncExternalStore } from 'react';
import type { Project } from '@/domain';
import { editorStore } from '@/editor';
import type { EditorStore } from '@/editor';
import { createAutosave } from './autosave';
import type { AutosaveController, AutosaveStatus } from './autosave';
import { getMostRecent, saveProject } from './repository';

export interface AutosaveSnapshot {
  readonly status: AutosaveStatus;
  readonly lastSavedAt: number | null;
  readonly error: string | null;
}

const IDLE_SNAPSHOT: AutosaveSnapshot = { status: 'idle', lastSavedAt: null, error: null };

let snapshot: AutosaveSnapshot = IDLE_SNAPSHOT;
const listeners = new Set<() => void>();

function setSnapshot(next: AutosaveSnapshot): void {
  snapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AutosaveSnapshot {
  return snapshot;
}

let controller: AutosaveController | null = null;
let unsubscribeStore: (() => void) | null = null;
let removeWindowListeners: (() => void) | null = null;
let refCount = 0;
let lastObservedProject: Project | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function restoreMostRecent(store: EditorStore): Promise<void> {
  try {
    const recent = await getMostRecent();
    if (recent === null) {
      return;
    }
    if (store.getState().project.metadata.id === recent.metadata.id) {
      return;
    }
    store.getState().replaceProject(recent);
  } catch (error) {
    setSnapshot({ status: 'error', lastSavedAt: snapshot.lastSavedAt, error: errorMessage(error) });
  }
}

function start(store: EditorStore): void {
  if (controller !== null) {
    return;
  }
  controller = createAutosave({
    save: saveProject,
    onStatus: (status, lastSavedAt, error) => setSnapshot({ status, lastSavedAt, error }),
  });

  lastObservedProject = store.getState().project;
  unsubscribeStore = store.subscribe((state) => {
    if (state.project !== lastObservedProject) {
      lastObservedProject = state.project;
      controller?.notify(state.project);
    }
  });

  const handleVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      void controller?.flush();
    }
  };
  const handleBeforeUnload = (): void => {
    void controller?.flush();
  };
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('beforeunload', handleBeforeUnload);
  removeWindowListeners = () => {
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };

  void restoreMostRecent(store);
}

function stop(): void {
  unsubscribeStore?.();
  unsubscribeStore = null;
  removeWindowListeners?.();
  removeWindowListeners = null;
  controller?.dispose();
  controller = null;
  lastObservedProject = null;
  setSnapshot(IDLE_SNAPSHOT);
}

/**
 * Subscribe the app to autosave. Call once from the editor shell; the
 * controller lives for as long as at least one consumer is mounted.
 */
export function useEditorAutosave(
  store: EditorStore = editorStore,
): AutosaveSnapshot & { flush: () => Promise<void> } {
  useEffect(() => {
    refCount += 1;
    start(store);
    return () => {
      refCount -= 1;
      if (refCount <= 0) {
        refCount = 0;
        stop();
      }
    };
  }, [store]);

  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...current, flush: flushAutosave };
}

/** Write any pending autosave immediately ("Save now" / top-level save). */
export async function flushAutosave(): Promise<void> {
  if (controller !== null) {
    await controller.flush();
    return;
  }
  await saveProject(editorStore.getState().project);
}
