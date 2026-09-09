// @verifies C003
// [::TICKET::] PX-177: dag property tests.
// Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-177 --for-spec --no-implementation-order`

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectCycles, runDagChecks } from '../../../.claude/scripts/workspacify-tree/lib/dag.mjs';

function createRandom(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function makeAcyclicGraph(random, nodeCount) {
  const nodes = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({ id: `n${i}`, name: `n${i}`, path: `p${i}`, layer: 'protocol', kind: 'production-library' });
  }
  const edges = [];
  for (let fromIndex = 0; fromIndex < nodeCount; fromIndex++) {
    for (let toIndex = fromIndex + 1; toIndex < nodeCount; toIndex++) {
      if (random() < 0.35) {
        edges.push({ from: nodes[fromIndex].id, to: nodes[toIndex].id, kind: 'normal' });
      }
    }
  }
  return { nodes, edges };
}

test('property: every acyclic directed graph has a topological order and no cycle', () => {
  const random = createRandom(4242);
  for (let run = 0; run < 60; run++) {
    const { nodes, edges } = makeAcyclicGraph(random, 6);
    const report = runDagChecks({ packages: nodes, edges, forbiddenEdges: [] });
    assert.equal(detectCycles(nodes.map((n) => n.id), edges).length, 0, 'acyclic graph has no cycle');
    assert.equal(report.cycle_count, 0);
    assert.equal(report.topological_order.length, nodes.length, 'topological order covers all nodes');
  }
});

test('property: adding a cycle is always detected', () => {
  const random = createRandom(99);
  for (let run = 0; run < 40; run++) {
    const { nodes } = makeAcyclicGraph(random, 5);
    const ids = nodes.map((node) => node.id);
    // Build a guaranteed chain 0 -> 1 -> ... -> last plus extra forward edges,
    // then close the chain with one back edge. Exactly one cycle must exist.
    const edges = [];
    for (let i = 0; i < ids.length - 1; i++) {
      edges.push({ from: ids[i], to: ids[i + 1], kind: 'normal' });
    }
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 2; j < ids.length; j++) {
        if (random() < 0.2) {
          edges.push({ from: ids[i], to: ids[j], kind: 'normal' });
        }
      }
    }
    edges.push({ from: ids[ids.length - 1], to: ids[0], kind: 'normal' });
    const cycles = detectCycles(ids, edges);
    assert.equal(cycles.length, 1, 'a single back edge creates exactly one cycle');
  }
});
