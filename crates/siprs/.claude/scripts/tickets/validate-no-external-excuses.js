#!/usr/bin/env node
// [::TICKET::] PX-120: validate-no-external-excuses — generic no-excuse validator.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-120 --for-spec --no-implementation-order`.

/**
 * validate-no-external-excuses.js — generic 3-check validator for [::STUB::] markers.
 *
 * Enforces the absolute rule: there is no "external" and no "awaiting approval".
 * Every marker's resolution plan must be an AI-executable work item (imperative
 * verb + deliverable), and its ticket key must reference an active obligation in
 * Tickets.json. A marker that carries a terminal excuse without a work item, or
 * that references a past/non-existent/absent key, FAILS validation.
 *
 * Checks:
 *   A — Excuse Lexicon:   terminal excuse phrases (requires external, awaiting approval, ...)
 *   B — Actionability:    the resolution plan contains an imperative work-item verb + deliverable
 *   C — Key Validity:     the marker key references an active ticket (todo/in_progress/planned/remanded)
 *
 * A fails only when B cannot recover it (excuse present AND no work item).
 * C is a hard gate: a past/non-existent/absent key always fails.
 *
 * Usage (run from the directory containing Tickets.json):
 *   node validate-no-external-excuses.js [--fail-on-excuse]
 *
 * stdout: JSON { total, pass, fail }
 * stderr (per fail): [validate-no-external-excuses] FAIL <file>:<line> -- <check> -- Action: <directive>
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// -- Constants --

// Terminal-excuse phrases. A match on any of these is a Check A violation that
// only Check B recovery can repair.
const EXCUSE_PATTERNS = [
  /\brequires external\b/i,
  /\bexternal dependency\b/i,
  /\bawaiting (?:human )?approval\b/i,
  /\bneeds approval\b/i,
  /\brequires authorization\b/i,
  /\bdeferred until\b/i,
  /\bblocked until\b/i,
  /\bonce [^\n-]*\bavailable\b/i,
  /\bwhen [^\n-]*\bavailable\b/i,
  /\brequires [^\n-]*\bto be installed\b/i,
  /\bheaders available\b/i,
  /\bnot linked\b/i,
  /\bcannot be implemented\b/i,
  /\bimpossible because\b/i,
  /\bwaiting for\b/i,
  /\bwait until\b/i,
  /\boutsourced\b/i,
  /\bawaiting another team\b/i
];

// Imperative work-item verbs. A resolution plan containing one of these (with a
// deliverable) is an AI-executable work item and recovers a Check A violation.
const WORK_ITEM_VERB_RE = /\b(?:Implement|Build|Vendor|Add|Generate|Integrate|Wire|Replace|Migrate|Expose|Register|Run|Prebuild|Compile|Link|Fetch|Download|Extract|Port|Update)\b/i;

// Ticket key extraction from marker content (same pattern as create-tmp-omissions.js).
const STUB_TICKET_KEY_RE = /\[::STUB::\].*?([A-Z]+[A-Z\d]*-\d+)/;

// Statuses that mean "this ticket will still resolve work".
const ACTIVE_STATUSES = new Set(['todo', 'in_progress', 'planned', 'remanded']);

// -- Pure functions --

/**
 * Extract the ticket key referenced by a marker, or null for keyless markers.
 * @param {string} content — Full marker line
 * @returns {string|null}
 */
// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function extractTicketKey(content) {
  const match = content.match(STUB_TICKET_KEY_RE);
  return match ? match[1] : null;
}

/**
 * Find a ticket by key (P{phase}-{id} / PX-{id}) in Tickets.json data.
 * @param {object} ticketsData — Parsed Tickets.json { phases[] }
 * @param {string} ticketKey — e.g. "P3-2" or "PX-53"
 * @returns {object|null} — The ticket object or null
 */
// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
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
 * Check C — Key Validity.
 * @param {string|null} ticketKey — Extracted key or null
 * @param {object} ticketsData — Parsed Tickets.json
 * @returns {{passed: boolean, reason: string}}
 */
// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function checkKeyValidity(ticketKey, ticketsData) {
  if (!ticketKey) {
    return { passed: false, reason: 'Marker has no ticket key (MUST RESOLVE) — keyless markers fail Check C' };
  }
  const ticket = findTicket(ticketsData, ticketKey);
  if (!ticket) {
    return { passed: false, reason: 'Ticket ' + ticketKey + ' does not exist in Tickets.json' };
  }
  if (!ACTIVE_STATUSES.has(ticket.status)) {
    return { passed: false, reason: 'Ticket ' + ticketKey + ' has status "' + ticket.status + '" which is not an active obligation' };
  }
  return { passed: true, reason: 'Ticket ' + ticketKey + ' is an active obligation' };
}

