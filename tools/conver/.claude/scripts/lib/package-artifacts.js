/**
 * package-artifacts.js — the artifact names the pipeline fixes.
 *
 * `/graphify-rfc` writes `<RFC>-GRAPH.json`, `/boundify-graph` writes
 * `<RFC>-Dirs-Tree.json`, `/split-to-tickets` writes `Tickets.json` and
 * `<RFC>-SPLIT-Status.json` — all beside the RFC. A script that is handed the
 * RFC (or Tickets.json) therefore already knows every other path; asking the
 * operator to repeat them is a second place to spell the same fact wrong.
 *
 * The `*FromTickets` helpers use the one-package-per-directory convention: a
 * package directory holds exactly one `*-GRAPH.json`, one `*-Dirs-Tree.json` and
 * one `*-SPLIT-Status.json`. Two candidates are refused rather than guessed.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** Suffix of the graph file written by /graphify-rfc. */
const GRAPH_SUFFIX = '-GRAPH.json';

/** Suffix of the Dirs-Tree file written by /boundify-graph. */
const DIRS_TREE_SUFFIX = '-Dirs-Tree.json';

/** Suffix of the split progress file written by /split-to-tickets. */
const SPLIT_STATUS_SUFFIX = '-SPLIT-Status.json';

/** Name of the ticket file written by /split-to-tickets. */
const TICKETS_FILE_NAME = 'Tickets.json';

/** Manifest that marks a workspace root together with the allocate manifest. */
const TREE_MANIFEST_NAME = 'WORKSPACIFY-TREE-MANIFEST.json';

/** Manifest that records the contract registry and the implementation order. */
const ALLOCATE_MANIFEST_NAME = 'WORKSPACIFY-ALLOCATE-MANIFEST.json';

/**
 * The canonical names the pipeline fixes. A caller that reaches a canonical package
 * directory should not have to spell any of these; the resolver derives them.
 */
const CANONICAL_FILE_NAMES = Object.freeze({
  source: 'RFC.md',
  graph: 'RFC-GRAPH.json',
  dirsTree: 'RFC-Dirs-Tree.json',
  tickets: TICKETS_FILE_NAME,
  view: 'SEQUENCES.json',
  boundifyStatus: 'RFC-BOUNDIFY-Status.json',
  splitStatus: 'RFC-SPLIT-Status.json',
  graphifyStatus: 'RFC-GRAPHIFY-Status.json',
});

/** Stage suffix of each step-status file, in the pipeline's spelling. */
const STAGE_STATUS_SUFFIXES = Object.freeze({
  boundify: '-BOUNDIFY-Status.json',
  split: '-SPLIT-Status.json',
  graphify: '-GRAPHIFY-Status.json',
});

/** A named failure the resolver raises; the CLI wrapper prints its three lines. */
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
function canonicalPathError(code, message, remedy) {
  const error = new Error(message);
  error.code = code;
  error.remedy = remedy;
  return error;
}

/** Resolve a directory argument to an absolute path, defaulting to process.cwd(). */
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
function resolveBaseDirectory(cwd) {
  return path.resolve(cwd || process.cwd());
}

/**
 * Resolve one canonical file.
 *
 * Order: an explicit override; the canonical name; the single sibling carrying the
 * suffix. Zero candidates is a named missing error and two are a named ambiguity, so
 * a default never guesses. `allowMissing` returns the derived path for creation
 * flows such as a status file that begin-run is about to write.
 */
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
function resolveCanonicalFile({
  cwd,
  override = null,
  canonicalName,
  suffix,
  kind,
  missingCode,
  ambiguousCode,
  allowMissing = false,
  remedy,
}) {
  const directory = resolveBaseDirectory(cwd);
  if (override) {
    const explicit = path.resolve(directory, override);
    if (!allowMissing && !fs.existsSync(explicit)) {
      throw canonicalPathError(missingCode, kind + ' not found: ' + explicit, remedy);
    }
    return explicit;
  }

  const canonical = path.join(directory, canonicalName);
  if (fs.existsSync(canonical)) return canonical;

  if (suffix) {
    const candidates = fs.existsSync(directory)
      ? fs.readdirSync(directory).filter((name) => name.endsWith(suffix)).sort()
      : [];
    if (candidates.length === 1) return path.join(directory, candidates[0]);
    if (candidates.length > 1) {
      throw canonicalPathError(
        ambiguousCode,
        'multiple ' + suffix + ' candidates in ' + directory + ': ' + candidates.join(', '),
        'Keep exactly one ' + suffix + ' in the package directory, or pass an explicit path.',
      );
    }
  }

  if (allowMissing) return canonical;
  throw canonicalPathError(missingCode, kind + ' not found: ' + canonical, remedy);
}

