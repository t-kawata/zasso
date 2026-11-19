#!/usr/bin/env node

/**
 * derive-graph-path.js — derive the package GRAPH without an operator argument.
 *
 * /crystalize-readme takes no graph path. The package owns RFC-GRAPH.json, or
 * exactly one *-GRAPH.json when the canonical name is absent. This module is the
 * crystalize entry point to the same locator /find-omissions uses, so the two
 * commands cannot disagree about which graph a package owns.
 */

const path = require('path');
const { resolveGraphPath } = require('../lib/resolve-graph-path.js');

/** The argument error a caller sees when the old graph-path invocation is used. */
const UNEXPECTED_ARGUMENT = 'UNEXPECTED_ARGUMENT';

/**
 * Resolve the package graph from the current directory.
 *
 * @param {{cwd?: string, args?: string[]}} [options]
 * @returns {{ok: boolean, graphPath: string|null, reason: string, candidates: string[]}}
 * @throws {Error} When the caller supplies an operator argument
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function resolveCrystalizeGraph({ cwd = process.cwd(), args = [] } = {}) {
  if (args.length > 0) {
    throw new Error(`${UNEXPECTED_ARGUMENT}: /crystalize-readme takes no graph path.`);
  }

  const resolution = resolveGraphPath(cwd);
  return {
    ok: resolution.reason === 'FOUND',
    graphPath: resolution.path,
    reason: resolution.reason,
    candidates: resolution.candidates,
  };
}

/**
 * Print the resolved path or a 3-part English error.
 *
 * @returns {number} process exit code
 */
// [::TICKET::] PX-451, PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-451|PX-452) --for-spec --no-implementation-order`.
function main() {
  let result;
  try {
    result = resolveCrystalizeGraph({ args: process.argv.slice(2) });
  } catch (error) {
    console.error('[ERROR] Graph derivation failed.');
    console.error(`Cause: ${error.message}`);
    console.error('Action: Run /crystalize-readme with no argument in the package directory.');
    return 2;
  }

  if (result.ok) {
    process.stdout.write(`${result.graphPath}\n`);
    return 0;
  }

  console.error('[ERROR] Graph derivation failed.');
  console.error(`Cause: ${result.reason} graph artifact in ${process.cwd()}.`);
  if (result.reason === 'AMBIGUOUS') {
    console.error(`Candidates: ${result.candidates.join(', ')}`);
  }
  console.error('Action: Provide RFC-GRAPH.json, or exactly one *-GRAPH.json, in the package directory.');
  return 1;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  UNEXPECTED_ARGUMENT,
  resolveCrystalizeGraph,
  main,
};
