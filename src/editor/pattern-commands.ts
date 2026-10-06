/**
 * Command factories for building-productivity patterns (P18–P20).
 *
 * Each factory turns a *generated* batch of fresh pieces into a single domain
 * `Command`, so applying a pattern is exactly one undo step regardless of how
 * many pieces it produces. The generated pieces themselves come from the pure
 * helpers in `./transform`; the factories here only label and wrap them.
 *
 * Like every command factory, these are pure: they capture their arguments and
 * never read a store, the clock, or module state.
 */

import type { Command, PlacedPiece, Vec3 } from '@/domain';
import { createAddPiecesCommand } from './commands';
import {
  arrayPieces,
  gridArrayPieces,
  mirrorPieces,
  radialArrayPieces,
} from './transform';

/**
 * Reuse the documented duplicate-id policy of `createAddPiecesCommand` while
 * replacing its auto-generated label with a pattern-specific one.
 */
function labeledAddPieces(label: string, pieces: readonly PlacedPiece[]): Command {
  const base = createAddPiecesCommand(pieces);
  return { type: base.type, label, apply: base.apply };
}

/**
 * Linear array: add `count` copies of `pieces` at `spacing * i` along
 * `direction` (i = 1..count). One undo step.
 */
export function createLinearArrayCommand(
  pieces: readonly PlacedPiece[],
  count: number,
  spacing: number,
  direction: Vec3,
  idFactory?: () => string,
): Command {
  const total = Math.max(0, Math.floor(count));
  return labeledAddPieces(
    `Linear array (${total})`,
    arrayPieces(pieces, total, spacing, direction, idFactory),
  );
}

/**
 * Grid array: add copies of `pieces` over a `rows × cols` grid, excluding the
 * original `(0, 0)` cell. One undo step.
 */
export function createGridArrayCommand(
  pieces: readonly PlacedPiece[],
  rows: number,
  cols: number,
  spacingX: number,
  spacingZ: number,
  idFactory?: () => string,
): Command {
  const rowCount = Math.max(0, Math.floor(rows));
  const colCount = Math.max(0, Math.floor(cols));
  return labeledAddPieces(
    `Grid array (${rowCount}x${colCount})`,
    gridArrayPieces(pieces, rowCount, colCount, spacingX, spacingZ, idFactory),
  );
}

/**
 * Radial array: add `count` copies of `pieces` evenly distributed by
 * `totalAngleRadians` around `center` on a circle of `radius`. One undo step.
 */
export function createRadialArrayCommand(
  pieces: readonly PlacedPiece[],
  count: number,
  radius: number,
  totalAngleRadians: number,
  center: Vec3,
  idFactory?: () => string,
): Command {
  const total = Math.max(0, Math.floor(count));
  return labeledAddPieces(
    `Radial array (${total})`,
    radialArrayPieces(pieces, total, radius, totalAngleRadians, center, idFactory),
  );
}

/**
 * Mirror: add mirrored copies of `pieces` across the plane `axis = planeOffset`.
 * One undo step.
 */
export function createMirrorCommand(
  pieces: readonly PlacedPiece[],
  axis: 'x' | 'z',
  planeOffset = 0,
  idFactory?: () => string,
): Command {
  return labeledAddPieces(
    `Mirror ${axis.toUpperCase()}`,
    mirrorPieces(pieces, axis, planeOffset, idFactory),
  );
}
