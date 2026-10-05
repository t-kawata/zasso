// PX-234 @verifies C002
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
/**
 * The zero-question run.
 *
 * When the records decide everything, the run asks nothing and still completes.
 * That is not a degenerate case to be tolerated — it is the outcome the mechanism
 * exists to make reachable, and the point at which the human's judgement is spent
 * nowhere because it was needed nowhere.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GRILL_SETTLE_RUN,
  GRILL_UPDATE_TREE,
  disposeFixture,
  materializeGrillFixture,
  readTree,
  runCommand,
} from '../../question-gate/helpers/fixture-workspace.mjs';

test('C002 postcondition: a package whose every node is grounded completes with nothing asked', () => {
  const fixture = materializeGrillFixture({ withPriorArtifacts: true, withNodes: 3, grounded: true });
  try {
    assert.equal(runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'prior']).status, 0);
    assert.equal(runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'check']).status, 0);

    const verdict = runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'answers']);
    assert.equal(verdict.status, 0, verdict.stdout);
    assert.match(verdict.stdout, /answers OK: there was nothing to ask/);
    assert.equal((readTree(fixture.rfcDir).questions ?? []).length, 0, 'no question block was opened');
  } finally {
    disposeFixture(fixture);
  }
});

test('C002 invariant: next refuses to open a round when no point is open', () => {
  const fixture = materializeGrillFixture({ withPriorArtifacts: true, withNodes: 3, grounded: true });
  try {
    const refused = runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'next', '3']);

    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /no point is open/);
  } finally {
    disposeFixture(fixture);
  }
});

test('C002 postcondition: a grounded run leaves open-count at zero, so the command can continue', () => {
  const fixture = materializeGrillFixture({ withPriorArtifacts: true, withNodes: 3, grounded: true });
  try {
    const counted = runCommand(GRILL_UPDATE_TREE, [fixture.rfcDir, 'open-count']);

    assert.equal(counted.status, 0);
    assert.equal(JSON.parse(counted.stdout).openCount, 0, 'the completion condition the command already used is reachable');
  } finally {
    disposeFixture(fixture);
  }
});
