/**
 * Find the workspace a run belongs to, and read the two manifests it publishes.
 *
 * A workspacify workspace root is the directory holding both manifests. Walking up from the
 * current directory, or from a seed the caller named, keeps the command working from any
 * depth. Two candidates and no candidate both fail: two manifests above one directory is an
 * ambiguity this command cannot settle, and a guessed root would print a plan describing a
 * different workspace than the one on disk.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { WorkspacifyOrderError } from './errors.mjs';
import { readDistributionMap } from '../../rfc-graph/lib/unit-ids.mjs';

export const TREE_MANIFEST_FILE_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';
export const ALLOCATE_MANIFEST_FILE_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';
export const SEED_FILE_NAME = 'RFC-SEED.md';

/**
 * The artifact-derived implementation order written after the distribution exists.
 *
 * The stage-1 DAG order cannot see sequences and boundary contracts; this sidecar records
 * the order that does. Its absence means the build order is the only order available, not
 * that the build order is the implementation order.
 */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
export const IMPLEMENTATION_ORDER_FILE_NAME = 'WORKSPACIFY-IMPLEMENTATION-ORDER.json';

/** The root sequences artifact, or null when there is none or more than one. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
export function findRootArtifact(root) {
  let entries;
  try {
    entries = readdirSync(root);
  } catch {
    return null;
  }
  const candidates = entries.filter((name) => name.endsWith('-sequences.json'));
  return candidates.length === 1 ? join(root, candidates[0]) : null;
}

/** One package's projected view, or null when it is absent or unreadable. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
export function loadPackageView(root, packagePath) {
  const path = join(root, packagePath, 'SEQUENCES.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** The operation roles the package ledger declares, or an empty map. */
// [::TICKET::] PX-325 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-325 --for-spec --no-implementation-order`.
export function loadPackageRoles({ root, packagePath }) {
  const roles = new Map();
  const rfcPath = join(root, packagePath, RFC_FILE_NAME);
  if (!existsSync(rfcPath)) return roles;
  try {
    const map = readDistributionMap(readFileSync(rfcPath, 'utf8'));
    for (const unit of map?.units ?? []) {
      if (unit?.role === 'implementer' || unit?.role === 'consumer') roles.set(unit.unitId, unit.role);
    }
  } catch {
    return roles;
  }
  return roles;
}

/** Read the implementation-order sidecar, or null when it is absent or unreadable. */
// [::TICKET::] PX-323 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-323 --for-spec --no-implementation-order`.
export function loadImplementationOrder(root) {
  const path = join(root, IMPLEMENTATION_ORDER_FILE_NAME);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The explanation document `explain-seed` writes beside a package's seed.
 *
 * Declared here rather than imported from explain-seed/lib/frame.mjs: that module pulls in
 * the digest, marker, item and render machinery for the sake of one string, and this tool
 * family already declares its own file names rather than reaching across scripts.
 */
// [::TICKET::] PX-228 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-228 --for-spec --no-implementation-order`.
export const EXPLAIN_FILE_NAME = 'EXPLAIN-RFC-SEED.md';

/**
 * The design document a grill session writes.
 *
 * `grill-me-for-rfc/init.js` takes an rfc directory and always writes `<rfc-dir>/RFC.md`,
 * and the seed it grills is the one in that same directory, so this document sits beside
 * the seed rather than in a directory of its own. Declared here for the same reason as the
 * explanation file name above: one string is not worth reaching across scripts for.
 */
export const RFC_FILE_NAME = 'RFC.md';

/** The graph `/graphify-rfc` writes beside its source document. */
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
export const GRAPH_ARTIFACT_SUFFIX = '-GRAPH.json';

/** The directory tree `/boundify-graph` writes beside the graph. */
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
export const DIRS_TREE_ARTIFACT_SUFFIX = '-Dirs-Tree.json';

/** The ticket file `/split-to-tickets` writes in the design directory. */
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
export const TICKETS_FILE_NAME = 'Tickets.json';

/** The stem every artifact is named after: the design document without its extension. */
const RFC_STEM = RFC_FILE_NAME.replace(/\.md$/, '');

/** The entries of a directory, or none when it cannot be read. */
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function entriesOf(directory) {
  try {
    return readdirSync(directory);
  } catch {
    return [];
  }
}

/** Whether either artifact a graph stage writes exists for this stem. */
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
function carriesStageArtifact(directory, stem) {
  return existsSync(join(directory, `${stem}${GRAPH_ARTIFACT_SUFFIX}`))
    || existsSync(join(directory, `${stem}${DIRS_TREE_ARTIFACT_SUFFIX}`));
}

/**
 * The stem the stage artifacts are named after.
 *
 * The design document is written as `RFC.md`, so its stem is the rule. A directory whose
 * artifacts were produced from another document answers that single stem; two candidates
 * are an ambiguity this display does not settle, so it answers null and shows no mark.
 */
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
export function artifactStem({ root, packagePath }) {
  const directory = join(root, packagePath);
  if (carriesStageArtifact(directory, RFC_STEM)) return RFC_STEM;
  const stems = [...new Set(entriesOf(directory)
    .filter((name) => name.endsWith(GRAPH_ARTIFACT_SUFFIX))
    .map((name) => name.slice(0, -GRAPH_ARTIFACT_SUFFIX.length))
    .filter((stem) => stem.length > 0))];
  return stems.length === 1 ? stems[0] : null;
}

/** Whether the package carries the graph `/graphify-rfc` wrote. */
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
export function holdsGraphArtifact({ root, packagePath }) {
  const stem = artifactStem({ root, packagePath });
  return stem !== null && holds(join(root, packagePath), `${stem}${GRAPH_ARTIFACT_SUFFIX}`);
}

/** Whether the package carries the directory tree `/boundify-graph` wrote. */
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
export function holdsBoundifyArtifact({ root, packagePath }) {
  const stem = artifactStem({ root, packagePath });
  return stem !== null && holds(join(root, packagePath), `${stem}${DIRS_TREE_ARTIFACT_SUFFIX}`);
}

/** Whether the package carries the ticket file `/split-to-tickets` wrote. */
// [::TICKET::] PX-309 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-309 --for-spec --no-implementation-order`.
export function holdsSplitArtifact({ root, packagePath }) {
  return holds(join(root, packagePath), TICKETS_FILE_NAME);
}

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

/**
 * Whether a package directory already carries its explanation document.
 *
 * Existence is the whole rule: the document is never opened, so a zero-byte or half-written
 * explanation counts as present, and a directory that cannot be read answers false rather
 * than failing a plan that is only meant to describe the workspace.
 */
// [::TICKET::] PX-228 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-228 --for-spec --no-implementation-order`.
export function holdsExplanation({ root, packagePath }) {
  return holds(join(root, packagePath), EXPLAIN_FILE_NAME);
}

/**
 * Whether a package directory already carries the design document a grill session writes.
 *
 * The rule is the one `holdsExplanation` follows: existence is the whole thing, so the file
 * is never opened and a directory that cannot be read answers false rather than failing a
 * plan that is only meant to describe the workspace. The two documents are probed apart
 * because neither implies the other — a grill session accepts a directory whose seed was
 * never explained, and a hand-written RFC.md can precede any session at all.
 */
export function holdsRfc({ root, packagePath }) {
  return holds(join(root, packagePath), RFC_FILE_NAME);
}

/** The one ancestor directory holding both manifests. */
export function resolveWorkspaceRoot(startDirectory) {
// [::TICKET::] PX-269 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-269 --for-spec --no-implementation-order`.
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
