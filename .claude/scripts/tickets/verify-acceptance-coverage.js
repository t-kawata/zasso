#!/usr/bin/env node
'use strict';

/**
 * verify-acceptance-coverage.js — every acceptance criterion is named by a test.
 *
 * An acceptance criterion is prose, not an id, so the shared matcher requires one
 * test entry to carry the majority of the criterion's content words. A word that
 * happens to appear elsewhere in the plan is not coverage.
 *
 * Report only: prints one finding envelope and exits zero.
 */

const { textIsNamedByTest, hasJustifiedException } = require('./lib/asset-coverage.js');
const {
  gateFinding,
  gateRerun,
  emitGateReport,
  loadTicketDocument,
  findTicketByKey,
  argumentValue,
  resolveArgumentPath,
  emitTicketNotFound,
  emitInputMissing,
  testRepairRoute,
} = require('./lib/gate-report.js');

const GATE = 'verify-acceptance-coverage';

/**
 * Find every acceptance criterion no test or justified exception names.
 *
 * @param {object} ticket
 * @param {string} ticketKey
 * @param {string} ticketsPath
 * @returns {object[]} — frozen findings
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function findAcceptanceGaps(ticket, ticketKey, ticketsPath) {
  const testEntries = [...(ticket.testUnit || []), ...(ticket.testIntegration || [])];
  const testExceptions = ticket.testExceptions || [];
  const rerun = gateRerun(GATE, ticketKey, ticketsPath);
  const findings = [];

  (ticket.acceptanceCriteria || []).forEach((criterion, index) => {
    if (typeof criterion !== 'string' || criterion.trim().length === 0) return;
    if (textIsNamedByTest(criterion, testEntries)) return;
    if (hasJustifiedException(testExceptions, 'acceptance', criterion)) return;

    const asset = ticketKey + '/acceptanceCriteria[' + index + ']';
    findings.push(gateFinding({
      code: 'ACCEPTANCE_CRITERIA_UNTESTED',
      asset,
      problem: 'acceptance criterion "' + criterion + '" is named by no test or justified exception',
      rerun,
      fix: testRepairRoute({
        ticketKey,
        asset,
        instruction: 'Add a test that names the criterion: ' + criterion,
      }),
    }));
  });

  return findings;
}

// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const ticketKey = argumentValue(args, 'ticket-key');
  const ticketsPath = resolveArgumentPath(args, 'tickets');
  if (!ticketKey || !ticketsPath) {
    emitInputMissing(GATE, ticketKey, ticketsPath);
    process.exit(0);
  }

  const document = loadTicketDocument(ticketsPath);
  const ticket = findTicketByKey(document, ticketKey);
  if (!ticket) {
    emitTicketNotFound(GATE, ticketKey, ticketsPath);
    process.exit(0);
  }

  emitGateReport({
    gate: GATE,
    ticketKey,
    findings: findAcceptanceGaps(ticket, ticketKey, ticketsPath),
  });
  process.exit(0);
}

if (require.main === module) main();

module.exports = { GATE, findAcceptanceGaps };
