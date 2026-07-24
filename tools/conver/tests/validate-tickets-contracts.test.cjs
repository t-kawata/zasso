#!/usr/bin/env node

/**
 * validate-tickets-contracts.test.js — Unit tests for contracts validation in validate-tickets.js
 *
 * Run: node tests/validate-tickets-contracts.test.js
 *
 * Tests the contracts validation logic added to validateTickets().
 * Uses the exported validateTickets function.
 */

const assert = require('assert');
const path = require('path');

// Import validate-tickets.js
const { validateTickets, validateTicketRecord, parseTicketKey } = require('../.claude/scripts/lib/validate-tickets.js');

// ============================================================
// Test runner
// ============================================================

const stats = { passed: 0, failed: 0, total: 0 };

function test(name, fn) {
  stats.total++;
  try {
    fn();
    stats.passed++;
    console.log('  ✅', name);
  } catch (e) {
    stats.failed++;
    console.log('  ❌', name);
    console.error('     ' + e.message);
  }
}

function assertErrors(result, expectedCount, fieldHint) {
  assert.ok(result && Array.isArray(result.errors), 'result.errors must be an array');
  const matching = fieldHint
    ? result.errors.filter(e => e.includes(fieldHint))
    : result.errors;
  assert.strictEqual(matching.length, expectedCount,
    'Expected ' + expectedCount + ' error(s) for "' + fieldHint + '", got ' + matching.length
    + '\nErrors: ' + JSON.stringify(result.errors));
}

// ============================================================
// Test data builders
// ============================================================

function makeValidTicketsBase() {
  return {
    title: 'Test Project',
    metadata: { source: 'test.md', generatedAt: '2026-07-24' },
    phases: [
      {
        id: -1,
        name: 'PX',
        tickets: []
      }
    ]
  };
}

function makeContract(id, srcEdge, pre, post, inv) {
  return { id, sourceEdge: srcEdge, precondition: pre, postcondition: post, invariant: inv };
}

// ============================================================
// Tests
// ============================================================

console.log('\n--- validate-tickets.js contracts validation tests ---\n');

test('passes ticket with valid contracts', () => {
  const data = makeValidTicketsBase();
  data.phases[0].tickets.push({
    id: 1,
    phaseId: -1,
    title: 'Test Ticket',
    status: 'todo',
    contracts: [
      makeContract('C001', 'N1→N2', 'Key loaded', 'Token signed', 'Key in memory only'),
      makeContract('C002', 'N2→N3', 'Token valid', 'Session created', 'Session isolated')
    ]
  });
  const result = validateTickets(data);
  assert.ok(result.valid, 'Expected valid=true, got errors: ' + JSON.stringify(result.errors));
});

test('blocks ticket without contracts field', () => {
  const data = makeValidTicketsBase();
  data.phases[0].tickets.push({
    id: 1,
    phaseId: -1,
    title: 'Test Ticket',
    status: 'todo'
    // no contracts field
  });
  const result = validateTickets(data);
  assert.ok(!result.valid, 'Expected invalid');
  // The contracts field is in required, so schema validation would catch it.
  // Additionally, our added contracts check should fire.
  assertErrors(result, 1, 'contracts');
});

test('blocks ticket with empty contracts array', () => {
  const data = makeValidTicketsBase();
  data.phases[0].tickets.push({
    id: 1,
    phaseId: -1,
    title: 'Test Ticket',
    status: 'todo',
    contracts: []
  });
  const result = validateTickets(data);
  assert.ok(!result.valid, 'Expected invalid');
  assertErrors(result, 1, 'empty');
});

test('blocks contract with empty precondition', () => {
  const data = makeValidTicketsBase();
  data.phases[0].tickets.push({
    id: 1,
    phaseId: -1,
    title: 'Test Ticket',
    status: 'todo',
    contracts: [
      makeContract('C001', 'N1→N2', '', 'Token signed', 'Key in memory only')
    ]
  });
  const result = validateTickets(data);
  assert.ok(!result.valid, 'Expected invalid');
  assertErrors(result, 1, 'precondition');
});

test('blocks contract with missing required fields', () => {
  const data = makeValidTicketsBase();
  data.phases[0].tickets.push({
    id: 1,
    phaseId: -1,
    title: 'Test Ticket',
    status: 'todo',
    contracts: [
      { id: 'C001' }  // missing sourceEdge, precondition, postcondition, invariant
    ]
  });
  const result = validateTickets(data);
  assert.ok(!result.valid, 'Expected invalid');
  // Should report at least 4 missing field errors (sourceEdge, precondition, postcondition, invariant)
  assert.ok(result.errors.length >= 4,
    'Expected at least 4 errors, got ' + result.errors.length
    + '\nErrors: ' + JSON.stringify(result.errors));
});

test('passes ticket with contracts when other fields also valid', () => {
  const data = makeValidTicketsBase();
  data.phases[0].tickets.push({
    id: 1,
    phaseId: -1,
    title: 'Full Ticket',
    status: 'todo',
    contracts: [
      makeContract('C001', 'N1→N2', 'Key loaded', 'Token signed', 'Key in memory only')
    ],
    scope: ['item1'],
    testUnit: ['UT: test'],
    acceptanceCriteria: ['Happy path']
  });
  const result = validateTickets(data);
  assert.ok(result.valid, 'Expected valid=true, got errors: ' + JSON.stringify(result.errors));
});

// ============================================================
// Summary
// ============================================================

console.log('\n===================');
console.log('Total:  ' + stats.total);
console.log('Passed: ' + stats.passed);
console.log('Failed: ' + stats.failed);
console.log('===================');

process.exit(stats.failed > 0 ? 1 : 0);
