import type { PieceDefinition } from './piece-definition';
import type { Project } from './project';

/** A single referential-integrity problem found in a project. */
export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
}

/**
 * Validate cross-references inside a project:
 * - every placed piece points at a known definition
 * - every placed piece points at a known floor
 * - every placed piece points at a known zone (when set)
 * - floor indices are unique
 * - placed piece ids are unique
 *
 * `zones` and `floors` may be supplied to validate against a registry; when
 * omitted the project's own collections are used. Results are deterministic.
 */
export function validateProjectReferences(
  project: Project,
  definitions: ReadonlyMap<string, PieceDefinition>,
  zones?: ReadonlyMap<string, unknown>,
  floors?: ReadonlyMap<string, unknown>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const floorIndex = floors ?? new Map(project.floors.map((floor) => [floor.id, floor]));
  const zoneIndex = zones ?? new Map(project.zones.map((zone) => [zone.id, zone]));

  const indexCounts = new Map<number, number>();
  for (const floor of project.floors) {
    indexCounts.set(floor.index, (indexCounts.get(floor.index) ?? 0) + 1);
  }
  const duplicateIndices = [...indexCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([index]) => index)
    .sort((a, b) => a - b);
  for (const index of duplicateIndices) {
    issues.push({
      code: 'floor.duplicate-index',
      message: `Duplicate floor index ${index}`,
      path: 'floors',
    });
  }

  const pieceIdCounts = new Map<string, number>();
  for (const piece of project.pieces) {
    pieceIdCounts.set(piece.id, (pieceIdCounts.get(piece.id) ?? 0) + 1);
  }
  const reportedDuplicateIds = new Set<string>();

  for (const piece of project.pieces) {
    const path = `pieces.${piece.id}`;

    if (!definitions.has(piece.definitionId)) {
      issues.push({
        code: 'piece.unknown-definition',
        message: `Piece "${piece.id}" references unknown definition "${piece.definitionId}"`,
        path,
      });
    }

    if (!floorIndex.has(piece.floorId)) {
      issues.push({
        code: 'piece.unknown-floor',
        message: `Piece "${piece.id}" references unknown floor "${piece.floorId}"`,
        path,
      });
    }

    if (piece.zoneId !== null && !zoneIndex.has(piece.zoneId)) {
      issues.push({
        code: 'piece.unknown-zone',
        message: `Piece "${piece.id}" references unknown zone "${piece.zoneId}"`,
        path,
      });
    }

    if ((pieceIdCounts.get(piece.id) ?? 0) > 1 && !reportedDuplicateIds.has(piece.id)) {
      reportedDuplicateIds.add(piece.id);
      issues.push({
        code: 'piece.duplicate-id',
        message: `Duplicate piece id "${piece.id}"`,
        path,
      });
    }
  }

  return issues;
}
