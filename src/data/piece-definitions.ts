import { DEFAULT_ALLOWED_ROTATIONS } from '@/domain';
import type {
  CraftingRecipe,
  EBuild,
  EConstruct,
  PieceCategory,
  PieceDefinition,
  PieceDimensions,
  ResourceAmount,
} from '@/domain';

/**
 * Piece definitions for every structure and barricade, grouped by material tier.
 *
 * GAME-ACCURATE DIMENSIONS
 * ------------------------
 * The values in `PROXY_DIMENSIONS` are game-accurate approximations derived
 * from the U3-SDK `HousingConnections` constants (`EDGE_LENGTH = 6`,
 * `WALL_HEIGHT = 4.25`, `ROOF_THICKNESS = 0.5`), not extracted asset bounds.
 * They exist so the resolver can hand the renderer a believable box silhouette
 * when no real model is available. Every tier of a piece family shares the same
 * box, because the vanilla meshes share the same structural slot footprint.
 *
 * `width x height x depth`, in metres.
 */
export const PROXY_DIMENSIONS = {
  floor: { width: 6.0, height: 0.5, depth: 6.0 },
  triFloor: { width: 6.0, height: 0.5, depth: 6.0 },
  wall: { width: 6.0, height: 4.25, depth: 0.5 },
  window: { width: 6.0, height: 4.25, depth: 0.5 },
  doorway: { width: 6.0, height: 4.25, depth: 0.5 },
  garage: { width: 6.0, height: 4.25, depth: 0.5 },
  rampWall: { width: 6.0, height: 4.25, depth: 0.5 },
  pillar: { width: 0.5, height: 4.25, depth: 0.5 },
  post: { width: 0.5, height: 2.125, depth: 0.5 },
  ramp: { width: 6.0, height: 4.25, depth: 6.0 },
  stair: { width: 6.0, height: 4.25, depth: 6.0 },
  roof: { width: 6.0, height: 0.5, depth: 6.0 },
  roofVariant: { width: 6.0, height: 0.5, depth: 6.0 },
  hole: { width: 6.0, height: 4.25, depth: 0.5 },
  door: { width: 2.5, height: 2.75, depth: 0.15 },
  doubleDoor: { width: 4.0, height: 3.75, depth: 0.15 },
  hatch: { width: 1.8, height: 0.15, depth: 1.8 },
  shutter: { width: 2.5, height: 2.75, depth: 0.15 },
  fortification: { width: 2.5, height: 2.75, depth: 0.15 },
  rampart: { width: 6.0, height: 1.8, depth: 0.5 },
  barricade: { width: 2.0, height: 1.0, depth: 0.2 },
  sandbag: { width: 1.5, height: 0.75, depth: 1.0 },
  fence: { width: 6.0, height: 1.0, depth: 0.2 },
  ladder: { width: 0.6, height: 4.0, depth: 0.2 },
  spikes: { width: 6.0, height: 0.5, depth: 1.0 },
  crate: { width: 1.5, height: 1.5, depth: 1.5 },
  caltrop: { width: 0.5, height: 0.2, depth: 0.5 },
  doorFrame: { width: 2.5, height: 2.75, depth: 0.15 },
  garageFrame: { width: 4.0, height: 3.75, depth: 0.15 },
} as const satisfies Record<string, PieceDimensions>;

const WIKI = 'https://unturned.wiki.gg/wiki';

function wiki(page: string): string {
  return `${WIKI}/${page.replace(/ /g, '_')}`;
}

function amount(resourceId: string, value: number): ResourceAmount {
  return { resourceId, amount: value };
}

interface WoodTier {
  readonly key: string;
  readonly name: string;
  readonly log: string;
  readonly plank: string;
  readonly stick: string;
}

const WOOD_TIERS: WoodTier[] = [
  { key: 'birch', name: 'Birch', log: 'log.birch', plank: 'plank.birch', stick: 'stick.birch' },
  { key: 'maple', name: 'Maple', log: 'log.maple', plank: 'plank.maple', stick: 'stick.maple' },
  { key: 'pine', name: 'Pine', log: 'log.pine', plank: 'plank.pine', stick: 'stick.pine' },
];

