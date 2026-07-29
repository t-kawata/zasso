#!/usr/bin/env node
// [::TICKET::] PX-98: 完了済み実装状況検査対象コマンドリスト生成スクリプト. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-98 --for-spec --no-implementation-order`.

/**
 * create-check-target-tickets-cmds.test.js — Tests for create-check-target-tickets-cmds.js
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

let collectReviewedTicketKeys;
let buildCommand;
let buildEntries;
let writeOutput;
let main;

let passed = 0;
let failed = 0;

// [::TICKET::] PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-98 --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-98 --for-spec --no-implementation-order`.
function assertStrictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

console.log('\n━━━ create-check-target-tickets-cmds.test.js ━━━\n');

try {
  const mod = require('../create-check-target-tickets-cmds');
  collectReviewedTicketKeys = mod.collectReviewedTicketKeys;
  buildCommand = mod.buildCommand;
  buildEntries = mod.buildEntries;
  writeOutput = mod.writeOutput;
  main = mod.main;
} catch (e) {
  failed++;
  console.log('  ✗ Failed to load create-check-target-tickets-cmds.js: ' + e.message + '\n');
  console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
  process.exit(1);
}

// ======================================================================
// C001: Reviewed Ticket Filtering
// ======================================================================

(function testC001Precondition() {
  console.log('  ── C001 Precondition ──');
  const mockTickets = { phases: [
    { id: 0, tickets: [{ id: 1, status: 'reviewed', title: 'A' }, { id: 2, status: 'todo', title: 'B' }] }
  ] };
  const result = collectReviewedTicketKeys(mockTickets);
  assert(Array.isArray(result), 'returns array');
  assert(result.length === 1, '1 reviewed ticket');
  assert(result[0] === 'P0-1', 'key is P0-1');
})();

(function testC001Postcondition() {
  console.log('  ── C001 Postcondition ──');
  const mockTickets = { phases: [
    { id: 0, tickets: [
      { id: 1, status: 'reviewed', title: 'Done' },
      { id: 2, status: 'todo', title: 'Pending' },
      { id: 3, status: 'made', title: 'Made' }
    ] }
  ] };
  const keys = collectReviewedTicketKeys(mockTickets);
  assert(keys.length === 1, '1 reviewed ticket');
  assert(keys[0] === 'P0-1', 'key is P0-1');
})();

(function testC001Invariant() {
  console.log('  ── C001 Invariant ──');
  const mockTickets = { phases: [
    { id: -1, tickets: [
      { id: 1, status: 'reviewed', title: 'R1' },
      { id: 2, status: 'reviewed', title: 'R2' }
    ] }
  ] };
  const keys = collectReviewedTicketKeys(mockTickets);
  assert(keys.length === 2, '2 reviewed tickets');
  assert(keys.every(k => typeof k === 'string'), 'all keys are strings');
  assert(keys[0] === 'PX-1', 'key is PX-1 (phase X)');
})();

(function testC001Empty() {
  console.log('  ── C001 Edge ──');
  const mockTickets = { phases: [
    { id: 0, tickets: [{ id: 1, status: 'todo', title: 'T' }] }
  ] };
  const keys = collectReviewedTicketKeys(mockTickets);
  assert(keys.length === 0, 'empty array when no reviewed');
})();

// ======================================================================
// C002: Command String Generation
// ======================================================================

(function testC002Precondition() {
  console.log('  ── C002 Precondition ──');
  const cmd = buildCommand('P3-2');
  assert(typeof cmd === 'string', 'command is string');
  assert(cmd.length > 0, 'command is non-empty');
})();

(function testC002Postcondition() {
  console.log('  ── C002 Postcondition ──');
  const cmd = buildCommand('P3-2');
  assert(cmd.includes('show-ticket-context.js'), 'contains script name');
  assert(cmd.includes('--ticket-key=P3-2'), 'contains ticket key');
  assert(cmd.includes('--for-spec'), 'contains --for-spec flag');
})();

(function testC002Invariant() {
  console.log('  ── C002 Invariant ──');
  const keys = ['P0-1', 'PX-10', 'P3-2'];
  const cmds = keys.map(k => buildCommand(k));
  assert(cmds.every(c => c.includes('show-ticket-context.js')), 'all contain script name');
  assert(cmds.every(c => c.includes('--for-spec')), 'all contain --for-spec');
})();

(function testC002PX() {
  console.log('  ── C002 PX Edge ──');
  const cmd = buildCommand('PX-53');
  assert(cmd.includes('--ticket-key=PX-53'), 'contains PX-53 key');
})();

// ======================================================================
// C003: Output Format
// ======================================================================

(function testC003Precondition() {
  console.log('  ── C003 Precondition ──');
  const keys = ['P0-1', 'PX-10'];
  const entries = buildEntries(keys);
  assert(Array.isArray(entries), 'entries is array');
  assert(entries.length === 2, '2 entries');
})();

(function testC003Postcondition() {
  console.log('  ── C003 Postcondition ──');
  const entries = buildEntries(['P3-2']);
  assert(entries[0].done === false, 'done is false');
  assert(typeof entries[0].cmd === 'string', 'cmd is string');
  assert(entries[0].cmd.includes('show-ticket-context.js'), 'cmd contains script');
})();

(function testC003Invariant() {
  console.log('  ── C003 Invariant ──');
  const keys = ['P0-1', 'P1-2', 'P3-4', 'PX-5', 'P12-6'];
  const entries = buildEntries(keys);
  assert(entries.every(e => e.done === false), 'all entries have done=false');
  assert(entries.length === 5, '5 entries for 5 keys');
})();

(function testC003Empty() {
  console.log('  ── C003 Edge ──');
  const entries = buildEntries([]);
  assert(Array.isArray(entries), 'returns array');
  assert(entries.length === 0, 'empty array for no keys');
})();

(function testC003WriteOutput() {
  console.log('  ── C003 Write Output ──');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px98-cmds-'));
  const outFile = path.join(tmpDir, 'test-cmds.json');
  const entries = [{ done: false, cmd: 'node test.js --key=P3-2 --for-spec' }];
  writeOutput(outFile, entries);
  const content = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert(Array.isArray(content), 'output is array');
  assert(content.length === 1, '1 entry');
  assert(content[0].done === false, 'done is false');
  assert(typeof content[0].cmd === 'string', 'cmd is string');
  fs.unlinkSync(outFile);
  fs.rmdirSync(tmpDir);
})();

// ======================================================================
console.log('\n━━━ Summary ━━━\n');
console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
