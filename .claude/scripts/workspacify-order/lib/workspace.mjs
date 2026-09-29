/**
 * Find the workspace a run belongs to, and read the two manifests it publishes.
 *
 * A workspacify workspace root is the directory holding both manifests. Walking up from the
 * current directory, or from a seed the caller named, keeps the command working from any
 * depth. Two candidates and no candidate both fail: two manifests above one directory is an
 * ambiguity this command cannot settle, and a guessed root would print a plan describing a
 * different workspace than the one on disk.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { WorkspacifyOrderError } from './errors.mjs';

export const TREE_MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
export const ALLOCATE_MANIFEST_FILE_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
export const SEED_FILE_NAME = 'RFC-SEED.md';

/** Every ancestor of `startDirectory`, nearest first, ending at the filesystem root. */
export function ancestorsOf(startDirectory) {
  const ancestors = [];
  let current = resolve(startDirectory);
  for (;;) {
    ancestors.push(current);
    const parent = dirname(current);
    if (parent === current) return ancestors;
    current = parent;
  }
}

// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function holds(candidate, fileName) {
  return existsSync(join(candidate, fileName));
}

/** The one ancestor directory holding both manifests. */
export function resolveWorkspaceRoot(startDirectory) {
  const ancestors = ancestorsOf(startDirectory);
  const complete = ancestors.filter(
    (candidate) => holds(candidate, TREE_MANIFEST_FILE_NAME) && holds(candidate, ALLOCATE_MANIFEST_FILE_NAME),
  );

  if (complete.length > 1) {
    throw new WorkspacifyOrderError(
      `more than one directory above ${startDirectory} holds both manifests: ${complete.join(', ')}`,
      { artefact: TREE_MANIFEST_FILE_NAME },
    );
  }
  if (complete.length === 1) {
    return complete[0];
  }

  const treeOnly = ancestors.find((candidate) => holds(candidate, TREE_MANIFEST_FILE_NAME));
  if (treeOnly !== undefined) {
    throw new WorkspacifyOrderError(
      `${treeOnly} holds ${TREE_MANIFEST_FILE_NAME} but not ${ALLOCATE_MANIFEST_FILE_NAME}, so it is not a workspace root`,
      { artefact: ALLOCATE_MANIFEST_FILE_NAME },
    );
  }
  throw new WorkspacifyOrderError(
    `no ${TREE_MANIFEST_FILE_NAME} is found in any directory above ${startDirectory}`,
    { artefact: TREE_MANIFEST_FILE_NAME },
  );
}

/** Read one manifest, or say which file could not be read or parsed. */
// [::TICKET::] PX-223 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-223 --for-spec --no-implementation-order`.
function readManifest(absolutePath, fileName) {
  let text;
  try {
    text = readFileSync(absolutePath, 'utf8');
  } catch {
    throw new WorkspacifyOrderError(`the ${fileName} cannot be read: ${absolutePath}`, { artefact: fileName });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new WorkspacifyOrderError(`the ${fileName} is not valid JSON: ${absolutePath}`, { artefact: fileName });
  }
}

/**
 * Read the two manifests of a workspace root.
 *
 * @param {string} root — a directory already proven to hold both manifests
 * @returns {{ root: string, treeManifestPath: string, treeManifest: object,
 *   allocateManifestPath: string, allocateManifest: object }}
 */
export function loadWorkspace(root) {
  const treeManifestPath = join(root, TREE_MANIFEST_FILE_NAME);
  const allocateManifestPath = join(root, ALLOCATE_MANIFEST_FILE_NAME);
  return {
    root,
    treeManifestPath,
    treeManifest: readManifest(treeManifestPath, TREE_MANIFEST_FILE_NAME),
    allocateManifestPath,
    allocateManifest: readManifest(allocateManifestPath, ALLOCATE_MANIFEST_FILE_NAME),
  };
}
