#!/usr/bin/env node

/**
 * enumerate-ticket-targets.test.js — Tests for enumerate-ticket-targets.js
 *
 * Covers C002 (enumerate), C003 (classification), C004 (idempotency).
 *
 * [::TICKET::] PX-77: Core Validation Scripts — enumerate-ticket-targets
 * @verifies C002
 * @verifies C003
 * @verifies C004
 * @verifies C001
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

let enumerateTargets;
let findTicket;
let classifyStubs;

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
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

console.log('\n━━━ enumerate-ticket-targets.test.js ━━━\n');

try {
  const mod = require('../enumerate-ticket-targets');
  enumerateTargets = mod.enumerateTargets;
  findTicket = mod.findTicket;
  classifyStubs = mod.classifyStubs;
} catch (e) {
  failed++;
  console.log('  ✗ Failed to load enumerate-ticket-targets.js: ' + e.message + '\n');
  console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
  process.exit(1);
}

// Create temp directory with test files
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enumerate-test-'));
const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enumerate-empty-'));
const targetDir = path.join(tmpDir, 'src');
const nonexistentDir = path.join(tmpDir, 'nonexistent');
fs.mkdirSync(targetDir, { recursive: true });

// ===== Helper: create minimal Tickets.json =====
// [::TICKET::] PX-77, PX-78, PX-79 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-77|PX-78|PX-79) --for-spec --no-implementation-order`.
function makeTicketsData(targetPhaseId, targetId, completedId) {
  return {
    phases: [
      { phaseId: targetPhaseId, tickets: [{ id: targetId, phaseId: targetPhaseId, status: 'started' }] },
      { phaseId: 0, tickets: [{ id: completedId || 1, phaseId: 0, status: 'done' }] }
    ]
  };
}

// ===== C002 Precondition: enumerate called with valid directory and ticket key =====
console.log('## C002 Precondition — Valid inputs\n');

(function () {
  // Non-existent directory
  const result = enumerateTargets(nonexistentDir, 'PX-77', makeTicketsData(-1, 77));
  assert(result === null || result.error !== undefined, 'nonexistent directory returns error');
})();

// ===== C002 Postcondition: STUBs classified and recorded =====
console.log('\n## C002 Postcondition — Classification and recording\n');

(function () {
  // Write a file with STUBs
  const stubFile = path.join(targetDir, 'test.rs');
  fs.writeFileSync(stubFile, [
    '// [::STUB::] PX-77: fix validation',
    'fn placeholder() {}',
    '// [::STUB::] P0-1: implement feature',
    'fn other() {}',
  ].join('\n') + '\n');

  const ticketsData = makeTicketsData(-1, 77, 1);
  const result = enumerateTargets(tmpDir, 'PX-77', ticketsData);

  assert(result !== null, 'enumerate returns a result');
  assert(Array.isArray(result.targetStubs), 'result has targetStubs array');
  assert(Array.isArray(result.targetCrimes), 'result has targetCrimes array');

  // Clean up
  fs.unlinkSync(stubFile);
})();

// ===== C003: Classification logic =====
console.log('\n## C003 — Classification\n');

(function () {
  // Own ticket STUB → targetStubs
  const ownStub = classifyStubs('PX-77', makeTicketsData(-1, 77), 'PX-77');
  assert(ownStub.category === 'targetStub', 'own-ticket reference classifies as targetStub');
  assertStrictEqual(ownStub.ticketRef, 'PX-77', 'own-ticket reference has correct ticketRef');

  // Other ticket that is completed → COMPLETED_TICKET_STALE crime
  const ticketsData = makeTicketsData(-1, 77, 1); // own: PX-77, other: P0-1 (done)
  const completedStub = classifyStubs('P0-1', ticketsData, 'PX-77');
  assert(completedStub.category === 'crime', 'completed-ticket reference classifies as crime');
  assertStrictEqual(completedStub.crimeType, 'COMPLETED_TICKET_STALE', 'completed-ticket crime type is COMPLETED_TICKET_STALE');

  // Nonexistent ticket STUB → ORPHAN_TICKET_REF
  const orphanTickets = makeTicketsData(-1, 77);
  const orphanStub = classifyStubs('P99-99', orphanTickets, 'PX-77');
  assert(orphanStub.category === 'crime', 'nonexistent-ticket reference classifies as crime');
  assertStrictEqual(orphanStub.crimeType, 'ORPHAN_TICKET_REF', 'nonexistent-ticket crime type is ORPHAN_TICKET_REF');
})();

// ===== C003 Invariant: Deterministic =====
console.log('\n## C003 Invariant — Deterministic classification\n');

(function () {
  const ticketsData = makeTicketsData(-1, 77, 1);

  const r1 = classifyStubs('PX-77', ticketsData, 'PX-77');
  const r2 = classifyStubs('PX-77', ticketsData, 'PX-77');
  assertDeepEqual(r1, r2, 'classification is deterministic (own ticket)');

  const cr1 = classifyStubs('P0-1', ticketsData, 'P0-1');
  const cr2 = classifyStubs('P0-1', ticketsData, 'P0-1');
  assertDeepEqual(cr1, cr2, 'classification is deterministic (completed ticket)');
})();

// ===== C004: Idempotency =====
console.log('\n## C004 — Idempotency\n');

(function () {
  const idemDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enumerate-idem-'));
  const idemSrc = path.join(idemDir, 'lib.rs');
  fs.writeFileSync(idemSrc, '// [::STUB::] PX-77: first stub\n');

  const ticketsData = makeTicketsData(-1, 77, 1);
  const first = enumerateTargets(idemDir, 'PX-77', ticketsData);
  const second = enumerateTargets(idemDir, 'PX-77', ticketsData);

  assertStrictEqual(second.targetStubs.length, first.targetStubs.length, 'second run has same number of targetStubs');
  assertStrictEqual(second.targetCrimes.length, first.targetCrimes.length, 'second run has same number of targetCrimes');

  // No duplicate entries
  if (second.targetStubs.length > 0) {
    const ids = second.targetStubs.map(function (s) { return s.id; });
    assertStrictEqual(new Set(ids).size, ids.length, 'no duplicate targetStub IDs');
  }

  // Clean up
  fs.rmSync(idemDir, { recursive: true, force: true });
})();

// ===== Verified empty support =====
console.log('\n## Verified empty (edge case)\n');

(function () {
  const ticketsData = makeTicketsData(-1, 77, 1);
  const result = enumerateTargets(emptyDir, 'PX-77', ticketsData);

  assert(result !== null, 'empty directory returns a result');
  assert(result.isEmpty || result.targetStubs.length === 0, 'empty directory has no targetStubs');
  assert(result.isEmpty || result.targetCrimes.length === 0, 'empty directory has no targetCrimes');

  // If verified_empty is set, it should be a string
  if (result.isEmpty) {
    assert(typeof result.verifiedEmpty === 'string' || typeof result.verifiedEmpty === 'boolean',
      'verifiedEmpty is set when empty');
  }
})();

// ===== Error: nonexistent directory =====
console.log('\n## Error: Nonexistent directory\n');

(function () {
  const result = enumerateTargets('/nonexistent/path/xyz789', 'PX-77', makeTicketsData(-1, 77));
  assert(result === null || result.error !== undefined, 'nonexistent directory returns null/error');
})();

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);

if (failed > 0) process.exit(1);
