import { z } from 'zod';
import type { PieceDefinition } from '../piece-definition';

/**
 * Unturned barricade build kinds (U3-SDK `EBuild`).
 *
 * The enum order is significant: the game serializes the value as a single byte,
 * so entries must never be reordered. Keep this list byte-for-byte identical to
 * `Assets/Runtime/Assembly-CSharp/Unturned/Bundles/EBuild.cs`.
 */
export const EBuildSchema = z.enum([
  'FORTIFICATION',
  'BARRICADE',
  'DOOR',
  'GATE',
  'BED',
  'LADDER',
  'STORAGE',
  'FARM',
  'TORCH',
  'CAMPFIRE',
  'SPIKE',
  'WIRE',
  'GENERATOR',
  'SPOT',
  'SAFEZONE',
  'FREEFORM',
  'SIGN',
  'VEHICLE',
  'CLAIM',
  'BEACON',
  'STORAGE_WALL',
  'BARREL_RAIN',
  'OIL',
  'CAGE',
  'SHUTTER',
  'TANK',
  'CHARGE',
  'SENTRY',
  'SENTRY_FREEFORM',
  'OVEN',
  'LIBRARY',
  'OXYGENATOR',
  'GLASS',
  'NOTE',
  'HATCH',
  'MANNEQUIN',
  'STEREO',
  'SIGN_WALL',
  'CLOCK',
  'BARRICADE_WALL',
]);

export type EBuild = z.infer<typeof EBuildSchema>;

/**
 * Resolve the Unturned `EBuild` for a definition.
 *
 * An explicit `definition.build` always wins. Otherwise a small set of
 * categories have an unambiguous fallback; everything else stays undefined so
 * the barricade engine can use its generic free-placement behaviour.
 */
export function resolveBuild(definition: PieceDefinition): EBuild | undefined {
  if (definition.build !== undefined) {
    return definition.build;
  }
  switch (definition.category) {
    case 'door':
      return 'DOOR';
    case 'defensive':
      return 'BARRICADE';
    case 'decorative':
      return 'FREEFORM';
    case 'fence':
      return 'WIRE';
    default:
      return undefined;
  }
}