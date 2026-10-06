import { z } from 'zod';

/**
 * Stable string identifiers used for every entity in the document.
 *
 * IDs are opaque non-empty, trimmed strings. Generation prefers the platform
 * `crypto.randomUUID()` and falls back to a deterministic, collision-free
 * counter so that unit tests in jsdom run reproducibly.
 */

export const IdSchema = z.string().trim().min(1);

export type Id = z.infer<typeof IdSchema>;

let fallbackCounter = 0;

function fallbackUuid(): string {
  fallbackCounter += 1;
  const hex = fallbackCounter.toString(16).padStart(12, '0');
  const tail = hex.slice(-12);
  return `00000000-0000-4000-8000-${tail}`;
}

function generateUuid(): string {
  const cryptoApi: Crypto | undefined = globalThis.crypto;
  if (cryptoApi !== undefined && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return fallbackUuid();
}

/**
 * Create a new identifier. When `prefix` is provided the id is namespaced as
 * `prefix_<uuid>` for easier debugging; the id remains a valid `IdSchema` value.
 */
export function createId(prefix?: string): string {
  const uuid = generateUuid();
  return prefix === undefined || prefix === '' ? uuid : `${prefix}_${uuid}`;
}
