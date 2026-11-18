'use strict';

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-443 --for-spec --no-implementation-order`.
/**
 * PX-443 C003/C004 — the plan gate refuses evidence tickets, unmeasured tickets,
 * non-minimal sets and lost obligations.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { verifyOmissionPlan } = require('../../.claude/scripts/tickets/lib/omission-plan-gate.js');

const CLAUSE = 'clause|pkg-alpha|C001|precondition|0123456789abcdef';
const BUDGET = Object.freeze({
  operations: 8,
  sequenceSteps: 8,
  ownedContracts: 4,
  files: 15,
  testUnit: 18,
  testIntegration: 6,
  modules: 4,
});
const COMPONENTS = Object.freeze(['operations', 'sequenceSteps', 'ownedContracts', 'files', 'testUnit', 'testIntegration', 'modules']);

/** One omission ticket that covers the fixture clause. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function ticket(overrides = {}) {
  return {
    id: 1,
    phaseId: 2,
    status: 'todo',
    nodeIds: [],
    testUnit: ['omission-test:' + CLAUSE],
    testIntegration: [],
    contracts: [{ id: 'C001', sourceEdge: 'N0001->N0002', precondition: 'a', postcondition: 'b', invariant: 'c' }],
    omissionUnitKey: 'omission-unit:aaaa',
    omissionUnitKeys: ['omission-unit:aaaa'],
    omissionStableKeys: ['pkg-alpha|C001'],
    omissionUnits: [{
      group: 'pkg-alpha|C001',
      contractId: 'C001',
      blockingClass: 'test-missing',
      clauses: [CLAUSE],
      rootTicketKey: 'P1-1',
    }],
    origin: { kind: 'omission', sourceTicket: 'P1-1' },
    ...overrides,
  };
}

/** The measured artifacts the gate reads. */
// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function artifacts(overrides = {}) {
  return {
    inventory: { clauses: [{ key: CLAUSE, contractId: 'C001', element: 'precondition', text: 'a' }] },
    coverage: { clauses: [{ key: CLAUSE, status: 'TEST_MISSING' }] },
    budget: BUDGET,
    components: COMPONENTS,
    context: {},
    mergeStatusPolicy: 'todo',
    ...overrides,
  };
}

// [::TICKET::] PX-443 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-443 --for-spec --no-implementation-order`.
function verify({ candidate = { phases: [{ id: 2, tickets: [ticket()] }] }, addedKeys = ['P2-1'], before = { phases: [] }, art = artifacts() } = {}) {
  return verifyOmissionPlan({ before, candidate, addedKeys, artifacts: art });
}

test('C003/C004: a complete, minimal, measured plan passes', () => {
  assert.equal(verify().ok, true);
});

test('C003: a ticket without omissionUnits is an evidence ticket', () => {
  const result = verify({ candidate: { phases: [{ id: 2, tickets: [ticket({ omissionUnits: [] })] }] } });
  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'OMISSION_EVIDENCE_TICKET'), true);
});

test('C003: a ticket without measured work is refused', () => {
  const result = verify({ candidate: { phases: [{ id: 2, tickets: [ticket({ testUnit: [] })] }] } });
  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'OMISSION_TICKET_UNMEASURED'), true);
});

test('C003: a ticket with contracts but no test work is unmeasured', () => {
  const result = verify({
    candidate: { phases: [{ id: 2, tickets: [ticket({ testUnit: [], testIntegration: [] })] }] },
    art: artifacts({ components: [...COMPONENTS, 'contractCount'] }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'OMISSION_TICKET_UNMEASURED'), true);
});

test('C003: an omission ticket that declares node ownership is refused', () => {
  const result = verify({ candidate: { phases: [{ id: 2, tickets: [ticket({ nodeIds: ['N0001'] })] }] } });
  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'OMISSION_OWNERSHIP_DECLARED'), true);
});

test('C003: an empty contracts array is a schema defect', () => {
  const result = verify({ candidate: { phases: [{ id: 2, tickets: [ticket({ contracts: [] })] }] } });
  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'OMISSION_TICKET_SCHEMA_INVALID'), true);
});

test('C004: an unassigned clause with no fallback sink is a lost obligation', () => {
  const result = verify({
    art: artifacts({ coverage: { clauses: [{ key: CLAUSE, status: 'TEST_MISSING' }, { key: 'clause|pkg-alpha|C002|precondition|0123456789abcdee', status: 'TEST_MISSING' }] } }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'OMISSION_OBLIGATION_LOST'), true);
});

test('C004: an unassigned clause with a proof sink is conserved', () => {
  const result = verify({
    art: artifacts({
      coverage: { clauses: [{ key: CLAUSE, status: 'TEST_MISSING' }, { key: 'clause|pkg-alpha|C002|precondition|0123456789abcdee', status: 'CLAUSE_PROOF_STALE' }] },
      repairs: { records: [{ repairKey: 'sha256:x', status: 'pending' }] },
    }),
  });
  assert.equal(result.ok, true);
});

test('C004: an unassigned UNMAPPED clause is a lost obligation', () => {
  const other = 'clause|pkg-alpha|C002|precondition|0123456789abcdee';
  const result = verify({
    candidate: { phases: [] },
    addedKeys: [],
    art: artifacts({ coverage: { clauses: [{ key: other, status: 'UNMAPPED' }] } }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'OMISSION_OBLIGATION_LOST'), true);
});

test('C004: a non-empty repair ledger does not conserve an unassigned implementation clause', () => {
  const result = verify({
    art: artifacts({
      coverage: { clauses: [{ key: CLAUSE, status: 'TEST_MISSING' }, { key: 'clause|pkg-alpha|C002|precondition|0123456789abcdee', status: 'TEST_MISSING' }] },
      repairs: { records: [{ repairKey: 'sha256:x', status: 'pending' }] },
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'OMISSION_OBLIGATION_LOST'), true);
});

test('C003: a non-minimal phase is refused', () => {
  const candidate = { phases: [{ id: 2, tickets: [ticket({ id: 1 }), ticket({ id: 2, omissionUnitKeys: ['omission-unit:bbbb'] })] }] };
  const result = verify({ candidate, addedKeys: ['P2-1', 'P2-2'], art: artifacts({ coverage: { clauses: [{ key: CLAUSE, status: 'TEST_MISSING' }] } }) });
  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'OMISSION_SET_NOT_MINIMAL'), true);
});

test('C003: an open ticket with the same unit key makes the addition a duplicate', () => {
  const before = { phases: [{ id: 1, tickets: [ticket({ id: 1, phaseId: 1, omissionUnitKeys: ['omission-unit:aaaa'] })] }] };
  const result = verify({ before });
  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'OMISSION_DUPLICATE_UNIT'), true);
});

test('C002: a repair class inside a ticket is refused', () => {
  const broken = ticket();
  broken.omissionUnits = [{ ...broken.omissionUnits[0], blockingClass: 'proof-missing' }];
  const result = verify({ candidate: { phases: [{ id: 2, tickets: [broken] }] } });
  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.code === 'OMISSION_REPAIR_TICKETIZED'), true);
});
