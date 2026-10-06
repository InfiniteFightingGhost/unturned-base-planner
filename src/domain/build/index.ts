/**
 * Public API of the pure Unturned structure building engine.
 *
 * The engine mirrors `HousingConnections` from the public U3-SDK: it derives a
 * housing graph from placed pieces, searches/snaps to slots, validates
 * placement, and answers grounding questions. Everything here is deterministic
 * plain data + math with no three.js / React / editor dependency.
 *
 * APPROXIMATIONS vs. the game:
 * - Ground is a flat plane at `GROUND_Y = 0`; the game raycasts terrain.
 * - Collision uses declared piece AABBs; the game queries colliders and actors.
 * - Character/vehicle overlap is not modelled.
 */

export * from './construct';
export * from './vec';
export * from './housingGraph';
export * from './slots';
export * from './support';
export * from './validation';
export * from './ebuild';
export * from './barricades';
