#!/usr/bin/env node

const assert = require('assert');

let mergeModule;
try { mergeModule = require('../.claude/scripts/tickets/merge-contracts-to-tickets.js'); } catch (e) { mergeModule = null; }

const stats = { passed: 0, failed: 0, total: 0 };
function test(n, fn) { stats.total++; try { fn(); stats.passed++; console.log('  ✅', n); } catch (e) { stats.failed++; console.log('  ❌', n); console.error('     ' + e.message); } }
function makeTicket(id, nodeIds, extra) { return Object.assign({ id, phaseId: -1, title: 'T' + id, status: 'todo', nodeIds }, extra || {}); }
function makeEdge(f, t, type, contracts) { return { from: f, to: t, type, attributes: { strength: 'hard', bidirectional: false }, contracts }; }
function makeContract(id, pre, post, inv) { return { id, precondition: pre, postcondition: post, invariant: inv }; }

console.log('\n--- merge-contracts-to-tickets tests ---\n');

if (!mergeModule || !mergeModule.mergeContracts) {
  for (let i = 1; i <= 6; i++) test('Test ' + i + ' — SKIPPED', () => { throw new Error('not loaded'); });
} else {
  test('copies all edge contracts to matching tickets', () => {
    const graph = { sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [
      makeEdge('N0001', 'N0003', 'depends_on', [makeContract('C001', 'key loaded', 'token signed', 'key in memory')])
    ]};
    const tickets = [makeTicket(1, ['N0001', 'N0003'])];
    const result = mergeModule.mergeContracts(tickets, graph);
    assert.strictEqual(result[0].contracts.length, 1);
    assert.strictEqual(result[0].contracts[0].id, 'C001');
  });

  test('copies contracts to all involved tickets', () => {
    const graph = { sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [
      makeEdge('N0001', 'N0003', 'depends_on', [makeContract('C001', 'key loaded', 'token signed', 'key in memory')])
    ]};
    const tickets = [makeTicket(1, ['N0001']), makeTicket(2, ['N0003'])];
    const result = mergeModule.mergeContracts(tickets, graph);
    assert.strictEqual(result[0].contracts.length, 1);
    assert.strictEqual(result[1].contracts.length, 1);
  });

  test('handles ticket with no edges', () => {
    const graph = { sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [] };
    const tickets = [makeTicket(1, ['N0001'])];
    assert.strictEqual(mergeModule.mergeContracts(tickets, graph)[0].contracts.length, 0);
  });

  test('handles ticket with no nodeIds', () => {
    const graph = { sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [] };
    assert.strictEqual(mergeModule.mergeContracts([makeTicket(1, [])], graph)[0].contracts.length, 0);
  });

  test('preserves existing ticket fields', () => {
    const graph = { sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [
      makeEdge('N0001', 'N0003', 'depends_on', [makeContract('C001', 'a', 'b', 'c')])
    ]};
    const tickets = [makeTicket(1, ['N0001', 'N0003'], { background: 'test', scope: ['item1'] })];
    assert.strictEqual(mergeModule.mergeContracts(tickets, graph)[0].background, 'test');
  });

  test('handles multiple contracts per edge', () => {
    const graph = { sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [
      makeEdge('N0001', 'N0003', 'depends_on', [
        makeContract('C001', 'a', 'b', 'c'),
        makeContract('C002', 'd', 'e', 'f')
      ])
    ]};
    assert.strictEqual(mergeModule.mergeContracts([makeTicket(1, ['N0001', 'N0003'])], graph)[0].contracts.length, 2);
  });
}

console.log('\nTotal: ' + stats.total + ' Passed: ' + stats.passed + ' Failed: ' + stats.failed);
process.exit(stats.failed > 0 ? 1 : 0);
