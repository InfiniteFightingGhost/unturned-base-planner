/**
 * File import/export (P41) — pure string transformations plus one browser
 * download helper.
 *
 * Exports use a small envelope so a file is self-describing:
 *
 *   { "format": "unturned-base-planner", "schemaVersion": 3,
 *     "exportedAt": "...", "project": { ...serialized Project... } }
 *
 * Imports accept BOTH that envelope and a bare serialized project (as written
 * by older builds), and always route through `parseProject` so old schema
 * versions migrate on the way in.
 */

import { parseProject, serializeProject } from '@/domain';
import type { Project } from '@/domain';

export const PROJECT_FILE_FORMAT = 'unturned-base-planner';
export const PROJECT_FILE_EXTENSION = '.ubp.json';

interface ProjectFileEnvelope {
  readonly format: typeof PROJECT_FILE_FORMAT;
  readonly schemaVersion: number;
  readonly exportedAt: string;
  readonly project: unknown;
}

/** Raised when a text blob is not a readable project file. */
export class ProjectImportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProjectImportError';
  }
}

/** Canonical envelope JSON for a project. */
export function exportProjectFile(project: Project): string {
  const envelope: ProjectFileEnvelope = {
    format: PROJECT_FILE_FORMAT,
    schemaVersion: project.schemaVersion,
    exportedAt: new Date().toISOString(),
    project: JSON.parse(serializeProject(project)) as unknown,
  };
  return JSON.stringify(envelope);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse a project from file text. Accepts an envelope or a bare project and
 * migrates/validates via `parseProject`. Throws `ProjectImportError` on invalid
 * JSON, an unsupported envelope, or a document that fails validation.
 */
export function importProjectFile(text: string): Project {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProjectImportError('Invalid project file: not valid JSON', { cause: error });
  }

  if (!isRecord(parsed)) {
    throw new ProjectImportError('Invalid project file: expected a JSON object');
  }

  if ('format' in parsed) {
    if (parsed.format !== PROJECT_FILE_FORMAT) {
      throw new ProjectImportError(
        `Unsupported project file format: ${String(parsed.format)}`,
      );
    }
    if (!('project' in parsed)) {
      throw new ProjectImportError('Invalid project file: envelope is missing its "project"');
    }
    parsed = parsed.project;
  }

  try {
    return parseProject(parsed);
  } catch (error) {
    throw new ProjectImportError('Invalid project file: failed schema validation', {
      cause: error,
    });
  }
}

/** Slugified `${name}.ubp.json`, falling back to a stable default. */
export function defaultFileName(project: Project): string {
  const slug = project.metadata.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug === '' ? 'unturned-base' : slug}${PROJECT_FILE_EXTENSION}`;
}

/** Trigger a browser download of `text` as `filename` (Blob + anchor). */
export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
