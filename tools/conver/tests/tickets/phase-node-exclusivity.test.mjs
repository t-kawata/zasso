// PX-321 @verifies C003
// A ticket may name only graph nodes of its own phase. Distribution unit ids are not
// graph nodes and must not be mistaken for cross-phase work.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { verifyNodeCoverage } from '../../.claude/scripts/tickets/add-tickets-for-phase.js';
import { checkPhase } from '../../.claude/scripts/tickets/verify-all-ticket-coverage.js';

// [::TICKET::] PX-321 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-321 --for-spec --no-implementation-order`.
function phaseWith(nodeIds, ticketNodeIds) {
  return { id: 0, nodeIds, tickets: [{ id: 1, phaseId: 0, nodeIds: ticketNodeIds, contracts: [] }] };
}

test('C003 a graph node outside the phase fails both verifiers', () => {
  const crossing = phaseWith(['N0001'], ['N0001', 'N0002']);
  assert.equal(verifyNodeCoverage(crossing).valid, false);
  assert.deepEqual(verifyNodeCoverage(crossing).extraNodeIds, ['N0002']);
  assert.equal(checkPhase(crossing).valid, false);
});

test('C003 unit ids are not extra nodes', () => {
  const withUnits = phaseWith(['N0001'], ['N0001', 'op-A', 'seq-S']);
  assert.equal(verifyNodeCoverage(withUnits).valid, true);
  assert.deepEqual(verifyNodeCoverage(withUnits).extraNodeIds, []);
  assert.equal(checkPhase(withUnits).valid, true);
});
