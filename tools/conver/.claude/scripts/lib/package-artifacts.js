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
