/**
 * Command factories for floor management.
 *
 * Like `commands.ts`, every factory is pure: it captures its arguments and
 * returns a domain `Command` whose `apply` mutates only the supplied immer
 * draft. Mutations are no-ops when the referenced floor is missing, so undo/redo
 * stays stable even if a document is loaded that never had the floor.
 *
 * Deleting a floor removes the floor AND every piece on it inside a SINGLE
 * command, so one undo restores both. `activeFloorId` is transient UI state and
 * is intentionally not touched here; the editor store reconciles it.
 */

import type { Command, Floor, Project } from '@/domain';

function findFloor(draft: Project, floorId: string): Floor | undefined {
  return draft.floors.find((floor) => floor.id === floorId);
}

/** Add a floor. Duplicate ids are ignored, keeping the command idempotent. */
export function createAddFloorCommand(floor: Floor): Command {
  const snapshot: Floor = { ...floor };
  return {
    type: 'floor.add',
    label: `Add floor "${snapshot.name}"`,
    apply(draft: Project): void {
      if (draft.floors.some((existing) => existing.id === snapshot.id)) {
        return;
      }
      draft.floors.push({ ...snapshot });
    },
  };
}

/**
 * Delete a floor together with every piece placed on it. Removing the last
 * remaining floor is rejected: a project always keeps at least one floor.
 */
export function createDeleteFloorCommand(floorId: string): Command {
  return {
    type: 'floor.delete',
    label: 'Delete floor',
    apply(draft: Project): void {
      if (draft.floors.length <= 1) {
        return;
      }
      if (findFloor(draft, floorId) === undefined) {
        return;
      }
      draft.floors = draft.floors.filter((floor) => floor.id !== floorId);
      draft.pieces = draft.pieces.filter((piece) => piece.floorId !== floorId);
    },
  };
}

/** Rename a floor. Unknown floors are ignored. */
export function createRenameFloorCommand(floorId: string, name: string): Command {
  return {
    type: 'floor.rename',
    label: `Rename floor to "${name}"`,
    apply(draft: Project): void {
      const floor = findFloor(draft, floorId);
      if (floor === undefined) {
        return;
      }
      floor.name = name;
    },
  };
}

/** Set a floor's elevation (its base height on Y). Unknown floors are ignored. */
export function createSetFloorElevationCommand(floorId: string, elevation: number): Command {
  return {
    type: 'floor.setElevation',
    label: `Set floor elevation to ${elevation}`,
    apply(draft: Project): void {
      const floor = findFloor(draft, floorId);
      if (floor === undefined) {
        return;
      }
      floor.elevation = elevation;
    },
  };
}

/** Toggle a floor's visibility. Unknown floors are ignored. */
export function createSetFloorVisibleCommand(floorId: string, visible: boolean): Command {
  return {
    type: 'floor.setVisible',
    label: visible ? 'Show floor' : 'Hide floor',
    apply(draft: Project): void {
      const floor = findFloor(draft, floorId);
      if (floor === undefined) {
        return;
      }
      floor.visible = visible;
    },
  };
}

/** Toggle a floor's locked state. Unknown floors are ignored. */
export function createSetFloorLockedCommand(floorId: string, locked: boolean): Command {
  return {
    type: 'floor.setLocked',
    label: locked ? 'Lock floor' : 'Unlock floor',
    apply(draft: Project): void {
      const floor = findFloor(draft, floorId);
      if (floor === undefined) {
        return;
      }
      floor.locked = locked;
    },
  };
}
