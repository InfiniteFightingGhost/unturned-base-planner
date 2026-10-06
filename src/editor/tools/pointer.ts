/**
 * Shared pointer/ray helpers for the R3F interaction controllers.
 *
 * A single module-scope `Raycaster` and `Vector2` are reused so pointer-move
 * handlers never allocate. Values are consumed synchronously by the caller, so
 * sharing scratch state between controllers is safe on the JS main thread.
 */

import { Raycaster, Vector2 } from 'three';
import type { Camera } from 'three';
import type { Vec3 } from '@/domain';
import { rayToGroundPlane } from './groundPlane';

const raycaster = new Raycaster();
const ndcScratch = new Vector2();
const originScratch: [number, number, number] = [0, 0, 0];
const directionScratch: [number, number, number] = [0, 0, 0];

interface ClientPoint {
  readonly clientX: number;
  readonly clientY: number;
}

function toNdc(event: ClientPoint, element: HTMLElement): Vector2 | null {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return null;
  }
  ndcScratch.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  return ndcScratch;
}

/** Normalized device coordinates for a pointer event over `element`. */
export function ndcFromEvent(event: ClientPoint, element: HTMLElement): Vector2 | null {
  return toNdc(event, element);
}

/** World-space hit of the pointer ray on the horizontal plane `y = planeY`. */
export function groundPointFromEvent(
  event: ClientPoint,
  element: HTMLElement,
  camera: Camera,
  planeY = 0,
): Vec3 | null {
  const ndc = toNdc(event, element);
  if (ndc === null) {
    return null;
  }
  raycaster.setFromCamera(ndc, camera);
  const ray = raycaster.ray;
  originScratch[0] = ray.origin.x;
  originScratch[1] = ray.origin.y;
  originScratch[2] = ray.origin.z;
  directionScratch[0] = ray.direction.x;
  directionScratch[1] = ray.direction.y;
  directionScratch[2] = ray.direction.z;
  return rayToGroundPlane(originScratch, directionScratch, planeY);
}

/** Normalized world-space view direction of the pointer ray over `element`. */
export function viewDirectionFromEvent(
  event: ClientPoint,
  element: HTMLElement,
  camera: Camera,
): Vec3 | null {
  const ndc = toNdc(event, element);
  if (ndc === null) {
    return null;
  }
  raycaster.setFromCamera(ndc, camera);
  const direction = raycaster.ray.direction;
  return [direction.x, direction.y, direction.z];
}
