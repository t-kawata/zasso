// PX-322 @verifies C007
// The sequence order gate compares the ticket placement, not the copied order field
// with itself. Only local steps are checked: a package cannot see another package's
// ticket placement, and build order is not runtime sequence order.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyChain } from '../../.claude/scripts/sequences-slice/verify-chain.mjs';
import { buildChainFixture } from './helpers/px315-chain-fixture.mjs';

const STEP_1 = { stepId: 's1', operationId: 'A', order: 0, line: 1, quote: 'a' };
const STEP_2 = { stepId: 's2', operationId: 'B', order: 1, line: 2, quote: 'b' };

// [::TICKET::] PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-322 --for-spec --no-implementation-order`.
function ownedView() {
  return {
    packageId: 'pkg-1',
    ownedOperationUnits: [
      { unitId: 'op-A', operationId: 'A', roleCandidate: 'implementer', obligation: { specLines: [] } },
      { unitId: 'op-B', operationId: 'B', roleCandidate: 'implementer', obligation: { specLines: [] } },
    ],
    ownedSequenceUnits: [{ unitId: 'seq-S', sequenceId: 'S', outcome: 'direct', steps: [STEP_1, STEP_2] }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-322 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-322 --for-spec --no-implementation-order`.
function artifactSteps() {
  return [
    { id: 's1', sequence: 'S', operation: 'A', order: 0, line: 1, quote: 'a' },
    { id: 's2', sequence: 'S', operation: 'B', order: 1, line: 2, quote: 'b' },
  ];
}

test('C007 local steps placed in reverse (phase,ticket) order are reported', () => {
  const fixture = buildChainFixture({
    view: ownedView(),
    nodes: [{ id: 'N1', unitIds: ['op-A', 'seq-S'] }, { id: 'N2', unitIds: ['op-B'] }],
    sequences: [{ id: 'S', outcome: 'direct' }],
    steps: artifactSteps(),
    phases: [
      { id: 0, nodeIds: ['N2'], tickets: [{ id: 1, unitIds: ['op-B', 'seq-S'], obligations: { 'op-B': { mode: 'implement' }, 'seq-S': { mode: 'steps', steps: [STEP_2] } } }] },
      { id: 1, nodeIds: ['N1'], tickets: [{ id: 1, unitIds: ['op-A', 'seq-S'], obligations: { 'op-A': { mode: 'implement' }, 'seq-S': { mode: 'steps', steps: [STEP_1] } } }] },
    ],
  });

  const findings = verifyChain({ ...fixture, stage: 'split' }).findings;
  assert.ok(findings.some((finding) => finding.code === 'SEQUENCE_ORDER_MISMATCH' && finding.subject === 'seq-S'), JSON.stringify(findings));
});

test('C007 a foreign step is not checked for placement', () => {
  const view = {
    packageId: 'pkg-1',
    ownedOperationUnits: [{ unitId: 'op-A', operationId: 'A', roleCandidate: 'implementer', obligation: { specLines: [] } }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [{ unitId: 'xdir-S', sequenceId: 'S', outcome: 'direct', ownerPackageIds: ['pkg-1', 'pkg-2'], steps: [STEP_1, STEP_2] }],
    obligationUnits: [],
  };
  const fixture = buildChainFixture({
    view,
    nodes: [{ id: 'N1', unitIds: ['op-A', 'xdir-S'] }],
    sequences: [{ id: 'S', outcome: 'direct' }],
    steps: artifactSteps(),
    phases: [
      { id: 0, nodeIds: ['N1'], tickets: [{ id: 1, unitIds: ['op-A', 'xdir-S'], obligations: { 'op-A': { mode: 'implement' }, 'xdir-S': { mode: 'steps', steps: [STEP_1] } } }] },
    ],
  });

  const findings = verifyChain({ ...fixture, stage: 'split' }).findings;
  assert.equal(findings.some((finding) => finding.code === 'SEQUENCE_ORDER_MISMATCH'), false, JSON.stringify(findings));
});

test('C007 the recorded order inside one ticket is still checked', () => {
  const fixture = buildChainFixture({
    view: ownedView(),
    nodes: [{ id: 'N1', unitIds: ['op-A', 'op-B', 'seq-S'] }],
    sequences: [{ id: 'S', outcome: 'direct' }],
    steps: artifactSteps(),
    phases: [
      { id: 0, nodeIds: ['N1'], tickets: [{ id: 1, unitIds: ['op-A', 'op-B', 'seq-S'], obligations: { 'op-A': { mode: 'implement' }, 'op-B': { mode: 'implement' }, 'seq-S': { mode: 'steps', steps: [{ ...STEP_1, order: 1 }, { ...STEP_2, order: 0 }] } } }] },
    ],
  });

  const findings = verifyChain({ ...fixture, stage: 'split' }).findings;
  assert.ok(findings.some((finding) => finding.code === 'SEQUENCE_ORDER_MISMATCH'
    && String(finding.message).includes('seq-S')), JSON.stringify(findings));
});
