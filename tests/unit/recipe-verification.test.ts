import { describe, expect, it } from 'vitest';
import { DATASET } from '@/data';
import { expandToRaw, type ResourceGraph } from '@/domain';

const graph = DATASET.graph;

const rawIds = new Set(
  graph.resources.filter((resource) => resource.isRaw).map((resource) => resource.id),
);

function shuffled(source: ResourceGraph): ResourceGraph {
  return {
    schemaVersion: source.schemaVersion,
    resources: [...source.resources].reverse(),
    recipes: [...source.recipes].reverse(),
  };
}

describe('manual recipe verification (P6)', () => {
  it('expands wall.birch to 3 Birch Log', () => {
    expect(expandToRaw('wall.birch', 1, graph)).toEqual([{ resourceId: 'log.birch', amount: 3 }]);
  });

  it('expands wall.metal to 10 Metal Scrap', () => {
    expect(expandToRaw('wall.metal', 1, graph)).toEqual([{ resourceId: 'scrap.metal', amount: 10 }]);
  });

  it('expands floor.pine to 3 Pine Log', () => {
    expect(expandToRaw('floor.pine', 1, graph)).toEqual([{ resourceId: 'log.pine', amount: 3 }]);
  });

  it('expands pillar.metal to 6 Metal Scrap', () => {
    expect(expandToRaw('pillar.metal', 1, graph)).toEqual([{ resourceId: 'scrap.metal', amount: 6 }]);
  });

  it('expands post.birch x2 to 2 Birch Log', () => {
    expect(expandToRaw('post.birch', 2, graph)).toEqual([{ resourceId: 'log.birch', amount: 2 }]);
  });

  it('expands wall.brick to 3 Bricks', () => {
    expect(expandToRaw('wall.brick', 1, graph)).toEqual([{ resourceId: 'brick', amount: 3 }]);
  });

  it('expands door.wood.birch to Birch Log plus Metal Scrap', () => {
    const raw = expandToRaw('door.wood.birch', 1, graph);
    const byId = new Map(raw.map((entry) => [entry.resourceId, entry.amount]));
    expect(byId.get('log.birch')).toBe(2);
    expect(byId.get('scrap.metal')).toBe(1);
    expect(raw).toHaveLength(2);
  });
});

describe('nested expansion invariants', () => {
  it('resolves every piece definition exclusively to raw resources', () => {
    for (const definition of DATASET.definitions) {
      const raw = expandToRaw(definition.id, 1, graph);
      expect(raw.length).toBeGreaterThan(0);
      for (const entry of raw) {
        expect(rawIds.has(entry.resourceId)).toBe(true);
      }
    }
  });

  it('resolves every intermediate resource exclusively to raw resources', () => {
    for (const resource of graph.resources) {
      if (resource.isRaw) {
        continue;
      }
      const raw = expandToRaw(resource.id, 1, graph);
      for (const entry of raw) {
        expect(rawIds.has(entry.resourceId)).toBe(true);
      }
    }
  });

  it('is deterministic and independent of graph ordering', () => {
    const reordered = shuffled(graph);
    for (const definition of DATASET.definitions) {
      const first = expandToRaw(definition.id, 1, graph);
      const second = expandToRaw(definition.id, 1, graph);
      const third = expandToRaw(definition.id, 1, reordered);
      expect(second).toEqual(first);
      expect(third).toEqual(first);
    }
  });
});
