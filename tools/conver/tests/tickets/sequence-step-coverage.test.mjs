// PX-308 @verifies C006
// Unit-set coverage says the sequence unit reached a ticket. It does not say every step of
// that sequence did: a step can be missing, duplicated, owned only by a consumer, or
// reordered when the ticket records are assembled.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  populateTicketDistribution,
  verifySequenceSteps,
} from '../../.claude/scripts/tickets/add-tickets-for-phase.js';

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function fixtureView() {
  return {
    ownedOperationUnits: [
      { unitId: 'op-Produce', operationId: 'Produce', roleCandidate: 'implementer', obligation: { purpose: 'produce', specLines: [12] } },
      { unitId: 'op-Consume', operationId: 'Consume', roleCandidate: 'implementer', obligation: { purpose: 'consume', specLines: [20] } },
    ],
    ownedSequenceUnits: [{
      unitId: 'seq-A-1',
      sequenceId: 'A-1',
      outcome: 'direct',
      steps: [
        { stepId: 's1', operationId: 'Produce', order: 0, line: 12, quote: 'produce' },
        { stepId: 's2', operationId: 'Consume', order: 1, line: 20, quote: 'consume' },
      ],
    }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function fixtureGraph() {
  return {
    distributionDigest: 'a'.repeat(64),
    nodes: [
      { id: 'N0001', unitIds: ['op-Produce'] },
      { id: 'N0002', unitIds: ['op-Consume'] },
    ],
  };
}

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function fixtureDirsTree() {
  return { distribution: { digest: 'a'.repeat(64), units: {} } };
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
function replaceSequenceUnit(phase, transform) {
  return {
    ...phase,
    tickets: phase.tickets.map((ticket) => ({
      ...ticket,
      distribution: {
        ...ticket.distribution,
        units: ticket.distribution.units.map((unit) => unit.unitId === 'seq-A-1'
          ? transform(unit)
          : unit),
      },
    })),
  };
}

test('C006 the complete package reconstructs the declared order', async () => {
  const phase = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), fixtureView());
  assert.deepEqual(verifySequenceSteps(phase, fixtureView(), fixtureGraph()), []);
});

test('C006 a step no ticket carries is missing', async () => {
  const populated = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), fixtureView());
  const missing = { ...populated, tickets: populated.tickets.filter((ticket) => ticket.id !== 2) };
  const finding = verifySequenceSteps(missing, fixtureView(), fixtureGraph())
    .find((entry) => entry.code === 'MISSING_SEQUENCE_STEP');
  assert.ok(finding);
  assert.equal(finding.stepId, 's2');
  assert.equal(finding.unitId, 'seq-A-1');
});

test('C006 a step carried by two tickets is duplicated', async () => {
  const populated = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), fixtureView());
  const duplicated = {
    ...populated,
    tickets: populated.tickets.map((ticket) => ticket.id !== 2 ? ticket : {
      ...ticket,
      distribution: {
        ...ticket.distribution,
        units: ticket.distribution.units.map((unit) => unit.unitId === 'seq-A-1'
          ? {
            ...unit,
            obligation: {
              ...unit.obligation,
              steps: [...unit.obligation.steps, { stepId: 's1', operationId: 'Produce', order: 0 }],
            },
          }
          : unit),
      },
    }),
  };
  const finding = verifySequenceSteps(duplicated, fixtureView(), fixtureGraph())
    .find((entry) => entry.code === 'DUPLICATE_SEQUENCE_STEP');
  assert.ok(finding);
  assert.equal(finding.stepId, 's1');
});

test('C006 a step whose operation only has a consumer is reported', async () => {
  const populated = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), fixtureView());
  const consumerOnly = {
    ...populated,
    tickets: populated.tickets.map((ticket) => ({
      ...ticket,
      distribution: {
        ...ticket.distribution,
        units: ticket.distribution.units.map((unit) => unit.unitId === 'op-Produce'
          ? { ...unit, obligation: { mode: 'reference' } }
          : unit),
      },
    })),
  };
  const finding = verifySequenceSteps(consumerOnly, fixtureView(), fixtureGraph())
    .find((entry) => entry.code === 'SEQUENCE_STEP_WITHOUT_IMPLEMENTER');
  assert.ok(finding);
  assert.equal(finding.stepId, 's1');
});

test('C006 a reversed recorded order is reported', async () => {
  const populated = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), fixtureView());
  const reversed = replaceSequenceUnit(populated, (unit) => ({
    ...unit,
    obligation: {
      ...unit.obligation,
      steps: unit.obligation.steps.map((step) => ({
        ...step,
        order: step.stepId === 's1' ? 1 : 0,
      })),
    },
  }));
  const finding = verifySequenceSteps(reversed, fixtureView(), fixtureGraph())
    .find((entry) => entry.code === 'SEQUENCE_ORDER_MISMATCH');
  assert.ok(finding);
  assert.equal(finding.unitId, 'seq-A-1');
});

test('C006 a step the view does not declare is unassigned', async () => {
  const populated = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), fixtureView());
  const invented = replaceSequenceUnit(populated, (unit) => ({
    ...unit,
    obligation: {
      ...unit.obligation,
      steps: [...unit.obligation.steps, { stepId: 'sX', operationId: 'Ghost', order: 9 }],
    },
  }));
  const finding = verifySequenceSteps(invented, fixtureView(), fixtureGraph())
    .find((entry) => entry.code === 'UNASSIGNED_SEQUENCE_STEP');
  assert.ok(finding);
  assert.equal(finding.stepId, 'sX');
});
