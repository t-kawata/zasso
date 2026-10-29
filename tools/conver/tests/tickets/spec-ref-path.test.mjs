// PX-321 @verifies C004
// A split-created ticket has no specPath. The spec reference must still name the design
// source, and an empty path is a named defect rather than a line number with no file.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  populateTicketDistribution,
  verifyTicketDistribution,
} from '../../.claude/scripts/tickets/add-tickets-for-phase.js';

// [::TICKET::] PX-321 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-321 --for-spec --no-implementation-order`.
function fixtureView() {
  return {
    packageId: 'pkg',
    ownedOperationUnits: [{ unitId: 'op-A', operationId: 'A', roleCandidate: 'implementer', obligation: { specLines: [12] } }],
    ownedSequenceUnits: [],
    crossBoundarySequenceUnits: [],
    obligationUnits: [],
  };
}

// [::TICKET::] PX-321 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-321 --for-spec --no-implementation-order`.
function fixtureGraph() {
  return { sourceFile: 'RFC.md', distributionDigest: 'a'.repeat(64), nodes: [{ id: 'N0001', unitIds: ['op-A'] }] };
}

// [::TICKET::] PX-321 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-321 --for-spec --no-implementation-order`.
function fixtureDirs() {
  return { distribution: { digest: 'a'.repeat(64), units: { 'op-A': { nodeIds: ['N0001'], paths: ['src/a.js'] } } } };
}

// [::TICKET::] PX-321 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-321 --for-spec --no-implementation-order`.
function phaseWith(ticket) {
  return { id: 0, nodeIds: ['N0001'], tickets: [{ id: 1, phaseId: 0, nodeIds: ['N0001', 'op-A'], contracts: [], ...ticket }] };
}

test('C004 a ticket without specPath falls back to the graph sourceFile', async () => {
  const populated = await populateTicketDistribution(phaseWith({}), fixtureGraph(), fixtureDirs(), fixtureView(), null);
  const unit = populated.tickets[0].distribution.units.find((entry) => entry.unitId === 'op-A');
  assert.equal(unit.specRefs[0].path, 'RFC.md');
  assert.deepEqual(verifyTicketDistribution(populated, fixtureView(), fixtureGraph(), fixtureDirs()), []);
});

test('C004 an explicit specPath overrides the graph sourceFile', async () => {
  const populated = await populateTicketDistribution(phaseWith({ specPath: 'CUSTOM.md' }), fixtureGraph(), fixtureDirs(), fixtureView(), null);
  const unit = populated.tickets[0].distribution.units.find((entry) => entry.unitId === 'op-A');
  assert.equal(unit.specRefs[0].path, 'CUSTOM.md');
});

test('C004 an empty spec reference path is SPEC_REF_MISSING', async () => {
  const populated = await populateTicketDistribution(phaseWith({}), fixtureGraph(), fixtureDirs(), fixtureView(), null);
  const unit = populated.tickets[0].distribution.units.find((entry) => entry.unitId === 'op-A');
  unit.specRefs = [{ path: '', line: 12, quote: 'op-A' }];
  const findings = verifyTicketDistribution(populated, fixtureView(), fixtureGraph(), fixtureDirs());
  assert.ok(findings.some((finding) => finding.code === 'SPEC_REF_MISSING' && finding.unitId === 'op-A'));
});
