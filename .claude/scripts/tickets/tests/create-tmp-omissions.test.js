#!/usr/bin/env node
// [::TICKET::] PX-97: Tickets.json schema拡張 & tmp-omissions作成スクリプト. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-97 --for-spec --no-implementation-order`.

/**
 * create-tmp-omissions.test.js — Tests for create-tmp-omissions.js
 *
 * Covers C001-C005 contracts with: precondition, postcondition, invariant tests.
 * All tests in this file follow the Red-Green-Refactor sequence.
 *
 * @verifies C001
 * @verifies C002
 * @verifies C003
 * @verifies C004
 * @verifies C005
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

let extractTicketKeysFromStubs;
let collectNonReviewedTickets;
let mergeTicketSources;
let extractCodes;
let buildOutputJson;
let main;

let passed = 0;
let failed = 0;

// [::TICKET::] PX-97, PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-97|PX-98) --for-spec --no-implementation-order`.
function assert(condition, message) {
  if (condition) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + '\n'); }
}

// [::TICKET::] PX-97, PX-98 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-97|PX-98) --for-spec --no-implementation-order`.
function assertStrictEqual(actual, expected, message) {
  if (actual === expected) { passed++; process.stdout.write('  ✓ ' + message + '\n'); }
  else { failed++; process.stdout.write('  ✗ ' + message + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + '\n'); }
}

console.log('\n━━━ create-tmp-omissions.test.js ━━━\n');

// Load the module under test
try {
  const mod = require('../create-tmp-omissions');
  extractTicketKeysFromStubs = mod.extractTicketKeysFromStubs;
  collectNonReviewedTickets = mod.collectNonReviewedTickets;
  mergeTicketSources = mod.mergeTicketSources;
  extractCodes = mod.extractCodes;
  buildOutputJson = mod.buildOutputJson;
  main = mod.main;
} catch (e) {
  failed++;
  console.log('  ✗ Failed to load create-tmp-omissions.js: ' + e.message + '\n');
  console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
  process.exit(1);
}

// ======================================================================
// C001: STUB Ticket Key Extraction
// ======================================================================

// C001 precondition: find-all-stubs.js output must be valid JSON with specific structure
// [::TICKET::] PX-97
(function testC001Precondition() {
  console.log('  ── C001 Precondition ──');
  const mockOutput = { success: true, count: 2, stubs: [
    { file: '/tmp/test.rs', line: 42, content: '// [::STUB::] P3-2: fix validation' },
    { file: '/tmp/test2.rs', line: 10, content: '// [::STUB::] PX-53: implement handler' }
  ] };
  const result = extractTicketKeysFromStubs(mockOutput);
  assert(Array.isArray(result), 'extractTicketKeysFromStubs returns array');
  assert(result.length === 2, 'extracts 2 ticket keys');
  assert(result.includes('P3-2'), 'contains P3-2');
  assert(result.includes('PX-53'), 'contains PX-53');
})();

// C001 postcondition: regex extracts ticket keys from STUB content
// [::TICKET::] PX-97
(function testC001Postcondition() {
  console.log('  ── C001 Postcondition ──');
  const mockOutput = { success: true, count: 3, stubs: [
    { file: '/tmp/a.rs', line: 1, content: '// [::STUB::] P0-1: implement' },
    { file: '/tmp/b.rs', line: 20, content: '/* [::STUB::] PX-99: refactor */' },
    { file: '/tmp/c.rs', line: 5, content: '// [::STUB::] P12-3: add logic' }
  ] };
  const keys = extractTicketKeysFromStubs(mockOutput);
  assert(keys.length === 3, 'extracts 3 ticket keys');
  assert(keys.includes('P0-1'), 'contains P0-1');
  assert(keys.includes('PX-99'), 'contains PX-99');
  assert(keys.includes('P12-3'), 'contains P12-3');
})();

// C001 invariant: no duplicate keys in extracted set
// [::TICKET::] PX-97
(function testC001Invariant() {
  console.log('  ── C001 Invariant ──');
  const mockOutput = { success: true, count: 3, stubs: [
    { file: '/tmp/a.rs', line: 1, content: '// [::STUB::] P3-2: fix' },
    { file: '/tmp/b.rs', line: 2, content: '// [::STUB::] P3-2: same key' },
    { file: '/tmp/c.rs', line: 3, content: '// [::STUB::] PX-53: other' }
  ] };
  const keys = extractTicketKeysFromStubs(mockOutput);
  assert(keys.length === 2, 'deduplicates to 2 keys');
  assert(keys.filter(k => k === 'P3-2').length === 1, 'P3-2 appears once');
})();

// C001 edge: no STUB markers returns empty array
// [::TICKET::] PX-97
(function testC001Empty() {
  console.log('  ── C001 Edge ──');
  const mockOutput = { success: true, count: 0, stubs: [] };
  const keys = extractTicketKeysFromStubs(mockOutput);
  assert(Array.isArray(keys), 'returns array even when empty');
  assert(keys.length === 0, 'returns empty array for no stubs');
})();

