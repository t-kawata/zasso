// PX-308 @verifies C007
// A ticket that implements an operation alone has no sequence step to copy a line from.
// The view's obligation carries the spec lines; a line-0 placeholder sends the reader
// back to the unit id instead of to the design.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  populateTicketDistribution,
  verifyTicketDistribution,
} from '../../.claude/scripts/tickets/add-tickets-for-phase.js';

// [::TICKET::] PX-308 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-308 --for-spec --no-implementation-order`.
function fixtureView(specLines) {
  return {
    ownedOperationUnits: [{
      unitId: 'op-A',
      operationId: 'A',
      roleCandidate: 'implementer',
      obligation: { purpose: 'a', specLines },
    }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-308 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-308 --for-spec --no-implementation-order`.
function fixtureGraph() {
  return {
    distributionDigest: 'a'.repeat(64),
    nodes: [{ id: 'N0001', unitIds: ['op-A'] }],
  };
}

// [::TICKET::] PX-308 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-308 --for-spec --no-implementation-order`.
function fixtureDirsTree() {
  return {
    distribution: {
      digest: 'a'.repeat(64),
      units: { 'op-A': { nodeIds: ['N0001'], paths: ['src/a.rs'] } },
    },
  };
}

// [::TICKET::] PX-308 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-308 --for-spec --no-implementation-order`.
function fixturePhase() {
  return {
    id: -1,
    nodeIds: ['N0001'],
    tickets: [{ id: 1, phaseId: -1, nodeIds: ['N0001'], specPath: 'RFC.md' }],
  };
}

test('C007 an operation returns to its own spec line', async () => {
  const view = fixtureView([12]);
  const phase = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), view);
  const unit = phase.tickets[0].distribution.units.find((entry) => entry.unitId === 'op-A');
  assert.deepEqual(unit.specRefs.map((ref) => ref.line), [12]);
  assert.equal(unit.specRefs[0].path, 'RFC.md');
  assert.deepEqual(verifyTicketDistribution(phase, view, fixtureGraph(), fixtureDirsTree()), []);
});

test('C007 a line-bearing view whose ticket refs are all line 0 is reported', async () => {
  const view = fixtureView([12]);
  const phase = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), view);
  const unit = phase.tickets[0].distribution.units.find((entry) => entry.unitId === 'op-A');
  unit.specRefs = [{ path: 'RFC.md', line: 0, quote: 'op-A' }];

  const finding = verifyTicketDistribution(phase, view, fixtureGraph(), fixtureDirsTree())
    .find((entry) => entry.code === 'SPEC_REF_MISSING');
  assert.ok(finding);
  assert.equal(finding.unitId, 'op-A');
});

test('C007 no positive specLines keeps the line-0 fallback', async () => {
  const view = fixtureView([]);
  const phase = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), view);
  const unit = phase.tickets[0].distribution.units.find((entry) => entry.unitId === 'op-A');
  assert.deepEqual(unit.specRefs.map((ref) => ref.line), [0]);
  assert.equal(unit.specRefs[0].quote, 'op-A');
});

test('C007 every positive spec line becomes a reference', async () => {
  const view = fixtureView([12, 18]);
  const phase = await populateTicketDistribution(fixturePhase(), fixtureGraph(), fixtureDirsTree(), view);
  const unit = phase.tickets[0].distribution.units.find((entry) => entry.unitId === 'op-A');
  assert.deepEqual(unit.specRefs.map((ref) => ref.line), [12, 18]);
});
