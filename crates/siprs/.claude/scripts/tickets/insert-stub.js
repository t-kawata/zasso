#!/usr/bin/env node

/**
 * insert-stub.js — Insert a [::STUB::] marker with resolve-by-ticket validation
 *
 * Inserts a [::STUB::] marker at a specified line in a source file.
 * The marker references a ticket in Tickets.json that WILL resolve the stub.
 *
 * Every STUB must reference an existing ticket — MUST RESOLVE is NOT supported.
 *
 * Usage:
 *   node insert-stub.js \
 *     --file=<path> \
 *     --line=<N> \
 *     --resolve-by-ticket=<P{phase}-{id}> \
 *     --stub-reason="<concrete reason why this is a stub>" \
 *     --resolve-plan="<concrete implementation required>" \
 *     --tickets-path=<Tickets.json>
 *
 * Marker format:
 *   // [::STUB::] <ticketKey>: <stub-reason> -- <resolve-plan>
 *
 * --resolve-by-ticket: Ticket key that WILL resolve this stub (e.g. P0-1, PX-77).
 *                      MUST already exist in Tickets.json.
 *                      NOT the ticket currently being worked on.
 * --stub-reason:       Concrete reason why this code is a stub — be specific.
 *                      BAD:  "Dependency not ready"
 *                      GOOD: "PX-90 blocked: auth module API changed (User::role is now enum),
 *                             current signature login(&str) incompatible"
 * --resolve-plan:      Concrete implementation required to replace this STUB.
 *                      BAD:  "Implement the actual logic"
 *                      GOOD: "Replace placeholder Ok(()) with DB query:
 *                             INSERT INTO sessions (user_id, token) VALUES (?, ?);
 *                             add integration test for session creation path"
 *
 * IMPORTANT: Both --stub-reason and --resolve-plan must be specific enough that
 * an AI reading them can implement the resolution without additional context.
 *
 * Exported function:
 *   insertStub({ file, line, ticketRef, stubReason, resolvePlan, ticketsPath })
 *     -> { inserted: true }
 *     throws InsertStubError on validation failure
 *
 * [::TICKET::] PX-94, PX-96: insert-stub.js — resolve-by-ticket-validated STUB marker insertion script
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
 * @param {string} opts.file          - Path to source file
 * @param {number} opts.line          - 1-indexed line number to insert at
 * @param {string} opts.ticketRef     - Ticket key (e.g. "P0-1", "PX-94")
 * @param {string} opts.stubReason    - Why this code is left as a stub
 * @param {string} opts.resolvePlan   - What the resolving ticket must implement
 * @param {string} opts.ticketsPath   - Path to Tickets.json
 * @returns {{inserted: boolean}}
 * @throws {InsertStubError} on validation failure
 */
// [::TICKET::] PX-95, PX-94, PX-96 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-96 --for-spec --no-implementation-order`.
function insertStub({ file, line, ticketRef, stubReason, resolvePlan, ticketsPath }) {
  // --- 1. Validate required arguments ---
  if (!file || typeof file !== 'string') {
    throw new InsertStubError('--file is required and must be a non-empty string');
  }
  if (!Number.isInteger(line) || line < 1) {
    throw new InsertStubError('--line is required and must be a positive integer');
  }
  if (!ticketRef || typeof ticketRef !== 'string') {
    throw new InsertStubError('--resolve-by-ticket is required and must be a non-empty string');
  }
  if (!stubReason || typeof stubReason !== 'string') {
    throw new InsertStubError('--stub-reason is required and must be a non-empty string');
  }
  if (!resolvePlan || typeof resolvePlan !== 'string') {
    throw new InsertStubError('--resolve-plan is required and must be a non-empty string');
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
  const reasonClean = (stubReason || 'Implementation pending').trim();
  const planClean = (resolvePlan || 'Implement this stub').trim();
  const marker = '// [::STUB::] ' + ticketRef + ': ' + reasonClean + ' -- ' + planClean;

  lines.splice(line - 1, 0, marker);
  fs.writeFileSync(absFile, lines.join('\n'), 'utf8');

  return { inserted: true };
}

// ===========================================================================
// CLI entry point
// ===========================================================================
// [::TICKET::] PX-95, PX-94, PX-96 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-96 --for-spec --no-implementation-order`.
// [::TICKET::] PX-96 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-96 --for-spec --no-implementation-order`.
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  let hasOldTicketRef = false;
  let hasOldDescription = false;

  for (const a of args) {
    if (a.startsWith('--resolve-by-ticket=')) opts.ticketRef = a.slice('--resolve-by-ticket='.length);
    else if (a.startsWith('--stub-reason=')) opts.stubReason = a.slice('--stub-reason='.length);
    else if (a.startsWith('--resolve-plan=')) opts.resolvePlan = a.slice('--resolve-plan='.length);
    else if (a.startsWith('--ticket-ref=')) hasOldTicketRef = true;
    else if (a.startsWith('--description=')) hasOldDescription = true;
    else if (a.startsWith('--file=')) opts.file = a.slice('--file='.length);
    else if (a.startsWith('--line=')) opts.line = parseInt(a.slice('--line='.length), 10);
    else if (a.startsWith('--tickets-path=')) opts.ticketsPath = a.slice('--tickets-path='.length);
    else {
      console.error('[ERROR] Unknown argument: ' + a);
      console.error('Cause: Unexpected argument format');
      console.error('Action: Use --file=<path> --line=<N> --resolve-by-ticket=<key> --stub-reason="..." --resolve-plan="..." --tickets-path=<path>');
      process.exit(2);
    }
  }

  if (hasOldTicketRef && !opts.ticketRef) {
    console.error('[ERROR] --ticket-ref is deprecated. Use --resolve-by-ticket=<key> instead.');
    console.error('Cause: --ticket-ref has been renamed to --resolve-by-ticket to clarify it');
    console.error('  specifies the ticket that WILL resolve this stub (future direction).');
    console.error('Action: Replace --ticket-ref=<key> with --resolve-by-ticket=<key>');
    process.exit(2);
  }

  if (hasOldDescription) {
    console.error('[ERROR] --description is deprecated. Use --stub-reason and --resolve-plan instead.');
    console.error('Cause: --description has been replaced by two required flags:');
    console.error('  --stub-reason:  Why this code is left as a stub');
    console.error('  --resolve-plan: What the resolving ticket must implement');
    console.error('Action: Replace --description=<text> with --stub-reason="..." --resolve-plan="..."');
    process.exit(2);
  }

  if (!opts.file || !opts.line || !opts.ticketRef || !opts.stubReason || !opts.resolvePlan || !opts.ticketsPath) {
    console.error('[ERROR] Missing required arguments');
    console.error('Cause: --file, --line, --resolve-by-ticket, --stub-reason, --resolve-plan, and --tickets-path are required');
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
      stubReason: opts.stubReason,
      resolvePlan: opts.resolvePlan,
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