/** The canonical source document: `RFC.md` in the invocation directory. */
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
function resolveSourcePath({ cwd, override = null, allowMissing = false } = {}) {
  return resolveCanonicalFile({
    cwd,
    override,
    canonicalName: CANONICAL_FILE_NAMES.source,
    suffix: null,
    kind: 'source document',
    missingCode: 'MISSING_SOURCE',
    ambiguousCode: 'AMBIGUOUS_SOURCE',
    allowMissing,
    remedy: 'Run /grill-me-for-rfc in this directory to write ./RFC.md, then re-run.',
  });
}

/** The canonical graph: `RFC-GRAPH.json`, or the single legacy `*-GRAPH.json`. */
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
function resolveGraphPath({ cwd, override = null, allowMissing = false } = {}) {
  return resolveCanonicalFile({
    cwd,
    override,
    canonicalName: CANONICAL_FILE_NAMES.graph,
    suffix: GRAPH_SUFFIX,
    kind: 'graph',
    missingCode: 'MISSING_GRAPH',
    ambiguousCode: 'AMBIGUOUS_GRAPH',
    allowMissing,
    remedy: 'Run /graphify-rfc in this directory to write RFC-GRAPH.json, then re-run.',
  });
}

/** The Dirs-Tree beside the resolved graph. */
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
function resolveDirsTreePath({ cwd, graphPath = null, override = null, allowMissing = false } = {}) {
  const directory = resolveBaseDirectory(cwd);
  if (override) {
    const explicit = path.resolve(directory, override);
    if (!allowMissing && !fs.existsSync(explicit)) {
      throw canonicalPathError('MISSING_DIRS_TREE', 'Dirs-Tree not found: ' + explicit, 'Run /boundify-graph in this directory.');
    }
    return explicit;
  }
  const resolvedGraph = graphPath || resolveGraphPath({ cwd });
  const derived = deriveDirsTreePathFromGraph(resolvedGraph);
  if (!allowMissing && !fs.existsSync(derived)) {
    throw canonicalPathError(
      'MISSING_DIRS_TREE',
      'Dirs-Tree not found: ' + derived,
      'Run /boundify-graph in this directory, then re-run.',
    );
  }
  return derived;
}

/** The ticket ledger: `Tickets.json` in the invocation directory. */
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
function resolveTicketsPath({ cwd, override = null, allowMissing = false } = {}) {
  return resolveCanonicalFile({
    cwd,
    override,
    canonicalName: CANONICAL_FILE_NAMES.tickets,
    suffix: null,
    kind: 'Tickets.json',
    missingCode: 'MISSING_TICKETS',
    ambiguousCode: 'AMBIGUOUS_TICKETS',
    allowMissing,
    remedy: 'Run /split-to-tickets in this directory to write Tickets.json, then re-run.',
  });
}

/** The optional package view: `SEQUENCES.json`. */
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
function resolveViewPath({ cwd, override = null, allowMissing = true } = {}) {
  return resolveCanonicalFile({
    cwd,
    override,
    canonicalName: CANONICAL_FILE_NAMES.view,
    suffix: null,
    kind: 'SEQUENCES.json',
    missingCode: 'MISSING_VIEW',
    ambiguousCode: 'AMBIGUOUS_VIEW',
    allowMissing,
    remedy: 'Run /educe-sequences for this package to write SEQUENCES.json.',
  });
}

