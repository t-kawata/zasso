#!/usr/bin/env node
// [::TICKET::] PX-100: Create add-omission-ticket.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-100 --for-spec --no-implementation-order`.

/**
 * add-omission-ticket.js — Append an omission ticket to _tmp-omissions-*.json
 *
 * Reads a ticket JSON object from stdin, validates that all required fields
 * are present and non-empty, and appends it to the max non-PX phase (PX-119 C005)
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

/** Sentinel string for idempotent inspection prefix detection */
const INSPECTION_SENTINEL = '[::INSPECTION_FLAGGED::]';

/** PX phase id (-1). New omission tickets are never appended here (PX-119 C005). */
const PX_PHASE_ID = -1;

/** Count occurrences of INSPECTION_SENTINEL in a string */
// [::TICKET::] PX-106, PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-106|PX-107) --for-spec --no-implementation-order`.
// [::TICKET::] PX-141 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-141 --for-spec --no-implementation-order`.
function countInspectionSentinels(background) {
  if (!background || typeof background !== 'string') return 0;
  return (background.match(/\[::INSPECTION_FLAGGED::\]/g) || []).length;
}

/** Strip all but the last occurrence of INSPECTION_SENTINEL */
// [::TICKET::] PX-106, PX-107 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-106|PX-107) --for-spec --no-implementation-order`.
function repairDuplicateSentinels(background) {
  const bg = background || '';
  const count = countInspectionSentinels(bg);
  if (count <= 1) return bg;
  const lastIdx = bg.lastIndexOf(INSPECTION_SENTINEL);
  return bg.slice(lastIdx);
}

/**
 * Prefix prepended to the background of every omission ticket added via add-omission-ticket.js.
 * Explains that the ticket failed ABC Inspection and must be re-implemented with all contracts fulfilled.
 */
const ABC_INSPECTION_PREFIX = INSPECTION_SENTINEL + '\n' +
  'This ticket has been flagged by the ABC Inspection Pipeline after completing the implementation lifecycle ' +
  '(make → plan → start → review → resolve). The actual source code was rigorously analyzed against three criteria:\n\n' +
  '  A — Contract Translation:   Are all Precondition/Postcondition/Invariant contracts accurately translated into test code?\n' +
  '  B — Violation Detection:    Can every contract violation be detected by an existing test assertion?\n' +
  '  C — Test Precision:         Are tests precise and unambiguous (no broad assertions, no missing edge cases)?\n\n' +
  'One or more ABC violations were confirmed. This ticket is hereby remanded for re-implementation. ' +
  'Every violation must be fully resolved, and every contract must be fulfilled in this final implementation round. ' +
  'Complete it this time.';

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
 * Append a ticket to the phase with the maximum id (never the PX phase).
 * Deep-clones the data, adds fromStub=false and stubs=[] to the ticket,
 * assigns auto-incremented ID within the max phase, and appends there.
 *
 * PX-119 C005: new omission tickets are appended to the max real phase so a
 * deferred STUB always references a future position, and are never placed in
 * the PX phase (phaseId = -1).
 *
 * @param {object} data — Parsed tmp-omissions JSON { phases[] }
 * @param {object} ticket — Ticket object to append
 * @returns {object} — New data object with appended ticket (immutable)
 */
