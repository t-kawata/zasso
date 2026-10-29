const { test } = require('node:test');
const assert = require('node:assert/strict');

const { verifySequenceSteps } = require('../../.claude/scripts/tickets/add-tickets-for-phase.js');
const { mergeContracts, verifyMergedBoundaryContracts } = require('../../.claude/scripts/tickets/merge-contracts-to-tickets.js');
const { verifyClosure } = require('../../.claude/scripts/tickets/verify-ticket-closure.js');
const {
  boundaryClauseDigest,
  boundaryContractProjection,
} = require('../../.claude/scripts/sequences-slice/lib/boundary-contract.mjs');

const REGISTRY = [{
  boundary_id: 'boundary-001',
  provider_package: 'pkg-0001',
  consumer_package: 'pkg-0002',
  clauses: {
    preconditions: ['identity present'],
    postconditions: ['order_id derived'],
    invariants: ['one active order_id'],
  },
}];

// [::TICKET::] PX-312, PX-313 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function graphFixture() {
  return {
    nodes: [
      { id: 'N0001', unitIds: ['op-ProduceFact'] },
      { id: 'N0002', unitIds: ['ctr-boundary-001'] },
    ],
    edges: [{
      from: 'N0002',
      to: 'N0001',
      type: 'depends_on',
      attributes: { strength: 'hard', bidirectional: false },
      contracts: [boundaryContractProjection(REGISTRY[0], 'C900')],
    }],
  };
}

// [::TICKET::] PX-320 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-320 --for-spec --no-implementation-order`.
// [::TICKET::] PX-312, PX-313 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
// [::TICKET::] PX-326 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-326 --for-spec --no-implementation-order`.
function ticketFixture() {
  return [{
    id: 1,
    nodeIds: ['N0002', 'ctr-boundary-001'],
    distribution: {
      units: [{ unitId: 'ctr-boundary-001', obligation: { mode: 'obligation' } }],
    },
    contracts: [],
  }];
}

test('an obligation-only sequence step is SEQUENCE_STEPS_UNDISTRIBUTED', () => {
  const view = {
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [{ unitId: 'seq-A-1', kind: 'sequence', subject: 'A-1', relation: 'assigns' }],
  };
  const artifact = {
    sequences: [{ id: 'A-1', outcome: 'singleStep' }],
    steps: [{ id: 'A-1__1', sequence: 'A-1', operation: 'ProduceFact', order: 1, line: 1 }],
  };
  const findings = verifySequenceSteps({ tickets: [] }, view, { nodes: [{ id: 'N0001', unitIds: ['op-ProduceFact'] }] }, artifact);
  assert.ok(findings.some((finding) => finding.code === 'SEQUENCE_STEPS_UNDISTRIBUTED' && finding.stepId === 'A-1__1'));
});

test('a step-bearing owned sequence is not reported', () => {
  const view = {
    ownedSequenceUnits: [{ unitId: 'seq-A-1', sequenceId: 'A-1', steps: [{ order: 0, stepId: 'A-1__1', operationId: 'ProduceFact' }] }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
  const artifact = {
    sequences: [{ id: 'A-1', outcome: 'singleStep' }],
    steps: [{ id: 'A-1__1', sequence: 'A-1', operation: 'ProduceFact', order: 1, line: 1 }],
  };
  const tickets = [{
    id: 1,
    distribution: { units: [{ unitId: 'seq-A-1', obligation: { mode: 'steps', steps: [{ order: 0, stepId: 'A-1__1', operationId: 'ProduceFact' }] } }] },
  }];
  const findings = verifySequenceSteps({ tickets }, view, { nodes: [{ id: 'N0001', unitIds: ['op-ProduceFact'] }] }, artifact);
  assert.deepEqual(findings.filter((finding) => finding.code === 'SEQUENCE_STEPS_UNDISTRIBUTED'), []);
});

test('mergeContracts adds the registry contract with boundaryId and clauseDigest', () => {
  const tickets = mergeContracts(ticketFixture(), graphFixture(), REGISTRY);
  const contract = tickets[0].contracts.find((entry) => entry.boundaryId === 'boundary-001');
  assert.ok(contract, 'the registry contract is present');
  assert.equal(contract.registryContractId, 'contract-boundary-001');
  assert.equal(contract.sourceEdge, 'boundary:boundary-001');
  assert.equal(contract.clauseDigest, boundaryClauseDigest(REGISTRY[0]));
  assert.equal(contract.precondition, 'identity present');
  assert.deepEqual(contract.clauses, REGISTRY[0].clauses);
});

test('a ticket carrying a ctr unit without the registry contract is a closure finding', () => {
  const result = verifyClosure(ticketFixture(), graphFixture(), { registryContracts: REGISTRY });
  assert.ok(result.errors.some((error) => error.code === 'MISSING_BOUNDARY_CONTRACT'));
});

test('a ticket with the merged registry contract closes the boundary chain', () => {
  const tickets = mergeContracts(ticketFixture(), graphFixture(), REGISTRY);
  const result = verifyClosure(tickets, graphFixture(), { registryContracts: REGISTRY });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('a changed ticket clause digest is BOUNDARY_CONTRACT_MISMATCH', () => {
  const tickets = mergeContracts(ticketFixture(), graphFixture(), REGISTRY);
  const registryContract = tickets[0].contracts.find((entry) => entry.registryContractId === 'contract-boundary-001');
  registryContract.clauseDigest = '0'.repeat(64);
  const result = verifyClosure(tickets, graphFixture(), { registryContracts: REGISTRY });
  assert.ok(result.errors.some((error) => error.code === 'BOUNDARY_CONTRACT_MISMATCH'));
});
