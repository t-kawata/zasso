// PX-330 @verifies C001
// A sequence may be split across tickets. The step sidecar is package-wide, so the merge
// must attach a row only to the ticket that owns the operation node the row names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { mergeContracts } = require('../../.claude/scripts/tickets/merge-contracts-to-tickets.js');
const { verifyMakeContracts } = require('../../.claude/scripts/tickets/verify-make-contracts.js');

/** One step-sidecar row: the shape projectStepContracts writes. */
// [::TICKET::] PX-330 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-330 --for-spec --no-implementation-order`.
function stepRow(stepId, operationId, nodeId) {
  return {
    stepId,
    sequenceId: 'S',
    operationId,
    nodeIds: [nodeId],
    contract: {
      pre: [`pre-${stepId}`],
      post: [`post-${stepId}`],
      invariants: [`inv-${stepId}`],
    },
    contractProse: '',
    digest: `digest-${stepId}`,
  };
}

/** One ticket that implements one step of the shared sequence. */
// [::TICKET::] PX-330 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-330 --for-spec --no-implementation-order`.
function ticket(id, nodeId, stepId, operationId) {
  return {
    id,
    phaseId: 0,
    nodeIds: [nodeId],
    contracts: [],
    testUnit: [`UT: pre-${stepId} post-${stepId} inv-${stepId}`],
    testIntegration: [],
    testExceptions: [],
    distribution: {
      units: [{
        unitId: 'seq-S',
        kind: 'sequence',
        sequenceId: 'S',
        obligation: { mode: 'steps', steps: [{ stepId, operationId }] },
      }],
    },
  };
}

test('C001 the merge attaches only the step contract whose operation node the ticket owns', () => {
  const tickets = [ticket(1, 'N1', 's1', 'op1'), ticket(2, 'N2', 's2', 'op2')];
  const graph = { nodes: [{ id: 'N1', unitIds: ['op-op1'] }, { id: 'N2', unitIds: ['op-op2'] }], edges: [] };
  const sidecar = { steps: [stepRow('s1', 'op1', 'N1'), stepRow('s2', 'op2', 'N2')] };

  mergeContracts(tickets, graph, [], sidecar);

  assert.deepEqual(tickets[0].contracts.map((contract) => contract.stepId), ['s1']);
  assert.deepEqual(tickets[1].contracts.map((contract) => contract.stepId), ['s2']);
});

test('C001 each ticket passes the contract gate with its local step coverage', () => {
  const tickets = [ticket(1, 'N1', 's1', 'op1'), ticket(2, 'N2', 's2', 'op2')];
  const graph = { nodes: [{ id: 'N1', unitIds: ['op-op1'] }, { id: 'N2', unitIds: ['op-op2'] }], edges: [] };
  const sidecar = { steps: [stepRow('s1', 'op1', 'N1'), stepRow('s2', 'op2', 'N2')] };

  mergeContracts(tickets, graph, [], sidecar);

  assert.deepEqual(verifyMakeContracts(tickets[0]), []);
  assert.deepEqual(verifyMakeContracts(tickets[1]), []);
});

test('C001 a flow ticket sharing an operation node does not receive the step contract', () => {
  const implementer = ticket(1, 'N1', 's1', 'op1');
  const flowTicket = {
    id: 2,
    phaseId: 0,
    nodeIds: ['N2'],
    contracts: [],
    testUnit: [],
    testIntegration: [],
    testExceptions: [],
    distribution: {
      units: [{
        unitId: 'seq-S',
        kind: 'sequence',
        sequenceId: 'S',
        obligation: { mode: 'flow', outcome: 'realized' },
      }],
    },
  };
  const graph = {
    nodes: [
      { id: 'N1', unitIds: ['op-op1', 'seq-S'] },
      { id: 'N2', unitIds: ['op-op1', 'seq-S'] },
    ],
    edges: [],
  };
  const sidecar = { steps: [stepRow('s1', 'op1', 'N1')] };

  mergeContracts([implementer, flowTicket], graph, [], sidecar);

  assert.deepEqual(implementer.contracts.map((contract) => contract.stepId), ['s1']);
  assert.deepEqual(flowTicket.contracts, []);
});
