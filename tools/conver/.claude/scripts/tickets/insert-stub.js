#!/usr/bin/env node

/**
 * insert-stub.js — Insert a [::STUB::] marker with resolve-by-ticket validation
 *
 * Inserts a [::STUB::] marker at a specified line in a source file.
 * The marker references a ticket in Tickets.json that WILL resolve the stub.
 *
 * Every STUB must reference an existing ticket — MUST RESOLVE is NOT supported.
 * A STUB may only resolve to an existing ticket whose effective status is 'todo'
 * (non-todo existing tickets are past tickets and would break the pipeline
 * timeline), must not reference a PX ticket, and must not be earlier than the
 * current ticket when --ticket-key is provided.
 *
 * Usage:
 *   node insert-stub.js \
 *     --file=<path> \
 *     --line=<N> \
 *     --resolve-by-ticket=<P{phase}-{id}> \
 *     --stub-reason="<concrete reason why this is a stub>" \
 *     --resolve-plan="<concrete implementation required>" \
 *     --tickets-path=<Tickets.json> \
 *     [--ticket-key=<P{phase}-{id}|PX-{id}>]
 *
 * Marker format:
 *   // [::STUB::] <ticketKey>: <stub-reason> -- <resolve-plan>
 *
 * --resolve-by-ticket: Ticket key that WILL resolve this stub (e.g. P0-1).
 *                      MUST already exist in Tickets.json.
 *                      MUST have effective status 'todo' (missing status is 'todo').
 *                      MUST NOT be a PX-{id} ticket.
 *                      When --ticket-key is given, MUST NOT be earlier than it.
 * --ticket-key:        Optional. Current ticket key being worked on. When given,
 *                      resolve-by-ticket must not be before it in
 *                      (phaseId, id) lexicographic order (phaseId from phase.id).
 * --stub-reason:       Concrete reason why this code is a stub — be specific.
 *                      Must be a single line (no newlines allowed).
 *                      BAD:  "Dependency not ready"
 *                      GOOD: "P1-3 blocked: User::role changed to enum, login(&str) signature incompatible"
 * --resolve-plan:      Concrete implementation required to replace this STUB.
 *                      Must be a single line (no newlines allowed).
 *                      BAD:  "Implement the actual logic"
 *                      GOOD: "Replace Ok(()) with INSERT INTO sessions (user_id, token) VALUES (?, ?); add integration test"
 *
 * IMPORTANT: Both --stub-reason and --resolve-plan must be specific enough that
 * an AI reading them can implement the resolution without additional context.
 *
 * Every validation failure throws an InsertStubError whose message carries three
 * parts: the problem, the blocking reason, and a redo instruction. A failure
 * only blocks the insertion — it must never halt the invoking slash command.
 *
 * Exported function:
 *   insertStub({ file, line, ticketRef, stubReason, resolvePlan, ticketsPath, ticketKey })
 *     -> { inserted: true }
 *     throws InsertStubError on validation failure
 *
 * [::TICKET::] PX-94, PX-96, PX-119: insert-stub.js — resolve-by-ticket-validated STUB marker insertion script
 */

const fs = require('fs');
const path = require('path');

// Regex: must match P{phase}-{id} format (e.g. P0-1, PX-94)
const TICKET_REF_RE = /^P[A-Z0-9]+-\d+$/;

// PX phase id is -1; PX tickets are forbidden as resolve targets (PX-119 C004)
const PX_PHASE_ID = -1;

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
 * Build a three-part InsertStubError message: problem, blocking reason, redo
 * instruction. Each part is on its own line so the CLI output is actionable.
 *
 * @param {string} problem - What is wrong (first line, keeps legacy keyword checks)
 * @param {string} blockingReason - Why the insertion is blocked
 * @param {string} redoInstruction - How to fix and re-run
 * @returns {string}
 */
// [::TICKET::] PX-119 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-119 --for-spec --no-implementation-order`.
function buildBlockingMessage(problem, blockingReason, redoInstruction) {
  return problem + '\nCause: ' + blockingReason + '\nAction: ' + redoInstruction;
}

