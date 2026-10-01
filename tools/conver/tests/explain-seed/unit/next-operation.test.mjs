// PX-229 @verifies C001
// PX-229 @verifies C002
//
// `next` is the operation that appends a round of direction questions to the human's section.
// Two properties decide whether it is right, and neither is visible from what it hands back:
// the numbers a document already holds never move, and a refused `next` writes nothing at all. So
// the reader is asserted against strings here, and the refusals are asserted against the bytes
// of a materialized explanation, because only the bytes can show that nothing was written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  HUMAN_ITEM_HEADING,
  MAX_ROUNDS,
  appendQuestionRound,
  buildFrame,
  countRounds,
  readQuestionNumbers,
  renderQuestionBlock,
  roundSeparator,
} from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import { findHumanPlaceholders, findOpenMarkers } from '../../../.claude/scripts/explain-seed/lib/markers.mjs';
import { materializeExplainSeedWorkspace } from '../helpers/explain-seed-workspace.mjs';
import { authorExplanation } from '../helpers/fill-frame.mjs';
import { syntheticFacts, syntheticOpenIds } from '../helpers/synthetic-facts.mjs';

const RUN = fileURLToPath(new URL('../../../.claude/scripts/explain-seed/run.mjs', import.meta.url));
const BOUND_IDS = syntheticOpenIds();

/** Run the command and keep both sinks as bytes. */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
function runCli(argv, { cwd } = {}) {
  return spawnSync(process.execPath, [RUN, ...argv], { cwd, encoding: 'buffer' });
}

/** Every line of `before` survives, in order, in `after` — nothing earlier is rewritten. */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
function isSubsequence(before, after) {
  let cursor = 0;
  for (const line of before) {
    const found = after.indexOf(line, cursor);
    if (found < 0) return false;
    cursor = found + 1;
  }
  return true;
}

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C001 postcondition: each appended block carries the placeholder and the bound-points instruction in the AI-only region', () => {
  const block = renderQuestionBlock({ number: 3 });

  assert.match(block, new RegExp(`^${HUMAN_ITEM_HEADING} Q3$`, 'm'), 'the frame writes the number');
  assert.equal(findHumanPlaceholders(block).length, 1, 'one place for the human to write');
  assert.deepEqual(
    findOpenMarkers(block).map((marker) => marker.offset >= 0),
    findOpenMarkers(block).map(() => true),
    'every instruction opens its own line, so the counter can see it',
  );
  const noticeAt = block.indexOf('読まなくても判断できます');
  const boundAt = block.indexOf('- 束ねた論点:');
  assert.ok(noticeAt >= 0 && boundAt > noticeAt, 'the bound-points line stands in the AI-only region, below the notice');
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C001 postcondition: the first call replaces the absent statement, since a document with questions is not one with none', () => {
  const facts = syntheticFacts();
  const published = buildFrame({ facts, previous: null }).text;
  const after = appendQuestionRound({ documentText: published, size: 2 });

  assert.ok(!after.includes('未解決の論点は登録されていません'), 'the statement that nothing is registered is not left under a question');
  assert.deepEqual(readQuestionNumbers(after), [1, 2], 'the numbers start from one when the document holds none');
  assert.equal(countRounds(after), 1, 'one call opens exactly one round');
  assert.ok(after.includes(roundSeparator(1)), 'and the separator it opens is named for the round');
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C001 invariant: once a document holds questions, every byte that existed before next survives in order, and the numbers continue', () => {
  const facts = syntheticFacts();
  const first = appendQuestionRound({ documentText: buildFrame({ facts, previous: null }).text, size: 2 });
  const grown = appendQuestionRound({ documentText: first, size: 2 });

  assert.ok(isSubsequence(first.split('\n'), grown.split('\n')), 'every earlier line survives in order');
  assert.deepEqual(readQuestionNumbers(grown), [1, 2, 3, 4], 'the numbers continue from the highest already there');
  assert.equal(countRounds(grown), 2, 'the round count rises by exactly one');
  assert.ok(grown.includes(roundSeparator(2)), 'and the new separator is named for the new round');
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C001 postcondition: next appends over a published explanation and the ledger reads the bound points back', () => {
  const workspace = materializeExplainSeedWorkspace();
  try {
    assert.equal(runCli(['info', workspace.seedPath], { cwd: workspace.root }).status, 0);
    assert.equal(runCli(['next', workspace.seedPath, '1'], { cwd: workspace.root }).status, 0);

    const grown = readFileSync(workspace.explainPath, 'utf8');
    assert.deepEqual(readQuestionNumbers(grown), [1], 'the published frame held no question, so the new one is Q1');
    assert.equal(countRounds(grown), 1);
    assert.match(grown, /^ {2}\[::MUST-FILL::\] 束ねた論点/m, 'the bound-points line is left for the AI to write');
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C002 postcondition: every refusal writes nothing, and names the reason it refused', () => {
  const workspace = materializeExplainSeedWorkspace();
  try {
    assert.equal(runCli(['info', workspace.seedPath], { cwd: workspace.root }).status, 0);
    const publishPath = workspace.explainPath;
    const before = readFileSync(publishPath, 'utf8');

    for (const [args, reason] of [
      [['next', workspace.seedPath, '4'], /round size/],
      [['next', workspace.seedPath, '0'], /round size/],
      [['next', workspace.seedPath, 'two'], /round size/],
    ]) {
      const run = runCli(args, { cwd: workspace.root });
      assert.equal(run.status, 1, `${args[2]} is refused`);
      assert.match(run.stderr.toString('utf8'), reason);
      assert.equal(readFileSync(publishPath, 'utf8'), before, 'a refused next writes nothing at all');
    }
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C002 postcondition: a sixth round is refused even when points are open', () => {
  const workspace = materializeExplainSeedWorkspace();
  try {
    assert.equal(runCli(['info', workspace.seedPath], { cwd: workspace.root }).status, 0);
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      assert.equal(runCli(['next', workspace.seedPath, '1'], { cwd: workspace.root }).status, 0, `round ${round + 1} is opened`);
    }
    const before = readFileSync(workspace.explainPath, 'utf8');

    const refused = runCli(['next', workspace.seedPath, '1'], { cwd: workspace.root });

    assert.equal(refused.status, 1);
    assert.match(refused.stderr.toString('utf8'), /round limit/);
    assert.equal(readFileSync(workspace.explainPath, 'utf8'), before, 'the refusal writes nothing');
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C002 postcondition: a document whose recorded points are all bound is refused, naming that nothing is open', () => {
  const workspace = materializeExplainSeedWorkspace();
  try {
    assert.equal(runCli(['info', workspace.seedPath], { cwd: workspace.root }).status, 0);
    writeFileSync(
      workspace.explainPath,
      authorExplanation({ facts: syntheticFacts(), boundIds: BOUND_IDS }),
      'utf8',
    );
    const before = readFileSync(workspace.explainPath, 'utf8');

    const refused = runCli(['next', workspace.seedPath, '1'], { cwd: workspace.root });

    assert.equal(refused.status, 1);
    assert.match(refused.stderr.toString('utf8'), /nothing open/);
    assert.equal(readFileSync(workspace.explainPath, 'utf8'), before, 'the refusal writes nothing');
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
});
