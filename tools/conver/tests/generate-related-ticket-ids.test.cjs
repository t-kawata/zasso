#!/usr/bin/env node

/**
 * generate-related-ticket-ids.test.cjs — Unit tests for relatedTicketIds generation
 *
 * Framework-agnostic. Can be run directly with:
 *   node tests/generate-related-ticket-ids.test.cjs
 */

'use strict';

const path = require('path');
const mod = require(path.resolve(__dirname, '../.claude/scripts/tickets/generate-related-ticket-ids.js'));
const { generateRelatedTicketIds, DIRECTION_LABELS } = mod;

// ============================================================
// Test utilities
// ============================================================

let passedCount = 0;
let failedCount = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passedCount++;
  } else {
    failedCount++;
    failures.push(message);
    console.error('  ❌ FAIL: ' + message);
  }
}

function assertMapSize(map, expectedSize, message) {
  if (map.size === expectedSize) {
    passedCount++;
  } else {
    failedCount++;
    failures.push(message + ' (size: ' + map.size + ', expected: ' + expectedSize + ')');
    console.error('  ❌ FAIL: ' + message);
    console.error('      size: ' + map.size + ', expected: ' + expectedSize);
  }
}

function assertContains(str, substring, message) {
  if (str && str.indexOf(substring) !== -1) {
    passedCount++;
  } else {
    failedCount++;
    failures.push(message);
    console.error('  ❌ FAIL: ' + message);
    console.error('      string: "' + str + '"');
    console.error('      expected to contain: "' + substring + '"');
  }
}

function assertNotContains(str, substring, message) {
  if (!str || str.indexOf(substring) === -1) {
    passedCount++;
  } else {
    failedCount++;
    failures.push(message);
    console.error('  ❌ FAIL: ' + message);
    console.error('      string: "' + str + '"');
    console.error('      expected NOT to contain: "' + substring + '"');
  }
}

/**
 * Create a test ticket
 */
function makeTicket(id, nodeIds, title, phaseId) {
  return { id: id, nodeIds: nodeIds || [], phaseId: phaseId !== undefined ? phaseId : 0, title: title || 'ticket ' + id };
}

/**
 * Create a test edge
 */
function makeEdge(from, to, type) {
  return { from: from, to: to, type: type || 'depends_on' };
}

// ============================================================
// Test: reverse map construction
// ============================================================

function testReverseMap() {
  console.log('\n=== Reverse map (internal implementation indirect verification) ===');

  // Simple case: 2 tickets, 2 nodes
  const tickets = [
    makeTicket(1, ['N0001', 'N0002'], 'First', 0),
    makeTicket(2, ['N0003'], 'Second', 0),
  ];
  const edges = [makeEdge('N0001', 'N0003', 'depends_on')];
  const result = generateRelatedTicketIds(tickets, edges);
  assertMapSize(result, 2, '2-ticket edge: both directions are output');
  assertContains(result.get("0:1"), 'P0-2', 'ticket 1 related contains P0-2');
  assertContains(result.get("0:2"), 'P0-1', 'ticket 2 related contains P0-1');
}

// ============================================================
// Test: single edge cross-ticket
// ============================================================

function testSingleEdgeCrossTicket() {
  console.log('\n=== Single edge cross-ticket ===');

  const tickets = [
    makeTicket(1, ['N0001'], 'Ticket A', 0),
    makeTicket(2, ['N0002'], 'Ticket B', 0),
  ];
  const edges = [makeEdge('N0001', 'N0002', 'depends_on')];
  const result = generateRelatedTicketIds(tickets, edges);

  // P0-1: N0001→N0002 as source → "Dependency"
  assertMapSize(result, 2, 'Both directions have entries');
  assertContains(result.get("0:1"), '[depends_on] P0-2', 'P0-1 contains [depends_on] P0-2');
  assertContains(result.get("0:1"), 'Dependency', 'P0-1 is the dependency direction');
  assertContains(result.get("0:2"), '[depends_on] P0-1', 'P0-2 contains [depends_on] P0-1');
  assertContains(result.get("0:2"), 'Dependency source (dependent)', 'P0-2 is the dependency source direction');
}

// ============================================================
// Test: self-reference guard
// ============================================================

function testSelfReferenceGuard() {
  console.log('\n=== Self-reference guard ===');

  // Both endpoints in same ticket's nodeIds → skip edge
  const tickets = [
    makeTicket(1, ['N0001', 'N0002'], 'Self ticket', 0),
    makeTicket(2, ['N0003'], 'Other', 0),
  ];
  const edges = [makeEdge('N0001', 'N0002', 'refines')];
  const result = generateRelatedTicketIds(tickets, edges);
  assertMapSize(result, 0, 'Self-reference edge not output');

  // Mixed case: self-reference + cross edge
  const tickets2 = [
    makeTicket(1, ['N0001', 'N0002'], 'Mixed', 0),
    makeTicket(2, ['N0003'], 'Other', 0),
  ];
  const edges2 = [
    makeEdge('N0001', 'N0002', 'refines'), // self-reference → skip
    makeEdge('N0001', 'N0003', 'depends_on'), // cross → output
  ];
  const result2 = generateRelatedTicketIds(tickets2, edges2);
  assertMapSize(result2, 2, 'Mixed: self-reference skipped, cross only output');
  assertContains(result2.get("0:1"), 'P0-2', 'ticket1 has cross edge to P0-2');
  assertNotContains(result2.get("0:1"), 'refines', 'ticket1 does not contain refines self-reference');
}

