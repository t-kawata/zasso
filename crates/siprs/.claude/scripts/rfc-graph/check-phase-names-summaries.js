#!/usr/bin/env node

/**
 * check-phase-names-summaries.js — Verify all phases have name/summary set
 *
 * Checks that all phases in Tickets.json have non-empty name and summary fields.
 * Used as the completion check for split-to-tickets.md Step 4.2.
 *
 * Usage:
 *   node check-phase-names-summaries.js <Tickets.json>
 *
 * Exit codes:
 *   0 = All phases complete
 *   1 = Some phases missing name/summary
 *   2 = Argument error
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { resolveTicketsPath, reportResolvedPath } = require('../lib/package-artifacts');

// [::TICKET::] PX-334 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-334 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const ticketsPath = args.length >= 1
    ? path.resolve(args[0])
    : resolveTicketsPath({ cwd: process.cwd() });
  if (args.length < 1) reportResolvedPath('tickets', ticketsPath);

  let ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch (e) {
    console.error('[ERROR] Tickets.json failed to load: ' + e.message);
    process.exit(2);
  }

  const phases = ticketsData.phases || [];
  const missingPhases = [];

  for (const phase of phases) {
    const issues = [];
    if (!phase.name || typeof phase.name !== 'string' || phase.name.trim().length === 0) {
      issues.push('name is empty');
    }
    if (!phase.summary || typeof phase.summary !== 'string' || phase.summary.trim().length === 0) {
      issues.push('summary is empty');
    }
    if (issues.length > 0) {
      missingPhases.push({ phaseId: phase.id, name: phase.name, issues: issues });
    }
  }

  if (missingPhases.length > 0) {
    console.error('[FAIL] The following phases are missing name or summary:');
    for (const mp of missingPhases) {
      console.error('  P' + mp.phaseId + ' (' + (mp.name || '(unnamed)') + '): ' + mp.issues.join(', '));
    }
    process.exit(1);
  }

  console.log('[OK] All ' + phases.length + ' phases have name/summary set.');
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {};
