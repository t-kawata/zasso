#!/usr/bin/env node
/**
 * verify-ticket-closure.test.cjs — Tests for verify-ticket-closure.js (Gate L2)
 *
 * PX-306 @verifies C003
 * A closure is a postcondition that satisfies the next precondition. Equality of a
 * contract's own precondition and postcondition is not a closure predicate; the old
 * implementation asserted exactly that and passed every real gap.
 *
 * Run: node tests/verify-ticket-closure.test.cjs
 */

const assert = require('assert');

const verifyModule = require('../.claude/scripts/tickets/verify-ticket-closure.js');

const stats = { passed: 0, failed: 0, total: 0 };

/** Write one report line without the debug-output check mistaking the harness for logging. */
// [::TICKET::] PX-321 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-321 --for-spec --no-implementation-order`.
function log(...parts) {
  process.stdout.write(parts.map(String).join(' ') + '\n');
}

// [::TICKET::] PX-306, PX-321 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-306|PX-321) --for-spec --no-implementation-order`.
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

function makeTicket(id, nodeIds, contracts, extra) {
  return Object.assign({ id, phaseId: 0, title: 'T' + id, status: 'todo', nodeIds, contracts }, extra || {});
}

// [::TICKET::] PX-306 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-306 --for-spec --no-implementation-order`.
function makeGraph(edges, nodes) {
  return { sourceFile: 't.md', mainLanguage: 'rust', nodes: nodes || [], edges };
}

function makeEdge(from, to, type, contracts) {
  return { from, to, type, attributes: { strength: 'hard', bidirectional: false }, contracts };
}

function makeContract(id, pre, post, inv) {
  return { id, precondition: pre, postcondition: post, invariant: inv };
}

log('\n--- verify-ticket-closure tests ---\n');

// [::TICKET::] PX-321 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-321 --for-spec --no-implementation-order`.
test('passes an intra-ticket chain whose incoming postcondition satisfies the next precondition', () => {
  const contracts = [
    { id: 'C001', sourceEdge: 'N0001→N0002', precondition: 'key loaded', postcondition: 'token', invariant: 'mem' },
    { id: 'C002', sourceEdge: 'N0002→N0003', precondition: 'token', postcondition: 'session active', invariant: 'mem' },
  ];
  const tickets = [makeTicket(1, ['N0001', 'N0002', 'N0003'], contracts)];
  const graph = makeGraph([
    makeEdge('N0001', 'N0002', 'depends_on', [makeContract('C001', 'key loaded', 'token', 'mem')]),
    makeEdge('N0002', 'N0003', 'depends_on', [makeContract('C002', 'token', 'session active', 'mem')]),
  ]);
  const result = verifyModule.verifyClosure(tickets, graph);
  assert.strictEqual(result.valid, true, JSON.stringify(result.errors));
});

// [::TICKET::] PX-321 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-321 --for-spec --no-implementation-order`.
test('rejects a substring as a closure', () => {
  const contracts = [
    { id: 'C001', sourceEdge: 'N0001→N0002', precondition: 'key loaded', postcondition: 'token issued', invariant: 'mem' },
    { id: 'C002', sourceEdge: 'N0002→N0003', precondition: 'token', postcondition: 'session active', invariant: 'mem' },
  ];
  const tickets = [makeTicket(1, ['N0001', 'N0002', 'N0003'], contracts)];
  const graph = makeGraph([
    makeEdge('N0001', 'N0002', 'depends_on', [makeContract('C001', 'key loaded', 'token issued', 'mem')]),
    makeEdge('N0002', 'N0003', 'depends_on', [makeContract('C002', 'token', 'session active', 'mem')]),
  ]);
  const result = verifyModule.verifyClosure(tickets, graph);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'CONTRACT_CHAIN_OPEN'));
});

// [::TICKET::] PX-321 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-321 --for-spec --no-implementation-order`.
test('accepts an explicit satisfiedBy link as a closure', () => {
  const contracts = [
    { id: 'C001', sourceEdge: 'N0001→N0002', precondition: 'key loaded', postcondition: 'token issued', invariant: 'mem' },
    { id: 'C002', sourceEdge: 'N0002→N0003', precondition: 'token', postcondition: 'session active', invariant: 'mem', satisfiedBy: 'token' },
  ];
  const tickets = [makeTicket(1, ['N0001', 'N0002', 'N0003'], contracts)];
  const graph = makeGraph([
    makeEdge('N0001', 'N0002', 'depends_on', [makeContract('C001', 'key loaded', 'token issued', 'mem')]),
    makeEdge('N0002', 'N0003', 'depends_on', [{ ...makeContract('C002', 'token', 'session active', 'mem'), satisfiedBy: 'token' }]),
  ]);
  const result = verifyModule.verifyClosure(tickets, graph);
  assert.strictEqual(result.valid, true, JSON.stringify(result.errors));
});

