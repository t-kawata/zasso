#!/usr/bin/env node
'use strict';

/**
 * verify-operation-delivery.js — final tests for operation obligations and axes.
 *
 * A plan-time mention is not a final test. Each non-empty obligation field and
 * each sequence axis must be named by a test entry that also names its unit or
 * step, so a nearby keyword cannot satisfy it.
 *
 * Report only: prints one finding envelope and exits zero.
 */

const {
  CONTRACT_AXES,
  CONTRACT_BEARING_OPERATION_FIELDS,
  SURFACE_OPERATION_FIELDS,
  factTexts,
  hasObligationValue,
} = require('./lib/contract-facts.js');
const { mentions } = require('./lib/asset-coverage.js');
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

const GATE = 'verify-operation-delivery';
const CHECKED_OBLIGATION_FIELDS = Object.freeze([
  ...CONTRACT_BEARING_OPERATION_FIELDS,
  ...SURFACE_OPERATION_FIELDS,
]);
const OPERATION_MODES = new Set(['implement', 'obligation', 'flow']);

/** The terms that identify one obligation value in a test entry. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function valueTerms(field, value) {
  const facts = factTexts(Array.isArray(value) ? value : [value]);
  return [field, ...facts.map(String)];
}

/** Whether one entry names the unit and one of the obligation terms. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function entryNamesUnit(entry, unitId, terms) {
  if (!mentions(entry, unitId)) return false;
  const lower = entry.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
}

/** The axes of a step contract, preferring the projected contract field. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function stepAxes(step, contract) {
  return contract?.contract ?? step?.contract ?? null;
}

/**
 * Find every operation obligation and sequence axis no final test names.
 *
 * @param {object} ticket
 * @param {string} ticketKey
 * @param {string} ticketsPath
 * @returns {object[]} — frozen findings
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function findOperationDeliveryGaps(ticket, ticketKey, ticketsPath) {
  const units = ticket?.distribution?.units ?? [];
  const testEntries = [...(ticket.testUnit || []), ...(ticket.testIntegration || [])];
  const rerun = gateRerun(GATE, ticketKey, ticketsPath);
  const findings = [];

  for (const unit of units) {
    const mode = unit?.obligation?.mode;
    const unitId = unit?.unitId ?? unit?.operationId;
    if (!unitId) continue;

    if (OPERATION_MODES.has(mode)) {
      const fields = mode === 'flow' ? ['outcome'] : CHECKED_OBLIGATION_FIELDS;
      for (const field of fields) {
        const value = unit.obligation?.[field];
        if (!hasObligationValue(value)) continue;
        const terms = valueTerms(field, value);
        if (testEntries.some((entry) => entryNamesUnit(entry, unitId, terms))) continue;

        const asset = ticketKey + '/' + unitId + ':' + field;
        findings.push(gateFinding({
          code: 'OPERATION_OBLIGATION_UNTESTED',
          asset,
          problem: 'operation ' + unitId + ' carries ' + field
            + ' and no final test names it',
          rerun,
          fix: testRepairRoute({
            ticketKey,
            asset,
            instruction: 'Add a final test that names ' + unitId + ' and its ' + field + ' obligation',
          }),
        }));
      }
    }

    if (mode !== 'steps') continue;
    for (const step of unit.obligation?.steps ?? []) {
      const contract = (ticket.contracts || []).find((entry) => entry?.stepId === step.stepId);
      if (!contract) continue;
      const axes = stepAxes(step, contract);

      for (const axis of CONTRACT_AXES) {
        const texts = factTexts(axes?.[axis]);
        if (texts.length === 0) continue;
        const covered = testEntries.some((entry) => {
          if (!mentions(entry, step.stepId) && !mentions(entry, contract.id)) return false;
          const lower = entry.toLowerCase();
          return texts.some((text) => lower.includes(text.toLowerCase()));
        });
        if (covered) continue;

        const asset = ticketKey + '/' + step.stepId + ':' + axis;
        findings.push(gateFinding({
          code: 'SEQUENCE_AXIS_UNTESTED',
          asset,
          problem: 'step ' + step.stepId + ' carries ' + axis
            + ' (' + texts.join(', ') + ') and no final test names it',
          rerun,
          fix: testRepairRoute({
            ticketKey,
            contractId: contract.id,
            asset,
            instruction: 'Add a final test that names ' + step.stepId + ' and its ' + axis + ' fact',
          }),
        }));
      }
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
    findings: findOperationDeliveryGaps(ticket, ticketKey, ticketsPath),
  });
  process.exit(0);
}

if (require.main === module) main();

module.exports = { GATE, findOperationDeliveryGaps };
