import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '@/domain';
import type { Project } from '@/domain';
import { createAutosave } from '@/persistence/autosave';

const ISO = '2024-01-01T00:00:00.000Z';

function renamed(base: Project, name: string): Project {
  return { ...base, metadata: { ...base.metadata, name } };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestIdleCallback', undefined);
  vi.stubGlobal('cancelIdleCallback', undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createAutosave', () => {
  it('coalesces rapid notifications into a single save of the latest project', async () => {
    const base = createEmptyProject('A', { id: 'p1', now: ISO });
    const latest = renamed(base, 'C');
    const saved: Project[] = [];
    const autosave = createAutosave({
      save: async (project) => {
        saved.push(project);
      },
      delayMs: 100,
      maxWaitMs: 1000,
    });

    autosave.notify(base);
    autosave.notify(renamed(base, 'B'));
    autosave.notify(latest);
    await vi.runAllTimersAsync();

    expect(saved).toHaveLength(1);
    expect(saved[0]).toBe(latest);
    autosave.dispose();
  });

  it('flush writes immediately without waiting for the debounce', async () => {
    const project = createEmptyProject('Immediate', { id: 'p1', now: ISO });
    const saved: Project[] = [];
    const autosave = createAutosave({
      save: async (value) => {
        saved.push(value);
      },
      delayMs: 10_000,
    });

    autosave.notify(project);
    await autosave.flush();

    expect(saved).toEqual([project]);
    autosave.dispose();
  });

  it('skips saving when the serialized document is unchanged', async () => {
    const project = createEmptyProject('Same', { id: 'p1', now: ISO });
    const saved: Project[] = [];
    const autosave = createAutosave({
      save: async (value) => {
        saved.push(value);
      },
      delayMs: 50,
    });

    autosave.notify(project);
    await autosave.flush();
    // A distinct reference with identical content must not trigger a write.
    autosave.notify({ ...project });
    await vi.runAllTimersAsync();

    expect(saved).toHaveLength(1);
    autosave.dispose();
  });

  it('dispose cancels pending scheduled work', async () => {
    const project = createEmptyProject('Cancel', { id: 'p1', now: ISO });
    const saved: Project[] = [];
    const autosave = createAutosave({
      save: async (value) => {
        saved.push(value);
      },
      delayMs: 50,
    });

    autosave.notify(project);
    autosave.dispose();
    await vi.runAllTimersAsync();

    expect(saved).toHaveLength(0);
  });

  it('reports saving then saved status', async () => {
    const project = createEmptyProject('Status', { id: 'p1', now: ISO });
    const statuses: string[] = [];
    const autosave = createAutosave({
      save: async () => undefined,
      onStatus: (status) => {
        statuses.push(status);
      },
    });

    autosave.notify(project);
    await autosave.flush();

    expect(statuses).toEqual(['saving', 'saved']);
    autosave.dispose();
  });

  it('reports an error and keeps the change pending when a save fails', async () => {
    const project = createEmptyProject('Failing', { id: 'p1', now: ISO });
    const statuses: string[] = [];
    const errors: Array<string | null> = [];
    const autosave = createAutosave({
      save: async () => {
        throw new Error('disk on fire');
      },
      onStatus: (status, _at, error) => {
        statuses.push(status);
        errors.push(error);
      },
    });

    autosave.notify(project);
    await autosave.flush();

    expect(statuses).toEqual(['saving', 'error']);
    expect(errors).toEqual([null, 'disk on fire']);
    autosave.dispose();
  });
});