/**
 * Classify a marker content string into a PASS/FAIL verdict across Check A/B/C.
 * @param {string} markerContent — Full marker line
 * @param {object} ticketsData — Parsed Tickets.json
 * @returns {{passed: boolean, fail: boolean, key: string|null, checks: Array}}
 */
// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function classifyVerdict(markerContent, ticketsData) {
  const excuseHit = EXCUSE_PATTERNS.some(re => re.test(markerContent || ''));
  const workItem = WORK_ITEM_VERB_RE.test(markerContent || '');

  // Check A: lexicon. Repaired by Check B (an actionable work item is allowed
  // to mention a dependency).
  const checkA = {
    check: 'A',
    passed: !excuseHit,
    reason: excuseHit ? 'Marker contains a terminal-excuse phrase' : 'No terminal-excuse phrase',
    action: excuseHit && !workItem
      ? 'Convert the resolution plan to an AI-executable work item, e.g. "-- Vendor and build PJSIP in build.rs"'
      : ''
  };
  // Check B: actionability.
  const checkB = {
    check: 'B',
    passed: workItem,
    reason: workItem ? 'Resolution plan contains an imperative work-item verb' : 'Resolution plan has no imperative work-item verb',
    action: !workItem
      ? 'Add an imperative verb plus deliverable to the resolution plan (Implement / Build / Vendor / Add ...)'
      : ''
  };

  const lexPass = !excuseHit || workItem;

  // Check C: key validity (hard gate).
  const key = extractTicketKey(markerContent);
  const cv = checkKeyValidity(key, ticketsData);
  const checkC = {
    check: 'C',
    passed: cv.passed,
    reason: cv.reason,
    action: cv.passed
      ? ''
      : 'Rewrite the marker key to the new resolving ticket (or remove the marker if already resolved in code)'
  };

  const passed = lexPass && cv.passed;
  return { passed, fail: !passed, key, checks: [checkA, checkB, checkC] };
}

/**
 * Scan a directory for [::STUB::] markers using find-all-stubs.js.
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
 * Validate every stub under a directory.
 * @param {string} dir — Directory to scan
 * @param {object} ticketsData — Parsed Tickets.json
 * @returns {{total: number, pass: number, fail: number, failures: Array}}
 */
// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function validateStubs(dir, ticketsData) {
  const stubs = scanStubs(dir);
  const failures = [];
  let pass = 0;
  for (const stub of stubs) {
    const verdict = classifyVerdict(stub.content, ticketsData);
    if (verdict.passed) {
      pass++;
    } else {
      failures.push({ file: stub.file, line: stub.line, content: stub.content, verdict });
    }
  }
  return { total: stubs.length, pass, fail: failures.length, failures };
}

// -- CLI entry point --

// [::TICKET::] PX-120, PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-120|PX-121) --for-spec --no-implementation-order`.
function main() {
  // The pipeline always runs from the directory containing Tickets.json, so the
  // scan root and the Tickets.json path are fixed to the current directory.
  const args = process.argv.slice(2);
  let failOnExcuse = false;

  for (const arg of args) {
    if (arg === '--fail-on-excuse') failOnExcuse = true;
  }

  let ticketsData;
  try {
    ticketsData = JSON.parse(fs.readFileSync(path.resolve('Tickets.json'), 'utf8'));
  } catch (e) {
    console.error('[validate-no-external-excuses] Error: cannot read Tickets.json from the current directory:', e.message);
    console.error('[validate-no-external-excuses] Action: run from the directory containing Tickets.json and re-run.');
    process.exit(1);
  }

  let result;
  try {
    result = validateStubs('.', ticketsData);
  } catch (e) {
    console.error('[validate-no-external-excuses] Error: stub scan failed:', e.message);
    process.exit(1);
  }

  console.log(JSON.stringify({ total: result.total, pass: result.pass, fail: result.fail }, null, 2));

  for (const failure of result.failures) {
    for (const check of failure.verdict.checks) {
      if (!check.passed) {
        console.error('[validate-no-external-excuses] FAIL ' + failure.file + ':' + failure.line + ' -- Check ' + check.check + ' -- Action: ' + check.action);
      }
    }
  }

  if (failOnExcuse && result.fail > 0) {
    console.error('[validate-no-external-excuses] ' + result.fail + ' failures — see stderr for per-stub Action directives. Fix and re-validate before proceeding.');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  extractTicketKey,
  findTicket,
  checkKeyValidity,
  classifyVerdict,
  scanStubs,
  validateStubs,
  EXCUSE_PATTERNS,
  WORK_ITEM_VERB_RE,
  ACTIVE_STATUSES,
  STUB_TICKET_KEY_RE
};
