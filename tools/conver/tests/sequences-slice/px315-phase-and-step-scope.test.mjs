// PX-315 split-side contracts: phase-local unit and step verification, foreign step
// ownership, global implementer uniqueness and both-direction ctr records.
// @verifies C003
// @verifies C004
// @verifies C006
// @verifies C010
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { verifyChain } from '../../.claude/scripts/sequences-slice/verify-chain.mjs';
import { collectViewUnits } from '../../.claude/scripts/sequences-slice/lib/distribution-map.mjs';
import { buildChainFixture } from './helpers/px315-chain-fixture.mjs';

const require = createRequire(import.meta.url);
const {
  verifyTicketUnits,
  verifyTicketDistribution,
  verifySequenceSteps,
} = require('../../.claude/scripts/tickets/add-tickets-for-phase.js');
const { renderPhaseDistribution } = require('../../.claude/scripts/tickets/show-phase-distribution.js');

const STEP_1 = { stepId: 's1', operationId: 'A', order: 0, line: 1, quote: 'a' };
const STEP_2 = { stepId: 's2', operationId: 'B', order: 1, line: 2, quote: 'b' };

// [::TICKET::] PX-315 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-315) --for-spec --no-implementation-order`.
function twoPhaseView() {
  return {
    packageId: 'pkg-A',
    ownedOperationUnits: [
      { unitId: 'op-A', operationId: 'A', roleCandidate: 'implementer', obligation: { specLines: [] } },
      { unitId: 'op-B', operationId: 'B', roleCandidate: 'implementer', obligation: { specLines: [] } },
    ],
    ownedSequenceUnits: [{ unitId: 'seq-S', sequenceId: 'S', steps: [STEP_1, STEP_2] }],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

test('C003 a phase verifies only the units and steps reachable from its nodes', () => {
  const view = twoPhaseView();
  const fixture = buildChainFixture({
    view,
    nodes: [
      { id: 'N1', unitIds: ['op-A', 'seq-S'] },
      { id: 'N2', unitIds: ['op-B', 'seq-S'] },
    ],
    sequences: [{ id: 'S', outcome: 'direct' }],
    steps: [
      { id: 's1', sequence: 'S', operation: 'A', order: 0, line: 1, contract: {}, contract_prose: 'a' },
      { id: 's2', sequence: 'S', operation: 'B', order: 1, line: 2, contract: {}, contract_prose: 'b' },
    ],
    phases: [
      {
        id: 0,
        nodeIds: ['N1'],
        tickets: [{ id: 1, unitIds: ['op-A', 'seq-S'], obligations: { 'op-A': { mode: 'implement' }, 'seq-S': { mode: 'steps', steps: [STEP_1] } } }],
      },
      {
        id: 1,
        nodeIds: ['N2'],
        tickets: [{ id: 1, unitIds: ['op-B', 'seq-S'], obligations: { 'op-B': { mode: 'implement' }, 'seq-S': { mode: 'steps', steps: [STEP_2] } } }],
      },
    ],
  });

  const phase0 = fixture.tickets.phases[0];
  const phase1 = fixture.tickets.phases[1];
  assert.deepEqual(verifyTicketUnits(phase0, fixture.graph), { valid: true, missingUnitIds: [], inventedUnitIds: [] });
  assert.deepEqual(verifyTicketUnits(phase1, fixture.graph), { valid: true, missingUnitIds: [], inventedUnitIds: [] });
  assert.equal(verifyTicketDistribution(phase0, view, fixture.graph, fixture.dirsTree)
    .some((finding) => finding.code === 'MISSING_UNIT_AT_LAYER'), false);
  assert.equal(verifySequenceSteps(phase0, view, fixture.graph, fixture.artifact)
    .some((finding) => finding.code === 'MISSING_SEQUENCE_STEP'), false);
  assert.equal(verifySequenceSteps(phase1, view, fixture.graph, fixture.artifact)
    .some((finding) => finding.code === 'MISSING_SEQUENCE_STEP'), false);
});

test('C004 a foreign step of a cross-boundary sequence is not this package omission', () => {
  const view = {
    packageId: 'pkg-A',
    ownedOperationUnits: [{ unitId: 'op-A', operationId: 'A', roleCandidate: 'implementer', obligation: {} }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [{
      unitId: 'xdir-S',
      sequenceId: 'S',
      ownerPackageIds: ['pkg-A', 'pkg-B'],
      steps: [STEP_1, STEP_2],
    }],
    obligationUnits: [],
  };
  const fixture = buildChainFixture({
    view,
    nodes: [
      { id: 'N1', unitIds: ['op-A'] },
      { id: 'N2', unitIds: ['xdir-S'] },
    ],
    sequences: [{ id: 'S', outcome: 'direct' }],
    steps: [
      { id: 's1', sequence: 'S', operation: 'A', order: 0, line: 1, contract: {}, contract_prose: 'a' },
      { id: 's2', sequence: 'S', operation: 'B', order: 1, line: 2, contract: {}, contract_prose: 'b' },
    ],
    phases: [{
      id: 0,
      nodeIds: ['N1', 'N2'],
      tickets: [{ id: 1, unitIds: ['op-A', 'xdir-S'], obligations: { 'op-A': { mode: 'implement' }, 'xdir-S': { mode: 'steps', steps: [STEP_1] } } }],
    }],
  });

  const findings = verifyChain({ ...fixture, stage: 'split' }).findings;
  assert.equal(findings.some((finding) => finding.code === 'TICKET_STEP_MISSING' && finding.subject === 's2'), false);
  assert.equal(findings.some((finding) => finding.code === 'TICKET_STEP_MISSING' && finding.subject === 's1'), false);

  fixture.tickets.phases[0].tickets[0].distribution.units
    .find((unit) => unit.unitId === 'xdir-S').obligation.steps = [];
  const ownedMissing = verifyChain({ ...fixture, stage: 'split' }).findings;
  assert.ok(ownedMissing.some((finding) => finding.code === 'TICKET_STEP_MISSING' && finding.subject === 's1'));
});

test('C006 an operation implemented in two phases is a duplicate', () => {
  const view = {
    packageId: 'pkg-A',
    ownedOperationUnits: [{ unitId: 'op-A', operationId: 'A', roleCandidate: 'implementer', obligation: {} }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
  const fixture = buildChainFixture({
    view,
    nodes: [
      { id: 'N1', unitIds: ['op-A'] },
      { id: 'N2', unitIds: ['op-A'] },
    ],
    sequences: [],
    steps: [],
    phases: [
      { id: 0, nodeIds: ['N1'], tickets: [{ id: 1, unitIds: ['op-A'], obligations: { 'op-A': { mode: 'implement' } } }] },
      { id: 1, nodeIds: ['N2'], tickets: [{ id: 1, unitIds: ['op-A'], obligations: { 'op-A': { mode: 'implement' } } }] },
    ],
  });

  const findings = verifyChain({ ...fixture, stage: 'split' }).findings;
  assert.ok(findings.some((finding) => finding.code === 'DUPLICATE_UNIT_AT_TICKET' && finding.subject === 'op-A'));
});

test('C006 an implementer operation with no implementing ticket is missing', () => {
  const view = {
    packageId: 'pkg-A',
    ownedOperationUnits: [{ unitId: 'op-A', operationId: 'A', roleCandidate: 'implementer', obligation: {} }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
  const fixture = buildChainFixture({
    view,
    nodes: [{ id: 'N1', unitIds: ['op-A'] }],
    sequences: [],
    steps: [],
    phases: [{ id: 0, nodeIds: ['N1'], tickets: [{ id: 1, unitIds: ['op-A'], obligations: { 'op-A': { mode: 'reference' } } }] }],
  });

  const findings = verifyChain({ ...fixture, stage: 'split' }).findings;
  assert.ok(findings.some((finding) => finding.code === 'MISSING_IMPLEMENTER' && finding.subject === 'op-A'));
});

test('C003 the phase distribution lists only the phase units', () => {
  const view = twoPhaseView();
  const graph = {
    nodes: [
      { id: 'N1', unitIds: ['op-A', 'seq-S'] },
      { id: 'N2', unitIds: ['op-B', 'seq-S'] },
    ],
  };
  const phase = { id: 0, nodeIds: ['N1'], name: 'P0' };
  const artifact = { steps: [
    { id: 's1', sequence: 'S', operation: 'A', order: 0 },
    { id: 's2', sequence: 'S', operation: 'B', order: 1 },
  ] };
  const rendered = renderPhaseDistribution({ phase, view, graph, artifact });
  assert.match(rendered, /op-A/);
  assert.doesNotMatch(rendered, /op-B/);
});

test('C010 both ctr directions survive the view projection', () => {
  const units = collectViewUnits({
    obligationUnits: [
      { unitId: 'ctr-X', direction: 'provides', counterpart: 'pkg-P' },
      { unitId: 'ctr-X', direction: 'consumes', counterpart: 'pkg-C' },
    ],
  });
  assert.equal(units.get('ctr-X').records.length, 2);
  assert.deepEqual(units.get('ctr-X').records.map((record) => record.direction).sort(), ['consumes', 'provides']);
  assert.equal(units.get('ctr-X').record.direction, 'provides');
});
