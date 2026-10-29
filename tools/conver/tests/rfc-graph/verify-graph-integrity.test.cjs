/**
 * verify-graph-integrity.test.cjs — Unit tests for verify-graph-integrity.js
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  checkNodesIntegrity,
  checkEdgesIntegrity,
  checkDistributionIntegrity,
} = require('../../.claude/scripts/rfc-graph/verify-graph-integrity.js');

// ============================================================
// Test Graph Data
// ============================================================

const BASE_GRAPH = {
  nodes: [
    { id: 'N0001', title: 'Module A', kind: 'architecture' },
    { id: 'N0002', title: 'Module B', kind: 'config' },
    { id: 'N0003', title: 'Module C', kind: 'error_policy' },
  ],
  edges: [
    { from: 'N0001', to: 'N0002', type: 'depends_on' },
    { from: 'N0002', to: 'N0003', type: 'part_of' },
  ],
};

// ============================================================
// checkNodesIntegrity
// ============================================================

describe('checkNodesIntegrity', () => {
  it('should pass when nodes are identical', () => {
    const result = checkNodesIntegrity(BASE_GRAPH, BASE_GRAPH);
    assert.strictEqual(result.errors.length, 0);
  });

  it('should detect added nodes', () => {
    const after = {
      ...BASE_GRAPH,
      nodes: [...BASE_GRAPH.nodes, { id: 'N0004', title: 'Module D', kind: 'config' }],
    };
    const result = checkNodesIntegrity(after, BASE_GRAPH);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('N0004'));
    assert.ok(result.remedies.length > 0);
  });

  it('should detect removed nodes', () => {
    const after = {
      ...BASE_GRAPH,
      nodes: BASE_GRAPH.nodes.slice(0, 2),
    };
    const result = checkNodesIntegrity(after, BASE_GRAPH);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('N0003'));
    assert.ok(result.remedies.length > 0);
  });

  it('should handle null graphs gracefully', () => {
    const result = checkNodesIntegrity(null, BASE_GRAPH);
    assert.strictEqual(result.errors.length, 0);
  });
});

// ============================================================
// checkEdgesIntegrity
// ============================================================

describe('checkEdgesIntegrity', () => {
  it('should pass when edges are identical', () => {
    const result = checkEdgesIntegrity(BASE_GRAPH, BASE_GRAPH);
    assert.strictEqual(result.errors.length, 0);
  });

  it('should detect added edges', () => {
    const after = {
      ...BASE_GRAPH,
      edges: [...BASE_GRAPH.edges, { from: 'N0003', to: 'N0001', type: 'references' }],
    };
    const result = checkEdgesIntegrity(after, BASE_GRAPH);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('edges added'));
  });

  it('should detect removed edges', () => {
    const after = {
      ...BASE_GRAPH,
      edges: BASE_GRAPH.edges.slice(0, 1),
    };
    const result = checkEdgesIntegrity(after, BASE_GRAPH);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('edges removed'));
  });

  it('should handle null graphs gracefully', () => {
    const result = checkEdgesIntegrity(null, BASE_GRAPH);
    assert.strictEqual(result.errors.length, 0);
  });
});

// ============================================================
// checkDistributionIntegrity
// ============================================================

describe('checkDistributionIntegrity', () => {
// [::TICKET::] PX-312 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-312 --for-spec --no-implementation-order`.
  const base = {
    distributionDigest: 'a'.repeat(64),
    nodes: [{ id: 'N0001', unitIds: ['op-A', 'seq-A'] }],
    edges: [],
  };

  it('passes an unchanged digest and unit set', () => {
    assert.deepEqual(checkDistributionIntegrity(base, base), { errors: [], remedies: [] });
  });

  it('detects a changed digest', () => {
    const after = { ...base, distributionDigest: 'b'.repeat(64) };
    const result = checkDistributionIntegrity(after, base);
    assert.ok(result.errors.some((error) => error.includes('distributionDigest changed')));
  });

  it('detects a dropped unit', () => {
    const after = { ...base, nodes: [{ id: 'N0001', unitIds: ['op-A'] }] };
    const result = checkDistributionIntegrity(after, base);
    assert.ok(result.errors.some((error) => error.includes('unit set changed')));
  });
});
