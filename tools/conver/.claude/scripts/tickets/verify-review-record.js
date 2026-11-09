#!/usr/bin/env node
'use strict';

/**
 * verify-review-record.js — a reviewed ticket carries its evidence.
 *
 * Review status is not itself a certificate. A reviewed ticket must record what
 * was checked, what deviated from the RFC, and the reviewer's conclusion. Each
 * missing or malformed field is a separate finding with its own repair route.
 *
 * Report only: prints one finding envelope and exits zero.
 */

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
  reviewRecordRoute,
} = require('./lib/gate-report.js');

const GATE = 'verify-review-record';
const REVIEW_STATUS = 'reviewed';

/** Whether a value is a non-empty string. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Find every required review field that is missing or malformed.
 *
 * @param {object} ticket
 * @param {string} ticketKey
 * @param {string} ticketsPath
 * @returns {object[]} — frozen findings
 */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function findReviewRecordGaps(ticket, ticketKey, ticketsPath) {
  if (!ticket || ticket.status !== REVIEW_STATUS) return [];

  const rerun = gateRerun(GATE, ticketKey, ticketsPath);
  const findings = [];

  if (!isNonEmptyString(ticket.instrumentation)) {
    findings.push(reviewFinding(ticketKey, ticketsPath, rerun, 'instrumentation'));
  }
  if (!Array.isArray(ticket.rfcDiscrepancies)
    || ticket.rfcDiscrepancies.some((entry) => !isNonEmptyString(entry))) {
    findings.push(reviewFinding(ticketKey, ticketsPath, rerun, 'rfcDiscrepancies'));
  }
  if (!isNonEmptyString(ticket.notes)) {
    findings.push(reviewFinding(ticketKey, ticketsPath, rerun, 'notes'));
  }

  return findings;
}

/** One missing review-field finding. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function reviewFinding(ticketKey, ticketsPath, rerun, field) {
  const asset = ticketKey + '/' + field;
  return gateFinding({
    code: 'REVIEW_RECORD_MISSING',
    asset,
    problem: 'reviewed ticket ' + ticketKey + ' has no valid ' + field,
    rerun,
    fix: reviewRecordRoute({
      ticketsPath,
      ticketKey,
      fields: [field],
      asset,
    }),
  });
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
    findings: findReviewRecordGaps(ticket, ticketKey, ticketsPath),
  });
  process.exit(0);
}

if (require.main === module) main();

module.exports = { GATE, REVIEW_STATUS, findReviewRecordGaps };
