#!/usr/bin/env node
/* global process, console */
/**
 * Extract authoritative Unturned structure/barricade game data from the local
 * install's `.dat` definitions into `src/data/generated/game-definitions.json`.
 *
 *   node tools/extract_unturned_data.mjs
 *
 * Inputs are the user's own game files; nothing here is redistributed. Resource
 * GUIDs are resolved by scanning every `.dat` under `Items/` and pairing each
 * `GUID` with the sibling `English.dat` `Name`.
 */

import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const DEFAULT_ITEMS =
  '/home/andy/.local/share/Steam/steamapps/common/Unturned/Bundles/Items';
const DEFAULT_OUT = join(REPO_ROOT, 'src', 'data', 'generated', 'game-definitions.json');

const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
}
const ITEMS_DIR = argValue('--items', DEFAULT_ITEMS);
const OUT_PATH = argValue('--out', DEFAULT_OUT);

const FILE_FIELD = /^\uFEFF?\s*([A-Za-z_][A-Za-z0-9_]*)\s+(.*?)\s*$/;

function parseFields(text) {
  const fields = new Map();
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    if (trimmed.startsWith('[') || trimmed.startsWith(']') || trimmed.startsWith('{')) continue;
    const match = FILE_FIELD.exec(line);
    if (!match) continue;
    const key = match[1];
    if (!fields.has(key)) fields.set(key, match[2].trim().replace(/^"|"$/g, ''));
  }
  return fields;
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function englishName(dir) {
  for (const candidate of ['English.dat', 'english.dat']) {
    const text = readText(join(dir, candidate));
    if (text === null) continue;
    const fields = parseFields(text);
    if (fields.has('Name')) return fields.get('Name');
  }
  return null;
}

/** Recursively collect every non-English `.dat` under `root`. */
function collectDatFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.dat')) {
        if (entry.name.toLowerCase() === 'english.dat') continue;
        out.push(full);
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* id mapping (mirrors tools/extract_unturned_models.py)              */
/* ------------------------------------------------------------------ */
function structureId(dirName) {
  const isTri = dirName.endsWith('_Triangle');
  const base = isTri ? dirName.slice(0, -'_Triangle'.length) : dirName;
  const parts = base.split('_');
  const tier = parts.pop().toLowerCase();
  const piece = parts.join('_').toLowerCase();
  return `${piece}.${tier}${isTri ? '.triangle' : ''}`;
}

function barricadeId(dirName) {
  return dirName.toLowerCase().replace(/_/g, '.');
}

/* ------------------------------------------------------------------ */
/* blueprint parsing                                                   */
/* ------------------------------------------------------------------ */
function extractBlock(text, keyword) {
  const keyIndex = text.indexOf(keyword);
  if (keyIndex === -1) return null;
  const open = text.indexOf('[', keyIndex + keyword.length);
  if (open === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

/** Split a blueprints body into top-level `{ ... }` objects. */
function splitBlueprintObjects(body) {
  const objects = [];
  let depth = 0;
  let inString = false;
  let start = -1;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === '{') {
      if (depth === 0) start = i + 1;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        objects.push(body.slice(start, i));
        start = -1;
      }
    }
  }
  return objects;
}

function trailingComment(text, index, window = 80) {
  const slice = text.slice(index, Math.min(text.length, index + window));
  const match = /\/\/\s*([^\]\r\n}]*)/.exec(slice);
  return match ? match[1].trim() : null;
}

function parseRefEntries(valueText) {
  const entries = [];
  const isList = valueText.trimStart().startsWith('[');
  if (isList) {
    const inner = valueText.slice(valueText.indexOf('[') + 1, valueText.lastIndexOf(']'));
    const re = /"([^"]*)"/g;
    let match;
    while ((match = re.exec(inner)) !== null) {
      entries.push({ raw: match[1], comment: trailingComment(inner, match.index + match[0].length) });
    }
  } else {
    const re = /"([^"]*)"/g;
    let match;
    while ((match = re.exec(valueText)) !== null) {
      entries.push({ raw: match[1], comment: trailingComment(valueText, match.index + match[0].length) });
    }
  }
  return entries.map((entry) => {
    const parsed = /([0-9a-fA-F]{32})(?:\s*[xX]\s*(\d+))?/.exec(entry.raw);
    const guid = parsed ? parsed[1].toLowerCase() : entry.raw.trim().toLowerCase();
    const amount = parsed && parsed[2] ? Number.parseInt(parsed[2], 10) : 1;
    return { guid, amount, comment: entry.comment };
  });
}

