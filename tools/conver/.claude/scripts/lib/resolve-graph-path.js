// [::TICKET::] PX-439 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-439 --for-spec --no-implementation-order`.
'use strict';

/**
 * resolve-graph-path.js — the single locator for a package's GRAPH artifact.
 *
 * /find-omissions takes no graph argument: the graph belongs to the package
 * directory the command runs in. RFC-GRAPH.json is the canonical name; a
 * package that names its graph after its source (RFC-ROOT-GRAPH.json) is
 * accepted when exactly one *-GRAPH.json exists. Two candidates are ambiguous,
 * never a guess, because choosing one silently would hide a split package.
 */

const fs = require('fs');
const path = require('path');

const DIRECT_GRAPH_NAME = 'RFC-GRAPH.json';
const GRAPH_FILE_SUFFIX = '-GRAPH.json';

/** A graph candidate is a regular file; a directory with the suffix is not. */
function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * Resolve the package's graph.
 *
 * @param {string} cwd — package directory
 * @returns {{path: string|null, reason: 'FOUND'|'MISSING'|'AMBIGUOUS'|'UNREADABLE', candidates: string[]}}
 */
// [::TICKET::] PX-439 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-439 --for-spec --no-implementation-order`.
function resolveGraphPath(cwd) {
  const directory = path.resolve(cwd);
  let entries;
  try {
    entries = fs.readdirSync(directory);
  } catch (error) {
    const reason = error.code === 'ENOENT' ? 'MISSING' : 'UNREADABLE';
    return { path: null, reason, candidates: [], detail: error.message };
  }

  let candidates;
  try {
    candidates = entries
      .filter((name) => name.endsWith(GRAPH_FILE_SUFFIX))
      .filter((name) => isFile(path.join(directory, name)))
      .sort();
  } catch (error) {
    return {
      path: null,
      reason: 'UNREADABLE',
      candidates: [],
      detail: error.message,
    };
  }

  const direct = candidates.find((name) => name === DIRECT_GRAPH_NAME);
  if (direct !== undefined) {
    return { path: path.join(directory, direct), reason: 'FOUND', candidates };
  }
  if (candidates.length === 1) {
    return {
      path: path.join(directory, candidates[0]),
      reason: 'FOUND',
      candidates,
    };
  }
  if (candidates.length === 0) {
    return { path: null, reason: 'MISSING', candidates };
  }
  return { path: null, reason: 'AMBIGUOUS', candidates };
}

module.exports = {
  DIRECT_GRAPH_NAME,
  GRAPH_FILE_SUFFIX,
  resolveGraphPath,
};