/** The step-status file of one stage, derived from the resolved graph stem. */
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
function resolveStageStatusPath(stage, { cwd, graphPath = null, override = null, allowMissing = true } = {}) {
  const suffix = STAGE_STATUS_SUFFIXES[stage];
  if (!suffix) {
    throw new Error('Unknown stage: ' + stage + ' (expected boundify, split or graphify)');
  }
  const directory = resolveBaseDirectory(cwd);
  if (override) {
    const explicit = path.resolve(directory, override);
    if (!allowMissing && !fs.existsSync(explicit)) {
      throw canonicalPathError('MISSING_STATUS', stage + ' status not found: ' + explicit, 'Start the stage again.');
    }
    return explicit;
  }
  const resolvedGraph = graphPath || resolveGraphPath({ cwd });
  const graphName = path.basename(resolvedGraph);
  if (!graphName.endsWith(GRAPH_SUFFIX)) {
    throw new Error('Not a graph file name: ' + resolvedGraph + ' (expected ' + GRAPH_SUFFIX + ')');
  }
  const stem = graphName.slice(0, -GRAPH_SUFFIX.length);
  const derived = path.join(path.dirname(resolvedGraph), stem + suffix);
  if (!allowMissing && !fs.existsSync(derived)) {
    throw canonicalPathError(
      'MISSING_STATUS',
      stage + ' status not found: ' + derived,
      'Start the stage again so begin-run writes the status file.',
    );
  }
  return derived;
}

/** Dispatch by artifact kind, for callers that select the kind dynamically. */
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
function resolveCanonicalPath(kind, options = {}) {
  switch (kind) {
    case 'source': return resolveSourcePath(options);
    case 'graph': return resolveGraphPath(options);
    case 'dirsTree': return resolveDirsTreePath(options);
    case 'tickets': return resolveTicketsPath(options);
    case 'view': return resolveViewPath(options);
    case 'boundifyStatus': return resolveStageStatusPath('boundify', options);
    case 'splitStatus': return resolveStageStatusPath('split', options);
    case 'graphifyStatus': return resolveStageStatusPath('graphify', options);
    default: throw new Error('Unknown canonical artifact kind: ' + kind);
  }
}

/** Report the resolved path once, so an argument-free call remains auditable. */
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
function reportResolvedPath(kind, resolvedPath, { quiet = false } = {}) {
  if (!quiet) process.stderr.write('resolved ' + kind + ': ' + resolvedPath + '\n');
}

/** Resolve or stop with the shared three-line error template. */
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
function resolveCanonicalPathOrExit(kind, options = {}) {
  try {
    const resolved = resolveCanonicalPath(kind, options);
    reportResolvedPath(kind, resolved, options);
    return resolved;
  } catch (error) {
    process.stderr.write('[ERROR] ' + (error.code || 'CANONICAL_PATH') + ': ' + error.message + '\n');
    process.stderr.write('Cause: ' + (error.code || 'CANONICAL_PATH') + ' prevented the canonical path from resolving.\n');
    process.stderr.write('Action: ' + (error.remedy || 'Check the package directory and re-run.') + '\n');
    process.exit(1);
  }
}

/** The RFC basename without its extension, used as the artifact stem. */
function artifactStem(docPath) {
  return path.basename(docPath, path.extname(docPath));
}

/** `<dir of RFC>/<RFC stem>-GRAPH.json`. */
function deriveGraphPathFromDoc(docPath) {
  return path.join(path.dirname(path.resolve(docPath)), artifactStem(docPath) + GRAPH_SUFFIX);
}

/** `<dir of graph>/<graph stem>-Dirs-Tree.json`. */
function deriveDirsTreePathFromGraph(graphPath) {
  const name = path.basename(graphPath);
  if (!name.endsWith(GRAPH_SUFFIX)) {
    throw new Error('Not a graph file name: ' + graphPath + ' (expected ' + GRAPH_SUFFIX + ')');
  }
  return path.join(
    path.dirname(path.resolve(graphPath)),
    name.slice(0, -GRAPH_SUFFIX.length) + DIRS_TREE_SUFFIX,
  );
}

