/**
 * Bridge between OUR piece definition ids and the keys used by the extracted
 * Unturned model manifest (`public/models/manifest.json`).
 *
 * Most definition ids already match a manifest key verbatim (`wall.birch`,
 * `floor.maple`, `door.metal`), but a handful of families were named after the
 * in-game asset rather than our catalogue naming. This module is the single
 * source of truth for those aliases so the renderer never has to know them.
 *
 * It is intentionally pure data: no fetch, no three.js, no engine imports.
 */

/**
 * Ordered list of manifest keys to try for a definition id. The definition id
 * itself is always first; later entries are progressively looser aliases.
 * Callers pick the first candidate that exists in the manifest.
 */
export function modelManifestCandidates(definitionId: string): string[] {
  const candidates: string[] = [definitionId];

  const triangularFloor = /^tri_floor\.(.+)$/.exec(definitionId);
  if (triangularFloor?.[1] !== undefined) {
    candidates.push(`floor.${triangularFloor[1]}.triangle`);
  }

  const triangularRoof = /^tri_roof\.(.+)$/.exec(definitionId);
  if (triangularRoof?.[1] !== undefined) {
    candidates.push(`roof.${triangularRoof[1]}.triangle`);
  }

  const rampWall = /^ramp_wall\.(.+)$/.exec(definitionId);
  if (rampWall?.[1] !== undefined) {
    candidates.push(`wall_ramp.${rampWall[1]}`);
  }

  if (definitionId === 'fortification.bars.metal') {
    candidates.push('fortification.bars');
  }

  if (definitionId === 'fence.barbed.wire') {
    candidates.push('fence.barbedwire');
  }

  // Wood barricades are authored as `<base>.wood.<tier>` while the extracted
  // game meshes are keyed as `<base>.<tier>` (`door.wood.birch` -> `door.birch`).
  const woodBarricade = /^(.+)\.wood\.(.+)$/.exec(definitionId);
  if (woodBarricade?.[1] !== undefined && woodBarricade[2] !== undefined) {
    candidates.push(`${woodBarricade[1]}.${woodBarricade[2]}`);
  }

  return candidates;
}