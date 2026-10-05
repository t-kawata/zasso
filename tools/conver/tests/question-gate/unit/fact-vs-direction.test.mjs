// PX-234 @verifies C001
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
/**
 * A fact-question cannot reach the human.
 *
 * The rule is that what the records decide is settled by the AI and never asked.
 * A machine cannot match a design-tree node to an arbitrary document decision, so
 * the gate checks the thing it can: that each question accounts for the records the
 * run read. A question that names none of them has not shown that it looked, and a
 * ground the AI has not looked for is not an absent ground.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GRILL_SETTLE_RUN,
  GRILL_UPDATE_TREE,
  disposeFixture,
  materializeGrillFixture,
  questionBlock,
  runCommand,
} from '../../question-gate/helpers/fixture-workspace.mjs';

// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
function roundWith(block) {
  const fixture = materializeGrillFixture({ withPriorArtifacts: true, withNodes: 3 });
  runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'prior']);
  runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'next', '1']);
  runCommand(GRILL_UPDATE_TREE, [fixture.rfcDir, 'bind', '1', JSON.stringify(block)]);
  return fixture;
}

test('C001 postcondition: a question that names the record it read passes the gate', () => {
  const fixture = roundWith(questionBlock({
    settleTrace: 'EXPLAIN-RFC-SEED.md records the store as a file; it does not decide which experience comes first',
  }));
  try {
    const result = runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'check']);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    disposeFixture(fixture);
  }
});

test('C001 invariant: a question that names none of the records is refused, and the node is named', () => {
  const fixture = roundWith(questionBlock({ settleTrace: 'this one is the human’s' }));
  try {
    const result = runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'check']);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unread-prior-artifact/);
    assert.match(result.stderr, /Q1/, 'the reader is told which node was asked without looking');
  } finally {
    disposeFixture(fixture);
  }
});

test('C001 boundary: with no artifact to read, the rule does not apply and the round passes', () => {
  const fixture = materializeGrillFixture({ withPriorArtifacts: false, withNodes: 3 });
  try {
    runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'prior']);
    runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'next', '1']);
    runCommand(GRILL_UPDATE_TREE, [fixture.rfcDir, 'bind', '1', JSON.stringify(questionBlock({ settleTrace: 'no record in this package decides it' }))]);

    const result = runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'check']);
    assert.equal(result.status, 0, 'a package holding no record cannot be asked to name one');
  } finally {
    disposeFixture(fixture);
  }
});

test('C001 invariant: a block with no settle trace at all is refused', () => {
  const fixture = roundWith(questionBlock({ settleTrace: '' }));
  try {
    const result = runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'check']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing-settle-trace/);
  } finally {
    disposeFixture(fixture);
  }
});
