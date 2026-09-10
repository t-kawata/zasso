#!/usr/bin/env node
// [::TICKET::] PX-81 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-81 --for-spec --no-implementation-order`.

/**
 * validate-stub-format.test.js — Tests for validate-stub-format.js
 *
 * Covers C001: Precondition (non-empty input), Postcondition (return shape),
 * Invariant (pure function).
 *
 * [::TICKET::] PX-77: Core Validation Scripts — validate-stub-format
 * @verifies C001
 * @verifies PX-80-C001
 */

const path = require('path');

// Module to test will be loaded dynamically after implementation
let validateStubFormat;

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
function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + e.substring(0, 80) + ', got ' + a.substring(0, 80) + '\n'); }
}

console.log('\n━━━ validate-stub-format.test.js ━━━\n');

try {
  validateStubFormat = require('../validate-stub-format').validateStubFormat;
} catch (e) {
  failed++;
  console.log('  ✗ Failed to load validate-stub-format.js: ' + e.message + '\n');
  console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
  process.exit(1);
}

// ===== C001 Precondition: STUB marker string is non-empty =====
console.log('## C001 Precondition — Non-empty input\n');

(function () {
  const result = validateStubFormat('// [::STUB::] PX-77: fix validation');
  assert(typeof result === 'object', 'validateStubFormat returns an object for valid input');
  assert('valid' in result, 'result has .valid field');
  assert('errors' in result, 'result has .errors field');
})();

// ===== C001 Postcondition: returns {valid, errors} for compliant/non-compliant =====
console.log('\n## C001 Postcondition — Correct return shape\n');

(function () {
  // Valid: standard ticket reference
  const valid = validateStubFormat('// [::STUB::] PX-77: fix bug');
  assertStrictEqual(valid.valid, true, 'valid marker returns valid=true');
  assertDeepEqual(valid.errors, [], 'valid marker returns empty errors array');

  // Valid: P{phase}-{id} format
  const valid2 = validateStubFormat('// [::STUB::] P3-2: implement feature');
  assertStrictEqual(valid2.valid, true, 'P3-2 format is valid');
  assertDeepEqual(valid2.errors, [], 'P3-2 format has no errors');

  // Valid: MUST RESOLVE
  const valid3 = validateStubFormat('// [::STUB::] MUST RESOLVE: handle auth');
  assertStrictEqual(valid3.valid, true, 'MUST RESOLVE format is valid');
  assertDeepEqual(valid3.errors, [], 'MUST RESOLVE has no errors');

  // Invalid: missing ticket ID
  const invalid1 = validateStubFormat('// [::STUB::] : desc');
  assertStrictEqual(invalid1.valid, false, 'missing ticket ID returns valid=false');
  assert(Array.isArray(invalid1.errors), 'invalid marker has errors array');
  assert(invalid1.errors.length > 0, 'invalid marker has at least one error');
})();

// ===== UT: [Normal] accepts valid STUB marker =====
console.log('\n## UT: Normal cases\n');

(function () {
  const valid4 = validateStubFormat('// [::STUB::] PX-77: description');
  assertStrictEqual(valid4.valid, true, 'accepts "// [::STUB::] PX-77: description"');

  const valid5 = validateStubFormat('// [::STUB::] MUST RESOLVE: description');
  assertStrictEqual(valid5.valid, true, 'accepts "// [::STUB::] MUST RESOLVE: description"');
})();

// ===== UT: [Error] rejects various invalid formats =====
console.log('\n## UT: Error cases\n');

(function () {
  // Empty description
  const e1 = validateStubFormat('// [::STUB::] PX-77: ');
  assertStrictEqual(e1.valid, false, 'rejects empty description after ticket ID');

  // No description at all (ends at colon)
  const e2 = validateStubFormat('// [::STUB::] PX-77:');
  assertStrictEqual(e2.valid, false, 'rejects marker ending at colon');

  // Multi-line (n\n on next line)
  const e3 = validateStubFormat('// [::STUB::] PX-77:\ndescription');
  assertStrictEqual(e3.valid, false, 'rejects multi-line marker');

  // Missing ticket ID
  const e4 = validateStubFormat('// [::STUB::] : desc');
  assertStrictEqual(e4.valid, false, 'rejects missing ticket ID');

  // Invalid ticket format (ABC-1)
  const e5 = validateStubFormat('// [::STUB::] ABC-1: desc');
  assertStrictEqual(e5.valid, false, 'rejects invalid ticket format ABC-1');

  // No colon at all
  const e6 = validateStubFormat('// [::STUB::] just text');
  assertStrictEqual(e6.valid, false, 'rejects missing colon');

  // Wrong bracket format
  const e7 = validateStubFormat('// [STUB] PX-77: desc');
  assertStrictEqual(e7.valid, false, 'rejects wrong bracket format [STUB]');
})();

// ===== UT: [Boundary] edge cases =====
console.log('\n## UT: Boundary cases\n');

(function () {
  const b1 = validateStubFormat('');
  assertStrictEqual(b1.valid, false, 'empty string is invalid');
  assert(Array.isArray(b1.errors), 'empty string produces errors array');

  const b2 = validateStubFormat('   ');
  assertStrictEqual(b2.valid, false, 'whitespace-only string is invalid');

  const b3 = validateStubFormat(null);
  assertStrictEqual(b3.valid, false, 'null input is invalid');

  const b4 = validateStubFormat(undefined);
  assertStrictEqual(b4.valid, false, 'undefined input is invalid');

  // String with no STUB marker at all
  const b5 = validateStubFormat('regular code line');
  assertStrictEqual(b5.valid, false, 'regular code without STUB is invalid');
})();

// ===== C001 Invariant: Pure function =====
console.log('\n## C001 Invariant — Pure function (deterministic)\n');

(function () {
  const input = '// [::STUB::] PX-77: update config';
  const r1 = validateStubFormat(input);
  const r2 = validateStubFormat(input);
  const r3 = validateStubFormat(input);
  assertDeepEqual(r1, r2, 'same input produces same result (run 1 vs 2)');
  assertDeepEqual(r2, r3, 'same input produces same result (run 2 vs 3)');

  const badInput = '// [::STUB::] ABC-1: desc';
  const br1 = validateStubFormat(badInput);
  const br2 = validateStubFormat(badInput);
  assertDeepEqual(br1, br2, 'same invalid input produces same result');
})();

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);

if (failed > 0) process.exit(1);