// [::TICKET::] PX-100, PX-101, PX-106, PX-107, PX-119 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-119 --for-spec --no-implementation-order`.
// [::TICKET::] PX-119 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-119 --for-spec --no-implementation-order`.
function appendTicket(data, ticket) {
  const result = JSON.parse(JSON.stringify(data));

  // Target the phase with the max id among non-PX phases; create phase 0 if none.
  const nonPxPhases = result.phases.filter(p => p.id !== PX_PHASE_ID);
  let targetPhase;
  if (nonPxPhases.length > 0) {
    const maxPhaseId = Math.max(...nonPxPhases.map(p => p.id));
    targetPhase = nonPxPhases.find(p => p.id === maxPhaseId);
  } else {
    targetPhase = { id: 0, name: 'P0', characteristics: '', tickets: [] };
    result.phases.push(targetPhase);
  }

  // Deep-clone ticket and add required fields
  const newTicket = JSON.parse(JSON.stringify(ticket));
  newTicket.fromStub = false;
  newTicket.stubs = [];
  // PX-106: Idempotent sentinel guard — prepend only if no sentinel exists
  const alreadyFlagged = newTicket.background &&
    newTicket.background.startsWith(INSPECTION_SENTINEL);
  if (!alreadyFlagged) {
    newTicket.background = ABC_INSPECTION_PREFIX + '\n\n' + (newTicket.background || '');
  } else {
    // Repair duplicate sentinels that may exist from previous cycles
    newTicket.background = repairDuplicateSentinels(newTicket.background);
  }

  // Auto-increment ID based on existing max in the target phase
  const existingIds = targetPhase.tickets.map(t => t.id).filter(id => typeof id === 'number');
  newTicket.id = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  newTicket.phaseId = targetPhase.id;

  targetPhase.tickets.push(newTicket);
  return result;
}

/**
 * Validate that a foundOmissions array has the new evaluations[] structure.
 * Each entry must have evaluations[] array where each evaluation has:
 * criterion (A/B/C), passed (boolean), reason (string), evidence[] (non-empty array of {file, line}).
 *
 * @param {Array|null} omissions — foundOmissions array
 * @returns {string|null} — Error message string, or null if valid
 */
// [::TICKET::] PX-102, PX-103, PX-104, PX-105 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-102|PX-103|PX-104|PX-105) --for-spec --no-implementation-order`.
function validateFoundOmissions(omissions) {
  if (!Array.isArray(omissions) || omissions.length === 0) {
    return 'foundOmissions must be a non-empty array';
  }
  for (let i = 0; i < omissions.length; i++) {
    const item = omissions[i];
    if (!item || typeof item !== 'object') {
      return 'foundOmissions[' + i + '] is not an object';
    }
    if (!Array.isArray(item.evaluations) || item.evaluations.length === 0) {
      return 'foundOmissions[' + i + '] missing required field: evaluations';
    }
    for (let j = 0; j < item.evaluations.length; j++) {
      const ev = item.evaluations[j];
      if (!ev || typeof ev !== 'object') {
        return 'foundOmissions[' + i + '].evaluations[' + j + '] is not an object';
      }
      if (!['A', 'B', 'C'].includes(ev.criterion)) {
        return 'foundOmissions[' + i + '].evaluations[' + j + '] criterion must be A, B, or C';
      }
      if (typeof ev.passed !== 'boolean') {
        return 'foundOmissions[' + i + '].evaluations[' + j + '] missing required field: passed';
      }
      if (!ev.reason || typeof ev.reason !== 'string' || ev.reason.trim() === '') {
        return 'foundOmissions[' + i + '].evaluations[' + j + '] missing required field: reason';
      }
      if (!Array.isArray(ev.evidence) || ev.evidence.length === 0) {
        return 'foundOmissions[' + i + '].evaluations[' + j + '] missing required field: evidence';
      }
      for (let k = 0; k < ev.evidence.length; k++) {
        const e = ev.evidence[k];
        if (!e.file || typeof e.file !== 'string' || typeof e.line !== 'number' || e.line < 1) {
          return 'foundOmissions[' + i + '].evaluations[' + j + '].evidence[' + k + '] must have file (string) and line (positive number)';
        }
      }
    }
  }
  return null;
}

/**
 * Read 3 lines of source code starting from the given line (1-indexed).
 * Returns empty string if file is missing or line is out of bounds.
 *
 * @param {string} filePath — Absolute or relative path to source file
 * @param {number} line — 1-indexed starting line number
 * @returns {string} — Up to 3 lines of source code, or empty string
 */
