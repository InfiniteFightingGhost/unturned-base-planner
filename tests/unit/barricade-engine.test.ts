import { describe, expect, it } from 'vitest';
import {
  BARRIER_RANGE,
  MAX_PLACEMENT_DISTANCE,
  PieceDefinitionSchema,
  SNAP_STEP,
  barricadeRotation,
  barricadeSlotsForPiece,
  forwardFromYaw,
  planPiece,
  quantizeAngle,
  resolveBuild,
  solveBarricadeAttachment,
  validateBarricadePlacement,
  type PieceDefinition,
  type PlacedPiece,
  type SurfaceHit,
} from '@/domain';

interface DefOptions {
  category?: string;
  build?: string;
  name?: string;
  height?: number;
}

function def(id: string, options: DefOptions = {}): PieceDefinition {
  return PieceDefinitionSchema.parse({
    id,
    name: options.name ?? id,
    category: options.category ?? 'wall',
    dimensions: { width: 2, height: options.height ?? 2, depth: 0.5 },
    model: { assetId: `${id}_asset` },
    resourceRecipe: `${id}_recipe`,
    ...(options.build !== undefined ? { build: options.build } : {}),
  });
}

const WINDOW_DEF = def('window', { category: 'window', height: 2 });
const DOORWAY_DEF = def('doorway', { category: 'doorway' });
const GARAGE_DEF = def('garage', { category: 'wall', name: 'Garage Frame' });
const HOLE_DEF = def('hole', { category: 'floor', name: 'Floor Hatch' });
const WALL_DEF = def('wall', { category: 'wall' });
const FLOOR_DEF = def('floor', { category: 'floor', height: 0.5 });

const DOOR_DEF = def('door', { category: 'door', build: 'DOOR' });
const GATE_DEF = def('gate', { build: 'GATE' });
const HATCH_DEF = def('hatch', { build: 'HATCH' });
const FORT_DEF = def('fort', { build: 'FORTIFICATION' });
const SHUTTER_DEF = def('shutter', { build: 'SHUTTER' });
const GLASS_DEF = def('glass', { build: 'GLASS' });
const TORCH_DEF = def('torch', { build: 'TORCH' });
const LADDER_DEF = def('ladder', { build: 'LADDER' });
const BARRICADE_DEF = def('barricade', { category: 'defensive' });
const FREEFORM_DEF = def('freeform', { build: 'FREEFORM' });

function pieceOf(definition: PieceDefinition, yaw = 0): PlacedPiece {
  return planPiece(definition, {
    id: `${definition.id}-1`,
    position: [0, 0, 0],
    rotation: [0, yaw, 0],
    floorId: 'floor-1',
  });
}

function hit(partial: Partial<SurfaceHit> & Pick<SurfaceHit, 'kind'>): SurfaceHit {
  return {
    point: [0, 0, 0],
    normal: [0, 0, 1],
    ...partial,
  };
}

describe('resolveBuild', () => {
  it('honours an explicit build before the category fallback', () => {
    expect(resolveBuild(FORT_DEF)).toBe('FORTIFICATION');
    expect(resolveBuild(HATCH_DEF)).toBe('HATCH');
  });

  it('falls back from category', () => {
    expect(resolveBuild(DOOR_DEF)).toBe('DOOR');
    expect(resolveBuild(BARRICADE_DEF)).toBe('BARRICADE');
    expect(resolveBuild(def('deco', { category: 'decorative' }))).toBe('FREEFORM');
    expect(resolveBuild(def('fence', { category: 'fence' }))).toBe('WIRE');
    expect(resolveBuild(WALL_DEF)).toBeUndefined();
  });
});

describe('barricadeSlotsForPiece', () => {
  it('exposes front/back window slots at the centre', () => {
    const slots = barricadeSlotsForPiece(pieceOf(WINDOW_DEF), WINDOW_DEF);
    expect(slots).toHaveLength(2);
    expect(slots.every((slot) => slot.kind === 'windowSlot')).toBe(true);
    expect(slots[0]?.position).toEqual([0, 1, 0]);
    expect(slots[0]?.normal).toEqual([0, 0, 1]);
    expect(slots[1]?.normal).toEqual([0, 0, -1]);
    expect(slots[0]?.sourcePieceId).toBe('window-1');
  });

  it('exposes a door slot for doorways', () => {
    const slots = barricadeSlotsForPiece(pieceOf(DOORWAY_DEF), DOORWAY_DEF);
    expect(slots.map((slot) => slot.kind)).toContain('doorSlot');
  });

  it('exposes a gate slot for garage frames', () => {
    const slots = barricadeSlotsForPiece(pieceOf(GARAGE_DEF), GARAGE_DEF);
    expect(slots.map((slot) => slot.kind)).toContain('gateSlot');
  });

  it('exposes a hole slot and climb slot', () => {
    const kinds = barricadeSlotsForPiece(pieceOf(HOLE_DEF), HOLE_DEF).map((slot) => slot.kind);
    expect(kinds).toContain('holeSlot');
    expect(kinds).toContain('climbSlot');
  });

  it('exposes both wall faces and a ground slot', () => {
    const wallKinds = barricadeSlotsForPiece(pieceOf(WALL_DEF), WALL_DEF).map((slot) => slot.kind);
    expect(wallKinds).toEqual(['wall', 'wall']);
    const ground = barricadeSlotsForPiece(pieceOf(FLOOR_DEF), FLOOR_DEF);
    expect(ground[0]?.kind).toBe('ground');
    expect(ground[0]?.normal).toEqual([0, 1, 0]);
  });
});