interface StructureSpec {
  readonly key: string;
  readonly name: string;
  readonly category: PieceCategory;
  readonly dimensions: PieceDimensions;
  readonly cost: number;
  readonly outputAmount: number;
  /** Explicit EConstruct for a structure piece. Absent for barricade-style frames. */
  readonly construct?: EConstruct;
  /** Explicit EBuild for a barricade-style frame that lives in a structure tier. */
  readonly build?: EBuild;
}

const WOOD_STRUCTURES: StructureSpec[] = [
  { key: 'floor', name: 'Floor', category: 'floor', dimensions: PROXY_DIMENSIONS.floor, cost: 3, outputAmount: 1, construct: 'FLOOR' },
  { key: 'tri_floor', name: 'Triangular Floor', category: 'floor', dimensions: PROXY_DIMENSIONS.triFloor, cost: 2, outputAmount: 1, construct: 'FLOOR_POLY' },
  { key: 'wall', name: 'Wall', category: 'wall', dimensions: PROXY_DIMENSIONS.wall, cost: 3, outputAmount: 1, construct: 'WALL' },
  { key: 'window', name: 'Window', category: 'window', dimensions: PROXY_DIMENSIONS.window, cost: 3, outputAmount: 1, construct: 'WALL' },
  { key: 'doorway', name: 'Doorway', category: 'doorway', dimensions: PROXY_DIMENSIONS.doorway, cost: 3, outputAmount: 1, construct: 'WALL' },
  { key: 'garage', name: 'Garage', category: 'doorway', dimensions: PROXY_DIMENSIONS.garage, cost: 3, outputAmount: 1, construct: 'WALL' },
  { key: 'hole', name: 'Hole', category: 'floor', dimensions: PROXY_DIMENSIONS.hole, cost: 3, outputAmount: 1, construct: 'WALL' },
  { key: 'roof', name: 'Roof', category: 'roof', dimensions: PROXY_DIMENSIONS.roof, cost: 3, outputAmount: 1, construct: 'ROOF' },
  { key: 'tri_roof', name: 'Triangular Roof', category: 'roof_variant', dimensions: PROXY_DIMENSIONS.roofVariant, cost: 2, outputAmount: 1, construct: 'ROOF_POLY' },
  { key: 'ramp', name: 'Ramp', category: 'ramp', dimensions: PROXY_DIMENSIONS.ramp, cost: 3, outputAmount: 1, construct: 'ROOF' },
  { key: 'stairs', name: 'Stairs', category: 'stair', dimensions: PROXY_DIMENSIONS.stair, cost: 3, outputAmount: 1, construct: 'ROOF' },
  { key: 'pillar', name: 'Pillar', category: 'pillar', dimensions: PROXY_DIMENSIONS.pillar, cost: 2, outputAmount: 1, construct: 'PILLAR' },
  { key: 'post', name: 'Post', category: 'post', dimensions: PROXY_DIMENSIONS.post, cost: 2, outputAmount: 2, construct: 'POST' },
  { key: 'rampart', name: 'Rampart', category: 'railing', dimensions: PROXY_DIMENSIONS.rampart, cost: 3, outputAmount: 2, construct: 'RAMPART' },
  { key: 'ramp_wall', name: 'Ramp Wall', category: 'wall', dimensions: PROXY_DIMENSIONS.rampWall, cost: 3, outputAmount: 1, construct: 'WALL' },
];

