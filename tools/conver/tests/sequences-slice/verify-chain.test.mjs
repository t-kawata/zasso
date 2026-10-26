import { test } from 'node:test';
import assert from 'node:assert/strict';

import { viewDigest, mapDigest } from '../../.claude/scripts/sequences-slice/lib/distribution-map.mjs';
import { digestValue } from '../../.claude/scripts/sequences-slice/lib/digest.mjs';
import {
  boundaryClauseDigest,
  boundaryContractProjection,
  boundaryNote,
} from '../../.claude/scripts/sequences-slice/lib/boundary-contract.mjs';
import { verifyChain } from '../../.claude/scripts/sequences-slice/verify-chain.mjs';

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

// [::TICKET::] PX-312, PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313) --for-spec --no-implementation-order`.
function fixture() {
  const view = {
    packageId: 'pkg-0001',
    ownedOperationUnits: [{
      unitId: 'op-ProduceFact',
      operationId: 'ProduceFact',
      ownerPackageIds: ['pkg-0001'],
    }],
    ownedSequenceUnits: [{
      unitId: 'seq-A-1',
      sequenceId: 'A-1',
      ownerPackageIds: ['pkg-0001'],
      steps: [{ order: 1, stepId: 'A-1__ProduceFact', operationId: 'ProduceFact', line: 1 }],
    }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [{
      unitId: 'ctr-boundary-001',
      kind: 'contract',
      subject: 'boundary-001',
      relation: 'carries',
      direction: 'provides',
      counterpart: 'pkg-0002',
    }],
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

  const registryContract = boundaryContractProjection(REGISTRY[0], 'C900');
  const graph = {
    distributionDigest: map.digest,
    nodes: [
      { id: 'N0001', unitIds: ['ctr-boundary-001'] },
      { id: 'N0002', unitIds: ['op-ProduceFact', 'seq-A-1'] },
    ],
    edges: [{
      from: 'N0001',
      to: 'N0002',
      type: 'depends_on',
      attributes: { strength: 'hard', bidirectional: false, note: boundaryNote(REGISTRY[0]) },
      contracts: [registryContract],
    }],
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

  const ticketUnits = [
    { unitId: 'op-ProduceFact', obligation: { mode: 'implement' } },
    { unitId: 'seq-A-1', obligation: { mode: 'steps', steps: [{ order: 1, stepId: 'A-1__ProduceFact', operationId: 'ProduceFact' }] } },
    { unitId: 'ctr-boundary-001', obligation: { mode: 'obligation' } },
  ];
  const ticketDigest = digestValue({
    sourceMapDigest: map.digest,
    sourceViewDigest: map.sourceViewDigest,
    units: ticketUnits,
  });
  const tickets = {
    distribution: {
      sourceMapDigest: map.digest,
      sourceViewDigest: map.sourceViewDigest,
      ticketDigests: { 1: ticketDigest },
      digest: digestValue({ ticketDigests: { 1: ticketDigest } }),
    },
    phases: [{
      id: 0,
      tickets: [{
        id: 1,
        nodeIds: ['N0001', 'N0002'],
        distribution: {
          sourceMapDigest: map.digest,
          sourceViewDigest: map.sourceViewDigest,
          units: ticketUnits,
          digest: ticketDigest,
        },
        contracts: [{
          ...registryContract,
          id: 'contract-boundary-001',
          boundaryId: 'boundary-001',
          registryContractId: 'contract-boundary-001',
          clauseDigest: boundaryClauseDigest(REGISTRY[0]),
        }],
      }],
    }],
  };

  const artifact = {
    sequences: [{ id: 'A-1', outcome: 'singleStep' }],
    steps: [{ id: 'A-1__ProduceFact', sequence: 'A-1', operation: 'ProduceFact', order: 1, line: 1 }],
  };

  return { view, map, graph, dirsTree, tickets, registry: REGISTRY, artifact };
}

test('a consistent chain has no finding', () => {
  const result = verifyChain(fixture());
  assert.deepEqual(result.findings, []);
  assert.equal(result.ok, true);
});

test('a stale sourceViewDigest is STALE_DISTRIBUTION_MAP', () => {
  const input = fixture();
  input.map.sourceViewDigest = '0'.repeat(64);
  input.map.digest = mapDigest(input.map);
  const result = verifyChain(input);
  assert.ok(result.findings.some((finding) => finding.code === 'STALE_DISTRIBUTION_MAP'));
});

test('a view unit missing from the map is UNIT_SET_MISMATCH', () => {
  const input = fixture();
  input.map.units = input.map.units.filter((unit) => unit.unitId !== 'seq-A-1');
  input.map.digest = mapDigest(input.map);
  input.graph.distributionDigest = input.map.digest;
  input.dirsTree.distribution.digest = input.map.digest;
  const result = verifyChain(input);
  assert.ok(result.findings.some((finding) => finding.code === 'UNIT_SET_MISMATCH'));
});

test('a step absent from every step-bearing view record is SEQUENCE_STEPS_UNDISTRIBUTED', () => {
  const input = fixture();
  input.view.ownedSequenceUnits[0].steps = [];
  input.map.sourceViewDigest = viewDigest(input.view);
  input.map.digest = mapDigest(input.map);
  input.graph.distributionDigest = input.map.digest;
  input.dirsTree.distribution.digest = input.map.digest;
  const result = verifyChain(input);
  assert.ok(result.findings.some((finding) => finding.code === 'SEQUENCE_STEPS_UNDISTRIBUTED' && finding.subject === 'A-1__ProduceFact'));
});

test('the same step in two tickets is DUPLICATE_SEQUENCE_STEP', () => {
  const input = fixture();
  input.tickets.phases[0].tickets.push({
    id: 2,
    nodeIds: ['N0002'],
    distribution: {
      sourceMapDigest: input.map.digest,
      sourceViewDigest: input.map.sourceViewDigest,
      units: [{ unitId: 'seq-A-1', obligation: { mode: 'steps', steps: [{ order: 1, stepId: 'A-1__ProduceFact', operationId: 'ProduceFact' }] } }],
      digest: input.tickets.phases[0].tickets[0].distribution.digest,
    },
    contracts: [],
  });
  const result = verifyChain(input);
  assert.ok(result.findings.some((finding) => finding.code === 'DUPLICATE_SEQUENCE_STEP'));
});

test('a registry-divergent edge contract is BOUNDARY_CONTRACT_MISMATCH', () => {
  const input = fixture();
  input.graph.edges[0].contracts[0].precondition = 'tampered';
  const result = verifyChain(input);
  assert.ok(result.findings.some((finding) => finding.code === 'BOUNDARY_CONTRACT_MISMATCH'));
});
