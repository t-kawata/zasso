// PX-233 @verifies C002
// [::TICKET::] PX-233 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-233 --for-spec --no-implementation-order`.
/**
 * The question block: seven lines, read top to bottom.
 *
 * The order is the rule, not a preference. The AI's own conclusion comes before any
 * option letter, the remainder is stated as one sentence so the human can see how
 * little is left, and a letter appears only on the line that defines it. The
 * read-back is the check on that last part: a block that uses a name its reader has
 * not met is a defect at that line, and the fix belongs in the line, not in a gloss
 * appended later.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BLOCK_LINES,
  SENTENCE_SLOTS,
  readBack,
  renderBlock,
  sentencePass,
} from '../../../.claude/scripts/question-gate/block.mjs';

const BLOCK = {
  framing: {
    context: 'A person changes their handle. The old key stops working that moment.\n',
    conclusion: 'I think the store should be a file, because the records already read it that way.\n',
    settled: 'Everything else is decided.\n',
    remainder: 'What is left to you is only whether a file is the right shape.\n',
  },
  choice: {
    directions: [
      { letter: 'A', meaning: 'A file. The reader sees one copy, and a lost file is lost.' },
      { letter: 'B', meaning: 'A directory of files. A lost file costs one entry.' },
    ],
    recommendation: 'I recommend A.',
    overturning: 'A second writer appearing would change this.',
  },
};

test('C002 postcondition: the block carries the seven lines in the recorded order', () => {
  assert.deepEqual(BLOCK_LINES, ['状況', '私の結論', 'すでに決まっていること', '残っている選択', '選択肢', '推奨', '推奨が覆る条件']);

  const rendered = renderBlock(BLOCK);
  const positions = BLOCK_LINES.map((label) => rendered.indexOf(label));

  for (let i = 1; i < positions.length; i += 1) {
    assert.ok(positions[i] > positions[i - 1], `${BLOCK_LINES[i]} comes after ${BLOCK_LINES[i - 1]}`);
  }
});

test('C002 postcondition: the sentence pass reports the four slots for every sentence', () => {
  assert.deepEqual(SENTENCE_SLOTS, ['誰が', '何を', 'どうする', 'いつ']);

  const passed = sentencePass('A person changes their handle. The old key stops working that moment.');

  assert.equal(passed.length, 2);
  for (const entry of passed) {
    assert.deepEqual(Object.keys(entry.slots), SENTENCE_SLOTS);
  }
});

test('C002 postcondition: read-back accepts a block whose names are all defined before use', () => {
  const verdict = readBack(renderBlock(BLOCK));

  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.faults, []);
});

test('C002 invariant: read-back rejects a letter used before the 選択肢 line, and names that line', () => {
  const rendered = renderBlock({
    ...BLOCK,
    framing: { ...BLOCK.framing, conclusion: 'My conclusion is A, because the records read it that way.\n' },
  });

  const verdict = readBack(rendered);

  assert.equal(verdict.ok, false);
  assert.equal(verdict.faults.length, 1);
  assert.equal(verdict.faults[0].kind, 'forward-reference');
  assert.match(verdict.faults[0].line, /My conclusion is A/);
});

test('C002 boundary: a block with no 選択肢 line reports the missing line rather than a forward reference', () => {
  const verdict = readBack('状況\n something happens\n');

  assert.equal(verdict.ok, false);
  assert.equal(verdict.faults[0].kind, 'missing-options');
});
