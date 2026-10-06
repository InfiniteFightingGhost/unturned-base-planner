/**
 * Pure grid configuration and snapping helpers.
 *
 * No three.js imports: the grid math is reusable by UI panels, placement tools and
 * tests. Rendering concerns live in `EditorGrid.tsx`.
 */

import { snapVec3 } from '@/lib/snap';
import type { Vec3Tuple } from '@/lib/snap';

export interface GridConfig {
  visible: boolean;
  cellSize: number;
  sectionSize: number;
  snapStep: number;
  snapEnabled: boolean;
  precision: number;
}

export const SPACING_PRESETS: readonly number[] = [0.5, 1, 2, 5, 10];

export const DEFAULT_GRID_CONFIG: GridConfig = {
  visible: true,
  cellSize: 1,
  sectionSize: 10,
  snapStep: 1,
  snapEnabled: true,
  precision: 3,
};

const MIN_PRECISION = 0;
const MAX_PRECISION = 12;

function roundTo(value: number, precision: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const clamped = Math.min(MAX_PRECISION, Math.max(MIN_PRECISION, Math.trunc(precision)));
  const factor = 10 ** clamped;
  return Math.round(value * factor) / factor;
}

/**
 * Snaps a world-space position to the configured step.
 *
 * When `snapEnabled` is false (or the step is non-positive) the position is returned
 * unchanged so callers can use this unconditionally in the placement hot path.
 */
export function applySnap(position: Vec3Tuple, config: GridConfig): [number, number, number] {
  if (!config.snapEnabled || config.snapStep <= 0) {
    return [position[0], position[1], position[2]];
  }
  const snapped = snapVec3(position, config.snapStep);
  return [
    roundTo(snapped[0], config.precision),
    roundTo(snapped[1], config.precision),
    roundTo(snapped[2], config.precision),
  ];
}

/**
 * Picks a grid spacing from the 1 / 2 / 5 decade ladder based on camera distance.
 *
 * The result is monotonically non-decreasing with distance and is always of the form
 * `{1, 2, 5} * 10^n`, which keeps grid lines legible at every zoom level.
 */
export function screenAdaptiveSpacing(distance: number): number {
  if (!Number.isFinite(distance) || distance <= 0) {
    return SPACING_PRESETS[1] ?? 1;
  }

  const target = distance / 10;
  const exponent = Math.floor(Math.log10(target));
  const magnitude = 10 ** exponent;
  const normalized = target / magnitude;

  let factor: number;
  if (normalized < 1.5) {
    factor = 1;
  } else if (normalized < 3.5) {
    factor = 2;
  } else if (normalized < 7.5) {
    factor = 5;
  } else {
    factor = 10;
  }

  return factor * magnitude;
}
