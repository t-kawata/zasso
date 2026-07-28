#!/usr/bin/env node
// [::TICKET::] PX-83: test file for Gate R enhancement

/**
 * verify-final-contracts.test.js — Tests for PX-83
 *
 * Covers C001 (3-layer Gate R verification) and
 * C002 (@verifies integration).
 *
 * Red phase: all tests should fail before implementation.
 */

const path = require('path');

let passed = 0;
let failed = 0;

// [::TICKET::] PX-83 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-83 --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-83 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-83 --for-spec --no-implementation-order`.
function assertStrictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

console.log('\n━━━ verify-final-contracts.test.js (PX-83) — RED PHASE ━━━\n');

// ======================================================================
// C001 — 3-layer Gate R verification
// ======================================================================

console.log('## C001 — Gate R 3-layer verification\n');

(function () {
  // C001-Precondition: verifyFinalContracts receives a ticket and returns proper shape
  const { verifyFinalContracts } = require('../verify-final-contracts');
  const ticket = { id: 83, status: 'done', contracts: [{ id: 'C001' }], targetStubs: 'verified_empty' };
  const opts = { tickets: [ticket], contractsCheck: true };
  const result = verifyFinalContracts(opts);
  assert(typeof result.valid === 'boolean', 'C001-Pre: returns object with valid field');
  assert(typeof result.report === 'object', 'C001-Pre: returns object with report field');
})();

(function () {
  // C001-Postcondition: status-based check still works for backward compat
  const { verifyFinalContracts } = require('../verify-final-contracts');
  const ticket = { id: 83, status: 'done', contracts: [], targetStubs: 'verified_empty' };
  const opts = { tickets: [ticket], contractsCheck: true };
  const result = verifyFinalContracts(opts);
  assert(result.valid === true, 'C001-Post: done + empty contracts passes');
})();

(function () {
  // C001-Invariant: backward compatible — no contracts + done status passes
  const { verifyFinalContracts } = require('../verify-final-contracts');
  const ticket = { id: 83, status: 'reviewed', contracts: [], targetStubs: 'verified_empty' };
  const opts = { tickets: [ticket], contractsCheck: true };
  const result = verifyFinalContracts(opts);
  assert(result.valid === true, 'C001-Inv: reviewed + verified_empty passes');
})();

// ======================================================================
// C002 — @verifies integration via scanContractCoverage
// ======================================================================

console.log('\n## C002 — @verifies integration\n');

(function () {
  // C002-Postcondition: scanContractCoverage finds @verifies annotations
  const { scanContractCoverage } = require('../verify-red-coverage');
  const content = '// @verifies C001\n// @verifies C002';
  const expectedIds = new Set(['C001', 'C002']);
  const result = scanContractCoverage(content, expectedIds);
  assert(result.covered.size === 2, 'C002-Post: both contract IDs found');
  assert(result.missing.length === 0, 'C002-Post: no missing contracts');
})();

(function () {
  // C002-Error: missing @verifies for C002
  const { scanContractCoverage } = require('../verify-red-coverage');
  const content = '// @verifies C001\n// some other code';
  const expectedIds = new Set(['C001', 'C002']);
  const result = scanContractCoverage(content, expectedIds);
  assert(result.covered.has('C001'), 'C002-Err: C001 covered');
  assert(!result.covered.has('C002'), 'C002-Err: C002 missing');
  assert(result.missing.includes('C002'), 'C002-Err: C002 in missing array');
})();

(function () {
  // C002-Invariant: unknown @verifies reported without blocking
  const { scanContractCoverage } = require('../verify-red-coverage');
  const content = '// @verifies C001\n// @verifies C999';
  const expectedIds = new Set(['C001']);
  const result = scanContractCoverage(content, expectedIds);
  assert(result.covered.has('C001'), 'C002-Inv: C001 covered');
  assert(result.unknown.length === 1, 'C002-Inv: C999 reported as unknown');
  assertStrictEqual(result.unknown[0].id, 'C999', 'C002-Inv: unknown ID is C999');
})();

// ======================================================================
// Enhanced verifyFinalContracts with code-level checks
// ======================================================================

console.log('\n## Enhanced Gate R (checkVerifiesCoverage + checkStubResolution)\n');

(function () {
  // checkVerifiesCoverage: fully satisfied contracts pass
  const { checkVerifiesCoverage } = require('../verify-final-contracts');
  const ticket = { id: 83, contracts: [{ id: 'C001' }] };
  const testDir = path.resolve(__dirname, '..');
  // This will fail until checkVerifiesCoverage is implemented
  assert(typeof checkVerifiesCoverage === 'function', 'checkVerifiesCoverage function exists');
})();

(function () {
  // checkStubResolution: all stubs resolved passes
  const { checkStubResolution } = require('../verify-final-contracts');
  assert(typeof checkStubResolution === 'function', 'checkStubResolution function exists');
})();

(function () {
  // checkStubResolution: unresolved stubs fail
  const { checkStubResolution } = require('../verify-final-contracts');
  const targetStubs = [
    { id: 'TS-001', status: 'resolved' },
    { id: 'TS-002', status: 'pending', deferredTo: null }
  ];
  const result = checkStubResolution(targetStubs);
  assert(result.valid === false, 'unresolved stub makes checkStubResolution fail');
  assert(Array.isArray(result.unresolved), 'unresolved stubs reported in array');
  assert(result.unresolved.length === 1, 'only TS-002 is unresolved');
  assert(result.unresolved[0] === 'TS-002', 'unresolved stub ID is TS-002');
})();

(function () {
  // checkStubResolution: verified_empty skips check
  const { checkStubResolution } = require('../verify-final-contracts');
  const result = checkStubResolution('verified_empty');
  assert(result.valid === true, 'verified_empty passes without check');
})();

// ======================================================================
// Summary
// ======================================================================

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);

if (failed > 0) process.exit(1);
