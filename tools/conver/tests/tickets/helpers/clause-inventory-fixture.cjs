'use strict';

/**
 * Neutral clause-inventory fixtures for PX-436.
 *
 * The harness tests use synthetic project names, contract ids and element text
 * so no evidence-project vocabulary can leak into the harness.
 */

/** Build an adapter declaration with neutral defaults. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function adapter(overrides = {}) {
  return {
    id: 'fixture-adapter',
    version: 1,
    scope: 'pkg-alpha',
    contractIdScope: 'global',
    elements: ['precondition', 'postcondition', 'invariant'],
    ...overrides,
  };
}

/** Build a graph source with one edge per contract group. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function graphSource(contracts, artifact = 'TEST-GRAPH.json') {
  return {
    kind: 'graph',
    artifact,
    edges: [{ id: 'E001', contracts }],
  };
}

/** Build a tickets source with one ticket per contract group. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function ticketSource(entries) {
  return {
    kind: 'tickets',
    artifact: 'Tickets.json',
    tickets: entries.map((entry) => ({
      key: entry.key,
      contracts: entry.contracts,
    })),
  };
}

/** Build a spec source with contracts declared directly. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function specSource(contracts, artifact = 'specs/TEST.md') {
  return { kind: 'spec', artifact, contracts };
}

/** Build an explicit manifest source with canonical clause declarations. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function manifestSource(clauses, artifact = 'CONTRACT-MANIFEST.json') {
  return { kind: 'manifest', artifact, clauses };
}

/** A contract with the default three elements. */
// [::TICKET::] PX-436 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-436 --for-spec --no-implementation-order`.
function contract(id, pre = 'input is present', post = 'output is stored', inv = 'state is unchanged') {
  return { id, precondition: pre, postcondition: post, invariant: inv };
}

module.exports = {
  adapter,
  graphSource,
  ticketSource,
  specSource,
  manifestSource,
  contract,
};
