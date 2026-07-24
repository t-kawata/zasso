#!/usr/bin/env node

/**
 * annotate-contracts.test.cjs — Unit tests for annotate-contracts.js
 *
 * Run: node tests/annotate-contracts.test.cjs
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Test target may not exist yet (RED phase)
let annotateContracts;
try {
  annotateContracts = require('../.claude/scripts/rfc-graph/annotate-contracts.js');
} catch (e) {
  annotateContracts = null;
}

const stats = { passed: 0, failed: 0, total: 0 };

function test(name, fn) {
  stats.total++;
  try { fn(); stats.passed++; console.log('  ✅', name); }
  catch (e) { stats.failed++; console.log('  ❌', name); console.error('     ' + e.message); }
}

console.log('\n--- annotate-contracts tests ---\n');

if (!annotateContracts || !annotateContracts.generateMarkdown) {
  console.log('  ⚠️  Module not loaded — RED phase expected\n');
  test('generateMarkdown outputs edge info — SKIPPED', () => { throw new Error('not loaded'); });
  test('handles empty graph — SKIPPED', () => { throw new Error('not loaded'); });
} else {
  test('generateMarkdown outputs edge info', () => {
    const graph = {
      sourceFile: 'test.md', mainLanguage: 'rust', nodes: [], edges: [
        { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'hard', bidirectional: false } }
      ]
    };
    const out = annotateContracts.generateMarkdown(graph);
    assert.ok(out.includes('N0001'));
    assert.ok(out.includes('N0002'));
    assert.ok(out.includes('depends_on'));
  });

  test('handles empty graph', () => {
    const graph = { sourceFile: 'test.md', mainLanguage: 'rust', nodes: [], edges: [] };
    const out = annotateContracts.generateMarkdown(graph);
    assert.ok(typeof out === 'string');
  });
}

console.log('\n===================');
console.log('Total:  ' + stats.total);
console.log('Passed: ' + stats.passed);
console.log('Failed: ' + stats.failed);
console.log('===================');
process.exit(stats.failed > 0 ? 1 : 0);
