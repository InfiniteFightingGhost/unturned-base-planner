/**
 * `BlueprintOverlay` (P22/P23): 2D-style outline view for the active floor.
 *
 * When the engine store's `blueprint` flag is on, this renders:
 * - the active floor's pieces as a SINGLE merged `THREE.LineSegments` (one
 *   box-outline buffer, not one object per piece), and
 * - the project's measurements as a second merged `LineSegments` with value
 *   labels.
 *
 * Geoemtry is rebuilt only when `project`, `selection` or `activeFloorId`
 * actually change — never per frame. The rebuild flows through a transient
 * editor-store subscription (mirroring `PieceField`) and calls `invalidate()`
 * once, keeping React out of the hot path. DOM labels (`<Html>`) are emitted
 * only for the current selection, a single floor summary, and each measurement,
 * so a floor with thousands of pieces costs no extra DOM nodes.
 *
 * All created buffers/materials are disposed on unmount.
 */

import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three';
import type { PieceDimensions, Vec3 } from '@/domain';
import { DATASET } from '@/data';
import { editorStore, formatMeasurementValue } from '@/editor';
import type { EditorState } from '@/editor';
import { useEngineStore } from '../store';
import { activeFloorPieces, boxEdgesFor } from './blueprintMath';
import type { Segment } from './blueprintMath';

const OUTLINE_COLOR = 0x5b9dff;
const MEASUREMENT_COLOR = 0xfbbf24;

interface OverlayLabel {
  readonly key: string;
  readonly position: Vec3;
  readonly text: string;
  readonly tone: 'piece' | 'floor' | 'measure';
}

function segmentsToGeometry(segments: readonly Segment[]): BufferGeometry {
  const buffer = new Float32Array(segments.length * 6);
  let index = 0;
  for (const [from, to] of segments) {
    buffer[index] = from[0];
    buffer[index + 1] = from[1];
    buffer[index + 2] = from[2];
    buffer[index + 3] = to[0];
    buffer[index + 4] = to[1];
    buffer[index + 5] = to[2];
    index += 6;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(buffer, 3));
  return geometry;
}

function scaledDimensions(
  dimensions: PieceDimensions,
  scale: readonly [number, number, number],
): PieceDimensions {
  return {
    width: dimensions.width * Math.abs(scale[0]),
    height: dimensions.height * Math.abs(scale[1]),
    depth: dimensions.depth * Math.abs(scale[2]),
  };
}

function centroid(points: readonly Vec3[]): Vec3 | null {
  if (points.length === 0) {
    return null;
  }
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of points) {
    x += point[0];
    y += point[1];
    z += point[2];
  }
  return [x / points.length, y / points.length, z / points.length];
}

export function BlueprintOverlay() {
  const blueprint = useEngineStore((state) => state.blueprint);
  const invalidate = useThree((state) => state.invalidate);

  const outlineMaterial = useMemo(
    () => new LineBasicMaterial({ color: OUTLINE_COLOR }),
    [],
  );
  const measurementMaterial = useMemo(
    () => new LineBasicMaterial({ color: MEASUREMENT_COLOR }),
    [],
  );
  const outline = useMemo(
    () => new LineSegments(new BufferGeometry(), outlineMaterial),
    [outlineMaterial],
  );
  const measurementLines = useMemo(
    () => new LineSegments(new BufferGeometry(), measurementMaterial),
    [measurementMaterial],
  );

  const [labels, setLabels] = useState<OverlayLabel[]>([]);

  useEffect(
    () => () => {
      outline.geometry.dispose();
      outlineMaterial.dispose();
      measurementLines.geometry.dispose();
      measurementMaterial.dispose();
    },
    [outline, measurementLines, outlineMaterial, measurementMaterial],
  );

  useEffect(() => {
    invalidate();
  }, [blueprint, invalidate]);

  useEffect(() => {
    if (!blueprint) {
      return undefined;
    }

    const rebuild = (state: EditorState): void => {
      const { project, selection, activeFloorId } = state;
      const pieces = activeFloorPieces(project.pieces, project.floors, activeFloorId);

      const outlineSegments: Segment[] = [];
      const nextLabels: OverlayLabel[] = [];
      const pieceCenters: Vec3[] = [];
      const selected = new Set(selection);

      for (const piece of pieces) {
        const definition = DATASET.definitionById.get(piece.definitionId);
        if (definition === undefined) {
          continue;
        }
        const dimensions = scaledDimensions(definition.dimensions, piece.scale);
        const center: Vec3 = [
          piece.position[0],
          piece.position[1] + dimensions.height / 2,
          piece.position[2],
        ];
        pieceCenters.push(center);
        outlineSegments.push(...boxEdgesFor(center, dimensions, piece.rotation[1]));
        if (selected.has(piece.id)) {
          nextLabels.push({
            key: `piece-${piece.id}`,
            position: center,
            text: definition.name,
            tone: 'piece',
          });
        }
      }

      const floorCenter = centroid(pieceCenters);
      if (floorCenter !== null) {
        nextLabels.push({
          key: 'floor-summary',
          position: floorCenter,
          text: `${pieces.length} piece${pieces.length === 1 ? '' : 's'}`,
          tone: 'floor',
        });
      }

      const measurementSegments: Segment[] = [];
      for (const measurement of project.measurements) {
        const from = measurement.points[0];
        const to = measurement.points[1];
        if (from === undefined || to === undefined) {
          continue;
        }
        measurementSegments.push([from, to]);
        const position: Vec3 = [
          (from[0] + to[0]) / 2,
          (from[1] + to[1]) / 2,
          (from[2] + to[2]) / 2,
        ];
        nextLabels.push({
          key: `measure-${measurement.id}`,
          position,
          text: formatMeasurementValue(measurement.kind, measurement.value),
          tone: 'measure',
        });
      }

      const nextOutline = segmentsToGeometry(outlineSegments);
      outline.geometry.dispose();
      outline.geometry = nextOutline;

      const nextMeasurements = segmentsToGeometry(measurementSegments);
      measurementLines.geometry.dispose();
      measurementLines.geometry = nextMeasurements;

      setLabels(nextLabels);
    };

    rebuild(editorStore.getState());
    invalidate();

    const unsubscribe = editorStore.subscribe((state, previous) => {
      if (
        state.project === previous.project &&
        state.selection === previous.selection &&
        state.activeFloorId === previous.activeFloorId
      ) {
        return;
      }
      rebuild(state);
      invalidate();
    });

    return () => {
      unsubscribe();
      setLabels([]);
    };
  }, [blueprint, invalidate, outline, measurementLines]);

  if (!blueprint) {
    return null;
  }

  return (
    <group data-testid="blueprint-overlay">
      <primitive object={outline} />
      <primitive object={measurementLines} />
      {labels.map((label) => (
        <Html
          key={label.key}
          position={label.position}
          center
          distanceFactor={40}
          className={`blueprint-label blueprint-label-${label.tone}`}
        >
          {label.text}
        </Html>
      ))}
    </group>
  );
}