// ======================================================================
// C002: Non-reviewed Ticket Collection
// ======================================================================

// C002 precondition: valid Tickets.json structure
// [::TICKET::] PX-97
(function testC002Precondition() {
  console.log('  ── C002 Precondition ──');
  const mockTickets = { phases: [
    { id: 0, tickets: [
      { id: 1, status: 'reviewed', title: 'Done 1' },
      { id: 2, status: 'todo', title: 'Pending 1' }
    ] },
    { id: 1, tickets: [
      { id: 3, status: 'made', title: 'In Progress' },
      { id: 4, status: 'reviewed', title: 'Done 2' }
    ] }
  ] };
  const nonReviewed = collectNonReviewedTickets(mockTickets);
  assert(Array.isArray(nonReviewed), 'returns array');
  assert(nonReviewed.length === 2, 'collects 2 non-reviewed tickets');
  assert(!nonReviewed.some(t => t.includes('Done')), 'no reviewed tickets in result');
})();

// C002 postcondition: only non-reviewed tickets collected
// [::TICKET::] PX-97
(function testC002Postcondition() {
  console.log('  ── C002 Postcondition ──');
  const mockTickets = { phases: [
    { id: 0, tickets: [
      { id: 1, status: 'reviewed', title: 'A' },
      { id: 2, status: 'in_progress', title: 'B' },
      { id: 3, status: 'todo', title: 'C' },
      { id: 4, status: 'made', title: 'D' }
    ] }
  ] };
  const keys = collectNonReviewedTickets(mockTickets);
  assert(keys.length === 3, '3 non-reviewed tickets collected');
  assert(keys.includes('P0-2'), 'contains P0-2 (in_progress)');
  assert(keys.includes('P0-3'), 'contains P0-3 (todo)');
  assert(keys.includes('P0-4'), 'contains P0-4 (made)');
})();

// C002 invariant: no reviewed tickets in result
// [::TICKET::] PX-97
(function testC002Invariant() {
  console.log('  ── C002 Invariant ──');
  const mockTickets = { phases: [
    { id: 0, tickets: [
      { id: 1, status: 'reviewed', title: 'A' },
      { id: 2, status: 'reviewed', title: 'B' }
    ] }
  ] };
  const keys = collectNonReviewedTickets(mockTickets);
  assert(keys.length === 0, 'empty array when all reviewed');
})();

// ======================================================================
// C003: Merge and Dedup
// ======================================================================

// C003 precondition: two source arrays exist
// [::TICKET::] PX-97
(function testC003Precondition() {
  console.log('  ── C003 Precondition ──');
  const stubKeys = ['P3-2', 'PX-53'];
  const pendingKeys = ['PX-53', 'PX-55'];
  const stubsMap = { 'P3-2': [{ file: '/tmp/t.rs', line: 1, content: '// stub' }] };
  const merged = mergeTicketSources(stubKeys, pendingKeys, stubsMap);
  assert(Array.isArray(merged), 'returns array');
  assert(merged.length > 0, 'merged array is non-empty');
})();

// C003 postcondition: fromStub flags are correct
// [::TICKET::] PX-97
(function testC003Postcondition() {
  console.log('  ── C003 Postcondition ──');
  const stubKeys = ['P3-2'];
  const pendingKeys = ['PX-55'];
  const stubsMap = { 'P3-2': [{ file: '/tmp/t.rs', line: 1, content: '// [::STUB::] P3-2' }] };
  const merged = mergeTicketSources(stubKeys, pendingKeys, stubsMap);
  assert(merged.length === 2, 'merged count is 2');
  const fromStub = merged.find(m => m.ticketKey === 'P3-2');
  const fromPending = merged.find(m => m.ticketKey === 'PX-55');
  assert(fromStub, 'P3-2 found in merged');
  assert(fromPending, 'PX-55 found in merged');
  assert(fromStub.fromStub === true, 'P3-2 fromStub is true');
  assert(fromPending.fromStub === false, 'PX-55 fromStub is false');
})();

// C003 invariant: unique key count constraint
// [::TICKET::] PX-97
(function testC003Invariant() {
  console.log('  ── C003 Invariant ──');
  const stubKeys = ['P3-2', 'PX-53'];
  const pendingKeys = ['PX-53', 'PX-55'];
  const merged = mergeTicketSources(stubKeys, pendingKeys, {});
  const uniqueKeys = new Set(merged.map(m => m.ticketKey));
  assert(uniqueKeys.size <= stubKeys.length + pendingKeys.length, 'unique <= total source keys');
  assert(uniqueKeys.size === 3, '3 unique keys from 4 source keys');
})();

// ======================================================================
// C004: Codes Extraction
// ======================================================================

