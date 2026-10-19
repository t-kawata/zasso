/**
 * Read the workspace a smooth-sequences run judges.
 *
 * The command shares the two-manifest root rule with `workspacify-order`: the root is
 * the directory holding both manifests, and a second candidate is an ambiguity rather
 * than something to guess. What this module adds is the artifact and the per-package
 * views and RFCs, because those are the records the contract checks read.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { resolveWorkspaceRoot as resolveOrderRoot } from '../../workspacify-order/lib/workspace.mjs';
import { SmoothSequencesError } from './errors.mjs';
import { loadRules } from './rules.mjs';

export const TREE_MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
export const ALLOCATE_MANIFEST_FILE_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
export const VIEW_FILE_NAME = 'SEQUENCES.json';
export const RFC_FILE_NAME = 'RFC.md';
export const ARTIFACT_SUFFIX = '-sequences.json';

/** Read one JSON file, or raise the error a caller can repair. */
// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function readJsonFile(filePath, { code, artefact }) {
  if (!existsSync(filePath)) {
    throw new SmoothSequencesError(`${artefact} does not exist: ${filePath}`, {
      code,
      path: filePath,
      repair: `Create the ${artefact} at this path or pass the workspace root that holds it.`,
    });
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new SmoothSequencesError(`${artefact} is not valid JSON: ${filePath}`, {
      code,
      path: filePath,
      repair: `Repair the JSON in ${filePath}: ${error.message}`,
    });
  }
}

/** The single sequences artifact at the workspace root. */
// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
function findArtifactPath(root) {
  const candidates = readdirSync(root)
    .filter((name) => name.endsWith(ARTIFACT_SUFFIX))
    .map((name) => join(root, name));
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) {
    throw new SmoothSequencesError(`no ${ARTIFACT_SUFFIX} file at ${root}`, {
      code: 'NO_ARTIFACT',
      path: root,
      repair: 'Run /educe-sequences for the specification so the artifact sits beside the manifests.',
    });
  }
  throw new SmoothSequencesError(`more than one ${ARTIFACT_SUFFIX} file at ${root}: ${candidates.join(', ')}`, {
    code: 'AMBIGUOUS_ARTIFACT',
    path: root,
    repair: 'Keep exactly one sequences artifact at the workspace root.',
  });
}

/** The package directory a manifest path names, absolute to the workspace root. */
// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
function packageDirectory(root, packagePath) {
  return isAbsolute(packagePath) ? packagePath : join(root, packagePath);
}

/**
 * Load the workspace the detector judges.
 *
 * @param {string} root — a directory holding both manifests
 * @returns {object} a frozen workspace value
 */
export function loadWorkspace(root) {
  const treeManifest = readJsonFile(join(root, TREE_MANIFEST_FILE_NAME), {
    code: 'UNREADABLE_TREE_MANIFEST',
    artefact: TREE_MANIFEST_FILE_NAME,
  });
  const allocateManifest = readJsonFile(join(root, ALLOCATE_MANIFEST_FILE_NAME), {
    code: 'UNREADABLE_ALLOCATE_MANIFEST',
    artefact: ALLOCATE_MANIFEST_FILE_NAME,
  });
  const artifactPath = findArtifactPath(root);
  const artifact = readJsonFile(artifactPath, { code: 'UNREADABLE_ARTIFACT', artefact: 'sequences artifact' });

  const packages = (treeManifest.workspace?.packages ?? []).map((record) => {
    const directory = packageDirectory(root, record.path);
    const viewPath = join(directory, VIEW_FILE_NAME);
    const rfcPath = join(directory, RFC_FILE_NAME);
    return {
      id: record.id,
      path: record.path,
      directory,
      view: existsSync(viewPath) ? readJsonFile(viewPath, { code: 'UNREADABLE_VIEW', artefact: VIEW_FILE_NAME }) : null,
      rfc: existsSync(rfcPath) ? readFileSync(rfcPath, 'utf8') : null,
    };
  });

  return Object.freeze({
    root,
    artifactPath,
    treeManifest,
    allocateManifest,
    artifact,
    packages,
    rules: loadRules(root),
  });
}

/** Resolve the workspace root above a start directory. */
export function resolveWorkspaceRoot(startDirectory) {
  try {
    return resolveOrderRoot(startDirectory);
  } catch (error) {
    throw new SmoothSequencesError(error.message, {
      code: 'NO_ROOT',
      path: startDirectory,
      repair: 'Pass the workspace root that holds WORKSPACIFY-TREE-MANIFEST.json and WORKSPACIFY-ALLOCATE-MANIFEST.json.',
    });
  }
}

/** The root of a path that may be a file inside the workspace. */
export function startDirectoryFor(argument, currentDirectory = process.cwd()) {
  if (argument === undefined) return currentDirectory;
  const absolute = resolve(argument);
  return existsSync(absolute) && absolute.endsWith('.json') ? dirname(absolute) : absolute;
}
