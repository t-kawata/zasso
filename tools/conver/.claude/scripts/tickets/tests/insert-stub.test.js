#!/usr/bin/env node
// [::TICKET::] PX-94 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-94 --for-spec --no-implementation-order`.

/**
 * insert-stub.test.js — Tests for insert-stub.js
 *
 * Covers: ticket-ref existence validation, file/line bounds, duplicate detection,
 * output format compliance with validate-stub-format.js.
 *
 * [::TICKET::] PX-94: insert-stub.js — ticket-validated STUB marker insertion script
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Module to test — loaded after all mocks are set up
let insertStub, InsertStubError;

let passed = 0;
let failed = 0;

// [::TICKET::] PX-95, PX-94 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-95|PX-94) --for-spec --no-implementation-order`.
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

// Create mock Tickets.json with phase 0 having P0-1
const mockTickets = {
  title: 'test',
  phases: [
    {
      id: 0,
      name: 'Test Phase',
      tickets: [
        { id: 1, phaseId: 0, status: 'reviewed', title: 'Test Ticket' }
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
      description: 'Test stub for P0-1',
      ticketsPath: mockTicketsPath,
    });
    assertStrictEqual(result.inserted, true, 'insertStub returns {inserted: true}');
    const content = fs.readFileSync(testFile, 'utf8');
    const lines = content.split('\n');
    assert(lines[1].includes('[::STUB::] P0-1:'), 'line 2 contains [::STUB::] P0-1:');
    assert(lines[1].includes('Test stub for P0-1'), 'line 2 contains description');
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
      description: 'duplicate',
      ticketsPath: mockTicketsPath,
    });
    // Second insert on same line should fail
    insertStub({
      file: mockSourcePath,
      line: 1,
      ticketRef: 'P0-1',
      description: 'duplicate again',
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
      description: 'ghost ticket',
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
      description: 'out of range',
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
      description: 'missing file',
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
      description: 'should be rejected',
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
      description: 'Format conformance test',
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
      description: 'should not write',
      ticketsPath: mockTicketsPath,
    });
  } catch (err) {
    // Expected error — verify file unchanged
    const content = fs.readFileSync(testFile, 'utf8');
    assertStrictEqual(content, originalContent, 'file content unchanged after error');
  }
})();

// ===========================================================================
// Summary
// ===========================================================================
process.stdout.write('\n====================\n');
process.stdout.write('Results: ' + passed + ' passed, ' + failed + ' failed\n\n');

if (failed > 0) process.exit(1);
