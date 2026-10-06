import type { Patch as ImmerPatch } from 'immer';
import type { Project } from './project';

/**
 * The frozen command contract.
 *
 * ALL document mutations MUST flow through this interface. Nothing in the
 * domain, editor, engine or UI layers may mutate a `Project` document directly:
 * a mutation is expressed as a `Command`, applied to an immer draft by
 * `History.execute`, and recorded as a patch pair for undo/redo.
 */

/** A single, named, undoable mutation of the project document. */
export interface Command {
  /** Machine-readable discriminator, e.g. `piece.add`. */
  readonly type: string;
  /** Human-readable label shown in the undo stack, e.g. `Add wall`. */
  readonly label: string;
  /**
   * Mutate the provided immer draft. The draft is a disposable proxy; the
   * caller receives a new immutable project once the command completes.
   */
  apply(draft: Project): void;
}

/** Re-exported immer patch type so consumers never import immer directly. */
export type Patch = ImmerPatch;

/** One reversible step in the history stack. */
export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inversePatches: Patch[];
}
