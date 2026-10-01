// PX-229 @verifies C003
// PX-229 @verifies C001
// PX-230 @verifies C001
// PX-230 @verifies C004
//
// The ledger is what the command document derives on every read instead of storing: each
// recorded open point is exactly one of open, bound to a question, or settled with a ground.
// It is asserted here against fixtures rather than through a subprocess, because the property
// that matters is structural — the three sets partition the recorded open set — and a
// subprocess could only show one document at a time.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveLedger,
  readBoundPointIds,
  readQuestions,
  readRounds,
  universeOf,
} from '../../../.claude/scripts/explain-seed/lib/ledger.mjs';
import { buildFrame, readQuestionNumbers } from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import {
  appendAddedPoint,
  appendPreDecision,
  authorDocument,
  authorExplanation,
  bindPoints,
  fillEveryMarker,
} from '../helpers/fill-frame.mjs';
import {
  SETTLED_ELSEWHERE,
  syntheticFacts,
  syntheticOpenIds,
  syntheticProjection,
} from '../helpers/synthetic-facts.mjs';

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C003 postcondition: a point a question binds is bound and records that question number', () => {
  const projection = syntheticProjection();
  const documentText = authorDocument({
    facts: syntheticFacts(),
    questions: [{ number: 1, bound: ['residual-000001', 'boundary-001'] }],
    preDecided: [],
  });
  const ledger = deriveLedger({ documentText, projection });

  assert.deepEqual([...ledger.bound].sort(), ['boundary-001', 'residual-000001']);
  assert.deepEqual([...ledger.open], []);
  assert.deepEqual([...ledger.settled], []);
  assert.deepEqual([...ledger.unsettled].sort(), ['boundary-001', 'residual-000001']);
  assert.deepEqual(ledger.questions.map((question) => question.number), [1], 'the question that bound them is recorded');
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C003 postcondition: a point a grounded pre-decision names is settled, and one an ungrounded item names is not', () => {
  const facts = syntheticFacts();
  const documentText = authorDocument({
    facts,
    questions: [{ number: 1, bound: ['boundary-001'], answer: 'A' }],
    preDecided: [{ reference: 'residual-000001', ground: 'Q1 A' }],
  });
  const ledger = deriveLedger({ documentText, projection: facts.projection });

  assert.deepEqual([...ledger.settled], ['residual-000001']);
  assert.deepEqual([...ledger.bound], ['boundary-001']);
  assert.deepEqual([...ledger.open], []);
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C003 postcondition: a recorded point no question and no pre-decision names is open', () => {
  const facts = syntheticFacts();
  const documentText = authorDocument({
    facts,
    questions: [{ number: 1, bound: ['boundary-001'] }],
    preDecided: [],
  });
  const ledger = deriveLedger({ documentText, projection: facts.projection });

  assert.deepEqual([...ledger.open], ['residual-000001']);
  assert.deepEqual([...ledger.unsettled].sort(), ['boundary-001', 'residual-000001']);
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C003 boundary: with an empty human section every recorded point is open and unsettled equals the recorded set', () => {
  const facts = syntheticFacts();
  const frame = fillEveryMarker(buildFrame({ facts, previous: null }).text);
  const ledger = deriveLedger({ documentText: frame, projection: facts.projection });

  assert.deepEqual([...ledger.open].sort(), [...syntheticOpenIds(facts.projection)].sort());
  assert.deepEqual([...ledger.unsettled].sort(), [...syntheticOpenIds(facts.projection)].sort());
  assert.equal(ledger.bound.size + ledger.settled.size, 0);
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C003 invariant: the three sets are pairwise disjoint and their union is the recorded open set, for every fixture', () => {
  const cases = [
    { overrides: {}, bound: ['residual-000001', 'boundary-001'] },
    { overrides: { settledElsewhere: SETTLED_ELSEWHERE }, bound: ['residual-000001'] },
    { overrides: { grill: { questions: [], risky_boundaries: [] } }, bound: [] },
  ];

  for (const fixture of cases) {
    const projection = syntheticProjection(fixture.overrides);
    const documentText = authorDocument({
      facts: syntheticFacts({ projection }),
      questions: [{ number: 1, bound: fixture.bound }],
      preDecided: [],
    });
    const ledger = deriveLedger({ documentText, projection });
    const union = new Set([...ledger.open, ...ledger.bound, ...ledger.settled]);

    assert.deepEqual([...union].sort(), [...syntheticOpenIds(projection)].sort(), 'the union is exactly the recorded open set');
    assert.equal(
      ledger.open.size + ledger.bound.size + ledger.settled.size,
      union.size,
      'no point is in two sets at once',
    );
  }
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C005 normal condition: a point bound to a question with no answer is unsettled', () => {
  const facts = syntheticFacts();
  const documentText = authorDocument({
    facts,
    questions: [{ number: 1, bound: ['residual-000001', 'boundary-001'] }],
    preDecided: [],
  });
  const ledger = deriveLedger({ documentText, projection: facts.projection });

  assert.deepEqual([...ledger.unsettled].sort(), ['boundary-001', 'residual-000001'], 'an unanswered question leaves its points unsettled');
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C001 normal condition: the round count is the number of separators, and a document with none reports zero', () => {
  const facts = syntheticFacts();
  const withoutRound = authorDocument({ facts, questions: [] });

  assert.equal(readRounds({ documentText: withoutRound }).length, 0, 'a document that opens no round reports none');

  const oneRound = authorExplanation({ facts, size: 1 });
  assert.deepEqual(readRounds({ documentText: oneRound }), [1], 'one separator is one round');
  assert.deepEqual(readQuestionNumbers(oneRound), [1]);
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C001 normal condition: the number of a question is read from its heading, so Q12 and Q2 are told apart by value', () => {
  const documentText = authorDocument({
    facts: syntheticFacts(),
    questions: [{ number: 2, bound: [] }, { number: 12, bound: [] }],
  });

  assert.deepEqual(readQuestions({ documentText }).map((question) => question.number), [2, 12]);
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C003 postcondition: the ids a question binds are read from its AI-only bound-points line', () => {
  const questionBody = [
    '- 判断の前提:',
    '  この判断は、決められた範囲を越えた記録が届いたときの話である。',
    '- 束ねた論点:',
    '  residual-000001, boundary-001',
    '- この質問で決まること:',
    '  この答えで境界の扱いをまとめて決められる。',
  ].join('\n');

  assert.deepEqual(readBoundPointIds({ questionBody }), ['residual-000001', 'boundary-001']);
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C003 boundary: a question with no bound-points line binds nothing, and a line that only mentions the label is not one', () => {
  const withoutLine = '- 判断の前提:\n  この判断は境界の話である。\n<!-- 人間の判断 -->';
  assert.deepEqual(readBoundPointIds({ questionBody: withoutLine }), [], 'a question whose line is absent binds nothing');

  const mentionInProse = `- 判断の前提:\n  これは束ねた論点: の話ではない。\n- ${'束ねた論点'} を後で書く。`;
  assert.deepEqual(
    readBoundPointIds({ questionBody: mentionInProse }),
    [],
    'a line that mentions the label without opening with it is prose, not a bound-points line',
  );
});

