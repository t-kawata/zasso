/**
 * The staging workspace a thaw derives in.
 *
 * The live workspace is never the place a candidate is built. Staging is a sibling of
 * the live root, on the same filesystem, and holds only the design inputs the producers
 * read: the candidate spec, the decisions, the authored package records and the educe
 * run directory. The old manifests are deliberately absent so a producer publishes
 * fresh instead of refusing an existing target.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { TREE_MANIFEST_FILE_NAME } from './chain.mjs';
import { LEDGER_FILE_NAME, REGENERATION_DIRECTORY } from './ledger.mjs';

export const TREE_DECISIONS_PATH = 'workspacify/tree/DECISIONS.json';
export const ALLOCATE_DECISIONS_PATH = 'workspacify/allocate/DECISIONS.json';
export const ANNOTATIONS_FILE_NAME = 'ANNOTATIONS.json';

export const PACKAGE_DESIGN_FILES = Object.freeze([
  'RFC-SEED.md',
  'RFC.md',
  'DesignTree.json',
  'CheckList.md',
  'Status.json',
  'OBLIGATION.json',
  'INFO-RFC-SEED.md',
  'EXPLAIN-RFC-SEED.md',
  'SEQUENCES.json',
  'SEQUENCES.md',
]);

/**
 * The package documents the derivation does not author.
 *
 * RFC-SEED.md and the package view are written by allocate and sequences-slice, so
 * merging the live copies would overwrite the generation the transaction just derived.
 */
export const PACKAGE_AUTHORED_FILES = Object.freeze([
  'RFC.md',
  'DesignTree.json',
  'CheckList.md',
  'Status.json',
  'OBLIGATION.json',
  'INFO-RFC-SEED.md',
  'EXPLAIN-RFC-SEED.md',
]);

const ROOT_DECISION_FILES = Object.freeze([TREE_DECISIONS_PATH, ALLOCATE_DECISIONS_PATH]);

const SKIPPED_NAMES = new Set(['node_modules', '.git', REGENERATION_DIRECTORY, LEDGER_FILE_NAME, 'SMOOTH-SEQUENCES.json', 'SMOOTH-SEQUENCES.md']);

/** The staging root for one transaction. */
export function stagingRootFor(root, transactionId) {
  return join(`${root}.regeneration`, transactionId);
}

/** The tree manifest, or null. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function readTreeManifest(root) {
  const path = join(root, TREE_MANIFEST_FILE_NAME);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** The spec path recorded by the tree, or spec.md. */
export function liveSpecPath(root) {
  const tree = readTreeManifest(root);
  return tree?.input?.spec_path ?? 'spec.md';
}

/** Every file under a directory, as root-relative POSIX paths. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function walkFiles(root, relative) {
  const directory = join(root, relative);
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return [];
  const files = [];
  for (const name of readdirSync(directory)) {
    if (SKIPPED_NAMES.has(name)) continue;
    const path = relative === '' ? name : `${relative}/${name}`;
    const stat = statSync(join(root, path));
    if (stat.isDirectory()) files.push(...walkFiles(root, path));
    else files.push(path);
  }
  return files;
}

/** Every design file the live workspace carries, as root-relative POSIX paths. */
export function collectDesignFiles(root) {
  const tree = readTreeManifest(root);
  const specPath = liveSpecPath(root);
  const files = new Set();
  if (existsSync(join(root, specPath))) files.add(specPath);
  for (const name of readdirSync(root)) {
    if (name === TREE_MANIFEST_FILE_NAME) files.add(name);
    if (name === 'WORKSPACIFY-ALLOCATE-MANIFEST.json') files.add(name);
    if (name.endsWith('-sequences.json') || name.endsWith('-sequences.md')) files.add(name);
    if (name === 'educe-sequences' && statSync(join(root, name)).isDirectory()) {
      for (const path of walkFiles(root, name)) files.add(path);
    }
  }
  for (const path of ROOT_DECISION_FILES) {
    if (existsSync(join(root, path))) files.add(path);
  }
  for (const pkg of tree?.workspace?.packages ?? []) {
    for (const name of PACKAGE_DESIGN_FILES) {
      const path = `${pkg.path}/${name}`;
      if (existsSync(join(root, path))) files.add(path);
    }
  }
  return [...files].sort();
}

/** A hash map of every design file, for byte-identical assertions. */
export function snapshotDesignFiles(root) {
  const snapshot = {};
  for (const path of collectDesignFiles(root)) {
    snapshot[path] = createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
  }
  return snapshot;
}

/** Copy one file when it exists. */
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
function copyIfPresent(from, to) {
  if (!existsSync(from)) return false;
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  return true;
}

/** Copy a directory when it exists. */
// [::TICKET::] PX-279 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-279 --for-spec --no-implementation-order`.
function copyIfDirectory(from, to) {
  if (!existsSync(from)) return false;
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  return true;
}

/**
 * Create the derivation root for one transaction.
 *
 * Only the frozen inputs and the inherited run state are copied: the specification,
 * the two decisions documents, the artifact and the educe run directory. Package
 * documents are deliberately absent because workspacify-allocate refuses a non-empty
 * planned directory; mergeAuthoredDocuments adds them after allocate publishes.
 *
 * The educe toolchain is copied too. An ad-hoc check beside the specification imports
 * the rail as `../../.claude/scripts/educe-sequences/rail/checks.mjs`, so the staged
 * workspace must carry that path or the check cannot join the run and the checks phase
 * refuses a weakest link nothing answers.
 */
// [::TICKET::] PX-287 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-287 --for-spec --no-implementation-order`.
export function prepareDerivationRoot({ root, candidates, transactionId }) {
  const stagingRoot = stagingRootFor(root, transactionId);
  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true });

  copyFileSync(candidates.specPath, join(stagingRoot, liveSpecPath(root)));
  copyIfPresent(candidates.treeDecisionsPath, join(stagingRoot, TREE_DECISIONS_PATH));
  copyIfPresent(candidates.allocateDecisionsPath, join(stagingRoot, ALLOCATE_DECISIONS_PATH));
  if (candidates.annotationsPath) {
    copyIfPresent(candidates.annotationsPath, join(stagingRoot, ANNOTATIONS_FILE_NAME));
  }

  for (const name of readdirSync(root)) {
    if (name.endsWith('-sequences.json') || name.endsWith('-sequences.md')) {
      copyIfPresent(join(root, name), join(stagingRoot, name));
    }
  }
  copyIfDirectory(join(root, 'educe-sequences'), join(stagingRoot, 'educe-sequences'));
  copyIfDirectory(join(root, '.claude/scripts/educe-sequences'), join(stagingRoot, '.claude/scripts/educe-sequences'));
  return { stagingRoot };
}

/**
 * Add the package documents the derivation does not author.
 *
 * allocate has already published the tree, so its empty-directory gate saw a fresh
 * package set. The authored records are merged before the detector and the views read
 * them; RFC-SEED.md and the package view stay as the producers wrote them.
 */
export function mergeAuthoredDocuments({ root, stagingRoot, treeManifest }) {
  for (const pkg of treeManifest.workspace?.packages ?? []) {
    for (const name of PACKAGE_AUTHORED_FILES) {
      copyIfPresent(join(root, pkg.path, name), join(stagingRoot, pkg.path, name));
    }
  }
}

/** Remove a staging tree. */
export function removeStaging(stagingRoot) {
  rmSync(stagingRoot, { recursive: true, force: true });
}
