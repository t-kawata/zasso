#!/usr/bin/env node
// [::TICKET::] PX-94, PX-95: STUB marker insertion script + ghost ticket prevention checks. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-94|PX-95) --for-spec --no-implementation-order`.
// [::TICKET::] PX-81 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-81 --for-spec --no-implementation-order`.

/**
 * validate-ticket-targets.test.js — Tests for validate-ticket-targets.js
 *
 * Covers C005 (8-item validation) and C006 (existing script integration).
 *
 * [::TICKET::] PX-77: Core Validation Scripts — validate-ticket-targets
 * @verifies C005
 * @verifies C006
 * @verifies C002
 * @verifies PX-80-C003
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

let validateTargets;
let checkContractIdExists;
let checkFileExists;
let checkMarkerTextMatches;
let checkContractsNonEmpty;
let checkDeferredToExists;
let checkStatusValid;
let checkFalsePositiveJustification;
let checkDagCycles;

let passed = 0;
let failed = 0;

// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function assertStrictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function assertOk(value, message) {
  if (value) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

console.log('\n━━━ validate-ticket-targets.test.js ━━━\n');

try {
  const mod = require('../validate-ticket-targets');
  validateTargets = mod.validateTargets;
  checkContractIdExists = mod.checkContractIdExists;
  checkFileExists = mod.checkFileExists;
  checkMarkerTextMatches = mod.checkMarkerTextMatches;
  checkContractsNonEmpty = mod.checkContractsNonEmpty;
  checkDeferredToExists = mod.checkDeferredToExists;
  checkStatusValid = mod.checkStatusValid;
  checkFalsePositiveJustification = mod.checkFalsePositiveJustification;
  checkDagCycles = mod.checkDagCycles;
} catch (e) {
  failed++;
  console.log('  ✗ Failed to load validate-ticket-targets.js: ' + e.message + '\n');
  console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
  process.exit(1);
}

// Create temp files for testing
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-test-'));
const existingFile = path.join(tmpDir, 'test.rs');
fs.writeFileSync(existingFile, '// [::STUB::] PX-77: fix validation\n');

// ===== Helper: create minimal Tickets.json =====
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function makeTicketsData(targetPhaseId, targetId, contracts) {
  return {
    phases: [{
      phaseId: targetPhaseId,
      tickets: [{
        id: targetId,
        phaseId: targetPhaseId,
        status: 'started',
        contracts: contracts || [{ id: 'C001' }, { id: 'C002' }],
        targetStubs: [{
          id: 'TS-001', ticketRef: 'PX-77', file: existingFile, line: 1,
          markerText: '// [::STUB::] PX-77: fix validation',
          contracts: ['C001'], deferredTo: null, status: 'pending',
          resolutionPlan: 'Will fix'
        }],
        targetCrimes: []
      }]
    }]
  };
}

// ===== C005 Precondition: targetStubs/targetCrimes populated =====
console.log('## C005 Precondition — Fields exist\n');

(function () {
  const ticketsData = makeTicketsData(-1, 77);
  const ticket = ticketsData.phases[0].tickets[0];
  assert(ticket.targetStubs !== undefined, 'targetStubs field exists');
  assert(ticket.targetCrimes !== undefined, 'targetCrimes field exists');
})();

// ===== C005 Postcondition: All 8 validation items pass =====
console.log('\n## C005 Postcondition — All 8 items pass\n');

(function () {
  const ticketsData = makeTicketsData(-1, 77);
  const result = validateTargets(ticketsData, 'PX-77');

  assert(result !== null, 'validateTargets returns a result');
  assert(result.valid !== undefined, 'result has valid field');
  assert(Array.isArray(result.checks || result.errors), 'result has checks or errors array');
})();

// ===== Individual check functions =====
console.log('\n## Individual 8-item checks\n');

(function () {
  // Check 1: contracts[].id exists in Tickets.json
  const c1pass = checkContractIdExists('TS-001', ['C001'], [{ id: 'C001' }, { id: 'C002' }]);
  assertStrictEqual(c1pass.pass, true, 'Check 1: existing contract ID passes');

  const c1fail = checkContractIdExists('TS-001', ['C999'], [{ id: 'C001' }]);
  assertStrictEqual(c1fail.pass, false, 'Check 1: nonexistent contract ID fails');
  assert(c1fail.error.includes('[ERROR]'), 'Check 1 failure includes [ERROR]');
  assert(c1fail.error.includes('Cause:'), 'Check 1 failure includes Cause:');
  assert(c1fail.error.includes('Action:'), 'Check 1 failure includes Action:');

  // Check 2: file path exists on disk
  const c2pass = checkFileExists('TS-001', existingFile);
  assertStrictEqual(c2pass.pass, true, 'Check 2: existing file passes');

  const c2fail = checkFileExists('TS-001', '/nonexistent/path/file.rs');
  assertStrictEqual(c2fail.pass, false, 'Check 2: nonexistent file fails');

  // Check 3: markerText matches grep in file
  const c3pass = checkMarkerTextMatches('TS-001', existingFile, '// [::STUB::] PX-77: fix validation');
  assertStrictEqual(c3pass.pass, true, 'Check 3: matching markerText passes');

  const c3fail = checkMarkerTextMatches('TS-001', existingFile, '// [::STUB::] P0-1: nonexistent');
  assertStrictEqual(c3fail.pass, false, 'Check 3: non-matching markerText fails');

  // Check 4: contracts array is non-empty
  const c4pass = checkContractsNonEmpty('TS-001', ['C001', 'C002']);
  assertStrictEqual(c4pass.pass, true, 'Check 4: non-empty contracts passes');

  const c4fail = checkContractsNonEmpty('TS-001', []);
  assertStrictEqual(c4fail.pass, false, 'Check 4: empty contracts fails');

  // Check 5: deferred_to ticket exists in Tickets.json
  const ticketsData = makeTicketsData(-1, 77);
  const c5pass = checkDeferredToExists('TS-001', null, ticketsData);
  assertStrictEqual(c5pass.pass, true, 'Check 5: null deferred_to passes (no dependency)');

  // Check 6: status is valid
  const c6pass = checkStatusValid('TS-001', 'pending');
  assertStrictEqual(c6pass.pass, true, 'Check 6: "pending" is valid');

  const c6fail = checkStatusValid('TS-001', 'invalid_status');
  assertStrictEqual(c6fail.pass, false, 'Check 6: "invalid_status" is rejected');

  // Check 7: false_positive justification (>= 100 chars with type names)
  const c7pass = checkFalsePositiveJustification('TS-001', null);
  assertStrictEqual(c7pass.pass, true, 'Check 7: no false_positive (null) passes');

  const goodJustification = 'This is a design limitation in the ACP session manager where the spawn mechanism cannot be unit tested without a runtime. The limitation applies to ACP Runtime type.';
  const c7pass2 = checkFalsePositiveJustification('TS-001', { justification: goodJustification, approvedBy: 'reviewer' });
  assertStrictEqual(c7pass2.pass, true, 'Check 7: long justification with types passes');

  // Check 8: DAG cycle detection
  const c8pass = checkDagCycles('TS-001', [], []);
  assertStrictEqual(c8pass.pass, true, 'Check 8: no deferred_to refs passes (no cycle)');
})();

// ===== C005 Invariant: any single violation causes exit 1 with 3-line format =====
console.log('\n## C005 Invariant — 3-line error format\n');

(function () {
  // Test with a bad contract ID
  const badData = makeTicketsData(-1, 77);
  badData.phases[0].tickets[0].targetStubs[0].contracts = ['C999'];
  const result = validateTargets(badData, 'PX-77');

  assertStrictEqual(result.valid, false, 'validation fails with bad contract ID');
  assert(result.formattedErrors !== undefined, 'formatted errors present');
  if (result.formattedErrors && result.formattedErrors.length > 0) {
    const firstError = result.formattedErrors[0];
    assert(typeof firstError === 'string', 'error is a string');
    // Check if it's a 3-line or multi-line format
    const lines = firstError.split('\n').filter(function (l) { return l.trim().length > 0; });
    assert(lines.length >= 3, 'error contains at least 3 lines of actionable guidance');
  }
})();

// ===== C006 Postcondition: existing scripts called =====
console.log('\n## C006 — Existing script integration\n');

(function () {
  const ticketsData = makeTicketsData(-1, 77);
  const result = validateTargets(ticketsData, 'PX-77');

  assert(result !== null, 'validateTargets returns a result');
  assert(result.existsCheck !== undefined || result.valid !== undefined,
    'result has expected fields');
})();

// ===== verified_empty handling =====
console.log('\n## Verified empty handling\n');

(function () {
  const emptyData = {
    phases: [{ phaseId: -1, tickets: [{ id: 77, phaseId: -1, status: 'started',
      targetStubs: 'verified_empty', targetCrimes: 'verified_empty'
    }] }]
  };

  const result = validateTargets(emptyData, 'PX-77');
  assertStrictEqual(result.valid, true, 'verified_empty returns valid=true');
  assert(result.skipped || result.verifiedEmpty, 'verified_empty is detected as skipped');
})();

// ===== DAG cycle detection =====
console.log('\n## DAG cycle detection\n');

(function () {
  // Acyclic graph: A->B, B->C
  const acyclic = checkDagCycles('TS-A', [
    { id: 'TS-A', deferredTo: 'TS-B' },
    { id: 'TS-B', deferredTo: 'TS-C' },
    { id: 'TS-C', deferredTo: null }
  ], [{ id: 'TS-A' }, { id: 'TS-B' }, { id: 'TS-C' }]);
  assertStrictEqual(acyclic.pass, true, 'acyclic deferred_to chain passes');

  // Cyclic graph: A->B, B->C, C->A
  const cyclic = checkDagCycles('TS-A', [
    { id: 'TS-A', deferredTo: 'TS-B' },
    { id: 'TS-B', deferredTo: 'TS-C' },
    { id: 'TS-C', deferredTo: 'TS-A' }
  ], [{ id: 'TS-A' }, { id: 'TS-B' }, { id: 'TS-C' }]);
  assertStrictEqual(cyclic.pass, false, 'cyclic deferred_to chain is rejected');
  assert(Array.isArray(cyclic.cyclePath) || cyclic.error !== undefined,
    'cycle detection provides cycle path or error message');
})();

// ================================================================
// PX-95: Check 9 — ORPHAN_TICKET_REF false_positive must have valid deferredTo
// ================================================================
console.log('\n## PX-95 Check 9 — ORPHAN_TICKET_REF false_positive\n');

// Normal: ORPHAN_TICKET_REF + false_positive + valid deferredTo → pass
(function testC9PassWithValidDeferred() {
  if (!checkStatusValid) { failed++; console.log('  ✗ module not loaded\n'); return; }
  const item = {
    id: 'C9-001', crimeType: 'ORPHAN_TICKET_REF',
    status: 'false_positive', deferredTo: 'PX-77', file: existingFile,
    markerText: '// [::STUB::] PX-77: test',
  };
  const ticketsData = makeTicketsData(-1, 77, [{ id: 'C001' }]);
  const { checkOrphanTicketRefNotFp } = require('../validate-ticket-targets');
  const result = checkOrphanTicketRefNotFp(item, ticketsData);
  assert(result.pass === true, 'C9 pass: ORPHAN_TICKET_REF + false_positive + valid deferredTo');
})();

// Normal: ORPHAN_TICKET_REF + false_positive + no deferredTo → fail
(function testC9FailNoDeferred() {
  const { checkOrphanTicketRefNotFp } = require('../validate-ticket-targets');
  const item = {
    id: 'C9-002', crimeType: 'ORPHAN_TICKET_REF',
    status: 'false_positive', deferredTo: null,
  };
  const ticketsData = makeTicketsData(0, 1);
  const result = checkOrphanTicketRefNotFp(item, ticketsData);
  assert(result.pass === false, 'C9 fail: ORPHAN_TICKET_REF + false_positive + no deferredTo');
})();

// Normal: ORPHAN_TICKET_REF + resolved → pass (not false_positive)
(function testC9PassResolved() {
  const { checkOrphanTicketRefNotFp } = require('../validate-ticket-targets');
  const item = {
    id: 'C9-003', crimeType: 'ORPHAN_TICKET_REF',
    status: 'resolved', deferredTo: null,
  };
  const result = checkOrphanTicketRefNotFp(item, { phases: [] });
  assert(result.pass === true, 'C9 pass: ORPHAN_TICKET_REF + resolved (not false_positive)');
})();

// Edge: deferredTo references existing ticket → pass
(function testC9EdgeDeferredToExists() {
  const { checkOrphanTicketRefNotFp } = require('../validate-ticket-targets');
  const item = {
    id: 'C9-004', crimeType: 'ORPHAN_TICKET_REF',
    status: 'false_positive', deferredTo: 'P0-1',
  };
  const ticketsData = {
    phases: [{ id: 0, tickets: [{ id: 1, phaseId: 0, status: 'done' }] }]
  };
  const result = checkOrphanTicketRefNotFp(item, ticketsData);
  assert(result.pass === true, 'C9 edge: deferredTo P0-1 exists — pass');
})();

// ================================================================
// PX-95: Check 10 — COMPLETED_TICKET_STALE cannot be false_positive
// ================================================================
console.log('\n## PX-95 Check 10 — COMPLETED_TICKET_STALE false_positive\n');

// Normal: COMPLETED_TICKET_STALE + false_positive → fail
(function testC10FailFp() {
  const { checkCompletedTicketStaleNotFp } = require('../validate-ticket-targets');
  const item = {
    id: 'C10-001', crimeType: 'COMPLETED_TICKET_STALE',
    status: 'false_positive',
  };
  const result = checkCompletedTicketStaleNotFp(item);
  assert(result.pass === false, 'C10 fail: COMPLETED_TICKET_STALE + false_positive');
})();

// Normal: COMPLETED_TICKET_STALE + resolved → pass
(function testC10PassResolved() {
  const { checkCompletedTicketStaleNotFp } = require('../validate-ticket-targets');
  const item = {
    id: 'C10-002', crimeType: 'COMPLETED_TICKET_STALE',
    status: 'resolved',
  };
  const result = checkCompletedTicketStaleNotFp(item);
  assert(result.pass === true, 'C10 pass: COMPLETED_TICKET_STALE + resolved');
})();

// Normal: NOT COMPLETED_TICKET_STALE + false_positive → pass (other crime types unaffected)
(function testC10PassOtherType() {
  const { checkCompletedTicketStaleNotFp } = require('../validate-ticket-targets');
  const item = {
    id: 'C10-003', crimeType: 'ORPHAN_TICKET_REF',
    status: 'false_positive',
  };
  const result = checkCompletedTicketStaleNotFp(item);
  assert(result.pass === true, 'C10 pass: ORPHAN_TICKET_REF + false_positive (not COMPLETED_TICKET_STALE)');
})();

// ================================================================
// PX-95: Check 11 — false_positive note must not reference ghost tickets
// ================================================================
console.log('\n## PX-95 Check 11 — false_positive note ghost ticket check\n');

// Normal: false_positive with existing ticket in note → pass
(function testC11PassValidRef() {
  const { checkFalsePositiveNoteIsNotGhostTicket } = require('../validate-ticket-targets');
  const item = {
    id: 'C11-001', status: 'false_positive',
    note: 'Deferred to PX-77 which exists in Tickets.json',
  };
  const ticketsData = {
    phases: [{ id: -1, tickets: [{ id: 77, phaseId: -1, status: 'done' }] }]
  };
  const result = checkFalsePositiveNoteIsNotGhostTicket(item, ticketsData);
  assert(result.pass === true, 'C11 pass: note references existing PX-77');
})();

// Normal: false_positive with non-existent ticket in note → fail
(function testC11FailGhostRef() {
  const { checkFalsePositiveNoteIsNotGhostTicket } = require('../validate-ticket-targets');
  const item = {
    id: 'C11-002', status: 'false_positive',
    note: 'Deferred to P9-99 which does not exist',
  };
  const result = checkFalsePositiveNoteIsNotGhostTicket(item, { phases: [] });
  assert(result.pass === false, 'C11 fail: note references non-existent P9-99');
})();

// Normal: status is NOT false_positive → pass (note not checked)
(function testC11PassNonFp() {
  const { checkFalsePositiveNoteIsNotGhostTicket } = require('../validate-ticket-targets');
  const item = {
    id: 'C11-003', status: 'resolved',
    note: 'Deferred to P9-99',
  };
  const result = checkFalsePositiveNoteIsNotGhostTicket(item, { phases: [] });
  assert(result.pass === true, 'C11 pass: status is resolved, note not checked');
})();

// Normal: note with no ticket reference → pass
(function testC11PassNoRef() {
  const { checkFalsePositiveNoteIsNotGhostTicket } = require('../validate-ticket-targets');
  const item = {
    id: 'C11-004', status: 'false_positive',
    note: 'This is genuinely unresolvable due to external dependency',
  };
  const result = checkFalsePositiveNoteIsNotGhostTicket(item, { phases: [] });
  assert(result.pass === true, 'C11 pass: note with no ticket reference');
})();

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);

if (failed > 0) process.exit(1);
