// PX-229 @verifies C003
// PX-229 @verifies C001
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
} from '../../../.claude/scripts/explain-seed/lib/ledger.mjs';
import { buildFrame, readQuestionNumbers } from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import { authorDocument, authorExplanation, fillEveryMarker } from '../helpers/fill-frame.mjs';
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
