'use strict';

/**
 * /amend-rfc-up amendment ticket.
 *
 * A package with no active ticket still needs a real ticket key because the
 * amendment gate runs ticket closure and reverification. The ticket is created
 * through the ticket CRUD script and reused when the same material and
 * instruction digest is amended again.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const ADD_TICKET_PATH = path.resolve(__dirname, '../tickets/add-ticket.js');
const AMENDMENT_DIGEST_PREFIX = 'Amendment digest: ';
const DEFAULT_PHASE = 'PX';
const TICKET_STATUS = 'todo';

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function computeDigest(materialDigest, instructionDigest) {
  return createHash('sha256')
    .update(`${materialDigest}\n${instructionDigest}`)
    .digest('hex');
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function readTickets(ticketsPath) {
  return JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function allTickets(document) {
  return (document.phases || []).flatMap((phase) => (
    (phase.tickets || []).map((ticket) => ({
      ...ticket,
      ticketKey: (phase.id === -1 ? 'PX-' : `P${phase.id}-`) + ticket.id,
    }))
  ));
}

/** Find a ticket that already records this amendment digest. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function findAmendmentTicket({ ticketsPath, digest }) {
  const document = readTickets(ticketsPath);
  const marker = `${AMENDMENT_DIGEST_PREFIX}${digest}`;
  const ticket = allTickets(document).find((entry) => (
    typeof entry.notes === 'string' && entry.notes.includes(marker)
  ));
  return ticket ? { ticketKey: ticket.ticketKey, status: ticket.status } : null;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function defaultAddTicketRunner({ ticketsPath, title, notes }) {
  const result = spawnSync(process.execPath, [ADD_TICKET_PATH, ticketsPath, DEFAULT_PHASE], {
    encoding: 'utf8',
    input: JSON.stringify({ title, notes, status: TICKET_STATUS }),
  });
  if (result.status !== 0) {
    throw fail('AMENDMENT_TICKET_FAILED', `add-ticket exited ${result.status}`, { stderr: result.stderr });
  }
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    throw fail('AMENDMENT_TICKET_FAILED', `add-ticket output is not JSON: ${error.message}`);
  }
  if (!parsed.success || !parsed.ticketKey) {
    throw fail('AMENDMENT_TICKET_FAILED', parsed.error || 'add-ticket did not return a ticket key');
  }
  return { ticketKey: parsed.ticketKey };
}

/** Create or reuse the amendment ticket for one material/instruction pair. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function ensureAmendmentTicket(input = {}) {
  const {
    packageDir,
    ticketsPath,
    materialDigest,
    instructionDigest,
    runner = defaultAddTicketRunner,
  } = input;
  const digest = computeDigest(materialDigest, instructionDigest);
  const existing = findAmendmentTicket({ ticketsPath, digest });
  if (existing) {
    return { ticketKey: existing.ticketKey, digest, created: false, reused: true };
  }
  const title = `Amendment ${digest.slice(0, 12)}`;
  const notes = [
    `${AMENDMENT_DIGEST_PREFIX}${digest}`,
    `Material digest: ${materialDigest}`,
    `Instruction digest: ${instructionDigest}`,
    `Package: ${path.resolve(packageDir)}`,
  ].join('\n');
  const created = runner({ ticketsPath, title, notes });
  return { ticketKey: created.ticketKey, digest, created: true, reused: false };
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function main(argv = process.argv.slice(2)) {
  try {
    if (argv[0] === 'ensure') {
      const result = ensureAmendmentTicket({
        packageDir: argumentValue(argv, 'package') || process.cwd(),
        ticketsPath: argumentValue(argv, 'tickets'),
        materialDigest: argumentValue(argv, 'material-digest') || '',
        instructionDigest: argumentValue(argv, 'instruction-digest') || '',
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return 0;
    }
    process.stdout.write(`${JSON.stringify({ code: 'UNKNOWN_SUBCOMMAND', command: argv[0] })}\n`);
    return 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ code: error.code || 'AMENDMENT_TICKET_FAILED', message: error.message })}\n`);
    return 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = {
  ADD_TICKET_PATH,
  AMENDMENT_DIGEST_PREFIX,
  computeDigest,
  ensureAmendmentTicket,
  findAmendmentTicket,
};
