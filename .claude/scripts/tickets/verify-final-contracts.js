#!/usr/bin/env node

/**
 * verify-final-contracts.js — Verify final contract fulfillment (Gate R)
 *
 * Enhanced with code-level contract verification:
 * Layer 1 - Status check (existing)
 * Layer 2 - @verifies coverage via scanContractCoverage (new)
 * Layer 3 - targetStub resolution check (new)
 *
 * Usage: node verify-final-contracts.js --ticket-key=<PX-id> --tickets=<path> [--test-dir=<path>]
 *
 * Exits 0 on pass, 1 on failure. JSON report on stdout, errors on stderr.
 *
 * [::TICKET::] PX-71: Gate R + Pipeline Integration
 * [::TICKET::] PX-83: Gate R code-level enhancement (3-layer verification)
 */

const fs = require('fs');
const path = require('path');

// Import scanContractCoverage from verify-red-coverage for Layer 2
// [::TICKET::] PX-83: @verifies integration via scanContractCoverage
const { scanContractCoverage, findTestFiles } = require('./verify-red-coverage');

// [::TICKET::] PX-71, PX-83 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-71|PX-83) --for-spec --no-implementation-order`.
function parseArgs() {
  const args = process.argv.slice(2);
  let ticketKey, ticketsPath, testDir = '.';
  for (const a of args) {
    if (a.startsWith('--ticket-key=')) ticketKey = a.slice('--ticket-key='.length);
    if (a.startsWith('--tickets=')) ticketsPath = path.resolve(a.slice('--tickets='.length));
    if (a.startsWith('--test-dir=')) testDir = path.resolve(a.slice('--test-dir='.length));
  }
  if (!ticketKey || !ticketsPath) {
    console.error('[ERROR] --ticket-key=<PX-id> and --tickets=<path> are required');
    process.exit(1);
  }
  return { ticketKey, ticketsPath, testDir };
}

/**
 * Format a 3-line error message.
 * @param {string} id
 * @param {string} description
 * @param {string} cause
 * @param {string} action
 * @returns {string}
 */
// [::TICKET::] PX-83: extracted formatError for DRY 3-line error template
// [::TICKET::] PX-83 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-83 --for-spec --no-implementation-order`.
function formatError(id, description, cause, action) {
  return '[ERROR] [' + id + '] ' + description + '\nCause: ' + cause + '\nAction: ' + action;
}

/**
 * Layer 2 — Check @verifies coverage for all contracts in test files.
 *
 * @param {object} ticket — Ticket object with contracts[]
 * @param {string} testDir — Directory containing test files
 * @returns {{valid: boolean, missing: string[], total: number, covered: number}}
 */
// [::TICKET::] PX-83: checkVerifiesCoverage — @verifies annotation scan
// [::TICKET::] PX-83, PX-84, PX-85, PX-86, PX-87 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-83|PX-84|PX-85|PX-86|PX-87) --for-spec --no-implementation-order`.
function checkVerifiesCoverage(ticket, testDir) {
  const contractIds = new Set();
  const contracts = ticket.contracts || [];
  for (const c of contracts) {
    if (c.id) contractIds.add(c.id);
  }

  // No contracts to verify — pass
  if (contractIds.size === 0) {
    return { valid: true, missing: [], total: 0, covered: 0 };
  }

  // No testDir provided — skip (status-only fallback handled by caller)
  if (!testDir || !fs.existsSync(testDir)) {
    console.error('[WARNING] --test-dir not provided or not found. Layer 2 (@verifies coverage check) is skipped. Pass --test-dir=<path> to enable contract annotation verification.');
    return { valid: true, missing: [], total: contractIds.size, covered: 0, skipped: true };
  }

  // Scan test files for @verifies annotations
  const testFiles = findTestFiles(testDir);
  const allCovered = new Set();

  for (const file of testFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const result = scanContractCoverage(content, contractIds);
    for (const id of result.covered) {
      allCovered.add(id);
    }
  }

  const missing = [...contractIds].filter(function (id) { return !allCovered.has(id); });
  return {
    valid: missing.length === 0,
    missing: missing,
    total: contractIds.size,
    covered: allCovered.size,
    testFilesScanned: testFiles.length,
  };
}

