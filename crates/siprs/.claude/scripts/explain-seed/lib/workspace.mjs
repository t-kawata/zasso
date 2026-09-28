/**
 * Resolve the workspace a seed belongs to, and load the three artefacts it names.
 *
 * The workspace root is the directory holding the stage-one manifest, found by walking
 * up from the seed. Walking up rather than counting directory levels keeps the command
 * working for a seed at any depth, and finding more than one candidate is refused rather
 * than resolved by preference: two manifests above one seed is an ambiguity the command
 * cannot settle on the AI's behalf.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { ExplainSeedError } from './errors.mjs';
import { requireField } from './seed-document.mjs';

export const TREE_MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';

/** Every ancestor directory of `startDirectory`, nearest first. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function ancestorsOf(startDirectory) {
  const ancestors = [];
  let current = resolve(startDirectory);
  for (;;) {
    ancestors.push(current);
    const parent = dirname(current);
    if (parent === current) return ancestors;
    current = parent;
  }
}

/** The one directory above the seed that holds a stage-one manifest. */
export function resolveWorkspaceRoot(seedPath) {
  const candidates = ancestorsOf(dirname(resolve(seedPath))).filter((directory) =>
    existsSync(join(directory, TREE_MANIFEST_FILE_NAME)),
  );

  if (candidates.length === 0) {
    throw new ExplainSeedError(
      `no ${TREE_MANIFEST_FILE_NAME} is found in any directory above ${seedPath}`,
      { field: 'stage1_manifest.path' },
    );
  }
  if (candidates.length > 1) {
    throw new ExplainSeedError(
      `${TREE_MANIFEST_FILE_NAME} is found in more than one directory above ${seedPath}: ${candidates.join(', ')}`,
      { field: 'stage1_manifest.path' },
    );
  }
  return candidates[0];
}

/** Read one JSON artefact, or say which path could not be read or parsed. */
// [::TICKET::] PX-221, PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-221|PX-222) --for-spec --no-implementation-order`.
function readJsonArtefact(absolutePath, field) {
  let text;
  try {
    text = readFileSync(absolutePath, 'utf8');
  } catch {
    throw new ExplainSeedError(`the ${field} cannot be read: ${absolutePath}`, { field });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ExplainSeedError(`the ${field} is not valid JSON: ${absolutePath}`, { field });
  }
}

/**
 * Load the workspace the seed names.
 *
 * @param {{ seedPath: string, identity: object }} input
 * @returns {{ root: string, specPath: string, specText: string, specBytes: Buffer,
 *   treeManifestPath: string, treeManifest: object, allocateManifestPath: string,
 *   allocateManifest: object }}
 */
export function loadWorkspace({ seedPath, identity }) {
  const root = resolveWorkspaceRoot(seedPath);
  const specPath = join(root, requireField(identity, 'source_spec.path'));
  const treeManifestPath = join(root, requireField(identity, 'stage1_manifest.path'));
  const allocateManifestPath = join(root, requireField(identity, 'stage2_manifest.path'));

  let specBytes;
  try {
    specBytes = readFileSync(specPath);
  } catch {
    throw new ExplainSeedError(`the specification cannot be read: ${specPath}`, { field: 'source_spec.path' });
  }

  return {
    root,
    specPath,
    specText: specBytes.toString('utf8'),
    specBytes,
    treeManifestPath,
    treeManifest: readJsonArtefact(treeManifestPath, 'stage-one manifest'),
    allocateManifestPath,
    allocateManifest: readJsonArtefact(allocateManifestPath, 'stage-two manifest'),
  };
}
