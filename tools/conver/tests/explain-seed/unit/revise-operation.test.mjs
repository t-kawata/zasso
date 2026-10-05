// PX-236 @verifies C001
// PX-236 @verifies C002
// PX-236 @verifies C003
// PX-236 @verifies C004
// PX-236 @verifies C005
// PX-236 @verifies C007
//
// `revise` is the operation a viewpoint the human brings after Done goes through. It is the
// only writer of an added point, so three properties decide whether it is right, and none of
// them is visible from what it returns: the block it writes is the block the reader reads
// back, a refusal writes nothing at all, and the new point re-opens the ledger without moving
// a question number or rewriting an answer. The refusals are therefore asserted against the
// bytes of a materialized explanation, because only the bytes can show that nothing was
// written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  ABSENT_RESIDUALS_STATEMENT,
  ADDED_POINT_CLOSE,
  FRAME_SECTIONS,
  HUMAN_SECTION_ID,
  MAX_CYCLES,
  MAX_ROUNDS,
  appendAddedPointBlock,
  appendQuestionRound,
  buildFrame,
  countCycles,
  countRounds,
  countRoundsInCurrentCycle,
  cycleSeparator,
  locateSections,
  nextAddedPointId,
  readAddedPoints,
  readQuestionNumbers,
  roundSeparator,
} from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import { deriveLedger } from '../../../.claude/scripts/explain-seed/lib/ledger.mjs';
import { findHumanPlaceholders } from '../../../.claude/scripts/explain-seed/lib/markers.mjs';
import { materializeExplainSeedWorkspace } from '../helpers/explain-seed-workspace.mjs';
import { authorExplanation } from '../helpers/fill-frame.mjs';
import { syntheticFacts, syntheticOpenIds } from '../helpers/synthetic-facts.mjs';

const RUN = fileURLToPath(new URL('../../../.claude/scripts/explain-seed/run.mjs', import.meta.url));

/** The viewpoint these cases record, in the shape the human's own words reach the AI. */
const POINT = { origin: '「監査ログは残せない」', statement: '監査ログを残すかどうか' };

/** Run the command and keep both sinks as bytes. */
// [::TICKET::] PX-236 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-236 --for-spec --no-implementation-order`.
function runCli(argv, { cwd } = {}) {
  return spawnSync(process.execPath, [RUN, ...argv], { cwd, encoding: 'buffer' });
}

/** Bring one viewpoint to one workspace, the way the AI does after the human has spoken. */
// [::TICKET::] PX-236 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-236 --for-spec --no-implementation-order`.
function reviseWith(workspace, payload) {
  return runCli(['revise', workspace.seedPath, JSON.stringify(payload)], { cwd: workspace.root });
}

/** Every line of `before` survives, in order, in `after` — nothing earlier is rewritten. */
// [::TICKET::] PX-236 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-236 --for-spec --no-implementation-order`.
function isSubsequence(before, after) {
  let cursor = 0;
  for (const line of before) {
    const found = after.indexOf(line, cursor);
    if (found < 0) return false;
    cursor = found + 1;
  }
  return true;
}

/** A materialized workspace with its frame published, removed when the case is done. */
// [::TICKET::] PX-236 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-236 --for-spec --no-implementation-order`.
function withPublishedWorkspace(body) {
  const workspace = materializeExplainSeedWorkspace();
  try {
    assert.equal(runCli(['info', workspace.seedPath], { cwd: workspace.root }).status, 0);
    body(workspace);
  } finally {
    rmSync(workspace.root, { recursive: true, force: true });
  }
}

test('C001 postcondition: revise appends one added-point block, and the reader reads it back unchanged', () => {
  withPublishedWorkspace((workspace) => {
    const run = reviseWith(workspace, POINT);

    assert.equal(run.status, 0, run.stderr.toString('utf8'));
    const documentText = readFileSync(workspace.explainPath, 'utf8');
    assert.deepEqual(readAddedPoints({ documentText }), [{ id: 'added-001', ...POINT }]);
  });
});

test('C001 precondition: an origin carrying the closing marker is refused, so no payload can write a broken block', () => {
  withPublishedWorkspace((workspace) => {
    const before = readFileSync(workspace.explainPath, 'utf8');
    const payload = { origin: `「壊す」 ${ADDED_POINT_CLOSE}`, statement: '論点' };

    const run = reviseWith(workspace, payload);

    assert.equal(run.status, 1, 'a payload may not close the block it is written into');
    assert.match(run.stderr.toString('utf8'), /uncited-added-point/);
    assert.equal(readFileSync(workspace.explainPath, 'utf8'), before, 'and the refusal wrote nothing');
    assert.deepEqual(readAddedPoints({ documentText: before }), [], 'a broken block is never half-written');
  });
});

