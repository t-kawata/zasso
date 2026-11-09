'use strict';
// PX-398 @verifies C003

/**
 * PX-398 — final-test delivery for contracts, operations, axes and acceptance.
 *
 * A plan-time mention is not a final test. Each gate looks for the asset id and
 * its own clause in the same test entry, so a nearby keyword cannot satisfy it.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { findContractDeliveryGaps } = require('../../.claude/scripts/tickets/verify-contract-delivery.js');
const { findOperationDeliveryGaps } = require('../../.claude/scripts/tickets/verify-operation-delivery.js');
const { findAcceptanceGaps } = require('../../.claude/scripts/tickets/verify-acceptance-coverage.js');
const { formulaResultToFindings } = require('../../.claude/scripts/tickets/verify-formula-delivery.js');

/** A ticket skeleton with empty test plans. */
// [::TICKET::] PX-398 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-398 --for-spec --no-implementation-order`.
function ticket(overrides = {}) {
  return {
    id: 1,
    phaseId: -1,
    status: 'made',
    title: 'Fixture',
    contracts: [],
    testUnit: [],
    testIntegration: [],
    testExceptions: [],
    ...overrides,
  };
}

test('C003: an untested operation obligation is reported with the unit and field', () => {
  const subject = ticket({
    testUnit: ['UT: op-A finality done'],
    distribution: {
      units: [{
        unitId: 'op-A',
        kind: 'operation',
        role: 'implementer',
        obligation: { mode: 'implement', finalityPredicate: 'done', rest: 'POST /a' },
      }],
    },
  });

  const findings = findOperationDeliveryGaps(subject, 'PX-1', 'Tickets.json');

  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'OPERATION_OBLIGATION_UNTESTED');
  assert.match(findings[0].asset, /op-A:rest/);
});

test('C003: a delivered operation obligation produces no finding', () => {
  const subject = ticket({
    testUnit: ['UT: op-A finality done', 'IT: op-A POST /a'],
    distribution: {
      units: [{
        unitId: 'op-A',
        kind: 'operation',
        role: 'implementer',
        obligation: { mode: 'implement', finalityPredicate: 'done', rest: 'POST /a' },
      }],
    },
  });

  assert.deepEqual(findOperationDeliveryGaps(subject, 'PX-1', 'Tickets.json'), []);
});

test('C003: an untested sequence axis is reported with the step and axis', () => {
  const subject = ticket({
    testUnit: ['UT: s1 accepts'],
    contracts: [{
      id: 'C500',
      sourceEdge: 'step:s1',
      stepId: 's1',
      sequenceId: 'S',
      operationId: 'op-A',
      precondition: 'p',
      postcondition: 'q',
      invariant: 'r',
      contract: { consumes: [{ text: 'order' }] },
    }],
    distribution: {
      units: [{
        unitId: 'seq-S',
        kind: 'sequence',
        sequenceId: 'S',
        obligation: { mode: 'steps', steps: [{ stepId: 's1', operationId: 'op-A' }] },
      }],
    },
  });

  const findings = findOperationDeliveryGaps(subject, 'PX-1', 'Tickets.json');

  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'SEQUENCE_AXIS_UNTESTED');
  assert.match(findings[0].asset, /s1:consumes/);
});

test('C003: a delivered sequence axis produces no finding', () => {
  const subject = ticket({
    testUnit: ['UT: s1 order accepted'],
    contracts: [{
      id: 'C500',
      sourceEdge: 'step:s1',
      stepId: 's1',
      sequenceId: 'S',
      operationId: 'op-A',
      precondition: 'p',
      postcondition: 'q',
      invariant: 'r',
      contract: { consumes: [{ text: 'order' }] },
    }],
    distribution: {
      units: [{
        unitId: 'seq-S',
        kind: 'sequence',
        sequenceId: 'S',
        obligation: { mode: 'steps', steps: [{ stepId: 's1', operationId: 'op-A' }] },
      }],
    },
  });

  assert.deepEqual(findOperationDeliveryGaps(subject, 'PX-1', 'Tickets.json'), []);
});

test('C003: contract clauses and boundary clauses use their own finding codes', () => {
  const subject = ticket({
    testUnit: ['UT: C001 order exists'],
    contracts: [
      { id: 'C001', sourceEdge: 'N1->N2', precondition: 'order exists', postcondition: 'order saved', invariant: 'no duplicate' },
      { id: 'contract-b1', boundaryId: 'b1', sourceEdge: 'N1->N2', precondition: 'boundary open', postcondition: 'boundary closed', invariant: 'boundary stable' },
    ],
  });

  const findings = findContractDeliveryGaps(subject, 'PX-1', 'Tickets.json');

  assert.ok(findings.some((entry) => entry.code === 'CONTRACT_CLAUSE_UNTESTED' && /C001\/postcondition/.test(entry.asset)));
  assert.ok(findings.some((entry) => entry.code === 'CONTRACT_CLAUSE_UNTESTED' && /C001\/invariant/.test(entry.asset)));
  assert.ok(findings.some((entry) => entry.code === 'BOUNDARY_CLAUSE_UNTESTED' && /contract-b1\/precondition/.test(entry.asset)));
  assert.ok(findings.every((entry) => entry.fixes.length > 0));
});

test('C003: a justified testException covers a clause no test names', () => {
  const subject = ticket({
    contracts: [{
      id: 'C001',
      sourceEdge: 'N1->N2',
      precondition: 'order exists',
      postcondition: 'order saved',
      invariant: 'no duplicate',
    }],
    testExceptions: ['C001 cannot test: external payment provider is unreachable; not a design defect'],
  });

  assert.deepEqual(findContractDeliveryGaps(subject, 'PX-1', 'Tickets.json'), []);
});

test('C003: an acceptance criterion is reported unless a test names it', () => {
  const subject = ticket({
    acceptanceCriteria: ['Happy path: order is saved exactly once'],
  });

  const findings = findAcceptanceGaps(subject, 'PX-1', 'Tickets.json');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, 'ACCEPTANCE_CRITERIA_UNTESTED');

  subject.testUnit = ['UT: order is saved exactly once'];
  assert.deepEqual(findAcceptanceGaps(subject, 'PX-1', 'Tickets.json'), []);
});

test('C003: the formula report maps the existing dry-run findings to gate findings', () => {
  const result = {
    ok: false,
    findings: [
      { code: 'IMPLEMENTATION_SYMBOL_MISSING', subject: 'F1', message: 'the formula names no implementation symbol' },
      { code: 'TEST_OBLIGATION_MISSING', subject: 'F1', message: 'the formula names no verification test' },
    ],
  };

  const findings = formulaResultToFindings(result, { ticketKey: 'PX-1', rerun: 'node verify-formula-delivery.js' });

  assert.deepEqual(findings.map((entry) => entry.code), [
    'IMPLEMENTATION_SYMBOL_MISSING',
    'TEST_OBLIGATION_MISSING',
  ]);
  assert.ok(findings.every((entry) => entry.fixes.length > 0));
  assert.ok(findings.every((entry) => entry.asset.includes('F1')));
  assert.deepEqual(formulaResultToFindings({ ok: true, findings: [] }, { ticketKey: 'PX-1', rerun: 'r' }), []);
});
