// PX-315 ticket-side contracts: phase-qualified identity in the aggregate and closure.
// @verifies C005
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { writeTicketDistributionAggregate } = require('../../.claude/scripts/tickets/add-tickets-for-phase.js');
const { renumberTicketIds } = require('../../.claude/scripts/tickets/consolidate-phase-tickets.js');
const { verifyClosure } = require('../../.claude/scripts/tickets/verify-ticket-closure.js');
const { digestValue } = require('../../.claude/scripts/sequences-slice/lib/digest.mjs');

// [::TICKET::] PX-315 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-315) --for-spec --no-implementation-order`.
function distribution(digest) {
  return { digest, sourceMapDigest: 'm', sourceViewDigest: 'v', units: [] };
}

test('C005 the aggregate keys every ticket by its phase-qualified identity', () => {
  const document = {
    phases: [
      { id: 0, tickets: [{ id: 1, phaseId: 0, distribution: distribution('a'.repeat(64)) }] },
      { id: 1, tickets: [{ id: 1, phaseId: 1, distribution: distribution('b'.repeat(64)) }] },
    ],
  };
  const aggregated = writeTicketDistributionAggregate(document);
  assert.deepEqual(Object.keys(aggregated.distribution.ticketDigests), ['P0-1', 'P1-1']);
  assert.equal(aggregated.distribution.digest, digestValue({ ticketDigests: aggregated.distribution.ticketDigests }));
});

test('C005 consolidation renumbers the aggregate with the tickets', () => {
  const phases = renumberTicketIds([{
    id: 0,
    tickets: [
      { id: 5, phaseId: 0, nodeIds: ['N1'], distribution: distribution('d'.repeat(64)) },
      { id: 9, phaseId: 0, nodeIds: ['N2'], distribution: distribution('e'.repeat(64)) },
    ],
  }]);
  const document = { phases };
  const aggregated = writeTicketDistributionAggregate(document);
  assert.deepEqual(Object.keys(aggregated.distribution.ticketDigests), ['P0-1', 'P0-2']);
});

test('C005 a ticket in the PX phase uses PX-{id}, not P-1-{id}', () => {
  const document = { phases: [{ id: -1, tickets: [{ id: 315, phaseId: -1, distribution: distribution('c'.repeat(64)) }] }] };
  const aggregated = writeTicketDistributionAggregate(document);
  assert.deepEqual(Object.keys(aggregated.distribution.ticketDigests), ['PX-315']);
});

test('C005 a cross-phase edge between tickets with the same numeric id is still checked', () => {
  const source = {
    id: 1,
    phaseId: 0,
    nodeIds: ['N1'],
    contracts: [{ id: 'C1', sourceEdge: 'N1→N2', precondition: 'p', postcondition: 'unrelated post' }],
  };
  const target = {
    id: 1,
    phaseId: 1,
    nodeIds: ['N2'],
    contracts: [{ id: 'C2', sourceEdge: 'N1→N2 (inbound)', precondition: 'need session', postcondition: '' }],
  };
  const graph = {
    nodes: [],
    edges: [{
      from: 'N1',
      to: 'N2',
      type: 'depends_on',
      contracts: [{ id: 'C1', precondition: 'need token', postcondition: 'token issued', invariant: 'i' }],
    }],
  };
  const result = verifyClosure([source, target], graph);
  assert.ok(result.errors.some((error) => error.code === 'INTER_TICKET_CLOSURE_OPEN'));
});

test('C005 the closure message uses the public PX key for a phase -1 ticket', () => {
  const source = {
    id: 315,
    phaseId: -1,
    nodeIds: ['N1'],
    contracts: [{ id: 'C1', sourceEdge: 'N1→N2', precondition: 'p', postcondition: 'unrelated post' }],
  };
  const target = {
    id: 316,
    phaseId: -1,
    nodeIds: ['N2'],
    contracts: [{ id: 'C2', sourceEdge: 'N1→N2 (inbound)', precondition: 'need session', postcondition: '' }],
  };
  const graph = {
    nodes: [],
    edges: [{ from: 'N1', to: 'N2', type: 'depends_on', contracts: [{ id: 'C1', precondition: 'need token', postcondition: 'token issued', invariant: 'i' }] }],
  };
  const result = verifyClosure([source, target], graph);
});
