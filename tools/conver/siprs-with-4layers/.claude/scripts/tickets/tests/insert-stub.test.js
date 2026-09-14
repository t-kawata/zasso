#!/usr/bin/env node
// [::TICKET::] PX-94, PX-96 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-96 --for-spec --no-implementation-order`.

/**
 * insert-stub.test.js — Tests for insert-stub.js
 *
 * Covers: ticket-ref existence validation, file/line bounds, duplicate detection,
 * output format compliance with validate-stub-format.js, CLI arg name (PX-96),
 * and PX-119 contracts C001-C004 (todo condition, ordering, PX ban).
 *
 * @verifies C001
 * @verifies C002
 * @verifies C003
 * @verifies C004
 *
 * [::TICKET::] PX-94, PX-96 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-96 --for-spec --no-implementation-order`.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Module to test — loaded after all mocks are set up
let insertStub, InsertStubError;

let passed = 0;
let failed = 0;

// [::TICKET::] PX-95, PX-94 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-95|PX-94) --for-spec --no-implementation-order`.
// [::TICKET::] PX-96 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-96 --for-spec --no-implementation-order`.
// [::TICKET::] PX-119 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-119 --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-95, PX-94 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-95|PX-94) --for-spec --no-implementation-order`.
function assertStrictEqual(actual, expected, message) {
  const pass = actual === expected;
  if (pass) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else {
    failed++;
    process.stdout.write('  ✗ ' + message + '\n');
    process.stdout.write('    expected: ' + JSON.stringify(expected) + '\n');
    process.stdout.write('    actual:   ' + JSON.stringify(actual) + '\n');
  }
}

// [::TICKET::] PX-95, PX-94 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-95|PX-94) --for-spec --no-implementation-order`.
function assertRejects(fn, expectedMsgSubstring, message) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      result.then(() => {
        failed++;
        process.stdout.write('  ✗ ' + message + ' (expected rejection, got resolve)\n');
      }).catch(err => {
        const pass = err.message && err.message.includes(expectedMsgSubstring);
        if (pass) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
        else {
          failed++;
          process.stdout.write('  ✗ ' + message + '\n');
          process.stdout.write('    expected message containing: ' + JSON.stringify(expectedMsgSubstring) + '\n');
          process.stdout.write('    actual message: ' + err.message + '\n');
        }
      });
    } else {
      // Sync throw
      const pass = err && err.message && err.message.includes(expectedMsgSubstring);
      // (already caught above in catch path)
    }
  } catch (err) {
    const pass = err.message && err.message.includes(expectedMsgSubstring);
    if (pass) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
    else {
      failed++;
      process.stdout.write('  ✗ ' + message + '\n');
      process.stdout.write('    expected message containing: ' + JSON.stringify(expectedMsgSubstring) + '\n');
      process.stdout.write('    actual message: ' + err.message + '\n');
    }
  }
}

// ---------------------------------------------------------------------------
// Setup: create mock Tickets.json and mock source file in temp dir
// ---------------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'insert-stub-test-'));
const mockTicketsPath = path.join(tmpDir, 'Tickets.json');
const mockSourcePath = path.join(tmpDir, 'test.rs');

// Create mock Tickets.json with phase 0 having P0-1 (todo) and P0-2 (reviewed).
// P0-1 is the valid future resolve target; P0-2 is a past (non-todo) ticket that
// the todo condition must reject (PX-119 C002).
const mockTickets = {
  title: 'test',
  phases: [
    {
      id: 0,
      name: 'Test Phase',
      tickets: [
        { id: 1, phaseId: 0, status: 'todo', title: 'Test Ticket' },
        { id: 2, phaseId: 0, status: 'reviewed', title: 'Past Ticket' }
      ]
    }
  ]
};
fs.writeFileSync(mockTicketsPath, JSON.stringify(mockTickets, null, 2));

// Create mock source file with 5 lines
fs.writeFileSync(mockSourcePath, '// line 1\n// line 2\n// line 3\n// line 4\n// line 5\n');

// Mock find-ticket module before loading insert-stub
const findTicketPath = path.resolve(__dirname, '../lib/find-ticket.js');
const originalFindTicket = require.cache[findTicketPath];
// We assume the real ticketExists works against the mock file — it parses ticketsData
// So we pass the parsed data directly via insertStub's ticketsPath argument.

// ---------------------------------------------------------------------------
// Load module
// ---------------------------------------------------------------------------
try {
  const mod = require('../insert-stub');
  insertStub = mod.insertStub;
  InsertStubError = mod.InsertStubError;
} catch (e) {
  process.stdout.write('\n⚠  insert-stub.js not yet implemented — running in RED mode (all tests expected to fail)\n\n');
}

// ---------------------------------------------------------------------------
// Read mock tickets data for tests that call insertStub
// ---------------------------------------------------------------------------
const ticketsData = JSON.parse(fs.readFileSync(mockTicketsPath, 'utf8'));

// ===========================================================================
// Tests
// ===========================================================================

process.stdout.write('\ninsert-stub.js tests\n');
process.stdout.write('====================\n\n');

// --- Normal: valid ticket ref → insert success ---
process.stdout.write('[Normal] Valid ticket reference\n');
(function testValidInsert() {
  if (!insertStub) {
    failed++; process.stdout.write('  ✗ (module not implemented)\n'); return;
  }
  const testFile = path.join(tmpDir, 'valid_test.rs');
  fs.writeFileSync(testFile, '// line 1\n// line 2\n// line 3\n');
  try {
    const result = insertStub({
      file: testFile,
      line: 2,
      ticketRef: 'P0-1',
      stubReason: 'Cannot resolve now',
      resolvePlan: 'Test stub for P0-1',
      ticketsPath: mockTicketsPath,
    });
    assertStrictEqual(result.inserted, true, 'insertStub returns {inserted: true}');
    const content = fs.readFileSync(testFile, 'utf8');
    const lines = content.split('\n');
    assert(lines[1].includes('[::STUB::] P0-1:'), 'line 2 contains [::STUB::] P0-1:');
    assert(lines[1].includes('Test stub for P0-1'), 'line 2 contains resolve plan');
  } catch (err) {
    failed++; process.stdout.write('  ✗ insertStub threw: ' + err.message + '\n');
  }
})();

// --- Normal: duplicate STUB detection ---
process.stdout.write('\n[Normal] Duplicate STUB detection\n');
(function testDuplicateStub() {
  if (!insertStub) {
    failed++; process.stdout.write('  ✗ (module not implemented)\n'); return;
  }
  try {
    insertStub({
      file: mockSourcePath,
      line: 1,
      ticketRef: 'P0-1',
      stubReason: 'Cannot resolve now',
      resolvePlan: 'duplicate',
      ticketsPath: mockTicketsPath,
    });
    // Second insert on same line should fail
    insertStub({
      file: mockSourcePath,
      line: 1,
      ticketRef: 'P0-1',
      stubReason: 'Cannot resolve now',
      resolvePlan: 'duplicate again',
      ticketsPath: mockTicketsPath,
    });
    failed++; process.stdout.write('  ✗ second insert should have thrown but did not\n');
  } catch (err) {
    assert(err.message.includes('already exists') || err.message.includes('STUB'),
      'error message mentions duplicate/STUB: ' + err.message);
  }
})();

// --- Error: non-existent ticket ref ---
process.stdout.write('\n[Error] Non-existent ticket reference\n');
(function testNonExistentTicket() {
  if (!insertStub) {
    failed++; process.stdout.write('  ✗ (module not implemented)\n'); return;
  }
  try {
    insertStub({
      file: mockSourcePath,
      line: 1,
      ticketRef: 'P9-99',  // does not exist
      stubReason: 'Cannot resolve now',
      resolvePlan: 'ghost ticket',
      ticketsPath: mockTicketsPath,
    });
    failed++; process.stdout.write('  ✗ should have thrown for non-existent ticket\n');
  } catch (err) {
    assert(err.message.includes('P9-99') && err.message.includes('not exist'),
      'error message mentions ticket ID and "not exist": ' + err.message);
  }
})();

// --- Error: line out of range ---
process.stdout.write('\n[Error] Line out of range\n');
(function testLineOutOfRange() {
  if (!insertStub) {
    failed++; process.stdout.write('  ✗ (module not implemented)\n'); return;
  }
  try {
    insertStub({
      file: mockSourcePath,
      line: 999,
      ticketRef: 'P0-1',
      stubReason: 'Cannot resolve now',
      resolvePlan: 'out of range',
      ticketsPath: mockTicketsPath,
    });
    failed++; process.stdout.write('  ✗ should have thrown for out-of-range line\n');
  } catch (err) {
    assert(err.message.includes('line') && (err.message.includes('999') || err.message.includes('exceed') || err.message.includes('range')),
      'error message mentions line/range: ' + err.message);
  }
})();

// --- Error: file not found ---
process.stdout.write('\n[Error] File not found\n');
(function testFileNotFound() {
  if (!insertStub) {
    failed++; process.stdout.write('  ✗ (module not implemented)\n'); return;
  }
  try {
    insertStub({
      file: '/nonexistent/path/file.rs',
      line: 1,
      ticketRef: 'P0-1',
      stubReason: 'Cannot resolve now',
      resolvePlan: 'missing file',
      ticketsPath: mockTicketsPath,
    });
    failed++; process.stdout.write('  ✗ should have thrown for non-existent file\n');
  } catch (err) {
    assert(err.message.includes('not found') || err.message.includes('exist'),
      'error message mentions file not found: ' + err.message);
  }
})();

// --- Error: MUST RESOLVE is rejected ---
process.stdout.write('\n[Error] MUST RESOLVE ticketRef rejected\n');
(function testMustResolveRejected() {
  if (!insertStub) {
    failed++; process.stdout.write('  ✗ (module not implemented)\n'); return;
  }
  try {
    insertStub({
      file: mockSourcePath,
      line: 1,
      ticketRef: 'MUST RESOLVE',
      stubReason: 'Cannot resolve now',
      resolvePlan: 'should be rejected',
      ticketsPath: mockTicketsPath,
    });
    failed++; process.stdout.write('  ✗ MUST RESOLVE should have been rejected\n');
  } catch (err) {
    assert(err.message.includes('MUST RESOLVE') || err.message.includes('Invalid ticket'),
      'error message mentions MUST RESOLVE: ' + err.message);
  }
})();

// --- Invariant: inserted marker passes validate-stub-format.js ---
process.stdout.write('\n[Invariant] Inserted marker format validation\n');
(function testFormatValidation() {
  if (!insertStub) {
    failed++; process.stdout.write('  ✗ (module not implemented)\n'); return;
  }
  const { validateStubFormat } = require('../validate-stub-format');
  const testFile = path.join(tmpDir, 'format_test.rs');
  fs.writeFileSync(testFile, '// line 1\n// line 2\n');
  try {
    insertStub({
      file: testFile,
      line: 1,
      ticketRef: 'P0-1',
      stubReason: 'Cannot resolve now',
      resolvePlan: 'Format conformance test',
      ticketsPath: mockTicketsPath,
    });
    const content = fs.readFileSync(testFile, 'utf8');
    const stubLine = content.split('\n').find(l => l.includes('[::STUB::]'));
    const result = validateStubFormat(stubLine);
    assert(result.valid === true,
      'inserted stub passes validate-stub-format: ' + JSON.stringify(result.errors));
  } catch (err) {
    failed++; process.stdout.write('  ✗ ' + err.message + '\n');
  }
})();

// --- Invariant: file content unchanged on error ---
process.stdout.write('\n[Invariant] File unchanged on error\n');
(function testFileUnchangedOnError() {
  if (!insertStub) {
    failed++; process.stdout.write('  ✗ (module not implemented)\n'); return;
  }
  const testFile = path.join(tmpDir, 'unchanged_test.rs');
  const originalContent = '// original\n// content\n';
  fs.writeFileSync(testFile, originalContent);
  try {
    insertStub({
      file: testFile,
      line: 1,
      ticketRef: 'P9-99',  // non-existent
      stubReason: 'Cannot resolve now',
      resolvePlan: 'should not write',
      ticketsPath: mockTicketsPath,
    });
  } catch (err) {
    // Expected error — verify file unchanged
    const content = fs.readFileSync(testFile, 'utf8');
    assertStrictEqual(content, originalContent, 'file content unchanged after error');
  }
})();

// [::TICKET::] PX-96: single-line STUB marker invariant
// ===========================================================================

process.stdout.write('\n[Invariant] Single-line STUB: --stub-reason with newline rejected\n');
(function testStubReasonNewlineRejected() {
  if (!insertStub) {
    failed++; process.stdout.write('  ✗ (module not implemented)\n'); return;
  }
  const testFile = path.join(tmpDir, 'newline-stub-reason.rs');
  fs.writeFileSync(testFile, '// line 1\n');
  try {
    insertStub({
      file: testFile,
      line: 1,
      ticketRef: 'P0-1',
      stubReason: 'line1\nline2',
      resolvePlan: 'test',
      ticketsPath: mockTicketsPath,
    });
    failed++; process.stdout.write('  ✗ newline in stubReason should have thrown\n');
  } catch (err) {
    assert(err.message.includes('newline') || err.message.includes('newlines'),
      'error mentions newline: ' + err.message);
  }
})();

process.stdout.write('\n[Invariant] Single-line STUB: --resolve-plan with newline rejected\n');
(function testResolvePlanNewlineRejected() {
  if (!insertStub) {
    failed++; process.stdout.write('  ✗ (module not implemented)\n'); return;
  }
  const testFile = path.join(tmpDir, 'newline-resolve-plan.rs');
  fs.writeFileSync(testFile, '// line 1\n');
  try {
    insertStub({
      file: testFile,
      line: 1,
      ticketRef: 'P0-1',
      stubReason: 'test',
      resolvePlan: 'step1\nstep2',
      ticketsPath: mockTicketsPath,
    });
    failed++; process.stdout.write('  ✗ newline in resolvePlan should have thrown\n');
  } catch (err) {
    assert(err.message.includes('newline') || err.message.includes('newlines'),
      'error mentions newline: ' + err.message);
  }
})();

process.stdout.write('\n[Invariant] Single-line STUB: marker is exactly 1 line\n');
(function testSingleLineMarker() {
  if (!insertStub) {
    failed++; process.stdout.write('  ✗ (module not implemented)\n'); return;
  }
  const testFile = path.join(tmpDir, 'single-line-marker.rs');
  fs.writeFileSync(testFile, '// line 1\n// line 2\n');
  try {
    insertStub({
      file: testFile,
      line: 1,
      ticketRef: 'P0-1',
      stubReason: 'Blocked by PX-99: auth interface returns Result<()> not bool',
      resolvePlan: 'Replace placeholder with real auth call chain including error mapping and session creation',
      ticketsPath: mockTicketsPath,
    });
    const content = fs.readFileSync(testFile, 'utf8');
    const lines = content.split('\n');
    const stubLine = lines[0];
    // The marker must be a single line — count the lines inserted
    // Original file had 2 lines + trailing newline = 3 when split
    // After inserting 1 marker at line 1: 4 parts
    assertStrictEqual(lines.length, 4, 'file has 4 lines (1 marker + 2 originals + trailing newline)');
    assert(stubLine.includes('[::STUB::]'), 'line 1 is the STUB marker');
    assert(stubLine.includes('Blocked by PX-99'), 'stub reason present on same line');
    assert(stubLine.includes('Replace placeholder'), 'resolve plan present on same line');
    assert(!stubLine.includes('\n'), 'marker line has no embedded newline');
  } catch (err) {
    failed++; process.stdout.write('  ✗ ' + err.message + '\n');
  }
})();

// [::TICKET::] PX-96: --resolve-by-ticket CLI arg name tests
// ===========================================================================

process.stdout.write('\n[PX-96] CLI arg: --resolve-by-ticket accepted\n');
(function testResolveByTicketCli() {
  const { spawnSync } = require('child_process');
  const scriptPath = path.resolve(__dirname, '../insert-stub.js');
  const testFile = path.join(tmpDir, 'px96-resolve-by-ticket.tmp');
  fs.writeFileSync(testFile, '// line 1\n// line 2\n// line 3\n');
  const cp = spawnSync('node', [
    scriptPath,
    '--resolve-by-ticket=P0-1',
    '--stub-reason=Dependency not ready',
    '--resolve-plan=Implement the real logic',
    '--file=' + testFile,
    '--line=2',
    '--tickets-path=' + mockTicketsPath,
  ]);
  if (cp.status === 0 && cp.stderr.toString().length === 0) {
    passed++; process.stdout.write('  ✓ --resolve-by-ticket: exit 0 with no stderr\n');
  } else {
    failed++; process.stdout.write('  ✗ --resolve-by-ticket: exit ' + cp.status + ', stderr: ' + cp.stderr.toString() + '\n');
    return;
  }
  const content = fs.readFileSync(testFile, 'utf8');
  try { assert(content.includes('[::STUB::] P0-1:'), 'marker inserted with correct ticket ref'); }
  catch (e) { failed++; process.stdout.write('  ✗ marker check threw: ' + e.message + '\n'); }
  try { assert(content.includes('Dependency not ready'), 'marker contains stub reason'); }
  catch (e) { failed++; process.stdout.write('  ✗ stub reason check threw: ' + e.message + '\n'); }
  try { assert(content.includes('Implement the real logic'), 'marker contains resolve plan'); }
  catch (e) { failed++; process.stdout.write('  ✗ resolve plan check threw: ' + e.message + '\n'); }
  // Cleanup
  try { fs.unlinkSync(testFile); } catch (e) {}
})();

process.stdout.write('\n[PX-96] CLI arg: old --ticket-ref rejected\n');
(function testOldTicketRefRejected() {
  const { spawnSync } = require('child_process');
  const scriptPath = path.resolve(__dirname, '../insert-stub.js');
  const testFile = path.join(tmpDir, 'px96-old-ref.tmp');
  fs.writeFileSync(testFile, '// line 1\n// line 2\n');
  const cp = spawnSync('node', [
    scriptPath,
    '--ticket-ref=P0-1',
    '--file=' + testFile,
    '--line=1',
    '--tickets-path=' + mockTicketsPath,
  ]);
  if (cp.status !== 2) {
    failed++; process.stdout.write('  ✗ --ticket-ref: expected exit 2, got exit ' + cp.status + '\n');
  } else {
    const stderr = cp.stderr.toString();
    if (stderr.includes('resolve-by-ticket')) {
      passed++; process.stdout.write('  ✓ --ticket-ref rejected with exit 2 and migration hint\n');
    } else {
      failed++; process.stdout.write('  ✗ --ticket-ref: stderr missing migration hint: ' + stderr + '\n');
    }
  }
  try { fs.unlinkSync(testFile); } catch (e) {}
})();

process.stdout.write('\n[PX-96] Both args: --resolve-by-ticket wins\n');
(function testBothArgsNewWins() {
  const { spawnSync } = require('child_process');
  const scriptPath = path.resolve(__dirname, '../insert-stub.js');
  const testFile = path.join(tmpDir, 'px96-both.tmp');
  fs.writeFileSync(testFile, '// line 1\n// line 2\n');
  const cp = spawnSync('node', [
    scriptPath,
    '--resolve-by-ticket=P0-1',
    '--stub-reason=Dependency not ready',
    '--resolve-plan=Implement the real logic',
    '--ticket-ref=IGNORED',
    '--file=' + testFile,
    '--line=1',
    '--tickets-path=' + mockTicketsPath,
  ]);
  if (cp.status === 0) {
    passed++; process.stdout.write('  ✓ both args: exit 0 (--resolve-by-ticket wins)\n');
  } else {
    failed++; process.stdout.write('  ✗ both args: expected exit 0, got exit ' + cp.status + ', stderr: ' + cp.stderr.toString() + '\n');
  }
  try { fs.unlinkSync(testFile); } catch (e) {}
})();

// [::TICKET::] PX-96: end CLI tests
// ===========================================================================

// [::TICKET::] PX-119: todo condition (C002), ordering (C003), PX ban (C004)
// ===========================================================================

// C002-Pre: existing non-todo ticket rejected with redo instruction
process.stdout.write('\n[C002] Non-todo existing ticket rejected\n');
(function testNonTodoRejected() {
  if (!insertStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const testFile = path.join(tmpDir, 'c002-nontodo.rs');
  fs.writeFileSync(testFile, '// line 1\n');
  try {
    insertStub({ file: testFile, line: 1, ticketRef: 'P0-2', stubReason: 'b', resolvePlan: 'p', ticketsPath: mockTicketsPath });
    failed++; process.stdout.write('  ✗ P0-2 (reviewed) should be rejected by the todo condition\n');
  } catch (err) {
    assert(err.message.includes('todo'), 'message names the todo condition: ' + err.message);
    assert(/re-run|redo|retry/i.test(err.message), 'message instructs redo: ' + err.message);
  }
})();

// C002-Boundary: ticket with no status field treated as todo
process.stdout.write('\n[C002] Missing status treated as todo\n');
(function testMissingStatusTreatedAsTodo() {
  if (!insertStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const testFile = path.join(tmpDir, 'c002-nostatus.rs');
  fs.writeFileSync(testFile, '// line 1\n');
  const noStatus = JSON.parse(fs.readFileSync(mockTicketsPath, 'utf8'));
  noStatus.phases[0].tickets.push({ id: 3, phaseId: 0, title: 'No Status' });
  const noStatusPath = path.join(tmpDir, 'Tickets-nostatus.json');
  fs.writeFileSync(noStatusPath, JSON.stringify(noStatus, null, 2));
  try {
    const result = insertStub({ file: testFile, line: 1, ticketRef: 'P0-3', stubReason: 'b', resolvePlan: 'p', ticketsPath: noStatusPath });
    assertStrictEqual(result.inserted, true, 'status-missing ticket treated as todo');
  } catch (err) {
    failed++; process.stdout.write('  ✗ status-missing ticket should be accepted: ' + err.message + '\n');
  }
})();

// C003-Pre: --ticket-key with earlier-phase target rejected
process.stdout.write('\n[C003] --ticket-key with earlier-phase target rejected\n');
(function testOrderingEarlierPhaseRejected() {
  if (!insertStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const testFile = path.join(tmpDir, 'c003-earlier.rs');
  fs.writeFileSync(testFile, '// line 1\n');
  const ord = { phases: [
    { id: 4, tickets: [{ id: 1, phaseId: 4, status: 'todo', title: 'earlier' }] },
    { id: 5, tickets: [{ id: 2, phaseId: 5, status: 'started', title: 'current' }, { id: 3, phaseId: 5, status: 'todo', title: 'future' }] }
  ] };
  const ordPath = path.join(tmpDir, 'Tickets-ordering.json');
  fs.writeFileSync(ordPath, JSON.stringify(ord, null, 2));
  try {
    insertStub({ file: testFile, line: 1, ticketRef: 'P4-1', stubReason: 'b', resolvePlan: 'p', ticketsPath: ordPath, ticketKey: 'P5-2' });
    failed++; process.stdout.write('  ✗ earlier-phase target should be rejected\n');
  } catch (err) {
    assert(/earlier|before/i.test(err.message), 'ordering message names the earlier target: ' + err.message);
  }
})();

// C003-Post: --ticket-key with later-id target accepted
process.stdout.write('\n[C003] --ticket-key with later-id target accepted\n');
(function testOrderingLaterIdAccepted() {
  if (!insertStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const testFile = path.join(tmpDir, 'c003-later.rs');
  fs.writeFileSync(testFile, '// line 1\n');
  const ord = { phases: [
    { id: 5, tickets: [{ id: 2, phaseId: 5, status: 'started', title: 'current' }, { id: 3, phaseId: 5, status: 'todo', title: 'future' }] }
  ] };
  const ordPath = path.join(tmpDir, 'Tickets-ordering2.json');
  fs.writeFileSync(ordPath, JSON.stringify(ord, null, 2));
  try {
    const result = insertStub({ file: testFile, line: 1, ticketRef: 'P5-3', stubReason: 'b', resolvePlan: 'p', ticketsPath: ordPath, ticketKey: 'P5-2' });
    assertStrictEqual(result.inserted, true, 'later-id target accepted');
  } catch (err) {
    failed++; process.stdout.write('  ✗ later-id target should be accepted: ' + err.message + '\n');
  }
})();

// C003-Invariant: no --ticket-key skips the ordering check
process.stdout.write('\n[C003] No --ticket-key skips ordering check\n');
(function testOrderingSkippedWithoutTicketKey() {
  if (!insertStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const testFile = path.join(tmpDir, 'c003-nokey.rs');
  fs.writeFileSync(testFile, '// line 1\n');
  const ord = { phases: [
    { id: 4, tickets: [{ id: 1, phaseId: 4, status: 'todo', title: 'earlier' }] }
  ] };
  const ordPath = path.join(tmpDir, 'Tickets-ordering3.json');
  fs.writeFileSync(ordPath, JSON.stringify(ord, null, 2));
  try {
    const result = insertStub({ file: testFile, line: 1, ticketRef: 'P4-1', stubReason: 'b', resolvePlan: 'p', ticketsPath: ordPath });
    assertStrictEqual(result.inserted, true, 'no ticketKey => no ordering check');
  } catch (err) {
    failed++; process.stdout.write('  ✗ no-ticketKey insert should succeed: ' + err.message + '\n');
  }
})();

// C004-Pre: PX resolve-by-ticket rejected
process.stdout.write('\n[C004] PX resolve-by-ticket rejected\n');
(function testPxRejected() {
  if (!insertStub) { failed++; process.stdout.write('  ✗ (module not implemented)\n'); return; }
  const testFile = path.join(tmpDir, 'c004-px.rs');
  fs.writeFileSync(testFile, '// line 1\n');
  const pxData = { phases: [
    { id: -1, tickets: [{ id: 10, phaseId: -1, status: 'todo', title: 'px' }] },
    { id: 0, tickets: [{ id: 1, phaseId: 0, status: 'todo', title: 'a' }] }
  ] };
  const pxPath = path.join(tmpDir, 'Tickets-px.json');
  fs.writeFileSync(pxPath, JSON.stringify(pxData, null, 2));
  try {
    insertStub({ file: testFile, line: 1, ticketRef: 'PX-10', stubReason: 'b', resolvePlan: 'p', ticketsPath: pxPath });
    failed++; process.stdout.write('  ✗ PX-10 should be rejected\n');
  } catch (err) {
    assert(/PX/.test(err.message), 'PX-ban message names PX: ' + err.message);
  }
})();

// ===========================================================================
// Summary
// ===========================================================================
process.stdout.write('\n====================\n');
process.stdout.write('Results: ' + passed + ' passed, ' + failed + ' failed\n\n');

if (failed > 0) process.exit(1);
