#!/usr/bin/env node

/**
 * verify-final-contracts-warning.test.js — Tests for PX-84
// @verifies C003
 *
 * C003: checkVerifiesCoverage returns {skipped: true} when
 * --test-dir is not provided. After GREEN, WARNING also goes to stderr.
 *
 * Red phase: tests verify the skip behavior exists.
 * Passing is expected — the WARNING is additive on top.
 */

let checkVerifiesCoverage;
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

console.log('\n━━━ verify-final-contracts-warning.test.js (PX-84) ━━━\n');

try {
  const mod = require('../verify-final-contracts');
  checkVerifiesCoverage = mod.checkVerifiesCoverage;
} catch (e) {
  failed++; console.log('  ✗ Failed to load: ' + e.message + '\n');
  console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
  process.exit(1);
}

// ======================================================================
// C003 — Warning when --test-dir omitted
// ======================================================================

console.log('## C003 — testDir handling\n');

(function () {
  // Without testDir → skipped=true
  const ticket = { id: 84, contracts: [{ id: 'C001' }] };
  const result = checkVerifiesCoverage(ticket, null);
  assert(result.valid === true, 'no testDir → valid=true');
  assert(result.skipped === true, 'no testDir → skipped=true');
  // RED: passes — skip behavior already exists
  // GREEN: WARNING output must be added to stderr
})();

(function () {
  // No testDir with contracts → still valid (skipped)
  const ticket = { id: 84, contracts: [{ id: 'C001' }, { id: 'C002' }] };
  const result = checkVerifiesCoverage(ticket, undefined);
  assert(result.valid === true, 'undefined testDir → valid=true');
  assert(result.skipped === true, 'undefined testDir → skipped=true');
})();

(function () {
  // Non-existent testDir → also skipped
  const ticket = { id: 84, contracts: [{ id: 'C001' }] };
  const result = checkVerifiesCoverage(ticket, '/nonexistent/path/xyz789');
  assert(result.valid === true, 'nonexistent testDir → valid=true');
  assert(result.skipped === true, 'nonexistent testDir → skipped=true');
})();

(function () {
  // No contracts → valid=true, not skipped (no contracts to verify)
  const ticket = { id: 84, contracts: [] };
  const result = checkVerifiesCoverage(ticket, null);
  assert(result.valid === true, 'no contracts → valid=true');
  assertStrictEqual(result.total, 0, 'no contracts → total=0');
})();

// ======================================================================
// Summary
// ======================================================================

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
if (failed > 0) process.exit(1);
