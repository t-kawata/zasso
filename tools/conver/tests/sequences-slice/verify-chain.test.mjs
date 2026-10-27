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

// [::TICKET::] PX-312, PX-313, PX-317, PX-320 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-312|PX-313|PX-317|PX-320) --for-spec --no-implementation-order`.
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
      steps: [{ order: 0, stepId: 'A-1__ProduceFact', operationId: 'ProduceFact', line: 1 }],
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
      { unitId: 'op-ProduceFact', kind: 'operation', role: 'implementer', owners: ['pkg-0001'], sections: ['1.1'], ground: 'fixture' },
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
    { unitId: 'op-ProduceFact', kind: 'operation', obligation: { mode: 'implement' } },
    { unitId: 'seq-A-1', kind: 'sequence', obligation: { mode: 'steps', steps: [{ order: 0, stepId: 'A-1__ProduceFact', operationId: 'ProduceFact', line: 1 }] } },
    { unitId: 'ctr-boundary-001', kind: 'contract', obligation: { mode: 'obligation' } },
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
    operations: [{ id: 'ProduceFact', disposition: 'active', result_object_classes: ['Thing'] }],
    sequences: [{ id: 'A-1', outcome: 'singleStep' }],
    steps: [{ id: 'A-1__ProduceFact', sequence: 'A-1', operation: 'ProduceFact', order: 1, line: 1 }],
  };

  const treeManifest = {
    inventory: {
      objects: [{ canonical_name: 'Thing', owner_package: 'pkg-0001' }],
    },
  };

  return { view, map, graph, dirsTree, tickets, registry: REGISTRY, artifact, treeManifest };
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
      units: [{ unitId: 'seq-A-1', obligation: { mode: 'steps', steps: [{ order: 0, stepId: 'A-1__ProduceFact', operationId: 'ProduceFact' }] } }],
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

/** Rebind the map, graph, Dirs-Tree and ticket source digests after a view mutation. */
// [::TICKET::] PX-317 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-317) --for-spec --no-implementation-order`.
function rebindViewAndMap(input) {
  input.map.sourceViewDigest = viewDigest(input.view);
  input.map.digest = mapDigest(input.map);
  input.graph.distributionDigest = input.map.digest;
  input.dirsTree.distribution.digest = input.map.digest;
  for (const ticket of input.tickets.phases.flatMap((phase) => phase.tickets)) {
    if (ticket.distribution === undefined) continue;
    ticket.distribution.sourceMapDigest = input.map.digest;
    ticket.distribution.sourceViewDigest = input.map.sourceViewDigest;
  }
}

/** Recompute one ticket's distribution digest and the aggregate after a ticket mutation. */
// [::TICKET::] PX-317 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-317) --for-spec --no-implementation-order`.
function rebindTicketDigest(input) {
  const ticket = input.tickets.phases[0].tickets[0];
  ticket.distribution.digest = digestValue({
    sourceMapDigest: ticket.distribution.sourceMapDigest,
    sourceViewDigest: ticket.distribution.sourceViewDigest,
    units: ticket.distribution.units,
  });
  const ticketDigests = Object.fromEntries(
    input.tickets.phases.flatMap((phase) => phase.tickets)
      .map((entry) => [entry.id, entry.distribution.digest]),
  );
  input.tickets.distribution.ticketDigests = ticketDigests;
  input.tickets.distribution.digest = digestValue({ ticketDigests });
}

test('an active operation absent from the view is MISSING_OPERATION', () => {
  const input = fixture();
  input.artifact.operations.push({
    id: 'Dropped',
    disposition: 'active',
    result_object_classes: ['Thing'],
  });
  const result = verifyChain(input);
  assert.ok(result.findings.some((finding) =>
    finding.code === 'MISSING_OPERATION' && finding.subject === 'op-Dropped'));
});

