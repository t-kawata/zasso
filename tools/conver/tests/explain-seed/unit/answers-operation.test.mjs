// PX-226 @verifies C003
// PX-226 @verifies C004
//
// The asking round is the step the command now ends on, so its verdict is asserted against
// documents rather than against the process: `readAnswers` is the reader, `renderAnswerVerdict`
// is what an operator sees, and the process around them is a thin shell the acceptance suite
// drives end to end. A reader tested only through a subprocess would leave the distinction
// this file exists to pin — "nothing to ask" against "nothing answered" — untested.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ExplainSeedError } from '../../../.claude/scripts/explain-seed/lib/errors.mjs';
import {
  FRAME_SECTIONS,
  HUMAN_ITEM_HEADING,
  HUMAN_SECTION_ID,
  buildFrame,
  locateSections,
} from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import { splitItems } from '../../../.claude/scripts/explain-seed/lib/items.mjs';
import { isPlaceholderLine } from '../../../.claude/scripts/explain-seed/lib/markers.mjs';
import {
  OPERATIONS,
  parseArguments,
  readAnswers,
  renderAnswerVerdict,
} from '../../../.claude/scripts/explain-seed/run.mjs';
import { fillEveryMarker } from '../helpers/fill-frame.mjs';
import { syntheticFacts, syntheticProjection } from '../helpers/synthetic-facts.mjs';

const HUMAN_NOTE = '人間の判断: 現場では拒否のほうが自然だと考える。';
const SEED_PATH = '/tmp/explain-seed-fixture/crates/protocol/alpha/RFC-SEED.md';

/** An authored explanation: every instruction answered, no question answered. */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
function authored() {
  return fillEveryMarker(buildFrame({ facts: syntheticFacts(), previous: null }).text);
}

/** The ids of the questions a document asks, in the order it asks them. */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
function askedIds(documentText) {
  return splitItems(locateSections(documentText).bodies[HUMAN_SECTION_ID] ?? '', HUMAN_ITEM_HEADING).map((item) => item.id);
}

/**
 * The same document with a person's answer written under the first place a person writes.
 *
 * The answer goes under a placeholder *line*, not under the first mention of the string: the
 * document's own header explains what the placeholder is for, and an answer written there is
 * an answer to nothing.
 */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
function withNoteUnderFirstPlaceholder(documentText, note) {
  const lines = [];
  let written = false;
  for (const line of documentText.split('\n')) {
    lines.push(line);
    if (written || !isPlaceholderLine(line)) continue;
    lines.push(note);
    written = true;
  }
  return lines.join('\n');
}

/** The same document with an answer under every place a person writes that has none yet. */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
function withNoteUnderEveryPlaceholder(documentText, note) {
  const source = documentText.split('\n');
  const lines = [];
  for (const [index, line] of source.entries()) {
    lines.push(line);
    if (!isPlaceholderLine(line) || (source[index + 1] ?? '').trim() !== '') continue;
    lines.push(note);
  }
  return lines.join('\n');
}

