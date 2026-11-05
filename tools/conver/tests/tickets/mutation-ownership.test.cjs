// PX-378 @verifies C002
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
/**
 * The ownership rules a post-split mutation must satisfy.
 *
 * Contracts are the obligation an omission re-implements; ownership is nodeIds,
 * operation implementers and formulaObligations. The tests keep the two apart.
 */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { evaluateOwnership } = require('../../.claude/scripts/tickets/ticket-mutation-gate.js');

const CONTRACT = { id: 'C001', sourceEdge: 'e1', precondition: 'p', postcondition: 'q', invariant: 'r' };

/** One ticket with the schema's minimum shape. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function makeTicket(id, overrides = {}) {
  return {
    id,
    title: `ticket ${id}`,
    status: 'todo',
    contracts: [CONTRACT],
    nodeIds: [],
    ...overrides,
  };
}

/** A document with one phase. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function makeDocument(tickets) {
  return { title: 'fixture', phases: [{ id: 0, name: 'P0', tickets }] };
}

/** The codes a result carries. */
// [::TICKET::] PX-378 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-378 --for-spec --no-implementation-order`.
function codes(result) {
  return result.findings.map((entry) => entry.code);
}

test('C002 error: a resolving ticket inheriting nodeIds without a transfer is refused', () => {
  const before = makeDocument([makeTicket(1, { nodeIds: ['N1'] })]);
  const after = makeDocument([
    makeTicket(1, { nodeIds: ['N1'] }),
    makeTicket(2, { nodeIds: ['N1'], origin: { kind: 'resolving', sourceTicket: 'P0-1' } }),
  ]);

  const result = evaluateOwnership({
    before,
    after,
    graph: { nodes: [{ id: 'N1' }] },
    manifest: { added: ['P0-2'] },
  });

  assert.ok(codes(result).includes('MUTATION_OWNERSHIP_DUPLICATE'));
});

test('C002 normal: an explicit transfer is accepted and the source loses the unit', () => {
  const before = makeDocument([makeTicket(1, { nodeIds: ['N1'] })]);
  const after = makeDocument([
    makeTicket(1, { nodeIds: [] }),
    makeTicket(2, { nodeIds: ['N1'], origin: { kind: 'resolving', sourceTicket: 'P0-1' } }),
  ]);

  const result = evaluateOwnership({
    before,
    after,
    graph: { nodes: [{ id: 'N1' }] },
    manifest: {
      added: ['P0-2'],
      ownershipTransfers: [{ from: 'P0-1', to: 'P0-2', nodeIds: ['N1'] }],
    },
  });

  assert.deepEqual(result.findings, []);
});

test('C002 error: a transfer that leaves the source owning the node is invalid', () => {
  const before = makeDocument([makeTicket(1, { nodeIds: ['N1'] })]);
  const after = makeDocument([
    makeTicket(1, { nodeIds: ['N1'] }),
    makeTicket(2, { nodeIds: ['N1'], origin: { kind: 'resolving', sourceTicket: 'P0-1' } }),
  ]);

  const result = evaluateOwnership({
    before,
    after,
    graph: { nodes: [{ id: 'N1' }] },
    manifest: {
      added: ['P0-2'],
      ownershipTransfers: [{ from: 'P0-1', to: 'P0-2', nodeIds: ['N1'] }],
    },
  });

  assert.ok(codes(result).includes('MUTATION_TRANSFER_INVALID'));
});

test('C002 normal: an omission ticket with no ownership is additive', () => {
  const before = makeDocument([makeTicket(1, { nodeIds: ['N1'] })]);
  const after = makeDocument([
    makeTicket(1, { nodeIds: ['N1'] }),
    makeTicket(2, { origin: { kind: 'omission', sourceTicket: 'P0-1' } }),
  ]);

  const result = evaluateOwnership({
    before,
    after,
    graph: { nodes: [{ id: 'N1' }] },
    manifest: { added: ['P0-2'] },
  });

  assert.deepEqual(result.findings, []);
});

test('C002 error: a ticket claiming a node absent from the graph is refused', () => {
  const before = makeDocument([]);
  const after = makeDocument([
    makeTicket(1, { nodeIds: ['N999'], origin: { kind: 'omission' } }),
  ]);

  const result = evaluateOwnership({
    before,
    after,
    graph: { nodes: [{ id: 'N1' }] },
    manifest: { added: ['P0-1'] },
  });

  assert.ok(codes(result).includes('MUTATION_INVENTED_UNIT'));
});

test('C002 error: a second operation implementer is refused', () => {
  const operation = { units: [{ unitId: 'op-1', kind: 'operation', obligation: { mode: 'implement' } }] };
  const before = makeDocument([makeTicket(1, { distribution: operation })]);
  const after = makeDocument([
    makeTicket(1, { distribution: operation }),
    makeTicket(2, { distribution: operation }),
  ]);

  const result = evaluateOwnership({ before, after, manifest: { added: ['P0-2'] } });

  assert.ok(codes(result).includes('MUTATION_OWNERSHIP_DUPLICATE'));
});

test('C002 error: a second formula carrier is refused', () => {
  const before = makeDocument([makeTicket(1, { formulaObligations: [{ id: 'fx-1' }] })]);
  const after = makeDocument([
    makeTicket(1, { formulaObligations: [{ id: 'fx-1' }] }),
    makeTicket(2, { formulaObligations: [{ id: 'fx-1' }] }),
  ]);

  const result = evaluateOwnership({ before, after, manifest: { added: ['P0-2'] } });

  assert.ok(codes(result).includes('MUTATION_OWNERSHIP_DUPLICATE'));
});

test('C002 normal: a legacy ticket without origin is derived and may own a node', () => {
  const before = makeDocument([]);
  const after = makeDocument([makeTicket(1, { nodeIds: ['N1'] })]);

  const result = evaluateOwnership({
    before,
    after,
    graph: { nodes: [{ id: 'N1' }] },
    manifest: { added: ['P0-1'] },
  });

  assert.deepEqual(result.findings, []);
});
