// PX-308 @verifies C005
// Two tickets owning different nodes may both carry the same operation unit. The package
// still owes exactly one implementer; the other ticket consumes the operation by reference.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  populateTicketDistribution,
  verifyTicketDistribution,
} from '../../.claude/scripts/tickets/add-tickets-for-phase.js';

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function fixtureView() {
  return {
    ownedOperationUnits: [{
      unitId: 'op-A',
      operationId: 'A',
      roleCandidate: 'implementer',
      obligation: { purpose: 'a', specLines: [12] },
    }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function fixtureGraph() {
  return {
    distributionDigest: 'a'.repeat(64),
    nodes: [
      { id: 'N0001', unitIds: ['op-A'] },
      { id: 'N0002', unitIds: ['op-A'] },
    ],
  };
}

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function fixtureDirsTree() {
  return {
    distribution: {
      digest: 'a'.repeat(64),
      units: { 'op-A': { nodeIds: ['N0001', 'N0002'], paths: ['src/a.rs'] } },
    },
  };
}

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function fixturePhase() {
  return {
    id: -1,
    nodeIds: ['N0001', 'N0002'],
    tickets: [
      { id: 1, phaseId: -1, nodeIds: ['N0001'], specPath: 'SPEC.md' },
      { id: 2, phaseId: -1, nodeIds: ['N0002'], specPath: 'SPEC.md' },
    ],
  };
}

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function modeOf(ticket, unitId) {
  return ticket.distribution.units.find((unit) => unit.unitId === unitId).obligation.mode;
}

test('C005 exactly one ticket implements an operation and the other references it', async () => {
  const phase = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), fixtureView());
  const modes = phase.tickets.map((ticket) => modeOf(ticket, 'op-A')).sort();
  assert.deepEqual(modes, ['implement', 'reference']);
  assert.deepEqual(verifyTicketDistribution(phase, fixtureView(), fixtureGraph(), fixtureDirsTree()), []);
});

test('C005 the lowest ticket id keeps the implementer role', async () => {
  const phase = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), fixtureView());
  assert.equal(modeOf(phase.tickets.find((ticket) => ticket.id === 1), 'op-A'), 'implement');
  assert.equal(modeOf(phase.tickets.find((ticket) => ticket.id === 2), 'op-A'), 'reference');
});

test('C005 two implementing tickets are reported', async () => {
  const populated = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), fixtureView());
  const duplicated = {
    ...populated,
    tickets: populated.tickets.map((ticket) => ({
      ...ticket,
      distribution: {
        ...ticket.distribution,
        units: ticket.distribution.units.map((unit) => unit.unitId === 'op-A'
          ? { ...unit, obligation: { mode: 'implement' } }
          : unit),
      },
    })),
  };

  const findings = verifyTicketDistribution(duplicated, fixtureView(), fixtureGraph(), fixtureDirsTree());
  const duplicate = findings.find((finding) => finding.code === 'DUPLICATE_UNIT_AT_TICKET');
  assert.ok(duplicate);
  assert.equal(duplicate.unitId, 'op-A');
});

test('C005 a consumer map role makes every ticket a reference', async () => {
  const map = { units: [{ unitId: 'op-A', kind: 'operation', role: 'consumer' }] };
  const phase = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), fixtureView(), map);
  assert.deepEqual(phase.tickets.map((ticket) => modeOf(ticket, 'op-A')), ['reference', 'reference']);
  assert.deepEqual(verifyTicketDistribution(phase, fixtureView(), fixtureGraph(), fixtureDirsTree()), []);
});
