// PX-307 @verifies C003
// The Dirs-Tree index is derived from mappedNodeIds, never authored. A unit-bearing node
// with no directory or file is the failure this layer exists to catch.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDistributionIndex,
  collectNodePaths,
  verifyDistributionCoverage,
} from '../../.claude/scripts/rfc-graph/lib/distribution-index.js';

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureTrees() {
  return {
    rust: {
      name: 'src',
      type: 'directory',
      kind: 'root',
      children: [
        {
          name: 'produce.rs',
          type: 'file',
          kind: 'api_contract',
          mappedNodeIds: [{ nodeId: 'N0001', title: 'Produce' }],
        },
        {
          name: 'consume',
          type: 'directory',
          kind: 'architecture',
          children: [
            {
              name: 'consume.rs',
              type: 'file',
              kind: 'api_contract',
              mappedNodeIds: [{ nodeId: 'N0002', title: 'Consume' }],
            },
          ],
        },
      ],
    },
  };
}

// [::TICKET::] PX-307 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureGraph() {
  return {
    distributionDigest: 'a'.repeat(64),
    nodes: [
      { id: 'N0001', unitIds: ['op-Produce'] },
      { id: 'N0002', unitIds: ['seq-A-1'] },
      { id: 'N0003' },
    ],
  };
}

test('C003 collectNodePaths resolves every mapped node to a path', () => {
  const paths = collectNodePaths(fixtureTrees());
  assert.deepEqual(paths.get('N0001'), ['src/produce.rs']);
  assert.deepEqual(paths.get('N0002'), ['src/consume/consume.rs']);
});

test('C003 buildDistributionIndex records node ids and paths per unit', () => {
  const index = buildDistributionIndex(fixtureGraph(), collectNodePaths(fixtureTrees()), 'a'.repeat(64));
  assert.equal(index.digest, 'a'.repeat(64));
  assert.deepEqual(index.units['op-Produce'], { nodeIds: ['N0001'], paths: ['src/produce.rs'] });
  assert.deepEqual(index.units['seq-A-1'], { nodeIds: ['N0002'], paths: ['src/consume/consume.rs'] });
});

test('C003 a unit-bearing node with no path is unmapped', () => {
  const graph = fixtureGraph();
  const result = verifyDistributionCoverage(
    { distribution: buildDistributionIndex(graph, collectNodePaths(fixtureTrees()), graph.distributionDigest) },
    graph,
  );
  assert.equal(result.ok, true);

  const uncovered = fixtureGraph();
  uncovered.nodes.push({ id: 'N0004', unitIds: ['ctr-boundary-001'] });
  const index = buildDistributionIndex(uncovered, collectNodePaths(fixtureTrees()), uncovered.distributionDigest);
  const finding = verifyDistributionCoverage({ distribution: index }, uncovered);
  assert.equal(finding.ok, false);
  assert.deepEqual(finding.unmapped, ['ctr-boundary-001']);
});

test('C003 the index and the graph must agree in both directions', () => {
  const graph = fixtureGraph();
  const index = buildDistributionIndex(graph, collectNodePaths(fixtureTrees()), graph.distributionDigest);
  const invented = { ...index, units: { ...index.units, 'op-Invented': { nodeIds: ['N0009'], paths: ['src/x.rs'] } } };
  const finding = verifyDistributionCoverage({ distribution: invented }, graph);
  assert.equal(finding.ok, false);
  assert.deepEqual(finding.invented, ['op-Invented']);
});