/**
 * Layer 3 — Check targetStub resolution status.
 *
 * @param {*|Array} targetStubs — Ticket targetStubs (array or 'verified_empty' sentinel)
 * @returns {{valid: boolean, unresolved: string[], total: number}}
 */
// [::TICKET::] PX-83: checkStubResolution — targetStub status check
// [::TICKET::] PX-83, PX-89 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-83|PX-89) --for-spec --no-implementation-order`.
function checkStubResolution(targetStubs, ticketsData) {
  // verified_empty or undefined — no stubs to check
  if (targetStubs === 'verified_empty' || targetStubs === undefined || targetStubs === null) {
    return { valid: true, unresolved: [], total: 0 };
  }

  if (!Array.isArray(targetStubs)) {
    return { valid: true, unresolved: [], total: 0 };
  }

  // Build set of existing ticket keys for deferredTo validation
  const existingTicketKeys = new Set();
  if (ticketsData && ticketsData.phases) {
    for (const phase of ticketsData.phases) {
      if (phase.tickets) {
        for (const t of phase.tickets) {
          if (t.id !== undefined && t.phaseId !== undefined) {
            const key = 'P' + (t.phaseId === -1 ? 'X' : t.phaseId) + '-' + t.id;
            existingTicketKeys.add(key);
          }
        }
      }
    }
  }

  const unresolved = [];
  for (const stub of targetStubs) {
    const isResolved = stub.status === 'resolved';
    const isFalsePositive = stub.status === 'false_positive';

    // Determine if deferredTo is valid:
    // - No deferredTo (null/undefined/empty) -> no resolution path -> unresolved
    // - deferredTo present + ticketsData available -> validate against existing keys
    // - deferredTo present + no ticketsData -> trust it (backward compat)
    const hasDeferredTo = stub.deferredTo && typeof stub.deferredTo === 'string' && stub.deferredTo.length > 0;
    let deferredToValid = hasDeferredTo;
    if (hasDeferredTo && ticketsData && ticketsData.phases) {
      deferredToValid = existingTicketKeys.has(stub.deferredTo);
    }

    if (!isResolved && !deferredToValid && !isFalsePositive) {
      unresolved.push(stub.id || 'unknown');
    }
  }

  return {
    valid: unresolved.length === 0,
    unresolved: unresolved,
    total: targetStubs.length,
  };
}

/**
 * Verify final contracts for a set of tickets.
 *
 * 3-layer Gate R verification:
 * 1. Status check (existing) — ticket.status === 'done' | 'reviewed'
 * 2. @verifies coverage (new) — via scanContractCoverage in test files
 * 3. targetStub resolution (new) — all stubs resolved or deferred
 *
 * @param {object} opts — { tickets: Array, contractsCheck: boolean, testDir?: string }
 * @returns {{ valid: boolean, report: object }}
 */
