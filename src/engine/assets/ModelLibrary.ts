/**
 * `ModelLibrary`: an async, cached provider of real Unturned geometry.
 *
 * The editor must never wait on model files. `PieceField` renders proxy
 * geometries immediately and calls `load()` in the background; when the library
 * finishes it notifies its subscribers and the field rebuilds once with the real
 * meshes. Any definition without a model (absent manifest entry, missing file or
 * a parse failure) permanently keeps its proxy — no throw ever escapes.
 *
 * Lifecycle
 * ---------
 * - `load()` fetches the manifest and eagerly imports every *relevant* OBJ. It
 *   is idempotent: concurrent callers share one promise.
 * - `getGeometry(definitionId)` returns the cached geometry or `undefined`, and
 *   kicks off an on-demand load on first use (covering definitions that were not
 *   preloaded). Resolution notifies subscribers.
 * - Files are cached by path and de-duplicated by an in-flight map, so a model
 *   referenced by several definitions is imported once.
 * - `dispose()` releases every owned geometry; late-resolving imports are
 *   discarded rather than leaking.
 *
 * Geometry normalization
 * ----------------------
 * `BatchedMesh` requires every added geometry to share the same attribute set,
 * indexed state and attribute sizes. Proxies are always indexed
 * position/normal/uv buffers, so OBJ output is normalized to match: mesh
 * transforms are baked in, extra attributes are dropped, missing normals/uvs are
 * synthesized and non-indexed buffers are indexed.
 */

import { Float32BufferAttribute, Mesh } from 'three';
import type { BufferGeometry, Group } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { modelManifestCandidates } from '@/data';
import { emptyManifest, loadModelManifest } from './modelManifest';
import type { ModelManifest } from './modelManifest';

/** Minimal surface of `OBJLoader` this library depends on (keeps tests simple). */
export interface ObjLoaderLike {
  loadAsync(url: string): Promise<Group>;
}

export interface ModelLibraryOptions {
  /** Base URL the manifest path is resolved against. Defaults to Vite's. */
  readonly baseUrl?: string;
  /** Factory for the OBJ loader. Defaults to a lazy `three/addons` import. */
  readonly loaderFactory?: () => Promise<ObjLoaderLike>;
  /** Manifest loader override (tests). Defaults to the real fetch-based reader. */
  readonly loadManifest?: () => Promise<ModelManifest>;
  /**
   * Which manifest ids to eagerly import during `load()`. Defaults to all.
   * Lets the field preload only the dataset's models instead of the whole pack.
   */
  readonly isRelevant?: (manifestId: string) => boolean;
  /** Maximum concurrent OBJ imports. Defaults to 8. */
  readonly maxConcurrent?: number;
}

export type ModelLibraryListener = () => void;

const DEFAULT_MAX_CONCURRENT = 8;

async function defaultLoaderFactory(): Promise<ObjLoaderLike> {
  const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
  return new OBJLoader();
}

/** Drop everything but position/normal/uv and guarantee an indexed buffer. */
function preparePart(geometry: BufferGeometry): BufferGeometry {
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') {
      geometry.deleteAttribute(name);
    }
  }
  const position = geometry.getAttribute('position');
  if (position === undefined) {
    return geometry;
  }
  if (geometry.getAttribute('normal') === undefined) {
    geometry.computeVertexNormals();
  }
  if (geometry.getAttribute('uv') === undefined) {
    geometry.setAttribute('uv', new Float32BufferAttribute(new Float32Array(position.count * 2), 2));
  }
  return geometry.index === null ? mergeVertices(geometry) : geometry;
}

/**
 * Flatten an `OBJLoader` group into one batch-compatible geometry. Returns
 * `null` when the file produced no usable vertices.
 */
export function normalizeObjGeometry(group: Group): BufferGeometry | null {
  group.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];
  group.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    const source = object.geometry;
    if (source.getAttribute('position') === undefined) {
      return;
    }
    const clone = source.clone();
    clone.applyMatrix4(object.matrixWorld);
    parts.push(preparePart(clone));
  });

  if (parts.length === 0) {
    return null;
  }

  const first = parts[0];
  if (first === undefined) {
    return null;
  }
  const merged = parts.length === 1 ? first : mergeGeometries(parts, false);
  if (merged === null) {
    for (const part of parts) {
      part.dispose();
    }
    return null;
  }

  if (merged.index === null) {
    return mergeVertices(merged);
  }
  return merged;
}

export class ModelLibrary {
  private manifest: ModelManifest = emptyManifest();
  private loadPromise: Promise<void> | undefined;
  private loaded = false;
  private disposed = false;
  private loader: Promise<ObjLoaderLike> | undefined;

  private readonly geometryByFile = new Map<string, BufferGeometry>();
  private readonly inFlightByFile = new Map<string, Promise<BufferGeometry | null>>();
  private readonly failedFiles = new Set<string>();
  private readonly manifestIdByDefinition = new Map<string, string | undefined>();
  private readonly listeners = new Set<ModelLibraryListener>();

  private readonly baseUrl: string;
  private readonly loaderFactory: () => Promise<ObjLoaderLike>;
  private readonly loadManifest: () => Promise<ModelManifest>;
  private readonly isRelevant: (manifestId: string) => boolean;
  private readonly maxConcurrent: number;

