/**
 * Command factories for the prefab library (P21).
 *
 * Like every other command factory these are pure: they capture their arguments
 * and mutate only the supplied immer draft. Saving and deleting a prefab and
 * instantiating its pieces are each a SINGLE history entry, so one undo fully
 * reverses the operation.
 *
 * Prefabs are stored deep-cloned so a captured snapshot can never alias a live
 * document object (immer freezes draft entries) or the caller's prefab.
 */

import type { Command, PlacedPiece, Prefab, Project } from '@/domain';
import { createAddPiecesCommand } from './commands';
import { clonePrefab } from './prefab';

/** Add a prefab to the library. Duplicate ids are ignored (idempotent). */
export function createSavePrefabCommand(prefab: Prefab): Command {
  const snapshot = clonePrefab(prefab);
  return {
    type: 'prefab.save',
    label: `Save prefab "${snapshot.name}"`,
    apply(draft: Project): void {
      if (draft.prefabs.some((existing) => existing.id === snapshot.id)) {
        return;
      }
      draft.prefabs.push(clonePrefab(snapshot));
    },
  };
}

/** Remove a prefab from the library by id. Unknown ids are ignored. */
export function createDeletePrefabCommand(prefabId: string): Command {
  return {
    type: 'prefab.delete',
    label: 'Delete prefab',
    apply(draft: Project): void {
      draft.prefabs = draft.prefabs.filter((prefab) => prefab.id !== prefabId);
    },
  };
}

/**
 * Add every instantiated/prefab piece to the document in ONE command, so a
 * stamp of a 100-piece prefab undoes in a single step. Reuses the documented
 * duplicate-id policy of `createAddPiecesCommand`.
 */
export function createInstantiatePrefabCommand(pieces: readonly PlacedPiece[]): Command {
  const base = createAddPiecesCommand(pieces);
  return {
    type: base.type,
    label: `Instantiate prefab (${pieces.length})`,
    apply: base.apply,
  };
}
