// PX-322 @verifies C007
// PX-348 @verifies C001 C002 C003
// The sequence order gate compares the ticket placement only for a real data prerequisite.
// Narrative order alone is not an implementation constraint; foreign steps are excluded
// because another package's ticket placement is not visible here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyChain } from '../../.claude/scripts/sequences-slice/verify-chain.mjs';
import { buildChainFixture } from './helpers/px315-chain-fixture.mjs';

const STEP_1 = { stepId: 's1', operationId: 'A', order: 0, line: 1, quote: 'a' };
const STEP_2 = { stepId: 's2', operationId: 'B', order: 1, line: 2, quote: 'b' };
const DATA_PREREQUISITE = { s1: { produces: ['object:X'] }, s2: { consumes: ['object:X'] } };

// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
function viewSteps(contracts = {}) {
  return [
    { ...STEP_1, contract: contracts.s1 ?? {} },
    { ...STEP_2, contract: contracts.s2 ?? {} },
  ];
}

// [::TICKET::] PX-322, PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-322|PX-348) --for-spec --no-implementation-order`.
function ownedView(contracts = {}) {
  return {
    packageId: 'pkg-1',
    ownedOperationUnits: [
      { unitId: 'op-A', operationId: 'A', roleCandidate: 'implementer', obligation: { specLines: [] } },
      { unitId: 'op-B', operationId: 'B', roleCandidate: 'implementer', obligation: { specLines: [] } },
    ],
    ownedSequenceUnits: [{ unitId: 'seq-S', sequenceId: 'S', outcome: 'direct', steps: viewSteps(contracts) }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-322, PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-322|PX-348) --for-spec --no-implementation-order`.
function artifactSteps(contracts = {}) {
  return [
    { id: 's1', sequence: 'S', operation: 'A', order: 0, line: 1, quote: 'a', contract: contracts.s1 ?? {} },
    { id: 's2', sequence: 'S', operation: 'B', order: 1, line: 2, quote: 'b', contract: contracts.s2 ?? {} },
  ];
}

// [::TICKET::] PX-348 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-348 --for-spec --no-implementation-order`.
function reversedPhaseFixture(contracts) {
  const steps = viewSteps(contracts);
  return buildChainFixture({
    view: ownedView(contracts),
    nodes: [{ id: 'N1', unitIds: ['op-A', 'seq-S'] }, { id: 'N2', unitIds: ['op-B'] }],
    sequences: [{ id: 'S', outcome: 'direct' }],
    steps: artifactSteps(contracts),
    phases: [
      { id: 0, nodeIds: ['N2'], tickets: [{ id: 1, unitIds: ['op-B', 'seq-S'], obligations: { 'op-B': { mode: 'implement' }, 'seq-S': { mode: 'steps', steps: [steps[1]] } } }] },
      { id: 1, nodeIds: ['N1'], tickets: [{ id: 1, unitIds: ['op-A', 'seq-S'], obligations: { 'op-A': { mode: 'implement' }, 'seq-S': { mode: 'steps', steps: [steps[0]] } } }] },
    ],
  });
}

test('C002 a real data prerequisite placed in reverse (phase,ticket) order is reported', () => {
  const fixture = reversedPhaseFixture(DATA_PREREQUISITE);

  const findings = verifyChain({ ...fixture, stage: 'split' }).findings;
  assert.ok(findings.some((finding) => finding.code === 'SEQUENCE_ORDER_MISMATCH' && finding.subject === 'seq-S'), JSON.stringify(findings));
});

test('C002 independent steps placed in reverse (phase,ticket) order are not a placement finding', () => {
  const fixture = reversedPhaseFixture({});

  const findings = verifyChain({ ...fixture, stage: 'split' }).findings;
  assert.equal(findings.some((finding) => finding.code === 'SEQUENCE_ORDER_MISMATCH'), false, JSON.stringify(findings));
});

test('C002 a data prerequisite in one ticket is not a placement finding', () => {
  const steps = viewSteps(DATA_PREREQUISITE);
  const fixture = buildChainFixture({
    view: ownedView(DATA_PREREQUISITE),
    nodes: [{ id: 'N1', unitIds: ['op-A', 'op-B', 'seq-S'] }],
    sequences: [{ id: 'S', outcome: 'direct' }],
    steps: artifactSteps(DATA_PREREQUISITE),
    phases: [{
      id: 0,
      nodeIds: ['N1'],
      tickets: [{
        id: 1,
        unitIds: ['op-A', 'op-B', 'seq-S'],
        obligations: {
          'op-A': { mode: 'implement' },
          'op-B': { mode: 'implement' },
          'seq-S': { mode: 'steps', steps },
        },
      }],
    }],
  });

  const findings = verifyChain({ ...fixture, stage: 'split' }).findings;
  assert.equal(findings.some((finding) => finding.code === 'SEQUENCE_ORDER_MISMATCH'), false, JSON.stringify(findings));
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
