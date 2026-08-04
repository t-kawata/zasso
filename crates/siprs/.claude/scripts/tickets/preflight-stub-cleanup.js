#!/usr/bin/env node
// [::TICKET::] PX-120: preflight-stub-cleanup — 4-class classification of every STUB marker.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-120 --for-spec --no-implementation-order`.

/**
 * preflight-stub-cleanup.js — find-omissions Step 1 pre-cleanup gate.
 *
 * Classifies every [::STUB::] marker under a directory into exactly one of four
 * classes so the executing AI can act without ambiguity:
 *
 *   resolvedCandidates  — marker key references a COMPLETED ticket (reviewed/done/R<round>);
 *                         the AI must verify in code and, if resolved, remove with remove-stub.js
 *   pendingObligations  — marker key references an ACTIVE ticket (todo/in_progress/planned/remanded);
 *                         legitimate pending work — leave for phasify key rewrite
 *   orphans             — no key (MUST RESOLVE), or key references a non-existent ticket,
 *                         or a status that is neither active nor completed — must gain a ticket key or be removed
 *   excuses             — terminal-excuse language without an AI-executable work item —
 *                         must be converted to an actionable plan or removed
 *
 * The classification is deterministic. The final call for resolvedCandidates is
 * the AI's code inspection; this script only narrows the candidate set and emits
 * the remove-stub.js commands for AI-confirmed removals.
 *
 * Usage (run from the directory containing Tickets.json):
 *   node preflight-stub-cleanup.js
 *
 * stdout: JSON { resolvedCandidates, pendingObligations, orphans, excuses } plus [ACTION] lines
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Reuse the validator's lexicon and key extraction so both gates stay consistent.
const {
  extractTicketKey,
  findTicket,
  EXCUSE_PATTERNS,
  WORK_ITEM_VERB_RE,
  ACTIVE_STATUSES
} = require('./validate-no-external-excuses.js');

// -- Constants --

const CLASS_NAMES = ['resolvedCandidates', 'pendingObligations', 'orphans', 'excuses'];

// Completed statuses: the ticket that was supposed to resolve the stub is closed,
// so a surviving marker is a candidate for the resolved-but-stale sweep.
const COMPLETED_STATUS_RE = /^(reviewed|done|R[1-9]\d*)$/;

// -- Pure functions --

/**
 * Scan a directory for [::STUB::] markers (reuse find-all-stubs.js).
 * @param {string} dir — Directory to scan
 * @returns {Array<{file: string, line: number, content: string}>}
 */
// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function scanStubs(dir) {
  const script = path.resolve(__dirname, 'review/find-all-stubs.js');
  const stdout = execFileSync('node', [script, path.resolve(dir)], { encoding: 'utf8' });
  const out = JSON.parse(stdout);
  return out.stubs || [];
}

/**
 * Classify every stub into exactly one of the four classes.
 *
 * Priority: excuse -> completed-key -> active-key -> orphan. This keeps the
 * classes mutually exclusive and jointly exhaustive.
 *
 * @param {Array<{file:string,line:number,content:string}>} stubs — Stub list
 * @param {object} ticketsData — Parsed Tickets.json
 * @returns {{resolvedCandidates: Array, pendingObligations: Array, orphans: Array, excuses: Array}}
 */
// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function classifyStubs(stubs, ticketsData) {
  const result = { resolvedCandidates: [], pendingObligations: [], orphans: [], excuses: [] };
  for (const stub of stubs) {
    const content = stub.content || '';
    const excuseHit = EXCUSE_PATTERNS.some(re => re.test(content));
    const workItem = WORK_ITEM_VERB_RE.test(content);

    if (excuseHit && !workItem) {
      result.excuses.push(stub);
      continue;
    }

    const key = extractTicketKey(content);
    if (!key) {
      result.orphans.push(stub);
      continue;
    }

    const ticket = findTicket(ticketsData, key);
    if (!ticket) {
      result.orphans.push(stub);
      continue;
    }

    if (COMPLETED_STATUS_RE.test(ticket.status || '')) {
      result.resolvedCandidates.push(stub);
      continue;
    }

    if (ACTIVE_STATUSES.has(ticket.status)) {
      result.pendingObligations.push(stub);
      continue;
    }

    // Status that is neither active nor completed (e.g. "made") — cannot map to
    // a resolution state, so it must gain a ticket key or be removed.
    result.orphans.push(stub);
  }
  return result;
}

/**
 * Build the remove-stub.js command for a resolved candidate.
 * @param {{file:string,line:number}} stub — Stub entry
 * @returns {string} — Ready-to-run command
 */
// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function buildRemoveCommand(stub) {
  return 'node .claude/scripts/tickets/remove-stub.js --file=' + stub.file + ' --line=' + stub.line;
}

/**
 * Classify a directory and return the classification plus remove commands.
 * @param {string} dir — Directory to scan
 * @param {object} ticketsData — Parsed Tickets.json
 * @returns {{classification: object, removeCommands: Array}}
 */
// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function preflight(dir, ticketsData) {
  const stubs = scanStubs(dir);
  const classification = classifyStubs(stubs, ticketsData);
  return {
    classification,
    removeCommands: classification.resolvedCandidates.map(buildRemoveCommand)
  };
}

// -- CLI entry point --

/**
 * Read Tickets.json from the current directory (the pipeline always runs from
 * the directory containing Tickets.json). Exits with an Action directive on failure.
 * @returns {object} — Parsed Tickets.json
 */
// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function readTickets() {
  try {
    return JSON.parse(fs.readFileSync(path.resolve('Tickets.json'), 'utf8'));
  } catch (e) {
    console.error('[preflight-stub-cleanup] Error: cannot read Tickets.json from the current directory:', e.message);
    console.error('[preflight-stub-cleanup] Action: run from the directory containing Tickets.json and re-run.');
    process.exit(1);
  }
}

// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function main() {
  // The pipeline always runs from the directory containing Tickets.json, so the
  // scan root and the Tickets.json path are fixed to the current directory.
  const { classification } = preflight('.', readTickets());

  console.log(JSON.stringify(classification, null, 2));

  for (const stub of classification.resolvedCandidates) {
    console.error('[ACTION] resolvedCandidates — verify in code that the defect is resolved, then remove:');
    console.error('  ' + buildRemoveCommand(stub));
  }
  for (const stub of classification.excuses) {
    console.error('[ACTION] excuses — rewrite the resolution plan to an AI-executable work item, or remove if dead:');
    console.error('  ' + stub.file + ':' + stub.line + ' — required: imperative verb + deliverable, e.g. "-- Vendor and build PJSIP in build.rs"');
  }
  for (const stub of classification.orphans) {
    console.error('[ACTION] orphans / MUST RESOLVE — create the resolving ticket now, then rewrite the marker key:');
    console.error('  ' + stub.file + ':' + stub.line + ' — required format: "[::STUB::] P<N>-<M>: <reason> -- <AI-executable plan>"');
  }

  console.error('[preflight-stub-cleanup] classified: ' +
    classification.resolvedCandidates.length + ' resolvedCandidates, ' +
    classification.pendingObligations.length + ' pendingObligations, ' +
    classification.orphans.length + ' orphans, ' +
    classification.excuses.length + ' excuses');
}

if (require.main === module) main();

module.exports = {
  scanStubs,
  classifyStubs,
  buildRemoveCommand,
  preflight,
  CLASS_NAMES,
  COMPLETED_STATUS_RE
};
