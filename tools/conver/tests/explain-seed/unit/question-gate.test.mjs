// PX-232 @verifies C001
// PX-232 @verifies C002
// PX-232 @verifies C003
// PX-232 @verifies C004
// PX-232 @verifies C005
// PX-232 @verifies C006
// PX-232 @verifies C007
//
// The question gate has two halves that must agree: the command file, which is what the AI
// reads, and the frame, which is what the gate enforces. A point the records can settle must
// never reach the human, and a question that does reach the human must not use an option
// letter before the line that defines it.
//
// Only the two mechanical defects are asserted here. Whether a question reads top to bottom is
// a human judgement: the command file forces the shape and Step 4a's read-back is its judge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

import {
  BOUND_POINTS_LABEL,
  CONTEXT_LABEL,
  OPTIONS_LABEL,
  SETTLE_TRACE_LABEL,
  SHAPE_LABELS_THIS_FRAME_WRITES,
  renderQuestionBlock,
  verifyExplanation,
} from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import { FAULT_MESSAGES } from '../../../.claude/scripts/explain-seed/run.mjs';
import { syntheticFacts, syntheticOpenIds } from '../helpers/synthetic-facts.mjs';
import { authorExplanation } from '../helpers/fill-frame.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const COMMAND_PATH = path.join(REPO_ROOT, '.claude', 'commands', 'explain-seed.md');
const GAIA_ROOT = path.join(os.homedir(), 'shyme', 'gaia');

/** The recorded points a single-question document binds, as the gate's own fixtures do. */
// [::TICKET::] PX-232 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-232 --for-spec --no-implementation-order`.
function boundIdsOf(facts) {
  return syntheticOpenIds(facts.projection);
}

/** An authored explanation: the frame, a round of questions, and the prose that fills them. */
// [::TICKET::] PX-232 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-232 --for-spec --no-implementation-order`.
function authored(facts = syntheticFacts()) {
  return authorExplanation({ facts, boundIds: boundIdsOf(facts) });
}

/** Every fault of a document, each rendered as kind:id so an assertion can name one. */
// [::TICKET::] PX-232 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-232 --for-spec --no-implementation-order`.
function faultKinds(explainText, facts = syntheticFacts()) {
  return verifyExplanation({ facts, explainText }).faults.map((fault) => `${fault.kind}:${fault.id ?? ''}`);
}

/** The value written under a label, or nothing when the label is absent. */
// [::TICKET::] PX-232 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-232 --for-spec --no-implementation-order`.
function valueUnder(documentText, label) {
  const lines = documentText.split('\n');
  const index = lines.findIndex((line) => line.trimStart().startsWith(`- ${label}:`));
  return index < 0 ? null : (lines[index].slice(lines[index].indexOf(`- ${label}:`) + label.length + 3).trim() || lines[index + 1]);
}

/** Replace the value written under a label, keeping the label line itself. */
// [::TICKET::] PX-232 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-232 --for-spec --no-implementation-order`.
function withValueUnder(documentText, label, value) {
  const lines = documentText.split('\n');
  const index = lines.findIndex((line) => line.trimStart().startsWith(`- ${label}:`));
  assert.notStrictEqual(index, -1, `the document carries ${label}`);
  const inline = lines[index].slice(lines[index].indexOf(`- ${label}:`) + label.length + 3).trim();
  if (inline === '') lines[index + 1] = `  ${value}`;
  else lines[index] = `${lines[index].slice(0, lines[index].indexOf(`- ${label}:`))}- ${label}: ${value}`;
  return lines.join('\n');
}

/**
 * The document with one more paragraph added above the options, before the prose already there.
 *
 * A question may close in more than one paragraph, and a letter used in any of them is met by
 * the reader before the options are written. Only the record copy is indented; the prose the
 * AI writes for the human stands at the left margin.
 */
function withEarlierParagraph(documentText, paragraph) {
  const lines = documentText.split('\n');
  const optionsAt = lines.findIndex((line) => line.trimStart().startsWith(`- ${OPTIONS_LABEL}:`));
  assert.notStrictEqual(optionsAt, -1, 'the document carries an options block');

  let start = optionsAt - 1;
  while (start >= 0 && lines[start].trim() === '') start -= 1;
  while (start > 0 && lines[start - 1].trim() !== '') start -= 1;

  return [...lines.slice(0, start), paragraph, '', ...lines.slice(start)].join('\n');
}

/** The document with one label and its value removed, as a question that never recorded it. */
// [::TICKET::] PX-232 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-232 --for-spec --no-implementation-order`.
function withoutLabel(documentText, label) {
  const lines = documentText.split('\n');
  const index = lines.findIndex((line) => line.trimStart().startsWith(`- ${label}:`));
  assert.notStrictEqual(index, -1, `the document carries ${label}`);
  const inline = lines[index].slice(lines[index].indexOf(`- ${label}:`) + label.length + 3).trim();
  return lines.filter((_, i) => i !== index && !(inline === '' && i === index + 1)).join('\n');
}

test('the frame writes the settle trace between the bound points and the options, and its own render passes the gate', () => {
  const block = renderQuestionBlock({ number: 1 });
  const at = (label) => block.indexOf(`- ${label}:`);

  assert.notStrictEqual(at(SETTLE_TRACE_LABEL), -1, 'the settle-trace line is rendered');
  assert.ok(at(BOUND_POINTS_LABEL) < at(SETTLE_TRACE_LABEL), 'it stands after the bound points');
  assert.ok(at(SETTLE_TRACE_LABEL) < at(OPTIONS_LABEL), 'it stands above the options');
  assert.ok(SHAPE_LABELS_THIS_FRAME_WRITES.includes(SETTLE_TRACE_LABEL), 'the merge test demands it');

  const facts = syntheticFacts();
  assert.deepEqual(verifyExplanation({ facts, explainText: authored(facts) }).faults, [],
    'a document authored from this frame is accepted, so the merge and the gate agree');
});