const METAL_STRUCTURES: StructureSpec[] = [
  { key: 'floor', name: 'Floor', category: 'floor', dimensions: PROXY_DIMENSIONS.floor, cost: 5, outputAmount: 1, construct: 'FLOOR' },
  { key: 'tri_floor', name: 'Triangular Floor', category: 'floor', dimensions: PROXY_DIMENSIONS.triFloor, cost: 3, outputAmount: 1, construct: 'FLOOR_POLY' },
  { key: 'wall', name: 'Wall', category: 'wall', dimensions: PROXY_DIMENSIONS.wall, cost: 5, outputAmount: 1, construct: 'WALL' },
  { key: 'window', name: 'Window', category: 'window', dimensions: PROXY_DIMENSIONS.window, cost: 5, outputAmount: 1, construct: 'WALL' },
  { key: 'doorway', name: 'Doorway', category: 'doorway', dimensions: PROXY_DIMENSIONS.doorway, cost: 5, outputAmount: 1, construct: 'WALL' },
  { key: 'garage', name: 'Garage', category: 'doorway', dimensions: PROXY_DIMENSIONS.garage, cost: 5, outputAmount: 1, construct: 'WALL' },
  { key: 'hole', name: 'Hole', category: 'floor', dimensions: PROXY_DIMENSIONS.hole, cost: 5, outputAmount: 1, construct: 'WALL' },
  { key: 'roof', name: 'Roof', category: 'roof', dimensions: PROXY_DIMENSIONS.roof, cost: 5, outputAmount: 1, construct: 'ROOF' },
  { key: 'tri_roof', name: 'Triangular Roof', category: 'roof_variant', dimensions: PROXY_DIMENSIONS.roofVariant, cost: 3, outputAmount: 1, construct: 'ROOF_POLY' },
  { key: 'ramp', name: 'Ramp', category: 'ramp', dimensions: PROXY_DIMENSIONS.ramp, cost: 5, outputAmount: 1, construct: 'ROOF' },
  { key: 'stairs', name: 'Stairs', category: 'stair', dimensions: PROXY_DIMENSIONS.stair, cost: 5, outputAmount: 1, construct: 'ROOF' },
  { key: 'pillar', name: 'Pillar', category: 'pillar', dimensions: PROXY_DIMENSIONS.pillar, cost: 3, outputAmount: 1, construct: 'PILLAR' },
  { key: 'post', name: 'Post', category: 'post', dimensions: PROXY_DIMENSIONS.post, cost: 3, outputAmount: 2, construct: 'POST' },
  { key: 'rampart', name: 'Rampart', category: 'railing', dimensions: PROXY_DIMENSIONS.rampart, cost: 5, outputAmount: 2, construct: 'RAMPART' },
  { key: 'ramp_wall', name: 'Ramp Wall', category: 'wall', dimensions: PROXY_DIMENSIONS.rampWall, cost: 5, outputAmount: 1, construct: 'WALL' },
];

const BRICK_STRUCTURES: StructureSpec[] = [
  { key: 'wall', name: 'Wall', category: 'wall', dimensions: PROXY_DIMENSIONS.wall, cost: 3, outputAmount: 1, construct: 'WALL' },
  { key: 'window', name: 'Window', category: 'window', dimensions: PROXY_DIMENSIONS.window, cost: 3, outputAmount: 1, construct: 'WALL' },
  { key: 'doorway', name: 'Doorway', category: 'doorway', dimensions: PROXY_DIMENSIONS.doorway, cost: 3, outputAmount: 1, construct: 'WALL' },
  { key: 'garage', name: 'Garage', category: 'doorway', dimensions: PROXY_DIMENSIONS.garage, cost: 3, outputAmount: 1, construct: 'WALL' },
  { key: 'ramp_wall', name: 'Ramp Wall', category: 'wall', dimensions: PROXY_DIMENSIONS.rampWall, cost: 3, outputAmount: 1, construct: 'WALL' },
  { key: 'rampart', name: 'Rampart', category: 'railing', dimensions: PROXY_DIMENSIONS.rampart, cost: 3, outputAmount: 2, construct: 'RAMPART' },
  { key: 'pillar', name: 'Pillar', category: 'pillar', dimensions: PROXY_DIMENSIONS.pillar, cost: 2, outputAmount: 1, construct: 'PILLAR' },
  { key: 'post', name: 'Post', category: 'post', dimensions: PROXY_DIMENSIONS.post, cost: 2, outputAmount: 2, construct: 'POST' },
  { key: 'doorframe', name: 'Doorframe', category: 'doorway', dimensions: PROXY_DIMENSIONS.doorFrame, cost: 2, outputAmount: 1, build: 'FREEFORM' },
  { key: 'garageframe', name: 'Garageframe', category: 'doorway', dimensions: PROXY_DIMENSIONS.garageFrame, cost: 2, outputAmount: 1, build: 'FREEFORM' },
];

type WoodInputKind = 'plank' | 'stick' | 'scrap.metal' | 'tape';

interface WoodBarricadeSpec {
  readonly idBase: string;
  readonly name: string;
  readonly category: PieceCategory;
  readonly dimensions: PieceDimensions;
  readonly assetKey: string;
  readonly outputAmount: number;
  readonly build: EBuild;
  readonly inputs: ReadonlyArray<{ readonly kind: WoodInputKind; readonly amount: number }>;
}

