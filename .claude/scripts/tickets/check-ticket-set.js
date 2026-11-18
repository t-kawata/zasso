#!/usr/bin/env node
'use strict';

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
/**
 * check-ticket-set — the repository postcondition for the condensation invariant.
 *
 * Every discovered package must pass the read-only condense gate. A package that
 * is not at its partition minimum, or that carries an unmeasured omission
 * ticket, fails the check with the package path and the finding code.
 */

const path = require('node:path');

const { discoverPackages, gateTickets } = require('./condense-tickets.js');

/** Run the read-only gate for every discovered package. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
async function checkTicketSet({ root }) {
  const discovered = discoverPackages(root);
  const targets = Array.isArray(discovered) ? discovered : discovered.targets;
  const failures = [];
  for (const target of targets) {
    const result = await gateTickets({ cwd: target });
    if (result.ok) continue;
    failures.push({
      package: target,
      code: result.code ?? 'CONDENSE_GATE_FAILED',
      findings: result.findings ?? [],
    });
  }
  return { targets, failures };
}

/** Render the result as the stable report the command prints. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function renderReport({ targets, failures }) {
  const lines = [];
  for (const failure of failures) {
    lines.push('FAIL ' + failure.package + ' ' + failure.code);
    for (const finding of failure.findings) lines.push('  - ' + finding);
  }
  lines.push((failures.length === 0 ? 'OK' : 'FAILED') + ' ' + targets.length + ' package(s)');
  return lines.join('\n') + '\n';
}

/** CLI entry point. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
async function main() {
  const args = process.argv.slice(2);
  const workspaceArg = args.find((argument) => argument.startsWith('--workspace='));
  const root = path.resolve(workspaceArg ? workspaceArg.slice('--workspace='.length) : process.cwd());
  const result = await checkTicketSet({ root });
  process.stdout.write(renderReport(result));
  process.exit(result.failures.length === 0 ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write((error.code ?? 'CHECK_TICKET_SET_FAILED') + ': ' + error.message + '\n');
    process.exit(1);
  });
}

module.exports = { checkTicketSet, renderReport };
