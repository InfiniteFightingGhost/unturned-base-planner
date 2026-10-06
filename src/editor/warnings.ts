/**
 * Pure design warnings for the current document.
 *
 * Warnings are derived data recomputed from the placed pieces; nothing is
 * cached or written back. Three classes are detected:
 *
 * - `floating`   (error): pieces with no path to the ground in the housing graph.
 * - `unattached` (warning): structure pieces sharing no housing vertex/edge with
 *   any other piece (an isolated island).
 * - `wall-missing-pillars` (warning): full-height walls whose end vertices lack
 *   full-height pillars.
 *
 * `computeDesignWarnings` is deterministic: warnings are ordered by code and
 * their `pieceIds` are sorted, so the panel never reshuffles between renders.
 */

import {
  buildHousingGraph,
  findFloatingPieces,
  hasFullHeightPillar,
  resolveBuild,
} from '@/domain';
import type { PieceDefinition, PlacedPiece } from '@/domain';

export type DesignWarningSeverity = 'warning' | 'error';

export interface DesignWarning {
  readonly code: DesignWarningCode;
  readonly severity: DesignWarningSeverity;
  readonly message: string;
  readonly pieceIds: string[];
}

export type DesignWarningCode = 'floating' | 'unattached' | 'wall-missing-pillars';

const WARNING_ORDER: readonly DesignWarningCode[] = [
  'floating',
  'wall-missing-pillars',
  'unattached',
];

function sortedIds(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function isStructure(
  piece: PlacedPiece,
  definitions: ReadonlyMap<string, PieceDefinition>,
): boolean {
  const definition = definitions.get(piece.definitionId);
  return definition !== undefined && resolveBuild(definition) === undefined;
}

/**
 * Structure pieces whose connected component in the housing graph contains no
 * other piece. Nodes are vertices and edges; they link horizontally (edge <->
 * its end vertices) and vertically (a wall's lower/upper edge, a pillar's
 * lower/upper vertex), so a roof resting on walls is attached even though the
 * shared top node carries no other piece id.
 */
function unattachedPieceIds(
  pieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
): string[] {
  const graph = buildHousingGraph(pieces, definitions);
  const nodes = new Map<string, { pieces: string[]; neighbours: string[] }>();
  const vertexKey = (id: string): string => `v:${id}`;
  const edgeKey = (id: string): string => `e:${id}`;

  for (const vertex of graph.vertices.values()) {
    const neighbours: string[] = vertex.edges.map(edgeKey);
    if (vertex.upperVertexId !== null) {
      neighbours.push(vertexKey(vertex.upperVertexId));
    }
    if (vertex.lowerVertexId !== null) {
      neighbours.push(vertexKey(vertex.lowerVertexId));
    }
    nodes.set(vertexKey(vertex.id), {
      pieces: [...vertex.pillars, ...vertex.floors],
      neighbours,
    });
  }

  for (const edge of graph.edges.values()) {
    const neighbours: string[] = [];
    if (edge.vertex0Id !== null) {
      neighbours.push(vertexKey(edge.vertex0Id));
    }
    if (edge.vertex1Id !== null) {
      neighbours.push(vertexKey(edge.vertex1Id));
    }
    if (edge.upperEdgeId !== null) {
      neighbours.push(edgeKey(edge.upperEdgeId));
    }
    if (edge.lowerEdgeId !== null) {
      neighbours.push(edgeKey(edge.lowerEdgeId));
    }
    nodes.set(edgeKey(edge.id), {
      pieces: [...edge.forwardFloors, ...edge.backwardFloors, ...edge.walls],
      neighbours,
    });
  }

  const visited = new Set<string>();
  const attached = new Set<string>();
  for (const start of nodes.keys()) {
    if (visited.has(start)) {
      continue;
    }
    const queue: string[] = [start];
    visited.add(start);
    const component = new Set<string>();
    while (queue.length > 0) {
      const key = queue.pop();
      if (key === undefined) {
        continue;
      }
      const node = nodes.get(key);
      if (node === undefined) {
        continue;
      }
      for (const id of node.pieces) {
        component.add(id);
      }
      for (const neighbour of node.neighbours) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }
    if (component.size >= 2) {
      for (const id of component) {
        attached.add(id);
      }
    }
  }

  const structureIds = pieces
    .filter((piece) => isStructure(piece, definitions))
    .map((piece) => piece.id);
  const result: string[] = [];
  for (const id of structureIds) {
    if (!attached.has(id)) {
      result.push(id);
    }
  }
  return sortedIds(result);
}

/** Full-height WALL pieces whose base edge has a vertex without a pillar. */
function wallsMissingPillars(
  pieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
): string[] {
  const graph = buildHousingGraph(pieces, definitions);
  const missing: string[] = [];

  for (const edge of graph.edges.values()) {
    for (const wallId of edge.walls) {
      if (graph.constructs.get(wallId) !== 'WALL') {
        continue;
      }
      const vertex0 = edge.vertex0Id === null ? undefined : graph.vertices.get(edge.vertex0Id);
      const vertex1 = edge.vertex1Id === null ? undefined : graph.vertices.get(edge.vertex1Id);
      if (
        vertex0 === undefined ||
        vertex1 === undefined ||
        !hasFullHeightPillar(graph, vertex0) ||
        !hasFullHeightPillar(graph, vertex1)
      ) {
        missing.push(wallId);
      }
    }
  }

  return sortedIds(missing);
}

/**
 * Compute the current design warnings. The result is empty for a coherent
 * build and deterministic for any given `pieces` collection.
 */
export function computeDesignWarnings(
  pieces: readonly PlacedPiece[],
  definitions: ReadonlyMap<string, PieceDefinition>,
): DesignWarning[] {
  const structures = pieces.filter((piece) => isStructure(piece, definitions));
  const warnings: DesignWarning[] = [];

  const floating = findFloatingPieces(structures, definitions);
  if (floating.length > 0) {
    warnings.push({
      code: 'floating',
      severity: 'error',
      message: `${floating.length} unsupported piece${floating.length === 1 ? '' : 's'} — no path to the ground`,
      pieceIds: sortedIds(floating),
    });
  }

  const noPillars = wallsMissingPillars(structures, definitions);
  if (noPillars.length > 0) {
    warnings.push({
      code: 'wall-missing-pillars',
      severity: 'warning',
      message: `${noPillars.length} wall${noPillars.length === 1 ? '' : 's'} missing full-height pillars`,
      pieceIds: noPillars,
    });
  }

  const unattached = unattachedPieceIds(structures, definitions);
  if (unattached.length > 0) {
    warnings.push({
      code: 'unattached',
      severity: 'warning',
      message: `${unattached.length} piece${unattached.length === 1 ? '' : 's'} not attached to the structure`,
      pieceIds: unattached,
    });
  }

  return warnings.sort(
    (a, b) =>
      WARNING_ORDER.indexOf(a.code) - WARNING_ORDER.indexOf(b.code) ||
      (a.pieceIds[0] ?? '').localeCompare(b.pieceIds[0] ?? ''),
  );
}

/** Total number of pieces referenced by the warnings. */
export function totalWarningPieces(warnings: readonly DesignWarning[]): number {
  const ids = new Set<string>();
  for (const warning of warnings) {
    for (const id of warning.pieceIds) {
      ids.add(id);
    }
  }
  return ids.size;
}
