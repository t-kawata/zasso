#!/usr/bin/env node
const assert = require('assert');
let mod;
try { mod = require('../.claude/scripts/tickets/verify-graph-contracts.js'); } catch (e) { mod = null; }
const stats = { passed: 0, failed: 0, total: 0 };
function test(n, fn) { stats.total++; try { fn(); stats.passed++; console.log('  ✅', n); } catch (e) { stats.failed++; console.log('  ❌', n); console.error('     ' + e.message); } }
function edge(f, t, type, contracts) { return { from: f, to: t, type, attributes: { strength: 'hard', bidirectional: false }, contracts }; }
// [::TICKET::] PX-306 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-306 --for-spec --no-implementation-order`.
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

  // PX-306 @verifies C003: a registry boundary must reach a graph node and a contract edge.
  test('accepts a registry boundary carried by a node with a contract edge', () => {
    const graph = {
      sourceFile: 't.md', mainLanguage: 'rust',
      nodes: [{ id: 'N5', unitIds: ['ctr-boundary-005'] }],
      edges: [edge('N5', 'N6', 'depends_on', [contract('C001', 'a', 'b', 'c')])],
    };
    const errs = mod.verifyGraphContracts(graph, { registryBoundaryIds: ['boundary-005'] });
    assert.strictEqual(errs.length, 0, JSON.stringify(errs));
  });

  test('blocks a registry boundary with no node carrying ctr-B', () => {
    const graph = { sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [] };
    const errs = mod.verifyGraphContracts(graph, { registryBoundaryIds: ['boundary-005'] });
    assert.ok(errs.some((entry) => entry.code === 'MISSING_BOUNDARY_CONTRACT'));
  });

  test('blocks a boundary node with no contract edge', () => {
    const graph = {
      sourceFile: 't.md', mainLanguage: 'rust',
      nodes: [{ id: 'N5', unitIds: ['ctr-boundary-005'] }],
      edges: [],
    };
    const errs = mod.verifyGraphContracts(graph, { registryBoundaryIds: ['boundary-005'] });
    assert.ok(errs.some((entry) => entry.code === 'MISSING_BOUNDARY_CONTRACT'));
  });
}
console.log('\nTotal: ' + stats.total + ' Passed: ' + stats.passed + ' Failed: ' + stats.failed);
process.exit(stats.failed > 0 ? 1 : 0);
