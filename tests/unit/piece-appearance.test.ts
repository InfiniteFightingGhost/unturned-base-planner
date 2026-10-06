import { describe, expect, it } from 'vitest';
import { NEUTRAL_CAD_COLOR, tierColorForDefinition } from '@/engine/rendering/pieceAppearance';

describe('tierColorForDefinition', () => {
  it('maps each known wood tier to a distinct colour', () => {
    const birch = tierColorForDefinition('wall.birch');
    const maple = tierColorForDefinition('wall.maple');
    const pine = tierColorForDefinition('wall.pine');
    expect(new Set([birch, maple, pine]).size).toBe(3);
    expect(birch).not.toBe(NEUTRAL_CAD_COLOR);
    expect(maple).not.toBe(NEUTRAL_CAD_COLOR);
    expect(pine).not.toBe(NEUTRAL_CAD_COLOR);
  });

  it('maps brick and metal tiers, including multi-segment ids', () => {
    const brick = tierColorForDefinition('wall.brick');
    const metal = tierColorForDefinition('fortification.bars.metal');
    expect(brick).not.toBe(metal);
    expect(brick).not.toBe(NEUTRAL_CAD_COLOR);
    expect(metal).not.toBe(NEUTRAL_CAD_COLOR);
  });

  it('falls back to neutral CAD grey for tier-less and unknown ids', () => {
    expect(tierColorForDefinition('sandbag')).toBe(NEUTRAL_CAD_COLOR);
    expect(tierColorForDefinition('fence.barbed.wire')).toBe(NEUTRAL_CAD_COLOR);
    expect(tierColorForDefinition('')).toBe(NEUTRAL_CAD_COLOR);
  });
});