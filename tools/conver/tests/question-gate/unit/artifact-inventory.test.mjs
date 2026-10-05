// PX-233 @verifies C005
// [::TICKET::] PX-233 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-233 --for-spec --no-implementation-order`.
/**
 * The artifacts grill and drill generate, frozen before either is edited.
 *
 * README.md states the terminal state as a count — 11 points at the root, 8 per
 * package — and every one of those points is something a command writes. A change
 * that adds a file, or stops writing one, moves that count without saying so. This
 * test is the saying-so: it is written and confirmed green against the current
 * implementation, so the ticket that edits the commands cannot move the inventory
 * without turning this red first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  disposeFixture,
  materializeDrillSession,
  materializeGrillFixture,
} from '../helpers/fixture-workspace.mjs';

const GRILL_ARTIFACTS = ['CheckList.md', 'DesignTree.json', 'RFC.md', 'Status.json'];
const DRILL_SESSION_ARTIFACTS = ['CheckList.md', 'DesignTree.json', 'Status.json'];

test('C005 postcondition: a grill run leaves exactly four artifacts in the package directory', () => {
  const fixture = materializeGrillFixture();
  try {
    assert.deepEqual([...fixture.files].sort(), GRILL_ARTIFACTS);
  } finally {
    disposeFixture(fixture);
  }
});

test('C005 postcondition: a drill session leaves exactly three artifacts under <rfcDir>/drills', () => {
  const fixture = materializeDrillSession();
  try {
    assert.deepEqual([...fixture.files].sort(), DRILL_SESSION_ARTIFACTS);
    assert.match(fixture.sessionDir, /drills$/);
  } finally {
    disposeFixture(fixture);
  }
});

test('C005 invariant: a second grill initialization adds no artifact to the same directory', () => {
  const fixture = materializeGrillFixture();
  try {
    const again = materializeGrillFixture();
    disposeFixture(again);
    assert.deepEqual([...fixture.files].sort(), GRILL_ARTIFACTS, 'the inventory is a property of the run, not of the moment');
  } finally {
    disposeFixture(fixture);
  }
});
