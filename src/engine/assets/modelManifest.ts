/**
 * `modelManifest`: a defensive reader for the extracted Unturned model manifest
 * (`public/models/manifest.json`).
 *
 * The OBJ meshes themselves are git-ignored, so on a machine that never ran the
 * extraction task the manifest may be absent or the directory may 404. Nothing
 * here is allowed to throw: a missing, non-OK or malformed manifest resolves to
 * `emptyManifest()`, which makes every definition fall back to its proxy.
 *
 * The shape is validated by hand (no new dependency): the manifest is trusted
 * only for `version`, `source` and the `models` record; individual malformed
 * entries are dropped rather than poisoning the whole file.
 */

/** Axis-aligned bounds, in metres, with a base-center pivot. */
export interface ModelBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** One extracted mesh: a file path plus the normalization metadata. */
export interface ModelManifestEntry {
  /** Path relative to the site root, e.g. `models/wall.birch.obj`. */
  readonly file: string;
  readonly pivot: string;
  readonly up: string;
  readonly bounds?: ModelBounds;
}

/** The parsed manifest. `models` is keyed by definition id. */
export interface ModelManifest {
  readonly version: number;
  readonly source: string;
  readonly models: Readonly<Record<string, ModelManifestEntry>>;
}

/** The canonical "no models available" manifest. Never throws, always valid. */
export function emptyManifest(): ModelManifest {
  return { version: 0, source: 'empty', models: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseTriple(value: unknown): readonly [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3) {
    return undefined;
  }
  const [x, y, z] = value;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
    return undefined;
  }
  return [x, y, z];
}

function parseBounds(value: unknown): ModelBounds | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const min = parseTriple(value['min']);
  const max = parseTriple(value['max']);
  if (min === undefined || max === undefined) {
    return undefined;
  }
  return { min, max };
}

function parseEntry(value: unknown): ModelManifestEntry | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const file = value['file'];
  if (typeof file !== 'string' || file.trim() === '') {
    return undefined;
  }
  const pivot = typeof value['pivot'] === 'string' ? value['pivot'] : 'base-center';
  const up = typeof value['up'] === 'string' ? value['up'] : 'Y';
  const bounds = parseBounds(value['bounds']);
  return bounds === undefined ? { file, pivot, up } : { file, pivot, up, bounds };
}

/**
 * Validate an already-parsed JSON value. Returns `undefined` when the top-level
 * shape is unusable; malformed individual entries are skipped.
 */
export function parseModelManifest(value: unknown): ModelManifest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const modelsRaw = value['models'];
  if (!isRecord(modelsRaw)) {
    return undefined;
  }

  const models: Record<string, ModelManifestEntry> = {};
  for (const [definitionId, entryRaw] of Object.entries(modelsRaw)) {
    const entry = parseEntry(entryRaw);
    if (entry !== undefined) {
      models[definitionId] = entry;
    }
  }

  const version = isFiniteNumber(value['version']) ? value['version'] : 0;
  const source = typeof value['source'] === 'string' ? value['source'] : 'unknown';
  return { version, source, models };
}

/** Join the site base with the manifest path without doubling slashes. */
function manifestUrl(baseUrl: string): string {
  return `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}models/manifest.json`;
}

/**
 * Fetch and validate the manifest. Resolves to `emptyManifest()` for a missing
 * file, a non-OK response, invalid JSON or an unusable shape. Never rejects.
 */
export async function loadModelManifest(baseUrl?: string): Promise<ModelManifest> {
  const base = baseUrl ?? import.meta.env.BASE_URL ?? '/';
  try {
    const response = await fetch(manifestUrl(base));
    if (!response.ok) {
      return emptyManifest();
    }
    const data: unknown = await response.json();
    return parseModelManifest(data) ?? emptyManifest();
  } catch {
    return emptyManifest();
  }
}