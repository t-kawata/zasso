#!/usr/bin/env node

// [::TICKET::] PX-439 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-439 --for-spec --no-implementation-order`.
/**
 * validate-graph-arg.js — Validate the GRAPH artifact for /find-omissions
 *
 * The graph is a package-local artifact, so the gate resolves it from the
 * current directory and never from the argument. An explicit path cannot
 * override the package, and a stale caller's path cannot block a resolvable one.
 * Exits 0 when the package resolves its graph, 2 otherwise.
 */

'use strict';

const path = require('path');
const { recordRunHistory } = require('../lib/run-history-recorder.cjs');
const { resolveGraphPath } = require('../lib/resolve-graph-path.js');

/** The first /find-omissions gate also opens its run. */
const RUN_HISTORY = { command: 'find-omissions', stage: 'find' };

/**
 * Name the verdict so a reader can act without re-running the resolver.
 *
 * @param {{reason: string, candidates: string[], detail?: string}} resolution
 * @param {string} directory
 */
// [::TICKET::] PX-439 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-439 --for-spec --no-implementation-order`.
function reportBlockedGraph(resolution, directory) {
  console.error(
    '[find-omissions] BLOCKED: ' + resolution.reason + ' graph artifact in ' + directory + '.',
  );
  if (resolution.reason === 'AMBIGUOUS') {
    console.error('Candidates: ' + resolution.candidates.join(', '));
  }
  if (resolution.reason === 'MISSING') {
    console.error('Expected RFC-GRAPH.json, or exactly one *-GRAPH.json.');
  }
  if (resolution.detail !== undefined) {
    console.error(resolution.detail);
  }
}

/**
 * Return the gate's exit code instead of exiting, so the decision is testable
 * and the CLI wrapper below is the only place that owns process termination.
 *
 * The argument is accepted and ignored: a resumed run may carry a directive,
 * and no argument is a graph path.
 *
 * @param {string[]} _argv — accepted for the CLI shape, never read
 * @param {{cwd?: string}} [options]
 * @returns {0|2}
 */
// [::TICKET::] PX-439 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-439 --for-spec --no-implementation-order`.
function validateGraphArgument(_argv = process.argv.slice(2), options = {}) {
  const directory = path.resolve(options.cwd ?? process.cwd());
  const resolution = resolveGraphPath(directory);

  if (resolution.reason === 'FOUND') return 0;

  reportBlockedGraph(resolution, directory);
  return 2;
}

if (require.main === module) {
  recordRunHistory('start', RUN_HISTORY);
  process.once('exit', (code) => {
    if (code !== 0) recordRunHistory('finish', { ...RUN_HISTORY, status: 'BLOCKED_PREREQUISITE' });
  });
  process.exit(validateGraphArgument());
}

module.exports = { validateGraphArgument };
