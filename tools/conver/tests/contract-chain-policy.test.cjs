#!/usr/bin/env node
/**
 * contract-chain-policy.test.cjs — Gate for PX-346 C001.
 *
 * A graph declares whether its non-registry edge contracts are state transitions.
 * An absent policy is an obligation graph, so legacy artifacts keep their old
 * behavior; an unknown value is a named failure, never a silent default.
 */

const assert = require('assert');
const contractChain = require('../.claude/scripts/tickets/lib/contract-chain.js');

const stats = { passed: 0, failed: 0, total: 0 };

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function log(...parts) {
  process.stdout.write(parts.map(String).join(' ') + '\n');
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function test(name, fn) {
  stats.total++;
  try {
    fn();
    stats.passed++;
    log('  ✅', name);
  } catch (error) {
    stats.failed++;
    log('  ❌', name);
    console.error('     ' + error.message);
  }
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function graph(extra) {
  return Object.assign({ sourceFile: 't.md', mainLanguage: 'rust', nodes: [], edges: [] }, extra || {});
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function edge(from, to, contracts) {
  return { from, to, type: 'depends_on', attributes: { strength: 'hard', bidirectional: false }, contracts };
}

// [::TICKET::] PX-346 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-346 --for-spec --no-implementation-order`.
function contract(id, pre, post, inv) {
  return { id, precondition: pre, postcondition: post, invariant: inv };
}

log('\n--- contract-chain-policy tests ---\n');

test('C001: an absent contractChain resolves to obligation', () => {
  assert.strictEqual(contractChain.chainPolicyOf(graph()), 'obligation');
});

test('C001: an explicit transition or obligation is returned unchanged', () => {
  assert.strictEqual(contractChain.chainPolicyOf(graph({ contractChain: 'transition' })), 'transition');
  assert.strictEqual(contractChain.chainPolicyOf(graph({ contractChain: 'obligation' })), 'obligation');
});

test('C001: an unknown policy is INVALID_CONTRACT_CHAIN_POLICY', () => {
  assert.throws(
    () => contractChain.chainPolicyOf(graph({ contractChain: 'Transition' })),
    (error) => error.code === 'INVALID_CONTRACT_CHAIN_POLICY',
  );
});

test('C001: policy resolution does not mutate the graph', () => {
  const input = graph({ contractChain: 'transition' });
  contractChain.chainPolicyOf(input);
  assert.deepStrictEqual(Object.keys(input).sort(), ['contractChain', 'edges', 'mainLanguage', 'nodes', 'sourceFile']);
});

test('an obligation policy strips every non-registry contract from the chain', () => {
  const edges = [edge('N1', 'N2', [contract('C001', 'a', 'b', 'c')])];
  const filtered = contractChain.chainEdges(edges, [], contractChain.POLICY_OBLIGATION);
  assert.deepStrictEqual(filtered[0].contracts, []);
  assert.strictEqual(contractChain.nodeChainGaps(filtered).length, 0);
});

test('a transition policy keeps non-registry contracts', () => {
  const edges = [edge('N1', 'N2', [contract('C001', 'a', 'b', 'c')])];
  const filtered = contractChain.chainEdges(edges, [], contractChain.POLICY_TRANSITION);
  assert.strictEqual(filtered[0].contracts.length, 1);
});

test('incomingProvisionsAt returns every postcondition at the node', () => {
  const edges = [
    edge('S1', 'T', [contract('C101', 'start', 'provision A', 'exact')]),
    edge('S2', 'T', [contract('C102', 'start', 'provision B', 'exact')]),
    edge('T', 'O1', [contract('C201', 'provision A', 'done', 'exact')]),
  ];
  const provisions = contractChain.incomingProvisionsAt('T', edges);
  assert.deepStrictEqual(provisions.map((entry) => entry.postcondition), ['provision A', 'provision B']);
});

test('incomingProvisionsAt ignores an edge with no postcondition', () => {
  const edges = [edge('S1', 'T', [contract('C101', 'start', '', 'exact')])];
  assert.deepStrictEqual(contractChain.incomingProvisionsAt('T', edges), []);
});

log('\n===================');
log('Total:  ' + stats.total);
log('Passed: ' + stats.passed);
log('Failed: ' + stats.failed);
log('===================');
process.exit(stats.failed > 0 ? 1 : 0);
