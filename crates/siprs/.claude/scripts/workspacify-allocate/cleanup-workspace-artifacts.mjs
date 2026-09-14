// [::TICKET::] PX-195 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-195 --for-spec --no-implementation-order`.
// PX-195 @verifies C004
/**
 * Mechanical cleanup of the run's intermediate artefacts.
 *
 * Intermediate files are allowed during the run; afterwards the workspace must
 * hold exactly the published set — the directory tree, the seeds and the allocate
 * manifest — plus whatever pre-existed. Cleanup therefore removes only the paths
 * the run itself created, is safe to call twice, and reports the residue so a
 * leftover is visible rather than silent.
 */
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

import { STAGING_PREFIX } from './lib/tree-staging.mjs';
import { ALLOCATE_MANIFEST_FILE_NAME, SEED_FILE_NAME } from './lib/seed-model.mjs';

/** Workspace-root names that are part of the published set. */
const PUBLISHED_ROOT_NAMES = new Set([ALLOCATE_MANIFEST_FILE_NAME, 'WORKSPACIFY-TREE-MANIFEST.json']);

/** Path patterns that are intermediate by construction. */
export const INTERMEDIATE_ARTIFACT_PATTERNS = Object.freeze([
  STAGING_PREFIX,
  '.workspacify-allocate-scratch',
]);

/**
 * Remove the staging root and any stale staging directory.
 *
 * @param {{ workspaceRoot: string, stagingRoot?: string|null }} input
 * @returns {{ removed: string[], residue: string[] }} cleanup report
 */
export function removeWorkspaceArtifacts({ workspaceRoot, stagingRoot }) {
  const removed = [];
  const candidates = new Set();
  if (typeof stagingRoot === 'string' && stagingRoot.length > 0) {
    candidates.add(stagingRoot);
  }
  for (const name of readdirSync(workspaceRoot)) {
    if (INTERMEDIATE_ARTIFACT_PATTERNS.some((pattern) => name.startsWith(pattern))) {
      candidates.add(path.join(workspaceRoot, name));
    }
  }
  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    rmSync(candidate, { recursive: true, force: true });
    removed.push(path.basename(candidate));
  }
  return { removed: removed.sort(), residue: listResidue(workspaceRoot) };
}

/** Whether a workspace-relative path belongs to the published set. */
export function isPublishedArtifact(relativePath) {
  const normalised = relativePath.split(path.sep).join('/');
  const segments = normalised.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return false;
  }
  if (segments.length > 1) {
    return segments[segments.length - 1] === SEED_FILE_NAME && !segments.some((segment) => INTERMEDIATE_ARTIFACT_PATTERNS.some((pattern) => segment.startsWith(pattern)));
  }
  return PUBLISHED_ROOT_NAMES.has(segments[0]);
}

/** The workspace-root entries that remain after cleanup. */
export function listResidue(workspaceRoot) {
  return readdirSync(workspaceRoot).sort();
}

/** Whether the residue is exactly the published set plus pre-existing files. */
export function residueIsPublishedOnly({ workspaceRoot, preexisting = [] }) {
  const allowed = new Set([...PUBLISHED_ROOT_NAMES, ...preexisting]);
  return listResidue(workspaceRoot).every((name) => allowed.has(name) || statSync(path.join(workspaceRoot, name)).isDirectory());
}