  constructor(options: ModelLibraryOptions = {}) {
    this.baseUrl = options.baseUrl ?? import.meta.env.BASE_URL ?? '/';
    this.loaderFactory = options.loaderFactory ?? defaultLoaderFactory;
    this.loadManifest = options.loadManifest ?? (() => loadModelManifest(this.baseUrl));
    this.isRelevant = options.isRelevant ?? (() => true);
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT);
  }

  /** Whether `load()` has finished (successfully or with fallbacks). */
  get isLoaded(): boolean {
    return this.loaded;
  }

  /** Subscribe to readiness. Returns an unsubscribe function. */
  subscribe(listener: ModelLibraryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Load the manifest and eagerly import every relevant OBJ. Idempotent;
   * resolves once all imports have settled. Never rejects.
   */
  load(): Promise<void> {
    this.loadPromise ??= this.performLoad();
    return this.loadPromise;
  }

  /** Whether a manifest entry exists for the definition (alias-aware). */
  hasModel(definitionId: string): boolean {
    return this.resolveManifestId(definitionId) !== undefined;
  }

  /**
   * The real geometry for a definition, or `undefined` while it is unavailable.
   * On first use starts (or joins) an import; subscribers are notified when it
   * resolves. A missing/parse-failed file is never retried.
   */
  getGeometry(definitionId: string): BufferGeometry | undefined {
    const manifestId = this.resolveManifestId(definitionId);
    if (manifestId === undefined) {
      return undefined;
    }
    const entry = this.manifest.models[manifestId];
    if (entry === undefined) {
      return undefined;
    }
    const cached = this.geometryByFile.get(entry.file);
    if (cached !== undefined) {
      return cached;
    }
    void this.ensureFileLoaded(entry.file);
    return undefined;
  }

  /** Dispose every owned geometry and stop notifying. Idempotent. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const geometry of this.geometryByFile.values()) {
      geometry.dispose();
    }
    this.geometryByFile.clear();
    this.inFlightByFile.clear();
    this.failedFiles.clear();
    this.manifestIdByDefinition.clear();
    this.listeners.clear();
  }

  private async performLoad(): Promise<void> {
    this.manifest = await this.loadManifest();
    // A fresh manifest invalidates any negative lookups cached before it loaded.
    this.manifestIdByDefinition.clear();
    if (this.disposed) {
      this.loaded = true;
      return;
    }
    this.notify();

    const files = new Set<string>();
    for (const [manifestId, entry] of Object.entries(this.manifest.models)) {
      if (this.isRelevant(manifestId)) {
        files.add(entry.file);
      }
    }
    await this.loadFiles([...files]);

    this.loaded = true;
    this.notify();
  }

  private async loadFiles(files: readonly string[]): Promise<void> {
    const queue = [...files];
    const workers: Promise<void>[] = [];
    const workerCount = Math.min(this.maxConcurrent, queue.length);
    for (let index = 0; index < workerCount; index += 1) {
      workers.push(this.drain(queue));
    }
    await Promise.all(workers);
  }

  private async drain(queue: string[]): Promise<void> {
    while (!this.disposed) {
      const file = queue.shift();
      if (file === undefined) {
        return;
      }
      await this.ensureFileLoaded(file);
    }
  }

  private ensureFileLoaded(file: string): Promise<BufferGeometry | null> {
    const cached = this.geometryByFile.get(file);
    if (cached !== undefined) {
      return Promise.resolve(cached);
    }
    if (this.failedFiles.has(file)) {
      return Promise.resolve(null);
    }
    const existing = this.inFlightByFile.get(file);
    if (existing !== undefined) {
      return existing;
    }

    const promise = this.importFile(file)
      .then((geometry): BufferGeometry | null => {
        if (geometry === null) {
          this.failedFiles.add(file);
          return null;
        }
        if (this.disposed) {
          geometry.dispose();
          return null;
        }
        this.geometryByFile.set(file, geometry);
        this.notify();
        return geometry;
      })
      .catch((): BufferGeometry | null => {
        this.failedFiles.add(file);
        return null;
      })
      .finally(() => {
        this.inFlightByFile.delete(file);
      });

    this.inFlightByFile.set(file, promise);
    return promise;
  }

  private async importFile(file: string): Promise<BufferGeometry | null> {
    this.loader ??= this.loaderFactory();
    const loader = await this.loader;
    const group = await loader.loadAsync(this.resolveUrl(file));
    return normalizeObjGeometry(group);
  }

  private resolveUrl(file: string): string {
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    return `${base}${file}`;
  }

  private resolveManifestId(definitionId: string): string | undefined {
    const cached = this.manifestIdByDefinition.get(definitionId);
    if (cached !== undefined) {
      return cached;
    }
    for (const candidate of modelManifestCandidates(definitionId)) {
      if (this.manifest.models[candidate] !== undefined) {
        this.manifestIdByDefinition.set(definitionId, candidate);
        return candidate;
      }
    }
    this.manifestIdByDefinition.set(definitionId, undefined);
    return undefined;
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        // A misbehaving subscriber must never break model loading.
      }
    }
  }
}

let sharedModelLibrary: ModelLibrary | undefined;

/**
 * Process-wide library, created on first use. The optional relevance filter is
 * applied only to the first caller, which is the editor field in practice.
 */
export function getSharedModelLibrary(
  isRelevant?: (manifestId: string) => boolean,
): ModelLibrary {
  if (sharedModelLibrary === undefined) {
    sharedModelLibrary = new ModelLibrary(isRelevant === undefined ? {} : { isRelevant });
  }
  return sharedModelLibrary;
}