test('C002 postcondition: an origin-less, statement-less or unreadable payload is refused by kind and writes nothing', () => {
  withPublishedWorkspace((workspace) => {
    const before = readFileSync(workspace.explainPath, 'utf8');
    const refused = [
      [{ origin: '', statement: '論点' }, /uncited-added-point/],
      [{ origin: '   ', statement: '論点' }, /uncited-added-point/],
      [{ origin: '出どころ', statement: '' }, /unstated-added-point/],
      [{ origin: '出どころ', statement: '   ' }, /unstated-added-point/],
      [{ origin: '出どころ\n- 論点: 偽', statement: '論点' }, /uncited-added-point/],
      [{ origin: '出どころ' }, /unstated-added-point/],
    ];

    for (const [payload, reason] of refused) {
      const run = reviseWith(workspace, payload);
      assert.equal(run.status, 1, `${JSON.stringify(payload)} is refused`);
      assert.match(run.stderr.toString('utf8'), reason);
      assert.equal(readFileSync(workspace.explainPath, 'utf8'), before, 'a refused revise writes nothing');
    }

    const malformed = runCli(['revise', workspace.seedPath, '{not json'], { cwd: workspace.root });
    assert.equal(malformed.status, 1, 'a payload that is not JSON is refused');
    assert.equal(readFileSync(workspace.explainPath, 'utf8'), before, 'and writes nothing either');
  });
});

test('C003 postcondition: the reserved id continues from the highest the document already holds', () => {
  const plain = buildFrame({ facts: syntheticFacts(), previous: null }).text;
  assert.equal(nextAddedPointId({ documentText: plain }), 'added-001', 'a document with no block starts at one');

  const first = appendAddedPointBlock({ documentText: plain, id: 'added-001', ...POINT });
  assert.equal(nextAddedPointId({ documentText: first }), 'added-002', 'the next id follows the highest, not the count');

  const second = appendAddedPointBlock({ documentText: first, id: 'added-002', origin: 'その2', statement: '論点2' });
  assert.deepEqual(readAddedPoints({ documentText: second }).map((point) => point.id), ['added-001', 'added-002']);
});

test('C003 boundary: the reserved id space is refused rather than overflowing its shape', () => {
  const facts = syntheticFacts();
  const plain = buildFrame({ facts, previous: null }).text;
  const lastReserved = appendAddedPointBlock({ documentText: plain, id: 'added-999', origin: 'o', statement: 's' });

  assert.throws(
    () => nextAddedPointId({ documentText: lastReserved }),
    /reserved id/,
    'the next id would be four digits, which is not the shape a reserved id carries',
  );
});

test('C003 invariant: a revision never renumbers a question and never rewrites an answer', () => {
  const facts = syntheticFacts();
  const authored = authorExplanation({ facts, boundIds: syntheticOpenIds(facts.projection) });
  const numbersBefore = readQuestionNumbers(authored);
  const placeholdersBefore = findHumanPlaceholders(authored).length;

  const revised = appendAddedPointBlock({ documentText: authored, id: nextAddedPointId({ documentText: authored }), ...POINT });

  assert.deepEqual(readQuestionNumbers(revised), numbersBefore, 'no question number moves');
  assert.equal(findHumanPlaceholders(revised).length, placeholdersBefore, 'no place for the human to write is added or lost');
  assert.ok(isSubsequence(authored.split('\n'), revised.split('\n')), 'every earlier line survives, in order');
});

test('C004 postcondition: the added point enters the ledger as open, and the unsettled set grows by exactly it', () => {
  const facts = syntheticFacts();
  const authored = authorExplanation({ facts, boundIds: syntheticOpenIds(facts.projection) });
  const before = deriveLedger({ documentText: authored, projection: facts.projection });
  assert.deepEqual([...before.open], [], 'every recorded point was already attached to a question');

  const id = nextAddedPointId({ documentText: authored });
  const revised = appendAddedPointBlock({ documentText: authored, id, ...POINT });
  const after = deriveLedger({ documentText: revised, projection: facts.projection });

  assert.deepEqual([...after.open], [id], 'the added point is the only open point');
  assert.deepEqual(
    [...after.unsettled].sort(),
    [...before.unsettled, id].sort(),
    'the unsettled set grew by exactly it, and no recorded point changed state',
  );
});

test('C004 postcondition: after a revision answers names the new point and next accepts where it refused', () => {
  withPublishedWorkspace((workspace) => {
    assert.notEqual(runCli(['answers', workspace.seedPath], { cwd: workspace.root }).status, 0, 'the published frame is not complete');
    assert.equal(reviseWith(workspace, POINT).status, 0);

    const verdict = runCli(['answers', workspace.seedPath], { cwd: workspace.root });
    assert.notEqual(verdict.status, 0, 'the added point keeps the loop open');
    assert.match(verdict.stdout.toString('utf8'), /added-001/, 'and the verdict names it');

    const opened = runCli(['next', workspace.seedPath, '1'], { cwd: workspace.root });
    assert.equal(opened.status, 0, opened.stderr.toString('utf8'));
  });
});

test('C005 postcondition: an info run keeps the human section that carries the block, so no revision is destroyed', () => {
  const facts = syntheticFacts();
  const authored = authorExplanation({ facts, boundIds: syntheticOpenIds(facts.projection) });
  const revised = appendAddedPointBlock({ documentText: authored, id: 'added-001', ...POINT });

  const frame = buildFrame({ facts, previous: revised });

  assert.ok(frame.keptSections.includes(HUMAN_SECTION_ID), 'the human section is kept, not reopened');
  assert.deepEqual(readAddedPoints({ documentText: frame.text }), [{ id: 'added-001', ...POINT }]);
});

