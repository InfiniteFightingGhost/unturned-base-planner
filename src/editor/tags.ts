/**
 * Pure tag normalization.
 *
 * Tags are free-form user labels stored on `piece.metadata.tags`. To keep the
 * document deterministic (and serialization stable) we always trim surrounding
 * whitespace, drop empty results, de-duplicate and store in a stable sorted
 * order. No React, three.js or store dependency: safe to call from the render
 * path, the UI and unit tests.
 */

/**
 * Normalize a tag list: trim each entry, drop empties, de-duplicate, then sort
 * with a locale-independent comparison so the same logical set always produces
 * the same array.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const unique = new Set<string>();
  for (const tag of tags) {
    const trimmed = tag.trim();
    if (trimmed !== '') {
      unique.add(trimmed);
    }
  }
  return [...unique].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Normalize a single candidate tag, returning `null` when it is empty. */
export function normalizeTag(tag: string): string | null {
  const trimmed = tag.trim();
  return trimmed === '' ? null : trimmed;
}
