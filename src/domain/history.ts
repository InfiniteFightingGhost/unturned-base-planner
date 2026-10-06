import { applyPatches, enablePatches, produceWithPatches } from 'immer';
import type { Command, HistoryEntry } from './commands';
import type { Project } from './project';

// Immer's patch plugin must be enabled before any produce/apply call.
enablePatches();

/**
 * Command-based undo/redo.
 *
 * Every document change goes through `execute`, which records an immer patch
 * pair. Undo and redo simply apply the inverse/forward patches to the current
 * immutable snapshot, so a single `History` can undo a batch that touched many
 * pieces as one step. There is no path to mutate the document that bypasses
 * this class.
 */
export class History {
  private readonly maxDepth: number;
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];
  private current: Project | null = null;

  constructor(maxDepth = 500) {
    if (!Number.isInteger(maxDepth) || maxDepth <= 0) {
      throw new Error(`History maxDepth must be a positive integer, received ${String(maxDepth)}`);
    }
    this.maxDepth = maxDepth;
  }

  /** Number of undoable steps currently retained. */
  get depth(): number {
    return this.undoStack.length;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Apply a command, record its patches, and return the new project. */
  execute(project: Project, command: Command): Project {
    const [next, patches, inversePatches] = produceWithPatches(project, (draft) => {
      command.apply(draft);
    });

    if (patches.length > 0) {
      this.undoStack.push({
        label: command.label,
        patches,
        inversePatches,
      });
      if (this.undoStack.length > this.maxDepth) {
        this.undoStack.shift();
      }
      this.redoStack.length = 0;
    }

    this.current = next;
    return next;
  }

  /** Revert the most recent step. Throws when there is nothing to undo. */
  undo(): Project {
    const entry = this.undoStack.pop();
    if (entry === undefined) {
      throw new Error('Cannot undo: history is empty');
    }
    const base = this.current;
    if (base === null) {
      throw new Error('Cannot undo: history has no current project');
    }
    const previous = applyPatches(base, entry.inversePatches);
    this.redoStack.push(entry);
    this.current = previous;
    return previous;
  }

  /** Re-apply the most recently undone step. Throws when there is nothing to redo. */
  redo(): Project {
    const entry = this.redoStack.pop();
    if (entry === undefined) {
      throw new Error('Cannot redo: history is empty');
    }
    const base = this.current;
    if (base === null) {
      throw new Error('Cannot redo: history has no current project');
    }
    const next = applyPatches(base, entry.patches);
    this.undoStack.push(entry);
    this.current = next;
    return next;
  }

  /** Drop all undo/redo entries. The current snapshot is retained. */
  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