/**
 * Find a ticket and its canonical phase id (taken from phase.id, per the
 * tickets.ts L78 convention) for a given key.
 *
 * @param {object} ticketsData - Parsed Tickets.json
 * @param {string} ticketKey - e.g. "P0-1" or "PX-10"
 * @returns {{ticket: object, phaseId: number}|null} - null if not found
 */
// [::TICKET::] PX-119 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-119 --for-spec --no-implementation-order`.
function findTicketPosition(ticketsData, ticketKey) {
  const pxMatch = ticketKey.match(/^PX-(\d+)$/);
  const pMatch = ticketKey.match(/^P(\d+)-(\d+)$/);
  if (!pxMatch && !pMatch) return null;
  const targetPhaseId = pxMatch ? PX_PHASE_ID : parseInt(pMatch[1], 10);
  const targetId = pxMatch ? parseInt(pxMatch[1], 10) : parseInt(pMatch[2], 10);
  for (const phase of ticketsData.phases || []) {
    if (phase.id !== targetPhaseId) continue;
    for (const t of phase.tickets || []) {
      if (t.id === targetId) return { ticket: t, phaseId: phase.id };
    }
  }
  return null;
}

/**
 * Validate all inputs and, on success, insert a [::STUB::] marker.
 *
 * @param {object} opts
 * @param {string} opts.file          - Path to source file
 * @param {number} opts.line          - 1-indexed line number to insert at
 * @param {string} opts.ticketRef     - Ticket key (e.g. "P0-1")
 * @param {string} opts.stubReason    - Why this code is left as a stub
 * @param {string} opts.resolvePlan   - What the resolving ticket must implement
 * @param {string} opts.ticketsPath   - Path to Tickets.json
 * @param {string} [opts.ticketKey]   - Optional current ticket key (PX-119 C003 ordering check)
 * @returns {{inserted: boolean}}
 * @throws {InsertStubError} on validation failure
 */
