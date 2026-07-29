#!/usr/bin/env node

/**
 * insert-stub.js — Insert a [::STUB::] marker with ticket-ref validation
 *
 * Inserts a [::STUB::] marker at a specified line in a source file,
 * but ONLY if the referenced ticket exists in Tickets.json.
 * This prevents ORPHAN_TICKET_REF crimes by validating at insertion time.
 *
 * MUST RESOLVE form is NOT supported — every STUB must reference an existing ticket.
 *
 * Usage:
 *   node insert-stub.js \
 *     --file=<path> \
 *     --line=<N> \
 *     --ticket-ref=<P{phase}-{id}> \
 *     --description=<text> \
 *     --tickets-path=<Tickets.json>
 *
 * Exported function:
 *   insertStub({ file, line, ticketRef, description, ticketsPath })
 *     -> { inserted: true }
 *     throws InsertStubError on validation failure
 *
 * [::TICKET::] PX-94: insert-stub.js — ticket-validated STUB marker insertion script
 */

const fs = require('fs');
const path = require('path');
const { ticketExists } = require('../lib/find-ticket');

// Regex: must match P{phase}-{id} format (e.g. P0-1, PX-94)
const TICKET_REF_RE = /^P[A-Z0-9]+-\d+$/;

/**
 * Custom error class for insert-stub validation failures.
 */
// [::TICKET::] PX-95, PX-94 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-95|PX-94) --for-spec --no-implementation-order`.
class InsertStubError extends Error {
// [::TICKET::] PX-95, PX-94 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-95|PX-94) --for-spec --no-implementation-order`.
  constructor(message) {
    super(message);
    this.name = 'InsertStubError';
  }
}

/**
 * Validate all inputs and, on success, insert a [::STUB::] marker.
 *
 * @param {object} opts
 * @param {string} opts.file         - Path to source file
 * @param {number} opts.line         - 1-indexed line number to insert at
 * @param {string} opts.ticketRef    - Ticket key (e.g. "P0-1", "PX-94")
 * @param {string} opts.description  - Description of what the stub covers
 * @param {string} opts.ticketsPath  - Path to Tickets.json
 * @returns {{inserted: boolean}}
 * @throws {InsertStubError} on validation failure
 */
