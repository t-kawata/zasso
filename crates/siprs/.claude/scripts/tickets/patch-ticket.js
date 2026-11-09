'use strict';

/**
 * patch-ticket.js — schema-aware atomic patch of one ticket field.
 *
 * The repair loop needs to change one field without rewriting the whole record.
 * This writer checks the field against the ticket schema, validates the whole
 * document, and only then replaces the file, so a rejected patch leaves the
 * target byte-identical.
 */

const fs = require('node:fs');
const { validateTickets, parseTicketKey } = require('../lib/validate-tickets.js');
const { stableStringify } = require('./lib/gate-finding.js');
const { writeTemporaryThenRename } = require('./lib/atomic-write.js');
const TICKETS_SCHEMA = require('./tickets-schema.json');

const REPAIR_TOOL_INVALID_INPUT = 'REPAIR_TOOL_INVALID_INPUT';
const REPAIR_TARGET_MISSING = 'REPAIR_TARGET_MISSING';
const FIELD_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** A rejected patch. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
class PatchTicketError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
  constructor(message, code) {
    super(message);
    this.name = 'PatchTicketError';
    this.code = code;
  }
}

/** The JSON types the ticket schema allows for a field, or null when undeclared. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function expectedTypesOf(field) {
  const properties = TICKETS_SCHEMA.definitions
    && TICKETS_SCHEMA.definitions.ticket
    && TICKETS_SCHEMA.definitions.ticket.properties;
  const property = properties && properties[field];
  if (!property) return null;
  return Array.isArray(property.type) ? property.type : [property.type];
}

/** Whether a value is a JSON object that is not an array. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Whether a value matches one declared JSON type. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function matchesType(value, type) {
  switch (type) {
    case 'array': return Array.isArray(value);
    case 'string': return typeof value === 'string';
    case 'integer': return Number.isInteger(value);
    case 'number': return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'object': return isPlainObject(value);
    case 'null': return value === null;
    default: return false;
  }
}

/** Whether the value is a JSON value at all. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function isJsonValue(value) {
  return value !== undefined && typeof value !== 'function' && typeof value !== 'symbol';
}

/** Read and parse a Tickets.json document. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function readDocument(ticketsPath) {
  if (!fs.existsSync(ticketsPath)) {
    throw new PatchTicketError('Tickets.json not found: ' + ticketsPath, REPAIR_TARGET_MISSING);
  }
  return JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
}

/** Find one ticket across every phase. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function findTicket(document, ticketKey) {
  const parsed = parseTicketKey(ticketKey);
  if (!parsed) {
    throw new PatchTicketError('Invalid ticket key: ' + ticketKey, REPAIR_TOOL_INVALID_INPUT);
  }
  for (const phase of document.phases || []) {
    for (const ticket of phase.tickets || []) {
      if (ticket.phaseId === parsed.phaseId && ticket.id === parsed.ticketId) return ticket;
    }
  }
  throw new PatchTicketError('Ticket not found: ' + ticketKey, REPAIR_TARGET_MISSING);
}

/** Append without duplicating an existing entry. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function appendUnique(existingValue, incomingValue, expectedTypes) {
  if (existingValue === undefined || existingValue === null) {
    const incomingType = Array.isArray(incomingValue) ? 'array' : typeof incomingValue;
    const allowed = !expectedTypes || expectedTypes.includes(incomingType);
    if (allowed && (Array.isArray(incomingValue) || typeof incomingValue === 'string')) {
      return Array.isArray(incomingValue) ? [...incomingValue] : incomingValue;
    }
  }

  if (Array.isArray(existingValue)) {
    if (!Array.isArray(incomingValue)) {
      throw new PatchTicketError('append to an array field requires an array value', REPAIR_TOOL_INVALID_INPUT);
    }
    const seen = new Set(existingValue.map(stableStringify));
    const additions = incomingValue.filter((entry) => !seen.has(stableStringify(entry)));
    return [...existingValue, ...additions];
  }

  if (typeof existingValue === 'string') {
    if (typeof incomingValue !== 'string') {
      throw new PatchTicketError('append to a string field requires a string value', REPAIR_TOOL_INVALID_INPUT);
    }
    if (existingValue.length === 0) return incomingValue;
    if (existingValue.includes(incomingValue)) return existingValue;
    return existingValue + '\n' + incomingValue;
  }

  throw new PatchTicketError('append is supported only for string and array fields', REPAIR_TOOL_INVALID_INPUT);
}

/** The field value after a patch, or an error when the request cannot be applied. */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function patchedValue(ticket, field, value, mode) {
  const expectedTypes = expectedTypesOf(field);

  if (mode === 'append') {
    return appendUnique(ticket[field], value, expectedTypes);
  }

  if (!isJsonValue(value) || value === null) {
    throw new PatchTicketError('value must be a non-null JSON value', REPAIR_TOOL_INVALID_INPUT);
  }
  if (expectedTypes && !expectedTypes.some((type) => matchesType(value, type))) {
    throw new PatchTicketError(
      'field "' + field + '" expects ' + expectedTypes.join(' or ') + ', received ' + typeof value,
      REPAIR_TOOL_INVALID_INPUT,
    );
  }
  return value;
}

/**
 * Patch one ticket field.
 *
 * @param {object} input
 * @param {string} input.ticketsPath
 * @param {string} input.ticketKey
 * @param {string} input.field
 * @param {*} input.value
 * @param {'overwrite'|'append'} [input.mode]
 * @param {boolean} [input.dryRun]
 * @returns {{ success: true, ticketKey: string, field: string, mode: string }}
 */
// [::TICKET::] PX-397 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-397 --for-spec --no-implementation-order`.
function patchTicket({ ticketsPath, ticketKey, field, value, mode = 'overwrite', dryRun = false }) {
  if (typeof field !== 'string' || !FIELD_NAME_RE.test(field)) {
    throw new PatchTicketError('field must be a valid ticket field name', REPAIR_TOOL_INVALID_INPUT);
  }
  if (mode !== 'overwrite' && mode !== 'append') {
    throw new PatchTicketError('mode must be overwrite or append', REPAIR_TOOL_INVALID_INPUT);
  }

  const document = readDocument(ticketsPath);
  const ticket = findTicket(document, ticketKey);
  ticket[field] = patchedValue(ticket, field, value, mode);

  const validation = validateTickets(document);
  if (!validation.valid) {
    throw new PatchTicketError(
      'patched document is invalid: ' + validation.errors.join('; '),
      REPAIR_TOOL_INVALID_INPUT,
    );
  }

  if (!dryRun) {
    writeTemporaryThenRename(ticketsPath, JSON.stringify(document, null, 2) + '\n');
  }

  return { success: true, ticketKey, field, mode };
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
    const result = patchTicket({
      ticketsPath: argumentValue(args, 'tickets'),
      ticketKey: argumentValue(args, 'ticket-key'),
      field: argumentValue(args, 'field'),
      value: JSON.parse(argumentValue(args, 'value') || 'null'),
      mode: argumentValue(args, 'mode') || 'overwrite',
      dryRun: args.includes('--dry-run'),
    });
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ success: false, code: error.code, error: error.message }) + '\n');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { PatchTicketError, patchTicket };
