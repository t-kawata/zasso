#!/usr/bin/env node
// [::TICKET::] PX-100: Create add-omission-ticket.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-100 --for-spec --no-implementation-order`.

/**
 * add-omission-ticket.js — Append an omission ticket to _tmp-omissions-*.json
 *
 * Reads a ticket JSON object from stdin, validates that all required fields
 * are present and non-empty, and appends it to the PX phase (phaseId=-1)
 * of the specified _tmp-omissions-*.json file.
 *
 * If the target file does not exist, creates it from Tickets.json schema template.
 *
 * Usage:
 *   echo '{...ticketJson}' | node add-omission-ticket.js --tmp-omissions=<path> [--tickets=<Tickets.json>]
 *
 * [::TICKET::] PX-100: add-omission-ticket implementation
 */

const fs = require('fs');
const path = require('path');

// -- Constants --

const REQUIRED_FIELDS = ['title', 'background', 'scope', 'testUnit', 'acceptanceCriteria', 'invariants'];
const REQUIRED_ARRAYS = ['scope', 'testUnit', 'acceptanceCriteria'];

// -- Pure functions (exported for testing) --

/**
 * Validate that a ticket object has all required non-empty fields.
 *
 * @param {object|null} ticket — Parsed ticket JSON object
 * @returns {string|null} — Error message string, or null if valid
 */
// [::TICKET::] PX-100, PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-100|PX-101) --for-spec --no-implementation-order`.
function validateTicket(ticket) {
  if (!ticket || typeof ticket !== 'object') {
    return 'Cannot parse ticket JSON from stdin: expected an object';
  }
  for (const field of REQUIRED_FIELDS) {
    const value = ticket[field];
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      return 'Ticket missing required field: ' + field;
    }
    if (REQUIRED_ARRAYS.includes(field)) {
      if (!Array.isArray(value) || value.length === 0) {
        return 'Ticket missing required field: ' + field + ' (must have at least 1 entry)';
      }
    }
  }
  return null;
}

/**
 * Append a ticket to the PX phase of the given data object.
 * Deep-clones the data, adds fromStub=false and stubs=[] to the ticket,
 * assigns auto-incremented ID, and appends to PX phase (phaseId=-1).
 *
 * @param {object} data — Parsed tmp-omissions JSON { phases[] }
 * @param {object} ticket — Ticket object to append
 * @returns {object} — New data object with appended ticket (immutable)
 */
// [::TICKET::] PX-100, PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-100|PX-101) --for-spec --no-implementation-order`.
function appendTicket(data, ticket) {
  const result = JSON.parse(JSON.stringify(data));

  // Find or create PX phase
  let pxPhase = result.phases.find(p => p.id === -1);
  if (!pxPhase) {
    pxPhase = { id: -1, name: '[X] Independent Phase', characteristics: '', tickets: [] };
    result.phases.push(pxPhase);
  }

  // Deep-clone ticket and add required fields
  const newTicket = JSON.parse(JSON.stringify(ticket));
  newTicket.fromStub = false;
  newTicket.stubs = [];

  // Auto-increment ID based on existing max in PX phase
  const existingIds = pxPhase.tickets.map(t => t.id).filter(id => typeof id === 'number');
  newTicket.id = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  newTicket.phaseId = -1;

  pxPhase.tickets.push(newTicket);
  return result;
}

/**
 * Validate that a foundOmissions array has all required sub-fields.
 * Required fields: contractId (string), criterion (string, A/B/C),
 * description (string), codeLocation (string).
 *
 * @param {Array|null} omissions — foundOmissions array
 * @returns {string|null} — Error message string, or null if valid
 */
// [::TICKET::] PX-102 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-102 --for-spec --no-implementation-order`.
function validateFoundOmissions(omissions) {
  if (!Array.isArray(omissions) || omissions.length === 0) {
    return 'foundOmissions must be a non-empty array';
  }
  const REQUIRED_FIELDS = ['contractId', 'criterion', 'description', 'codeLocation'];
  for (let i = 0; i < omissions.length; i++) {
    const item = omissions[i];
    if (!item || typeof item !== 'object') {
      return 'foundOmissions[' + i + '] is not an object';
    }
    for (const field of REQUIRED_FIELDS) {
      if (!item[field] || typeof item[field] !== 'string' || item[field].trim() === '') {
        return 'foundOmissions[' + i + '] missing required field: ' + field;
      }
    }
    if (!['A', 'B', 'C'].includes(item.criterion)) {
      return 'foundOmissions[' + i + '] criterion must be A, B, or C';
    }
  }
  return null;
}

