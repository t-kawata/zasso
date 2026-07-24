#!/usr/bin/env node
const assert = require('assert');
let mod;
try { mod = require('../.claude/scripts/tickets/verify-graph-contracts.js'); } catch (e) { mod = null; }
const stats = { passed: 0, failed: 0, total: 0 };
function test(n, fn) { stats.total++; try { fn(); stats.passed++; console.log('  ✅', n); } catch (e) { stats.failed++; console.log('  ❌', n); console.error('     ' + e.message); } }
function edge(f, t, type, contracts) { return { from: f, to: t, type, attributes: { strength: 'hard', bidirectional: false }, contracts }; }
function contract(id, pre, post, inv) { return { id, precondition: pre, postcondition: post, invariant: inv }; }
console.log('\n--- verify-graph-contracts tests ---\n');
if (!mod || !mod.verifyGraphContracts) {
  for (let i = 1; i <= 8; i++) test('Test ' + i + ' — SKIPPED', () => { throw new Error('not loaded'); });
} else {
  const T = mod.TYPES_REQUIRING_CONTRACTS || ['depends_on', 'constrains', 'conflicts_with'];
  test('passes graph with all valid edge contracts', () => {
    const errs = mod.verifyGraphContracts({ sourceFile:'t.md', mainLanguage:'rust', nodes:[], edges:[
      edge('N1','N2','depends_on',[contract('C001','a','b','c')]),
      edge('N3','N4','references',[contract('C002','d','e','f')])
    ]});
    assert.strictEqual(errs.length, 0);
  });
  test('blocks edge without contracts', () => {
    const errs = mod.verifyGraphContracts({ sourceFile:'t.md', mainLanguage:'rust', nodes:[], edges:[edge('N1','N2','depends_on')]});
    assert.ok(errs.length > 0);
  });
  test('blocks empty precondition', () => {
    const errs = mod.verifyGraphContracts({ sourceFile:'t.md', mainLanguage:'rust', nodes:[], edges:[
      edge('N1','N2','depends_on',[contract('C001','','b','c')])
    ]});
    assert.ok(errs.some(e => e.detail && e.detail.includes('precondition')));
  });
  test('blocks duplicate contract IDs', () => {
    const errs = mod.verifyGraphContracts({ sourceFile:'t.md', mainLanguage:'rust', nodes:[], edges:[
      edge('N1','N2','depends_on',[contract('C001','a','b','c')]),
      edge('N3','N4','depends_on',[contract('C001','d','e','f')])
    ]});
    assert.ok(errs.some(e => e.detail && e.detail.includes('duplicate')));
  });
  test('detects type-contract contradiction (depends_on + empty)', () => {
    const errs = mod.verifyGraphContracts({ sourceFile:'t.md', mainLanguage:'rust', nodes:[], edges:[
      edge('N1','N2','depends_on',[])
    ]});
    assert.ok(errs.length > 0);
  });
  test('allows references/refines without contracts', () => {
    const errs = mod.verifyGraphContracts({ sourceFile:'t.md', mainLanguage:'rust', nodes:[], edges:[
      edge('N1','N2','references'),
      edge('N3','N4','refines')
    ]});
    assert.strictEqual(errs.length, 0);
  });
  test('reports all violations in one run', () => {
    const errs = mod.verifyGraphContracts({ sourceFile:'t.md', mainLanguage:'rust', nodes:[], edges:[
      edge('N1','N2','depends_on'),
      edge('N3','N4','constrains')
    ]});
    assert.ok(errs.length >= 2);
  });
  test('handles empty graph', () => {
    const errs = mod.verifyGraphContracts({ sourceFile:'t.md', mainLanguage:'rust', nodes:[], edges:[]});
    assert.strictEqual(errs.length, 0);
  });
}
console.log('\nTotal: ' + stats.total + ' Passed: ' + stats.passed + ' Failed: ' + stats.failed);
process.exit(stats.failed > 0 ? 1 : 0);
