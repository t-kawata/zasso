#!/usr/bin/env node

/**
 * merge-contracts-to-tickets.test.cjs — Tests for merge-contracts-to-tickets.js
 *
 * Run: node tests/merge-contracts-to-tickets.test.cjs
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

let mergeModule;
try {
  mergeModule = require('../.claude/scripts/tickets/merge-contracts-to-tickets.js');
} catch (e) {
  mergeModule = null;
}

const stats = { passed: 0, failed: 0, total: 0 };

function test(name, fn) {
  stats.total++;
  try { fn(); stats.passed++; console.log('  ✅', name); }
  catch (e) { stats.failed++; console.log('  ❌', name); console.error('     ' + e.message); }
}

function makeTicket(id, nodeIds, extra) {
  return Object.assign({ id, phaseId: -1, title: 'T' + id, status: 'todo', nodeIds }, extra || {});
}

function makeEdge(from, to, type, contracts) {
  return { from, to, type, attributes: { strength: 'hard', bidirectional: false }, contracts };
}

function makeContract(id, pre, post, inv) {
  return { id, precondition: pre, postcondition: post, invariant: inv };
}

console.log('\n--- merge-contracts-to-tickets tests ---\n');

if (!mergeModule || !mergeModule.mergeContracts) {
  console.log('  ⚠️  Module not loaded — RED phase\n');
  for (let i = 1; i <= 9; i++) test('Test ' + i + ' — SKIPPED', () => { throw new Error('not loaded'); });
} else {
  test('merges contracts from intra-ticket edges into ticket.contracts', () => {
    const graph = { sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [
      makeEdge('N0001', 'N0003', 'depends_on', [makeContract('C001', 'key loaded', 'token signed', 'key in memory')])
    ]};
    const tickets = [makeTicket(1, ['N0001', 'N0003'])];
    const result = mergeModule.mergeContracts(tickets, graph);
    assert.ok(result[0].contracts);
    assert.strictEqual(result[0].contracts.length, 1);
    assert.strictEqual(result[0].contracts[0].id, 'C001');
  });

  test('excludes internally closed contracts from external exposure', () => {
    // Internally closed: source.postcondition == target.precondition within same ticket
    const graph = { sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [
      makeEdge('N0001', 'N0003', 'depends_on', [makeContract('C001', 'key loaded', 'key loaded', 'key in memory')])
    ]};
    const tickets = [makeTicket(1, ['N0001', 'N0003'])];
    const result = mergeModule.mergeContracts(tickets, graph);
    // postcondition "key loaded" == precondition "key loaded" → internally closed → exposed as external
    // Actually, "internally closed" means the chain is satisfied within the ticket.
    // The spec says: internal closure means the contract chain is satisfied and does not need to be exposed.
    // But the postcondition and precondition being the same means the contract IS the connection.
    // Internal closure = the source postcondition fulfills the target precondition.
    // The contract that represents this fulfilled chain should still be exposed as the public face.
    // But the design says: "契約連鎖が閉じている = チケット外に露出しない"
    // If source.postcondition == target.precondition, this IS closure fulfillment.
    // Let me reconsider: the merge logic should exclude contracts where
    // the postcondition of the source node and the precondition of the target node are identical
    // because that means the dependency is fully resolved within the ticket.
    // Actually, re-reading the design: "内部閉包契約は契約連鎖が完全一致すること"
    // So when postcondition == precondition, this means "the contract is self-contained within this ticket"
    // and should NOT be exposed externally.
    // Wait, but that would mean nearly everything gets excluded... Let me think more carefully.
    //
    // The design intent is:
    // - Edge N0001→N0003 has contract {precondition: X, postcondition: Y}
    // - If within the same ticket, N0001's postcondition Y satisfies N0003's precondition X
    // - Then the ticket's external interface doesn't need to expose this contract
    // - Only contracts that span ticket boundaries need to be exposed
    //
    // So the test should check that when postcondition == precondition, the contract is excluded
    // from the ticket's external contracts array.
    // Actually wait - the precondition/postcondition in the contract are the *edge's* contract, not the node's.
    // Edge contract says: "to go from N0001 to N0003, precondition X must hold, postcondition Y is guaranteed"
    // Internal closure means: within this ticket, the chain starts with X and ends with Y, and everything
    // in between is satisfied.
    // The external exposure should only include contracts that reference nodes outside this ticket.

    // For this test: if ALL nodes referenced by the edge are within the ticket,
    // and postcondition == precondition, the contract chain is "trivially closed"
    // and should not be exposed.
    assert.strictEqual(result[0].contracts.length, 0,
      'Internal closure should exclude contract from external exposure. Got: ' + JSON.stringify(result[0].contracts));
  });

  test('includes non-closed contracts in external exposure', () => {
    // Edge contract where postcondition != precondition → NOT internally closed
    const graph = { sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [
      makeEdge('N0001', 'N0003', 'depends_on', [makeContract('C001', 'input received', 'output produced', 'state clean')])
    ]};
    const tickets = [makeTicket(1, ['N0001', 'N0003'])];
    const result = mergeModule.mergeContracts(tickets, graph);
    assert.strictEqual(result[0].contracts.length, 1,
      'Non-closed contract should be exposed. Got: ' + JSON.stringify(result[0].contracts));
  });

  test('handles ticket with no edges', () => {
    const graph = { sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [] };
    const tickets = [makeTicket(1, ['N0001'])];
    const result = mergeModule.mergeContracts(tickets, graph);
    assert.ok(Array.isArray(result[0].contracts));
    assert.strictEqual(result[0].contracts.length, 0);
  });

  test('handles ticket with no nodeIds', () => {
    const graph = { sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [] };
    const tickets = [makeTicket(1, [])];
    const result = mergeModule.mergeContracts(tickets, graph);
    assert.ok(Array.isArray(result[0].contracts));
    assert.strictEqual(result[0].contracts.length, 0);
  });

  test('preserves existing ticket fields', () => {
    const graph = { sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [
      makeEdge('N0001', 'N0003', 'depends_on', [makeContract('C001', 'a', 'b', 'c')])
    ]};
    const tickets = [makeTicket(1, ['N0001', 'N0003'], { background: 'test', scope: ['item1'] })];
    const result = mergeModule.mergeContracts(tickets, graph);
    assert.strictEqual(result[0].background, 'test');
    assert.strictEqual(result[0].scope[0], 'item1');
  });

  test('handles multiple contracts per edge', () => {
    const graph = { sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [
      makeEdge('N0001', 'N0003', 'depends_on', [
        makeContract('C001', 'a', 'b', 'c'),
        makeContract('C002', 'd', 'e', 'f')
      ])
    ]};
    const tickets = [makeTicket(1, ['N0001', 'N0003'])];
    const result = mergeModule.mergeContracts(tickets, graph);
    assert.strictEqual(result[0].contracts.length, 2);
    assert.strictEqual(result[0].contracts[0].id, 'C001');
    assert.strictEqual(result[0].contracts[1].id, 'C002');
  });
}

console.log('\n===================');
console.log('Total:  ' + stats.total);
console.log('Passed: ' + stats.passed);
console.log('Failed: ' + stats.failed);
console.log('===================');
process.exit(stats.failed > 0 ? 1 : 0);
