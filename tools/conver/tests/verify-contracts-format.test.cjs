#!/usr/bin/env node

/**
 * verify-contracts-format.test.cjs — Unit tests for verify-contracts-format.js
 *
 * Run: node tests/verify-contracts-format.test.cjs
 */

const assert = require('assert');

// Test target may not exist yet (RED phase)
let verifyContractsFormat;
try {
  verifyContractsFormat = require('../.claude/scripts/rfc-graph/verify-contracts-format.js');
} catch (e) {
  verifyContractsFormat = null;
}

const stats = { passed: 0, failed: 0, total: 0 };

function test(name, fn) {
  stats.total++;
  try { fn(); stats.passed++; console.log('  ✅', name); }
  catch (e) { stats.failed++; console.log('  ❌', name); console.error('     ' + e.message); }
}

function makeEdge(from, to, type, contracts) {
  return { from, to, type, attributes: { strength: 'hard', bidirectional: false }, contracts };
}

console.log('\n--- verify-contracts-format tests ---\n');

if (!verifyContractsFormat || !verifyContractsFormat.validateEdgeContracts) {
  console.log('  ⚠️  Module not loaded — RED phase expected\n');
  test('passes valid contracts — SKIPPED', () => { throw new Error('not loaded'); });
  test('blocks empty precondition — SKIPPED', () => { throw new Error('not loaded'); });
  test('blocks duplicate contract IDs — SKIPPED', () => { throw new Error('not loaded'); });
  test('outputs 3-line error template — SKIPPED', () => { throw new Error('not loaded'); });
} else {
  test('passes valid contracts', () => {
    const errors = verifyContractsFormat.validateEdgeContracts(makeEdge('N1','N2','depends_on',[
      { id: 'C001', precondition: 'key', postcondition: 'token', invariant: 'mem' }
    ]));
    assert.strictEqual(errors.length, 0);
  });

  test('blocks empty precondition', () => {
    const errors = verifyContractsFormat.validateEdgeContracts(makeEdge('N1','N2','depends_on',[
      { id: 'C001', precondition: '', postcondition: 'token', invariant: 'mem' }
    ]));
    assert.ok(errors.length > 0);
    assert.ok(errors[0].detail.includes('precondition'));
  });

  test('blocks duplicate contract IDs', () => {
    const graph = { sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [
      makeEdge('N1','N2','depends_on',[
        { id: 'C001', precondition: 'a', postcondition: 'b', invariant: 'c' },
        { id: 'C001', precondition: 'd', postcondition: 'e', invariant: 'f' }
      ])
    ]};
    const errors = verifyContractsFormat.validateEdgeContracts(graph);
    assert.ok(errors.length > 0);
    assert.ok(errors.some(e => e.detail.includes('duplicate')));
  });

  test('outputs 3-line error template', () => {
    const errors = verifyContractsFormat.validateEdgeContracts(makeEdge('N1','N2','depends_on',[
      { id: 'C001', precondition: '', postcondition: 'b', invariant: 'c' }
    ]));
    assert.ok(errors.length > 0);
    // Errors should have edge and detail fields
    assert.ok(errors[0].edge);
    assert.ok(errors[0].detail);
  });
}

console.log('\n===================');
console.log('Total:  ' + stats.total);
console.log('Passed: ' + stats.passed);
console.log('Failed: ' + stats.failed);
console.log('===================');
process.exit(stats.failed > 0 ? 1 : 0);
