#!/usr/bin/env node
// [::TICKET::] PX-101: Create get-next-check-target-ticket.js. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-101 --for-spec --no-implementation-order`.

/**
 * get-next-check-target-ticket.test.js — Tests for get-next-check-target-ticket.js
 *
 * Covers C001-C003 contracts with: precondition, postcondition, invariant tests.
 *
 * @verifies C001
 * @verifies C002
 * @verifies C003
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let popNextEntry;
let setTicketRemanded;
let buildPrefixMessage;

let passed = 0;
let failed = 0;

// [::TICKET::] PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-101 --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-101 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-101 --for-spec --no-implementation-order`.
function assertStrictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

console.log('\n━━━ get-next-check-target-ticket.test.js ━━━\n');

try {
  const mod = require('../get-next-check-target-ticket');
  popNextEntry = mod.popNextEntry;
  setTicketRemanded = mod.setTicketRemanded;
  buildPrefixMessage = mod.buildPrefixMessage;
} catch (e) {
  failed++;
  console.log('  ✗ Failed to load get-next-check-target-ticket.js: ' + e.message + '\n');
  console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
  process.exit(1);
}

// ======================================================================
// C001: Temp file auto-creation (pure functions only)
// ======================================================================

(function testPrefixMessageFormat() {
  console.log('  ── C001/C003 Prefix Message ──');
  const msg1 = buildPrefixMessage(5, 3);
  assertStrictEqual(msg1, 'Total 5 tickets to inspect. Inspecting ticket 3/5.', 'format 3/5');
  const msg2 = buildPrefixMessage(1, 1);
  assertStrictEqual(msg2, 'Total 1 tickets to inspect. Inspecting ticket 1/1.', 'format 1/1');
  const msg3 = buildPrefixMessage(133, 42);
  assertStrictEqual(msg3, 'Total 133 tickets to inspect. Inspecting ticket 42/133.', 'format 42/133');
})();

// ======================================================================
// C002: Cmd queue pop and progress tracking
// ======================================================================

(function testC002Precondition() {
  console.log('  ── C002 Precondition: pop first done:false ──');
  const entries = [
    { done: true, cmd: 'show P0-1' },
    { done: false, cmd: 'show P1-2' },
    { done: false, cmd: 'show P3-4' }
  ];
  const result = popNextEntry(entries);
  assert(result !== null, 'returns entry');
  assertStrictEqual(result.idx, 1, 'returns index 1 (second entry)');
  assertStrictEqual(result.entry.done, true, 'returned entry has done=true (marker)');
})();

(function testC002PostconditionMarkedDone() {
  console.log('  ── C002 Postcondition: entry marked done:true in original array ──');
  const entries = [
    { done: true, cmd: 'show P0-1' },
    { done: false, cmd: 'show P1-2' }
  ];
  const result = popNextEntry(entries);
  assertStrictEqual(entries[1].done, true, 'original entry at idx 1 set to done:true');
})();

(function testC002PostconditionRemanded() {
  console.log('  ── C002 Postcondition: setTicketRemanded ──');
  const ticketsData = {
    phases: [
      { id: -1, tickets: [
        { id: 99, status: 'reviewed', title: 'Test' }
      ]}
    ]
  };
  const result = setTicketRemanded(ticketsData, 'PX-99');
  assert(result !== null, 'returns result');
  assertStrictEqual(result.ticket.status, 'remanded', 'status changed to remanded');
})();

(function testC002Invariant() {
  console.log('  ── C002 Invariant: exactly one transition per invocation ──');
  const entries = [
    { done: false, cmd: 'a' },
    { done: false, cmd: 'b' },
    { done: false, cmd: 'c' }
  ];
  const result = popNextEntry(entries);
  assertStrictEqual(result.idx, 0, 'pops first entry');
  assertStrictEqual(entries[0].done, true, 'first entry done:true');
  assertStrictEqual(entries[1].done, false, 'second entry still done:false');
})();

(function testC002AllDoneReturnsNull() {
  console.log('  ── C002 Edge: all done:true returns null ──');
  const entries = [
    { done: true, cmd: 'a' },
    { done: true, cmd: 'b' }
  ];
  const result = popNextEntry(entries);
  assertStrictEqual(result, null, 'null when no done:false entries');
})();

(function testC002EmptyArrayReturnsNull() {
  console.log('  ── C002 Edge: empty array returns null ──');
  const result = popNextEntry([]);
  assertStrictEqual(result, null, 'null for empty array');
})();

// ======================================================================
// C003: show-ticket-context execution (prefix output only — pure fn)
// ======================================================================

(function testC003OutputFormat() {
  console.log('  ── C003 Output format ──');
  const prefix = buildPrefixMessage(10, 4);
  assert(typeof prefix === 'string', 'prefix is string');
  assert(prefix.length > 0, 'prefix is non-empty');
  assert(prefix.includes('4/10'), 'prefix contains current/total');
})();

// ======================================================================
// setTicketRemanded edge cases
// ======================================================================

(function testRemandedTicketNotFound() {
  console.log('  ── setTicketRemanded: ticket not found ──');
  const ticketsData = { phases: [{ id: 0, tickets: [{ id: 1, status: 'reviewed' }] }] };
  const result = setTicketRemanded(ticketsData, 'PX-99');
  assert(result === null, 'null when ticket not found');
})();

(function testRemandedPXPhase() {
  console.log('  ── setTicketRemanded: PX phase ticket ──');
  const ticketsData = {
    phases: [
      { id: -1, tickets: [{ id: 42, status: 'reviewed', title: 'PX task' }] }
    ]
  };
  const result = setTicketRemanded(ticketsData, 'PX-42');
  assert(result !== null, 'PX ticket found');
  assertStrictEqual(result.ticket.status, 'remanded', 'status changed');
})();

(function testRemandedMultiPhase() {
  console.log('  ── setTicketRemanded: multi-phase ──');
  const ticketsData = {
    phases: [
      { id: 0, tickets: [{ id: 1, status: 'reviewed', title: 'A' }] },
      { id: 1, tickets: [{ id: 5, status: 'reviewed', title: 'B' }] }
    ]
  };
  const result = setTicketRemanded(ticketsData, 'P1-5');
  assert(result !== null, 'found in phase 1');
  assertStrictEqual(result.ticket.status, 'remanded', 'status changed');
})();

// ======================================================================
// popNextEntry edge cases
// ======================================================================

(function testPopEntryPreservesOthers() {
  console.log('  ── popNextEntry: preserves other entries ──');
  const entries = [
    { done: true, cmd: 'a' },
    { done: false, cmd: 'b' },
    { done: true, cmd: 'c' }
  ];
  const beforeJson = JSON.stringify(entries[0]);
  const beforeJson2 = JSON.stringify(entries[2]);
  popNextEntry(entries);
  assertStrictEqual(JSON.stringify(entries[0]), beforeJson, 'entry 0 unchanged');
  assertStrictEqual(JSON.stringify(entries[2]), beforeJson2, 'entry 2 unchanged');
})();

// ======================================================================
console.log('\n━━━ Summary ━━━\n');
console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