/** The same document with the human's section cut out, so nothing says where a person answers. */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
function withoutHumanSection(documentText) {
  const heading = `## ${FRAME_SECTIONS[4].title}`;
  const start = documentText.indexOf(heading);
  assert.notEqual(start, -1, 'the document being cut has the section being cut');
  const rest = documentText.slice(start + heading.length);
  return `${documentText.slice(0, start)}${rest.slice(rest.search(/\n## /) + 1)}`;
}

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C003 precondition and postcondition: a document whose questions are unanswered names every one of them', () => {
  const complete = authored();
  const itemIds = askedIds(complete);

  assert.ok(itemIds.length > 0, 'the fixture asks at least one question');
  assert.deepEqual(readAnswers(complete), { asked: itemIds.length, answered: 0, unanswered: itemIds });
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C003 postcondition: each answer retires its own question and leaves the rest standing', () => {
  const complete = authored();
  const [firstId, ...rest] = askedIds(complete);
  const oneAnswered = withNoteUnderFirstPlaceholder(complete, HUMAN_NOTE);

  assert.deepEqual(readAnswers(oneAnswered).unanswered, rest, 'only the question that was answered leaves the list');
  assert.equal(readAnswers(oneAnswered).answered, 1);

  const allAnswered = withNoteUnderEveryPlaceholder(complete, HUMAN_NOTE);
  assert.deepEqual(readAnswers(allAnswered), { asked: askedIds(complete).length, answered: askedIds(complete).length, unanswered: [] });
  assert.equal(readAnswers(allAnswered).unanswered.includes(firstId), false);
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C003 postcondition: an explanation that asks nothing is complete, and says so rather than reporting a failure', () => {
  const facts = syntheticFacts({ projection: syntheticProjection({ grill: { questions: [], risky_boundaries: [] } }) });
  const quiet = fillEveryMarker(buildFrame({ facts, previous: null }).text);
  const reading = readAnswers(quiet);

  assert.deepEqual(reading, { asked: 0, answered: 0, unanswered: [] });
  assert.match(renderAnswerVerdict(reading), /nothing to ask/i, 'an empty section is stated, not passed over in silence');
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C003 postcondition: the verdict states how far the round has got', () => {
  const complete = authored();
  const allAnswered = withNoteUnderEveryPlaceholder(complete, HUMAN_NOTE);
  const open = renderAnswerVerdict(readAnswers(complete));
  const closed = renderAnswerVerdict(readAnswers(allAnswered));

  for (const id of askedIds(complete)) {
    assert.ok(open.includes(id), `${id} is named while it has no answer`);
  }
  assert.match(closed, new RegExp(`${askedIds(complete).length} of ${askedIds(complete).length}`), 'a finished round reports its count');
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C003 boundary: an answer spanning several lines counts as one answer, not as several', () => {
  const complete = authored();
  const [firstId] = askedIds(complete);
  const answered = withNoteUnderFirstPlaceholder(complete, `${HUMAN_NOTE}\n補足: 記録のどこを見たかも残しておく。`);
  const reading = readAnswers(answered);

  assert.equal(reading.answered, 1, 'the item is answered, however many lines the answer runs to');
  assert.equal(reading.unanswered.includes(firstId), false);
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C003 invariant: a document whose human section cannot be read raises rather than reporting nothing to answer', () => {
  const complete = authored();

  assert.throws(
    () => readAnswers(withoutHumanSection(complete)),
    ExplainSeedError,
    '"cannot be read" and "nothing to answer" are different states, and a round that conflated them would call an unreadable document finished',
  );
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C003 boundary: a human section that appears twice is a reading failure, not two rounds of questions', () => {
  const complete = authored();
  const heading = `## ${FRAME_SECTIONS[4].title}`;
  const doubled = complete.replace(heading, `${heading}\n\n${heading}`);

  assert.throws(() => readAnswers(doubled), ExplainSeedError);
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C004 precondition: the tool accepts every operation it declares, and each takes exactly one seed path', () => {
  const names = Object.values(OPERATIONS);

  assert.deepEqual(names, ['info', 'check', 'answers'], 'the third operation is the only addition to the surface');
  for (const operation of names) {
    const parsed = parseArguments([operation, SEED_PATH]);
    assert.equal(parsed.operation, operation);
    assert.equal(parsed.seedPath, SEED_PATH);
  }
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C004 postcondition: every other argv is refused, and the refusal names what is accepted', () => {
  const names = Object.values(OPERATIONS);
  const refused = [
    ['verify', SEED_PATH],
    [],
    ['info'],
    ['info', SEED_PATH, SEED_PATH],
    [`--seed=${SEED_PATH}`, SEED_PATH],
  ];

  for (const argv of refused) {
    assert.throws(
      () => parseArguments(argv),
      (error) => names.every((name) => error.message.includes(name)),
      `${JSON.stringify(argv)} is refused, and the refusal lists all three operations`,
    );
  }
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C004 invariant: the refusal lists the operations the parser accepts, not a list written beside it', () => {
  let message = '';
  try {
    parseArguments(['verify', SEED_PATH]);
  } catch (error) {
    message = error.message;
  }

  assert.ok(
    message.includes(Object.values(OPERATIONS).join(', ')),
    'a hand-written pair would keep saying two after a third was added, and the message would describe a parser that no longer exists',
  );
});
