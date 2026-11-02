const { test } = require('node:test');
const assert = require('node:assert/strict');

const { renderPhaseDistribution } = require('../../.claude/scripts/tickets/show-phase-distribution.js');
const { viewDigest, mapDigest } = require('../../.claude/scripts/sequences-slice/lib/distribution-map.mjs');

// [::TICKET::] PX-312, PX-313, PX-320, PX-342 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-312|PX-313|PX-320|PX-342) --for-spec --no-implementation-order`.
function fixture() {
  const view = {
    packageId: 'pkg-0001',
    ownedOperationUnits: [{ unitId: 'op-ProduceFact', operationId: 'ProduceFact', ownerPackageIds: ['pkg-0001'], roleCandidate: 'implementer' }],
    ownedSequenceUnits: [{
      unitId: 'seq-A-1',
      sequenceId: 'A-1',
      ownerPackageIds: ['pkg-0001'],
      steps: [{ order: 0, stepId: 'A-1__ProduceFact', operationId: 'ProduceFact', line: 1 }],
    }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [{ unitId: 'ctr-boundary-001', kind: 'contract', subject: 'boundary-001', direction: 'provides', counterpart: 'pkg-0002' }],
  };
  const map = {
    schemaVersion: 1,
    packageId: 'pkg-0001',
    sourceViewDigest: viewDigest(view),
    units: [
      { unitId: 'op-ProduceFact', kind: 'operation', owners: ['pkg-0001'], sections: ['1.1'], ground: 'fixture' },
      { unitId: 'seq-A-1', kind: 'sequence', owners: ['pkg-0001'], sections: ['1.1'], ground: 'fixture' },
      { unitId: 'ctr-boundary-001', kind: 'contract', owners: ['pkg-0001'], sections: ['1.1'], ground: 'fixture' },
    ],
    residuals: [],
  };
  map.digest = mapDigest(map);
  const graph = {
    distributionDigest: map.digest,
    nodes: [
      { id: 'N0001', unitIds: ['ctr-boundary-001'] },
      { id: 'N0002', unitIds: ['op-ProduceFact', 'seq-A-1'] },
    ],
    edges: [],
  };
  const dirsTree = {
    distribution: {
      digest: map.digest,
      units: {
        'op-ProduceFact': { nodeIds: ['N0002'], paths: ['src/produce.rs'] },
        'seq-A-1': { nodeIds: ['N0002'], paths: ['src/produce.rs'] },
        'ctr-boundary-001': { nodeIds: ['N0001'], paths: ['src/boundary.rs'] },
      },
    },
  };
  const registry = [{
    boundary_id: 'boundary-001',
    provider_package: 'pkg-0001',
    consumer_package: 'pkg-0002',
    clauses: {
      preconditions: ['identity present'],
      postconditions: ['order_id derived'],
      invariants: ['one active order_id'],
    },
  }];
  const artifact = {
    sequences: [{ id: 'A-1', outcome: 'singleStep' }],
    steps: [{ id: 'A-1__ProduceFact', sequence: 'A-1', operation: 'ProduceFact', order: 1, line: 1 }],
  };
  return {
    phase: { id: 0, name: 'Produce fact', summary: 'fixture phase', nodeIds: ['N0001', 'N0002'] },
    view,
    graph,
    dirsTree,
    registry,
    artifact,
  };
}

test('the phase distribution names nodes, units, sequence steps, operations and boundary clauses', () => {
  const text = renderPhaseDistribution(fixture());
  assert.match(text, /Phase P0: Produce fact/);
  assert.match(text, /seq-A-1/);
  assert.match(text, /A-1__ProduceFact/);
  assert.match(text, /op-ProduceFact/);
  assert.match(text, /boundary-001/);
  assert.match(text, /identity present/);
  assert.match(text, /order_id derived/);
  assert.match(text, /one active order_id/);
});

test('the phase distribution states the grouping invariants', () => {
  const text = renderPhaseDistribution(fixture());
  assert.match(text, /Grouping invariants/);
  assert.match(text, /step.*operation.*ticket/i);
  assert.match(text, /registry contract/i);
});

test('the phase distribution prints workload, excluded metadata, feasibility and budget', () => {
// [::TICKET::] PX-347 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-347 --for-spec --no-implementation-order`.
  const text = renderPhaseDistribution({
    ...fixture(),
    budget: {
      operations: 1,
      sequenceSteps: 1,
      ownedContracts: 1,
      files: 2,
      testUnit: 2,
      testIntegration: 1,
      modules: 2,
    },
    budgetSource: 'fixture-budget.json',
    budgetMode: 'v2',
    budgetComponents: [
      'operations', 'sequenceSteps', 'ownedContracts', 'files',
      'testUnit', 'testIntegration', 'modules',
    ],
    budgetExcluded: ['providerBoundaryContracts', 'kinds', 'graphNodes'],
  });
  assert.match(text, /## Workload/);
  assert.match(text, /operations: 1/);
  assert.match(text, /sequenceSteps: 1/);
  assert.match(text, /ownedContracts: 0/);
  assert.match(text, /files: 1/);
  assert.match(text, /## Excluded metadata/);
  assert.match(text, /providerBoundaryContracts: 1/);
  assert.match(text, /graphNodes: 2/);
  assert.match(text, /## One-ticket feasibility/);
  assert.match(text, /oneTicketFits: true/);
  assert.match(text, /## Merge attempts/);
  assert.match(text, /## Budget/);
  assert.match(text, /mode: v2/);
  assert.match(text, /budget source: fixture-budget\.json/);
  assert.match(text, /minimumWorkTickets: 1/);
  assert.match(text, /upperBoundTickets: 1/);
  assert.match(text, /actualTickets: 0/);
  assert.match(text, /splitReason/);
});

test('the phase distribution keeps the v1 legacy components when the budget is v1', () => {
  const text = renderPhaseDistribution({
    ...fixture(),
    budget: { operations: 1, sequenceSteps: 1, contracts: 1, files: 2, kinds: 2 },
    budgetSource: 'legacy-budget.json',
    budgetMode: 'v1',
  });
  assert.match(text, /## Workload/);
  assert.match(text, /contracts: 1/);
  assert.match(text, /files: 2/);
  assert.match(text, /kinds: 0/);
  assert.doesNotMatch(text, /ownedContracts/);
  assert.match(text, /mode: v1/);
  assert.match(text, /minimumWorkTickets: 1/);
});
