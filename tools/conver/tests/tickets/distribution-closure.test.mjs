// PX-322 @verifies C002 C005 C006 C008 C009
// The split stage carries a phase-crossing sequence unit, delivers all seven contract
// axes and the surface coverage, and proves every sidecar row reached a ticket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { buildPackageView } from '../../.claude/scripts/sequences-slice/lib/view.mjs';
import { kindOfUnit, mapDigest, viewDigest } from '../../.claude/scripts/sequences-slice/lib/distribution-map.mjs';
import { digestValue } from '../../.claude/scripts/sequences-slice/lib/digest.mjs';
import { verifyChain } from '../../.claude/scripts/sequences-slice/verify-chain.mjs';
import { stepContractEntry } from '../../.claude/scripts/rfc-graph/lib/step-contracts.mjs';

const require = createRequire(import.meta.url);
const {
  populateTicketDistribution,
  verifyTicketDistribution,
  verifySequenceSteps,
} = require('../../.claude/scripts/tickets/add-tickets-for-phase.js');
const { verifyMergedBoundaryContracts } = require('../../.claude/scripts/tickets/merge-contracts-to-tickets.js');
const { buildTicketMarkdown } = require('../../.claude/scripts/tickets/show-ticket-context.js');
const {
  collectTicketDistribution,
  renderTicketDistribution,
} = require('../../.claude/scripts/tickets/show-ticket-distribution.js');

/** The one-package artifact whose two operations both produce Thing1. */
// [::TICKET::] PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-322 --for-spec --no-implementation-order`.
function onePackageArtifact() {
  return {
    spec: { lines: 10 },
    sequences: [{ id: 'S', outcome: 'direct' }],
    steps: [
      { id: 's1', sequence: 'S', operation: 'A', line: 1, quote: 'a' },
      { id: 's2', sequence: 'S', operation: 'B', line: 2, quote: 'b' },
    ],
    operations: [
      { id: 'A', disposition: 'active', position: 'positioned', result_object_classes: ['Thing1'], grounding: { classification: 'authored' } },
      { id: 'B', disposition: 'active', position: 'positioned', result_object_classes: ['Thing1'], grounding: { classification: 'authored' } },
    ],
  };
}

// [::TICKET::] PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-322 --for-spec --no-implementation-order`.
function onePackageTreeManifest() {
  return {
    inventory: { objects: [{ canonical_name: 'Thing1', owner_package: 'pkg-1' }] },
    structure: { segments: [] },
  };
}

/** The unit ids a view distributes, in view order. */
// [::TICKET::] PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-322 --for-spec --no-implementation-order`.
function viewUnits(view) {
  return ['ownedOperationUnits', 'ownedSequenceUnits', 'crossBoundarySequenceUnits', 'obligationUnits']
    .flatMap((field) => (Array.isArray(view?.[field]) ? view[field] : []));
}

/** The map, graph and aggregate around populated phases. */
// [::TICKET::] PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-322 --for-spec --no-implementation-order`.
function chainAround({ view, graph, phases }) {
  const map = {
    schemaVersion: 1,
    packageId: view.packageId,
    sourceViewDigest: viewDigest(view),
    units: viewUnits(view).map((unit) => ({
      unitId: unit.unitId,
      kind: kindOfUnit(unit.unitId),
      owners: [view.packageId],
      sections: ['1'],
      ground: 'fixture',
    })).sort((left, right) => left.unitId.localeCompare(right.unitId)),
    residuals: [],
  };
  map.digest = mapDigest(map);
  graph.distributionDigest = map.digest;
  const units = {};
  for (const node of graph.nodes ?? []) {
    for (const unitId of node.unitIds ?? []) {
      units[unitId] = { nodeIds: [node.id], paths: [`src/${node.id}.js`] };
    }
  }
  const dirsTree = { distribution: { digest: map.digest, units } };
  const ticketDigests = {};
  for (const phase of phases) {
    for (const ticket of phase.tickets ?? []) {
      const key = phase.id === -1 ? `PX-${ticket.id}` : `P${phase.id}-${ticket.id}`;
      ticketDigests[key] = ticket.distribution.digest;
    }
  }
  const tickets = {
    distribution: {
      sourceMapDigest: map.digest,
      sourceViewDigest: map.sourceViewDigest,
      ticketDigests,
      digest: digestValue({ ticketDigests }),
    },
    phases,
  };
  return { view, map, graph, dirsTree, tickets };
}

