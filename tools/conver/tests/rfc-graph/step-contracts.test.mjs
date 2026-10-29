// PX-318 @verifies C001 C002 C003 C004 C005 C006 C007
// The operation-boundary contract travels from the artifact step through the graph
// sidecar into the ticket and the spec. These tests pin the projection, the binding,
// the renderer, the closure rule and the cross-boundary unit name.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  projectStepContracts,
  verifyStepContracts,
  stepContractEntry,
} from '../../.claude/scripts/rfc-graph/lib/step-contracts.mjs';
import { mergeContracts } from '../../.claude/scripts/tickets/merge-contracts-to-tickets.js';
import { verifyClosure } from '../../.claude/scripts/tickets/verify-ticket-closure.js';
import { verifySequenceSteps } from '../../.claude/scripts/tickets/add-tickets-for-phase.js';
import { buildTicketMarkdown } from '../../.claude/scripts/tickets/show-ticket-context.js';
import {
  collectTicketDistribution,
  renderTicketDistribution,
} from '../../.claude/scripts/tickets/show-ticket-distribution.js';

const CONTRACT = {
  pre: [{ factId: 'identity', text: 'identity present' }],
  post: [{ factId: 'order', text: 'order_id derived' }],
  invariants: [{ factId: 'active', text: 'one active order_id' }],
};

