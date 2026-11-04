// PX-356 @verifies C008
// The view can carry the same unitId in obligationUnits and in an owned array. Only the
// owned record carries the steps a ticket's distribution must keep, so an obligation row
// must never overwrite it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  viewUnitMap,
  populateTicketDistribution,
} = require('../../.claude/scripts/tickets/add-tickets-for-phase.js');

test('C008 an owned sequence record survives an obligation row for the same unit', () => {
// [::TICKET::] PX-356 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-356 --for-spec --no-implementation-order`.
  const view = {
    obligationUnits: [{ unitId: 'seq-S', relation: 'assigns', subject: 'S', kind: 'sequence' }],
    ownedSequenceUnits: [{
      unitId: 'seq-S',
      sequenceId: 'S',
      outcome: 'singleStep',
      steps: [{ stepId: 's1', operationId: 'A', order: 0 }],
    }],
  };

  const record = viewUnitMap(view).get('seq-S');

  assert.equal(record.outcome, 'singleStep');
  assert.equal((record.steps ?? []).length, 1);
});

test('C008 an obligation-only unit still resolves', () => {
  const view = { obligationUnits: [{ unitId: 'ctr-boundary-002', relation: 'carries' }] };

  assert.equal(viewUnitMap(view).get('ctr-boundary-002').relation, 'carries');
});

test('C008 the owned sequence steps reach the distribution record', async () => {
  const view = {
    packageId: 'pkg-A',
    ownedOperationUnits: [{ unitId: 'op-A', operationId: 'A', roleCandidate: 'implementer', obligation: {} }],
    ownedSequenceUnits: [{
      unitId: 'seq-S',
      sequenceId: 'S',
      outcome: 'singleStep',
      steps: [{ stepId: 's1', operationId: 'A', order: 0 }],
    }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [{ unitId: 'seq-S', relation: 'assigns', subject: 'S', kind: 'sequence' }],
  };
  const graph = {
    distributionDigest: 'a'.repeat(64),
    nodes: [{ id: 'N1', unitIds: ['op-A', 'seq-S'] }],
  };
  const dirsTree = { distribution: { digest: 'a'.repeat(64), units: {} } };
  const phase = { id: 0, nodeIds: ['N1'], tickets: [{ id: 1, phaseId: 0, nodeIds: ['N1'] }] };

  const populated = await populateTicketDistribution(phase, graph, dirsTree, view, null);
  const sequenceUnit = populated.tickets[0].distribution.units.find((unit) => unit.unitId === 'seq-S');

  assert.equal(sequenceUnit.obligation.mode, 'steps');
  assert.equal(sequenceUnit.obligation.steps.length, 1);
});
