// PX-343 @verifies C004
// A graph node is indivisible across tickets. The work-budget gate must name an
// infeasible budget once instead of demanding more tickets than the phase has nodes or
// repeating an impossible over-budget/irreducible pair for the same node.
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  WORKLOAD_CODES,
  feasibilityOf,
  validateTicketWorkload,
} = require('../../.claude/scripts/tickets/lib/ticket-workload.js');

const BUDGET = { operations: 8, sequenceSteps: 8, contracts: 2, files: 10, kinds: 4 };

// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function heavyNodeContext() {
  const contractUnits = Array.from({ length: 10 }, (_, index) => `ctr-boundary-${String(index + 1).padStart(3, '0')}`);
  return {
    graph: {
      nodes: [
        { id: 'N0001', kind: 'api_contract', unitIds: contractUnits },
        { id: 'N0002', kind: 'requirement', unitIds: [] },
        { id: 'N0003', kind: 'data_model', unitIds: [] },
      ],
    },
    view: { packageId: 'alpha', ownedOperationUnits: [], ownedSequenceUnits: [], crossBoundarySequenceUnits: [], obligationUnits: [] },
    dirsTree: { distribution: { units: {} } },
    nodeToFileMap: {},
  };
}

// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-343) --for-spec --no-implementation-order`.
function phase() {
  return {
    id: 0,
    nodeIds: ['N0001', 'N0002', 'N0003'],
    tickets: [
      { id: 1, phaseId: 0, nodeIds: ['N0001'], default_files: [], splitReason: 'cohesion' },
      { id: 2, phaseId: 0, nodeIds: ['N0002'], default_files: [], splitReason: 'cohesion' },
      { id: 3, phaseId: 0, nodeIds: ['N0003'], default_files: [], splitReason: 'cohesion' },
    ],
  };
}

describe('work-budget feasibility', () => {
  it('reports an irreducible node once and suppresses the duplicate ticket overage', () => {
    const context = heavyNodeContext();
    const findings = validateTicketWorkload(phase(), BUDGET, context);
    assert.ok(findings.some((entry) => entry.code === WORKLOAD_CODES.WORK_BUDGET_INFEASIBLE && entry.nodeId === 'N0001' && entry.component === 'contracts'));
    assert.ok(!findings.some((entry) => entry.code === WORKLOAD_CODES.TICKET_WORK_OVER_BUDGET && entry.component === 'contracts'));
  });

  it('reports MINIMUM_EXCEEDS_NODE_COUNT instead of an impossible ticket minimum', () => {
    const result = feasibilityOf(phase(), BUDGET, heavyNodeContext());
    assert.equal(result.feasible, false);
    assert.equal(result.reason, 'MINIMUM_EXCEEDS_NODE_COUNT');
    assert.ok(result.findings.some((entry) => entry.code === WORKLOAD_CODES.WORK_BUDGET_INFEASIBLE));
    assert.ok(!result.findings.some((entry) => entry.code === WORKLOAD_CODES.TICKET_COUNT_BELOW_WORK_MINIMUM));
  });

  it('reads the budget from configuration instead of hardcoding one', () => {
    const generous = { operations: 8, sequenceSteps: 8, contracts: 10, files: 10, kinds: 4 };
    const result = feasibilityOf(phase(), generous, heavyNodeContext());
    assert.equal(result.feasible, true);
    assert.equal(result.findings.length, 0);
  });
});