describe('door / gate / hatch attachment', () => {
  it('places a DOOR into a doorway and returns the slot transform', () => {
    const result = solveBarricadeAttachment(
      DOOR_DEF,
      hit({ kind: 'doorSlot', point: [0, 2, 0], sourceYaw: Math.PI / 2 }),
      0,
    );
    expect(result.result).toBe('Success');
    expect(result.position).toEqual([0, 2, 0]);
    expect(result.rotation?.yaw).toBeCloseTo(Math.PI / 2);
    expect(result.rotation?.pitch).toBe(0);
  });

  it('rejects a DOOR without a doorway', () => {
    expect(validateBarricadePlacement(DOOR_DEF, hit({ kind: 'wall' }), 0)).toBe('InvalidDoor');
  });

  it('places a GATE into a gate slot', () => {
    const result = solveBarricadeAttachment(GATE_DEF, hit({ kind: 'gateSlot', point: [0, 1, 0] }), 0);
    expect(result.result).toBe('Success');
    expect(validateBarricadePlacement(GATE_DEF, hit({ kind: 'ground' }), 0)).toBe('InvalidGate');
  });

  it('places a HATCH into a hole and snaps yaw to a cardinal then +180', () => {
    const result = solveBarricadeAttachment(
      HATCH_DEF,
      hit({ kind: 'holeSlot', point: [0, 0, 0], sourceYaw: 0 }),
      0,
    );
    expect(result.result).toBe('Success');
    expect(result.position).toEqual([0, 0, 0]);
    expect(result.rotation?.yaw).toBeCloseTo(Math.PI);
  });

  it('rejects a HATCH without a hole', () => {
    expect(validateBarricadePlacement(HATCH_DEF, hit({ kind: 'ground' }), 0)).toBe('InvalidHole');
  });
});

describe('window fortifications', () => {
  it.each([FORT_DEF, SHUTTER_DEF, GLASS_DEF])('places $id onto a window slot', (definition) => {
    const result = solveBarricadeAttachment(
      definition,
      hit({ kind: 'windowSlot', point: [0, 1, 0], normal: [0, 0, 1], sourceYaw: 0 }),
      0,
      { offset: 0.25 },
    );
    expect(result.result).toBe('Success');
    expect(result.position).toEqual([0, 1, -0.25]);
  });

  it('rejects a fortification without a window', () => {
    expect(validateBarricadePlacement(FORT_DEF, hit({ kind: 'wall' }), 0)).toBe('InvalidWindow');
  });
});

