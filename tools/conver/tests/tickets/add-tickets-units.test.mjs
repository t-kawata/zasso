// PX-307 @verifies C004
// The ticket is the finest layer. These tests pin the mechanical copy from node to
// ticket, the obligation split by kind, and the sequence reconstruction.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  populateTicketDistribution,
  reconstructSequenceOrder,
  verifyTicketDistribution,
} from '../../.claude/scripts/tickets/add-tickets-for-phase.js';

// [::TICKET::] PX-307 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureView() {
  return {
    packageId: 'pkg-1',
    ownedOperationUnits: [
      { unitId: 'op-Produce', operationId: 'Produce', roleCandidate: 'implementer', obligation: { purpose: 'produce', specLines: [12] } },
      { unitId: 'op-Consume', operationId: 'Consume', roleCandidate: 'implementer', obligation: { purpose: 'consume', specLines: [20] } },
    ],
    ownedSequenceUnits: [{
      unitId: 'seq-A-1',
      sequenceId: 'A-1',
      outcome: 'direct',
      steps: [
        { stepId: 's1', operationId: 'Produce', order: 0, line: 12, quote: 'produce', contract: { pre: [], post: [] } },
        { stepId: 's2', operationId: 'Consume', order: 1, line: 20, quote: 'consume', contract: { pre: [], post: [] } },
      ],
    }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-307 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureGraph() {
  return {
    distributionDigest: 'a'.repeat(64),
    nodes: [
      { id: 'N0001', unitIds: ['op-Produce'] },
      { id: 'N0002', unitIds: ['op-Consume'] },
      { id: 'N0003', unitIds: ['seq-A-1'] },
    ],
  };
}

// [::TICKET::] PX-307 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-307 --for-spec --no-implementation-order`.
function fixtureDirsTree() {
  return {
    distribution: {
      digest: 'a'.repeat(64),
      units: {
        'op-Produce': { nodeIds: ['N0001'], paths: ['src/produce.rs'] },
        'op-Consume': { nodeIds: ['N0002'], paths: ['src/consume.rs'] },
        'seq-A-1': { nodeIds: ['N0003'], paths: ['src/flow.rs'] },
      },
    },
  };
}

// [::TICKET::] PX-307, PX-315 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-307|PX-315) --for-spec --no-implementation-order`.
function fixturePhase() {
  return {
    id: -1,
    nodeIds: ['N0001', 'N0002', 'N0003'],
    tickets: [
      { id: 1, phaseId: -1, status: 'todo', title: 'produce', nodeIds: ['N0001'], specPath: 'SPEC.md' },
      { id: 2, phaseId: -1, status: 'todo', title: 'consume', nodeIds: ['N0002'], specPath: 'SPEC.md' },
      { id: 3, phaseId: -1, status: 'todo', title: 'flow', nodeIds: ['N0003'], specPath: 'SPEC.md' },
    ],
  };
}

test('C004 every node unit reaches the ticket that owns the node', async () => {
  const phase = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), fixtureView());
  const produce = phase.tickets.find((ticket) => ticket.id === 1);
  assert.ok(produce.distribution.units.some((unit) => unit.unitId === 'op-Produce'));
  assert.equal(produce.distribution.sourceMapDigest, 'a'.repeat(64));
  assert.match(produce.distribution.digest, /^[0-9a-f]{64}$/);
});

test('C004 an operation implementer carries the full obligation', async () => {
  const phase = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), fixtureView());
  const produce = phase.tickets.find((ticket) => ticket.id === 1);
  const unit = produce.distribution.units.find((entry) => entry.unitId === 'op-Produce');
  assert.equal(unit.obligation.mode, 'implement');
  assert.equal(unit.obligation.purpose, 'produce');
  assert.deepEqual(unit.placement.paths, ['src/produce.rs']);
});

test('C004 sequence steps are assigned to the ticket implementing their operation', async () => {
  const phase = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), fixtureView());
  const produce = phase.tickets.find((ticket) => ticket.id === 1);
  const sequence = produce.distribution.units.find((entry) => entry.unitId === 'seq-A-1');
  assert.equal(sequence.obligation.mode, 'steps');
  assert.deepEqual(sequence.obligation.steps.map((step) => step.stepId), ['s1']);
});

test('C004 the ordered sequence reconstructs across tickets', async () => {
  const phase = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), fixtureView());
  assert.deepEqual(reconstructSequenceOrder(phase.tickets), { 'seq-A-1': ['s1', 's2'] });
});

test('C004 every unit has at least one spec reference', async () => {
  const phase = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), fixtureView());
  for (const ticket of phase.tickets) {
    for (const unit of ticket.distribution.units) {
      assert.ok(unit.specRefs.length > 0, `${ticket.id}/${unit.unitId}`);
    }
  }
});

test('C004 a graph unit with no owning ticket is reported', async () => {
  const phase = fixturePhase();
  phase.tickets = phase.tickets.filter((ticket) => ticket.id !== 1);
  const findings = verifyTicketDistribution(phase, fixtureView(), fixtureGraph(), fixtureDirsTree());
  assert.ok(findings.some((finding) => finding.code === 'MISSING_UNIT_AT_LAYER' && finding.unitId === 'op-Produce'));
});

test('C004 a ticket unit outside the graph is reported', async () => {
  const phase = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), fixtureView());
  phase.tickets[0].distribution.units.push({ unitId: 'op-Invented', kind: 'operation', obligation: {}, specRefs: [] });
  const findings = verifyTicketDistribution(phase, fixtureView(), fixtureGraph(), fixtureDirsTree());
  assert.ok(findings.some((finding) => finding.code === 'INVENTED_UNIT' && finding.unitId === 'op-Invented'));
});