test('C002 a phase-crossing sequence unit is accepted', async () => {
  const artifact = onePackageArtifact();
  const treeManifest = onePackageTreeManifest();
  const view = buildPackageView({ artifact, treeManifest, packageSegments: [], obligations: {} }, 'pkg-1');
  const graph = {
    sourceFile: 'RFC.md',
    nodes: [{ id: 'N1', unitIds: ['op-A', 'seq-S'] }, { id: 'N2', unitIds: ['op-B'] }],
    edges: [{ from: 'N1', to: 'N2', type: 'depends_on', attributes: { strength: 'hard' }, contracts: [] }],
  };
  const dirsTree = { distribution: { units: {
    'op-A': { nodeIds: ['N1'], paths: ['src/a.js'] },
    'op-B': { nodeIds: ['N2'], paths: ['src/b.js'] },
    'seq-S': { nodeIds: ['N1'], paths: ['src/a.js'] },
  } } };
  const phase0 = await populateTicketDistribution(
    { id: 0, nodeIds: ['N1'], tickets: [{ id: 1, nodeIds: ['N1'], specPath: 'RFC.md' }] },
    graph, dirsTree, view, null,
  );
  const phase1 = await populateTicketDistribution(
    { id: 1, nodeIds: ['N2'], tickets: [{ id: 1, nodeIds: ['N2'], specPath: 'RFC.md' }] },
    graph, dirsTree, view, null,
  );

  assert.deepEqual(verifyTicketDistribution(phase1, view, graph, dirsTree), []);
  assert.equal(verifySequenceSteps(phase1, view, graph, artifact)
    .some((finding) => finding.code === 'MISSING_SEQUENCE_STEP'), false);
  const seq = phase1.tickets[0].distribution.units.find((unit) => unit.unitId === 'seq-S');
  assert.deepEqual(seq.obligation.steps.map((step) => step.stepId), ['s2']);

  const chain = chainAround({ view, graph, phases: [phase0, phase1] });
  const findings = verifyChain({ ...chain, registry: [], artifact, treeManifest, stage: 'split' }).findings;
  assert.equal(findings.some((finding) => finding.code === 'INVENTED_UNIT'), false, JSON.stringify(findings));
});

test('C005 the spec and report render all seven contract axes', () => {
  const contract = {
    pre: [{ factId: 'p', text: 'PRE-FACT' }],
    post: [{ factId: 'q', text: 'POST-FACT' }],
    invariants: [{ factId: 'i', text: 'INV-FACT' }],
    consumes: ['CONSUMES-FACT'],
    produces: [{ factId: 'r', text: 'PRODUCES-FACT' }],
    errors: ['ERRORS-FACT'],
    crosses: ['CROSSES-FACT'],
  };
  const row = { stepId: 's1', sequenceId: 'S', operationId: 'A', nodeIds: ['N1'], digest: 'd', contractProse: 'prose', contract };
  const step = { stepId: 's1', operationId: 'A', order: 0, contract, contractProse: 'prose' };
  const ticket = {
    id: 1,
    phaseId: 0,
    nodeIds: ['N1'],
    contracts: [stepContractEntry(row, 0)],
    distribution: {
      units: [{ unitId: 'seq-S', kind: 'sequence', obligation: { mode: 'steps', steps: [step] } }],
    },
  };
  const tickets = { phases: [{ id: 0, tickets: [ticket] }] };
  const spec = buildTicketMarkdown('PX-1', ticket, tickets, '/tmp', true, true);
  const report = renderTicketDistribution(collectTicketDistribution(tickets));

  for (const text of ['PRE-FACT', 'POST-FACT', 'INV-FACT', 'CONSUMES-FACT', 'PRODUCES-FACT', 'ERRORS-FACT', 'CROSSES-FACT']) {
    assert.match(spec, new RegExp(text), `${text} missing from spec`);
    assert.match(report, new RegExp(text), `${text} missing from report`);
  }
});

