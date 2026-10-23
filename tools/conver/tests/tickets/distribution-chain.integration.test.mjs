// PX-307 @verifies C003 C004 C005
// The synthetic package is the end-to-end fixture: one RFC, one view, one graph, one
// Dirs-Tree and one Tickets document. It runs the four mechanical stages in order and
// then seeds the negatives one at a time.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderDistribution } from '../../.claude/scripts/grill-me-for-rfc/render-distribution.mjs';
import { readDistributionMap, assignUnitIdsFromMap } from '../../.claude/scripts/rfc-graph/lib/unit-ids.mjs';
import { buildDistributionIndex, collectNodePaths, verifyDistributionCoverage } from '../../.claude/scripts/rfc-graph/lib/distribution-index.js';
import {
  populateTicketDistribution,
  reconstructSequenceOrder,
  verifyTicketDistribution,
} from '../../.claude/scripts/tickets/add-tickets-for-phase.js';
import { verifyDigestChain } from '../../.claude/scripts/tickets/verify-all-ticket-coverage.js';
import { digestValue } from '../../.claude/scripts/sequences-slice/lib/digest.mjs';

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureView() {
  return {
    packageId: 'pkg-1',
    ownedOperationUnits: [
      { unitId: 'op-Produce', operationId: 'Produce', roleCandidate: 'implementer', obligation: { purpose: 'produce', specLines: [12] } },
      { unitId: 'op-Consume', operationId: 'Consume', roleCandidate: 'implementer', obligation: { purpose: 'consume', specLines: [20] } },
    ],
    ownedSequenceUnits: [{
      unitId: 'seq-A-1',
      sequenceId: 'A-1',
      outcome: 'direct',
      steps: [
        { stepId: 's1', operationId: 'Produce', order: 0, line: 12, quote: 'produce', contract: { pre: [], post: [] } },
        { stepId: 's2', operationId: 'Consume', order: 1, line: 20, quote: 'consume', contract: { pre: [], post: [] } },
      ],
    }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureRfc() {
  return [
    '# Package RFC',
    '',
    '## 3.1 Produce',
    '',
    'The operation is designed here.',
    '',
    '## 3.2 Consume',
    '',
    'The consumer side.',
    '',
    '## 3.3 boundary-001',
    '',
    'The boundary is designed here.',
    '',
    '## Distribution ledger',
    '',
    'RFC.md is canonical for this package; the projection is an input, not an authority.',
    '',
    '| Unit | Kind | Owner | RFC location | Ground |',
    '|---|---|---|---|---|',
    '| op-Produce | operation | pkg-1 | §3.1 | designed here |',
    '| op-Consume | operation | pkg-1 | §3.2 | consumer designed here |',
    '| seq-A-1 | sequence | pkg-1 | §3.1,§3.2 | flow designed here |',
    '',
  ].join('\n');
}

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureGraph() {
  return {
    sourceFile: 'RFC.md',
    mainLanguage: 'rust',
    nodes: [
      { id: 'N0001', title: 'Produce', kind: 'architecture', summary: 'x', slug: 'produce', headingRefs: [{ refId: 'REF001', heading: 2, texts: ['3.1 Produce'] }] },
      { id: 'N0002', title: 'Consume', kind: 'architecture', summary: 'x', slug: 'consume', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['3.2 Consume'] }] },
      { id: 'N0003', title: 'Boundary', kind: 'api_contract', summary: 'x', slug: 'boundary_001', headingRefs: [{ refId: 'REF003', heading: 2, texts: ['3.3 boundary-001'] }] },
    ],
    edges: [],
  };
}

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureDirsTrees() {
  return {
    rust: {
      name: 'src', type: 'directory', kind: 'root',
      children: [
        { name: 'produce.rs', type: 'file', kind: 'api_contract', mappedNodeIds: [{ nodeId: 'N0001', title: 'Produce' }] },
        { name: 'consume.rs', type: 'file', kind: 'api_contract', mappedNodeIds: [{ nodeId: 'N0002', title: 'Consume' }] },
        { name: 'boundary.rs', type: 'file', kind: 'api_contract', mappedNodeIds: [{ nodeId: 'N0003', title: 'Boundary' }] },
      ],
    },
  };
}

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixturePhase() {
  return {
    id: -1,
    nodeIds: ['op-Produce', 'op-Consume', 'seq-A-1'],
    tickets: [
      { id: 1, phaseId: -1, status: 'todo', title: 'produce', nodeIds: ['N0001'], specPath: 'SPEC.md' },
      { id: 2, phaseId: -1, status: 'todo', title: 'consume', nodeIds: ['N0002'], specPath: 'SPEC.md' },
      { id: 3, phaseId: -1, status: 'todo', title: 'boundary', nodeIds: ['N0003'], specPath: 'SPEC.md' },
    ],
  };
}

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
async function runChain() {
  const rendered = renderDistribution(fixtureRfc(), fixtureView());
  assert.equal(rendered.ok, true, rendered.code);
  const map = readDistributionMap(rendered.rfc);
  assert.notEqual(map, null);
  const attached = assignUnitIdsFromMap(fixtureGraph(), map, rendered.rfc);
  assert.deepEqual(attached.missing, []);
  const nodePaths = collectNodePaths(fixtureDirsTrees());
  const dirsTree = { distribution: buildDistributionIndex(attached.graph, nodePaths, attached.graph.distributionDigest) };
  const phase = await populateTicketDistribution(fixturePhase(), attached.graph, dirsTree, fixtureView());
  return { rendered, map, attached, dirsTree, phase };
}

test('C003 C004 C005 the synthetic package passes every stage', async () => {
  const { map, attached, dirsTree, phase } = await runChain();
  assert.deepEqual(reconstructSequenceOrder(phase.tickets), { 'seq-A-1': ['s1', 's2'] });
  assert.deepEqual(verifyTicketDistribution(phase, fixtureView(), attached.graph, dirsTree), []);
  assert.equal(verifyDistributionCoverage(dirsTree, attached.graph).ok, true);
  const ticketDigests = Object.fromEntries(phase.tickets.map((ticket) => [ticket.id, ticket.distribution.digest]));
  const aggregate = digestValue({ ticketDigests });
  assert.equal(verifyDigestChain({ map, graph: attached.graph, dirs: dirsTree, tickets: { distribution: {
    sourceMapDigest: dirsTree.distribution.digest,
    sourceViewDigest: map.sourceViewDigest,
    ticketDigests,
    digest: aggregate,
  } } }).ok, true);
});

test('C003 a graph unit missing from the layer is reported', async () => {
  const { map } = await runChain();
  const graph = fixtureGraph();
  graph.nodes = graph.nodes.filter((node) => node.id !== 'N0002');
  const result = assignUnitIdsFromMap(graph, map, fixtureRfc());
  assert.deepEqual([...result.missing].sort(), ['op-Consume']);
});

test('C004 a node unit missing from its ticket is reported', async () => {
  const { attached, dirsTree, phase } = await runChain();
  phase.tickets = phase.tickets.filter((ticket) => ticket.id !== 1);
  const findings = verifyTicketDistribution(phase, fixtureView(), attached.graph, dirsTree);
  assert.ok(findings.some((finding) => finding.code === 'MISSING_UNIT_AT_LAYER' && finding.unitId === 'op-Produce'));
});
