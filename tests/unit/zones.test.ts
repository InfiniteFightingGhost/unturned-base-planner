import { describe, expect, it } from 'vitest';
import { createEmptyProject, planPiece, ProjectSchema } from '@/domain';
import type { Floor, PlacedPiece, Project, Zone } from '@/domain';
import {
  isPieceVisible,
  isZoneHidden,
  isZoneLocked,
  piecesInZone,
  sortedZones,
  visibleZones,
  zoneById,
  zoneStats,
} from '@/editor';
import { makeDefinition } from './domain-fixtures';

const ISO = '2024-01-01T00:00:00.000Z';
const def = makeDefinition();

function makeZone(id: string, overrides: Partial<Zone> = {}): Zone {
  return { id, name: id, color: '#3b82f6', visible: true, locked: false, ...overrides };
}

function projectWith(zones: Zone[], pieces: PlacedPiece[] = [], floors?: Floor[]): Project {
  const base = createEmptyProject('Test', { id: 'p1', now: ISO });
  return ProjectSchema.parse({
    ...base,
    floors: floors ?? [
      { id: 'ground', name: 'Ground', index: 0, elevation: 0, visible: true, locked: false },
    ],
    zones,
    pieces,
  });
}

function piece(
  id: string,
  zoneId: string | null,
  floorId: string,
  tags: string[] = [],
): PlacedPiece {
  return planPiece(def, {
    id,
    position: [0, 0, 0],
    floorId,
    zoneId,
    metadata: { tags },
  });
}

describe('zone helpers', () => {
  it('resolves a zone by id and returns undefined for unknown ids', () => {
    const project = projectWith([makeZone('a'), makeZone('b')]);
    expect(zoneById(project, 'a')?.id).toBe('a');
    expect(zoneById(project, 'missing')).toBeUndefined();
  });

  it('sorts zones by name with a stable id tie-break', () => {
    const project = projectWith([
      makeZone('c', { name: 'gamma' }),
      makeZone('a', { name: 'alpha' }),
      makeZone('b', { name: 'beta' }),
      makeZone('a2', { name: 'alpha' }),
    ]);
    expect(sortedZones(project).map((zone) => zone.id)).toEqual(['a', 'a2', 'b', 'c']);
  });

  it('returns visible zones in display order', () => {
    const project = projectWith([
      makeZone('c', { name: 'gamma', visible: false }),
      makeZone('a', { name: 'alpha' }),
      makeZone('b', { name: 'beta', visible: true }),
    ]);
    expect(visibleZones(project).map((zone) => zone.id)).toEqual(['a', 'b']);
  });

  it('filters pieces by zone id, including the unassigned (null) bucket', () => {
    const project = projectWith(
      [makeZone('a'), makeZone('b')],
      [piece('pa', 'a', 'ground'), piece('pb', 'b', 'ground'), piece('pn', null, 'ground')],
    );
    expect(piecesInZone(project, 'a').map((p) => p.id)).toEqual(['pa']);
    expect(piecesInZone(project, 'b').map((p) => p.id)).toEqual(['pb']);
    expect(piecesInZone(project, null).map((p) => p.id)).toEqual(['pn']);
    expect(piecesInZone(project, 'missing')).toEqual([]);
  });

  it('reports locked/hidden state only for known zones', () => {
    const project = projectWith([
      makeZone('a'),
      makeZone('b', { locked: true }),
      makeZone('c', { visible: false }),
    ]);
    expect(isZoneLocked(project, 'a')).toBe(false);
    expect(isZoneLocked(project, 'b')).toBe(true);
    expect(isZoneLocked(project, 'missing')).toBe(false);
    expect(isZoneLocked(project, null)).toBe(false);

    expect(isZoneHidden(project, 'c')).toBe(true);
    expect(isZoneHidden(project, 'a')).toBe(false);
    expect(isZoneHidden(project, 'missing')).toBe(false);
    expect(isZoneHidden(project, null)).toBe(false);
  });

  it('counts the pieces assigned to a zone', () => {
    const project = projectWith(
      [makeZone('a'), makeZone('b')],
      [piece('pa', 'a', 'ground'), piece('pa2', 'a', 'ground'), piece('pb', 'b', 'ground')],
    );
    expect(zoneStats(project, 'a')).toEqual({ pieceCount: 2 });
    expect(zoneStats(project, 'b')).toEqual({ pieceCount: 1 });
    expect(zoneStats(project, 'missing')).toEqual({ pieceCount: 0 });
  });
});

describe('isPieceVisible', () => {
  it('is true for a piece on a visible floor with a visible zone', () => {
    const project = projectWith([makeZone('a')], [piece('pa', 'a', 'ground')]);
    expect(isPieceVisible(piece('pa', 'a', 'ground'), project)).toBe(true);
  });

  it('is true for an unassigned piece on a visible floor', () => {
    const project = projectWith([], [piece('pn', null, 'ground')]);
    expect(isPieceVisible(piece('pn', null, 'ground'), project)).toBe(true);
  });

  it('is false when the piece is assigned to a hidden zone', () => {
    const project = projectWith([makeZone('a', { visible: false })]);
    expect(isPieceVisible(piece('pa', 'a', 'ground'), project)).toBe(false);
  });

  it('is false when the piece floor is hidden', () => {
    const project = projectWith(
      [makeZone('a')],
      [],
      [{ id: 'ground', name: 'Ground', index: 0, elevation: 0, visible: false, locked: false }],
    );
    expect(isPieceVisible(piece('pa', 'a', 'ground'), project)).toBe(false);
  });

  it('treats an unknown zone as not hidden', () => {
    const project = projectWith([], [piece('pa', 'ghost', 'ground')]);
    expect(isPieceVisible(piece('pa', 'ghost', 'ground'), project)).toBe(true);
  });
});
