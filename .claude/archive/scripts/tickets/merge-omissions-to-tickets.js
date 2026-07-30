#!/usr/bin/env node
// [::TICKET::] PX-102: Complete find-omissions pipeline. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-102 --for-spec --no-implementation-order`.

/**
 * merge-omissions-to-tickets.js — Merge _tmp-omissions-*.json into Tickets.json
 *
 * Reads the _tmp-omissions-*.json file produced by the find-omissions pipeline,
 * validates all tickets' foundOmissions fields, groups them by phaseId, assigns
 * sequential IDs, and merges them into Tickets.json without overwriting existing tickets.
 *
 * Usage:
 *   node merge-omissions-to-tickets.js [--tickets=<Tickets.json>] [--omissions=<_tmp-omissions.json>]
 *
 * [::TICKET::] PX-102: merge-omissions-to-tickets implementation
 */

const fs = require('fs');
const path = require('path');

const TMP_OMISSIONS_PATTERN = /^_tmp-omissions-\d{14}\.json$/;

// -- Pure functions (exported for testing) --

/**
 * Validate all tickets in the omissions data.
 * Checks that each ticket has valid foundOmissions (or empty array for backward compat).
 *
 * @param {object} data — Parsed _tmp-omissions-*.json { phases[] }
 * @returns {string|null} — Error message or null
 */
// [::TICKET::] PX-102 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-102 --for-spec --no-implementation-order`.
function validateTickets(data) {
  if (!data || !Array.isArray(data.phases)) {
    return 'Invalid omissions data: missing phases array';
  }
  for (const phase of data.phases) {
    if (!Array.isArray(phase.tickets)) continue;
    for (let i = 0; i < phase.tickets.length; i++) {
      const ticket = phase.tickets[i];
      // foundOmissions is optional for backward compatibility
      if (ticket.foundOmissions !== undefined) {
        if (!Array.isArray(ticket.foundOmissions)) {
          return 'Ticket ' + (ticket.id || '?') + ' foundOmissions must be an array';
        }
      }
    }
  }
  return null;
}

/**
 * Group omission tickets by their phaseId.
 * Returns a Map<phaseId, ticket[]>.
 *
 * @param {object} data — Parsed _tmp-omissions-*.json { phases[] }
 * @returns {Map<number, Array>} — Grouped tickets
 */
// [::TICKET::] PX-102 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-102 --for-spec --no-implementation-order`.
function groupByPhase(data) {
  const grouped = new Map();
  for (const phase of (data.phases || [])) {
    for (const ticket of (phase.tickets || [])) {
      const targetPhaseId = ticket.phaseId !== undefined ? ticket.phaseId : -1;
      if (!grouped.has(targetPhaseId)) {
        grouped.set(targetPhaseId, []);
      }
      grouped.get(targetPhaseId).push(ticket);
    }
  }
  return grouped;
}

/**
 * Assign sequential IDs to omission tickets within each phase group.
 * IDs start from max(existing phase IDs) + 1 to avoid conflicts.
 *
 * @param {Map<number, Array>} grouped — Grouped tickets from groupByPhase()
 * @param {object} ticketsData — Parsed Tickets.json { phases[] }
 * @returns {Map<number, Array>} — Grouped tickets with assigned IDs
 */
// [::TICKET::] PX-102 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-102 --for-spec --no-implementation-order`.
function reassignIds(grouped, ticketsData) {
  const result = new Map();
  for (const [phaseId, tickets] of grouped) {
    // Find existing max ID in this phase in Tickets.json
    const phase = (ticketsData.phases || []).find(p => p.id === phaseId);
    const existingIds = phase ? phase.tickets.map(t => t.id).filter(id => typeof id === 'number') : [];
    let nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;

    const renumbered = tickets.map((ticket, idx) => {
      const cloned = JSON.parse(JSON.stringify(ticket));
      cloned.id = nextId + idx;
      cloned.phaseId = phaseId;
      // Strip fields that should not carry over
      delete cloned.fromStub;
      delete cloned.stubs;
      delete cloned.changes;
      delete cloned.startedAt;
      return cloned;
    });
    result.set(phaseId, renumbered);
  }
  return result;
}

