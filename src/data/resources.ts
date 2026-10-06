import type { Resource } from '@/domain';

/**
 * Resource catalog.
 *
 * Data-driven and independently versioned: raw materials plus craftable
 * intermediates. Numeric in-game inventory ids from SDG:
 * Birch Log 37, Maple Log 39, Pine Log 41, Metal Scrap 67, Bricks 74, Cloth 66.
 */

const WIKI = 'https://unturned.wiki.gg/wiki';

function wiki(page: string): string {
  return `${WIKI}/${page.replace(/ /g, '_')}`;
}

export const RAW_RESOURCES: Resource[] = [
  { id: 'log.birch', name: 'Birch Log', isRaw: true, source: wiki('Birch Log') },
  { id: 'log.maple', name: 'Maple Log', isRaw: true, source: wiki('Maple Log') },
  { id: 'log.pine', name: 'Pine Log', isRaw: true, source: wiki('Pine Log') },
  { id: 'scrap.metal', name: 'Metal Scrap', isRaw: true, source: wiki('Metal Scrap') },
  { id: 'brick', name: 'Bricks', isRaw: true, source: wiki('Bricks') },
  { id: 'cloth', name: 'Cloth', isRaw: true, source: wiki('Cloth') },
];

export const INTERMEDIATE_RESOURCES: Resource[] = [
  { id: 'plank.birch', name: 'Birch Plank', isRaw: false, source: wiki('Birch Plank') },
  { id: 'plank.maple', name: 'Maple Plank', isRaw: false, source: wiki('Maple Plank') },
  { id: 'plank.pine', name: 'Pine Plank', isRaw: false, source: wiki('Pine Plank') },
  { id: 'stick.birch', name: 'Birch Stick', isRaw: false, source: wiki('Birch Stick') },
  { id: 'stick.maple', name: 'Maple Stick', isRaw: false, source: wiki('Maple Stick') },
  { id: 'stick.pine', name: 'Pine Stick', isRaw: false, source: wiki('Pine Stick') },
  { id: 'metal.bar', name: 'Metal Bar', isRaw: false, source: wiki('Metal Bar') },
  { id: 'metal.sheet', name: 'Metal Sheet', isRaw: false, source: wiki('Metal Sheet') },
  { id: 'nails', name: 'Nails', isRaw: false, source: wiki('Nails') },
  { id: 'rope', name: 'Rope', isRaw: false, source: wiki('Rope') },
  { id: 'tape', name: 'Tape', isRaw: false, source: wiki('Tape') },
  { id: 'wire', name: 'Wire', isRaw: false, source: wiki('Wire') },
  { id: 'barbed.wire', name: 'Barbed Wire', isRaw: false, source: wiki('Barbed Wire') },
];

export const RESOURCES: Resource[] = [...RAW_RESOURCES, ...INTERMEDIATE_RESOURCES];