const WOOD_BARRICADES: WoodBarricadeSpec[] = [
  { idBase: 'door.wood', name: 'Wooden Door', category: 'door', dimensions: PROXY_DIMENSIONS.door, assetKey: 'door', outputAmount: 1, build: 'DOOR', inputs: [{ kind: 'plank', amount: 5 }, { kind: 'scrap.metal', amount: 1 }] },
  { idBase: 'doubledoor.wood', name: 'Wooden Double Door', category: 'door', dimensions: PROXY_DIMENSIONS.doubleDoor, assetKey: 'doubledoor', outputAmount: 1, build: 'GATE', inputs: [{ kind: 'plank', amount: 8 }, { kind: 'scrap.metal', amount: 2 }] },
  { idBase: 'gate.wood', name: 'Wooden Gate', category: 'door', dimensions: PROXY_DIMENSIONS.doubleDoor, assetKey: 'gate', outputAmount: 1, build: 'GATE', inputs: [{ kind: 'plank', amount: 8 }, { kind: 'scrap.metal', amount: 2 }] },
  { idBase: 'hatch.wood', name: 'Wooden Hatch', category: 'door', dimensions: PROXY_DIMENSIONS.hatch, assetKey: 'hatch', outputAmount: 1, build: 'HATCH', inputs: [{ kind: 'plank', amount: 4 }, { kind: 'scrap.metal', amount: 1 }] },
  { idBase: 'shutter.wood', name: 'Wooden Shutter', category: 'door', dimensions: PROXY_DIMENSIONS.shutter, assetKey: 'shutter', outputAmount: 1, build: 'SHUTTER', inputs: [{ kind: 'plank', amount: 6 }, { kind: 'scrap.metal', amount: 1 }] },
  { idBase: 'barricade.wood', name: 'Wooden Barricade', category: 'defensive', dimensions: PROXY_DIMENSIONS.barricade, assetKey: 'barricade', outputAmount: 1, build: 'BARRICADE', inputs: [{ kind: 'plank', amount: 4 }, { kind: 'stick', amount: 2 }] },
  { idBase: 'fortification.wood', name: 'Wooden Fortification', category: 'defensive', dimensions: PROXY_DIMENSIONS.fortification, assetKey: 'fortification', outputAmount: 1, build: 'FORTIFICATION', inputs: [{ kind: 'plank', amount: 7 }] },
  { idBase: 'ladder.wood', name: 'Wooden Ladder', category: 'decorative', dimensions: PROXY_DIMENSIONS.ladder, assetKey: 'ladder', outputAmount: 1, build: 'LADDER', inputs: [{ kind: 'stick', amount: 6 }, { kind: 'tape', amount: 1 }] },
  { idBase: 'spikes.wood', name: 'Wooden Spikes', category: 'defensive', dimensions: PROXY_DIMENSIONS.spikes, assetKey: 'spikes', outputAmount: 1, build: 'SPIKE', inputs: [{ kind: 'stick', amount: 6 }] },
  { idBase: 'crate.wood', name: 'Wooden Crate', category: 'decorative', dimensions: PROXY_DIMENSIONS.crate, assetKey: 'crate', outputAmount: 1, build: 'STORAGE', inputs: [{ kind: 'plank', amount: 7 }, { kind: 'stick', amount: 3 }] },
];

interface FixedPieceSpec {
  readonly id: string;
  readonly name: string;
  readonly category: PieceCategory;
  readonly dimensions: PieceDimensions;
  readonly assetKey: string;
  readonly outputAmount: number;
  readonly build: EBuild;
  readonly inputs: ResourceAmount[];
  readonly source: string;
  readonly workstation?: string;
}

