#!/usr/bin/env node

/**
 * find-ticket.js — Shared module for finding tickets in Tickets.json
 *
 * Exports:
 *   findTicket(ticketsData, ticketKey)  — Find a ticket by key
 *   ticketExists(ticketsData, ticketKey) — Check if a ticket key exists
 *   ticketIsDone(ticketsData, ticketKey) — Check if a ticket is done
 *
 * Extracted from enumerate-ticket-targets.js and validate-ticket-targets.js
 * to eliminate DRY violation. All functions are pure and deterministic.
 *
 * [::TICKET::] PX-81: findTicket() DRY共通化とexistingScriptsCalled疑似フラグ除去
 */

/**
 * Find a ticket in the Tickets.json data structure.
 * @param {object} ticketsData — Parsed Tickets.json
 * @param {string} ticketKey — e.g. "PX-77" or "P3-2"
 * @returns {object|null}
 */
// [::TICKET::] PX-81 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-81 --for-spec --no-implementation-order`.
function findTicket(ticketsData, ticketKey) {
  const pxMatch = ticketKey.match(/^PX-(\d+)$/);
  const pMatch = ticketKey.match(/^P(\d+)-(\d+)$/);
  let targetPhaseId, targetId;
  if (pxMatch) {
    targetPhaseId = -1;
    targetId = parseInt(pxMatch[1], 10);
  } else if (pMatch) {
    targetPhaseId = parseInt(pMatch[1], 10);
    targetId = parseInt(pMatch[2], 10);
  } else {
    return null;
  }

  for (const phase of ticketsData.phases || []) {
    for (const t of phase.tickets || []) {
      if (t.id === targetId && t.phaseId === targetPhaseId) {
        return t;
      }
    }
  }
  return null;
}

/**
 * Check if a ticket key exists in Tickets.json.
 * @param {object} ticketsData
 * @param {string} ticketKey
 * @returns {boolean}
 */
// [::TICKET::] PX-81 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-81 --for-spec --no-implementation-order`.
function ticketExists(ticketsData, ticketKey) {
  const pxMatch = ticketKey.match(/^PX-(\d+)$/);
  const pMatch = ticketKey.match(/^P(\d+)-(\d+)$/);
  let targetPhaseId, targetId;
  if (pxMatch) {
    targetPhaseId = -1;
    targetId = parseInt(pxMatch[1], 10);
  } else if (pMatch) {
    targetPhaseId = parseInt(pMatch[1], 10);
    targetId = parseInt(pMatch[2], 10);
  } else {
    return false;
  }

  for (const phase of ticketsData.phases || []) {
    for (const t of phase.tickets || []) {
      if (t.id === targetId && t.phaseId === targetPhaseId) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if a ticket is completed (status === "done").
 * @param {object} ticketsData
 * @param {string} ticketKey
 * @returns {boolean}
 */
// [::TICKET::] PX-81 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-81 --for-spec --no-implementation-order`.
function ticketIsDone(ticketsData, ticketKey) {
  const pxMatch = ticketKey.match(/^PX-(\d+)$/);
  const pMatch = ticketKey.match(/^P(\d+)-(\d+)$/);
  let targetPhaseId, targetId;
  if (pxMatch) {
    targetPhaseId = -1;
    targetId = parseInt(pxMatch[1], 10);
  } else if (pMatch) {
    targetPhaseId = parseInt(pMatch[1], 10);
    targetId = parseInt(pMatch[2], 10);
  } else {
    return false;
  }

  for (const phase of ticketsData.phases || []) {
    for (const t of phase.tickets || []) {
      if (t.id === targetId && t.phaseId === targetPhaseId) {
        return t.status === 'done';
      }
    }
  }
  return false;
}

module.exports = { findTicket, ticketExists, ticketIsDone };