// [::TICKET::] PX-95, PX-94 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-95|PX-94) --for-spec --no-implementation-order`.
function insertStub({ file, line, ticketRef, description, ticketsPath }) {
  // --- 1. Validate required arguments ---
  if (!file || typeof file !== 'string') {
    throw new InsertStubError('--file is required and must be a non-empty string');
  }
  if (!Number.isInteger(line) || line < 1) {
    throw new InsertStubError('--line is required and must be a positive integer');
  }
  if (!ticketRef || typeof ticketRef !== 'string') {
    throw new InsertStubError('--ticket-ref is required and must be a non-empty string');
  }
  if (!ticketsPath || typeof ticketsPath !== 'string') {
    throw new InsertStubError('--tickets-path is required and must be a non-empty string');
  }

  // --- 2. Reject MUST RESOLVE (forbidden) ---
  if (ticketRef === 'MUST RESOLVE') {
    throw new InsertStubError(
      'MUST RESOLVE is not allowed as ticket-ref. ' +
      'All STUB markers must reference an existing ticket in Tickets.json.'
    );
  }

  // --- 3. Validate ticket-ref format ---
  if (!TICKET_REF_RE.test(ticketRef)) {
    throw new InsertStubError(
      'Invalid ticket-ref format: "' + ticketRef + '". ' +
      'Expected format: P{phase}-{id} (e.g. "P0-1", "PX-94").'
    );
  }

  // --- 4. Resolve absolute paths ---
  const absFile = path.resolve(file);
  const absTicketsPath = path.resolve(ticketsPath);

  // --- 5. Check Tickets.json exists ---
  if (!fs.existsSync(absTicketsPath)) {
    throw new InsertStubError(
      'Tickets.json not found: ' + absTicketsPath
    );
  }

  // --- 6. Validate ticket-ref exists in Tickets.json ---
  let ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(absTicketsPath, 'utf8'));
  } catch (e) {
    throw new InsertStubError(
      'Failed to parse Tickets.json: ' + absTicketsPath + ' — ' + e.message
    );
  }

  if (!ticketExists(ticketsData, ticketRef)) {
    throw new InsertStubError(
      'Ticket "' + ticketRef + '" does not exist in Tickets.json. ' +
      'STUB marker cannot be inserted. ' +
      'Use an existing ticket key from Tickets.json.'
    );
  }

  // --- 7. Check source file exists ---
  if (!fs.existsSync(absFile)) {
    throw new InsertStubError(
      'Source file not found: ' + absFile
    );
  }

  // --- 8. Read source file ---
  let content;
  try {
    content = fs.readFileSync(absFile, 'utf8');
  } catch (e) {
    throw new InsertStubError(
      'Failed to read source file: ' + absFile + ' — ' + e.message
    );
  }

  const lines = content.split('\n');

  // --- 9. Validate line range ---
  if (line > lines.length) {
    throw new InsertStubError(
      'Line ' + line + ' exceeds file length (' + lines.length + ' lines). ' +
      'File: ' + absFile
    );
  }

  // --- 10. Check for duplicate STUB at target line ---
  const targetLine = lines[line - 1];
  if (targetLine && targetLine.includes('[::STUB::]')) {
    throw new InsertStubError(
      'A [::STUB::] marker already exists at line ' + line + ' in ' + absFile + ': "' +
      targetLine.trim().substring(0, 80) + '"'
    );
  }

  // --- 11. Build and insert the marker ---
  const descriptionClean = (description || 'Implementation pending').trim();
  const marker = '// [::STUB::] ' + ticketRef + ': ' + descriptionClean;

  lines.splice(line - 1, 0, marker);
  fs.writeFileSync(absFile, lines.join('\n'), 'utf8');

  return { inserted: true };
}

// ===========================================================================
// CLI entry point
// ===========================================================================
// [::TICKET::] PX-95, PX-94 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-95|PX-94) --for-spec --no-implementation-order`.
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};

  for (const a of args) {
    if (a.startsWith('--file=')) opts.file = a.slice('--file='.length);
    else if (a.startsWith('--line=')) opts.line = parseInt(a.slice('--line='.length), 10);
    else if (a.startsWith('--ticket-ref=')) opts.ticketRef = a.slice('--ticket-ref='.length);
    else if (a.startsWith('--description=')) opts.description = a.slice('--description='.length);
    else if (a.startsWith('--tickets-path=')) opts.ticketsPath = a.slice('--tickets-path='.length);
    else {
      console.error('[ERROR] Unknown argument: ' + a);
      console.error('Cause: Unexpected argument format');
      console.error('Action: Use --file=<path> --line=<N> --ticket-ref=<key> --description=<text> --tickets-path=<path>');
      process.exit(2);
    }
  }

  if (!opts.file || !opts.line || !opts.ticketRef || !opts.ticketsPath) {
    console.error('[ERROR] Missing required arguments');
    console.error('Cause: --file, --line, --ticket-ref, and --tickets-path are required');
    console.error('Action: Provide all required arguments');
    process.exit(2);
  }

  return opts;
}

// [::TICKET::] PX-95, PX-94 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-95|PX-94) --for-spec --no-implementation-order`.
function main() {
  const opts = parseArgs();

  try {
    const result = insertStub({
      file: opts.file,
      line: opts.line,
      ticketRef: opts.ticketRef,
      description: opts.description || '',
      ticketsPath: opts.ticketsPath,
    });
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (err) {
    console.error('[ERROR] ' + err.message);
    console.error('Cause: STUB marker insertion validation failed');
    console.error('Action: Fix the reported issue and re-run');
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { insertStub, InsertStubError };