// C004 precondition: valid file path and line number
// [::TICKET::] PX-97
(function testC004Precondition() {
  console.log('  ── C004 Precondition ──');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px97-test-'));
  const tmpFile = path.join(tmpDir, 'test-codes.txt');
  fs.writeFileSync(tmpFile, 'line1\nline2\nline3\nline4\nline5\n');
  const codes = extractCodes(tmpFile, 2);
  assert(codes === 'line2\nline3\nline4', 'extracts 3 lines from line 2');
  // Cleanup
  fs.unlinkSync(tmpFile);
  fs.rmdirSync(tmpDir);
})();

// C004 postcondition: non-existent file returns empty string
// [::TICKET::] PX-97
(function testC004Postcondition() {
  console.log('  ── C004 Postcondition ──');
  const codes = extractCodes('/tmp/nonexistent-file-px97-test.xyz', 1);
  assertStrictEqual(codes, '', 'non-existent file returns empty string');
})();

// C004 invariant: no exception thrown for non-existent file
// [::TICKET::] PX-97
(function testC004Invariant() {
  console.log('  ── C004 Invariant ──');
  let threw = false;
  try {
    extractCodes('/tmp/nonexistent-file-px97-test.xyz', 1);
  } catch (e) {
    threw = true;
  }
  assert(!threw, 'no exception thrown for non-existent file');
})();

// C004 edge: line beyond file length
// [::TICKET::] PX-97
(function testC004Edge() {
  console.log('  ── C004 Edge ──');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px97-test-'));
  const tmpFile = path.join(tmpDir, 'short.txt');
  fs.writeFileSync(tmpFile, 'only one line\n');
  const codes = extractCodes(tmpFile, 5);
  assert(codes === '', 'line beyond file length returns empty string');
  fs.unlinkSync(tmpFile);
  fs.rmdirSync(tmpDir);
})();

// ======================================================================
// C005: Output Construction
// ======================================================================

// C005 precondition: merged entries array exists
// [::TICKET::] PX-97
(function testC005Precondition() {
  console.log('  ── C005 Precondition ──');
  const mergedEntries = [
    { ticketKey: 'P3-2', fromStub: true, stubs: [] }
  ];
  const output = buildOutputJson(mergedEntries, { title: 'Test', metadata: {}, phases: [] });
  assert(output, 'output object created');
  assert(typeof output === 'object', 'output is an object');
})();

// C005 postcondition: output follows Tickets.json schema
// [::TICKET::] PX-97
(function testC005Postcondition() {
  console.log('  ── C005 Postcondition ──');
  const mergedEntries = [
    { ticketKey: 'P3-2', fromStub: true, stubs: [{ file: '/tmp/t.rs', line: 1, content: '// stub', codes: 'line2' }] },
    { ticketKey: 'PX-55', fromStub: false, stubs: [] }
  ];
  const template = { title: 'tmp-omissions', metadata: { source: 'test', generatedAt: '20260729', analyzedSections: '' }, phases: [{ id: -1, name: 'Escrow', characteristics: '', tickets: [] }] };
  const output = buildOutputJson(mergedEntries, template);
  assert(output.title === 'tmp-omissions', 'title preserved');
  assert(output.metadata.source === 'test', 'metadata.source preserved');
  assert(output.phases.length > 0, 'phases populated');
  const totalTickets = output.phases.reduce((sum, p) => sum + p.tickets.length, 0);
  assert(totalTickets === 2, '2 total tickets in output across all phases');
})();

// C005 invariant: fromStub and stubs fields exist in every output ticket
// [::TICKET::] PX-97
(function testC005Invariant() {
  console.log('  ── C005 Invariant ──');
  const mergedEntries = [
    { ticketKey: 'P3-2', fromStub: true, stubs: [{ file: '/tmp/t.rs', line: 1, content: '// stub', codes: 'line2' }] },
    { ticketKey: 'P0-1', fromStub: false, stubs: [] },
    { ticketKey: 'PX-10', fromStub: true, stubs: [] }
  ];
  const template = { title: 'T', metadata: {}, phases: [{ id: 0, name: 'P0', characteristics: '', tickets: [] }] };
  const output = buildOutputJson(mergedEntries, template);
  output.phases.forEach(p => {
    p.tickets.forEach(t => {
      assert(typeof t.fromStub === 'boolean', 'fromStub is boolean in all tickets');
      assert(Array.isArray(t.stubs), 'stubs is array in all tickets');
    });
  });
  const totalTickets = output.phases.reduce((sum, p) => sum + p.tickets.length, 0);
  assert(totalTickets === 3, 'all 3 tickets in output across all phases');
})();

// C005 edge: empty merged entries produces phases with empty tickets
// [::TICKET::] PX-97
(function testC005Empty() {
  console.log('  ── C005 Edge ──');
  const mergedEntries = [];
  const template = { title: 'T', metadata: {}, phases: [{ id: -1, name: 'Escrow', characteristics: '', tickets: [] }] };
  const output = buildOutputJson(mergedEntries, template);
  assert(output.phases.length === 0, '0 phases when no entries');
})();

// ======================================================================
// Summary
// ======================================================================
console.log('\n━━━ Summary ━━━\n');
console.log('Passed: ' + passed + '\nFailed: ' + failed + '\n');
if (failed > 0) process.exit(1);
