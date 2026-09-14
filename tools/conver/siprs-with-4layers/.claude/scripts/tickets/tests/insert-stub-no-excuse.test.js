#!/usr/bin/env node
// [::TICKET::] PX-121: insert-stub no-excuse rejection — tests for the creation-time gate.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-121 --for-spec --no-implementation-order`.

/**
 * insert-stub-no-excuse.test.js — RED tests for the insert-stub.js no-excuse gate.
 *
 * @verifies C001 (insert-stub plan to acceptance)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0;
let failed = 0;

// [::TICKET::] PX-121 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-121 --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'insert-stub-no-excuse-'));
const mockTicketsPath = path.join(tmpDir, 'Tickets.json');
const mockSourcePath = path.join(tmpDir, 'test.rs');

const mockTickets = {
  title: 'test',
  phases: [
    {
      id: 0,
      name: 'Test Phase',
      tickets: [
        { id: 1, phaseId: 0, status: 'todo', title: 'Resolving Ticket' }
      ]
    },
    {
      id: -1,
      name: 'PX',
      tickets: [
        { id: 121, phaseId: -1, status: 'planned', title: 'PX-121' }
      ]
    }
  ]
};
fs.writeFileSync(mockTicketsPath, JSON.stringify(mockTickets, null, 2));

let insertStub, InsertStubError;
try {
  ({ insertStub, InsertStubError } = require('../insert-stub.js'));
} catch (e) {
  console.error('[RED] insert-stub.js not implemented:', e.code);
  process.exit(1);
}

console.log('\n━━━ insert-stub-no-excuse.test.js — TESTS ━━━\n');

// ============================================================
// C001 — no-excuse rejection at creation time
// ============================================================
console.log('## C001 — terminal-excuse plans are rejected\n');

(function testC001TerminalExcuseRejected() {
  console.log('  ── a terminal-excuse resolve-plan is rejected with InsertStubError');
  fs.writeFileSync(mockSourcePath, '// line 1\n// line 2\n// line 3\n');
  let threw = false;
  let message = '';
  try {
    insertStub({
      file: mockSourcePath,
      line: 2,
      ticketRef: 'P0-1',
      stubReason: 'codec placeholder',
      resolvePlan: 'requires external PJSIP headers', // terminal excuse, no work item
      ticketsPath: mockTicketsPath,
      ticketKey: 'PX-121'
    });
  } catch (err) {
    threw = true;
    message = err.message || '';
    assert(err instanceof InsertStubError, 'throws InsertStubError');
    assert(message.length > 0, 'error carries a diagnostic message');
    assert(/Action/i.test(message) || /problem/i.test(message), 'message is Action-directive');
  }
  assert(threw, 'terminal-excuse plan must be rejected');
})();

(function testC001ActionablePlanAccepted() {
  console.log('  ── an actionable resolve-plan is accepted (no throw)');
  fs.writeFileSync(mockSourcePath, '// line 1\n// line 2\n// line 3\n');
  let threw = false;
  try {
    insertStub({
      file: mockSourcePath,
      line: 2,
      ticketRef: 'P0-1',
      stubReason: 'codec placeholder',
      resolvePlan: 'Vendor and build PJSIP in build.rs',
      ticketsPath: mockTicketsPath,
      ticketKey: 'PX-121'
    });
  } catch (err) {
    threw = true;
  }
  assert(!threw, 'actionable plan must be accepted');
})();

(function testC001InvariantNoExcuseMarkerCreated() {
  console.log('  ── an excuse plan never writes a marker into the file');
  fs.writeFileSync(mockSourcePath, '// line 1\n// line 2\n// line 3\n');
  try {
    insertStub({
      file: mockSourcePath,
      line: 2,
      ticketRef: 'P0-1',
      stubReason: 'deferred until the team ships headers', // terminal excuse
      resolvePlan: 'awaiting approval', // no work item
      ticketsPath: mockTicketsPath,
      ticketKey: 'PX-121'
    });
  } catch (err) { /* expected */ }
  const content = fs.readFileSync(mockSourcePath, 'utf8');
  assert(!content.includes('[::STUB::]'), 'no marker is written for a rejected excuse plan');
})();

// ============================================================
// Summary
// ============================================================
console.log('\n━━━ Summary ━━━\n');
console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
