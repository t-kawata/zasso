#!/usr/bin/env node
/**
 * verify-ticket-closure.test.cjs — Tests for verify-ticket-closure.js (Gate L2)
 *
 * PX-306 @verifies C003
 * PX-343 @verifies C006 @verifies C007
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
    { id: 'C002', sourceEdge: 'N0002→N0003', precondition: 'token', postcondition: 'session active', invariant: 'mem', satisfiedBy: 'token issued' },
  ];
  const tickets = [makeTicket(1, ['N0001', 'N0002', 'N0003'], contracts)];
  const graph = makeGraph([
    makeEdge('N0001', 'N0002', 'depends_on', [makeContract('C001', 'key loaded', 'token issued', 'mem')]),
    makeEdge('N0002', 'N0003', 'depends_on', [{ ...makeContract('C002', 'token', 'session active', 'mem'), satisfiedBy: 'token issued' }]),
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
// [::TICKET::] PX-343 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-343 --for-spec --no-implementation-order`.
test('passes an inter-ticket chain when incoming post(e) satisfies outgoing pre(e2)', () => {
  const tickets = [
    makeTicket(1, ['N0001'], [{ id: 'C001', sourceEdge: 'N0001→N0002', precondition: 'init', postcondition: 'token issued', invariant: 'state' }]),
    makeTicket(2, ['N0002'], [
      { id: 'C001', sourceEdge: 'N0001→N0002 (inbound)', precondition: 'init', postcondition: 'token issued', invariant: 'state' },
      { id: 'C002', sourceEdge: 'N0002→N0003', precondition: 'token issued', postcondition: 'session active', invariant: 'state' },
    ]),
    makeTicket(3, ['N0003'], [{ id: 'C002', sourceEdge: 'N0002→N0003 (inbound)', precondition: 'token issued', postcondition: 'session active', invariant: 'state' }]),
  ];
  const graph = makeGraph([
    makeEdge('N0001', 'N0002', 'depends_on', [makeContract('C001', 'init', 'token issued', 'state')]),
    makeEdge('N0002', 'N0003', 'depends_on', [makeContract('C002', 'token issued', 'session active', 'state')]),
  ]);
  const result = verifyModule.verifyClosure(tickets, graph);
  assert.strictEqual(result.valid, true, JSON.stringify(result.errors));
});

test('blocks an inter-ticket chain when incoming post(e) does not satisfy outgoing pre(e2)', () => {
  const tickets = [
    makeTicket(1, ['N0001'], [{ id: 'C001', sourceEdge: 'N0001→N0002', precondition: 'init', postcondition: 'token issued', invariant: 'state' }]),
    makeTicket(2, ['N0002'], [
      { id: 'C001', sourceEdge: 'N0001→N0002 (inbound)', precondition: 'init', postcondition: 'token issued', invariant: 'state' },
      { id: 'C002', sourceEdge: 'N0002→N0003', precondition: 'session ended', postcondition: 'session active', invariant: 'state' },
    ]),
  ];
  const graph = makeGraph([
    makeEdge('N0001', 'N0002', 'depends_on', [makeContract('C001', 'init', 'token issued', 'state')]),
    makeEdge('N0002', 'N0003', 'depends_on', [makeContract('C002', 'session ended', 'session active', 'state')]),
  ]);
  const result = verifyModule.verifyClosure(tickets, graph);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((error) => error.code === 'INTER_TICKET_CLOSURE_OPEN' && /N0002→N0003/.test(error.detail)));
  assert.ok(!result.errors.some((error) => /precondition "init"/.test(error.detail)));
});

test('skips a target node that has no outgoing contracted edge', () => {
  const tickets = [
    makeTicket(1, ['N0001'], [{ id: 'C001', sourceEdge: 'N0001→N0002', precondition: 'init', postcondition: 'token issued', invariant: 'state' }]),
    makeTicket(2, ['N0002'], [{ id: 'C001', sourceEdge: 'N0001→N0002 (inbound)', precondition: 'init', postcondition: 'token issued', invariant: 'state' }]),
  ];
  const graph = makeGraph([
    makeEdge('N0001', 'N0002', 'depends_on', [makeContract('C001', 'init', 'token issued', 'state')]),
  ]);
  assert.strictEqual(verifyModule.verifyClosure(tickets, graph).valid, true);
});

test('rejects satisfiedBy equal to the precondition when the source post is unrelated', () => {
  const tickets = [
    makeTicket(1, ['N0001'], [{ id: 'C001', sourceEdge: 'N0001→N0002', precondition: 'init', postcondition: 'nothing at all', invariant: 'state' }]),
    makeTicket(2, ['N0002'], [
      { id: 'C001', sourceEdge: 'N0001→N0002 (inbound)', precondition: 'init', postcondition: 'nothing at all', invariant: 'state' },
      { id: 'C002', sourceEdge: 'N0002→N0003', precondition: 'token', postcondition: 'session active', invariant: 'state', satisfiedBy: 'token' },
    ]),
  ];
  const graph = makeGraph([
    makeEdge('N0001', 'N0002', 'depends_on', [makeContract('C001', 'init', 'nothing at all', 'state')]),
    makeEdge('N0002', 'N0003', 'depends_on', [makeContract('C002', 'token', 'session active', 'state')]),
  ]);
  assert.strictEqual(verifyModule.verifyClosure(tickets, graph).valid, false);
});

test('accepts satisfiedBy naming the source contract id', () => {
  const tickets = [
    makeTicket(1, ['N0001'], [{ id: 'C001', sourceEdge: 'N0001→N0002', precondition: 'init', postcondition: 'nothing at all', invariant: 'state' }]),
    makeTicket(2, ['N0002'], [
      { id: 'C001', sourceEdge: 'N0001→N0002 (inbound)', precondition: 'init', postcondition: 'nothing at all', invariant: 'state' },
      { id: 'C002', sourceEdge: 'N0002→N0003', precondition: 'token', postcondition: 'session active', invariant: 'state', satisfiedBy: 'C001' },
    ]),
  ];
  const graph = makeGraph([
    makeEdge('N0001', 'N0002', 'depends_on', [makeContract('C001', 'init', 'nothing at all', 'state')]),
    makeEdge('N0002', 'N0003', 'depends_on', [makeContract('C002', 'token', 'session active', 'state')]),
  ]);
  assert.strictEqual(verifyModule.verifyClosure(tickets, graph).valid, true, JSON.stringify(verifyModule.verifyClosure(tickets, graph).errors));
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

// [::TICKET::] PX-344 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-344 --for-spec --no-implementation-order`.
test('ignores a registry projection when checking the contract chain', () => {
  const row = {
    boundary_id: 'boundary-001',
    clauses: {
      preconditions: ['boundary requirement'],
      postconditions: ['boundary guarantee'],
      invariants: ['boundary invariant'],
    },
  };
  const projection = {
    id: 'C900',
    precondition: 'boundary requirement',
    postcondition: 'boundary guarantee',
    invariant: 'boundary invariant',
  };
  const tickets = [
    makeTicket(1, ['N0001'], [{ ...projection, sourceEdge: 'N0001→N0002', boundaryId: 'boundary-001', registryContractId: 'contract-boundary-001' }]),
    makeTicket(2, ['N0002'], [{ ...projection, sourceEdge: 'N0001→N0002 (inbound)', boundaryId: 'boundary-001', registryContractId: 'contract-boundary-001' }]),
  ];
  const graph = makeGraph([makeEdge('N0001', 'N0002', 'depends_on', [projection])]);
  const result = verifyModule.verifyClosure(tickets, graph, {
    registryContracts: [row],
    registryBoundaryIds: ['boundary-001'],
  });
  assert.ok(!result.errors.some((error) => error.code === 'INTER_TICKET_CLOSURE_OPEN' || error.code === 'CONTRACT_CHAIN_OPEN'));
});

log('\n===================');
log('Total:  ' + stats.total);
log('Passed: ' + stats.passed);
log('Failed: ' + stats.failed);
log('===================');
process.exit(stats.failed > 0 ? 1 : 0);