// [::TICKET::] PX-105 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-105 --for-spec --no-implementation-order`.
function extractCodes(filePath, line) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const startIdx = line - 1;
    if (startIdx < 0 || startIdx >= lines.length) {
      return '';
    }
    const selected = lines.slice(startIdx, startIdx + 3);
    return selected.join('\n');
  } catch {
    return '';
  }
}

/**
 * Find a clone ticket in _tmp-omissions data by originalTicketKey.
 * Searches EVERY phase (PX and real) because appendTicket places omission
 * clones in the max real phase — a PX-phase-only search would miss them and
 * create duplicate clones for the same original key (PX-142 Defect 4).
 *
 * @param {object} data — Parsed _tmp-omissions-*.json { phases[] }
 * @param {string} originalKey — Original ticket key, e.g. "P0-4"
 * @returns {object|null} — Clone ticket object, or null
 */
// [::TICKET::] PX-103 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-103 --for-spec --no-implementation-order`.
// [::TICKET::] PX-142: findCloneByOriginalKey searches all phases. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-142 --for-spec --no-implementation-order`.
// [::TICKET::] PX-142 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-142 --for-spec --no-implementation-order`.
function findCloneByOriginalKey(data, originalKey) {
  if (!data || !Array.isArray(data.phases)) return null;
  for (const phase of data.phases) {
    for (const ticket of (phase.tickets || [])) {
      if (ticket.originalTicketKey === originalKey) {
        return ticket;
      }
    }
  }
  return null;
}

/**
 * Append a foundOmission to an existing clone, or create a new clone if none exists.
 * Searches for a clone by originalTicketKey. If found, appends to its foundOmissions[].
 * If not found, creates a new clone using lookupTicket and sets originalTicketKey.
 *
 * @param {object} data — Parsed _tmp-omissions-*.json { phases[] }
 * @param {string} originalKey — Original ticket key, e.g. "P0-4"
 * @param {Array} newOmissions — Array of foundOmission objects (already validated)
 * @returns {object} — Updated data object
 */
