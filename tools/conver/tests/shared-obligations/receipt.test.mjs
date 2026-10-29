import test from 'node:test';
import assert from 'node:assert/strict';

import { validateReceipt } from '../../.claude/scripts/shared-obligations/evidence.mjs';

// [::TICKET::] PX-289 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-289 --for-spec --no-implementation-order`.
test('a receipt whose input digest differs is stale', () => {
  const receipt = { phase: 8, inputs: { artifact: 'old' }, outputs: { 'readings-uncovered.jsonl': 'x' } };
  const validity = validateReceipt(receipt, { artifact: 'new', worklist: 'w' });
  assert.equal(validity.valid, false);
  assert.equal(validity.code, 'STALE_RECEIPT');
  assert.deepEqual(validity.mismatches, ['artifact']);
});

// [::TICKET::] PX-289 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-289 --for-spec --no-implementation-order`.
test('a receipt whose inputs all match is valid', () => {
  const receipt = { phase: 8, inputs: { artifact: 'same', worklist: 'w' } };
  const validity = validateReceipt(receipt, { artifact: 'same', worklist: 'w' });
  assert.equal(validity.valid, true);
  assert.equal(validity.code, null);
});
