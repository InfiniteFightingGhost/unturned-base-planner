import { describe, expect, it } from 'vitest';
import { BoxGeometry, Color, Matrix4, MeshBasicMaterial } from 'three';
import type { BufferGeometry, Material } from 'three';
import { planPiece } from '@/domain';
import type { PieceDefinition, PlacedPiece } from '@/domain';
import { PieceBatch } from '@/engine/rendering/PieceBatch';
import type { BatchGeometry } from '@/engine/rendering/PieceBatch';
import { makeDefinition } from './domain-fixtures';

const FLOOR_ID = 'floor-1';

function assetDefinition(assetId: string): PieceDefinition {
  return makeDefinition({
    id: assetId,
    name: `Asset ${assetId}`,
    model: { assetId },
  });
}

const defA = assetDefinition('asset.a');
const defB = assetDefinition('asset.b');

function piece(def: PieceDefinition, id: string, x = 0, y = 0, z = 0): PlacedPiece {
  return planPiece(def, { id, position: [x, y, z], floorId: FLOOR_ID });
}

function makeBatch(): { batch: PieceBatch; geometries: BufferGeometry[]; material: Material } {
  const boxA = new BoxGeometry(1, 1, 1);
  const boxB = new BoxGeometry(2, 1, 1);
  const entries: BatchGeometry[] = [
    { assetId: 'asset.a', geometry: boxA },
    { assetId: 'asset.b', geometry: boxB },
  ];
  const material = new MeshBasicMaterial({ color: 0xffffff });
  const batch = new PieceBatch(entries, material, { maxInstances: 16 });
  return { batch, geometries: [boxA, boxB], material };
}

describe('PieceBatch', () => {
  it('adds pieces and round-trips batch ids to piece ids', () => {
    const { batch, geometries, material } = makeBatch();
    try {
      const a = piece(defA, 'a', 3, 0, -2);
      batch.add(a);

      expect(batch.instanceCount).toBe(1);
      expect(batch.has('a')).toBe(true);
      expect(batch.pieceIdForBatch(0)).toBe('a');
      expect(batch.pieceIdForBatch(1)).toBeNull();
      expect(batch.pieceIdForBatch(-1)).toBeNull();
    } finally {
      batch.dispose();
      material.dispose();
      for (const geometry of geometries) {
        geometry.dispose();
      }
    }
  });

  it('update writes a new transform into the instance matrix', () => {
    const { batch, geometries, material } = makeBatch();
    try {
      batch.add(piece(defA, 'a', 0, 0, 0));
      batch.update(piece(defA, 'a', 5, 1, 7));

      const matrix = new Matrix4();
      batch.mesh.getMatrixAt(0, matrix);
      expect(matrix.elements[12]).toBeCloseTo(5, 6);
      expect(matrix.elements[13]).toBeCloseTo(1, 6);
      expect(matrix.elements[14]).toBeCloseTo(7, 6);
    } finally {
      batch.dispose();
      material.dispose();
      for (const geometry of geometries) {
        geometry.dispose();
      }
    }
  });

  it('remove frees the instance and slot', () => {
    const { batch, geometries, material } = makeBatch();
    try {
      batch.add(piece(defA, 'a'));
      batch.add(piece(defB, 'b'));
      batch.remove('a');

      expect(batch.has('a')).toBe(false);
      expect(batch.has('b')).toBe(true);
      expect(batch.instanceCount).toBe(1);
      expect(batch.pieceIdForBatch(1)).toBe('b');
    } finally {
      batch.dispose();
      material.dispose();
      for (const geometry of geometries) {
        geometry.dispose();
      }
    }
  });

  it('sync reconciles add, update and remove', () => {
    const { batch, geometries, material } = makeBatch();
    try {
      const a = piece(defA, 'a', 0, 0, 0);
      const b = piece(defB, 'b', 1, 0, 0);
      batch.sync([a, b]);
      expect(batch.has('a')).toBe(true);
      expect(batch.has('b')).toBe(true);

      const movedA = piece(defA, 'a', 9, 0, 9);
      const c = piece(defA, 'c', 2, 0, 0);
      batch.sync([movedA, b, c]);

      expect(batch.has('a')).toBe(true);
      expect(batch.has('c')).toBe(true);
      const matrix = new Matrix4();
      const indexA = 0;
      batch.mesh.getMatrixAt(indexA, matrix);
      expect(matrix.elements[12]).toBeCloseTo(9, 6);

      batch.sync([c]);
      expect(batch.has('a')).toBe(false);
      expect(batch.has('b')).toBe(false);
      expect(batch.has('c')).toBe(true);
      expect(batch.instanceCount).toBe(1);
    } finally {
      batch.dispose();
      material.dispose();
      for (const geometry of geometries) {
        geometry.dispose();
      }
    }
  });

  it('selection tinting does not throw and differs from the base colour', () => {
    const { batch, geometries, material } = makeBatch();
    try {
      batch.add(piece(defA, 'a'));
      const base = new Color();
      batch.mesh.getColorAt(0, base);

      expect(() => batch.setSelection(new Set(['a']), 'replace')).not.toThrow();
      const selected = new Color();
      batch.mesh.getColorAt(0, selected);
      expect(selected.getHex()).not.toBe(base.getHex());

      expect(() => batch.setSelection(new Set(), 'replace')).not.toThrow();
      const restored = new Color();
      batch.mesh.getColorAt(0, restored);
      expect(restored.getHex()).toBe(base.getHex());
    } finally {
      batch.dispose();
      material.dispose();
      for (const geometry of geometries) {
        geometry.dispose();
      }
    }
  });

  it('throws a clear error when the instance budget is exceeded', () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const material = new MeshBasicMaterial();
    const batch = new PieceBatch([{ assetId: 'asset.a', geometry }], material, {
      maxInstances: 1,
    });
    try {
      batch.add(piece(defA, 'a'));
      expect(() => batch.add(piece(defA, 'b'))).toThrow(/capacity/i);
    } finally {
      batch.dispose();
      material.dispose();
      geometry.dispose();
    }
  });
});