test('a sequence absent from the view is MISSING_SEQUENCE', () => {
  const input = fixture();
  input.artifact.sequences.push({ id: 'S-dropped', outcome: 'direct' });
  input.artifact.steps.push({
    id: 'S-dropped__ProduceFact',
    sequence: 'S-dropped',
    operation: 'ProduceFact',
    order: 0,
    line: 1,
  });
  const result = verifyChain(input);
  assert.ok(result.findings.some((finding) =>
    finding.code === 'MISSING_SEQUENCE' && finding.subject === 'seq-S-dropped'));
});

test('an active operation with no implementing ticket is MISSING_IMPLEMENTER', () => {
  const input = fixture();
  input.tickets.phases[0].tickets[0].distribution.units =
    input.tickets.phases[0].tickets[0].distribution.units.map((unit) =>
      unit.unitId === 'op-ProduceFact' ? { ...unit, obligation: { mode: 'reference' } } : unit);
  rebindTicketDigest(input);
  const result = verifyChain(input);
  assert.ok(result.findings.some((finding) =>
    finding.code === 'MISSING_IMPLEMENTER' && finding.subject === 'op-ProduceFact'));
});

test('a view step whose operationId differs from the artifact is STEP_IDENTITY_MISMATCH', () => {
  const input = fixture();
  const step = input.view.ownedSequenceUnits[0].steps[0];
  input.view.ownedSequenceUnits[0].steps[0] = { ...step, operationId: 'OtherOperation' };
  rebindViewAndMap(input);
  rebindTicketDigest(input);
  const result = verifyChain(input);
  assert.ok(result.findings.some((finding) =>
    finding.code === 'STEP_IDENTITY_MISMATCH' && finding.subject === 'A-1__ProduceFact'));
});

test('a view step whose line or subject differs is STEP_IDENTITY_MISMATCH', () => {
  const input = fixture();
  const step = input.view.ownedSequenceUnits[0].steps[0];
  input.view.ownedSequenceUnits[0].steps[0] = { ...step, line: 99, subject: 'different subject' };
  rebindViewAndMap(input);
  rebindTicketDigest(input);
  const result = verifyChain(input);
  assert.ok(result.findings.some((finding) => finding.code === 'STEP_IDENTITY_MISMATCH'));
});

test('a suppliedRule designer_supplied zero-step residual is accepted', () => {
  const input = fixture();
  input.artifact.operations = [{
    id: 'Dropped',
    disposition: 'active',
    position: 'suppliedRule',
    grounding: { classification: 'designer_supplied' },
    result_object_classes: ['Thing'],
  }];
  input.artifact.steps = input.artifact.steps.filter((step) => step.operation !== 'Dropped');
  rebindViewAndMap(input);

  assert.ok(verifyChain(input).findings.some((finding) =>
    finding.code === 'MISSING_OPERATION' && finding.subject === 'op-Dropped'));

  input.map.residuals = [{ unit: 'op-Dropped', kind: 'declared-residual', ground: 'reserved by design' }];
  rebindViewAndMap(input);
  assert.equal(verifyChain(input).findings.some((finding) =>
    finding.code === 'MISSING_OPERATION'), false);
});

test('an active residual with a step is ACTIVE_OPERATION_RESIDUAL', () => {
  const input = fixture();
  input.artifact.operations = [{
    id: 'Dropped',
    disposition: 'active',
    position: 'suppliedRule',
    grounding: { classification: 'designer_supplied' },
    result_object_classes: ['Thing'],
  }];
  input.artifact.steps = [{ id: 'S__Dropped', sequence: 'A-1', operation: 'Dropped', order: 0, line: 1 }];
  input.map.residuals = [{ unit: 'op-Dropped', kind: 'declared-residual', ground: 'reserved by design' }];
  rebindViewAndMap(input);
  const result = verifyChain(input);
  assert.ok(result.findings.some((finding) => finding.code === 'ACTIVE_OPERATION_RESIDUAL'));
});