/**
 * Merge omission tickets into Tickets.json data.
 * Creates phases that don't exist yet.
 *
 * @param {object} ticketsData — Parsed Tickets.json { phases[] }
 * @param {object} omissionsData — Parsed _tmp-omissions-*.json { phases[] }
 * @returns {object} — Updated ticketsData (mutated for performance + returned)
 */
// [::TICKET::] PX-102 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-102 --for-spec --no-implementation-order`.
function mergeToTickets(ticketsData, omissionsData) {
  // Validate
  const validationError = validateTickets(omissionsData);
  if (validationError) {
    throw new Error(validationError);
  }

  // Group and reassign IDs
  const grouped = groupByPhase(omissionsData);
  const renumbered = reassignIds(grouped, ticketsData);

  // Merge into Tickets.json
  for (const [phaseId, tickets] of renumbered) {
    let phase = ticketsData.phases.find(p => p.id === phaseId);
    if (!phase) {
      phase = {
        id: phaseId,
        name: 'Phase ' + phaseId,
        characteristics: '',
        tickets: []
      };
      ticketsData.phases.push(phase);
    }
    for (const ticket of tickets) {
      phase.tickets.push(ticket);
    }
  }

  return ticketsData;
}

// -- I/O functions (not exported, used by main) --

// [::TICKET::] PX-102 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-102 --for-spec --no-implementation-order`.
function findLatestTmpOmssions() {
  const files = fs.readdirSync('.').filter(f => TMP_OMISSIONS_PATTERN.test(f));
  if (files.length === 0) return null;
  files.sort().reverse();
  return path.resolve(files[0]);
}

// -- CLI entry point --

// [::TICKET::] PX-102 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-102 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  let ticketsPath = 'Tickets.json';
  let omissionsPath = null;

  for (const arg of args) {
    if (arg.startsWith('--tickets=')) {
      ticketsPath = arg.slice('--tickets='.length);
    }
    if (arg.startsWith('--omissions=')) {
      omissionsPath = arg.slice('--omissions='.length);
    }
  }

  const resolvedTicketsPath = path.resolve(ticketsPath);

  if (!fs.existsSync(resolvedTicketsPath)) {
    console.error('[merge-omissions] Error: Tickets.json not found:', resolvedTicketsPath);
    process.exit(1);
  }

  // Auto-detect omissions file if not specified
  if (!omissionsPath) {
    const found = findLatestTmpOmssions();
    if (!found) {
      console.error('[merge-omissions] Error: No _tmp-omissions-*.json found in CWD');
      process.exit(1);
    }
    omissionsPath = found;
  } else {
    omissionsPath = path.resolve(omissionsPath);
  }

  if (!fs.existsSync(omissionsPath)) {
    console.error('[merge-omissions] Error: Omissions file not found:', omissionsPath);
    process.exit(1);
  }

  // Read both files
  let ticketsData, omissionsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(resolvedTicketsPath, 'utf8'));
    omissionsData = JSON.parse(fs.readFileSync(omissionsPath, 'utf8'));
  } catch (readError) {
    console.error('[merge-omissions] Error: Cannot read files:', readError.message);
    process.exit(1);
  }

  // Merge
  try {
    mergeToTickets(ticketsData, omissionsData);
  } catch (mergeError) {
    console.error('[merge-omissions] Error: ' + mergeError.message);
    process.exit(1);
  }

  // Write back
  try {
    fs.writeFileSync(resolvedTicketsPath, JSON.stringify(ticketsData, null, 2), 'utf8');
  } catch (writeError) {
    console.error('[merge-omissions] Error: Cannot write Tickets.json:', writeError.message);
    process.exit(1);
  }

  console.log('[merge-omissions] Merged omission tickets into:', resolvedTicketsPath);
}

// -- Export for testing --
module.exports = {
  validateTickets,
  groupByPhase,
  reassignIds,
  mergeToTickets
};

if (require.main === module) {
  main();
}