/** `<dir of RFC>/<RFC stem>-Dirs-Tree.json`. */
function deriveDirsTreePathFromDoc(docPath) {
  return deriveDirsTreePathFromGraph(deriveGraphPathFromDoc(docPath));
}

/** `<dir of RFC>/Tickets.json`. */
function deriveTicketsPathFromDoc(docPath) {
  return path.join(path.dirname(path.resolve(docPath)), TICKETS_FILE_NAME);
}

/** `<dir of RFC>/<RFC stem>-SPLIT-Status.json`. */
function deriveStatusPathFromDoc(docPath) {
  return path.join(path.dirname(path.resolve(docPath)), artifactStem(docPath) + SPLIT_STATUS_SUFFIX);
}

/** The single file in a directory whose name ends with the suffix, or null. */
function findSingleSiblingPath(directory, suffix) {
  if (!fs.existsSync(directory)) return null;
  const matches = fs.readdirSync(directory)
    .filter((name) => name.endsWith(suffix))
    .sort();
  return matches.length === 1 ? path.join(directory, matches[0]) : null;
}

/** The only `*-GRAPH.json` beside Tickets.json, or null when absent or ambiguous. */
function deriveGraphPathFromTickets(ticketsPath) {
  return findSingleSiblingPath(path.dirname(path.resolve(ticketsPath)), GRAPH_SUFFIX);
}

/** The only `*-Dirs-Tree.json` beside Tickets.json, or null when absent or ambiguous. */
function deriveDirsTreePathFromTickets(ticketsPath) {
  return findSingleSiblingPath(path.dirname(path.resolve(ticketsPath)), DIRS_TREE_SUFFIX);
}

/** The only `*-SPLIT-Status.json` beside Tickets.json, or null when absent or ambiguous. */
function deriveStatusPathFromTickets(ticketsPath) {
  return findSingleSiblingPath(path.dirname(path.resolve(ticketsPath)), SPLIT_STATUS_SUFFIX);
}

/**
 * The allocate manifest of the workspace that contains the starting directory.
 *
 * The workspace root is the nearest ancestor holding both workspace manifests —
 * the same rule `/explain-seed` states. A directory holding only one of them is
 * not a workspace root.
 *
 * @param {string} startDirectory
 * @returns {string|null}
 */
// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
function findAllocateManifest(startDirectory) {
  let directory = path.resolve(startDirectory);
  if (fs.existsSync(directory) && fs.statSync(directory).isFile()) {
    directory = path.dirname(directory);
  }
  for (;;) {
    const treeManifest = path.join(directory, TREE_MANIFEST_NAME);
    const allocateManifest = path.join(directory, ALLOCATE_MANIFEST_NAME);
    if (fs.existsSync(treeManifest) && fs.existsSync(allocateManifest)) {
      return allocateManifest;
    }
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

module.exports = {
  GRAPH_SUFFIX,
  DIRS_TREE_SUFFIX,
  SPLIT_STATUS_SUFFIX,
  TICKETS_FILE_NAME,
  CANONICAL_FILE_NAMES,
  STAGE_STATUS_SUFFIXES,
  canonicalPathError,
  resolveSourcePath,
  resolveGraphPath,
  resolveDirsTreePath,
  resolveTicketsPath,
  resolveViewPath,
  resolveStageStatusPath,
  resolveCanonicalPath,
  resolveCanonicalPathOrExit,
  reportResolvedPath,
  deriveGraphPathFromDoc,
  deriveDirsTreePathFromDoc,
  deriveDirsTreePathFromGraph,
  deriveTicketsPathFromDoc,
  deriveStatusPathFromDoc,
  findSingleSiblingPath,
  deriveGraphPathFromTickets,
  deriveDirsTreePathFromTickets,
  deriveStatusPathFromTickets,
  findAllocateManifest,
};