// [::TICKET::] PX-318 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-318) --for-spec --no-implementation-order`.
function viewWithTwoSteps() {
  return {
    packageId: 'pkg-1',
    ownedOperationUnits: [
      { unitId: 'op-Produce', operationId: 'Produce', roleCandidate: 'implementer' },
      { unitId: 'op-Consume', operationId: 'Consume', roleCandidate: 'implementer' },
    ],
    ownedSequenceUnits: [{
      unitId: 'seq-A-1',
      sequenceId: 'A-1',
      steps: [
        { stepId: 's1', operationId: 'Produce', order: 0, line: 12, quote: 'produce', contract: CONTRACT, contractProse: 'produce' },
        { stepId: 's2', operationId: 'Consume', order: 1, line: 20, quote: 'consume', contract: CONTRACT, contractProse: 'consume' },
      ],
    }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-318 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-318) --for-spec --no-implementation-order`.
function graphWithOperationNodes(notes = true) {
  return {
    nodes: [
      { id: 'N0001', unitIds: ['op-Produce'] },
      { id: 'N0002', unitIds: ['op-Consume'] },
    ],
    edges: [{
      from: 'N0001',
      to: 'N0002',
      type: 'depends_on',
      attributes: { strength: 'hard', bidirectional: false, ...(notes ? { note: 'step:s1;row:0|step:s2;row:1' } : {}) },
      contracts: [{ id: 'C001', precondition: 'identity present', postcondition: 'order_id derived', invariant: 'one active order_id' }],
    }],
  };
}

// [::TICKET::] PX-318 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-318) --for-spec --no-implementation-order`.
function ticketOwningBothNodes() {
  return {
    id: 1,
    phaseId: 0,
    nodeIds: ['N0001', 'N0002', 'op-Produce', 'op-Consume', 'seq-A-1'],
    contracts: [],
    distribution: {
      units: [
        { unitId: 'op-Produce', kind: 'operation', obligation: { mode: 'implement' } },
        { unitId: 'op-Consume', kind: 'operation', obligation: { mode: 'implement' } },
        { unitId: 'seq-A-1', kind: 'sequence', obligation: { mode: 'steps', steps: viewWithTwoSteps().ownedSequenceUnits[0].steps } },
      ],
    },
  };
}

test('C001 the projection writes one sidecar row per step with node ids and a digest', () => {
  const result = projectStepContracts({ view: viewWithTwoSteps(), graph: graphWithOperationNodes() });
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.equal(result.sidecar.steps.length, 2);
  const row = result.sidecar.steps.find((step) => step.stepId === 's1');
  assert.equal(row.sequenceId, 'A-1');
  assert.equal(row.operationId, 'Produce');
  assert.deepEqual(row.nodeIds, ['N0001']);
  assert.match(row.digest, /^[0-9a-f]{64}$/);
  assert.match(result.sidecar.sourceViewDigest, /^[0-9a-f]{64}$/);
});

test('C002 a missing sidecar row is CONTRACT_CHAIN_OPEN', () => {
  const sidecar = { schemaVersion: 1, sourceViewDigest: projectStepContracts({ view: viewWithTwoSteps(), graph: graphWithOperationNodes() }).sidecar.sourceViewDigest, steps: [] };
  const findings = verifyStepContracts({ view: viewWithTwoSteps(), graph: graphWithOperationNodes(), sidecar });
  assert.ok(findings.some((finding) => finding.code === 'CONTRACT_CHAIN_OPEN' && finding.subject === 's1'));
});

test('C002 a graph note naming no row is CONTRACT_CHAIN_OPEN', () => {
  const { sidecar } = projectStepContracts({ view: viewWithTwoSteps(), graph: graphWithOperationNodes() });
  const findings = verifyStepContracts({
    view: viewWithTwoSteps(),
    graph: graphWithOperationNodes(false),
    sidecar,
  });
  assert.ok(findings.some((finding) => finding.code === 'CONTRACT_CHAIN_OPEN'));
});

test('C003 the ticket carries the step contract with provenance', () => {
  const { sidecar } = projectStepContracts({ view: viewWithTwoSteps(), graph: graphWithOperationNodes() });
  const tickets = mergeContracts([ticketOwningBothNodes()], graphWithOperationNodes(), [], sidecar);
  const contract = tickets[0].contracts.find((entry) => entry.stepId === 's1');
  assert.equal(contract.sequenceId, 'A-1');
  assert.equal(contract.sourceStep, 's1');
  assert.equal(contract.precondition, 'identity present');
  assert.equal(contract.postcondition, 'order_id derived');
  assert.equal(contract.contractProse, 'produce');
  assert.match(contract.id, /^C[0-9]{3}$/);
});

test('C004 the spec and distribution report render the step contract', () => {
  const ticket = ticketOwningBothNodes();
  const { sidecar } = projectStepContracts({ view: viewWithTwoSteps(), graph: graphWithOperationNodes() });
  ticket.contracts = sidecar.steps.map((row, index) => stepContractEntry(row, index));
  const tickets = { phases: [{ id: 0, tickets: [ticket] }] };
  const spec = buildTicketMarkdown('PX-1', ticket, tickets, '/tmp', true, false);
  assert.match(spec, /Operation-Boundary Contracts/);
  assert.match(spec, /identity present/);
  assert.match(spec, /order_id derived/);
  assert.match(spec, /produce/);
  const report = renderTicketDistribution(collectTicketDistribution(tickets));
  assert.match(report, /precondition/);
  assert.match(report, /contractProse/);
});

test('C004 the spec exposes the step contract id and its Red annotation', () => {
  // Gate S scans test files for `@verifies <contract id>`. A spec that renders the step
  // contract without its generated C5xx id forces the implementer to open raw
  // Tickets.json, so the id is part of the make deliverable, not an internal detail.
  const ticket = ticketOwningBothNodes();
  const { sidecar } = projectStepContracts({ view: viewWithTwoSteps(), graph: graphWithOperationNodes() });
  ticket.contracts = sidecar.steps.map((row, index) => stepContractEntry(row, index));
  const tickets = { phases: [{ id: 0, tickets: [ticket] }] };
  const spec = buildTicketMarkdown('PX-1', ticket, tickets, '/tmp', true, false);
  for (const contract of ticket.contracts) {
    assert.match(spec, new RegExp(`### ${contract.id} — ${contract.stepId}`));
    assert.match(spec, new RegExp(`@verifies ${contract.id}`));
  }
});

test('C005 a negated postcondition does not satisfy a precondition', () => {
  const source = {
    id: 1,
    phaseId: 0,
    nodeIds: ['N0001'],
    contracts: [{ id: 'C001', sourceEdge: 'N0001→N0002', precondition: 'identity present', postcondition: 'the request is not authenticated', invariant: 'one active order_id' }],
  };
  const target = {
    id: 2,
    phaseId: 0,
    nodeIds: ['N0002'],
    contracts: [{ id: 'C001', sourceEdge: 'N0001→N0002 (inbound)', precondition: 'the request is authenticated', postcondition: 'order_id derived', invariant: 'one active order_id' }],
  };
  const result = verifyClosure([source, target], graphWithOperationNodes(false));
  assert.ok(result.errors.some((error) => error.code === 'INTER_TICKET_CLOSURE_OPEN'));
});

test('C005 identical normalized clauses close the edge', () => {
  const source = {
    id: 1,
    phaseId: 0,
    nodeIds: ['N0001'],
    contracts: [{ id: 'C001', sourceEdge: 'N0001→N0002', precondition: 'identity present', postcondition: 'order_id derived', invariant: 'one active order_id' }],
  };
  const target = {
    id: 2,
    phaseId: 0,
    nodeIds: ['N0002'],
    contracts: [{ id: 'C001', sourceEdge: 'N0001→N0002 (inbound)', precondition: 'order_id derived', postcondition: 'order_id derived', invariant: 'one active order_id' }],
  };
  assert.equal(verifyClosure([source, target], graphWithOperationNodes(false)).valid, true);
});

test('C006 a missing contract on either side is open', () => {
  const source = {
    id: 1,
    phaseId: 0,
    nodeIds: ['N0001'],
    contracts: [{ id: 'C001', sourceEdge: 'N0001→N0002', precondition: 'identity present', postcondition: 'order_id derived', invariant: 'one active order_id' }],
  };
  const target = { id: 2, phaseId: 0, nodeIds: ['N0002'], contracts: [] };
  const result = verifyClosure([source, target], graphWithOperationNodes(false));
  assert.ok(result.errors.some((error) => error.code === 'INTER_TICKET_CLOSURE_OPEN'));
});

test('C007 an xdir obligation-only sequence names the xdir unit', () => {
  const view = {
    ...viewWithTwoSteps(),
    ownedSequenceUnits: [],
    obligationUnits: [{
      unitId: 'xdir-S-cross',
      kind: 'cross-boundary-sequence',
      subject: 'S-cross',
      relation: 'assignment',
    }],
  };
  const artifact = {
    sequences: [{ id: 'S-cross', outcome: 'direct' }],
    steps: [{ id: 's9', sequence: 'S-cross', operation: 'Produce', order: 0, line: 1 }],
  };
  const phase = { id: 0, nodeIds: [], tickets: [] };
  const findings = verifySequenceSteps(phase, view, graphWithOperationNodes(false), artifact);
  const finding = findings.find((entry) => entry.code === 'SEQUENCE_STEPS_UNDISTRIBUTED');
  assert.equal(finding.unitId, 'xdir-S-cross');
});
