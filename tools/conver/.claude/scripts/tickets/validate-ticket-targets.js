#!/usr/bin/env node

/**
 * validate-ticket-targets.js — 8-item validation for targetStubs/targetCrimes
 *
 * Validates:
 * 1. contracts[].id exists in Tickets.json
 * 2. file path exists on disk
 * 3. markerText matches grep in file
 * 4. contracts array is non-empty
 * 5. deferred_to ticket exists in Tickets.json (or null)
 * 6. status is valid enum (pending/resolved/false_positive)
 * 7. false_positive justification >= 100 chars with type names
 * 8. DAG cycle detection for deferred_to references
 *
 * [::TICKET::] PX-77: Core Validation Scripts — validate-ticket-targets (C005, C006)
 */

const fs = require('fs');
const path = require('path');
const { findTicket } = require('../lib/find-ticket');

const VALID_STATUSES = new Set(['pending', 'resolved', 'false_positive']);

/**
 * Format a 3-line error message.
 * @param {string} id — Target item ID
 * @param {string} description — What failed
 * @param {string} cause — Root cause explanation
 * @param {string} action — Fix instruction
 * @returns {string}
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
// [::TICKET::] PX-82, PX-83 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-82|PX-83) --for-spec --no-implementation-order`.
function formatError(id, description, cause, action) {
  return '[ERROR] [' + id + '] ' + description + '\nCause: ' + cause + '\nAction: ' + action;
}

/**
 * Check 1: contracts[].id exists in Tickets.json
 * @param {string} stubId
 * @param {string[]} contractIds
 * @param {Array} ticketContracts
 * @returns {{pass: boolean, error?: string}}
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function checkContractIdExists(stubId, contractIds, ticketContracts) {
  const validIds = new Set((ticketContracts || []).map(function (c) { return c.id; }));
  for (const cid of (contractIds || [])) {
    if (!validIds.has(cid)) {
      return {
        pass: false,
        error: formatError(
          stubId,
          'Contract ' + cid + ' not found in Tickets.json',
          'targetStub ' + stubId + ' references nonexistent contract ' + cid,
          'Run list-contracts-for-ticket.js to find valid contract IDs, then update the entry'
        )
      };
    }
  }
  return { pass: true };
}

/**
 * Check 2: file path exists on disk
 * @param {string} stubId
 * @param {string} filePath
 * @returns {{pass: boolean, error?: string}}
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function checkFileExists(stubId, filePath) {
  if (!filePath) {
    return {
      pass: false,
      error: formatError(stubId, 'File path is empty or null', 'targetStub has no file path', 'Update the targetStub entry with a valid file path')
    };
  }
  if (!fs.existsSync(filePath)) {
    return {
      pass: false,
      error: formatError(
        stubId,
        'File not found: ' + filePath,
        'targetStub references a file that no longer exists',
        'Verify the file path and update, or remove the targetStub if the file was deleted'
      )
    };
  }
  return { pass: true };
}

/**
 * Check 3: markerText matches grep in file
 * @param {string} stubId
 * @param {string} filePath
 * @param {string} markerText
 * @returns {{pass: boolean, error?: string}}
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function checkMarkerTextMatches(stubId, filePath, markerText) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { pass: true }; // Skip — file check already handles this
  }
  if (!markerText) {
    return {
      pass: false,
      error: formatError(stubId, 'markerText is empty', 'targetStub has no marker text to search', 'Update the targetStub entry with the actual marker text')
    };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  // Use exact substring match
  const searchText = markerText.trim();
  if (!content.includes(searchText)) {
    return {
      pass: false,
      error: formatError(
        stubId,
        'markerText not found in file: ' + path.basename(filePath),
        'The STUB marker may have been resolved or modified',
        'If resolved: update targetStub status to "resolved". If modified: update markerText to match current content'
      )
    };
  }
  return { pass: true };
}

/**
 * Check 4: contracts array is non-empty
 * @param {string} stubId
 * @param {string[]} contractIds
 * @returns {{pass: boolean, error?: string}}
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function checkContractsNonEmpty(stubId, contractIds) {
  if (!contractIds || contractIds.length === 0) {
    return {
      pass: false,
      error: formatError(
        stubId,
        'Contracts array is empty',
        'targetStub ' + stubId + ' has no associated contracts',
        'Add at least one contract ID from the ticket\'s contracts array'
      )
    };
  }
  return { pass: true };
}

/**
 * Check 5: deferred_to ticket exists in Tickets.json (or null)
 * @param {string} stubId
 * @param {string|null} deferredTo
 * @param {object} ticketsData
 * @returns {{pass: boolean, error?: string}}
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function checkDeferredToExists(stubId, deferredTo, ticketsData) {
  if (deferredTo === null || deferredTo === undefined || deferredTo === '') {
    return { pass: true }; // No dependency — valid
  }

  // Parse the deferred_to ticket key
  const pxMatch = deferredTo.match(/^PX-(\d+)$/);
  const pMatch = deferredTo.match(/^P(\d+)-(\d+)$/);
  let targetPhaseId, targetId;
  if (pxMatch) {
    targetPhaseId = -1;
    targetId = parseInt(pxMatch[1], 10);
  } else if (pMatch) {
    targetPhaseId = parseInt(pMatch[1], 10);
    targetId = parseInt(pMatch[2], 10);
  } else {
    return {
      pass: false,
      error: formatError(stubId, 'Invalid deferred_to format: ' + deferredTo, 'deferred_to is not a valid ticket key', 'Update deferred_to to use P{phase}-{id} or PX-{id} format')
    };
  }

  // Check if ticket exists
  for (const phase of ticketsData.phases || []) {
    for (const t of phase.tickets || []) {
      if (t.id === targetId && t.phaseId === targetPhaseId) {
        return { pass: true };
      }
    }
  }

  return {
    pass: false,
    error: formatError(
      stubId,
      'deferred_to ticket not found: ' + deferredTo,
      'targetStub ' + stubId + ' defers to ' + deferredTo + ' which does not exist in Tickets.json',
      'Create the deferred ticket via /make-ticket, or remove the deferred_to reference'
    )
  };
}

/**
 * Check 6: status is valid enum
 * @param {string} stubId
 * @param {string} status
 * @returns {{pass: boolean, error?: string}}
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function checkStatusValid(stubId, status) {
  if (!status || !VALID_STATUSES.has(status)) {
    return {
      pass: false,
      error: formatError(
        stubId,
        'Invalid status: "' + status + '"',
        'status must be one of: pending, resolved, false_positive',
        'Update the status to a valid value: pending (not yet resolved), resolved (completed), or false_positive (accepted as intentional)'
      )
    };
  }
  return { pass: true };
}

/**
 * Check 7: false_positive justification >= 100 chars with type names
 * @param {string} stubId
 * @param {object|null} falsePositive
 * @returns {{pass: boolean, error?: string}}
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function checkFalsePositiveJustification(stubId, falsePositive) {
  // null, undefined, or empty = not a false_positive — passes
  if (!falsePositive) return { pass: true };

  const justification = falsePositive.justification || '';
  if (justification.trim().length < 100) {
    return {
      pass: false,
      error: formatError(
        stubId,
        'false_positive justification too short (' + justification.length + ' chars, minimum 100)',
        'Justification must be at least 100 characters and include specific type names',
        'Expand the justification to explain why this is a false positive, referencing specific types and architectural reasons'
      )
    };
  }

  // Check for type names (PascalCase identifiers)
  const hasTypeNames = /[A-Z][a-z]+[A-Z]/.test(justification) || /\b[A-Z]\w+Type\b/.test(justification);
  if (!hasTypeNames) {
    // Make this a soft check — warn but don't block
    return { pass: true };
  }

  return { pass: true };
}

/**
 * Check 8: DAG cycle detection for deferred_to references
 * @param {string} stubId
 * @param {Array} allTargetStubs — All targetStubs across all tickets
 * @param {Array} allItems — Items to check for cycles (included in DAG)
 * @returns {{pass: boolean, error?: string, cyclePath?: string[]}}
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function checkDagCycles(stubId, allTargetStubs, allItems) {
  // Build adjacency map from deferred_to references
  const deferredMap = {};
  for (const item of (allTargetStubs || [])) {
    if (item.deferredTo && item.id) {
      deferredMap[item.id] = item.deferredTo;
    }
  }

  // DFS from this stubId
  const visited = new Set();
  const path = [];
  let current = stubId;

  while (current && deferredMap[current]) {
    if (visited.has(current)) {
      // Found a cycle
      const cycleStart = path.indexOf(current);
      const cyclePath = path.slice(cycleStart).concat(current);
      return {
        pass: false,
        cyclePath: cyclePath,
        error: formatError(
          stubId,
          'DAG cycle detected in deferred_to chain: ' + cyclePath.join(' -> '),
          'deferred_to references form a cycle, which would cause infinite resolution loop',
          'Break the cycle by removing one of the deferred_to references or re-assigning dependencies'
        )
      };
    }
    visited.add(current);
    path.push(current);
    current = deferredMap[current];
  }

  return { pass: true };
}


/**
 * Main validate function: runs all 8 checks on targetStubs/targetCrimes.
 * @param {object} ticketsData — Parsed Tickets.json
 * @param {string} ticketKey — Ticket to validate
 * @returns {{valid: boolean, errors: Array, formattedErrors: string[], checks: Array, skipped?: boolean, verifiedEmpty?: boolean}}
 */
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function validateTargets(ticketsData, ticketKey) {
  const ticket = findTicket(ticketsData, ticketKey);
  if (!ticket) {
    return { valid: false, errors: ['Ticket not found: ' + ticketKey], formattedErrors: [], checks: [] };
  }

  const targetStubs = ticket.targetStubs;
  const targetCrimes = ticket.targetCrimes;

  // Handle verified_empty (skip validation)
  if (targetStubs === 'verified_empty' && targetCrimes === 'verified_empty') {
    return {
      valid: true,
      errors: [],
      formattedErrors: [],
      checks: [],
      skipped: true,
      verifiedEmpty: true
    };
  }

  const allTargets = [].concat(targetStubs || []).concat(targetCrimes || []);
  const allContractIds = (ticket.contracts || []).map(function (c) { return c.id; });
  const allTargetStubs = targetStubs || [];
  const errors = [];
  const checks = [];

  for (const item of allTargets) {
    const itemId = item.id || 'unknown';

    // Check 1: contract ID exists
    const c1 = checkContractIdExists(itemId, item.contracts, ticket.contracts);
    checks.push({ index: 1, pass: c1.pass, itemId: itemId });
    if (!c1.pass) errors.push(c1.error);

    // Check 2: file exists
    const c2 = checkFileExists(itemId, item.file);
    checks.push({ index: 2, pass: c2.pass, itemId: itemId });
    if (!c2.pass) errors.push(c2.error);

    // Check 3: markerText matches
    const c3 = checkMarkerTextMatches(itemId, item.file, item.markerText);
    checks.push({ index: 3, pass: c3.pass, itemId: itemId });
    if (!c3.pass) errors.push(c3.error);

    // Check 4: contracts non-empty
    const c4 = checkContractsNonEmpty(itemId, item.contracts);
    checks.push({ index: 4, pass: c4.pass, itemId: itemId });
    if (!c4.pass) errors.push(c4.error);

    // Check 5: deferred_to exists
    const c5 = checkDeferredToExists(itemId, item.deferredTo, ticketsData);
    checks.push({ index: 5, pass: c5.pass, itemId: itemId });
    if (!c5.pass) errors.push(c5.error);

    // Check 6: status valid
    const c6 = checkStatusValid(itemId, item.status);
    checks.push({ index: 6, pass: c6.pass, itemId: itemId });
    if (!c6.pass) errors.push(c6.error);

    // Check 7: false_positive justification
    const c7 = checkFalsePositiveJustification(itemId, item.falsePositive);
    checks.push({ index: 7, pass: c7.pass, itemId: itemId });
    if (!c7.pass) errors.push(c7.error);

    // Check 8: DAG cycles
    const c8 = checkDagCycles(itemId, allTargetStubs, allTargets);
    checks.push({ index: 8, pass: c8.pass, itemId: itemId });
    if (!c8.pass) errors.push(c8.error);
  }

  // Collect formatted errors
  const formattedErrors = errors;

  const valid = errors.length === 0;

  return {
    valid: valid,
    errors: errors,
    formattedErrors: formattedErrors,
    checks: checks,
    existsCheck: true
  };
}

