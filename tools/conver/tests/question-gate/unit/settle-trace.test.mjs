/**
 * The settle trace: which records were read, and why each leaves the point open.
 *
 * @verifies C001
 * @verifies C002
 * @verifies C003
 * @verifies C004
 *
 * A question stands only because the records could not settle it. The block has always
 * required the trace to say so, and the gate has only ever checked that the trace is
 * non-empty and names one of the artifacts the scan returned. A trace that names a
 * record and stops has shown the reading and not the search, which is the shape a run
 * takes when the AI asks about a point it could have decided.
 *
 * So the trace is a list of entries: each names a record the scan returned and the
 * fact that leaves the point open. Two refusals guard it, and they are kept apart
 * because they are different defects: a record the run did not read is
 * unread-prior-artifact, and a read record whose silence is not shown is
 * read-record-not-shown-silent. Naming a record is never sufficient on its own.
 *
 * Whether a live run obeys this is a choice an agent makes and no test observes it.
 * What is observed is the artifact the run writes and the verdict the gate returns.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { REFUSAL } from '../../../.claude/scripts/question-gate/settle.mjs';
import {
  FIXTURE_GROUND,
  GRILL_SETTLE_RUN,
  GRILL_UPDATE_TREE,
  REPO_ROOT,
  disposeFixture,
  materializeGrillFixture,
  questionBlock,
  readTree,
  runCommand,
} from '../helpers/fixture-workspace.mjs';

/** The name this ticket publishes, read from the value rather than restated here. */
const NOT_SHOWN_SILENT = REFUSAL.READ_RECORD_NOT_SHOWN_SILENT;

/** A round whose one open block is the block handed in. */
// [::TICKET::] PX-272 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-272 --for-spec --no-implementation-order`.
function roundWith(block) {
  const fixture = materializeGrillFixture({ withPriorArtifacts: true, withNodes: 3 });
  runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'prior']);
  runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'next', '1']);
  runCommand(GRILL_UPDATE_TREE, [fixture.rfcDir, 'bind', '1', JSON.stringify(block)]);
  return fixture;
}

/** The fault kinds one check run reported, in the order stderr lists them. */
// [::TICKET::] PX-272 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-272 --for-spec --no-implementation-order`.
function faultKinds(result) {
  return (result.stderr.match(/^- [a-z-]+:/gm) ?? []).map((line) => line.slice(2, -1));
}

/** The block text the three commands carry, between the two delimiters. */
// [::TICKET::] PX-272 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-272 --for-spec --no-implementation-order`.
function delimitedBlock(commandName) {
  const text = readFileSync(join(REPO_ROOT, '.claude', 'commands', `${commandName}.md`), 'utf8');
  const start = text.indexOf('<!-- question-gate:begin -->');
  const stop = text.indexOf('<!-- question-gate:end -->');

  return text.slice(start, stop);
}

test('C001 postcondition: a trace that shows the read record silent passes', () => {
  const fixture = roundWith(
    questionBlock({
      settleTrace: [
        {
          record: FIXTURE_GROUND,
          leavesOpen: 'it records the store as a file and does not decide which experience comes first',
        },
      ],
    }),
  );
  try {
    const result = runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'check']);

    assert.equal(result.status, 0, result.stderr);
  } finally {
    disposeFixture(fixture);
  }
});

test('C001 invariant: a prefix of the scanned record is not that record', () => {
  for (const nearly of ['EXPLAIN-RFC-SEED', 'EXPLAIN-RFC-SEED.md#§', 'SEED.md']) {
    const fixture = roundWith(
      questionBlock({
        settleTrace: [{ record: nearly, leavesOpen: 'it does not decide which experience comes first' }],
      }),
    );
    try {
      const result = runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'check']);

      assert.notEqual(result.status, 0, `${nearly} is not a record the run read`);
      assert.deepEqual(faultKinds(result), ['unread-prior-artifact']);
    } finally {
      disposeFixture(fixture);
    }
  }
});

test('C002 postcondition: an entry stating no silence is refused by name and by question', () => {
  for (const silent of ['', '   ']) {
    const fixture = roundWith(
      questionBlock({ settleTrace: [{ record: FIXTURE_GROUND, leavesOpen: silent }] }),
    );
    try {
      const result = runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'check']);

      assert.notEqual(result.status, 0, 'an entry with no reason is not a search');
      assert.deepEqual(faultKinds(result), [NOT_SHOWN_SILENT]);
      assert.match(result.stderr, /Q1/, 'the refusal names the question it belongs to');
    } finally {
      disposeFixture(fixture);
    }
  }
});

test('C002 precondition: a string trace left on disk is refused, not thrown at', () => {
  const fixture = roundWith(questionBlock());
  try {
    // The generation before this ticket wrote a string. A run inherits the tree on
    // disk rather than the block it would have bound now, so the migration case is
    // written where that generation left it.
    const tree = readTree(fixture.rfcDir);
    tree.questions[0].settleTrace = `${FIXTURE_GROUND} was read and decides neither`;
    writeFileSync(join(fixture.rfcDir, 'DesignTree.json'), JSON.stringify(tree, null, 2));

    const result = runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'check']);

    assert.notEqual(result.status, 0, 'a string trace shows no search');
    assert.deepEqual(faultKinds(result), [NOT_SHOWN_SILENT]);
    assert.match(result.stderr, /Q1/);
  } finally {
    disposeFixture(fixture);
  }
});

