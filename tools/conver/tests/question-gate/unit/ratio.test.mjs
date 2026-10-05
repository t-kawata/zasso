// PX-234 @verifies C001
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
/**
 * The question count follows the artifacts, not the node count.
 *
 * This is the property the transplant exists for: two packages with the same
 * number of design decisions ask different numbers of questions, because one of
 * them already holds the records that decide them. A ratio that tracked the node
 * count would mean the artifacts were being read but not used.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GRILL_SETTLE_RUN,
  disposeFixture,
  materializeGrillFixture,
  readTree,
  runCommand,
} from '../../question-gate/helpers/fixture-workspace.mjs';

const NODE_COUNT = 3;

test('C001 postcondition: the same nodes ask nothing when the artifacts ground them', () => {
  const groundedRun = materializeGrillFixture({ withPriorArtifacts: true, withNodes: NODE_COUNT, grounded: true });
  try {
    runCommand(GRILL_SETTLE_RUN, [groundedRun.rfcDir, 'prior']);
    const refused = runCommand(GRILL_SETTLE_RUN, [groundedRun.rfcDir, 'next', '3']);

    assert.notEqual(refused.status, 0, 'nothing is open, so no round is opened');
    assert.equal((readTree(groundedRun.rfcDir).questions ?? []).length, 0);
  } finally {
    disposeFixture(groundedRun);
  }
});

test('C001 boundary: the same nodes ask when the artifacts do not ground them', () => {
  const openRun = materializeGrillFixture({ withPriorArtifacts: true, withNodes: NODE_COUNT, grounded: false });
  try {
    runCommand(GRILL_SETTLE_RUN, [openRun.rfcDir, 'prior']);
    const opened = runCommand(GRILL_SETTLE_RUN, [openRun.rfcDir, 'next', '2']);

    assert.equal(opened.status, 0);
    assert.equal(readTree(openRun.rfcDir).questions.length, 2, 'the undecided nodes reach a round');
  } finally {
    disposeFixture(openRun);
  }
});

test('C001 invariant: the axes a round may open are capped, so a round stays readable', () => {
  const fixture = materializeGrillFixture({ withPriorArtifacts: true, withNodes: 8 });
  try {
    runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'prior']);
    const asked = runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'next', '9']);

    assert.notEqual(asked.status, 0, 'a round larger than the axes cap is refused rather than opened');
    assert.match(asked.stderr, /at most 3/);
  } finally {
    disposeFixture(fixture);
  }
});
