// PX-344 @verifies C003 @verifies C004
// The graph stage proves the chain before split: an outgoing precondition must be
// satisfied by an incoming postcondition, by normalized identity or an explicit
// satisfiedBy link naming the source clause or source contract id.
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { verifyGraphContracts } = require('../../.claude/scripts/tickets/verify-graph-contracts.js');
const { chainEdges, contractIdentityMatches } = require('../../.claude/scripts/tickets/lib/contract-chain.js');
const { generateMarkdown } = require('../../.claude/scripts/rfc-graph/annotate-contracts.js');

// [::TICKET::] PX-344 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-344 --for-spec --no-implementation-order`.
function edge(from, to, contract) {
  return {
    from,
    to,
    type: 'depends_on',
    attributes: { strength: 'hard', bidirectional: false },
    contracts: [contract],
  };
}

// [::TICKET::] PX-344 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-344 --for-spec --no-implementation-order`.
function chainGraph({ post = 'token issued', pre = 'token issued', satisfiedBy = undefined } = {}) {
  const target = {
    id: 'C002',
    precondition: pre,
    postcondition: 'session active',
    invariant: 'state',
  };
  if (satisfiedBy !== undefined) target.satisfiedBy = satisfiedBy;
  return {
    nodes: [],
    edges: [
      edge('N0001', 'N0002', { id: 'C001', precondition: 'init', postcondition: post, invariant: 'state' }),
      edge('N0002', 'N0003', target),
    ],
  };
}

describe('shared contract identity', () => {
  it('accepts normalized identity and rejects an unrelated clause', () => {
    assert.equal(contractIdentityMatches('Token  Issued', 'token issued'), true);
    assert.equal(contractIdentityMatches('nothing at all', 'token', 'token'), false);
    assert.equal(contractIdentityMatches('token issued', 'token', 'token issued'), true);
    assert.equal(contractIdentityMatches('nothing at all', 'token', 'C001', 'C001'), true);
  });

  it('removes a registry projection from the chain contracts', () => {
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
    const filtered = chainEdges([edge('N0001', 'N0002', projection)], [row]);
    assert.deepEqual(filtered[0].contracts, []);
  });
});

describe('graphify chain gate', () => {
  it('the annotation guide names satisfiedBy and its authoring rule', () => {
    const guide = generateMarkdown(chainGraph());
    assert.match(guide, /satisfiedBy/);
    assert.match(guide, /source postcondition|contract id/i);
  });

  it('passes a chain closed by normalized identity', () => {
    assert.deepEqual(verifyGraphContracts(chainGraph()), []);
  });

  it('reports an unlinked chain gap before split', () => {
    const errors = verifyGraphContracts(chainGraph({ post: 'token issued', pre: 'session active' }));
    assert.ok(errors.some((entry) => entry.code === 'CONTRACT_CHAIN_OPEN' && /N0002/.test(entry.detail ?? entry.edge)));
  });

  it('closes a paraphrase through satisfiedBy naming the source postcondition', () => {
    const errors = verifyGraphContracts(chainGraph({ post: 'token issued', pre: 'token', satisfiedBy: 'token issued' }));
    assert.deepEqual(errors, []);
  });

  it('closes a paraphrase through satisfiedBy naming the source contract id', () => {
    const errors = verifyGraphContracts(chainGraph({ post: 'nothing at all', pre: 'token', satisfiedBy: 'C001' }));
    assert.deepEqual(errors, []);
  });

  it('rejects satisfiedBy equal to the precondition alone', () => {
    const errors = verifyGraphContracts(chainGraph({ post: 'nothing at all', pre: 'token', satisfiedBy: 'token' }));
    assert.ok(errors.some((entry) => entry.code === 'CONTRACT_CHAIN_OPEN'));
  });

  it('skips a terminal node with no outgoing contracted edge', () => {
    const graph = {
      nodes: [],
      edges: [edge('N0001', 'N0002', { id: 'C001', precondition: 'init', postcondition: 'token issued', invariant: 'state' })],
    };
    assert.deepEqual(verifyGraphContracts(graph), []);
  });
});
