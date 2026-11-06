// PX-385 @verifies C005
// A populated status column is not an empty-column property obligation. The registry
// keeps the obligation only when the pinned column is actually empty for the operation.
import test from 'node:test';
import assert from 'node:assert/strict';

import { propertyObligations } from '../../.claude/scripts/shared-obligations/registry.mjs';

const COLUMNS = [{ name: 'initial_status' }, { name: 'allowed_status_transitions' }];

/** One active operation with a status envelope. */
// [::TICKET::] PX-385 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-385 --for-spec --no-implementation-order`.
function operationWithEnvelope() {
  return {
    id: 'Admit',
    disposition: 'active',
    initial_status: 'Pending',
    allowed_status_transitions: { Pending: ['Settled'], Settled: [] },
  };
}

test('C005 a populated status column produces no property obligation', () => {
  const artifact = { pins: { columns: COLUMNS }, operations: [operationWithEnvelope()] };
  assert.deepEqual(propertyObligations(artifact), []);
});

test('C005 an empty status column produces one named property obligation', () => {
  const artifact = {
    pins: { columns: COLUMNS },
    operations: [{ id: 'Admit', disposition: 'active', initial_status: '', allowed_status_transitions: null }],
  };
  const obligations = propertyObligations(artifact);
  assert.equal(obligations.length, 2);
  assert.deepEqual(obligations.map((entry) => entry.id).sort(), [
    'PROP:Admit:allowed_status_transitions',
    'PROP:Admit:initial_status',
  ]);
});
