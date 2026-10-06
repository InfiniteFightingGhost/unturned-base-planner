import { describe, expect, it } from 'vitest';
import { PieceDefinitionSchema, getRotationCandidates } from '@/domain';
import { makeDefinition } from './domain-fixtures';

describe('PieceDefinitionSchema', () => {
  it('can be built without any placement or editor state', () => {
    const def = PieceDefinitionSchema.parse({
      id: 'foundation_wood',
      name: 'Wood Foundation',
      category: 'foundation',
      dimensions: { width: 4, height: 0.25, depth: 4 },
      model: { assetId: 'foundation_wood_asset' },
      resourceRecipe: 'foundation_wood_recipe',
    });

    expect(def.id).toBe('foundation_wood');
    expect(def.variants).toEqual([]);
    expect(def.snapPoints).toEqual([]);
    expect(def.allowedRotations).toEqual([0, 90, 180, 270]);
    expect(def.collision).toEqual({ enabled: true, shape: 'box' });
    expect(def.model.fallback).toBe('box');
  });

  it('applies defaults but preserves explicit values', () => {
    const def = makeDefinition({
      variants: [{ id: 'v1', name: 'Painted', definitionId: 'wall_painted' }],
      collision: { enabled: false, shape: 'none' },
    });
    expect(def.variants).toHaveLength(1);
    expect(def.collision).toEqual({ enabled: false, shape: 'none' });
  });
});

describe('getRotationCandidates', () => {
  it('normalizes, sorts and de-duplicates rotation angles', () => {
    const def = makeDefinition({ allowedRotations: [450, -90, 90, 90, 360, 180] });
    expect(getRotationCandidates(def)).toEqual([0, 90, 180, 270]);
  });

  it('returns a plain ascending list for the default rotations', () => {
    expect(getRotationCandidates(makeDefinition())).toEqual([0, 90, 180, 270]);
  });
});
