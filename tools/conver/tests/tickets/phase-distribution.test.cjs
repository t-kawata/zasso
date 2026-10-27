const { test } = require('node:test');
const assert = require('node:assert/strict');

const { renderPhaseDistribution } = require('../../.claude/scripts/tickets/show-phase-distribution.js');
const { viewDigest, mapDigest } = require('../../.claude/scripts/sequences-slice/lib/distribution-map.mjs');

// [::TICKET::] PX-312, PX-313, PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313|PX-320) --for-spec --no-implementation-order`.
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
  return { phase: { id: 0, name: 'Produce fact', summary: 'fixture phase' }, view, graph, dirsTree, registry, artifact };
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
