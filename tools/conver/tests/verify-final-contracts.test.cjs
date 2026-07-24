#!/usr/bin/env node
const assert = require('assert');
let mod;
try { mod = require('../.claude/scripts/tickets/verify-final-contracts.js'); } catch (e) { mod = null; }
const stats = { passed: 0, failed: 0, total: 0 };
function test(n, fn) { stats.total++; try { fn(); stats.passed++; console.log('  ✅', n); } catch (e) { stats.failed++; console.log('  ❌', n); console.error('     ' + e.message); } }

console.log('\n--- verify-final-contracts tests ---\n');
if (!mod || !mod.verifyFinalContracts) {
  for (let i = 1; i <= 6; i++) test('Test ' + i + ' — SKIPPED', () => { throw new Error('not loaded'); });
} else {
  const mkTicket = (id, contracts, status) => ({ id, phaseId:-1, title:'T'+id, status, contracts: contracts||[] });
  const mkEdge = (from, to, type, c) => ({ from, to, type, attributes:{strength:'hard',bidirectional:false}, contracts: c||[] });
  const mkContract = (id, pre, post, inv) => ({ id, sourceEdge:'N1→N2', precondition:pre||'a', postcondition:post||'b', invariant:inv||'c' });

  test('passes when all gates passed + full coverage', () => {
    const tickets = [mkTicket(1, [mkContract('C001')], 'done')];
    const graph = { sourceFile:'t.md', mainLanguage:'rust', nodes:[], edges:[mkEdge('N1','N2','depends_on',[mkContract('C001')])] };
    const result = mod.verifyFinalContracts({ tickets, graph, contractsCheck: true });
    assert.strictEqual(result.valid, true);
  });

  test('blocks when coverage < 100%', () => {
    const tickets = [mkTicket(1, [mkContract('C001'), mkContract('C002')], 'made')];
    const graph = { sourceFile:'t.md', mainLanguage:'rust', nodes:[], edges:[mkEdge('N1','N2','depends_on',[mkContract('C001')])] };
    const result = mod.verifyFinalContracts({ tickets, graph, contractsCheck: true });
    assert.strictEqual(result.valid, false);
    assert.ok(result.report);
    assert.ok(result.report.coverage < 100);
  });

  test('outputs coverage report JSON', () => {
    const tickets = [mkTicket(1, [mkContract('C001')], 'done')];
    const graph = { sourceFile:'t.md', mainLanguage:'rust', nodes:[], edges:[mkEdge('N1','N2','depends_on',[mkContract('C001')])] };
    const result = mod.verifyFinalContracts({ tickets, graph, contractsCheck: true });
    assert.ok(result.report);
    assert.ok(typeof result.report.coverage === 'number');
    assert.ok(Array.isArray(result.report.details));
  });

  test('handles empty contracts array', () => {
    const tickets = [mkTicket(1, [], 'done')];
    const graph = { sourceFile:'t.md', mainLanguage:'rust', nodes:[], edges:[] };
    const result = mod.verifyFinalContracts({ tickets, graph, contractsCheck: true });
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.report.coverage, 100);
  });

  test('read-only (no side effects)', () => {
    const tickets = [mkTicket(1, [mkContract('C001')], 'done')];
    const graph = { sourceFile:'t.md', mainLanguage:'rust', nodes:[], edges:[mkEdge('N1','N2','depends_on',[mkContract('C001')])] };
    const copy = JSON.parse(JSON.stringify(tickets));
    mod.verifyFinalContracts({ tickets, graph, contractsCheck: true });
    assert.deepStrictEqual(tickets, copy);
  });

  test('reports details per contract', () => {
    const tickets = [mkTicket(1, [mkContract('C001','pre','post','inv'), mkContract('C002','x','y','z')], 'made')];
    const graph = { sourceFile:'t.md', mainLanguage:'rust', nodes:[], edges:[mkEdge('N1','N2','depends_on',[mkContract('C001'), mkContract('C002')])] };
    const result = mod.verifyFinalContracts({ tickets, graph, contractsCheck: true });
    assert.strictEqual(result.report.details.length, 2);
  });
}
console.log('\nTotal: ' + stats.total + ' Passed: ' + stats.passed + ' Failed: ' + stats.failed);
process.exit(stats.failed > 0 ? 1 : 0);
