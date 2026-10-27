#!/usr/bin/env node
// PX-330 @verifies C007
// @verifies C005 — Gate M rejects empty contracts
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { verifyMakeContracts } = require('../.claude/scripts/tickets/verify-make-contracts.js');

// [::TICKET::] PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-71 --for-spec --no-implementation-order`.
function makeTicket(id, contracts, testUnit, testExceptions) {
  return {
    id,
    phaseId: 0,
    title: `T${id}`,
    status: 'todo',
    contracts: contracts || [],
    testUnit: testUnit || [],
    testExceptions: testExceptions || [],
  };
}

// [::TICKET::] PX-71 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-71 --for-spec --no-implementation-order`.
function contract(id, precondition, postcondition, invariant) {
  return {
    id,
    sourceEdge: 'N1→N2',
    precondition,
    postcondition,
    invariant,
  };
}

test('passes when all contracts are covered in testUnit', () => {
  const ticket = makeTicket(1, [contract('C001', 'key loaded', 'token signed', 'mem clean')],
    ['UT: [Normal] key loaded → token signed (mem clean)']);
  assert.deepEqual(verifyMakeContracts(ticket), []);
});

test('accepts a clause planned only in testIntegration', () => {
  const ticket = makeTicket(1, [contract('C001', 'key loaded', 'token signed', 'mem clean')], []);
  ticket.testIntegration = ['IT: key loaded → token signed (mem clean)'];
  assert.deepEqual(verifyMakeContracts(ticket), []);
});

test('still rejects a clause planned in neither test field', () => {
  const ticket = makeTicket(1, [contract('C001', 'prerequisite_x', 'result_y', 'state_z')], []);
  ticket.testIntegration = ['IT: unrelated behaviour'];
  const errors = verifyMakeContracts(ticket);
  assert.ok(errors.some((entry) => entry.detail && entry.detail.includes('precondition')));
});

test('blocks a missing precondition in testUnit', () => {
  const ticket = makeTicket(1, [contract('C001', 'prerequisite_x', 'result_y', 'state_z')],
    ['UT: result_y test']);
  const errors = verifyMakeContracts(ticket);
  assert.ok(errors.some((entry) => entry.detail && entry.detail.includes('precondition')));
});

test('blocks a missing postcondition in testUnit', () => {
  const ticket = makeTicket(1, [contract('C001', 'pre_a', 'post_b', 'inv_c')],
    ['UT: pre_a setup test']);
  const errors = verifyMakeContracts(ticket);
  assert.ok(errors.some((entry) => entry.detail && entry.detail.includes('postcondition')));
});

test('detects an insufficient testExceptions justification', () => {
  const ticket = makeTicket(
    1,
    [contract('C001', 'key loaded', 'token signed', 'mem clean')],
    ['UT: key loaded ut'],
    ['Some item cannot be tested without justification'],
  );
  const errors = verifyMakeContracts(ticket);
  assert.ok(errors.some((entry) => entry.detail && entry.detail.includes('testException')));
});

test('blocks an empty contracts array (Gate M enforcement)', () => {
  const errors = verifyMakeContracts(makeTicket(1, [], [], []));
  assert.ok(errors.length > 0, 'Expected Gate M to reject empty contracts');
  assert.ok(errors.some(
    (entry) => entry.detail && entry.detail.includes('contracts')
      && (entry.detail.includes('empty') || entry.detail.includes('must')),
  ), `Expected an error about empty contracts, got: ${JSON.stringify(errors)}`);
});

test('names the contract key terms that testUnit must mention (PX-202)', () => {
  const ticket = makeTicket(
    1,
    [contract('C001', 'prerequisite_alpha beta_gamma', 'result_behavior', 'state_invariant')],
    ['UT: result_behavior and state_invariant covered'],
  );
  const errors = verifyMakeContracts(ticket);
  const preconditionError = errors.find((entry) => entry.detail && entry.detail.includes('precondition'));
  assert.ok(preconditionError, 'expected a precondition error');
  assert.ok(Array.isArray(preconditionError.terms) && preconditionError.terms.length > 0,
    'the error must carry the key terms to add');
  assert.ok(preconditionError.terms.some((term) => term.includes('alpha') || term.includes('beta')),
    `terms: ${JSON.stringify(preconditionError.terms)}`);
  assert.ok(preconditionError.detail.includes('key terms'),
    `detail must mention the key terms: ${preconditionError.detail}`);
});

test('handles a missing testUnit field gracefully', () => {
  const ticket = {
    id: 1,
    phaseId: 0,
    title: 'T1',
    status: 'todo',
    contracts: [contract('C001', 'prerequisite_condition', 'result_behavior', 'state_invariant')],
  };
  const errors = verifyMakeContracts(ticket);
  assert.ok(Array.isArray(errors));
  assert.ok(errors.length > 0, 'pre/post/inv are uncovered without testUnit');
});
