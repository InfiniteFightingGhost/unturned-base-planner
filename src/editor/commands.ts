/**
 * Command factories for the editor document layer.
 *
 * Every factory is pure: it captures its arguments and returns a domain
 * `Command` whose `apply` mutates only the supplied immer draft. No factory
 * touches a store, the clock, or any module state, so identical inputs yield
 * identical commands and undo/redo patches.
 *
 * Rule of thumb: if it changes `project`, it must be expressed here and run
 * through `History.execute` inside the editor store.
 */

import type { BuildState, Command, PlacedPiece, Project } from '@/domain';

function collectIds(ids: readonly string[]): Set<string> {
  return new Set(ids);
}

/**
 * Add placed pieces to the document.
 *
 * Duplicate-id policy: a piece whose id already exists in the draft (or was
 * added earlier in the same batch) is **ignored**, keeping the existing
 * document entry. This preserves referential integrity (piece ids are unique by
 * contract) and makes the command idempotent, which keeps undo/redo stable if a
 * batch is re-applied. Callers that want to replace an existing piece must
 * delete it first.
 */
export function createAddPiecesCommand(pieces: readonly PlacedPiece[]): Command {
  const snapshot = pieces.slice();
  return {
    type: 'piece.add',
    label: `Add ${snapshot.length} piece${snapshot.length === 1 ? '' : 's'}`,
    apply(draft: Project): void {
      const existing = new Set(draft.pieces.map((piece) => piece.id));
      for (const piece of snapshot) {
        if (existing.has(piece.id)) {
          continue;
        }
        existing.add(piece.id);
        draft.pieces.push(piece);
      }
    },
  };
}

/** Remove placed pieces by id. Unknown ids are ignored. */
export function createDeletePiecesCommand(ids: readonly string[]): Command {
  const target = collectIds(ids);
  return {
    type: 'piece.delete',
    label: `Delete ${target.size} piece${target.size === 1 ? '' : 's'}`,
    apply(draft: Project): void {
      draft.pieces = draft.pieces.filter((piece) => !target.has(piece.id));
    },
  };
}

/**
 * Replace matching pieces with the result of `fn`.
 *
 * `fn` must be pure and must not mutate its argument; it receives the piece as
 * it currently appears in the draft and returns the next version (used by
 * move/rotate/mirror). Pieces whose id is not in `ids` are left untouched.
 */
export function createTransformPiecesCommand(
  ids: readonly string[],
  fn: (piece: PlacedPiece) => PlacedPiece,
): Command {
  const target = collectIds(ids);
  return {
    type: 'piece.transform',
    label: `Transform ${target.size} piece${target.size === 1 ? '' : 's'}`,
    apply(draft: Project): void {
      for (let index = 0; index < draft.pieces.length; index += 1) {
        const piece = draft.pieces[index];
        if (piece === undefined || !target.has(piece.id)) {
          continue;
        }
        draft.pieces[index] = fn(piece);
      }
    },
  };
}

/** Set the build progress (`planned` | `collected` | `built`) of pieces. */
export function createSetBuildStateCommand(
  ids: readonly string[],
  buildState: BuildState,
): Command {
  const target = collectIds(ids);
  return {
    type: 'piece.setBuildState',
    label: `Set build state: ${buildState}`,
    apply(draft: Project): void {
      for (const piece of draft.pieces) {
        if (target.has(piece.id)) {
          piece.buildState = buildState;
        }
      }
    },
  };
}

/** Assign (or clear, with `null`) the zone of pieces. */
export function createSetZoneCommand(ids: readonly string[], zoneId: string | null): Command {
  const target = collectIds(ids);
  return {
    type: 'piece.setZone',
    label: zoneId === null ? 'Clear zone' : 'Set zone',
    apply(draft: Project): void {
      for (const piece of draft.pieces) {
        if (target.has(piece.id)) {
          piece.zoneId = zoneId;
        }
      }
    },
  };
}

/** Replace the metadata tags of pieces. The provided order is preserved. */
export function createSetTagsCommand(ids: readonly string[], tags: readonly string[]): Command {
  const target = collectIds(ids);
  const nextTags = tags.slice();
  return {
    type: 'piece.setTags',
    label: `Set ${nextTags.length} tag${nextTags.length === 1 ? '' : 's'}`,
    apply(draft: Project): void {
      for (const piece of draft.pieces) {
        if (target.has(piece.id)) {
          piece.metadata.tags = [...nextTags];
        }
      }
    },
  };
}

/**
 * Combine several commands into one logical step that records a single history
 * entry. Commands are applied in order to the same draft, so a batch that adds
 * 50 pieces undoes in a single `undo()`.
 */
export function createBatchCommand(label: string, commands: readonly Command[]): Command {
  const snapshot = commands.slice();
  return {
    type: 'batch',
    label,
    apply(draft: Project): void {
      for (const command of snapshot) {
        command.apply(draft);
      }
    },
  };
}