// [::TICKET::] PX-71, PX-83 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-71|PX-83) --for-spec --no-implementation-order`.
function verifyFinalContracts(opts) {
  const { tickets, contractsCheck, testDir, ticketsData } = opts;
  const details = [];

  for (const t of tickets) {
    const ticketDetails = { ticketId: t.id, status: t.status };

    // Layer 1: Status check — PX-114: round-aware statuses (R1, R2, ...) count as completed
    const statusOk = t.status === 'done' || t.status === 'reviewed' || /^R[1-9]\d*$/.test(t.status);
    ticketDetails.statusOk = statusOk;

    // Layer 2: @verifies coverage (if testDir provided and contracts exist)
    let verifiesResult = null;
    if (testDir && t.contracts && t.contracts.length > 0) {
      verifiesResult = checkVerifiesCoverage(t, testDir);
      ticketDetails.verifiesOk = verifiesResult.valid;
      ticketDetails.verifiesMissing = verifiesResult.missing || [];
    }

    // Layer 3: targetStub resolution
    let stubResult = null;
    if (t.targetStubs !== undefined && t.targetStubs !== null) {
      stubResult = checkStubResolution(t.targetStubs, ticketsData);
      ticketDetails.stubsOk = stubResult.valid;
      ticketDetails.stubsUnresolved = stubResult.unresolved || [];
    }

    // Combined: fulfilled only if all applicable layers pass
    let fulfilled;
    if (contractsCheck && t.contracts && t.contracts.length > 0) {
      // Contracts exist — all 3 layers must pass
      fulfilled = statusOk;
      if (verifiesResult) fulfilled = fulfilled && verifiesResult.valid;
      if (stubResult) fulfilled = fulfilled && stubResult.valid;
    } else {
      // No contracts — status check only
      fulfilled = statusOk;
    }

    ticketDetails.fulfilled = fulfilled;
    details.push(ticketDetails);
  }

  const fulfilled = details.filter(function (d) { return d.fulfilled; }).length;
  const total = details.length;
  const coverage = total === 0 ? 100 : Math.round((fulfilled / total) * 100);
  const valid = coverage === 100 && details.every(function (d) { return d.fulfilled; });

  return {
    valid: valid,
    report: {
      coverage: coverage,
      totalContracts: total,
      fulfilledContracts: fulfilled,
      details: details,
    },
  };
}

// [::TICKET::] PX-71, PX-83, PX-89 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-71|PX-83|PX-89) --for-spec --no-implementation-order`.
function main() {
  const { ticketKey, ticketsPath, testDir } = parseArgs();

  if (!fs.existsSync(ticketsPath)) {
    console.error('[ERROR] Tickets.json not found: ' + ticketsPath);
    process.exit(2);
  }

  const ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));

  // Parse ticket key: PX-{id} or P{phase}-{id}
  const pxMatch = ticketKey.match(/^PX-(\d+)$/);
  const pMatch = ticketKey.match(/^P(\d+)-(\d+)$/);
  let targetPhaseId, targetId;
  if (pxMatch) { targetPhaseId = -1; targetId = parseInt(pxMatch[1], 10); }
  else if (pMatch) { targetPhaseId = parseInt(pMatch[1], 10); targetId = parseInt(pMatch[2], 10); }
  else { console.error('[ERROR] Invalid ticket key format: ' + ticketKey); process.exit(1); }

  // Find target ticket across all phases
  let targetTicket = null;
  for (const phase of ticketsData.phases) {
    if (phase.tickets) {
      for (const t of phase.tickets) {
        if (t.id === targetId && t.phaseId === targetPhaseId) {
          targetTicket = { ...t, phaseId: phase.id };
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

  const result = verifyFinalContracts({
    tickets: [targetTicket],
    contractsCheck: true,
    testDir: testDir,
    ticketsData: ticketsData,
  });

  if (!result.valid) {
    for (const d of result.report.details) {
      if (!d.fulfilled) {
        if (!d.statusOk) {
          console.error(formatError(
            'status',
            'Ticket ' + ticketKey + ' is ' + d.status + ' (expected done or reviewed)',
            'Gate R Layer 1 failed: ticket status not terminal',
            'Complete the ticket implementation and re-run'
          ));
        }
        if (d.verifiesOk === false) {
          for (const cid of (d.verifiesMissing || [])) {
            console.error(formatError(
              cid,
              'Contract ' + cid + ' missing @verifies annotation in test files',
              'Gate R Layer 2 failed: contract not covered by tests',
              'Add // @verifies ' + cid + ' to the corresponding test file'
            ));
          }
        }
        if (d.stubsOk === false) {
          for (const sid of (d.stubsUnresolved || [])) {
            console.error(formatError(
              sid,
              'targetStub ' + sid + ' is unresolved (status not resolved and no deferred_to)',
              'Gate R Layer 3 failed: STUB marker not resolved',
              'Resolve the STUB or set deferred_to to a valid ticket key'
            ));
          }
        }
      }
    }
    console.log(JSON.stringify({ ok: false, ...result.report }));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, ...result.report }));
  process.exit(0);
}

if (require.main === module) main();
module.exports = {
  verifyFinalContracts,
  checkVerifiesCoverage,
  checkStubResolution,
  formatError,
};
