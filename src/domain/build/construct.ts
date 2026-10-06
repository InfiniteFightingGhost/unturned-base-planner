import { z } from 'zod';
import { normalizeScalar } from '../primitives';
import type { PieceCategory, PieceDefinition } from '../piece-definition';

/**
 * Unturned housing construct kinds (U3-SDK `EConstruct`).
 *
 * A construct decides how a piece participates in the housing graph, which
 * placement validator runs, and how the ghost rotates. Our data model has a
 * richer `PieceCategory`; `resolveConstruct` maps it onto one of these eight.
 */
export const EConstructSchema = z.enum([
  'FLOOR',
  'WALL',
  'RAMPART',
  'ROOF',
  'PILLAR',
  'POST',
  'FLOOR_POLY',
  'ROOF_POLY',
]);

export type EConstruct = z.infer<typeof EConstructSchema>;

/*
 * Exact constants from `HousingConnections` in the public U3-SDK.
 */

/** Side length of square and triangular floor/roof. */
export const EDGE_LENGTH = 6.0;
export const HALF_EDGE_LENGTH = 3.0;

export const WALL_HEIGHT = 4.25;
export const HALF_WALL_HEIGHT = 2.125;

/** Vertical distance from edge center to wall pivot. */
export const WALL_PIVOT_OFFSET = 2.125;

/** Vertical distance from edge center to rampart pivot. */
export const RAMPART_PIVOT_OFFSET = 0.9;

export const FOUNDATION_HEIGHT = 10.25;
export const HALF_FOUNDATION_HEIGHT = 5.125;
export const FOUNDATION_CENTER_OFFSET = -4.875;

/** If positions are within this threshold the edges/vertices connect. */
export const LINK_TOLERANCE = 0.02;

export const MAX_PLACEMENT_DISTANCE = 16.0;
export const MAX_PLACEMENT_SQR_DISTANCE = MAX_PLACEMENT_DISTANCE * MAX_PLACEMENT_DISTANCE;

export const MAX_FIND_EMPTY_SLOT_DISTANCE = 8.0;
export const MAX_FIND_EMPTY_SLOT_SQR_DISTANCE =
  MAX_FIND_EMPTY_SLOT_DISTANCE * MAX_FIND_EMPTY_SLOT_DISTANCE;

export const MIN_FIND_EMPTY_SLOT_COSINE = 0.9;

export const PLACEMENT_OVERLAP_PADDING = 0.02;
export const CHARACTER_OVERLAP_PADDING = 0.25;

/** Distance from triangle pivot to apex of triangle: 6 - sin(60) * 6. */
export const TRIANGLE_APEX_PIVOT_OFFSET = 2.196152422706632;

/** Radius of the circle inscribed in the triangle: tan(30) * half side. */
export const TRIANGLE_INNER_RADIUS = 1.7320508075688772;

/** Distance from triangle pivot to the center of the triangle. */
export const TRIANGLE_CENTER_PIVOT_OFFSET = -HALF_EDGE_LENGTH + TRIANGLE_INNER_RADIUS;

export const ROOF_THICKNESS = 0.5;
export const HALF_ROOF_THICKNESS = 0.25;

export const FOUNDATION_TOP_MARGIN = 0.1;

const DEG_TO_RAD = Math.PI / 180;

export function degreesToRadians(degrees: number): number {
  return normalizeScalar(degrees * DEG_TO_RAD);
}

export function radiansToDegrees(radians: number): number {
  return normalizeScalar((radians * 180) / Math.PI);
}

/**
 * Triangular constructs cannot freely rotate; the placement tool pins them to
 * the edge's yaw. Square constructs rotate in quarter turns, walls/ramparts in
 * half turns, and pillars/posts in 30 degree steps.
 */
export function rotationStep(construct: EConstruct): number {
  switch (construct) {
    case 'FLOOR':
    case 'ROOF':
      return Math.PI / 2;
    case 'WALL':
    case 'RAMPART':
      return Math.PI;
    case 'PILLAR':
    case 'POST':
      return Math.PI / 6;
    case 'FLOOR_POLY':
    case 'ROOF_POLY':
      return 0;
    default: {
      const exhaustive: never = construct;
      return exhaustive;
    }
  }
}

/** Triangles are locked to their edge rotation. */
export function canRotate(construct: EConstruct): boolean {
  return construct !== 'FLOOR_POLY' && construct !== 'ROOF_POLY';
}

const TRIANGLE_NAME = /triangle|poly/i;

/**
 * Map our `PieceCategory` onto an `EConstruct`, honouring an explicit
 * `definition.construct` when present.
 *
 * The categories that do not have a first-class Unturned construct
 * (`fence`, `decorative`, `defensive`, `door`) are folded onto the closest
 * behaviour: short barriers become ramparts, doors become walls, and anything
 * unrecognised falls back to a square floor. Triangular pieces are detected by
 * name because our category enum does not distinguish them.
 */
export function resolveConstruct(definition: PieceDefinition): EConstruct {
  const explicit = definition.construct;
  if (explicit !== undefined) {
    return explicit;
  }

  const isTriangle = TRIANGLE_NAME.test(definition.name);
  const category: PieceCategory = definition.category;

  switch (category) {
    case 'foundation':
    case 'floor':
      return isTriangle ? 'FLOOR_POLY' : 'FLOOR';
    case 'wall':
    case 'window':
    case 'doorway':
    case 'door':
      return 'WALL';
    case 'pillar':
      return 'PILLAR';
    case 'post':
      return 'POST';
    case 'roof':
    case 'roof_variant':
    case 'ramp':
    case 'stair':
      return isTriangle ? 'ROOF_POLY' : 'ROOF';
    case 'railing':
    case 'fence':
      return 'RAMPART';
    case 'decorative':
    case 'defensive':
      return 'FLOOR';
    default: {
      const exhaustive: never = category;
      return exhaustive;
    }
  }
}
