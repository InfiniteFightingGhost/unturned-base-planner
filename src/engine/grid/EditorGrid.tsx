/**
 * Ground grid and world-axis indicator.
 *
 * Uses drei's `<Grid infiniteGrid>` rather than `GridHelper` so it can fade with
 * distance and be driven by the shared grid config. Visibility, spacing, section
 * size, snapping and precision are all runtime-configurable through the engine store.
 */

import { DoubleSide } from 'three';
import { GizmoHelper, GizmoViewport, Grid } from '@react-three/drei';
import { useEngineStore } from '../store';

export interface EditorGridProps {
  /** Distance at which the grid fades out. Defaults to 300 world units. */
  fadeDistance?: number;
  /** How aggressively the grid fades. Defaults to 1. */
  fadeStrength?: number;
}

export function EditorGrid({ fadeDistance = 300, fadeStrength = 1 }: EditorGridProps) {
  const grid = useEngineStore((state) => state.grid);

  if (!grid.visible) {
    return null;
  }

  return (
    <>
      <Grid
        args={[1, 1]}
        cellSize={grid.cellSize}
        cellThickness={0.5}
        cellColor="#2b3440"
        sectionSize={grid.sectionSize}
        sectionThickness={1}
        sectionColor="#3b82f6"
        fadeDistance={fadeDistance}
        fadeStrength={fadeStrength}
        infiniteGrid
        followCamera={false}
        side={DoubleSide}
      />
      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewport
          axisColors={['#ef4444', '#22c55e', '#3b82f6']}
          labelColor="#e6e9ef"
        />
      </GizmoHelper>
    </>
  );
}
