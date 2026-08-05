#!/usr/bin/env node
// [::TICKET::] PX-81 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-81 --for-spec --no-implementation-order`.

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
 * @verifies PX-80-C002
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

// ===== PX-139: Test-fixture false positives — quoted-string suppression =====
// [::TICKET::] PX-139: scan-algorithm quoted-string rejection + fixtures-dir exclusion.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-139 --for-spec --no-implementation-order`.
console.log('\n## PX-139 — Quoted-string and fixtures-dir suppression\n');

(function () {
  // C001-Pre: a scanned line with [::STUB::] bounded by quotes on the same line.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'px139-c1-'));
  const srcDir = path.join(dir, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, 'fixture.test.cjs'),
    'manifest: [{ file: "src/a.rs", line: 5, content: "// [::STUB::] P9-99: reason -- Implement fix" }],\n' +
    'writeLine(srcFile, 5, "// [::STUB::] P9-9: edited after manifest build");\n' +
    '{ sourceKey: "P3-2", stubs: [{ file: "src/p3.rs", line: 7, content: "// [::STUB::] P3-2: two -- Implement two" }] },\n');

  // C001-Post: quoted marker text is data, not a marker — never emitted.
  const result = enumerateTargets(dir, 'PX-139', makeTicketsData(-1, 139));
  assert(result.targetCrimes.length === 0, 'C001: quoted marker lines are not emitted as crimes');
  assert(result.targetStubs.length === 0, 'C001: quoted marker lines are not emitted as stubs');

  // C001-Inv: a real // comment marker is still emitted and classified as ORPHAN_TICKET_REF.
  fs.writeFileSync(path.join(srcDir, 'real.rs'), '// [::STUB::] P99-99: real orphan\n');
  const result2 = enumerateTargets(dir, 'PX-139', makeTicketsData(-1, 139));
  const realOrphans = result2.targetCrimes.filter(function (c) { return c.crimeType === 'ORPHAN_TICKET_REF'; });
  assert(realOrphans.length === 1, 'C001-inv: only the real comment marker is emitted');
  assertStrictEqual(realOrphans[0].ticketRef, 'P99-99', 'C001-inv: real orphan ticketRef preserved');

  // C001-Boundary: a marker whose description contains quotes is not suppressed.
  fs.writeFileSync(path.join(srcDir, 'quotes.rs'), '// [::STUB::] P99-99: use "quotes" in description\n');
  const result3 = enumerateTargets(dir, 'PX-139', makeTicketsData(-1, 139));
// [::TICKET::] PX-139 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-139 --for-spec --no-implementation-order`.
  assert(result3.targetCrimes.some(function (c) { return c.ticketRef === 'P99-99' && c.file.endsWith('quotes.rs'); }),
    'C001-boundary: marker with quotes in description still emitted');

  fs.rmSync(dir, { recursive: true, force: true });
})();

(function () {
  // C002-Pre: a directory entry named fixtures exists with a marker file.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'px139-c2-'));
  fs.mkdirSync(path.join(dir, 'fixtures', 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'fixtures', 'src', 'f.rs'), '// [::STUB::] P3-2: fixture marker\n');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'a.rs'), '// [::STUB::] P3-2: real marker\n');
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tests', 't.rs'), '// [::STUB::] P3-2: under tests, not fixtures\n');

  const result = enumerateTargets(dir, 'PX-139', makeTicketsData(-1, 139));

  // C002-Post: the fixtures dir subtree is not scanned.
// [::TICKET::] PX-139 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-139 --for-spec --no-implementation-order`.
  assert(!result.targetCrimes.some(function (c) { return c.file.includes('fixtures'); }),
    'C002: fixtures dir not scanned');
  // C002-Inv: non-fixtures directories are still scanned.
// [::TICKET::] PX-139 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-139 --for-spec --no-implementation-order`.
  assert(result.targetCrimes.some(function (c) { return c.file.endsWith('src/a.rs'); }),
    'C002: src/a.rs (not fixtures) still scanned');
// [::TICKET::] PX-139 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-139 --for-spec --no-implementation-order`.
  assert(result.targetCrimes.some(function (c) { return c.file.endsWith('tests/t.rs'); }),
    'C002-inv: tests/t.rs (not fixtures) still scanned');

  fs.rmSync(dir, { recursive: true, force: true });
})();

(function () {
  // C003-Pre/Post/Invariant: shared lib exports contain the exact former regex behavior.
  let lib;
  try {
    lib = require('../../lib/stub-marker-scan');
  } catch (e) {
    failed++;
    console.log('  ✗ C003: lib/stub-marker-scan.js not found: ' + e.message + '\n');
    return;
  }
  const STUB_RE = /\[::STUB::\]/;
  const STUB_IN_QUOTES_RE = /['"`][^'"`]*\[::STUB::\][^'"`]*['"`]/;
  const samples = [
    'content: "// [::STUB::] P9-99: reason"',
    '// [::STUB::] P3-2: real',
  ];
  assert(typeof lib.containsStubMarker === 'function', 'C003: containsStubMarker exported');
  assert(typeof lib.isStubInQuotes === 'function', 'C003: isStubInQuotes exported');
// [::TICKET::] PX-139 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-139 --for-spec --no-implementation-order`.
  assert(samples.every(function (l) { return lib.containsStubMarker(l) === STUB_RE.test(l); }),
    'C003: containsStubMarker parity with STUB_RE');
// [::TICKET::] PX-139 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-139 --for-spec --no-implementation-order`.
  assert(samples.every(function (l) { return lib.isStubInQuotes(l) === STUB_IN_QUOTES_RE.test(l); }),
    'C003: isStubInQuotes parity with STUB_IN_QUOTES_RE');
})();

// Cleanup
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('\n━━━ Summary ━━━');
console.log('Passed: ' + passed);
console.log('Failed: ' + failed);

if (failed > 0) process.exit(1);