test('C006 obl- coverage reaches the ticket obligation and the spec', async () => {
  const view = {
    packageId: 'pkg-1',
    ownedOperationUnits: [],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [{
      unitId: 'obl-surface-1',
      relation: 'serves',
      subject: 'Surface1',
      coverage: {
        column: 'surface',
        operationSet: 'SurfaceOps',
        carried: 2,
        total: 3,
        uncoveredSpellings: ['Op9'],
        foreignValues: [],
        crossChecked: true,
      },
    }],
  };
  const graph = { sourceFile: 'RFC.md', nodes: [{ id: 'N1', unitIds: ['obl-surface-1'] }], edges: [] };
  const dirsTree = { distribution: { units: { 'obl-surface-1': { nodeIds: ['N1'], paths: ['src/surface.js'] } } } };
  const populated = await populateTicketDistribution(
    { id: 0, nodeIds: ['N1'], tickets: [{ id: 1, nodeIds: ['N1'], specPath: 'RFC.md' }] },
    graph, dirsTree, view, null,
  );
  const unit = populated.tickets[0].distribution.units.find((entry) => entry.unitId === 'obl-surface-1');

  assert.equal(unit.obligation.coverage.operationSet, 'SurfaceOps');
  assert.deepEqual(unit.obligation.coverage.uncoveredSpellings, ['Op9']);

  const spec = buildTicketMarkdown('PX-1', populated.tickets[0], { phases: [populated] }, '/tmp', true, true);
  assert.match(spec, /SurfaceOps/);
  assert.match(spec, /Op9/);
});

test('C008 a sidecar row that reaches no ticket is CONTRACT_CHAIN_OPEN', () => {
  const rowS1 = { stepId: 's1', sequenceId: 'S', operationId: 'A', nodeIds: ['N1'], digest: 'd1', contract: { pre: [], post: [], invariants: [] }, contractProse: 'a' };
  const rowS2 = { stepId: 's2', sequenceId: 'S', operationId: 'B', nodeIds: ['N2'], digest: 'd2', contract: { pre: [], post: [], invariants: [] }, contractProse: 'b' };
  const sidecar = { schemaVersion: 2, sourceViewDigest: 'v', edges: {}, steps: [rowS1, rowS2] };
  const graph = { nodes: [{ id: 'N1', unitIds: ['op-A'] }, { id: 'N2', unitIds: ['op-B'] }], edges: [] };
  const tickets = [{ id: 1, phaseId: 0, nodeIds: ['N1'], contracts: [stepContractEntry(rowS1, 0)] }];

  const findings = verifyMergedBoundaryContracts(tickets, graph, [], sidecar);
  assert.ok(findings.some((finding) => finding.code === 'CONTRACT_CHAIN_OPEN' && finding.stepId === 's2'), JSON.stringify(findings));
});

test('C009 duplicate contract ids and a consumer reference are reported', async () => {
  const row = { stepId: 's1', sequenceId: 'S', operationId: 'A', nodeIds: ['N1'], digest: 'd1', contract: { pre: [], post: [], invariants: [] }, contractProse: 'a' };
  const sidecar = { schemaVersion: 2, sourceViewDigest: 'v', edges: {}, steps: [row] };
  const graph = { nodes: [{ id: 'N1', unitIds: ['op-A'] }], edges: [] };
  const contracts = [stepContractEntry(row, 0), { id: 'C500', sourceEdge: 'N1→N2', precondition: 'p', postcondition: 'q', invariant: 'r' }];
  const duplicate = verifyMergedBoundaryContracts([{ id: 1, phaseId: 0, nodeIds: ['N1'], contracts }], graph, [], sidecar);
  assert.ok(duplicate.some((finding) => finding.code === 'DUPLICATE_CONTRACT_ID' && finding.contractId === 'C500'), JSON.stringify(duplicate));

  const artifact = {
    spec: { lines: 2 },
    sequences: [],
    steps: [],
    operations: [{ id: 'OpX', disposition: 'active', position: 'positioned', result_object_classes: ['Thing1', 'Thing2'], grounding: { classification: 'authored' } }],
  };
  const treeManifest = { inventory: { objects: [
    { canonical_name: 'Thing1', owner_package: 'pkg-1' },
    { canonical_name: 'Thing2', owner_package: 'pkg-2' },
  ] }, structure: { segments: [] } };
  const view = buildPackageView({ artifact, treeManifest, packageSegments: [], obligations: {} }, 'pkg-1');
  const consumerGraph = { sourceFile: 'RFC.md', nodes: [{ id: 'N1', unitIds: ['op-OpX'] }], edges: [] };
  const consumerDirs = { distribution: { units: { 'op-OpX': { nodeIds: ['N1'], paths: ['src/op.js'] } } } };
  const populated = await populateTicketDistribution(
    { id: 0, nodeIds: ['N1'], tickets: [{ id: 1, nodeIds: ['N1'], specPath: 'RFC.md' }] },
    consumerGraph, consumerDirs, view, null,
  );
  const reference = populated.tickets[0].distribution.units.find((unit) => unit.unitId === 'op-OpX');

  assert.deepEqual(reference.obligation.providers, ['pkg-2']);
  assert.match(buildTicketMarkdown('PX-1', populated.tickets[0], { phases: [populated] }, '/tmp', true, true), /pkg-2/);
});
