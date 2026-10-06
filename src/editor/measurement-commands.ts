/**
 * Command factories for measurements (P24).
 *
 * As with every command factory these are pure: they capture their arguments and
 * mutate only the supplied immer draft. Adding, deleting and clearing
 * measurements each produce a SINGLE history entry, so one undo fully reverses
 * the operation. Measurements are deep-cloned on capture to avoid aliasing live
 * document objects or caller-owned arrays.
 */

import type { Command, Measurement, Project, Vec3 } from '@/domain';

function cloneMeasurement(measurement: Measurement): Measurement {
  return {
    id: measurement.id,
    kind: measurement.kind,
    points: measurement.points.map(
      (point): Vec3 => [point[0], point[1], point[2]],
    ),
    value: measurement.value,
  };
}

/** Add a measurement. Duplicate ids are ignored (idempotent). */
export function createAddMeasurementCommand(measurement: Measurement): Command {
  const snapshot = cloneMeasurement(measurement);
  return {
    type: 'measurement.add',
    label: `Add ${snapshot.kind} measurement`,
    apply(draft: Project): void {
      if (draft.measurements.some((existing) => existing.id === snapshot.id)) {
        return;
      }
      draft.measurements.push(cloneMeasurement(snapshot));
    },
  };
}

/** Remove a measurement by id. Unknown ids are ignored. */
export function createDeleteMeasurementCommand(id: string): Command {
  return {
    type: 'measurement.delete',
    label: 'Delete measurement',
    apply(draft: Project): void {
      draft.measurements = draft.measurements.filter((measurement) => measurement.id !== id);
    },
  };
}

/** Remove every measurement in one history step. */
export function createClearMeasurementsCommand(): Command {
  return {
    type: 'measurement.clear',
    label: 'Clear measurements',
    apply(draft: Project): void {
      draft.measurements = [];
    },
  };
}
