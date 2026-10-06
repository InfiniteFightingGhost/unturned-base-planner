/**
 * `MeasurementController`: ground-plane two-click measurement tool (P24).
 *
 * Active only while the tool store reports `activeTool === 'measure'`. Each left
 * click raycasts the active floor's ground plane and stores a point; the second
 * point commits ONE `measurement.add` command through the editor store, so the
 * measurement is undoable. Escape (or switching tools) discards the pending
 * points without mutating the document.
 *
 * The preview segment, point markers and value label are React-rendered because
 * measuring is a low-frequency, modal interaction. Labels use drei `<Html>` so
 * the numeric value stays crisp on screen regardless of camera zoom.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { BufferAttribute, BufferGeometry } from 'three';
import type { Vec3 } from '@/domain';
import { editorStore, computeMeasurement, formatMeasurementValue, floorById } from '@/editor';
import { groundPointFromEvent } from './pointer';
import { useToolStore } from './toolStore';

const PREVIEW_COLOR = '#fbbf24';
const POINT_COLOR = '#f59e0b';
const POINT_RADIUS = 0.08;

/** A two-point preview segment built from a transient geometry. */
function SegmentLine({ from, to, color }: { from: Vec3; to: Vec3; color: string }) {
  const geometry = useMemo(() => {
    const buffer = new BufferGeometry();
    buffer.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([from[0], from[1], from[2], to[0], to[1], to[2]]), 3),
    );
    return buffer;
  }, [from, to]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
}

function PointMarker({ position }: { position: Vec3 }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[POINT_RADIUS, 12, 12]} />
      <meshBasicMaterial color={POINT_COLOR} />
    </mesh>
  );
}

function previewMidpoint(from: Vec3, to: Vec3): Vec3 {
  return [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
}

export function MeasurementController() {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const activeTool = useToolStore((state) => state.activeTool);
  const activeMeasurementKind = useToolStore((state) => state.activeMeasurementKind);

  const [pending, setPending] = useState<Vec3[]>([]);
  const [hover, setHover] = useState<Vec3 | null>(null);
  const pendingRef = useRef<Vec3[]>([]);

  useEffect(() => {
    if (activeTool !== 'measure') {
      return undefined;
    }
    const element = gl.domElement;

    const update = (next: Vec3[]): void => {
      pendingRef.current = next;
      setPending(next);
      invalidate();
    };

    const planeY = (): number => {
      const { project, activeFloorId } = editorStore.getState();
      return floorById(project, activeFloorId)?.elevation ?? 0;
    };

    const onClick = (event: MouseEvent): void => {
      if (event.button !== 0) {
        return;
      }
      const point = groundPointFromEvent(event, element, camera, planeY());
      if (point === null) {
        return;
      }
      const current = pendingRef.current;
      const first = current[0];
      if (first === undefined) {
        update([point]);
        return;
      }
      const kind = useToolStore.getState().activeMeasurementKind;
      editorStore.getState().addMeasurement(kind, [first, point]);
      update([]);
      setHover(null);
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (pendingRef.current.length !== 1) {
        return;
      }
      const point = groundPointFromEvent(event, element, camera, planeY());
      if (point !== null) {
        setHover(point);
        invalidate();
      }
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        update([]);
        setHover(null);
      }
    };

    element.addEventListener('click', onClick);
    element.addEventListener('pointermove', onPointerMove);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      element.removeEventListener('click', onClick);
      element.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown);
      pendingRef.current = [];
      setPending([]);
      setHover(null);
    };
  }, [gl, camera, invalidate, activeTool]);

  if (activeTool !== 'measure') {
    return null;
  }

  const first = pending[0];
  const second = pending[1] ?? (pending.length === 1 ? hover : null) ?? undefined;
  const pair: [Vec3, Vec3] | null =
    first !== undefined && second !== undefined ? [first, second] : null;
  const value = pair !== null ? computeMeasurement(activeMeasurementKind, pair) : null;

  return (
    <group data-testid="measurement-preview">
      {first !== undefined ? <PointMarker position={first} /> : null}
      {pending[1] !== undefined ? <PointMarker position={pending[1]} /> : null}
      {pair !== null && value !== null ? (
        <>
          <SegmentLine from={pair[0]} to={pair[1]} color={PREVIEW_COLOR} />
          <Html position={previewMidpoint(pair[0], pair[1])} center distanceFactor={40}>
            <span className="measurement-label">
              {formatMeasurementValue(activeMeasurementKind, value)}
            </span>
          </Html>
        </>
      ) : null}
    </group>
  );
}