// ============================================================
// Test: multiple edge concatenation
// ============================================================

function testMultipleEdges() {
  console.log('\n=== Multiple edges concatenation ===');

  const tickets = [
    makeTicket(1, ['N0001'], 'Source', 0),
    makeTicket(2, ['N0002'], 'Target A', 0),
    makeTicket(3, ['N0003'], 'Target B', 0),
  ];
  const edges = [
    makeEdge('N0001', 'N0002', 'depends_on'),
    makeEdge('N0001', 'N0003', 'refines'),
  ];
  const result = generateRelatedTicketIds(tickets, edges);

  assertMapSize(result, 3, '3 tickets, 2 edges: all 3 tickets have entries');
  assertContains(result.get("0:1"), "P0-2", "P0-1 has edge to P0-2");
  assertContains(result.get("0:1"), 'P0-3', 'P0-1 has edge to P0-3');
  // Verify 2 edges are concatenated with ", "
  const prose = result.get("0:1");
  assert(prose.indexOf(', ') !== -1, 'Multiple edges concatenated with ", "');
}

// ============================================================
// Test: all edge types
// ============================================================

function testAllEdgeTypes() {
  console.log('\n=== All edge types ===');

  const tickets = [
    makeTicket(1, ['N0001'], 'Source', 0),
    makeTicket(2, ['N0002'], 'Target', 0),
  ];

  const types = [
    'depends_on', 'implements', 'constrains', 'precedes',
    'triggers', 'refines', 'references', 'extends',
    'conflicts_with', 'supersedes', 'validates', 'part_of',
  ];

  for (const type of types) {
    const edges = [makeEdge('N0001', 'N0002', type)];
    const result = generateRelatedTicketIds(tickets, edges);
    assertMapSize(result, 2, 'type=' + type + ': both directions output');
    assertContains(result.get("0:1"), '[' + type + ']', 'type=' + type + ': P0-1 contains [' + type + ']');
  }

  // Unknown edge type → use type name as direction label
  const unknownEdges = [makeEdge('N0001', 'N0002', 'unknown_type')];
  const result = generateRelatedTicketIds(tickets, unknownEdges);
  assertMapSize(result, 2, 'Unknown edge type: both directions output');
  assertContains(result.get("0:1"), '[unknown_type]', 'Unknown edge type: type name used as-is');
  assertContains(result.get("0:1"), 'unknown_type', 'Direction label falls back to type name');
}

// ============================================================
// Test: unrelated edge
// ============================================================

function testUnrelatedEdge() {
  console.log('\n=== Unrelated edge ===');

  const tickets = [
    makeTicket(1, ['N0001'], 'Ticket', 0),
  ];
  const edges = [
    makeEdge('N9999', 'N8888', 'depends_on'), // Not in any ticket's nodeIds
  ];
  const result = generateRelatedTicketIds(tickets, edges);
  assertMapSize(result, 0, 'Unrelated edge: not output');
}

// ============================================================
// Test: empty/null inputs
// ============================================================

function testEmptyInputs() {
  console.log('\n=== Empty/null inputs ===');

  // Empty tickets array
  assertMapSize(generateRelatedTicketIds([], [makeEdge('N1', 'N2')]), 0, 'Empty tickets array: empty map');

  // Empty edges array
  const tickets = [makeTicket(1, ['N1'], undefined, 0)];
  assertMapSize(generateRelatedTicketIds(tickets, []), 0, 'Empty edges array: empty map');

  // null/undefined
  assertMapSize(generateRelatedTicketIds(null, [makeEdge('N1', 'N2')]), 0, 'null tickets: empty map');
  assertMapSize(generateRelatedTicketIds(tickets, null), 0, 'null edges: empty map');
  assertMapSize(generateRelatedTicketIds(undefined, undefined), 0, 'undefined/undefined: empty map');

  // Ticket with empty nodeIds
  const emptyNodeTickets = [makeTicket(1, [], 'empty', 0)];
  assertMapSize(generateRelatedTicketIds(emptyNodeTickets, [makeEdge('N1', 'N2')]), 0, 'Empty nodeIds: empty map');
}

// ============================================================
// Test: idempotent after ID renumbering
// ============================================================

