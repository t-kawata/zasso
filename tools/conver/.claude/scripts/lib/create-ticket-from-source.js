#!/usr/bin/env node
// [::TICKET::] PX-122: Create lib/create-ticket-from-source.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-122 --for-spec --no-implementation-order`.

/**
 * create-ticket-from-source.js — Shared core for dedicated ticket-creation scripts.
 *
 * Deep-clones a source ticket as a structural template, preserves the relational
 * identity fields (PRESERVE set) with zero loss, strips completed-ticket residue,
 * applies seed edits to content fields, appends a new ticket to the non-PX max
 * real phase (status 'todo'), and returns the real new key.
 *
 * Used by create-resolving-ticket.js (find, PX-123) and create-deferral-ticket.js
 * (resolve, PX-124). Pure function: takes parsed Tickets.json, returns the merged
 * data; the caller performs file I/O.
 *
 * Usage:
 *   const { createTicketFromSource } = require('./create-ticket-from-source.js');
 *   const res = createTicketFromSource({ ticketsData, sourceKey: 'P0-5', seed: { title: '...' } });
 */

const { validateTickets } = require('./validate-tickets.js');

// -- Constants --

/** Relational identity fields that must never be lost during clone (PRESERVE set). */
const PRESERVE_FIELDS = [
  'nodeIds',
  'relatedTicketIds',
  'referenceSection',
  'referenceUrls',
  'sourcePaths',
  'rfcDiscrepancies'
];

/** Completed-ticket residue removed on clone so the new ticket is an active obligation. */
const STRIP_ON_CLONE = [
  'completedAt',
  'startedAt',
  // PX-142 Defect 1: a new ticket must not inherit the source's inspection
  // failure record (foundOmissions) nor the omission-clone provenance marker
  // (originalTicketKey) — either would misclassify the new ticket downstream.
  'foundOmissions',
  'originalTicketKey'
];

/**
 * Leading [::INSPECTION_FLAGGED::] sentinel block (up to the first blank line)
 * that add-omission-ticket.js / create-tmp-omissions.js prepend to a flagged
 * ticket's background. A cloned ticket must not carry the inspection stigma.
 */
const LEADING_SENTINEL_BLOCK_RE = /^\[::INSPECTION_FLAGGED::\][\s\S]*?\n\n/;

/** The independent (PX) phase id. New tickets are never appended here. */
const PX_PHASE_ID = -1;

/** Round-aware completion status marker (R1, R2, ...) — a past-round record. */
const ROUND_STATUS_RE = /^R[1-9]\d*$/;

// -- Pure helpers (exported for testing) --

/**
 * Find a ticket by key (P{phase}-{id} / PX-{id}) in Tickets.json data.
 * @param {object} ticketsData — Parsed Tickets.json { phases[] }
 * @param {string} ticketKey — e.g. "P3-2" or "PX-53"
 * @returns {object|null} — The ticket object or null
 */
// [::TICKET::] PX-122: findTicket. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-122 --for-spec --no-implementation-order`.
// [::TICKET::] PX-122, PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-122|PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function findTicket(ticketsData, ticketKey) {
  if (!ticketsData || !Array.isArray(ticketsData.phases) || !ticketKey) return null;
  const match = ticketKey.match(/^P(-?\d+|X)-(\d+)$/);
  if (!match) return null;
  const phaseId = match[1] === 'X' ? -1 : parseInt(match[1], 10);
  const ticketId = parseInt(match[2], 10);
  for (const phase of ticketsData.phases) {
    if (phase.id !== phaseId) continue;
    const ticket = (phase.tickets || []).find(t => t.id === ticketId);
    if (ticket) return ticket;
  }
  return null;
}

/**
 * Strip completed-ticket residue: force status 'todo', remove startedAt/completedAt,
 * remove the inspection record (foundOmissions / originalTicketKey), and drop the
 * leading [::INSPECTION_FLAGGED::] sentinel block from the background.
 * Pure — returns a new object, never mutates the input.
 * @param {object} ticket — Source ticket (clone)
 * @returns {object} — New ticket with residue stripped
 */
// [::TICKET::] PX-122: stripCompletedResidue. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-122 --for-spec --no-implementation-order`.
// [::TICKET::] PX-122, PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-122|PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
// [::TICKET::] PX-142: strip inspection residue on clone. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-142 --for-spec --no-implementation-order`.
// [::TICKET::] PX-142 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-142 --for-spec --no-implementation-order`.
function stripCompletedResidue(ticket) {
  const next = { ...ticket };
  next.status = 'todo';
  for (const field of STRIP_ON_CLONE) {
    delete next[field];
  }
  // A new ticket must not inherit the inspection-failed stigma that a flagged
  // source carries in its background. Only the leading sentinel block is removed;
  // backgrounds without a sentinel are untouched (the regex is a no-op).
  if (typeof next.background === 'string') {
    next.background = next.background.replace(LEADING_SENTINEL_BLOCK_RE, '');
  }
  return next;
}

/**
 * Apply seed edits to content fields. PRESERVE fields are never overwritten,
 * so the relational identity cannot be lost through a seed.
 * Pure — returns a new object.
 * @param {object} ticket — New ticket (clone with residue stripped)
 * @param {object} seed — Caller edits (title/scope/background/...)
 * @returns {object} — Ticket with seed edits applied
 */