// [::TICKET::] PX-103 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-103 --for-spec --no-implementation-order`.
function appendFoundOmissions(data, originalKey, newOmissions) {
  const existingClone = findCloneByOriginalKey(data, originalKey);
  if (existingClone) {
    // Append to existing clone
    for (const om of newOmissions) {
      existingClone.foundOmissions.push(om);
    }
    return data;
  }
  // Create new clone — needs lookupTicket, but we don't have Tickets.json data here.
  // Create a minimal placeholder ticket that will be enriched later.
  if (!data.phases) data.phases = [];
  let pxPhase = data.phases.find(p => p.id === -1);
  if (!pxPhase) {
    pxPhase = { id: -1, name: '[X] Independent Phase', characteristics: '', tickets: [] };
    data.phases.push(pxPhase);
  }
  const existingIds = pxPhase.tickets.map(t => t.id).filter(id => typeof id === 'number');
  const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  const newClone = {
    id: newId,
    phaseId: -1,
    originalTicketKey: originalKey,
    fromStub: false,
    stubs: [],
    foundOmissions: []
  };
  for (const om of newOmissions) {
    newClone.foundOmissions.push(JSON.parse(JSON.stringify(om)));
  }
  pxPhase.tickets.push(newClone);
  return data;
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
 * Find the latest _tmp-omissions-*.json in CWD by scanning for files matching the pattern.
 * @returns {string|null} — Absolute path, or null if none found
 */
// [::TICKET::] PX-104 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-104 --for-spec --no-implementation-order`.
function findLatestTmpOmissions() {
  const files = fs.readdirSync('.').filter(f => /^_tmp-omissions-\d{14}\.json$/.test(f));
  if (files.length === 0) return null;
  files.sort().reverse();
  return path.resolve(files[0]);
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

// [::TICKET::] PX-100, PX-101, PX-102, PX-103, PX-104, PX-105 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-100|PX-101|PX-102|PX-103|PX-104|PX-105) --for-spec --no-implementation-order`.
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

  if (tmpOmissionsPath) {
    tmpOmissionsPath = path.resolve(tmpOmissionsPath);
  } else {
    const found = findLatestTmpOmissions();
    if (!found) {
      console.error('[add-omission-ticket] Error: No _tmp-omissions-*.json found in CWD. Run get-next-check-target-ticket.js first.');
      process.exit(1);
    }
    tmpOmissionsPath = found;
  }

  const resolvedTicketsPath = path.resolve(ticketsPath);

  if (!fs.existsSync(resolvedTicketsPath)) {
    console.error('[add-omission-ticket] Error: Tickets.json not found:', resolvedTicketsPath);
    process.exit(1);
  }

  if (ticketKey) {
    // --ticket-key mode: search for existing clone, append or create new
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

    // Convert line to codes by reading source files
    for (const omission of omissions) {
      for (const ev of (omission.evaluations || [])) {
        for (const e of (ev.evidence || [])) {
          if (typeof e.line === 'number') {
            const codes = extractCodes(e.file, e.line);
            if (!codes) {
              console.error('[add-omission-ticket] Error: Cannot read ' + e.file + ' at line ' + e.line);
              process.exit(1);
            }
            e.codes = codes;
            delete e.line;
          }
        }
      }
    }

    let data;
    try {
      data = findOrCreateTmpOmissions(tmpOmissionsPath, resolvedTicketsPath);
    } catch (readError) {
      console.error('[add-omission-ticket] Error: Cannot read/create tmp-omissions file:', readError.message);
      process.exit(1);
    }

    // Try to append to existing clone
    const existingClone = findCloneByOriginalKey(data, ticketKey);
    if (existingClone) {
      for (const om of omissions) {
        existingClone.foundOmissions.push(om);
      }
      try {
        fs.writeFileSync(tmpOmissionsPath, JSON.stringify(data, null, 2), 'utf8');
      } catch (writeError) {
        console.error('[add-omission-ticket] Error: Cannot write tmp-omissions file:', writeError.message);
        process.exit(1);
      }
      console.log(tmpOmissionsPath);
      console.error('[add-omission-ticket] Omission appended to existing clone for:', ticketKey);
    } else {
      // Create new clone with originalTicketKey
      const ticketsData = JSON.parse(fs.readFileSync(resolvedTicketsPath, 'utf8'));
      const cloned = lookupTicket(ticketsData, ticketKey);
      if (!cloned) {
        console.error('[add-omission-ticket] Error: Ticket not found:', ticketKey);
        process.exit(1);
      }

      cloned.foundOmissions = omissions;
      cloned.originalTicketKey = ticketKey;
      cloned.phaseId = -1;
      cloned.status = 'todo';

      const updatedData = appendTicket(data, cloned);

      try {
        fs.writeFileSync(tmpOmissionsPath, JSON.stringify(updatedData, null, 2), 'utf8');
      } catch (writeError) {
        console.error('[add-omission-ticket] Error: Cannot write tmp-omissions file:', writeError.message);
        process.exit(1);
      }

      console.log(tmpOmissionsPath);
      console.error('[add-omission-ticket] Ticket cloned with foundOmissions to:', tmpOmissionsPath);
    }
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
  validateFoundOmissions,
  findCloneByOriginalKey,
  appendFoundOmissions,
  findLatestTmpOmissions,
  extractCodes,
  ABC_INSPECTION_PREFIX,
  INSPECTION_SENTINEL,
  countInspectionSentinels,
  repairDuplicateSentinels,
};

// Run as CLI
if (require.main === module) {
  main().catch(err => {
    console.error('[add-omission-ticket] Fatal error:', err.message);
    process.exit(1);
  });
}
