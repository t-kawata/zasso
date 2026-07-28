#!/usr/bin/env node

/**
 * verify-make-contracts.js — Verify make-stage contract consistency (Gate M)
 *
 * Usage: node verify-make-contracts.js --ticket-key=<PX-id> --tickets=<path>
 *
 * Verifies:
 * 1. All contract preconditions appear in testUnit
 * 2. All contract postconditions appear in testUnit
 * 3. All invariants appear in testUnit
 * 4. testExceptions entries have proper justification
 *
 * Exits 0 on pass, 1 on failure. 3-line error template on stderr.
 *
 * [::TICKET::] PX-69: Gate L1 + Gate M
 */

const fs = require('fs');
const path = require('path');

// [::TICKET::] PX-69, PX-70, PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-69|PX-70|PX-71) --for-spec --no-implementation-order`.
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
 * Verify make-stage contract consistency for a single ticket
 * @param {object} ticket — Ticket object with contracts, testUnit, testExceptions
 * @returns {Array<{ticket: number, contract: string|null, detail: string}>}
 */
// [::TICKET::] PX-69, PX-70, PX-71, PX-73 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-69|PX-70|PX-71|PX-73) --for-spec --no-implementation-order`.
function verifyMakeContracts(ticket) {
  const errors = [];
  const contracts = ticket.contracts || [];
  const testUnit = ticket.testUnit || [];
  const testExceptions = ticket.testExceptions || [];

  // Gate M: reject empty contracts — contracts must be defined before make can complete
  // [::TICKET::] PX-73: C005 — verify-make-contracts.js rejects empty contracts
  if (contracts.length === 0) {
    errors.push({ ticket: ticket.id, contract: null, detail: 'contracts array is empty — contracts must be defined before make can complete' });
    return errors;
  }

  const utText = testUnit.join(' ').toLowerCase();

  for (const c of contracts) {
    // Check 1: precondition in testUnit
    if (c.precondition && c.precondition.length > 0) {
      const preLower = c.precondition.toLowerCase();
      const preWords = preLower.split(/\s+/).filter(w => w.length > 3);
      const found = preWords.some(w => utText.includes(w));
      if (!found && preWords.length > 0) {
        errors.push({ ticket: ticket.id, contract: c.id, detail: 'precondition "' + c.precondition + '" not found in testUnit (no key terms matched)' });
      }
    }
    // Check 2: postcondition in testUnit
    if (c.postcondition && c.postcondition.length > 0) {
      const postLower = c.postcondition.toLowerCase();
      const postWords = postLower.split(/\s+/).filter(w => w.length > 3);
      const found = postWords.some(w => utText.includes(w));
      if (!found && postWords.length > 0) {
        errors.push({ ticket: ticket.id, contract: c.id, detail: 'postcondition "' + c.postcondition + '" not found in testUnit (no key terms matched)' });
      }
    }
    // Check 3: invariant in testUnit
    if (c.invariant && c.invariant.length > 0) {
      const invLower = c.invariant.toLowerCase();
      const invWords = invLower.split(/\s+/).filter(w => w.length > 3);
      const found = invWords.some(w => utText.includes(w));
      if (!found && invWords.length > 0) {
        errors.push({ ticket: ticket.id, contract: c.id, detail: 'invariant "' + c.invariant + '" not found in testUnit (no key terms matched)' });
      }
    }
  }

  // Check 4: testExceptions justification
  for (const ex of testExceptions) {
    const hasReason = /テスト不能|cannot test|impossible to test|not testable/i.test(ex);
    const isNotDefect = /設計欠陥|design defect|architectural defect|not a defect/i.test(ex);
    if (!hasReason || !isNotDefect) {
      errors.push({
        ticket: ticket.id,
        contract: null,
        detail: 'testException lacks justification: "' + (ex.substring(0, 60)) + '..."'
      });
    }
  }

  return errors;
}

// [::TICKET::] PX-69, PX-70, PX-71, PX-84, PX-85, PX-86, PX-87, PX-89 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-69|PX-70|PX-71|PX-84|PX-85|PX-86|PX-87|PX-89) --for-spec --no-implementation-order`.
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
        if (t.id === targetId && (t.phaseId === targetPhaseId)) {
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

  const errors = verifyMakeContracts(targetTicket);
  if (errors.length > 0) {
    for (const err of errors) {
      const isTestException = err.detail && err.detail.includes('testException');
      const isEmptyContract = err.contract === null && err.detail && err.detail.includes('empty');
      if (isEmptyContract) {
        console.error('[ERROR] Ticket ' + err.ticket + ': ' + err.detail);
        console.error('Cause: No contracts defined for this ticket');
        console.error('Action: Define at least one contract with pre/post/invariant before proceeding');
      } else if (isTestException) {
        console.error('[ERROR] Ticket ' + err.ticket + ': ' + err.detail);
        console.error('Cause: testException missing required justification');
        console.error('Action: Include both a reason phrase ("cannot test", "not testable") AND a statement that this is not a design defect ("not a defect", "not an architectural defect")');
      } else {
        console.error('[ERROR] Ticket ' + err.ticket + (err.contract ? ' contract ' + err.contract : '') + ': ' + err.detail);
        const elem = err.detail && err.detail.includes('precondition') ? 'precondition' : err.detail && err.detail.includes('postcondition') ? 'postcondition' : 'invariant';
        console.error('Cause: Contract ' + elem + ' not covered by test plan');
        console.error('Action: Update testUnit entries to cover the contract\'s ' + elem + ' text');
      }
    }
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, ticket: ticketKey }));
  process.exit(0);
}

if (require.main === module) main();
module.exports = { verifyMakeContracts };
