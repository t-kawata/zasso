'use strict';

/**
 * rewrite-deferral-ticket.js — replace the copied prose of a deferral clone.
 *
 * A deferral ticket is a deep clone, so its title, background and scope still
 * describe the source. This writer replaces exactly those three fields from a
 * structured seed and leaves every relational field untouched.
 */

const fs = require('node:fs');
const { validateTickets, parseTicketKey } = require('../lib/validate-tickets.js');
const { writeTemporaryThenRename } = require('./lib/atomic-write.js');

const REPAIR_TOOL_INVALID_INPUT = 'REPAIR_TOOL_INVALID_INPUT';
const REPAIR_TARGET_MISSING = 'REPAIR_TARGET_MISSING';
const REWRITE_FIELDS = Object.freeze(['title', 'background', 'scope']);

/** A refused rewrite. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
class RewriteDeferralError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
  constructor(message, code) {
    super(message);
    this.name = 'RewriteDeferralError';
    this.code = code;
  }
}

/** Find one ticket across every phase. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function findTicket(document, ticketKey) {
  const parsed = parseTicketKey(ticketKey);
  if (!parsed) {
    throw new RewriteDeferralError('Invalid ticket key: ' + ticketKey, REPAIR_TOOL_INVALID_INPUT);
  }
  for (const phase of document.phases || []) {
    for (const ticket of phase.tickets || []) {
      if (ticket.phaseId === parsed.phaseId && ticket.id === parsed.ticketId) return ticket;
    }
  }
  throw new RewriteDeferralError('Ticket not found: ' + ticketKey, REPAIR_TARGET_MISSING);
}

/** Validate the three seed fields. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function validateSeed(seed) {
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) {
    throw new RewriteDeferralError('seed must be an object', REPAIR_TOOL_INVALID_INPUT);
  }
  if (typeof seed.title !== 'string' || seed.title.trim() === '') {
    throw new RewriteDeferralError('seed.title must be a non-empty string', REPAIR_TOOL_INVALID_INPUT);
  }
  if (typeof seed.background !== 'string' || seed.background.trim() === '') {
    throw new RewriteDeferralError('seed.background must be a non-empty string', REPAIR_TOOL_INVALID_INPUT);
  }
  if (!Array.isArray(seed.scope) || seed.scope.length === 0) {
    throw new RewriteDeferralError('seed.scope must be a non-empty array of strings', REPAIR_TOOL_INVALID_INPUT);
  }
  if (seed.scope.some((entry) => typeof entry !== 'string' || entry.trim() === '')) {
    throw new RewriteDeferralError('seed.scope entries must be non-empty strings', REPAIR_TOOL_INVALID_INPUT);
  }
}

/**
 * Rewrite the three copied prose fields of a deferral clone.
 *
 * @param {object} input
 * @param {string} input.ticketsPath
 * @param {string} input.ticketKey
 * @param {{ title: string, background: string, scope: string[] }} input.seed
 * @param {boolean} [input.dryRun]
 * @returns {{ success: true, ticketKey: string, replaced: string[] }}
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function rewriteDeferralTicket({ ticketsPath, ticketKey, seed, dryRun = false }) {
  if (!fs.existsSync(ticketsPath)) {
    throw new RewriteDeferralError('Tickets.json not found: ' + ticketsPath, REPAIR_TARGET_MISSING);
  }
  validateSeed(seed);

  const document = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const ticket = findTicket(document, ticketKey);

  ticket.title = seed.title.trim();
  ticket.background = seed.background.trim();
  ticket.scope = seed.scope.map((entry) => entry.trim());

  const validation = validateTickets(document);
  if (!validation.valid) {
    throw new RewriteDeferralError(
      'rewritten document is invalid: ' + validation.errors.join('; '),
      REPAIR_TOOL_INVALID_INPUT,
    );
  }

  if (!dryRun) {
    writeTemporaryThenRename(ticketsPath, JSON.stringify(document, null, 2) + '\n');
  }

  return { success: true, ticketKey, replaced: [...REWRITE_FIELDS] };
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
    const result = rewriteDeferralTicket({
      ticketsPath: argumentValue(args, 'tickets'),
      ticketKey: argumentValue(args, 'ticket-key'),
      seed: JSON.parse(argumentValue(args, 'seed') || '{}'),
      dryRun: args.includes('--dry-run'),
    });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ success: false, code: error.code, error: error.message }) + '\n');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { RewriteDeferralError, rewriteDeferralTicket };
