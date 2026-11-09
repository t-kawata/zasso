'use strict';

/**
 * record-review.js — write the three review fields with schema validation.
 *
 * The review record is evidence: what was checked, what deviated from the RFC,
 * and what the reviewer concluded. Writing it through one validated tool keeps
 * a malformed record from replacing a good one.
 */

const fs = require('node:fs');
const { validateTickets, parseTicketKey } = require('../lib/validate-tickets.js');
const { writeTemporaryThenRename } = require('./lib/atomic-write.js');

const REPAIR_TOOL_INVALID_INPUT = 'REPAIR_TOOL_INVALID_INPUT';
const REPAIR_TARGET_MISSING = 'REPAIR_TARGET_MISSING';

/** A refused review record. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
class RecordReviewError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
  constructor(message, code) {
    super(message);
    this.name = 'RecordReviewError';
    this.code = code;
  }
}

/** Find one ticket across every phase. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function findTicket(document, ticketKey) {
  const parsed = parseTicketKey(ticketKey);
  if (!parsed) {
    throw new RecordReviewError('Invalid ticket key: ' + ticketKey, REPAIR_TOOL_INVALID_INPUT);
  }
  for (const phase of document.phases || []) {
    for (const ticket of phase.tickets || []) {
      if (ticket.phaseId === parsed.phaseId && ticket.id === parsed.ticketId) return ticket;
    }
  }
  throw new RecordReviewError('Ticket not found: ' + ticketKey, REPAIR_TARGET_MISSING);
}

/** Validate the three review fields before touching the document. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function validateReview({ instrumentation, rfcDiscrepancies, notes }) {
  if (typeof instrumentation !== 'string' || instrumentation.trim() === '') {
    throw new RecordReviewError('instrumentation must be a non-empty string', REPAIR_TOOL_INVALID_INPUT);
  }
  if (typeof notes !== 'string' || notes.trim() === '') {
    throw new RecordReviewError('notes must be a non-empty string', REPAIR_TOOL_INVALID_INPUT);
  }
  if (!Array.isArray(rfcDiscrepancies)) {
    throw new RecordReviewError('rfcDiscrepancies must be an array of strings', REPAIR_TOOL_INVALID_INPUT);
  }
  if (rfcDiscrepancies.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw new RecordReviewError('rfcDiscrepancies entries must be non-empty strings', REPAIR_TOOL_INVALID_INPUT);
  }
}

/** Append a text block once. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function appendOnce(existing, incoming) {
  if (typeof existing !== 'string' || existing.length === 0) return incoming;
  if (existing.includes(incoming)) return existing;
  return existing + '\n' + incoming;
}

/** Append unique discrepancy entries. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function appendUniqueEntries(existing, incoming) {
  const current = Array.isArray(existing) ? existing : [];
  const additions = incoming.filter((entry) => !current.includes(entry));
  return [...current, ...additions];
}

/**
 * Record the review fields on one ticket.
 *
 * @param {object} input
 * @param {string} input.ticketsPath
 * @param {string} input.ticketKey
 * @param {string} input.instrumentation
 * @param {string[]} input.rfcDiscrepancies
 * @param {string} input.notes
 * @param {boolean} [input.dryRun]
 * @returns {{ success: true, ticketKey: string, appended: object }}
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function recordReview({ ticketsPath, ticketKey, instrumentation, rfcDiscrepancies, notes, dryRun = false }) {
  if (!fs.existsSync(ticketsPath)) {
    throw new RecordReviewError('Tickets.json not found: ' + ticketsPath, REPAIR_TARGET_MISSING);
  }
  validateReview({ instrumentation, rfcDiscrepancies, notes });

  const document = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const ticket = findTicket(document, ticketKey);

  const instrumentationAdded = !ticket.instrumentation
    || !ticket.instrumentation.includes(instrumentation.trim());
  const notesAdded = !ticket.notes || !ticket.notes.includes(notes.trim());
  const discrepanciesAdded = rfcDiscrepancies
    .filter((entry) => !(Array.isArray(ticket.rfcDiscrepancies) && ticket.rfcDiscrepancies.includes(entry))).length;

  ticket.instrumentation = appendOnce(ticket.instrumentation, instrumentation.trim());
  ticket.rfcDiscrepancies = appendUniqueEntries(ticket.rfcDiscrepancies, rfcDiscrepancies);
  ticket.notes = appendOnce(ticket.notes, notes.trim());

  const validation = validateTickets(document);
  if (!validation.valid) {
    throw new RecordReviewError(
      'review record produced an invalid document: ' + validation.errors.join('; '),
      REPAIR_TOOL_INVALID_INPUT,
    );
  }

  if (!dryRun) {
    writeTemporaryThenRename(ticketsPath, JSON.stringify(document, null, 2) + '\n');
  }

  return {
    success: true,
    ticketKey,
    appended: {
      instrumentation: instrumentationAdded,
      rfcDiscrepancies: discrepanciesAdded,
      notes: notesAdded,
    },
  };
}

/** Read a `--name=value` argument. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  try {
    const result = recordReview({
      ticketsPath: argumentValue(args, 'tickets'),
      ticketKey: argumentValue(args, 'ticket-key'),
      instrumentation: argumentValue(args, 'instrumentation'),
      rfcDiscrepancies: JSON.parse(argumentValue(args, 'rfc-discrepancies') || '[]'),
      notes: argumentValue(args, 'notes'),
      dryRun: args.includes('--dry-run'),
    });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ success: false, code: error.code, error: error.message }) + '\n');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { RecordReviewError, recordReview };
