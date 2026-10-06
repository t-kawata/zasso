// PX-234 @verifies C001
// PX-234 @verifies C002
// PX-234 @verifies C003
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
/**
 * The question-gate driver, against a real package directory.
 *
 * Every assertion here is about a value a caller branches on — an exit code, a
 * sentence on stderr, a field in the tree — because that is what the two commands
 * consume. The core's own properties are asserted against fixtures in
 * tests/question-gate/unit/; this file asserts that the driver wires them to the
 * files the commands read and write.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FIXTURE_SETTLEMENT_GROUND,
  GRILL_SETTLE_RUN,
  GRILL_UPDATE_TREE,
  disposeFixture,
  materializeGrillFixture,
  questionBlock,
  readTree,
  runCommand,
} from '../../question-gate/helpers/fixture-workspace.mjs';

const prior = (dir) => runCommand(GRILL_SETTLE_RUN, [dir, 'prior']);
const next = (dir, n) => runCommand(GRILL_SETTLE_RUN, [dir, 'next', String(n)]);
const check = (dir) => runCommand(GRILL_SETTLE_RUN, [dir, 'check']);
const answers = (dir) => runCommand(GRILL_SETTLE_RUN, [dir, 'answers']);
const bind = (dir, number, block) =>
  runCommand(GRILL_UPDATE_TREE, [dir, 'bind', String(number), JSON.stringify(block)]);
const settle = (dir, nodeId, settlement) =>
  runCommand(GRILL_UPDATE_TREE, [dir, 'settle', nodeId, JSON.stringify(settlement)]);

// [::TICKET::] PX-237 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-237 --for-spec --no-implementation-order`.
test('C001 postcondition: prior records the scan and prints what the artifacts decide', () => {
  const fixture = materializeGrillFixture({ withPriorArtifacts: true, withNodes: 3 });
  try {
    const result = prior(fixture.rfcDir);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /EXPLAIN-RFC-SEED\.md/, 'the artifact carrying decisions is named');
    assert.match(result.stdout, /the store is a file/, 'and the decision it carries');

    const scan = readTree(fixture.rfcDir).priorScan;
    // What was read, not what contributed: RFC.md is read and decides nothing (it has
    // no heading carrying a paragraph), so it belongs here all the same. A record
    // derived from the entries produced would have hidden it, and the gate would then
    // refuse a settle trace that names it truthfully.
    assert.deepEqual(scan.artifacts, ['RFC-SEED.md', 'INFO-RFC-SEED.md', 'EXPLAIN-RFC-SEED.md', 'RFC.md']);
    assert.equal(scan.decisions.length > 0, true);
  } finally {
    disposeFixture(fixture);
  }
});

test('C002 postcondition: settle records decision, ground and override, and resolves the node', () => {
  const fixture = materializeGrillFixture({ withPriorArtifacts: true, withNodes: 2 });
  try {
    prior(fixture.rfcDir);
    const result = settle(fixture.rfcDir, 'Q1', {
      decision: 'the session store is a file',
      ground: FIXTURE_SETTLEMENT_GROUND,
      override: 'a second writer appears',
    });

    assert.equal(result.status, 0, result.stderr);
    const node = readTree(fixture.rfcDir).nodes[0];
    assert.equal(node.status, 'resolved');
    assert.equal(node.questions.at(-1).ground, FIXTURE_SETTLEMENT_GROUND);
    assert.equal(node.questions.at(-1).source, 'ai');
    assert.equal(node.questions.at(-1).override, 'a second writer appears');
  } finally {
    disposeFixture(fixture);
  }
});

test('C002 invariant: a settlement with no ground is refused and the tree is byte-unchanged', () => {
  const fixture = materializeGrillFixture({ withNodes: 2 });
  try {
    const before = JSON.stringify(readTree(fixture.rfcDir));
    const result = settle(fixture.rfcDir, 'Q1', { decision: 'd', override: 'o' });

    assert.notEqual(result.status, 0, 'a settlement resting on nothing is not recorded');
    assert.equal(JSON.stringify(readTree(fixture.rfcDir)), before);
  } finally {
    disposeFixture(fixture);
  }
});

test('C002 invariant: a settlement carrying a ground but no override is refused', () => {
  const fixture = materializeGrillFixture({ withPriorArtifacts: true, withNodes: 2 });
  try {
    prior(fixture.rfcDir);
    const result = settle(fixture.rfcDir, 'Q1', { decision: 'd', ground: FIXTURE_SETTLEMENT_GROUND });
    assert.notEqual(result.status, 0, 'a settlement that cannot say when it would be overturned is not recorded');
  } finally {
    disposeFixture(fixture);
  }
});

test('C002 invariant: a ground the run never read is not a ground it has', () => {
  const fixture = materializeGrillFixture({ withPriorArtifacts: true, withNodes: 2 });
  try {
    prior(fixture.rfcDir);
    const result = settle(fixture.rfcDir, 'Q1', {
      decision: 'd',
      ground: 'a record this run never opened',
      override: 'o',
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /question/);
  } finally {
    disposeFixture(fixture);
  }
});

test('C003 invariant: a settlement offered on a forbidden inference is refused by name', () => {
  const fixture = materializeGrillFixture({ withPriorArtifacts: true, withNodes: 2 });
  try {
    prior(fixture.rfcDir);
    const result = settle(fixture.rfcDir, 'Q1', {
      decision: 'd',
      ground: FIXTURE_SETTLEMENT_GROUND,
      override: 'o',
      inferences: [{ kind: 'weight-alone-does-not-bind', evidence: 'this is a design decision, so it is the human\u2019s' }],
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /weight-alone-does-not-bind/);
  } finally {
    disposeFixture(fixture);
  }
});

test('C003 postcondition: next opens numbered empty blocks that bind nothing yet', () => {
  const fixture = materializeGrillFixture({ withNodes: 3 });
  try {
    assert.equal(next(fixture.rfcDir, 2).status, 0);

    const blocks = readTree(fixture.rfcDir).questions;
    assert.deepEqual(blocks.map((block) => block.number), [1, 2]);
    assert.deepEqual(blocks.map((block) => block.boundNodeIds), [[], []]);
  } finally {
    disposeFixture(fixture);
  }
});

test('C003 postcondition: bind fills a numbered block with the nodes it decides', () => {
  const fixture = materializeGrillFixture({ withPriorArtifacts: true, withNodes: 3 });
  try {
    prior(fixture.rfcDir);
    next(fixture.rfcDir, 1);
    const result = bind(fixture.rfcDir, 1, questionBlock({
      settleTrace: 'EXPLAIN-RFC-SEED.md was read; it decides neither question',
    }));

    assert.equal(result.status, 0);
    const block = readTree(fixture.rfcDir).questions[0];
    assert.deepEqual(block.boundNodeIds, ['Q1', 'Q2']);
    assert.match(block.settleTrace, /EXPLAIN-RFC-SEED\.md/);
  } finally {
    disposeFixture(fixture);
  }
});

test('C003 invariant: bind refuses a block that binds fewer than two nodes', () => {
  const fixture = materializeGrillFixture({ withNodes: 3 });
  try {
    next(fixture.rfcDir, 1);
    const result = bind(fixture.rfcDir, 1, { boundNodeIds: ['Q1'], scopeLine: 's', settleTrace: 't' });

    assert.notEqual(result.status, 0, 'a single-point question is a fact-question wearing a question’s clothes');
  } finally {
    disposeFixture(fixture);
  }
});

test('C003 invariant: next continues from the highest number and rewrites none', () => {
  const fixture = materializeGrillFixture({ withNodes: 3 });
  try {
    next(fixture.rfcDir, 2);
    next(fixture.rfcDir, 1);

    assert.deepEqual(readTree(fixture.rfcDir).questions.map((block) => block.number), [1, 2, 3]);
  } finally {
    disposeFixture(fixture);
  }
});

test('C001 invariant: check refuses a bound block when no prior scan was recorded', () => {
  const fixture = materializeGrillFixture({ withNodes: 3 });
  try {
    next(fixture.rfcDir, 1);
    bind(fixture.rfcDir, 1, questionBlock());

    const result = check(fixture.rfcDir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /prior-artifacts-not-read/);
    assert.match(result.stderr, /Q1/, 'the refusal names the node it refuses');
  } finally {
    disposeFixture(fixture);
  }
});

test('C001 invariant: a settle trace naming none of the artifacts the scan found is refused', () => {
  const fixture = materializeGrillFixture({ withPriorArtifacts: true, withNodes: 3 });
  try {
    prior(fixture.rfcDir);
    next(fixture.rfcDir, 1);
    bind(fixture.rfcDir, 1, questionBlock({ settleTrace: 'I could not decide' }));

    const result = check(fixture.rfcDir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unread-prior-artifact/);
  } finally {
    disposeFixture(fixture);
  }
});

test('C001 postcondition: a well-formed round passes check and reports the unsettled count', () => {
  const fixture = materializeGrillFixture({ withPriorArtifacts: true, withNodes: 3 });
  try {
    prior(fixture.rfcDir);
    next(fixture.rfcDir, 1);
    bind(fixture.rfcDir, 1, questionBlock());

    const result = check(fixture.rfcDir);
    assert.equal(result.status, 0, result.stderr);
    // Three nodes, two of them bound and one still open: every one of them is
    // unsettled, because a bound point is not decided until an answer decides it.
    assert.match(result.stdout, /unsettled 3/);
  } finally {
    disposeFixture(fixture);
  }
});

test('C003 invariant: answers stays non-zero while a block carries no answer', () => {
  const fixture = materializeGrillFixture({ withPriorArtifacts: true, withNodes: 3 });
  try {
    prior(fixture.rfcDir);
    next(fixture.rfcDir, 1);
    bind(fixture.rfcDir, 1, questionBlock());

    const result = answers(fixture.rfcDir);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /answers FAILED/);
    assert.match(result.stdout, /Q1|Q2/, 'the unsettled points are named');
  } finally {
    disposeFixture(fixture);
  }
});
