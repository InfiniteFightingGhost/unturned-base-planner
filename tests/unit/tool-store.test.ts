import { beforeEach, describe, expect, it } from 'vitest';
import { useToolStore } from '@/editor/tools/toolStore';

function reset(): void {
  useToolStore.getState().cancelPlacement();
}

describe('tool store', () => {
  beforeEach(reset);

  it('defaults to the select tool with no pending definition or ghost', () => {
    const state = useToolStore.getState();
    expect(state.activeTool).toBe('select');
    expect(state.activeDefinitionId).toBeNull();
    expect(state.ghost).toBeNull();
  });

  it('activates tools and definitions', () => {
    useToolStore.getState().setActiveTool('place');
    useToolStore.getState().setActiveDefinitionId('wall.wood');
    const state = useToolStore.getState();
    expect(state.activeTool).toBe('place');
    expect(state.activeDefinitionId).toBe('wall.wood');
  });

  it('sets and clears the ghost', () => {
    useToolStore.getState().setGhost({ position: [1, 0, 2], rotationY: Math.PI / 2 });
    expect(useToolStore.getState().ghost).toEqual({
      position: [1, 0, 2],
      rotationY: Math.PI / 2,
    });

    useToolStore.getState().clearGhost();
    expect(useToolStore.getState().ghost).toBeNull();
  });

  it('cancelPlacement returns to select and clears the pending state without document side effects', () => {
    useToolStore.getState().setActiveTool('place');
    useToolStore.getState().setActiveDefinitionId('wall.wood');
    useToolStore.getState().setGhost({ position: [0, 0, 0], rotationY: 0 });

    useToolStore.getState().cancelPlacement();

    const state = useToolStore.getState();
    expect(state.activeTool).toBe('select');
    expect(state.activeDefinitionId).toBeNull();
    expect(state.ghost).toBeNull();
  });
});
