import type { CraftingRecipe, ResourceAmount } from '@/domain';
import { PIECE_RECIPES } from './piece-definitions';

/**
 * Crafting recipes: intermediate resource production plus one recipe per piece
 * definition. Every recipe is attributed to an authoritative unturned.wiki.gg
 * source. Structure recipes encode the DIRECT cost; `expandToRaw` resolves the
 * nested intermediates down to raw materials.
 */

const WIKI = 'https://unturned.wiki.gg/wiki';

function wiki(page: string): string {
  return `${WIKI}/${page.replace(/ /g, '_')}`;
}

function amount(resourceId: string, value: number): ResourceAmount {
  return { resourceId, amount: value };
}

export const INTERMEDIATE_RECIPES: CraftingRecipe[] = [
  { id: 'recipe.plank.birch', output: { itemId: 'plank.birch', amount: 3 }, inputs: [amount('log.birch', 1)], source: wiki('Birch Plank'), tools: [] },
  { id: 'recipe.plank.maple', output: { itemId: 'plank.maple', amount: 3 }, inputs: [amount('log.maple', 1)], source: wiki('Maple Plank'), tools: [] },
  { id: 'recipe.plank.pine', output: { itemId: 'plank.pine', amount: 3 }, inputs: [amount('log.pine', 1)], source: wiki('Pine Plank'), tools: [] },
  { id: 'recipe.stick.birch', output: { itemId: 'stick.birch', amount: 4 }, inputs: [amount('plank.birch', 1)], source: wiki('Birch Stick'), tools: [] },
  { id: 'recipe.stick.maple', output: { itemId: 'stick.maple', amount: 4 }, inputs: [amount('plank.maple', 1)], source: wiki('Maple Stick'), tools: [] },
  { id: 'recipe.stick.pine', output: { itemId: 'stick.pine', amount: 4 }, inputs: [amount('plank.pine', 1)], source: wiki('Pine Stick'), tools: [] },
  { id: 'recipe.metal.bar', output: { itemId: 'metal.bar', amount: 2 }, inputs: [amount('scrap.metal', 1)], source: wiki('Metal Bar'), tools: ['Blowtorch'] },
  { id: 'recipe.metal.sheet', output: { itemId: 'metal.sheet', amount: 1 }, inputs: [amount('scrap.metal', 2)], source: wiki('Metal Sheet'), tools: [] },
  { id: 'recipe.nails', output: { itemId: 'nails', amount: 1 }, inputs: [amount('scrap.metal', 2)], source: wiki('Nails'), tools: [] },
  { id: 'recipe.rope', output: { itemId: 'rope', amount: 1 }, inputs: [amount('cloth', 4)], source: wiki('Rope'), tools: [] },
  { id: 'recipe.tape', output: { itemId: 'tape', amount: 1 }, inputs: [amount('cloth', 4)], source: wiki('Tape'), tools: [] },
  { id: 'recipe.wire', output: { itemId: 'wire', amount: 1 }, inputs: [amount('metal.bar', 3)], source: wiki('Wire'), tools: [] },
  { id: 'recipe.barbed.wire', output: { itemId: 'barbed.wire', amount: 1 }, inputs: [amount('wire', 2)], source: wiki('Barbed Wire'), tools: [] },
];

export const RECIPES: CraftingRecipe[] = [...INTERMEDIATE_RECIPES, ...PIECE_RECIPES];