// [::TICKET::] PX-95, PX-94, PX-96, PX-119 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-119 --for-spec --no-implementation-order`.
// [::TICKET::] PX-119 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-119 --for-spec --no-implementation-order`.
function insertStub({ file, line, ticketRef, stubReason, resolvePlan, ticketsPath, ticketKey }) {
  // --- 1. Validate required arguments ---
  if (!file || typeof file !== 'string') {
    throw new InsertStubError(buildBlockingMessage(
      '--file is required and must be a non-empty string.',
      'The source file path is required to insert a STUB marker.',
      'Provide --file=<path> and re-run.'
    ));
  }
  if (!Number.isInteger(line) || line < 1) {
    throw new InsertStubError(buildBlockingMessage(
      '--line is required and must be a positive integer.',
      'The insertion line is required to place the STUB marker.',
      'Provide --line=<N> with a positive integer and re-run.'
    ));
  }
  if (!ticketRef || typeof ticketRef !== 'string') {
    throw new InsertStubError(buildBlockingMessage(
      '--resolve-by-ticket is required and must be a non-empty string.',
      'The resolve target ticket key is required.',
      'Provide --resolve-by-ticket=<P{phase}-{id}> and re-run.'
    ));
  }
  if (!stubReason || typeof stubReason !== 'string') {
    throw new InsertStubError(buildBlockingMessage(
      '--stub-reason is required and must be a non-empty string.',
      'The STUB marker must state why the code is left as a stub.',
      'Provide --stub-reason="<concrete reason>" and re-run.'
    ));
  }
  if (!resolvePlan || typeof resolvePlan !== 'string') {
    throw new InsertStubError(buildBlockingMessage(
      '--resolve-plan is required and must be a non-empty string.',
      'The STUB marker must state what the resolving ticket will implement.',
      'Provide --resolve-plan="<concrete implementation>" and re-run.'
    ));
  }
  if (!ticketsPath || typeof ticketsPath !== 'string') {
    throw new InsertStubError(buildBlockingMessage(
      '--tickets-path is required and must be a non-empty string.',
      'Tickets.json must be located for resolve-target validation.',
      'Provide --tickets-path=<Tickets.json> and re-run.'
    ));
  }

  // --- 2. Reject MUST RESOLVE (forbidden) ---
  if (ticketRef === 'MUST RESOLVE') {
    throw new InsertStubError(buildBlockingMessage(
      'MUST RESOLVE is not allowed as ticket-ref.',
      'Every STUB must reference an existing ticket in Tickets.json.',
      'Specify an existing ticket key in --resolve-by-ticket and re-run.'
    ));
  }

  // --- 3. Validate ticket-ref format ---
  if (!TICKET_REF_RE.test(ticketRef)) {
    throw new InsertStubError(buildBlockingMessage(
      'Invalid ticket-ref format: "' + ticketRef + '". Expected format: P{phase}-{id} (e.g. "P0-1").',
      'A STUB must reference a ticket key of the form P{phase}-{id}.',
      'Fix --resolve-by-ticket to a valid format (e.g. P0-1) and re-run.'
    ));
  }

  // --- 3.5. PX ban (C004): PX-{id} resolve targets are forbidden ---
  if (ticketRef.startsWith('PX-')) {
    throw new InsertStubError(buildBlockingMessage(
      'PX-* tickets cannot be specified in --resolve-by-ticket.',
      'The PX phase has ambiguous ordering and breaks the pipeline timeline, so it is forbidden as a STUB resolve target.',
      'Specify an existing todo ticket key other than PX, fix --resolve-by-ticket, and re-run.'
    ));
  }

  // --- 4. Resolve absolute paths ---
  const absFile = path.resolve(file);
  const absTicketsPath = path.resolve(ticketsPath);

  // --- 5. Check Tickets.json exists ---
  if (!fs.existsSync(absTicketsPath)) {
    throw new InsertStubError(buildBlockingMessage(
      'Tickets.json not found: ' + absTicketsPath,
      'Tickets.json must exist at the given --tickets-path.',
      'Provide a valid --tickets-path and re-run.'
    ));
  }

  // --- 6. Validate ticket-ref exists in Tickets.json ---
  let ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(absTicketsPath, 'utf8'));
  } catch (e) {
    throw new InsertStubError(buildBlockingMessage(
      'Failed to parse Tickets.json: ' + absTicketsPath + ' — ' + e.message,
      'Tickets.json must be valid JSON.',
      'Fix the JSON format of Tickets.json and re-run.'
    ));
  }

  const resolvePosition = findTicketPosition(ticketsData, ticketRef);
  if (!resolvePosition) {
    throw new InsertStubError(buildBlockingMessage(
      'Ticket "' + ticketRef + '" does not exist in Tickets.json.',
      'A STUB must reference an existing ticket.',
      'Specify a ticket key that exists in Tickets.json and re-run.'
    ));
  }

  // --- 6.5. Todo condition (C002): only effective-todo tickets are valid ---
  const effectiveStatus = resolvePosition.ticket.status || 'todo';
  if (effectiveStatus !== 'todo') {
    throw new InsertStubError(buildBlockingMessage(
      '--resolve-by-ticket=' + ticketRef + ' is a past ticket whose status is not todo (current: ' + effectiveStatus + ').',
      'A STUB may only resolve to a future todo ticket. A non-todo existing ticket is a past ticket and would break the timeline.',
      'Specify an existing ticket whose status is todo, fix --resolve-by-ticket, and re-run.'
    ));
  }

  // --- 6.6. Ordering condition (C003): only when --ticket-key is given ---
  if (ticketKey) {
    if (!TICKET_REF_RE.test(ticketKey)) {
      throw new InsertStubError(buildBlockingMessage(
        'Invalid --ticket-key format: "' + ticketKey + '". Expected format: P{phase}-{id} (e.g. "P5-2").',
        '--ticket-key must be of the form P{phase}-{id}.',
        'Fix --ticket-key to the current ticket key (e.g. P5-2) and re-run.'
      ));
    }
    const currentPosition = findTicketPosition(ticketsData, ticketKey);
    if (!currentPosition) {
      throw new InsertStubError(buildBlockingMessage(
        'Ticket "' + ticketKey + '" (--ticket-key) does not exist in Tickets.json.',
        'The current ticket key must exist in Tickets.json.',
        'Specify an existing ticket key in --ticket-key and re-run.'
      ));
    }
    const resolveIsBeforeCurrent =
      resolvePosition.phaseId < currentPosition.phaseId ||
      (resolvePosition.phaseId === currentPosition.phaseId &&
       resolvePosition.ticket.id < currentPosition.ticket.id);
    if (resolveIsBeforeCurrent) {
      throw new InsertStubError(buildBlockingMessage(
        '--resolve-by-ticket=' + ticketRef + ' is earlier than the current ticket (' + ticketKey + ').',
        'A STUB may only resolve to a future ticket after the current phase/ticket.',
        'Specify a ticket key after the current --ticket-key, fix --resolve-by-ticket, and re-run.'
      ));
    }
  }

  // --- 7. Check source file exists ---
  if (!fs.existsSync(absFile)) {
    throw new InsertStubError(buildBlockingMessage(
      'Source file not found: ' + absFile,
      'The source file to receive the STUB marker must exist.',
      'Provide an existing file path in --file and re-run.'
    ));
  }

  // --- 8. Read source file ---
  let content;
  try {
    content = fs.readFileSync(absFile, 'utf8');
  } catch (e) {
    throw new InsertStubError(buildBlockingMessage(
      'Failed to read source file: ' + absFile + ' — ' + e.message,
      'The source file must be readable.',
      'Resolve the file read error and re-run.'
    ));
  }

  const lines = content.split('\n');

  // --- 9. Validate line range ---
  if (line > lines.length) {
    throw new InsertStubError(buildBlockingMessage(
      'Line ' + line + ' exceeds file length (' + lines.length + ' lines). File: ' + absFile,
      'The insertion line must be within the file length.',
      'Fix --line to a value of ' + lines.length + ' or less and re-run.'
    ));
  }

  // --- 10. Check for duplicate STUB at target line ---
  const targetLine = lines[line - 1];
  if (targetLine && targetLine.includes('[::STUB::]')) {
    throw new InsertStubError(buildBlockingMessage(
      'A [::STUB::] marker already exists at line ' + line + ' in ' + absFile + ': "' +
      targetLine.trim().substring(0, 80) + '"',
      'A STUB marker may not be inserted twice at the same line.',
      'Choose a different --line or resolve the existing STUB, then re-run.'
    ));
  }

  // --- 11. Validate single-line invariant (STUB marker must be exactly 1 line) ---
  // [::TICKET::] PX-96: single-line STUB marker invariant.
  if (stubReason && stubReason.includes('\n')) {
    throw new InsertStubError(buildBlockingMessage(
      '--stub-reason must not contain newlines.',
      'The STUB marker must be a single comment line.',
      'Rewrite --stub-reason as one line; details belong in the resolving ticket spec, then re-run.'
    ));
  }
  if (resolvePlan && resolvePlan.includes('\n')) {
    throw new InsertStubError(buildBlockingMessage(
      '--resolve-plan must not contain newlines.',
      'The STUB marker must be a single comment line.',
      'Rewrite --resolve-plan as one line; details belong in the resolving ticket spec, then re-run.'
    ));
  }

  // --- 12. Build and insert the marker (exactly 1 line) ---
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
// [::TICKET::] PX-96, PX-119 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-96|PX-119) --for-spec --no-implementation-order`.
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
    else if (a.startsWith('--ticket-key=')) opts.ticketKey = a.slice('--ticket-key='.length);
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

// [::TICKET::] PX-95, PX-94, PX-119 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-95|PX-94|PX-119) --for-spec --no-implementation-order`.
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
      ticketKey: opts.ticketKey,
    });
    console.log(JSON.stringify(result));
    process.exit(0);
  } catch (err) {
    console.error('[ERROR] ' + err.message);
    process.exit(1);
  }
}

if (require.main === module) main();
module.exports = { insertStub, InsertStubError, findTicketPosition, buildBlockingMessage };
