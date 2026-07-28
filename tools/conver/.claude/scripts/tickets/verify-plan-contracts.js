#!/usr/bin/env node

/**
 * verify-plan-contracts.js — Verify plan-stage contract-to-test-code translation (Gate P)
 *
 * Usage: node verify-plan-contracts.js --ticket-key=<PX-id> --tickets=<path>
 *
 * Verifies that every contract's Precondition/Postcondition/Invariant has been
 * translated into concrete test code patterns in the testUnit field. This is
 * stricter than Gate M (keyword match) — it requires actual code patterns
 * such as assert!(...), let x = ..., expect(...).to..., etc.
 *
 * Exits 0 on pass, 1 on failure. 3-line error template on stderr.
 *
 * [::TICKET::] PX-74: Gate P — plan-stage contract-to-test-code enforcement
 */

const fs = require('fs');
const path = require('path');

// Patterns that unambiguously indicate concrete test code (not prose)
const CODE_PATTERNS = [
  /\bassert!\(/,                          // assert!(expr)
  /\bassert_eq!\(/,                        // assert_eq!(a, b)
  /\bassert_ne!\(/,                        // assert_ne!(a, b)
  /\bdebug_assert!\(/,                     // debug_assert!(expr)
  /\blet\s+\w+\s*=[^=]/,                  // let name = value
  /\bconst\s+\w+\s*=/,                    // const name = value
  /\bfn\s+\w+\s*\(/,                      // fn test_name()
  /\bmut\s+\w+\s*=[^=]/,                  // let mut name = value
  /expect\s*\(.*\)\s*\.\s*(to|not)/,      // expect(x).to...
  /\w+\.should\b/,                         // x.should...
  /\w+\.toBe\s*\(/,                        // x.toBe(y)
  /\w+\.toEqual\s*\(/,                     // x.toEqual(y)
  /\w+\.toMatchObject\s*\(/,               // x.toMatchObject(y)
  /\w+\.toStrictEqual\s*\(/,               // x.toStrictEqual(y)
  /```(rust|ts|js|typescript|javascript)?/  // Code fence
];

// [::TICKET::] PX-74 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-74 --for-spec --no-implementation-order`.
function parseArgs() {
  const args = process.argv.slice(2);
  let ticketKey, ticketsPath;
  for (const a of args) {
    if (a.startsWith('--ticket-key=')) ticketKey = a.slice('--ticket-key='.length);
    if (a.startsWith('--tickets=')) ticketsPath = path.resolve(a.slice('--tickets='.length));
  }
  if (!ticketKey || !ticketsPath) {
    console.error('[ERROR] --ticket-key=<PX-id> and --tickets=<path> are required');
    console.error('Cause: Missing arguments');
    console.error('Action: Provide both --ticket-key and --tickets paths');
    process.exit(1);
  }
  return { ticketKey, ticketsPath };
}

/**
 * Check whether testUnit text contains concrete test code patterns
 * @param {string} text — Combined testUnit text
 * @returns {boolean}
 */
// [::TICKET::] PX-74 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-74 --for-spec --no-implementation-order`.
function hasConcreteCode(text) {
  return CODE_PATTERNS.some(function (pattern) {
    return pattern.test(text);
  });
}

/**
 * Check whether a specific string is about a contract element
 * and whether testUnit covers it with concrete test code
 * @param {string} elementText — Precondition/Postcondition/Invariant text
 * @param {string} testUnitText — Combined testUnit text
 * @returns {boolean} — true if valid (empty element or covered by code)
 */
// [::TICKET::] PX-74 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-74 --for-spec --no-implementation-order`.
function elementIsCovered(elementText, testUnitText) {
  // Empty string → nothing to verify → covered
  if (!elementText || elementText.trim().length === 0) return true;
  // Check for concrete code patterns in testUnit
  return hasConcreteCode(testUnitText);
}

/**
 * Verify plan-stage contract consistency for a single ticket
 * @param {object} ticket — Ticket object with contracts and testUnit
 * @returns {Array<{ticket: number, contract: string|null, element: string, detail: string}>}
 */
// [::TICKET::] PX-74 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-74 --for-spec --no-implementation-order`.
// [::TICKET::] PX-75, PX-84, PX-85, PX-86, PX-87 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-75|PX-84|PX-85|PX-86|PX-87) --for-spec --no-implementation-order`.
function verifyPlanContracts(ticket) {
  const errors = [];
  const contracts = ticket.contracts || [];
  const planTestCode = ticket.planTestCode;

  // C004: Empty or undefined contracts → pass
  if (contracts.length === 0) return errors;

  // C001 (PX-84): Reject missing planTestCode when contracts exist — Step 3.5 required
  if (planTestCode === undefined || planTestCode === null || planTestCode.length === 0) {
    errors.push({
      ticket: ticket.id,
      contract: null,
      element: 'planTestCode',
      detail: 'planTestCode is empty or undefined while contracts exist — Step 3.5 (contract-to-test-code translation) must be executed before plan can complete'
    });
    return errors;
  }

  const utText = planTestCode.join(' ');

  for (const c of contracts) {
    // Check precondition → test input code
    if (c.precondition && c.precondition.trim().length > 0 && !elementIsCovered(c.precondition, utText)) {
      errors.push({
        ticket: ticket.id,
        contract: c.id,
        element: 'precondition',
        detail: 'precondition "' + c.precondition.substring(0, 60) + '" lacks concrete test input code in planTestCode (no code patterns found)'
      });
    }
    // Check postcondition → assertion code
    if (c.postcondition && c.postcondition.trim().length > 0 && !elementIsCovered(c.postcondition, utText)) {
      errors.push({
        ticket: ticket.id,
        contract: c.id,
        element: 'postcondition',
        detail: 'postcondition "' + c.postcondition.substring(0, 60) + '" lacks concrete assertion code in planTestCode (no assertion patterns found)'
      });
    }
    // Check invariant → predicate code
    if (c.invariant && c.invariant.trim().length > 0 && !elementIsCovered(c.invariant, utText)) {
      errors.push({
        ticket: ticket.id,
        contract: c.id,
        element: 'invariant',
        detail: 'invariant "' + c.invariant.substring(0, 60) + '" lacks concrete predicate code in planTestCode (no invariant patterns found)'
      });
    }
  }

  return errors;
}

// [::TICKET::] PX-74, PX-84, PX-85, PX-86, PX-87, PX-89 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-74|PX-84|PX-85|PX-86|PX-87|PX-89) --for-spec --no-implementation-order`.
function main() {
  const { ticketKey, ticketsPath } = parseArgs();

  if (!fs.existsSync(ticketsPath)) {
    console.error('[ERROR] Tickets.json not found: ' + ticketsPath);
    process.exit(2);
  }

  const ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  // Parse ticket key: PX-{id} or P{phase}-{id}
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
    console.error('[ERROR] Invalid ticket key format: ' + ticketKey);
    process.exit(1);
  }

  // Find the ticket across all phases
  let targetTicket = null;
  for (const phase of ticketsData.phases) {
    if (phase.tickets) {
      for (const t of phase.tickets) {
        if (t.id === targetId && t.phaseId === targetPhaseId) {
          targetTicket = t;
          break;
        }
      }
    }
    if (targetTicket) break;
  }

  if (!targetTicket) {
    console.error('[ERROR] Ticket ' + ticketKey + ' not found');
    process.exit(1);
  }

  const errors = verifyPlanContracts(targetTicket);
  if (errors.length > 0) {
    for (const err of errors) {
      if (err.element === 'planTestCode') {
        console.error('[ERROR] Ticket ' + err.ticket + ': ' + err.detail);
        console.error('Cause: Step 3.5 was not executed or planTestCode was not written');
        console.error('Action: Run Step 3.5 to translate contracts into concrete test code, then set planTestCode via update-ticket.js');
      } else {
        console.error('[ERROR] Ticket ' + err.ticket + ' contract ' + err.contract + ' (' + err.element + '): ' + err.detail);
        console.error('Cause: Contract-to-test-code translation incomplete in plan');
        console.error('Action: Add concrete test code to planTestCode entries for this contract and re-run Gate P');
      }
    }
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, ticket: ticketKey }));
  process.exit(0);
}

if (require.main === module) main();
module.exports = { verifyPlanContracts };
