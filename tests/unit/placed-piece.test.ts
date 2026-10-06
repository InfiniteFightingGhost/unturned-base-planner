import { describe, expect, it } from 'vitest';
import {
  canonicalizePlacedPiece,
  planPiece,
  validatePlacedPieceReferences,
  type PlacedPiece,
} from '@/domain';
import { makeDefinition } from './domain-fixtures';

describe('validatePlacedPieceReferences', () => {
  it('passes for a valid piece with a known definition, floor and zone', () => {
    const def = makeDefinition();
    const definitions = new Map([[def.id, def]]);
    const piece = planPiece(def, { position: [0, 0, 0], floorId: 'floor-1', zoneId: 'zone-1' });

    const issues = validatePlacedPieceReferences(
      piece,
      definitions,
      new Set(['floor-1']),
      new Set(['zone-1']),
    );

    expect(issues).toEqual([]);
  });

  it('reports unknown definitionId and unknown floorId', () => {
    const def = makeDefinition();
    const piece = planPiece(def, { position: [0, 0, 0], floorId: 'missing-floor' });

    const issues = validatePlacedPieceReferences(piece, new Map(), new Set(['floor-1']), new Set());

    expect(issues.some((message) => message.includes('definition'))).toBe(true);
    expect(issues.some((message) => message.includes('floor'))).toBe(true);
  });

  it('reports an unknown zone only when a zone set is supplied', () => {
    const def = makeDefinition();
    const definitions = new Map([[def.id, def]]);
    const piece = planPiece(def, { position: [0, 0, 0], floorId: 'floor-1', zoneId: 'ghost' });

    expect(validatePlacedPieceReferences(piece, definitions)).toEqual([]);
    const issues = validatePlacedPieceReferences(
      piece,
      definitions,
      new Set(['floor-1']),
      new Set(['zone-1']),
    );
    expect(issues.some((message) => message.includes('zone'))).toBe(true);
  });
});

describe('canonicalizePlacedPiece', () => {
  it('is deterministic for logically-equal transforms, including -0', () => {
    const def = makeDefinition();
    const piece = planPiece(def, { position: [0, 0, 0], floorId: 'floor-1' });

    const noisy = {
      ...piece,
      position: [-0, 1.0000001, 2.9999999],
    } as PlacedPiece;
    const clean = {
      ...piece,
      position: [0, 1, 3],
    } as PlacedPiece;

    const a = canonicalizePlacedPiece(noisy);
    const b = canonicalizePlacedPiece(clean);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(Object.is(a.position[0], -0)).toBe(false);
    expect(a.position).toEqual([0, 1, 3]);
  });
});