test('C002 invariant: one entry without a reason refuses the block, however many carry one', () => {
  const fixture = roundWith(
    questionBlock({
      settleTrace: [
        { record: FIXTURE_GROUND, leavesOpen: 'it does not decide which experience comes first' },
        { record: FIXTURE_GROUND, leavesOpen: '' },
      ],
    }),
  );
  try {
    const result = runCommand(GRILL_SETTLE_RUN, [fixture.rfcDir, 'check']);

    assert.deepEqual(faultKinds(result), [NOT_SHOWN_SILENT]);
  } finally {
    disposeFixture(fixture);
  }
});

test('C003 invariant: not reading and not searching are refused under different names', () => {
  const unread = roundWith(
    questionBlock({
      settleTrace: [{ record: 'SOMETHING-ELSE.md', leavesOpen: 'it does not decide which experience comes first' }],
    }),
  );
  const unsearched = roundWith(
    questionBlock({ settleTrace: [{ record: FIXTURE_GROUND, leavesOpen: '' }] }),
  );
  try {
    const unreadResult = runCommand(GRILL_SETTLE_RUN, [unread.rfcDir, 'check']);
    const unsearchedResult = runCommand(GRILL_SETTLE_RUN, [unsearched.rfcDir, 'check']);

    assert.deepEqual(faultKinds(unreadResult), ['unread-prior-artifact'], 'a record never read');
    assert.deepEqual(faultKinds(unsearchedResult), [NOT_SHOWN_SILENT], 'a record read and not searched');
    assert.notEqual(NOT_SHOWN_SILENT, 'unread-prior-artifact', 'the two defects keep distinct names');
  } finally {
    disposeFixture(unread);
    disposeFixture(unsearched);
  }
});

test('C003 postcondition: the refusal is published as a value, not spelled in prose', () => {
  assert.equal(NOT_SHOWN_SILENT, 'read-record-not-shown-silent');
});

test('C004 invariant: the trace fault does not turn on whether the AI could recommend', () => {
  const trace = [{ record: FIXTURE_GROUND, leavesOpen: '' }];
  const recommending = roundWith(questionBlock({ settleTrace: trace }));
  const bare = roundWith(
    questionBlock({
      settleTrace: trace,
      choice: { ...questionBlock().choice, recommendation: '' },
    }),
  );
  try {
    const withRecommendation = runCommand(GRILL_SETTLE_RUN, [recommending.rfcDir, 'check']);
    const withoutRecommendation = runCommand(GRILL_SETTLE_RUN, [bare.rfcDir, 'check']);

    assert.ok(faultKinds(withRecommendation).includes(NOT_SHOWN_SILENT));
    assert.ok(
      faultKinds(withoutRecommendation).includes(NOT_SHOWN_SILENT),
      'the verdict on the trace does not turn on whether the AI could recommend',
    );
  } finally {
    disposeFixture(recommending);
    disposeFixture(bare);
  }
});

test('C004 postcondition: the block states the criterion and stays one text in three files', () => {
  const block = delimitedBlock('grill-me-for-rfc');

  assert.match(
    block,
    /the failed settle test is the only thing that makes a point a question/i,
    'the ground, not the recommendation, is what the block says decides',
  );
  assert.ok(block.includes(NOT_SHOWN_SILENT), 'and the block names the refusal this ticket publishes');

  for (const other of ['explain-seed', 'drill-rfc-down']) {
    assert.equal(delimitedBlock(other), block, `${other} carries the same block`);
  }
});

test('the block states the trace as entries, which is what the gate reads', () => {
  const text = readFileSync(join(REPO_ROOT, '.claude', 'commands', 'grill-me-for-rfc.md'), 'utf8');
  const step2 = text.slice(text.indexOf('### STEP 2'), text.indexOf('### STEP 3'));

  assert.match(step2, /each names a record the scan\s+returned and the fact that leaves the point open/);
  assert.match(step2, /refuses a block whose trace names none of the records the scan found/);
});

/**
 * The installs of the same files: this tool, the siprs crate, and the repository root.
 *
 * The rule and the driver that reads it have to be one text in every install, or a run
 * in one of them asks according to a rule the others do not have — and the divergence is
 * invisible, because each suite only exercises its own tool.
 */
const INSTALLS = [REPO_ROOT, join(REPO_ROOT, '..', '..', 'crates', 'siprs'), join(REPO_ROOT, '..', '..')];

test('C004 postcondition: the block and its driver are one text in every install', () => {
  const shared = [
    '.claude/commands/grill-me-for-rfc.md',
    '.claude/commands/drill-rfc-down.md',
    '.claude/commands/explain-seed.md',
    '.claude/scripts/grill-me-for-rfc/settle-run.js',
    '.claude/scripts/grill-me-for-rfc/update-tree.js',
    '.claude/scripts/grill-me-for-rfc/check-all-schema.js',
    '.claude/scripts/drill-rfc-down/settle-run.js',
    '.claude/scripts/drill-rfc-down/update-tree.js',
    '.claude/scripts/drill-rfc-down/check-all-schema.js',
    '.claude/scripts/question-gate/settle.mjs',
  ];

  for (const relative of shared) {
    const texts = INSTALLS.map((install) => readFileSync(join(install, relative), 'utf8'));

    assert.equal(new Set(texts).size, 1, `${relative} is one text in ${INSTALLS.length} installs`);
  }
});

test('every carrier of the block states the refusal this ticket publishes', () => {
  for (const name of ['grill-me-for-rfc', 'drill-rfc-down', 'explain-seed']) {
    const text = readFileSync(join(REPO_ROOT, '.claude', 'commands', `${name}.md`), 'utf8');

    assert.ok(text.includes(NOT_SHOWN_SILENT), `${name} names the refusal, in its block or in its steps`);
  }
});