const FIXED_PIECES: FixedPieceSpec[] = [
  { id: 'door.metal', name: 'Metal Door', category: 'door', dimensions: PROXY_DIMENSIONS.door, assetKey: 'door', outputAmount: 1, build: 'DOOR', inputs: [amount('metal.sheet', 2), amount('scrap.metal', 1)], source: wiki('Metal Door') },
  { id: 'doubledoor.metal', name: 'Metal Double Door', category: 'door', dimensions: PROXY_DIMENSIONS.doubleDoor, assetKey: 'doubledoor', outputAmount: 1, build: 'GATE', inputs: [amount('metal.sheet', 4), amount('scrap.metal', 1)], source: wiki('Metal Double Door') },
  { id: 'gate.metal', name: 'Metal Gate', category: 'door', dimensions: PROXY_DIMENSIONS.doubleDoor, assetKey: 'gate', outputAmount: 1, build: 'GATE', inputs: [amount('metal.sheet', 4), amount('scrap.metal', 1)], source: wiki('Metal Gate') },
  { id: 'hatch.metal', name: 'Metal Hatch', category: 'door', dimensions: PROXY_DIMENSIONS.hatch, assetKey: 'hatch', outputAmount: 1, build: 'HATCH', inputs: [amount('metal.sheet', 1), amount('scrap.metal', 2)], source: wiki('Metal Hatch') },
  { id: 'shutter.metal', name: 'Metal Shutter', category: 'door', dimensions: PROXY_DIMENSIONS.shutter, assetKey: 'shutter', outputAmount: 1, build: 'SHUTTER', inputs: [amount('metal.sheet', 3), amount('scrap.metal', 1)], source: wiki('Metal Shutter') },
  { id: 'ladder.metal', name: 'Metal Ladder', category: 'decorative', dimensions: PROXY_DIMENSIONS.ladder, assetKey: 'ladder', outputAmount: 1, build: 'LADDER', inputs: [amount('scrap.metal', 6)], source: wiki('Metal Ladder') },
  { id: 'doorframe.metal', name: 'Metal Doorframe', category: 'doorway', dimensions: PROXY_DIMENSIONS.doorFrame, assetKey: 'doorframe', outputAmount: 1, build: 'FREEFORM', inputs: [amount('metal.sheet', 3)], source: wiki('Metal Doorframe') },
  { id: 'garageframe.metal', name: 'Metal Garageframe', category: 'doorway', dimensions: PROXY_DIMENSIONS.garageFrame, assetKey: 'garageframe', outputAmount: 1, build: 'FREEFORM', inputs: [amount('metal.sheet', 3)], source: wiki('Metal Garageframe') },
  { id: 'fortification.bars.metal', name: 'Metal Bars Fortification', category: 'defensive', dimensions: PROXY_DIMENSIONS.fortification, assetKey: 'fortification', outputAmount: 1, build: 'FORTIFICATION', inputs: [amount('metal.bar', 6)], source: wiki('Metal Bars Fortification') },
  { id: 'sandbag', name: 'Sandbag', category: 'defensive', dimensions: PROXY_DIMENSIONS.sandbag, assetKey: 'sandbag', outputAmount: 1, build: 'BARRICADE', inputs: [amount('cloth', 5)], source: wiki('Sandbag') },
  { id: 'fence.barbed.wire', name: 'Barbed Wire Fence', category: 'fence', dimensions: PROXY_DIMENSIONS.fence, assetKey: 'fence', outputAmount: 1, build: 'WIRE', inputs: [amount('scrap.metal', 2), amount('barbed.wire', 5)], source: wiki('Barbed Wire Fence') },
  { id: 'caltrop', name: 'Caltrop', category: 'defensive', dimensions: PROXY_DIMENSIONS.caltrop, assetKey: 'caltrop', outputAmount: 1, build: 'SPIKE', inputs: [amount('nails', 2)], source: wiki('Caltrop') },
];

interface PendingDefinition {
  readonly group: string;
  readonly definition: PieceDefinition;
}

function recipeIdFor(definitionId: string): string {
  return `recipe.${definitionId}`;
}

function makeDefinition(params: {
  id: string;
  name: string;
  category: PieceCategory;
  dimensions: PieceDimensions;
  assetId: string;
  group: string;
  construct?: EConstruct;
  build?: EBuild;
}): PendingDefinition {
  return {
    group: params.group,
    definition: {
      id: params.id,
      name: params.name,
      category: params.category,
      dimensions: { ...params.dimensions },
      model: { assetId: params.assetId, fallback: 'box' },
      variants: [],
      snapPoints: [],
      allowedRotations: [...DEFAULT_ALLOWED_ROTATIONS],
      collision: { enabled: true, shape: 'box' },
      resourceRecipe: recipeIdFor(params.id),
      ...(params.construct !== undefined ? { construct: params.construct } : {}),
      ...(params.build !== undefined ? { build: params.build } : {}),
    },
  };
}

