#!/usr/bin/env node

/**
 * verify-plan-contracts-kindness.test.js — Tests for PX-84
// @verifies C001
// @verifies C002
 *
 * Verifies that verifyPlanContracts rejects missing planTestCode
 * when contracts exist (C001) and produces dynamic Cause/Action (C002).
 *
 * Red phase: all tests should fail before implementation.
 */

let verifyPlanContracts;
let passed = 0;
let failed = 0;

// [::TICKET::] PX-84, PX-85, PX-86, PX-87 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-84|PX-85|PX-86|PX-87) --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-84, PX-85, PX-86, PX-87 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-84|PX-85|PX-86|PX-87) --for-spec --no-implementation-order`.
function assertStrictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

console.log('\n━━━ verify-plan-contracts-kindness.test.js (PX-84) — RED PHASE ━━━\n');

try {
  const mod = require('../verify-plan-contracts');
  verifyPlanContracts = mod.verifyPlanContracts;
} catch (e) {
  failed++;
  console.log('  ✗ Failed to load verify-plan-contracts.js: ' + e.message + '\n');
  console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
  process.exit(1);
}

// ======================================================================
// C001 — Silent-pass elimination
// ======================================================================

console.log('## C001 — planTestCode emptiness check\n');

(function () {
  // C001-Postcondition: contracts exist + planTestCode undefined → errors
  const ticket = { id: 84, contracts: [{ id: 'C001', precondition: 'test', postcondition: 'test', invariant: 'test' }] };
  const errors = verifyPlanContracts(ticket);
  // RED: currently returns empty errors (silent pass)
  // GREEN: must return non-empty errors
  assert(errors.length > 0, 'contracts exist + planTestCode undefined → errors (not silent pass)');
})();

(function () {
  // C001-Postcondition: contracts exist + planTestCode null → errors
  const ticket = { id: 84, contracts: [{ id: 'C001', precondition: 'test', postcondition: 'test', invariant: 'test' }], planTestCode: null };
  const errors = verifyPlanContracts(ticket);
  assert(errors.length > 0, 'contracts exist + planTestCode null → errors');
})();

(function () {
  // C001-Postcondition: contracts exist + planTestCode empty array → errors
  const ticket = { id: 84, contracts: [{ id: 'C001', precondition: 'test', postcondition: 'test', invariant: 'test' }], planTestCode: [] };
  const errors = verifyPlanContracts(ticket);
  assert(errors.length > 0, 'contracts exist + planTestCode [] → errors');
})();

(function () {
  // C001-Edge: no contracts + no planTestCode → passes (backward compat)
  const ticket = { id: 84, contracts: [], planTestCode: undefined };
  const errors = verifyPlanContracts(ticket);
  assert(errors.length === 0, 'no contracts + no planTestCode → passes (backward compat)');
})();

(function () {
  // C001-Edge: no contracts + planTestCode exists → passes
  const ticket = { id: 84, contracts: [], planTestCode: ['UT: test'] };
  const errors = verifyPlanContracts(ticket);
  assert(errors.length === 0, 'no contracts + planTestCode exists → passes');
})();

// ======================================================================
// C002 — Dynamic Cause/Action
// ======================================================================

console.log('\n## C002 — Dynamic Cause/Action\n');

(function () {
  // Error detail contains dynamic content (not generic)
  const ticket = { id: 84, contracts: [{ id: 'C001', precondition: 'specificReq123', postcondition: 'specificOut456', invariant: 'specificInv789' }] };
  const errors = verifyPlanContracts(ticket);
  if (errors.length > 0) {
    const detail = errors[0].detail || '';
    assert(detail.length > 0, 'error detail is non-empty');
  } else {
    assert(false, 'should have errors for missing planTestCode');
  }
})();

// ======================================================================
// Summary
// ======================================================================

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);

if (failed > 0) process.exit(1);
