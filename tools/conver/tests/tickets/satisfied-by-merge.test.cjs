// PX-344 @verifies C002
// A satisfiedBy link authored on a graph edge must survive the ticket merge. A manual
// ticket edit is not durable: the graph is the source, and a re-merge restores it.
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { mergeContracts } = require('../../.claude/scripts/tickets/merge-contracts-to-tickets.js');

// [::TICKET::] PX-344 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-344 --for-spec --no-implementation-order`.
function makeTicket(id, nodeIds) {
  return { id, phaseId: 0, title: 'T' + id, status: 'todo', nodeIds, contracts: [] };
}

// [::TICKET::] PX-344 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-344 --for-spec --no-implementation-order`.
function graphWith(satisfiedBy) {
  const contract = {
    id: 'C001',
    precondition: 'init',
    postcondition: 'token issued',
    invariant: 'state',
  };
  if (satisfiedBy !== undefined) contract.satisfiedBy = satisfiedBy;
  return {
    nodes: [],
    edges: [{
      from: 'N0001',
      to: 'N0002',
      type: 'depends_on',
      attributes: { strength: 'hard', bidirectional: false },
      contracts: [contract],
    }],
  };
}

describe('satisfiedBy merge propagation', () => {
  it('copies the link to both endpoint tickets', () => {
    const tickets = [makeTicket(1, ['N0001']), makeTicket(2, ['N0002'])];
    const merged = mergeContracts(tickets, graphWith('token issued'));
    assert.equal(merged[0].contracts[0].satisfiedBy, 'token issued');
    assert.equal(merged[1].contracts[0].satisfiedBy, 'token issued');
  });

  it('restores the graph link when a ticket edit is re-merged', () => {
    const tickets = [makeTicket(1, ['N0001']), makeTicket(2, ['N0002'])];
    mergeContracts(tickets, graphWith('token issued'));
    tickets[1].contracts[0].satisfiedBy = 'manual edit';
    mergeContracts(tickets, graphWith('token issued'));
    assert.equal(tickets[1].contracts[0].satisfiedBy, 'token issued');
  });

  it('does not invent a link when the graph has none', () => {
    const tickets = [makeTicket(1, ['N0001']), makeTicket(2, ['N0002'])];
    const merged = mergeContracts(tickets, graphWith());
    assert.equal('satisfiedBy' in merged[0].contracts[0], false);
    assert.equal('satisfiedBy' in merged[1].contracts[0], false);
  });
});
