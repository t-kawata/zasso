#!/usr/bin/env node
'use strict';

/**
 * verify-contract-delivery.js — every contract clause is named by a final test.
 *
 * The contract id alone is not enough: one test that names C001 must not cover a
 * different clause of C001. A boundary contract's clauses are checked the same
 * way and reported under their own code so a reader can tell which side is open.
 *
 * Report only: prints one finding envelope and exits zero.
 */

const {
  assetIsNamedByTest,
  hasJustifiedException,
} = require('./lib/asset-coverage.js');
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

const GATE = 'verify-contract-delivery';
const CONTRACT_ELEMENTS = Object.freeze(['precondition', 'postcondition', 'invariant']);

/** Whether the contract projects a boundary rather than a graph edge. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function isBoundaryContract(contract) {
  if (typeof contract.boundaryId === 'string' && contract.boundaryId.length > 0) return true;
  return typeof contract.id === 'string' && contract.id.startsWith('contract-');
}

/**
 * Find every contract clause no test or justified exception names.
 *
 * @param {object} ticket
 * @param {string} ticketKey
 * @param {string} ticketsPath
 * @returns {object[]} — frozen findings
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function findContractDeliveryGaps(ticket, ticketKey, ticketsPath) {
  const testEntries = [...(ticket.testUnit || []), ...(ticket.testIntegration || [])];
  const testExceptions = ticket.testExceptions || [];
  const rerun = gateRerun(GATE, ticketKey, ticketsPath);
  const findings = [];

  for (const contract of ticket.contracts || []) {
    if (!contract || typeof contract.id !== 'string' || contract.id.length === 0) continue;
    const boundary = isBoundaryContract(contract);
    const code = boundary ? 'BOUNDARY_CLAUSE_UNTESTED' : 'CONTRACT_CLAUSE_UNTESTED';

    for (const element of CONTRACT_ELEMENTS) {
      const clause = contract[element];
      if (typeof clause !== 'string' || clause.trim().length === 0) continue;
      if (assetIsNamedByTest({ assetId: contract.id, clause, testEntries })) continue;
      if (hasJustifiedException(testExceptions, contract.id, clause)) continue;

      const asset = ticketKey + '/' + contract.id + '/' + element;
      findings.push(gateFinding({
        code,
        asset,
        problem: (boundary ? 'boundary ' : '') + 'contract ' + contract.id
          + ' ' + element + ' is not named by any test or justified exception',
        rerun,
        fix: testRepairRoute({
          ticketKey,
          contractId: contract.id,
          asset,
          instruction: 'Add a test that names ' + contract.id + ' and its ' + element + ': ' + clause,
        }),
      }));
    }
  }

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
    findings: findContractDeliveryGaps(ticket, ticketKey, ticketsPath),
  });
  process.exit(0);
}

if (require.main === module) main();

module.exports = { GATE, findContractDeliveryGaps, isBoundaryContract };
