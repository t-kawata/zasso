#!/usr/bin/env node

/**
 * crud-update-edge.test.cjs — Unit tests for crud.js update-edge subcommand
 *
 * Run: node tests/crud-update-edge.test.cjs
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Import crud.js
const crud = require('../.claude/scripts/rfc-graph/crud.js');

const stats = { passed: 0, failed: 0, total: 0 };

function test(name, fn) {
  stats.total++;
  try { fn(); stats.passed++; console.log('  ✅', name); }
  catch (e) { stats.failed++; console.log('  ❌', name); console.error('     ' + e.message); }
}

/** Create a minimal valid graph for testing */
function createTestGraph() {
  return {
    sourceFile: '~/test.md',
    mainLanguage: 'rust',
    nodes: [
      { id: 'N0001', title: 'Node 1', kind: 'api_contract', summary: 'Test node',
        language: 'rust', slug: 'node1', headingRefs: [{ refId: 'REF001', heading: 2, texts: ['§1 Test'] }] },
      { id: 'N0002', title: 'Node 2', kind: 'data_model', summary: 'Test node 2',
        language: 'rust', slug: 'node2', headingRefs: [{ refId: 'REF002', heading: 2, texts: ['§2 Test'] }] }
    ],
    edges: [
      { from: 'N0001', to: 'N0002', type: 'depends_on',
        attributes: { strength: 'hard', bidirectional: false },
        contracts: [{ id: 'C001', precondition: 'key loaded', postcondition: 'token signed', invariant: 'key in memory' }] }
    ]
  };
}

// ============================================================
// Tests
// ============================================================

console.log('\n--- crud.js update-edge tests ---\n');

test('update-edge replaces contracts on existing edge', () => {
  const graph = createTestGraph();
  const patch = { from: 'N0001', to: 'N0002', type: 'depends_on',
    contracts: [{ id: 'C002', precondition: 'new pre', postcondition: 'new post', invariant: 'new inv' }] };
  crud.executeUpdateEdge(graph, patch);
  assert.strictEqual(graph.edges[0].contracts[0].id, 'C002');
  assert.strictEqual(graph.edges[0].contracts[0].precondition, 'new pre');
});

test('update-edge rejects non-existent edge', () => {
  const graph = createTestGraph();
  const patch = { from: 'N9999', to: 'N0002', type: 'depends_on',
    contracts: [{ id: 'C002', precondition: 'x', postcondition: 'y', invariant: 'z' }] };
  assert.throws(() => crud.executeUpdateEdge(graph, patch), /not found/);
});

test('update-edge validates contracts schema', () => {
  const graph = createTestGraph();
  const patch = { from: 'N0001', to: 'N0002', type: 'depends_on',
    contracts: [{ precondition: 'x' }] };  // missing id, postcondition, invariant
  assert.throws(() => crud.executeUpdateEdge(graph, patch));
});

test('update-edge validates edge schema after update', () => {
  const graph = createTestGraph();
  // Invalid edge with no type
  const patch = { from: 'N0001' };
  assert.throws(() => crud.executeUpdateEdge(graph, patch));
});

test('update-edge rejects empty contracts array', () => {
  const graph = createTestGraph();
  const patch = { from: 'N0001', to: 'N0002', type: 'depends_on', contracts: [] };
  assert.throws(() => crud.executeUpdateEdge(graph, patch), /fewer than 1/);
});

test('update-edge adds contracts to edge that had none', () => {
  const graph = createTestGraph();
  // Remove contracts from the only edge
  delete graph.edges[0].contracts;
  const patch = { from: 'N0001', to: 'N0002', type: 'depends_on',
    contracts: [{ id: 'C003', precondition: 'added', postcondition: 'works', invariant: 'holds' }] };
  crud.executeUpdateEdge(graph, patch);
  assert.strictEqual(graph.edges[0].contracts[0].id, 'C003');
});

// ============================================================
// Summary
// ============================================================

console.log('\n===================');
console.log('Total:  ' + stats.total);
console.log('Passed: ' + stats.passed);
console.log('Failed: ' + stats.failed);
console.log('===================');
process.exit(stats.failed > 0 ? 1 : 0);
