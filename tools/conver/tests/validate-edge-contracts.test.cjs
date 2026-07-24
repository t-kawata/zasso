#!/usr/bin/env node

/**
 * validate-edge-contracts.test.js — Unit tests for validate-edge-contracts.js
 *
 * Run: node tests/validate-edge-contracts.test.js
 *
 * Tests the validateEdgeContracts function exported by validate-edge-contracts.js.
 */

const assert = require('assert');

// ============================================================
// Inline import of validateEdgeContracts (script may not exist yet)
// ============================================================

let validateEdgeContracts;
try {
  validateEdgeContracts = require('../.claude/scripts/tickets/validate-edge-contracts.js').validateEdgeContracts;
} catch (e) {
  // Test will fail graciously — expected during Red phase
  validateEdgeContracts = null;
}

// ============================================================
// Test runner
// ============================================================

const stats = { passed: 0, failed: 0, total: 0 };

function test(name, fn) {
  stats.total++;
  try {
    fn();
    stats.passed++;
    console.log('  ✅', name);
  } catch (e) {
    stats.failed++;
    console.log('  ❌', name);
    console.error('     ' + e.message);
  }
}

function assertErrors(errors, expectedCount, fieldHint) {
  assert.ok(Array.isArray(errors), 'errors must be an array');
  const matching = fieldHint
    ? errors.filter(e => e.detail && e.detail.includes(fieldHint))
    : errors;
  assert.strictEqual(matching.length, expectedCount,
    'Expected ' + expectedCount + ' error(s) for "' + fieldHint + '", got ' + matching.length
    + '\nErrors: ' + JSON.stringify(errors));
}

function makeEdge(from, to, type, contracts) {
  return { from, to, type, attributes: { strength: 'hard', bidirectional: false }, contracts };
}

function makeContract(pre, post, inv, id) {
  const c = { precondition: pre, postcondition: post, invariant: inv };
  if (id) c.id = id;
  return c;
}

function makeGraph(edges) {
  return {
    sourceFile: 'test.md',
    mainLanguage: 'rust',
    nodes: [],
    edges
  };
}

// ============================================================
// Tests
// ============================================================

console.log('\n--- validate-edge-contracts.js tests ---\n');

if (!validateEdgeContracts) {
  console.log('  ⚠️  validate-edge-contracts.js not found — tests are placeholders until Green phase\n');
  // Register placeholder failures
  test('PASSES all valid edge contracts — SKIPPED (no module)', () => { throw new Error('Module not loaded'); });
  test('BLOCKS edge without contracts — SKIPPED (no module)', () => { throw new Error('Module not loaded'); });
  test('BLOCKS edge with empty contracts array — SKIPPED (no module)', () => { throw new Error('Module not loaded'); });
  test('BLOCKS edge with empty precondition — SKIPPED (no module)', () => { throw new Error('Module not loaded'); });
  test('BLOCKS duplicate contract IDs — SKIPPED (no module)', () => { throw new Error('Module not loaded'); });
  test('REPORTS all violations in one run — SKIPPED (no module)', () => { throw new Error('Module not loaded'); });
} else {
  test('PASSES all valid edge contracts', () => {
    const graph = makeGraph([
      makeEdge('N0001', 'N0003', 'depends_on', [
        makeContract('Key loaded', 'Token signed', 'Key in memory only', 'C001')
      ])
    ]);
    const errors = validateEdgeContracts(graph);
    assert.strictEqual(errors.length, 0, 'Expected no errors, got: ' + JSON.stringify(errors));
  });

  test('BLOCKS edge without contracts', () => {
    const graph = makeGraph([
      makeEdge('N0001', 'N0003', 'depends_on', undefined)
    ]);
    const errors = validateEdgeContracts(graph);
    assertErrors(errors, 1, 'missing');
  });

  test('BLOCKS edge with empty contracts array', () => {
    const graph = makeGraph([
      makeEdge('N0001', 'N0003', 'depends_on', [])
    ]);
    const errors = validateEdgeContracts(graph);
    assertErrors(errors, 1, 'empty');
  });

  test('BLOCKS edge with empty precondition', () => {
    const graph = makeGraph([
      makeEdge('N0001', 'N0003', 'depends_on', [
        makeContract('', 'Token signed', 'Key in memory only', 'C001')
      ])
    ]);
    const errors = validateEdgeContracts(graph);
    assertErrors(errors, 1, 'precondition');
  });

  test('BLOCKS duplicate contract IDs', () => {
    const graph = makeGraph([
      makeEdge('N0001', 'N0003', 'depends_on', [
        makeContract('Key loaded', 'Token signed', 'Key in memory', 'C001'),
        makeContract('Token valid', 'Session active', 'Session isolated', 'C001')
      ])
    ]);
    const errors = validateEdgeContracts(graph);
    assertErrors(errors, 1, 'duplicate');
  });

  test('REPORTS all violations in one run', () => {
    const graph = makeGraph([
      makeEdge('N0001', 'N0003', 'depends_on', undefined),
      makeEdge('N0004', 'N0005', 'depends_on', [])
    ]);
    const errors = validateEdgeContracts(graph);
    assert.ok(errors.length >= 2, 'Expected at least 2 errors, got: ' + errors.length);
  });
}

// ============================================================
// Summary
// ============================================================

console.log('\n===================');
console.log('Total:  ' + stats.total);
console.log('Passed: ' + stats.passed);
console.log('Failed: ' + stats.failed);
console.log('===================');

process.exit(stats.failed > 0 ? 1 : 0);