// [::TICKET::] PX-122: applySeedEdits. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-122 --for-spec --no-implementation-order`.
// [::TICKET::] PX-122, PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-122|PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function applySeedEdits(ticket, seed) {
  const next = { ...ticket };
  for (const key of Object.keys(seed || {})) {
    if (PRESERVE_FIELDS.includes(key)) continue;
    next[key] = seed[key];
  }
  return next;
}

/**
 * Resolve the max non-PX real phase; create phase 0 when none exists.
 * Mutates the given result data only to push a newly created phase 0.
 * @param {object} result — Deep-cloned Tickets.json data
 * @returns {{ id: number, name: string, tickets: object[] }} — The target phase
 */
// [::TICKET::] PX-122: resolveMaxRealPhase. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-122 --for-spec --no-implementation-order`.
// [::TICKET::] PX-122, PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-122|PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function resolveMaxRealPhase(result) {
  const realPhases = result.phases.filter(p => p.id !== PX_PHASE_ID);
  if (realPhases.length === 0) {
    const phase = { id: 0, name: 'P0', characteristics: '', tickets: [] };
    result.phases.push(phase);
    return phase;
  }
  const maxPhaseId = Math.max(...realPhases.map(p => p.id));
  return realPhases.find(p => p.id === maxPhaseId);
}

/**
 * Append a ticket to a phase with an auto-incremented id.
 * @param {object} phase — Target phase (max real phase or newly created phase 0)
 * @param {object} ticket — New ticket
 * @returns {{ id: number, phaseId: number, ticket: object }} — Appended ticket metadata
 */
// [::TICKET::] PX-122: appendTicketToPhase. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-122 --for-spec --no-implementation-order`.
// [::TICKET::] PX-122, PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-122|PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function appendTicketToPhase(phase, ticket) {
  const existingIds = phase.tickets.map(t => t.id).filter(id => typeof id === 'number');
  const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  ticket.id = newId;
  ticket.phaseId = phase.id;
  phase.tickets.push(ticket);
  return { id: newId, phaseId: phase.id, ticket };
}

// -- Public API --

/**
 * Create a new ticket from a source ticket's deep clone.
 *
 * Preconditions:
 *  - ticketsData is a parsed Tickets.json { title, phases[] }
 *  - sourceKey references an existing ticket (P{phase}-{id} or PX-{id})
 *  - seed supplies at least a title (schema-required field)
 *
 * Postconditions:
 *  - The new ticket preserves every PRESERVE field from the source (zero loss)
 *  - The new ticket has status 'todo' and no completedAt/startedAt/round status
 *  - The new ticket is appended to the non-PX max real phase (phase 0 if none)
 *  - The merged data passes validate-tickets.js, or the call returns failure
 *    without mutating the input
 *  - The returned key matches the actually-created ticket (P{phaseId}-{id})
 *
 * @param {object} params
 * @param {object} params.ticketsData — Parsed Tickets.json
 * @param {string} params.sourceKey — Source ticket key
 * @param {object} [params.seed] — Content edits (title required)
 * @returns {{ success: true, key: string, ticket: object, data: object }
 *          |{ success: false, error: string, errors?: string[] }}
 */
// [::TICKET::] PX-122: createTicketFromSource. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-122 --for-spec --no-implementation-order`.
// [::TICKET::] PX-122, PX-123, PX-124, PX-125, PX-126, PX-127 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-122|PX-123|PX-124|PX-125|PX-126|PX-127) --for-spec --no-implementation-order`.
function createTicketFromSource({ ticketsData, sourceKey, seed = {} }) {
  // The new ticket must carry a NEW title from the seed, never the source's old
  // title — otherwise it becomes an indistinguishable retry of the past ticket.
  if (!seed || typeof seed.title !== 'string' || seed.title.trim() === '') {
    return { success: false, error: 'Seed must supply a non-empty title for the new ticket' };
  }

  const source = findTicket(ticketsData, sourceKey);
  if (!source) {
    return { success: false, error: 'Source ticket not found: ' + sourceKey };
  }

  // Deep clone to guarantee immutability of the input and zero relational loss.
  const result = JSON.parse(JSON.stringify(ticketsData));
  let ticket = JSON.parse(JSON.stringify(source));

  ticket = stripCompletedResidue(ticket);
  ticket = applySeedEdits(ticket, seed);

  const phase = resolveMaxRealPhase(result);
  const appended = appendTicketToPhase(phase, ticket);

  const validation = validateTickets(result);
  if (!validation.valid) {
    return {
      success: false,
      error: 'Validation failed for merged Tickets.json',
      errors: validation.errors
    };
  }

  return {
    success: true,
    key: 'P' + appended.phaseId + '-' + appended.id,
    ticket: appended.ticket,
    data: result
  };
}

module.exports = {
  createTicketFromSource,
  findTicket,
  stripCompletedResidue,
  LEADING_SENTINEL_BLOCK_RE,
  applySeedEdits,
  resolveMaxRealPhase,
  appendTicketToPhase,
  PRESERVE_FIELDS,
  STRIP_ON_CLONE,
  PX_PHASE_ID
};