/**
 * Look up a ticket in Tickets.json data by ticket key.
 * Key format: P{phaseId}-{ticketId} (PX-{id} for phase -1).
 * Returns a deep clone to prevent mutation of the original.
 *
 * @param {object} ticketsData — Parsed Tickets.json { phases[] }
 * @param {string} ticketKey — e.g. "P3-2" or "PX-53"
 * @returns {object|null} — Deep-cloned ticket object, or null
 */
// [::TICKET::] PX-102 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-102 --for-spec --no-implementation-order`.
function lookupTicket(ticketsData, ticketKey) {
  if (!ticketsData || !Array.isArray(ticketsData.phases)) return null;
  const match = ticketKey.match(/^P(-?\d+|X)-(\d+)$/);
  if (!match) return null;
  const phaseId = match[1] === 'X' ? -1 : parseInt(match[1], 10);
  const ticketId = parseInt(match[2], 10);
  for (const phase of ticketsData.phases) {
    if (phase.id === phaseId) {
      const ticket = phase.tickets.find(t => t.id === ticketId);
      if (ticket) return JSON.parse(JSON.stringify(ticket));
    }
  }
  return null;
}

/**
 * Find or create a tmp-omissions file from Tickets.json template.
 * If the file exists, parse and return its content.
 * If not, read Tickets.json and create a minimal template with a PX phase.
 *
 * @param {string} tmpOmissionsPath — Absolute path to _tmp-omissions-*.json
 * @param {string} ticketsJsonPath — Absolute path to Tickets.json
 * @returns {object} — Parsed JSON data object
 */
// [::TICKET::] PX-100, PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-100|PX-101) --for-spec --no-implementation-order`.
function findOrCreateTmpOmissions(tmpOmissionsPath, ticketsJsonPath) {
  if (fs.existsSync(tmpOmissionsPath)) {
    return JSON.parse(fs.readFileSync(tmpOmissionsPath, 'utf8'));
  }

  // Create from Tickets.json template
  const ticketsData = JSON.parse(fs.readFileSync(ticketsJsonPath, 'utf8'));
  const output = {
    title: ticketsData.title || 'tmp-omissions',
    metadata: {
      source: 'add-omission-ticket.js',
      generatedAt: ticketsData.metadata && ticketsData.metadata.generatedAt
        ? ticketsData.metadata.generatedAt
        : '',
      analyzedSections: ticketsData.metadata && ticketsData.metadata.analyzedSections
        ? ticketsData.metadata.analyzedSections
        : ''
    },
    phases: [{
      id: -1,
      name: '[X] Independent Phase',
      characteristics: '',
      tickets: []
    }]
  };

  fs.writeFileSync(tmpOmissionsPath, JSON.stringify(output, null, 2), 'utf8');
  return output;
}

/**
 * Format current timestamp as YYYYMMDDhhmmss.
 * @returns {string} — 14-digit timestamp
 */
// [::TICKET::] PX-100, PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-100|PX-101) --for-spec --no-implementation-order`.
function formatTimestamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return '' + y + m + d + h + min + s;
}

/**
 * Read all stdin data as a string. Returns Promise<string>.
 * @returns {Promise<string>}
 */
// [::TICKET::] PX-100, PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-100|PX-101) --for-spec --no-implementation-order`.
function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks.join('')));
  });
}

// -- CLI entry point --