test('C007 postcondition: the current cycle counts only the rounds opened after its marker', () => {
  const text = [roundSeparator(1), cycleSeparator(1), roundSeparator(2)].join('\n');

  assert.equal(countRounds(text), 2, 'the lifetime total is unchanged');
  assert.equal(countRoundsInCurrentCycle(text), 1, 'only the round after the marker counts against the cycle');
  assert.equal(countCycles(text), 1);
  assert.equal(countRoundsInCurrentCycle(roundSeparator(1)), 1, 'a document with no marker counts every round it holds');
  assert.equal(countCycles(roundSeparator(1)), 0, 'and holds no cycle');
});

test('C007 postcondition: a revision opens a fresh cycle, so a round fits again after the cap', () => {
  withPublishedWorkspace((workspace) => {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      assert.equal(runCli(['next', workspace.seedPath, '1'], { cwd: workspace.root }).status, 0, `round ${round + 1} is opened`);
    }
    const before = readFileSync(workspace.explainPath, 'utf8');
    const spent = runCli(['next', workspace.seedPath, '1'], { cwd: workspace.root });
    assert.equal(spent.status, 1, 'a spent cycle refuses another round');
    assert.match(spent.stderr.toString('utf8'), new RegExp(String(MAX_ROUNDS)), 'and names the bound it reached');
    assert.equal(readFileSync(workspace.explainPath, 'utf8'), before, 'the refusal writes nothing');

    const revised = reviseWith(workspace, POINT);
    assert.equal(revised.status, 0, revised.stderr.toString('utf8'));

    const opened = runCli(['next', workspace.seedPath, '1'], { cwd: workspace.root });
    assert.equal(opened.status, 0, opened.stderr.toString('utf8'));
  });
});

test('C007 postcondition: revise refuses past the cycle bound and writes nothing', () => {
  withPublishedWorkspace((workspace) => {
    for (let cycle = 0; cycle < MAX_CYCLES; cycle += 1) {
      const run = reviseWith(workspace, { origin: `観点${cycle + 1}`, statement: `論点${cycle + 1}` });
      assert.equal(run.status, 0, `revision ${cycle + 1} is accepted: ${run.stderr.toString('utf8')}`);
    }
    const before = readFileSync(workspace.explainPath, 'utf8');

    const refused = reviseWith(workspace, POINT);

    assert.equal(refused.status, 1);
    assert.match(refused.stderr.toString('utf8'), new RegExp(String(MAX_CYCLES)));
    assert.equal(readFileSync(workspace.explainPath, 'utf8'), before, 'the refusal writes nothing');
  });
});

test('C007 boundary: a revision replaces the statement that nothing is registered, because it no longer holds', () => {
  const plain = buildFrame({ facts: syntheticFacts(), previous: null }).text;
  const revised = appendAddedPointBlock({ documentText: plain, id: 'added-001', ...POINT });
  const body = locateSections(revised).bodies[HUMAN_SECTION_ID];

  assert.equal(body.includes(ABSENT_RESIDUALS_STATEMENT), false, 'the statement that nothing is registered is not left above a registered point');
  assert.deepEqual(readAddedPoints({ documentText: revised }).map((point) => point.id), ['added-001']);
});

test('C001 boundary: the point lands in the human section even when an earlier section quotes its heading', () => {
  const facts = syntheticFacts();
  const published = buildFrame({ facts, previous: null }).text;
  const humanHeading = `## ${FRAME_SECTIONS.find((section) => section.id === HUMAN_SECTION_ID).title}`;
  const quoting = `## ${FRAME_SECTIONS[0].title}`;
  const documentText = published.replace(quoting, `${quoting}\n\nこの節の判断は ${humanHeading} に書きます。`);

  const revised = appendAddedPointBlock({ documentText, id: 'added-001', ...POINT });
  const located = locateSections(revised);

  assert.ok(
    located.bodies[HUMAN_SECTION_ID].includes('added-001'),
    'the block belongs to the human section, not to the section that merely quoted its heading',
  );
  assert.equal(
    located.bodies[FRAME_SECTIONS[0].id].includes('added-001'),
    false,
    'and the section that quoted the heading is left alone',
  );
});

test('C007 boundary: a revision over a document that already holds a round appends after it, changing nothing earlier', () => {
  const facts = syntheticFacts();
  const withRound = appendQuestionRound({ documentText: buildFrame({ facts, previous: null }).text, size: 1 });
  const revised = appendAddedPointBlock({ documentText: withRound, id: 'added-001', ...POINT });

  assert.deepEqual(readQuestionNumbers(revised), [1], 'the round is untouched');
  assert.ok(isSubsequence(withRound.split('\n'), revised.split('\n')), 'every line of the round survives, in order');
  assert.deepEqual(readAddedPoints({ documentText: revised }).map((point) => point.id), ['added-001']);
});
