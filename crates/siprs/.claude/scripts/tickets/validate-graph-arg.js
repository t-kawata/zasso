#!/usr/bin/env node

/**
 * validate-graph-arg.js — Validate the GRAPH argument for /find-omissions
 *
 * Exits 0 if a readable GRAPH file path is provided.
 * Exits 2 (with message) if missing or not found.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { recordRunHistory } = require('../lib/run-history-recorder.cjs');

/** The first /find-omissions gate also opens its run. */
const RUN_HISTORY = { command: 'find-omissions', stage: 'find' };

/**
 * Return the gate's exit code instead of exiting, so the decision is testable
 * and the CLI wrapper below is the only place that owns process termination.
 */
// [::TICKET::] PX-366 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-366 --for-spec --no-implementation-order`.
function validateGraphArgument(argv = process.argv.slice(2)) {
  const argument = argv[0];

  if (!argument) {
    console.error('[find-omissions] BLOCKED: No GRAPH path specified.');
    console.error('Usage: /find-omissions </path/to/*-GRAPH.json>');
    return 2;
  }

  const resolved = path.resolve(argument);

  if (!fs.existsSync(resolved)) {
    console.error('[find-omissions] BLOCKED: GRAPH file not found: ' + resolved);
    console.error('Verify the path and re-run /find-omissions with a valid GRAPH file.');
    return 2;
  }

  return 0;
}

if (require.main === module) {
  recordRunHistory('start', RUN_HISTORY);
  process.once('exit', (code) => {
    if (code !== 0) recordRunHistory('finish', { ...RUN_HISTORY, status: 'BLOCKED_PREREQUISITE' });
  });
  process.exit(validateGraphArgument());
}

module.exports = { validateGraphArgument };
