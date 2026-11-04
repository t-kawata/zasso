// PX-356 @verifies C003
// PX-356 @verifies C004
// PX-356 @verifies C005
// Operation ownership is package-wide and a step belongs to the phase that implements its
// operation. These tests hold the role resolution, the cross-phase reference and the
// phase-local step predicate together because they share one distribution record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  populateTicketDistribution,
  priorImplementedUnits,
  verifySequenceSteps,
} = require('../../.claude/scripts/tickets/add-tickets-for-phase.js');

const STEP = { stepId: 's1', operationId: 'A', order: 0, line: 1, quote: 'a' };

// [::TICKET::] PX-356 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-356 --for-spec --no-implementation-order`.
function viewWith({ operationRole = 'undecided', includeSequence = true } = {}) {
  return {
    packageId: 'pkg-A',
    ownedOperationUnits: [{
      unitId: 'op-A',
      operationId: 'A',
      roleCandidate: operationRole,
      ownerPackageIds: ['pkg-A', 'pkg-B'],
      obligation: {},
    }],
    ownedSequenceUnits: includeSequence
      ? [{ unitId: 'seq-S', sequenceId: 'S', outcome: 'singleStep', steps: [STEP] }]
      : [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-356 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-356 --for-spec --no-implementation-order`.
function graphWith(...nodeIds) {
  return {
    distributionDigest: 'a'.repeat(64),
    nodes: nodeIds.map((id) => ({ id, unitIds: ['op-A', 'seq-S'] })),
  };
}

// [::TICKET::] PX-356 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-356 --for-spec --no-implementation-order`.
function dirsTree() {
  return {
    distribution: {
      digest: 'a'.repeat(64),
      units: {
        'op-A': { nodeIds: ['N1'], paths: ['src/a.js'] },
        'seq-S': { nodeIds: ['N1'], paths: ['src/s.js'] },
      },
    },
  };
}

// [::TICKET::] PX-356 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-356 --for-spec --no-implementation-order`.
function phaseWith(id, nodeIds, tickets) {
  return { id, nodeIds, tickets };
}

// [::TICKET::] PX-356 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-356 --for-spec --no-implementation-order`.
function modeOf(ticket, unitId) {
  return ticket.distribution.units.find((unit) => unit.unitId === unitId).obligation.mode;
}

test('C003 a sole ledger owner implements an undecided operation', async () => {
  const map = { units: [{ unitId: 'op-A', kind: 'operation', owners: ['pkg-A'] }] };
  const populated = await populateTicketDistribution(
    phaseWith(0, ['N1'], [{ id: 1, phaseId: 0, nodeIds: ['N1'] }]),
    graphWith('N1'),
    dirsTree(),
    viewWith(),
    map,
  );
  const unit = populated.tickets[0].distribution.units.find((entry) => entry.unitId === 'op-A');

  assert.equal(unit.role, 'implementer');
  assert.equal(unit.obligation.mode, 'implement');
});

test('C003 an explicit consumer never creates an implementer', async () => {
  const map = { units: [{ unitId: 'op-A', kind: 'operation', role: 'consumer', owners: ['pkg-A'] }] };
  const populated = await populateTicketDistribution(
    phaseWith(0, ['N1'], [{ id: 1, phaseId: 0, nodeIds: ['N1'] }]),
    graphWith('N1'),
    dirsTree(),
    viewWith(),
    map,
  );
  const unit = populated.tickets[0].distribution.units.find((entry) => entry.unitId === 'op-A');

  assert.equal(unit.obligation.mode, 'reference');
});

test('C003 a multi-owner undecided operation invents no implementer', async () => {
  const map = { units: [{ unitId: 'op-A', kind: 'operation', owners: ['pkg-A', 'pkg-B'] }] };
  const populated = await populateTicketDistribution(
    phaseWith(0, ['N1'], [{ id: 1, phaseId: 0, nodeIds: ['N1'] }]),
    graphWith('N1'),
    dirsTree(),
    viewWith(),
    map,
  );
  const unit = populated.tickets[0].distribution.units.find((entry) => entry.unitId === 'op-A');

  assert.equal(unit.obligation.mode, 'reference');
});

test('C003 a sequence unit is not promoted to an operation role', async () => {
  const map = { units: [{ unitId: 'seq-S', kind: 'sequence', owners: ['pkg-A'] }] };
  const populated = await populateTicketDistribution(
    phaseWith(0, ['N1'], [{ id: 1, phaseId: 0, nodeIds: ['N1'] }]),
    graphWith('N1'),
    dirsTree(),
    viewWith({ operationRole: 'implementer' }),
    map,
  );
  const unit = populated.tickets[0].distribution.units.find((entry) => entry.unitId === 'seq-S');

  assert.equal(unit.role, null);
});

test('C004 a later phase references the prior durable key', async () => {
  const populated = await populateTicketDistribution(
    phaseWith(1, ['N1'], [{ id: 1, phaseId: 1, nodeIds: ['N1'] }]),
    graphWith('N1'),
    dirsTree(),
    viewWith({ operationRole: 'implementer' }),
    null,
    new Map([['op-A', 'P0-3']]),
  );
  const unit = populated.tickets[0].distribution.units.find((entry) => entry.unitId === 'op-A');

  assert.equal(unit.obligation.mode, 'reference');
  assert.equal(unit.obligation.implementerTicketKey, 'P0-3');
  assert.equal(
    populated.tickets.some((ticket) => ticket.distribution.units.some(
      (entry) => entry.unitId === 'op-A' && entry.obligation.mode === 'implement',
    )),
    false,
  );
});

test('C004 the lowest ticket id owns the operation regardless of array order', async () => {
  const populated = await populateTicketDistribution(
    phaseWith(0, ['N1', 'N2'], [
      { id: 2, phaseId: 0, nodeIds: ['N2'] },
      { id: 1, phaseId: 0, nodeIds: ['N1'] },
    ]),
    graphWith('N1', 'N2'),
    dirsTree(),
    viewWith({ operationRole: 'implementer' }),
    null,
  );

  assert.equal(modeOf(populated.tickets.find((ticket) => ticket.id === 1), 'op-A'), 'implement');
  assert.equal(modeOf(populated.tickets.find((ticket) => ticket.id === 2), 'op-A'), 'reference');
});

test('C004 only phases before the current one are prior', () => {
  const prior = {
    id: 0,
    tickets: [{ id: 3, distribution: { units: [{ unitId: 'op-A', kind: 'operation', obligation: { mode: 'implement' } }] } }],
  };
  const current = { id: 1, tickets: [] };
  const future = {
    id: 2,
    tickets: [{ id: 1, distribution: { units: [{ unitId: 'op-B', kind: 'operation', obligation: { mode: 'implement' } }] } }],
  };

  const priorMap = priorImplementedUnits({ phases: [prior, current, future] }, current);

  assert.equal(priorMap.get('op-A'), 'P0-3');
  assert.equal(priorMap.has('op-B'), false);
});

test('C005 a reference-only phase does not owe the prior step', () => {
  const phase = phaseWith(1, ['N1'], [{
    id: 1,
    phaseId: 1,
    distribution: {
      units: [
        { unitId: 'op-A', kind: 'operation', role: 'implementer', obligation: { mode: 'reference', implementerTicketKey: 'P0-3' } },
        { unitId: 'seq-S', kind: 'sequence', obligation: { mode: 'flow' } },
      ],
    },
  }]);
  const artifact = {
    sequences: [{ id: 'S', outcome: 'singleStep' }],
    steps: [{ id: 's1', sequence: 'S', operation: 'A', order: 0 }],
  };

  const findings = verifySequenceSteps(phase, viewWith({ operationRole: 'implementer' }), graphWith('N1'), artifact);

  assert.equal(findings.some((finding) => finding.code === 'MISSING_SEQUENCE_STEP'), false);
});

test('C005 the implementing phase still reports a missing step', () => {
  const phase = phaseWith(1, ['N1'], [{
    id: 1,
    phaseId: 1,
    distribution: {
      units: [
        { unitId: 'op-A', kind: 'operation', role: 'implementer', obligation: { mode: 'implement' } },
        { unitId: 'seq-S', kind: 'sequence', obligation: { mode: 'flow' } },
      ],
    },
  }]);
  const artifact = {
    sequences: [{ id: 'S', outcome: 'singleStep' }],
    steps: [{ id: 's1', sequence: 'S', operation: 'A', order: 0 }],
  };

  const findings = verifySequenceSteps(phase, viewWith({ operationRole: 'implementer' }), graphWith('N1'), artifact);

  assert.ok(findings.some((finding) => finding.code === 'MISSING_SEQUENCE_STEP'));
});