/** The added point the human's answer raised, in the shape every case here uses. */
const ADDED_POINT = { id: 'added-001', origin: '「監査ログは残せない」', statement: '監査ログを残すかどうか' };

/** An authored document with one added-point block and the recorded points the caller bound. */
// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
function withAddedPoint(facts, { bound = syntheticOpenIds(facts.projection) } = {}) {
  return appendAddedPoint(authorExplanation({ facts, boundIds: bound }), ADDED_POINT);
}

// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
test('C001 normal: a point the document adds joins the ledger universe as an open point', () => {
  const facts = syntheticFacts();
  const withBlock = withAddedPoint(facts);
  const ledger = deriveLedger({ documentText: withBlock, projection: facts.projection });

  assert.deepEqual(
    [...universeOf({ projection: facts.projection, documentText: withBlock })].sort(),
    [...syntheticOpenIds(facts.projection), 'added-001'].sort(),
  );
  assert.ok(ledger.open.has('added-001'), 'the recorded points are bound, the added point is still open');
  assert.deepEqual([...ledger.added], ['added-001'], 'the ledger says which ids came from the document');
});

// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
test('C001 normal: an added point a question\'s bound-points line names is bound, and records that question number', () => {
  const facts = syntheticFacts();
  const bound = bindPoints(withAddedPoint(facts), 'added-001');
  const ledger = deriveLedger({ documentText: bound, projection: facts.projection });

  assert.ok(ledger.bound.has('added-001'), 'a question that names the added point binds it');
  assert.equal(ledger.open.has('added-001'), false);
  assert.deepEqual(ledger.unsettled.has('added-001'), true, 'bound is unsettled until an answer settles it');
});

// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
test('C001 normal: an added point a pre-decided item carrying a ground names is settled, and records that ground', () => {
  const facts = syntheticFacts();
  const settled = appendPreDecision(withAddedPoint(facts), { reference: 'added-001', ground: 'Q1 A' });
  const ledger = deriveLedger({ documentText: settled, projection: facts.projection });

  assert.deepEqual([...ledger.settled], ['added-001']);
  assert.equal(ledger.open.has('added-001'), false);
  assert.equal(ledger.bound.has('added-001'), false);
});

// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
test('C001 invariant: settled wins over bound for an added point, so the three sets stay disjoint', () => {
  const facts = syntheticFacts();
  const both = appendPreDecision(bindPoints(withAddedPoint(facts), 'added-001'), { reference: 'added-001', ground: 'Q1 A' });
  const ledger = deriveLedger({ documentText: both, projection: facts.projection });

  assert.deepEqual([...ledger.settled], ['added-001']);
  assert.equal(ledger.bound.has('added-001'), false, 'a settled point is not also reported as bound');
});

// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
test('C001 invariant: the union of open, bound and settled is exactly the recorded points together with the added ones, for every fixture', () => {
  for (const overrides of [{}, { settledElsewhere: SETTLED_ELSEWHERE }]) {
    const projection = syntheticProjection(overrides);
    const facts = syntheticFacts({ projection });
    const withBlock = withAddedPoint(facts);
    const ledger = deriveLedger({ documentText: withBlock, projection });
    const union = new Set([...ledger.open, ...ledger.bound, ...ledger.settled]);

    assert.deepEqual([...union].sort(), [...universeOf({ projection, documentText: withBlock })].sort());
    assert.equal(ledger.open.size + ledger.bound.size + ledger.settled.size, union.size, 'the three sets are pairwise disjoint');
  }
});

// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
test('C001 boundary: a document that adds no point has exactly the recorded open set as its universe', () => {
  const facts = syntheticFacts();
  const plain = authorExplanation({ facts, boundIds: syntheticOpenIds(facts.projection) });

  assert.deepEqual(
    [...universeOf({ projection: facts.projection, documentText: plain })].sort(),
    [...syntheticOpenIds(facts.projection)].sort(),
  );
  assert.deepEqual([...deriveLedger({ documentText: plain, projection: facts.projection }).added], []);
});

// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
test('C001 normal: an added point carries the origin it was refined from, so it can be told from a recorded one', () => {
  const facts = syntheticFacts();
  const ledger = deriveLedger({ documentText: withAddedPoint(facts), projection: facts.projection });

  assert.deepEqual([...ledger.added], ['added-001'], 'only the id the document contributed is an added id');
  for (const id of syntheticOpenIds(facts.projection)) {
    assert.equal(ledger.added.has(id), false, 'a recorded id is never reported as added');
  }
});

// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
test('C004 invariant: adding a point can never shorten the loop, only lengthen it', () => {
  const facts = syntheticFacts();
  const plain = authorExplanation({ facts, boundIds: syntheticOpenIds(facts.projection) });
  const withBlock = appendAddedPoint(plain, ADDED_POINT);
  const before = [...deriveLedger({ documentText: plain, projection: facts.projection }).unsettled].sort();
  const after = [...deriveLedger({ documentText: withBlock, projection: facts.projection }).unsettled].sort();

  assert.deepEqual(after, [...before, 'added-001'].sort(), 'the added point is one more thing to settle, never one fewer');
});

// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
test('C004 normal: answers refuses while an added point is unsettled and accepts once it is settled with a ground', () => {
  const facts = syntheticFacts();
  const recorded = syntheticOpenIds(facts.projection);
  const basis = appendAddedPoint(
    authorDocument({
      facts,
      questions: [{ number: 1, bound: ['added-001'] }],
      preDecided: recorded.map((id) => ({ reference: id, ground: 'Q1 A' })),
    }),
    ADDED_POINT,
  );

  assert.deepEqual([...deriveLedger({ documentText: basis, projection: facts.projection }).unsettled], ['added-001']);

  const settled = appendPreDecision(basis, { reference: 'added-001', ground: 'Q1 A' });
  assert.deepEqual([...deriveLedger({ documentText: settled, projection: facts.projection }).unsettled], []);
});