test('a question that does not record why the records could not settle it is refused, and nothing else changes', () => {
  const facts = syntheticFacts();
  const complete = authored(facts);
  const missing = withoutLabel(complete, SETTLE_TRACE_LABEL);

  assert.deepEqual(faultKinds(complete, facts), [], 'the complete document is accepted');
  assert.ok(
    faultKinds(missing, facts).includes('missing-settle-trace:Q1'),
    'the question is named, so the operator knows which one to repair',
  );
  assert.deepEqual(
    faultKinds(missing, facts).filter((kind) => !kind.startsWith('missing-settle-trace')),
    faultKinds(complete, facts),
    'the missing line raises that fault and no other',
  );
});

test('a letter used above the options is refused, while the same letter below them is not', () => {
  const facts = syntheticFacts();
  const complete = authored(facts);

  assert.ok(!faultKinds(complete, facts).includes('forward-reference:Q1'),
    'the 推奨 line names an option letter and is not a forward reference');

  const early = withValueUnder(complete, CONTEXT_LABEL, 'A と B のどちらに置くかを決めます。');
  assert.ok(faultKinds(early, facts).includes('forward-reference:Q1'),
    'a letter the reader meets before the options block is a defect');
});

test('a letter in an earlier paragraph of the question is refused, not only one in the last', () => {
  const facts = syntheticFacts();
  const twoParagraphs = withEarlierParagraph(authored(facts), 'A と B のどちらに置くかを決めます。');

  assert.ok(
    faultKinds(twoParagraphs, facts).includes('forward-reference:Q1'),
    'every paragraph the reader meets above the options is scanned, not just the final one',
  );
});

test('the record copy is outside the scan, so verbatim contract text raises no forward reference', () => {
  const facts = syntheticFacts();
  const verbatim = 'atomicity: "A Forum Root Succession is atomic: either the soul-side trust epoch advances or neither takes effect."';
  const withRecordCopy = withValueUnder(authored(facts), '記録の写し', verbatim);

  assert.ok(
    !faultKinds(withRecordCopy, facts).includes('forward-reference:Q1'),
    'the record is quoted in its own words, and the word A in it is not a forward reference',
  );
});

test('a question offering fewer than two letters is not scanned for a forward reference', () => {
  const facts = syntheticFacts();
  const early = withValueUnder(authored(facts), CONTEXT_LABEL, 'A と B のどちらに置くかを決めます。');
  const lines = early.split('\n');
  const optionsAt = lines.findIndex((line) => line.trimStart().startsWith(`- ${OPTIONS_LABEL}:`));
  const withoutB = lines.filter((line, index) => !(index > optionsAt && /^\s*B:/.test(line))).join('\n');

  assert.ok(!faultKinds(withoutB, facts).includes('forward-reference:Q1'),
    'a question that cannot be answered by choosing is refused for that reason, not this one');
});

test('every fault kind the gate can report has a sentence to report it with', () => {
  for (const kind of ['forward-reference', 'missing-settle-trace']) {
    assert.strictEqual(typeof FAULT_MESSAGES[kind], 'string', `${kind} has a message`);
    assert.ok(FAULT_MESSAGES[kind].length > 0, `${kind}'s message is not empty`);
  }
});

test('the command file states the gate, the shape rules, the block order, and the label the frame writes', () => {
  const command = readFileSync(COMMAND_PATH, 'utf8');
  const required = [
    '## The question gate (settle before drafting)',
    'Four inferences this gate forbids',
    'A flag is not a ground and is not weight.',
    'not an exemption from it',
    '| W13 |',
    '| W14 |',
    '| W15 |',
    '| W16 |',
    '| W17 |',
    '| W18 |',
    '| W19 |',
    '| W20 |',
    '| W21 |',
    '私は〈理由〉という理由で〈結論〉とするのが良いと思っていますが、選択の余地は以下の部分に少しだけ残ります。',
    '### The question block, in order',
    '誰が / 何を / どうする / いつ',
    'These rules govern the **chat message** as well as the document block.',
    'A reply that is not an answer',
    'Three consecutive prose repairs of one question',
    'any question the settle gate would have settled',
    SETTLE_TRACE_LABEL,
  ];
  for (const text of required) {
    assert.ok(command.includes(text), `the command file states: ${text}`);
  }
});

test('the ticket adds tests without changing any discovery rule', () => {
  const changed = execFileSync(
    'git',
    ['status', '--porcelain', '--', '.claude/tests/run-all.js', 'tests/run-all-surfaces.mjs'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  assert.strictEqual(changed.trim(), '', 'the runners already reach the tree these tests live in');
});

test('the migrated gaia documents carry a settle trace in every question item', () => {
  if (!existsSync(GAIA_ROOT)) {
    assert.ok(true, 'no gaia workspace on this machine; run.mjs check is the verification there');
    return;
  }
  const sections = ['crates/foundation/gaia-foundation', 'crates/protocol/gaia-soul', 'crates/network/gaia-network'];
  for (const section of sections) {
    const text = readFileSync(path.join(GAIA_ROOT, section, 'EXPLAIN-RFC-SEED.md'), 'utf8');
    text
      .split(/^### 判断 Q/m)
      .slice(1)
      .forEach((item, index) => {
        assert.match(
          item,
          /^- 決められなかった理由:(?:\s+\S|\n\s+\S)/m,
          `${section} Q${index + 1} carries a filled settle trace`,
        );
      });
  }
});
