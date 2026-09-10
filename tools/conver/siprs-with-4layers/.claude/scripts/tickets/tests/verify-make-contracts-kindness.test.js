#!/usr/bin/env node

/**
 * verify-make-contracts-kindness.test.js — Tests for PX-84
// @verifies C002
 *
 * C002: Error format from main() — each error type produces
 * unique [ERROR]/Cause/Action strings (not hardcoded).
 *
 * Red phase: tests exercise existing behavior that lacks
 * dynamic Cause/Action — they pass now but will pass after
 * refactoring too.
 */

let verifyMakeContracts;
let buildTestExceptionErrorLines;
let passed = 0;
let failed = 0;

// [::TICKET::] PX-84, PX-85, PX-86, PX-87 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-84|PX-85|PX-86|PX-87) --for-spec --no-implementation-order`.
// [::TICKET::] PX-123 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-123 --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

console.log('\n━━━ verify-make-contracts-kindness.test.js (PX-84) ━━━\n');

try {
  const mod = require('../verify-make-contracts');
  verifyMakeContracts = mod.verifyMakeContracts;
  buildTestExceptionErrorLines = mod.buildTestExceptionErrorLines;
} catch (e) {
  failed++; console.log('  ✗ Failed to load: ' + e.message + '\n');
  console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
  process.exit(1);
}

// ======================================================================
// Error format — each type must have unique content
// ======================================================================

console.log('## Error format consistency\n');

(function () {
  // Empty contracts error
  const e1 = verifyMakeContracts({ id: 84, contracts: [], testUnit: ['test'] });
  assert(e1.length > 0, 'empty contracts produces error');
  assert(e1[0].detail.includes('empty'), 'detail mentions empty');
})();

(function () {
  // Keyword mismatch error
  const e2 = verifyMakeContracts({
    id: 84,
    contracts: [{ id: 'C001', precondition: 'specificTermXyz', postcondition: 'resultMatchesYz', invariant: 'stateConsistent' }],
    testUnit: ['UT: unrelated code without keywords']
  });
  assert(e2.some(e => e.detail && e.detail.includes('key terms')), 'keyword mismatch mentions key terms');
})();

(function () {
  // testException error
  const e3 = verifyMakeContracts({
    id: 84,
    contracts: [{ id: 'C001', precondition: 'input valid', postcondition: 'output correct', invariant: 'state ok' }],
    testUnit: ['UT: [Normal] input valid returns output correct state ok'],
    testExceptions: ['No justification']
  });
  assert(e3.some(e => e.detail && e.detail.includes('testException')), 'testException error mentions testException');
})();

// ======================================================================
// testException message — must explain why the check exists and
// what is prohibited
// ======================================================================

console.log('\n## testException message: reason + prohibition\n');

(function () {
  const lines = buildTestExceptionErrorLines({
    ticket: 84,
    detail: 'testException lacks justification: "No justification..."'
  });
  const all = lines.join('\n');
  assert(lines.length === 3, 'produces [ERROR]/Cause/Action 3 lines');
  assert(/supreme law|design defect to redesign|deterministic/.test(all), 'explains why the check exists (supreme law rationale)');
  assert(/prohibited/.test(all), 'states what is prohibited');
  assert(/not a design defect|not an architectural defect/.test(all), 'names the required confirmation phrase');
})();

// ======================================================================
// Backward compat
// ======================================================================

console.log('\n## Backward compatibility\n');

(function () {
  const ticket = {
    id: 84,
    contracts: [{ id: 'C001', precondition: 'input valid', postcondition: 'output correct', invariant: 'state ok' }],
    testUnit: ['UT: [Normal] input valid returns output correct state ok'],
  };
  assert(verifyMakeContracts(ticket).length === 0, 'valid ticket passes');
})();

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);
if (failed > 0) process.exit(1);