describe('ladder attachment', () => {
  it('places a LADDER on a vertical wall face and follows the normal', () => {
    const result = solveBarricadeAttachment(
      LADDER_DEF,
      hit({ kind: 'wall', point: [0, 2, 0], normal: [1, 0, 0] }),
      0,
      { offset: 0.1 },
    );
    expect(result.result).toBe('Success');
    expect(result.position).toEqual([0.1, 2, 0]);
    expect(result.rotation?.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('uses a climb slot when present', () => {
    const result = solveBarricadeAttachment(
      LADDER_DEF,
      hit({ kind: 'climbSlot', point: [5, 3, 5], sourceYaw: Math.PI }),
      0,
    );
    expect(result.result).toBe('Success');
    expect(result.position).toEqual([5, 3, 5]);
    expect(result.rotation?.yaw).toBeCloseTo(Math.PI);
  });

  it('reports MissingSlot on flat ground without a climb slot', () => {
    expect(validateBarricadePlacement(LADDER_DEF, hit({ kind: 'ground', normal: [0, 1, 0] }), 0)).toBe(
      'MissingSlot',
    );
  });
});

describe('wall-mounted attachment', () => {
  it('places a TORCH on a vertical face', () => {
    const result = solveBarricadeAttachment(
      TORCH_DEF,
      hit({ kind: 'wall', point: [0, 2, 0], normal: [0, 0, -1] }),
      0,
      { offset: 0.2 },
    );
    expect(result.result).toBe('Success');
    expect(result.position).toEqual([0, 2, -0.2]);
    expect(result.rotation?.yaw).toBeCloseTo(Math.PI);
  });

  it('rejects a TORCH on the ground', () => {
    expect(
      validateBarricadePlacement(TORCH_DEF, hit({ kind: 'ground', normal: [0, 1, 0] }), 0),
    ).toBe('InvalidSurface');
  });
});

describe('ground attachment', () => {
  it('positions a BARRICADE along an upward normal with cursor yaw', () => {
    const cursorYaw = Math.PI / 3;
    const result = solveBarricadeAttachment(
      BARRICADE_DEF,
      hit({ kind: 'ground', point: [1, 0, 2], normal: [0, 1, 0] }),
      cursorYaw,
      { offset: 0.5 },
    );
    expect(result.result).toBe('Success');
    expect(result.position).toEqual([1, 0.5, 2]);
    expect(result.rotation?.yaw).toBeCloseTo(cursorYaw);
  });

  it('falls back to world up for shallow upward normals', () => {
    const result = solveBarricadeAttachment(
      BARRICADE_DEF,
      hit({ kind: 'ground', point: [1, 0, 2], normal: [0.7, 0.5, 0] }),
      0,
      { offset: 0.5 },
    );
    expect(result.result).toBe('Success');
    expect(result.position).toEqual([1, 0.5, 2]);
  });

  it('rejects a downward-facing surface', () => {
    expect(
      validateBarricadePlacement(BARRICADE_DEF, hit({ kind: 'ground', normal: [0, -1, 0] }), 0),
    ).toBe('InvalidSurface');
  });
});

describe('freeform attachment', () => {
  it('accepts any surface, offsets inward and quantizes rotation to 15 degrees', () => {
    const result = solveBarricadeAttachment(
      FREEFORM_DEF,
      hit({ kind: 'wall', point: [0, 0, 0], normal: [0, 0, 1] }),
      0,
      { offset: 0.5, snap: true, angles: { yaw: 0.2 } },
    );
    expect(result.result).toBe('Success');
    const snappedYaw = quantizeAngle(0.2);
    expect(snappedYaw).toBeCloseTo(SNAP_STEP);
    expect(result.rotation?.yaw).toBeCloseTo(snappedYaw);
    expect(result.rotation?.pitch).toBeCloseTo(-Math.PI / 2);
    const forward = forwardFromYaw(snappedYaw);
    expect(result.position?.[0]).toBeCloseTo(forward[0] * 0.5);
    expect(result.position?.[2]).toBeCloseTo(-0.125 + forward[2] * 0.5);
  });
});

describe('barricadeRotation', () => {
  it('has no base pitch for DOOR, GATE, SHUTTER and HATCH', () => {
    for (const build of ['DOOR', 'GATE', 'SHUTTER', 'HATCH'] as const) {
      expect(barricadeRotation(build).pitch).toBe(0);
    }
  });

  it('applies a -PI/2 base pitch to every other build', () => {
    for (const build of ['BARRICADE', 'LADDER', 'FREEFORM', 'TORCH'] as const) {
      expect(barricadeRotation(build).pitch).toBeCloseTo(-Math.PI / 2);
    }
  });
});

describe('range and determinism', () => {
  it('reports OutOfRange beyond the barrier range', () => {
    const result = solveBarricadeAttachment(
      BARRICADE_DEF,
      hit({ kind: 'ground', point: [20, 0, 0], normal: [0, 1, 0] }),
      0,
      { aimPosition: [0, 0, 0] },
    );
    expect(result.result).toBe('OutOfRange');
    expect(BARRIER_RANGE).toBe(MAX_PLACEMENT_DISTANCE);
  });

  it('accepts a placement inside the range', () => {
    const result = solveBarricadeAttachment(
      BARRICADE_DEF,
      hit({ kind: 'ground', point: [10, 0, 0], normal: [0, 1, 0] }),
      0,
      { aimPosition: [0, 0, 0] },
    );
    expect(result.result).toBe('Success');
  });

  it('is deterministic for identical inputs', () => {
    const args: [PieceDefinition, SurfaceHit, number, { offset: number }] = [
      FREEFORM_DEF,
      hit({ kind: 'wall', point: [1, 2, 3], normal: [1, 0, 0] }),
      0.4,
      { offset: 0.3 },
    ];
    expect(solveBarricadeAttachment(...args)).toEqual(solveBarricadeAttachment(...args));
  });
});