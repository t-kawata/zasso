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

// [::TICKET::] PX-100, PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-100|PX-101) --for-spec --no-implementation-order`.
async function main() {
  const args = process.argv.slice(2);
  let tmpOmissionsPath = null;
  let ticketsPath = 'Tickets.json';

  for (const arg of args) {
    if (arg.startsWith('--tmp-omissions=')) {
      tmpOmissionsPath = arg.slice('--tmp-omissions='.length);
    }
    if (arg.startsWith('--tickets=')) {
      ticketsPath = arg.slice('--tickets='.length);
    }
  }

  if (!tmpOmissionsPath) {
    // Auto-detect latest _tmp-omissions-*.json in CWD
    const files = fs.readdirSync('.').filter(f => f.startsWith('_tmp-omissions-') && f.endsWith('.json'));
    if (files.length === 0) {
      // Generate a new filename
      const timestamp = formatTimestamp();
      tmpOmissionsPath = path.resolve('_tmp-omissions-' + timestamp + '.json');
    } else {
      // Pick the one with the latest timestamp
      files.sort().reverse();
      tmpOmissionsPath = path.resolve(files[0]);
    }
  } else {
    tmpOmissionsPath = path.resolve(tmpOmissionsPath);
  }

  const resolvedTicketsPath = path.resolve(ticketsPath);

  // Check Tickets.json exists
  if (!fs.existsSync(resolvedTicketsPath)) {
    console.error('[add-omission-ticket] Error: Tickets.json not found:', resolvedTicketsPath);
    process.exit(1);
  }

  // Read stdin
  const stdinData = await readStdin();

  // Parse JSON
  let ticket;
  try {
    ticket = JSON.parse(stdinData);
  } catch (parseError) {
    console.error('[add-omission-ticket] Error: Cannot parse ticket JSON from stdin');
    process.exit(1);
  }

  // Validate required fields
  const validationError = validateTicket(ticket);
  if (validationError) {
    console.error('[add-omission-ticket] Error: ' + validationError);
    process.exit(1);
  }

  // Find or create tmp-omissions file
  let data;
  try {
    data = findOrCreateTmpOmissions(tmpOmissionsPath, resolvedTicketsPath);
  } catch (readError) {
    console.error('[add-omission-ticket] Error: Cannot read/create tmp-omissions file:', readError.message);
    process.exit(1);
  }

  // Append ticket
  const updatedData = appendTicket(data, ticket);

  // Write output
  try {
    fs.writeFileSync(tmpOmissionsPath, JSON.stringify(updatedData, null, 2), 'utf8');
  } catch (writeError) {
    console.error('[add-omission-ticket] Error: Cannot write tmp-omissions file:', writeError.message);
    process.exit(1);
  }

  console.log(tmpOmissionsPath);
  console.error('[add-omission-ticket] Ticket appended to:', tmpOmissionsPath);
}

// -- Export for testing --
module.exports = {
  validateTicket,
  appendTicket,
  findOrCreateTmpOmissions,
  formatTimestamp
};

// Run as CLI
if (require.main === module) {
  main().catch(err => {
    console.error('[add-omission-ticket] Fatal error:', err.message);
    process.exit(1);
  });
}
