// PX-308 @verifies C004
// The graph already knows which units a node carries. Copying them into the ticket by hand
// is the one step where an author can silently drop one; the machine can append them.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appendNodeUnitIds } from '../../.claude/scripts/tickets/add-tickets-for-phase.js';

// [::TICKET::] PX-308 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-308 --for-spec --no-implementation-order`.
function fixtureGraph() {
  return {
    nodes: [
      { id: 'N0001', unitIds: ['op-A', 'seq-B'] },
      { id: 'N0002', unitIds: ['op-C'] },
    ],
  };
}

test('C004 a ticket whose node carries units receives them in order', async () => {
  const appended = await appendNodeUnitIds([{ id: 1, nodeIds: ['N0001'] }], fixtureGraph());
  assert.deepEqual(appended[0].nodeIds, ['N0001', 'op-A', 'seq-B']);
});

test('C004 a second run appends nothing and the unit ids remain unique', async () => {
  const once = await appendNodeUnitIds([{ id: 1, nodeIds: ['N0001'] }], fixtureGraph());
  const twice = await appendNodeUnitIds(once, fixtureGraph());
  assert.deepEqual(twice[0].nodeIds, ['N0001', 'op-A', 'seq-B']);
  assert.equal(new Set(twice[0].nodeIds).size, twice[0].nodeIds.length);
});

test('C004 the input ticket is not mutated', async () => {
  const input = [{ id: 1, nodeIds: ['N0001'] }];
  await appendNodeUnitIds(input, fixtureGraph());
  assert.deepEqual(input[0].nodeIds, ['N0001']);
});

test('C004 a ticket owns the units of every node it names', async () => {
  const appended = await appendNodeUnitIds([{ id: 1, nodeIds: ['N0001', 'N0002'] }], fixtureGraph());
  assert.deepEqual(appended[0].nodeIds, ['N0001', 'N0002', 'op-A', 'seq-B', 'op-C']);
});
