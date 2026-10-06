/**
 * Command factories for zone management.
 *
 * Like `commands.ts` and `floor-commands.ts`, every factory is pure: it
 * captures its arguments and returns a domain `Command` whose `apply` mutates
 * only the supplied immer draft. Mutations are no-ops when the referenced zone
 * is missing, so undo/redo stays stable even if a document is loaded that never
 * had the zone.
 *
 * Deleting a zone removes the zone AND clears `zoneId` on every piece assigned
 * to it inside a SINGLE command, so one undo restores both. `activeZoneId` is
 * transient UI state and is intentionally not touched here; the editor store
 * reconciles it.
 */

import type { Command, Project, Zone } from '@/domain';

function findZone(draft: Project, zoneId: string): Zone | undefined {
  return draft.zones.find((zone) => zone.id === zoneId);
}

/** Add a zone. Duplicate ids are ignored, keeping the command idempotent. */
export function createAddZoneCommand(zone: Zone): Command {
  const snapshot: Zone = { ...zone };
  return {
    type: 'zone.add',
    label: `Add zone "${snapshot.name}"`,
    apply(draft: Project): void {
      if (draft.zones.some((existing) => existing.id === snapshot.id)) {
        return;
      }
      draft.zones.push({ ...snapshot });
    },
  };
}

/**
 * Delete a zone and unassign every piece that referenced it. Clearing
 * `piece.zoneId` happens in the SAME command so a single undo restores the zone
 * and all its memberships together.
 */
export function createDeleteZoneCommand(zoneId: string): Command {
  return {
    type: 'zone.delete',
    label: 'Delete zone',
    apply(draft: Project): void {
      if (findZone(draft, zoneId) === undefined) {
        return;
      }
      draft.zones = draft.zones.filter((zone) => zone.id !== zoneId);
      for (const piece of draft.pieces) {
        if (piece.zoneId === zoneId) {
          piece.zoneId = null;
        }
      }
    },
  };
}

/** Rename a zone. Unknown zones are ignored. */
export function createRenameZoneCommand(zoneId: string, name: string): Command {
  return {
    type: 'zone.rename',
    label: `Rename zone to "${name}"`,
    apply(draft: Project): void {
      const zone = findZone(draft, zoneId);
      if (zone === undefined) {
        return;
      }
      zone.name = name;
    },
  };
}

/** Set a zone's color. Unknown zones are ignored. */
export function createSetZoneColorCommand(zoneId: string, color: string): Command {
  return {
    type: 'zone.setColor',
    label: `Set zone color to ${color}`,
    apply(draft: Project): void {
      const zone = findZone(draft, zoneId);
      if (zone === undefined) {
        return;
      }
      zone.color = color;
    },
  };
}

/** Toggle a zone's visibility. Unknown zones are ignored. */
export function createSetZoneVisibleCommand(zoneId: string, visible: boolean): Command {
  return {
    type: 'zone.setVisible',
    label: visible ? 'Show zone' : 'Hide zone',
    apply(draft: Project): void {
      const zone = findZone(draft, zoneId);
      if (zone === undefined) {
        return;
      }
      zone.visible = visible;
    },
  };
}

/** Toggle a zone's locked state. Unknown zones are ignored. */
export function createSetZoneLockedCommand(zoneId: string, locked: boolean): Command {
  return {
    type: 'zone.setLocked',
    label: locked ? 'Lock zone' : 'Unlock zone',
    apply(draft: Project): void {
      const zone = findZone(draft, zoneId);
      if (zone === undefined) {
        return;
      }
      zone.locked = locked;
    },
  };
}
