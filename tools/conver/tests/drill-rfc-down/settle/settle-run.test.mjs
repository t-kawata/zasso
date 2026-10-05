// PX-234 @verifies C001
// PX-234 @verifies C002
// PX-234 @verifies C003
// [::TICKET::] PX-234 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-234 --for-spec --no-implementation-order`.
/**
 * The same driver, against an isolated drill session.
 *
 * The point of running the same assertions twice is that drill and grill share one
 * implementation: the only thing that differs is which directory is handed over.
 * If the two ever stopped agreeing, this file and its grill twin would disagree
 * about behaviour while both stayed green, which is exactly the drift the shared
 * core exists to make impossible.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'node:path';

import {
  DRILL_SETTLE_RUN,
  DRILL_UPDATE_TREE,
  FIXTURE_SETTLEMENT_GROUND,
  disposeFixture,
  materializeDrillSession,
  questionBlock,
  readTree,
  runCommand,
} from '../../question-gate/helpers/fixture-workspace.mjs';

// The records live in the package directory, not in the session: the session is
// isolated under <rfcDir>/drills and holds only its own three files.
const prior = (dir) => runCommand(DRILL_SETTLE_RUN, [dir, 'prior', dirname(dir)]);
const next = (dir, n) => runCommand(DRILL_SETTLE_RUN, [dir, 'next', String(n)]);
const check = (dir) => runCommand(DRILL_SETTLE_RUN, [dir, 'check']);
const answers = (dir) => runCommand(DRILL_SETTLE_RUN, [dir, 'answers']);
const bind = (dir, number, block) =>
  runCommand(DRILL_UPDATE_TREE, [dir, 'bind', String(number), JSON.stringify(block)]);
const settle = (dir, nodeId, settlement) =>
  runCommand(DRILL_UPDATE_TREE, [dir, 'settle', nodeId, JSON.stringify(settlement)]);

test('C001 postcondition: prior reads the package directory and records the scan in the session', () => {
  const fixture = materializeDrillSession({ withPriorArtifacts: true, withNodes: 3 });
  try {
    const result = prior(fixture.sessionDir);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /RFC-SEED\.md/);
    assert.deepEqual(readTree(fixture.sessionDir).priorScan.artifacts, [
      'RFC-SEED.md',
      'INFO-RFC-SEED.md',
      'EXPLAIN-RFC-SEED.md',
    ]);
  } finally {
    disposeFixture(fixture);
  }
});

test('C002 postcondition: settle records a grounded settlement in the session tree', () => {
  const fixture = materializeDrillSession({ withPriorArtifacts: true, withNodes: 2 });
  try {
    prior(fixture.sessionDir);
    const result = settle(fixture.sessionDir, 'Q1', {
      decision: 'the session store is a file',
      ground: FIXTURE_SETTLEMENT_GROUND,
      override: 'a second writer appears',
    });

    assert.equal(result.status, 0, result.stderr);
    const node = readTree(fixture.sessionDir).nodes[0];
    assert.equal(node.status, 'resolved');
    assert.equal(node.questions.at(-1).source, 'ai');
  } finally {
    disposeFixture(fixture);
  }
});

test('C003 postcondition: next numbers blocks from one and bind fills them', () => {
  const fixture = materializeDrillSession({ withPriorArtifacts: true, withNodes: 3 });
  try {
    prior(fixture.sessionDir);
    assert.equal(next(fixture.sessionDir, 2).status, 0);
    assert.deepEqual(readTree(fixture.sessionDir).questions.map((block) => block.number), [1, 2]);

    assert.equal(bind(fixture.sessionDir, 1, questionBlock()).status, 0);
  } finally {
    disposeFixture(fixture);
  }
});

test('C001 invariant: the drill driver refuses a block that skipped the prior scan', () => {
  const fixture = materializeDrillSession({ withNodes: 3 });
  try {
    next(fixture.sessionDir, 1);
    bind(fixture.sessionDir, 1, questionBlock());

    const result = check(fixture.sessionDir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /prior-artifacts-not-read/);
  } finally {
    disposeFixture(fixture);
  }
});

test('C002 invariant: the drill driver refuses a settlement with no ground', () => {
  const fixture = materializeDrillSession({ withNodes: 2 });
  try {
    assert.notEqual(settle(fixture.sessionDir, 'Q1', { decision: 'd', override: 'o' }).status, 0);
  } finally {
    disposeFixture(fixture);
  }
});

test('C003 invariant: answers stays non-zero while the ledger holds an unsettled point', () => {
  const fixture = materializeDrillSession({ withPriorArtifacts: true, withNodes: 3 });
  try {
    prior(fixture.sessionDir);
    next(fixture.sessionDir, 1);
    bind(fixture.sessionDir, 1, questionBlock());

    assert.notEqual(answers(fixture.sessionDir).status, 0);
  } finally {
    disposeFixture(fixture);
  }
});