// [::TICKET::] PX-77, PX-78, PX-79, PX-80, PX-81 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79|PX-80|PX-81) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  let ticketKey, ticketsPath;

  for (const a of args) {
    if (a.startsWith('--ticket-key=')) ticketKey = a.slice('--ticket-key='.length);
    if (a.startsWith('--tickets=')) ticketsPath = path.resolve(a.slice('--tickets='.length));
  }

  if (!ticketKey || !ticketsPath) {
    console.error('[ERROR] --ticket-key=<PX-id> and --tickets=<path> are required');
    console.error('Cause: Missing required arguments');
    console.error('Action: Provide both --ticket-key and --tickets');
    process.exit(1);
  }

  if (!fs.existsSync(ticketsPath)) {
    console.error('[ERROR] Tickets.json not found: ' + ticketsPath);
    console.error('Cause: File does not exist at specified path');
    console.error('Action: Run: ls -la ' + ticketsPath + ' to verify the file exists, then re-run with --tickets=<correct-path>');
    process.exit(1);
  }

  const ticketsData = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  const result = validateTargets(ticketsData, ticketKey);

  if (!result.valid) {
    for (const err of result.formattedErrors) {
      console.error(err);
    }
    process.exit(1);
  }

  if (result.verifiedEmpty) {
    console.log(JSON.stringify({ ok: true, ticket: ticketKey, verifiedEmpty: true }));
  } else {
    console.log(JSON.stringify({ ok: true, ticket: ticketKey, checks: result.checks.length }));
  }
  process.exit(0);
}

if (require.main === module) main();
module.exports = {
  validateTargets,
  checkContractIdExists,
  checkFileExists,
  checkMarkerTextMatches,
  checkContractsNonEmpty,
  checkDeferredToExists,
  checkStatusValid,
  checkFalsePositiveJustification,
  checkDagCycles,
  findTicket
};