function testIdempotentAfterRename() {
  console.log('\n=== Idempotent after ID renumbering ===');

  // GRAPH.json is immutable (nodeIds don't change)
  const edges = [makeEdge('N0001', 'N0002', 'depends_on')];

  // 1st run: old IDs
  const oldTickets = [
    makeTicket(1, ['N0001'], 'Old A', 0),
    makeTicket(2, ['N0002'], 'Old B', 0),
  ];
  const oldResult = generateRelatedTicketIds(oldTickets, edges);
  assertContains(oldResult.get("0:1"), 'P0-2', 'Old IDs: phase0-ticket1→P0-2');

  // After renumbering: new IDs correctly generated from same GRAPH.json
  const newTickets = [
    makeTicket(1, ['N0001'], 'New A', 3),
    makeTicket(2, ['N0002'], 'New B', 3),
  ];
  const newResult = generateRelatedTicketIds(newTickets, edges);
  assertContains(newResult.get("3:1"), 'P3-2', 'New IDs: P3-1→P3-2');
  assertNotContains(newResult.get("3:1"), 'P0-2', 'Old IDs not present');
}

// ============================================================
// Test: direction accuracy
// ============================================================

function testDirectionAccuracy() {
  console.log('\n=== Direction accuracy ===');

  // depends_on: N0001 → N0002 (N0001 belongs to P0-1, N0002 belongs to P0-2)
  const tickets = [
    makeTicket(1, ['N0001'], 'From', 0),
    makeTicket(2, ['N0002'], 'To', 0),
  ];
  const edges = [makeEdge('N0001', 'N0002', 'depends_on')];
  const result = generateRelatedTicketIds(tickets, edges);

  // P0-1 is the from side → "Dependency"
  assertContains(result.get("0:1"), 'Dependency', 'From-side ticket has "Dependency"');
  // P0-2 is the to side → "Dependency source (dependent)"
  assertContains(result.get("0:2"), 'Dependency source (dependent)', 'To-side ticket has "Dependency source (dependent)"');

  // Verify direction labels for all edge types (from→to label)
  const testCases = Object.entries(DIRECTION_LABELS);
  for (const [type, label] of testCases) {
    const e = [makeEdge('N0001', 'N0002', type)];
    const r = generateRelatedTicketIds(tickets, e);
    assertContains(r.get("0:1"), label, type + ': from-side has "' + label + '"');
  }
}

// ============================================================
// Test: edge missing fields
// ============================================================

function testEdgeMissingFields() {
  console.log('\n=== Edge missing fields ===');

  const tickets = [makeTicket(1, ['N0001'], 'Ticket', 0)];

  // Missing from
  const missingFrom = [{ to: 'N0002', type: 'depends_on' }];
  assertMapSize(generateRelatedTicketIds(tickets, missingFrom), 0, 'Missing from: skipped');

  // Missing to
  const missingTo = [{ from: 'N0001', type: 'depends_on' }];
  assertMapSize(generateRelatedTicketIds(tickets, missingTo), 0, 'Missing to: skipped');

  // Missing type
  const missingType = [{ from: 'N0001', to: 'N0002' }];
  assertMapSize(generateRelatedTicketIds(tickets, missingType), 0, 'Missing type: skipped');
}

// ============================================================
// Test: cross-phase tickets
// ============================================================

function testCrossPhaseTickets() {
  console.log('\n=== Cross-phase tickets ===');

  const tickets = [
    makeTicket(1, ['N0001'], 'Phase0 ticket', 0),
    makeTicket(1, ['N0002'], 'Phase1 ticket', 1),
    makeTicket(1, ['N0003'], 'Phase2 ticket', 2),
  ];
  const edges = [
    makeEdge('N0001', 'N0002', 'depends_on'),
    makeEdge('N0002', 'N0003', 'implements'),
  ];
  const result = generateRelatedTicketIds(tickets, edges);

  assertMapSize(result, 3, "3-phase edges: all 3 tickets have entries (composite key differentiation)");
  assertContains(result.get("0:1"), '[depends_on] P1-1', 'phase0 ticket → P1-1 (depends_on)');
  assertContains(result.get("1:1"), '[depends_on] P0-1', 'phase1 ticket has dependent from P0-1 +');
  assertContains(result.get("1:1"), '[implements] P2-1', 'phase1 ticket → P2-1 (implements)');
  assertContains(result.get("2:1"), 'P1-1', 'phase2 ticket has dependent from P1-1');
}

// ============================================================
// Test runner
// ============================================================

function runAllTests() {
  console.log('=== generate-related-ticket-ids.test.cjs ===');
  console.log('Started at: ' + new Date().toISOString());

  const tests = [
    testReverseMap,
    testSingleEdgeCrossTicket,
    testSelfReferenceGuard,
    testMultipleEdges,
    testAllEdgeTypes,
    testUnrelatedEdge,
    testEmptyInputs,
    testIdempotentAfterRename,
    testDirectionAccuracy,
    testEdgeMissingFields,
    testCrossPhaseTickets,
  ];

  for (const testFn of tests) {
    try {
      testFn();
    } catch (e) {
      failedCount++;
      console.error('  ❌ CRASH: ' + e.message);
      failures.push('[CRASH] ' + testFn.name + ': ' + e.message);
    }
  }

  const total = passedCount + failedCount;
  console.log('\n=== Result: ' + passedCount + '/' + total + ' PASS ===');

  if (failedCount > 0) {
    console.error('\nFailed tests:');
    for (const f of failures) {
      console.error('  ' + f);
    }
    process.exit(1);
  }
}

runAllTests();
