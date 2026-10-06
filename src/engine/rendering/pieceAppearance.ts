/**
 * Tier appearance: maps a piece definition id to the per-instance tint used by
 * the floor `BatchedMesh`.
 *
 * The material tier is the final dot-delimited segment of the definition id
 * (`wall.birch` -> `birch`, `door.wood.birch` -> `birch`, `fortification.bars.metal`
 * -> `metal`). Pieces without a recognized tier (e.g. `sandbag`) fall back to a
 * neutral CAD grey so the viewport stays readable.
 *
 * Colors are applied per instance through `BatchedMesh.setColorAt`, which lets a
 * single `MeshStandardMaterial` per floor serve every tier. Selection tinting
 * still overrides the instance color entirely.
 */

/** Neutral grey for tier-less pieces and unknown tiers. */
export const NEUTRAL_CAD_COLOR = 0x8f959d;

const TIER_COLORS: Readonly<Record<string, number>> = {
  birch: 0xd9c3a0,
  maple: 0xc08a4a,
  pine: 0x8a5a33,
  brick: 0xa5503c,
  metal: 0x9aa3ad,
};

/** Resolve the tier color for a definition id, defaulting to neutral CAD grey. */
export function tierColorForDefinition(definitionId: string): number {
  const separator = definitionId.lastIndexOf('.');
  const suffix = separator === -1 ? definitionId : definitionId.slice(separator + 1);
  return TIER_COLORS[suffix] ?? NEUTRAL_CAD_COLOR;
}