function parseBlueprints(text, guidName) {
  const body = extractBlock(text, 'Blueprints');
  if (body === null) return [];
  const blueprints = [];
  for (const objectText of splitBlueprintObjects(body)) {
    const inputs = [];
    const inputRe = /InputItems\s+(\[[\s\S]*?\]|"[^"]*")/g;
    let match;
    while ((match = inputRe.exec(objectText)) !== null) {
      for (const ref of parseRefEntries(match[1])) {
        const resolved = guidName.has(ref.guid) ? guidName.get(ref.guid) : null;
        inputs.push({
          guid: ref.guid,
          amount: ref.amount,
          name: resolved ?? ref.comment ?? null,
          resolved: resolved !== null,
        });
      }
    }

    const categoryMatch = /CategoryTag\s+"([0-9a-fA-F]{32})"/.exec(objectText);
    const effectMatch = /Effect\s+"([0-9a-fA-F]{32})"/.exec(objectText);
    const outputMatch = /OutputItems\s+(\[[\s\S]*?\]|this|"[^"]*")/.exec(objectText);

    blueprints.push({
      categoryTag: categoryMatch
        ? {
            guid: categoryMatch[1].toLowerCase(),
            name: guidName.get(categoryMatch[1].toLowerCase()) ?? trailingComment(objectText, categoryMatch.index + categoryMatch[0].length),
          }
        : null,
      inputs,
      outputSelf: outputMatch ? /this/.test(outputMatch[1]) : false,
      effect: effectMatch
        ? {
            guid: effectMatch[1].toLowerCase(),
            name: guidName.get(effectMatch[1].toLowerCase()) ?? trailingComment(objectText, effectMatch.index + effectMatch[0].length),
          }
        : null,
    });
  }
  return blueprints;
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */
function main() {
  if (!statSync(ITEMS_DIR, { throwIfNoEntry: false })) {
    console.error(`items dir not found: ${ITEMS_DIR}`);
    process.exit(2);
  }

  const allDat = collectDatFiles(ITEMS_DIR);
  const guidName = new Map();
  for (const path of allDat) {
    const text = readText(path);
    if (text === null) continue;
    const match = /GUID\s+([0-9a-fA-F]{32})/.exec(text.replace(/^\uFEFF/, ''));
    if (!match) continue;
    const guid = match[1].toLowerCase();
    const name = englishName(dirname(path));
    if (name !== null && !guidName.has(guid)) guidName.set(guid, name);
  }

  const structureDirs = [];
  const barricadeDirs = [];
  for (const entry of readdirSync(ITEMS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'Structures') {
      for (const sub of readdirSync(join(ITEMS_DIR, entry.name), { withFileTypes: true })) {
        if (sub.isDirectory()) structureDirs.push({ name: sub.name, dir: join(ITEMS_DIR, entry.name, sub.name) });
      }
    }
    if (entry.name === 'Barricades') {
      for (const sub of readdirSync(join(ITEMS_DIR, entry.name), { withFileTypes: true })) {
        if (sub.isDirectory()) barricadeDirs.push({ name: sub.name, dir: join(ITEMS_DIR, entry.name, sub.name) });
      }
    }
  }

  const pieces = {};
  const unresolved = new Set();
  let structureCount = 0;
  let barricadeCount = 0;

  const process = (entry, kind) => {
    const datFiles = collectDatFiles(entry.dir).filter((p) => !p.toLowerCase().endsWith('english.dat'));
    if (datFiles.length === 0) return;
    const text = readText(datFiles[0]);
    if (text === null) return;
    const fields = parseFields(text);
    if (!fields.has('GUID') && !fields.has('Type')) return;

    const guid = (fields.get('GUID') ?? '').toLowerCase();
    const id = kind === 'structure' ? structureId(entry.name) : barricadeId(entry.name);
    const blueprints = parseBlueprints(text.replace(/^\uFEFF/, ''), guidName);
    for (const blueprint of blueprints) {
      for (const input of blueprint.inputs) {
        if (!input.resolved) unresolved.add(input.guid);
      }
    }

    const num = (key) => {
      if (!fields.has(key)) return null;
      const value = Number.parseFloat(fields.get(key));
      return Number.isFinite(value) ? value : null;
    };
    const bool = (key) => {
      if (!fields.has(key)) return null;
      return /^true$/i.test(fields.get(key));
    };

    pieces[id] = {
      guid,
      id: num('ID'),
      name: englishName(entry.dir) ?? entry.name,
      type: fields.get('Type') ?? null,
      useable: fields.get('Useable') ?? null,
      ...(fields.has('Construct') ? { construct: fields.get('Construct') } : {}),
      ...(fields.has('Build') ? { build: fields.get('Build') } : {}),
      health: num('Health'),
      range: num('Range'),
      radius: num('Radius'),
      offset: num('Offset'),
      explosion: num('Explosion'),
      requiresPillars: bool('Requires_Pillars'),
      terrainTestHeight: num('Terrain_Test_Height'),
      sizeX: num('Size_X'),
      sizeY: num('Size_Y'),
      sizeZ: num('Size_Z'),
      blueprints,
    };
    if (kind === 'structure') structureCount += 1;
    else barricadeCount += 1;
  };

  for (const entry of structureDirs) process(entry, 'structure');
  for (const entry of barricadeDirs) process(entry, 'barricade');

  const sorted = {};
  for (const key of Object.keys(pieces).sort()) sorted[key] = pieces[key];

  const output = {
    version: 1,
    source: 'local-unturned',
    counts: {
      structures: structureCount,
      barricades: barricadeCount,
      total: structureCount + barricadeCount,
      resolvedGuids: guidName.size,
    },
    unresolvedGuids: [...unresolved].sort(),
    pieces: sorted,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`parsed structures : ${structureCount}`);
  console.log(`parsed barricades : ${barricadeCount}`);
  console.log(`GUID names indexed: ${guidName.size}`);
  console.log(`unresolved GUIDs  : ${unresolved.size}`);
  if (unresolved.size > 0) {
    console.log(`  ${[...unresolved].slice(0, 20).join(', ')}`);
  }
  console.log(`wrote ${OUT_PATH}`);
}

main();