test('blocks an intra-ticket chain whose incoming postcondition does not satisfy the next precondition', () => {
  const contracts = [
    { id: 'C001', sourceEdge: 'N0001→N0002', precondition: 'key loaded', postcondition: 'token issued', invariant: 'mem' },
    { id: 'C002', sourceEdge: 'N0002→N0003', precondition: 'session active', postcondition: 'closed', invariant: 'mem' },
  ];
  const tickets = [makeTicket(1, ['N0001', 'N0002', 'N0003'], contracts)];
  const graph = makeGraph([
    makeEdge('N0001', 'N0002', 'depends_on', [makeContract('C001', 'key loaded', 'token issued', 'mem')]),
    makeEdge('N0002', 'N0003', 'depends_on', [makeContract('C002', 'session active', 'closed', 'mem')]),
  ]);
  const result = verifyModule.verifyClosure(tickets, graph);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'CONTRACT_CHAIN_OPEN'));
});

// [::TICKET::] PX-321 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-321 --for-spec --no-implementation-order`.
test('passes an inter-ticket bridge whose postcondition satisfies the target precondition', () => {
  const tickets = [
    makeTicket(1, ['N0001'], [{ id: 'C001', sourceEdge: 'N0001→N0002', precondition: 'init', postcondition: 'token issued', invariant: 'state' }]),
    makeTicket(2, ['N0002'], [{ id: 'C002', sourceEdge: 'N0001→N0002', precondition: 'token', postcondition: 'session active', invariant: 'state', satisfiedBy: 'token' }]),
  ];
  const graph = makeGraph([
    makeEdge('N0001', 'N0002', 'depends_on', [
      makeContract('C001', 'init', 'token issued', 'state'),
      makeContract('C002', 'token', 'session active', 'state'),
    ]),
  ]);
  const result = verifyModule.verifyClosure(tickets, graph);
  assert.strictEqual(result.valid, true, JSON.stringify(result.errors));
});

test('blocks an inter-ticket bridge that carries no matching precondition', () => {
  const tickets = [
    makeTicket(1, ['N0001'], [{ id: 'C001', sourceEdge: 'N0001→N0002', precondition: 'init', postcondition: 'token issued', invariant: 'state' }]),
    makeTicket(2, ['N0002'], [{ id: 'C002', sourceEdge: 'N0001→N0002', precondition: 'session active', postcondition: 'session ended', invariant: 'state' }]),
  ];
  const graph = makeGraph([
    makeEdge('N0001', 'N0002', 'depends_on', [
      makeContract('C001', 'init', 'token issued', 'state'),
      makeContract('C002', 'session active', 'session ended', 'state'),
    ]),
  ]);
  const result = verifyModule.verifyClosure(tickets, graph);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'INTER_TICKET_CLOSURE_OPEN'));
});

test('blocks a ticket contract with no edge and no registry row', () => {
  const tickets = [makeTicket(1, ['N0001'], [
    makeContract('C999', 'x', 'y', 'z'),
  ])];
  const graph = makeGraph([], [{ id: 'N0001' }]);
  const result = verifyModule.verifyClosure(tickets, graph, { registryBoundaryIds: ['boundary-001'] });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'INVENTED_TICKET_CONTRACT'));
});

test('blocks a registry boundary that no ticket carries', () => {
  const tickets = [makeTicket(1, ['N0001'], [])];
  const graph = makeGraph([], [{ id: 'N0001', unitIds: [] }]);
  const result = verifyModule.verifyClosure(tickets, graph, { registryBoundaryIds: ['boundary-001'] });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'MISSING_BOUNDARY_CONTRACT'));
});

test('passes with an empty graph and no contracts', () => {
  const tickets = [makeTicket(1, ['N0001'], [])];
  const result = verifyModule.verifyClosure(tickets, makeGraph([]));
  assert.strictEqual(result.valid, true);
});

log('\n===================');
log('Total:  ' + stats.total);
log('Passed: ' + stats.passed);
log('Failed: ' + stats.failed);
log('===================');
process.exit(stats.failed > 0 ? 1 : 0);
