#!/usr/bin/env node

/**
 * verify-ticket-closure.test.cjs — Tests for verify-ticket-closure.js (Gate L2)
 *
 * Run: node tests/verify-ticket-closure.test.cjs
 */

const assert = require('assert');

let verifyModule;
try {
  verifyModule = require('../.claude/scripts/tickets/verify-ticket-closure.js');
} catch (e) {
  verifyModule = null;
}

const stats = { passed: 0, failed: 0, total: 0 };

function test(name, fn) {
  stats.total++;
  try { fn(); stats.passed++; console.log('  ✅', name); }
  catch (e) { stats.failed++; console.log('  ❌', name); console.error('     ' + e.message); }
}

function makeTicket(id, nodeIds, contracts, extra) {
  return Object.assign({ id, phaseId: 0, title: 'T' + id, status: 'todo', nodeIds, contracts }, extra || {});
}

function makeGraph(edges) {
  return { sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges };
}

function makeEdge(from, to, type, contracts) {
  return { from, to, type, attributes: { strength: 'hard', bidirectional: false }, contracts };
}

function makeContract(id, pre, post, inv) {
  return { id, precondition: pre, postcondition: post, invariant: inv };
}

console.log('\n--- verify-ticket-closure tests ---\n');

if (!verifyModule || !verifyModule.verifyClosure) {
  console.log('  ⚠️  Module not loaded — RED phase\n');
  for (let i = 1; i <= 7; i++) test('Test ' + i + ' — SKIPPED', () => { throw new Error('not loaded'); });
} else {
  test('passes intra-ticket closure (all chains closed)', () => {
    // Edge N0001→N0003: precondition "key_loaded" and postcondition "key_loaded" are equal → closed
    const tickets = [makeTicket(1, ['N0001', 'N0003'], [
      { id: 'C001', sourceEdge: 'N0001→N0003', precondition: 'key_loaded', postcondition: 'key_loaded', invariant: 'mem' }
    ])];
    const graph = makeGraph([
      makeEdge('N0001', 'N0003', 'depends_on', [
        makeContract('C001', 'key_loaded', 'key_loaded', 'mem')
      ])
    ]);
    const result = verifyModule.verifyClosure(tickets, graph);
    assert.strictEqual(result.valid, true);
  });

  test('passes inter-ticket closure', () => {
    // P0-1 has postcondition "token generated", P0-2 has precondition "token available"
    // "token generated" conceptually satisfies "token available"
    // For closure check, we match: P0-1's contracts where sourceEdge nodes are wholly within P0-1
    // and P0-2's precondition references match a postcondition from P0-1
    const tickets = [
      makeTicket(1, ['N0001'], [{ id: 'C001', sourceEdge: 'N0001→N0002', precondition: 'init', postcondition: 'token generated', invariant: 'state' }]),
      makeTicket(2, ['N0002'], [{ id: 'C002', sourceEdge: 'N0001→N0002', precondition: 'token available', postcondition: 'session active', invariant: 'state' }])
    ];
    const graph = makeGraph([
      makeEdge('N0001', 'N0002', 'depends_on', [
        makeContract('C001', 'init', 'token generated', 'state'),
        makeContract('C002', 'token available', 'session active', 'state')
      ])
    ]);
    const result = verifyModule.verifyClosure(tickets, graph);
    assert.strictEqual(result.valid, true);
  });

  test('blocks intra-ticket open chain', () => {
    // precondition != postcondition in the same edge → should still be considered
    // "open" means the chain between contracts within a ticket doesn't connect
    const tickets = [makeTicket(1, ['N0001', 'N0003'], [
      { id: 'C001', sourceEdge: 'N0001→N0003', precondition: 'needs A', postcondition: 'produces B', invariant: 'state' }
    ])];
    const graph = makeGraph([
      makeEdge('N0001', 'N0003', 'depends_on', [
        makeContract('C001', 'needs A', 'produces B', 'state')
      ])
    ]);
    const result = verifyModule.verifyClosure(tickets, graph);
    // needs A != produces B → chain not closed within the edge itself
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  test('passes with empty graph (no edges)', () => {
    const tickets = [makeTicket(1, ['N0001'], [])];
    const graph = makeGraph([]);
    const result = verifyModule.verifyClosure(tickets, graph);
    assert.strictEqual(result.valid, true);
  });

  test('passes with single ticket, no inter-ticket edges', () => {
    const tickets = [makeTicket(1, ['N0001'], [])];
    const graph = makeGraph([]);
    const result = verifyModule.verifyClosure(tickets, graph);
    assert.strictEqual(result.valid, true);
  });

  test('outputs errors array on failure', () => {
    const tickets = [makeTicket(1, ['N0001', 'N0003'], [])];
    const graph = makeGraph([
      makeEdge('N0001', 'N0003', 'depends_on', [
        makeContract('C001', 'a', 'b', 'c')
      ])
    ]);
    const result = verifyModule.verifyClosure(tickets, graph);
    assert.strictEqual(result.valid, false);
    assert.ok(Array.isArray(result.errors));
    assert.ok(result.errors.length > 0);
  });
}

console.log('\n===================');
console.log('Total:  ' + stats.total);
console.log('Passed: ' + stats.passed);
console.log('Failed: ' + stats.failed);
console.log('===================');
process.exit(stats.failed > 0 ? 1 : 0);
