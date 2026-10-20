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

export const PACKAGE_DESIGN_FILES = Object.freeze([
  'RFC-SEED.md',
  'RFC.md',
  'DesignTree.json',
  'CheckList.md',
  'Status.json',
  'OBLIGATION.json',
  'SEQUENCES.json',
  'SEQUENCES.md',
]);

const ROOT_DECISION_FILES = Object.freeze([
  'workspacify/tree/DECISIONS.json',
  'workspacify/allocate/DECISIONS.json',
]);

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

/** Create the staging tree for one transaction. */
export function createStaging({ root, candidateSpec, transactionId }) {
  const stagingRoot = stagingRootFor(root, transactionId);
  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true });

  const specPath = liveSpecPath(root);
  copyFileSync(candidateSpec, join(stagingRoot, specPath));

  const copied = [specPath];
  for (const path of ROOT_DECISION_FILES) {
    if (copyIfPresent(join(root, path), join(stagingRoot, path))) copied.push(path);
  }
  for (const name of readdirSync(root)) {
    if (name.endsWith('-sequences.json') || name.endsWith('-sequences.md')) {
      if (copyIfPresent(join(root, name), join(stagingRoot, name))) copied.push(name);
    }
  }
  const educeDirectory = join(root, 'educe-sequences');
  if (existsSync(educeDirectory)) {
    cpSync(educeDirectory, join(stagingRoot, 'educe-sequences'), { recursive: true });
    copied.push('educe-sequences/');
  }
  const tree = readTreeManifest(root);
  for (const pkg of tree?.workspace?.packages ?? []) {
    for (const name of PACKAGE_DESIGN_FILES) {
      const path = `${pkg.path}/${name}`;
      if (copyIfPresent(join(root, path), join(stagingRoot, path))) copied.push(path);
    }
  }
  return { stagingRoot, copied };
}

/** Remove a staging tree. */
export function removeStaging(stagingRoot) {
  rmSync(stagingRoot, { recursive: true, force: true });
}
