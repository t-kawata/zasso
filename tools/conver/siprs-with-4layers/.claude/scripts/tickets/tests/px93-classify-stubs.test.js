#!/usr/bin/env node
/**
 * px93-classify-stubs.test.js — Tests for PX-93
 *
 * Covers C001: classifyStubs returns null for other active ticket STUBs.
 *
 * TDD Red phase: tests should fail before implementation.
 */

const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

function assertStrictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

console.log('\n━━━ PX-93 classify-stubs.test.js — TESTS ━━━\n');

const { classifyStubs } = require('../enumerate-ticket-targets');
const ticketsData = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../../../', 'Tickets.json'), 'utf8'
));

// ======================================================================
// C001: classifyStubs only returns targetStub for own-ticket or MUST_RESOLVE
// ======================================================================

console.log('## C001 — classifyStubs restricts to own-ticket\n');

(function testOwnTicketReturnsTargetStub() {
  // Precondition: own ticket key returns targetStub (unchanged)
  const result = classifyStubs('PX-93', ticketsData, 'PX-93');
  assert(result !== null, 'own-ticket ref returns non-null');
  assert(result.category === 'targetStub', 'category is targetStub');
})();

(function testMustResolveReturnsTargetStub() {
  // MUST_RESOLVE returns targetStub (unchanged)
  const result = classifyStubs('MUST RESOLVE', ticketsData, 'PX-93');
  assert(result !== null, 'MUST_RESOLVE returns non-null');
  assert(result.category === 'targetStub', 'category is targetStub');
})();

(function testNonexistentReturnsCrime() {
  // Nonexistent ticket returns crime (unchanged)
  const result = classifyStubs('NX-999', ticketsData, 'PX-93');
  assert(result !== null, 'nonexistent ref returns non-null');
  assert(result.category === 'crime', 'category is crime');
  assert(result.crimeType === 'ORPHAN_TICKET_REF', 'crimeType is ORPHAN_TICKET_REF');
})();

(function testOtherActiveReturnsNull() {
  // Other active ticket STUB returns null (NEW behavior)
  // PX-90 is an active (done) ticket, but PX-88 or similar active one works
  const result = classifyStubs('PX-88', ticketsData, 'PX-93');
  assert(result === null, 'other active ticket ref returns null');
})();

(function testSelfDoesNotMatchOtherActive() {
  // Boundary: STUB referencing own ticket but appearing as other
  const result = classifyStubs('PX-93', ticketsData, 'PX-93');
  assert(result !== null, 'self ref is not null');
  assert(result.category === 'targetStub', 'self ref is targetStub');
})();

// ======================================================================
// Summary
// ======================================================================

const total = passed + failed;
console.log('\n━━━ RESULTS ━━━');
console.log('  Passed: ' + passed + ' / ' + total);
console.log('  Failed: ' + failed + ' / ' + total);

if (failed > 0) {
  console.log('\n❌ RED: Some tests failed (expected before implementation).');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed.');
  process.exit(0);
}