function makeRecipe(params: {
  outputId: string;
  outputAmount: number;
  inputs: ResourceAmount[];
  source: string;
  workstation?: string;
  tools?: string[];
}): CraftingRecipe {
  const recipe: CraftingRecipe = {
    id: recipeIdFor(params.outputId),
    output: { itemId: params.outputId, amount: params.outputAmount },
    inputs: params.inputs,
    source: params.source,
    tools: params.tools ?? [],
  };
  if (params.workstation !== undefined) {
    recipe.workstation = params.workstation;
  }
  return recipe;
}

const pending: PendingDefinition[] = [];
const pieceRecipes: CraftingRecipe[] = [];

function addStructureTier(spec: StructureSpec, id: string, name: string, group: string, inputResourceId: string, source: string, workstation?: string): void {
  pending.push(
    makeDefinition({
      id,
      name,
      category: spec.category,
      dimensions: spec.dimensions,
      assetId: `asset.${spec.key}`,
      group,
      ...(spec.construct !== undefined ? { construct: spec.construct } : {}),
      ...(spec.build !== undefined ? { build: spec.build } : {}),
    }),
  );
  pieceRecipes.push(
    makeRecipe({
      outputId: id,
      outputAmount: spec.outputAmount,
      inputs: [amount(inputResourceId, spec.cost)],
      source,
      ...(workstation !== undefined ? { workstation } : {}),
    }),
  );
}

for (const spec of WOOD_STRUCTURES) {
  for (const tier of WOOD_TIERS) {
    const id = `${spec.key}.${tier.key}`;
    const name = `${tier.name} ${spec.name}`;
    addStructureTier(spec, id, name, `${spec.key}.wood`, tier.log, wiki(name));
  }
}

for (const spec of METAL_STRUCTURES) {
  const id = `${spec.key}.metal`;
  const name = `Metal ${spec.name}`;
  addStructureTier(spec, id, name, `${spec.key}.metal`, 'metal.sheet', wiki(name), 'Simple Workbench');
}

for (const spec of BRICK_STRUCTURES) {
  const id = `${spec.key}.brick`;
  const name = `Brick ${spec.name}`;
  addStructureTier(spec, id, name, `${spec.key}.brick`, 'brick', wiki(name));
}

for (const spec of WOOD_BARRICADES) {
  for (const tier of WOOD_TIERS) {
    const id = `${spec.idBase}.${tier.key}`;
    const name = `${tier.name} ${spec.name}`;
    const inputs = spec.inputs.map((input): ResourceAmount => {
      if (input.kind === 'plank') {
        return amount(tier.plank, input.amount);
      }
      if (input.kind === 'stick') {
        return amount(tier.stick, input.amount);
      }
      return amount(input.kind, input.amount);
    });
    pending.push(
      makeDefinition({
        id,
        name,
        category: spec.category,
        dimensions: spec.dimensions,
        assetId: `asset.${spec.assetKey}`,
        group: spec.idBase,
        build: spec.build,
      }),
    );
    pieceRecipes.push(makeRecipe({ outputId: id, outputAmount: spec.outputAmount, inputs, source: wiki(name) }));
  }
}

for (const spec of FIXED_PIECES) {
  pending.push(
    makeDefinition({
      id: spec.id,
      name: spec.name,
      category: spec.category,
      dimensions: spec.dimensions,
      assetId: `asset.${spec.assetKey}`,
      group: spec.id,
      build: spec.build,
    }),
  );
  pieceRecipes.push(
    makeRecipe({
      outputId: spec.id,
      outputAmount: spec.outputAmount,
      inputs: spec.inputs.map((entry) => ({ ...entry })),
      source: spec.source,
      ...(spec.workstation !== undefined ? { workstation: spec.workstation } : {}),
    }),
  );
}

const groups = new Map<string, PieceDefinition[]>();
for (const entry of pending) {
  const list = groups.get(entry.group);
  if (list === undefined) {
    groups.set(entry.group, [entry.definition]);
  } else {
    list.push(entry.definition);
  }
}

for (const list of groups.values()) {
  if (list.length <= 1) {
    continue;
  }
  for (const definition of list) {
    definition.variants = list
      .filter((sibling) => sibling.id !== definition.id)
      .map((sibling) => ({ id: sibling.id, name: sibling.name, definitionId: sibling.id }));
  }
}

export const PIECE_DEFINITIONS: PieceDefinition[] = pending.map((entry) => entry.definition);
export const PIECE_RECIPES: CraftingRecipe[] = pieceRecipes;