// [::TICKET::] PX-100, PX-101, PX-102 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-100|PX-101|PX-102) --for-spec --no-implementation-order`.
async function main() {
  const args = process.argv.slice(2);
  let tmpOmissionsPath = null;
  let ticketsPath = 'Tickets.json';
  let ticketKey = null;

  for (const arg of args) {
    if (arg.startsWith('--tmp-omissions=')) {
      tmpOmissionsPath = arg.slice('--tmp-omissions='.length);
    }
    if (arg.startsWith('--tickets=')) {
      ticketsPath = arg.slice('--tickets='.length);
    }
    if (arg.startsWith('--ticket-key=')) {
      ticketKey = arg.slice('--ticket-key='.length);
    }
  }

  if (!tmpOmissionsPath) {
    const files = fs.readdirSync('.').filter(f => f.startsWith('_tmp-omissions-') && f.endsWith('.json'));
    if (files.length === 0) {
      const timestamp = formatTimestamp();
      tmpOmissionsPath = path.resolve('_tmp-omissions-' + timestamp + '.json');
    } else {
      files.sort().reverse();
      tmpOmissionsPath = path.resolve(files[0]);
    }
  } else {
    tmpOmissionsPath = path.resolve(tmpOmissionsPath);
  }

  const resolvedTicketsPath = path.resolve(ticketsPath);

  if (!fs.existsSync(resolvedTicketsPath)) {
    console.error('[add-omission-ticket] Error: Tickets.json not found:', resolvedTicketsPath);
    process.exit(1);
  }

  if (ticketKey) {
    // --ticket-key mode: copy existing ticket, add foundOmissions from stdin
    const ticketsData = JSON.parse(fs.readFileSync(resolvedTicketsPath, 'utf8'));
    const cloned = lookupTicket(ticketsData, ticketKey);
    if (!cloned) {
      console.error('[add-omission-ticket] Error: Ticket not found:', ticketKey);
      process.exit(1);
    }

    // Read foundOmissions from stdin
    const stdinData = await readStdin();
    let omissions;
    try {
      omissions = JSON.parse(stdinData);
    } catch (parseError) {
      console.error('[add-omission-ticket] Error: Cannot parse foundOmissions JSON from stdin');
      process.exit(1);
    }

    const validationError = validateFoundOmissions(omissions);
    if (validationError) {
      console.error('[add-omission-ticket] Error: ' + validationError);
      process.exit(1);
    }

    cloned.foundOmissions = omissions;
    cloned.phaseId = -1;
    cloned.status = 'todo';

    let data;
    try {
      data = findOrCreateTmpOmissions(tmpOmissionsPath, resolvedTicketsPath);
    } catch (readError) {
      console.error('[add-omission-ticket] Error: Cannot read/create tmp-omissions file:', readError.message);
      process.exit(1);
    }

    const updatedData = appendTicket(data, cloned);

    try {
      fs.writeFileSync(tmpOmissionsPath, JSON.stringify(updatedData, null, 2), 'utf8');
    } catch (writeError) {
      console.error('[add-omission-ticket] Error: Cannot write tmp-omissions file:', writeError.message);
      process.exit(1);
    }

    console.log(tmpOmissionsPath);
    console.error('[add-omission-ticket] Ticket copied with foundOmissions to:', tmpOmissionsPath);
  } else {
    // Original stdin-only mode: read and validate full ticket
    const stdinData = await readStdin();
    let ticket;
    try {
      ticket = JSON.parse(stdinData);
    } catch (parseError) {
      console.error('[add-omission-ticket] Error: Cannot parse ticket JSON from stdin');
      process.exit(1);
    }

    const validationError = validateTicket(ticket);
    if (validationError) {
      console.error('[add-omission-ticket] Error: ' + validationError);
      process.exit(1);
    }

    let data;
    try {
      data = findOrCreateTmpOmissions(tmpOmissionsPath, resolvedTicketsPath);
    } catch (readError) {
      console.error('[add-omission-ticket] Error: Cannot read/create tmp-omissions file:', readError.message);
      process.exit(1);
    }

    const updatedData = appendTicket(data, ticket);

    try {
      fs.writeFileSync(tmpOmissionsPath, JSON.stringify(updatedData, null, 2), 'utf8');
    } catch (writeError) {
      console.error('[add-omission-ticket] Error: Cannot write tmp-omissions file:', writeError.message);
      process.exit(1);
    }

    console.log(tmpOmissionsPath);
    console.error('[add-omission-ticket] Ticket appended to:', tmpOmissionsPath);
  }
}

// -- Export for testing --
module.exports = {
  validateTicket,
  appendTicket,
  findOrCreateTmpOmissions,
  formatTimestamp,
  lookupTicket,
  validateFoundOmissions
};

// Run as CLI
if (require.main === module) {
  main().catch(err => {
    console.error('[add-omission-ticket] Fatal error:', err.message);
    process.exit(1);
  });
}
