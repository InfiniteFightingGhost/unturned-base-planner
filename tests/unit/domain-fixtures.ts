import {
  PieceDefinitionSchema,
  planPiece,
  type Command,
  type PieceDefinition,
  type PlacedPiece,
  type Project,
} from '@/domain';

/** Shared test fixtures for the domain layer (not a test file itself). */

export function makeDefinition(overrides: Record<string, unknown> = {}): PieceDefinition {
  return PieceDefinitionSchema.parse({
    id: 'wall_wood',
    name: 'Wood Wall',
    category: 'wall',
    dimensions: { width: 2, height: 3, depth: 0.25 },
    model: { assetId: 'wall_wood_asset' },
    resourceRecipe: 'wood_wall_recipe',
    ...overrides,
  });
}

export function makePiece(def: PieceDefinition, floorId: string, id: string, x = 0): PlacedPiece {
  return planPiece(def, { id, position: [x, 0, 0], floorId });
}

export function addPieceCommand(piece: PlacedPiece): Command {
  return {
    type: 'piece.add',
    label: `Add ${piece.definitionId}`,
    apply(draft: Project): void {
      draft.pieces.push(piece);
    },
  };
}

export function addPiecesCommand(pieces: PlacedPiece[]): Command {
  return {
    type: 'piece.addBatch',
    label: `Add ${pieces.length} pieces`,
    apply(draft: Project): void {
      for (const piece of pieces) {
        draft.pieces.push(piece);
      }
    },
  };
}
