/**
 * Autosave controller (P40).
 *
 * `notify` only records the latest project and (re)arms a short debounce timer;
 * the actual write is then dispatched to an idle callback (with a `setTimeout`
 * fallback), so a burst of keystrokes or pointer moves never blocks the
 * renderer. A `maxWaitMs` ceiling forces a save when changes keep arriving.
 *
 * A serialized-document guard means a `notify` whose canonical JSON equals the
 * last persisted document is skipped entirely. `flush` cancels the pending
 * schedule and writes immediately (used on `visibilitychange`/`beforeunload`).
 */

import { serializeProject } from '@/domain';
import type { Project } from '@/domain';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutosaveScheduler {
  schedule(callback: () => void): number;
  cancel(handle: number): void;
}

export interface AutosaveOptions {
  /** Persist a project. Errors are captured in the status, not thrown to callers. */
  save: (project: Project) => Promise<void>;
  /** Debounce window after the last change. */
  delayMs?: number;
  /** Hard ceiling between the first pending change and a forced write. */
  maxWaitMs?: number;
  /** Overridable scheduling primitive (tests inject a synchronous queue). */
  scheduler?: AutosaveScheduler;
  /** Receives every status transition. */
  onStatus?: (status: AutosaveStatus, lastSavedAt: number | null, error: string | null) => void;
}

export interface AutosaveController {
  notify(project: Project): void;
  flush(): Promise<void>;
  dispose(): void;
}

const defaultScheduler: AutosaveScheduler = {
  schedule(callback) {
    if (typeof requestIdleCallback === 'function') {
      return requestIdleCallback(callback);
    }
    return window.setTimeout(callback, 0);
  },
  cancel(handle) {
    if (typeof cancelIdleCallback === 'function') {
      cancelIdleCallback(handle);
      return;
    }
    window.clearTimeout(handle);
  },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createAutosave(options: AutosaveOptions): AutosaveController {
  const delayMs = options.delayMs ?? 800;
  const maxWaitMs = options.maxWaitMs ?? 3000;
  const scheduler = options.scheduler ?? defaultScheduler;

  let disposed = false;
  let pending: Project | null = null;
  let lastNotified: Project | null = null;
  let lastSavedDocument: string | null = null;
  let lastSavedAt: number | null = null;
  let firstPendingAt: number | null = null;
  let debounceTimer: number | null = null;
  let idleHandle: number | null = null;
  let inFlight: Promise<void> | null = null;

  const report = (status: AutosaveStatus, error: string | null = null): void => {
    options.onStatus?.(status, lastSavedAt, error);
  };

  const clearScheduled = (): void => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (idleHandle !== null) {
      scheduler.cancel(idleHandle);
      idleHandle = null;
    }
  };

  const performSave = async (): Promise<void> => {
    const project = pending;
    if (project === null) {
      return;
    }
    pending = null;
    firstPendingAt = null;
    const document = serializeProject(project);
    if (document === lastSavedDocument) {
      return;
    }
    report('saving');
    inFlight = (async () => {
      try {
        await options.save(project);
        lastSavedDocument = document;
        lastSavedAt = Date.now();
        report('saved');
      } catch (error) {
        // Keep the work pending so a later notify/flush can retry.
        pending = project;
        firstPendingAt ??= Date.now();
        report('error', errorMessage(error));
      }
    })();
    await inFlight;
    inFlight = null;
  };

  const runIdle = (): void => {
    idleHandle = null;
    void performSave();
  };

  const onDebounce = (): void => {
    debounceTimer = null;
    if (disposed) {
      return;
    }
    idleHandle = scheduler.schedule(runIdle);
  };

  return {
    notify(project) {
      if (disposed || project === lastNotified) {
        return;
      }
      lastNotified = project;
      pending = project;
      const now = Date.now();
      if (firstPendingAt === null) {
        firstPendingAt = now;
      }
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }
      const remainingMaxWait = firstPendingAt + maxWaitMs - now;
      const wait = Math.max(0, Math.min(delayMs, remainingMaxWait));
      debounceTimer = window.setTimeout(onDebounce, wait);
    },

    async flush() {
      clearScheduled();
      if (inFlight !== null) {
        await inFlight;
      }
      if (pending !== null) {
        await performSave();
      }
    },

    dispose() {
      disposed = true;
      clearScheduled();
      pending = null;
      lastNotified = null;
      firstPendingAt = null;
    },
  };
}
