// PX-225 @verifies C001
//
// An explanation item is a heading, a body, and the place a person writes. The gate and the
// reader that looks into a neighbour's explanation must agree on all three, or a document the
// gate accepts could be read as saying something it does not — which is why these predicates
// live in one module rather than one copy each.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HUMAN_ITEM_HEADING,
  PREDECIDED_ITEM_HEADING,
  decisionUnderPlaceholder,
  isItemHeading,
  questionNumberOf,
  referenceOf,
  splitItems,
} from '../../../.claude/scripts/explain-seed/lib/items.mjs';
import { countPlaceholdersIn, isPlaceholderLine } from '../../../.claude/scripts/explain-seed/lib/markers.mjs';

/** One human-decision section: two items, the first decided and the second not. */
const DECIDED = [
  '## 人間が決めること（ここだけ）',
  '',
  '### 判断 H1 — boundary-001',
  '- 誰の体験が変わるか:',
  '  却下の形は面を作る開発者の体験を変える。',
  '<!-- 人間の判断 -->',
  '却下はエラーコードで返す。',
  '理由は帯域外に落とさない。',
  '',
  '### 判断 H2 — boundary-003',
  '<!-- 人間の判断 -->',
].join('\n');

// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
test('C001 precondition: the headings this module splits on are the ones the frame writes', () => {
  assert.equal(HUMAN_ITEM_HEADING, '### 判断');
  assert.equal(PREDECIDED_ITEM_HEADING, '### 先に決めた');
});

test('C001 postcondition: the prose below the placeholder is the decision, item by item', () => {
  const items = splitItems(DECIDED, HUMAN_ITEM_HEADING);

  assert.equal(items.length, 2, 'one record per heading, in document order');
  assert.equal(referenceOf(items[0].heading), 'boundary-001');
  assert.equal(referenceOf(items[1].heading), 'boundary-003');
  assert.equal(
    decisionUnderPlaceholder(items[0].body),
    '却下はエラーコードで返す。\n理由は帯域外に落とさない。',
    'interior lines are preserved and surrounding whitespace is trimmed',
  );
});

test('C001 postcondition: a placeholder with nothing under it decides nothing', () => {
  const items = splitItems(DECIDED, HUMAN_ITEM_HEADING);

  assert.equal(decisionUnderPlaceholder(items[1].body), null);
});

test('C001 postcondition: a section holding no item of this heading yields no item', () => {
  const sectionWithoutHumanItems = '## 先に決めておいたこと\n\n### 先に決めた A1 — contract_registry\n- 決定: something\n';

  assert.deepEqual(splitItems(sectionWithoutHumanItems, HUMAN_ITEM_HEADING), []);
});

test('C001 invariant: indentation cannot hide a placeholder, so a second one is a second place to write', () => {
  const body = [
    '<!-- 人間の判断 -->',
    '  <!-- 人間の判断 -->',
    '決定: A',
  ].join('\n');

  assert.equal(isPlaceholderLine(body.split('\n')[1]), true, 'the predicate trims, so indentation decides nothing');
  assert.equal(
    countPlaceholdersIn(body),
    2,
    'which is what makes an item quoting the marker ambiguous, and why the reader refuses it rather than guessing',
  );
});

test('C001 invariant: the decision is a substring of the document and is never rewritten', () => {
  const body = [
    '<!-- 人間の判断 -->',
    '却下はエラーコードで返す。',
    '',
    '  補足: 帯域外に落とさない。  ',
  ].join('\n');

  const decision = decisionUnderPlaceholder(body);

  assert.notEqual(decision, null);
  assert.equal(body.includes(decision), true, 'quoted, not translated or joined');
  assert.equal(decision.endsWith('補足: 帯域外に落とさない。'), true, 'the last line loses only its trailing spaces');
});

test('C001 invariant: a heading without the reference separator names no record', () => {
  assert.equal(referenceOf('### 判断 H1'), null);
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C001 postcondition: the number of a question is read from its heading, by value and not by text', () => {
  assert.equal(questionNumberOf(`${HUMAN_ITEM_HEADING} Q7`), 7);
  assert.equal(questionNumberOf(`${HUMAN_ITEM_HEADING} Q12`), 12, 'a two-digit number is read as one number, not as its first character');
  assert.notEqual(questionNumberOf(`${HUMAN_ITEM_HEADING} Q12`), questionNumberOf(`${HUMAN_ITEM_HEADING} Q2`));
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C007 boundary: a heading whose text after the separator names a record yields no question number', () => {
  assert.equal(questionNumberOf(`${HUMAN_ITEM_HEADING} Q1 — residual-000001`), null, 'the heading an earlier frame wrote is not a question this frame asks');
  assert.equal(questionNumberOf(`${HUMAN_ITEM_HEADING} H1 — boundary-001`), null, 'and neither is one that names no number at all');
  assert.equal(questionNumberOf(`${HUMAN_ITEM_HEADING} Q1 の話`), null, 'a heading that mentions a number but is not one is not a question heading');
});

// [::TICKET::] PX-237 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-237 --for-spec --no-implementation-order`.
test('C001 boundary: a heading belongs to the token only when the token ends there', () => {
  // One rule, both tokens: a heading that continues the token's characters is another
  // heading, and reading it as this one would open an item the frame never wrote.
  for (const heading of [HUMAN_ITEM_HEADING, PREDECIDED_ITEM_HEADING]) {
    const longer = `${heading}ことの補足`;
    assert.equal(isItemHeading(heading, heading), true, 'the bare token opens an item');
    assert.equal(isItemHeading(`${heading} A1 — record-1`, heading), true, 'and so does the token followed by what the frame writes');
    assert.equal(isItemHeading(longer, heading), false, `${longer} merely begins with the same characters`);
  }
});

// [::TICKET::] PX-237 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-237 --for-spec --no-implementation-order`.
test('C001 invariant: the number of an indented question is read, because the item is', () => {
  // Both readers normalise leading whitespace the same way, so an indented heading
  // cannot be one reader's item and no reader's question.
  const indented = splitItems(`  ${HUMAN_ITEM_HEADING} Q3\n<!-- 人間の判断 -->\n`, HUMAN_ITEM_HEADING);

  assert.equal(indented.length, 1, 'the indented heading opens an item');
  assert.equal(questionNumberOf(indented[0].heading), 3, 'and the item names a question');
});
