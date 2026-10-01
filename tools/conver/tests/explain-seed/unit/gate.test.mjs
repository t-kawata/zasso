// PX-222 @verifies C005
// PX-222 @verifies C006
// PX-222 @verifies C007
// PX-225 @verifies C003
// PX-226 @verifies C002
// PX-226 @verifies C005
// PX-229 @verifies C004
// PX-229 @verifies C006
//
// The gate is the only thing standing between an unfinished explanation and the human who
// would act on it, so every rule it enforces is asserted twice: once as a document it must
// accept, and once as a document it must refuse while naming the section at fault.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  CONTEXT_LABEL,
  COUNT_LABEL,
  FRAME_SECTIONS,
  GROUND_LABEL,
  HUMAN_ITEM_HEADING,
  HUMAN_SECTION_ID,
  MIN_BOUND_POINTS,
  MIN_OPTION_COUNT,
  OPTIONS_LABEL,
  OVERRIDE_LABEL,
  PARTY_LABEL,
  RECOMMENDATION_LABEL,
  RECOMMENDATION_OVERRIDE_LABEL,
  RECOMMENDATION_REASON_LABEL,
  SCOPE_LABEL,
  DECISION_LABEL,
  countHumanDecisionItems,
  locateSections,
  verifyExplanation,
} from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import { questionNumberOf, splitItems } from '../../../.claude/scripts/explain-seed/lib/items.mjs';
import { MUST_FILL_MARKER, isPlaceholderLine } from '../../../.claude/scripts/explain-seed/lib/markers.mjs';
import { SETTLED_ELSEWHERE, syntheticFacts, syntheticOpenIds, syntheticProjection } from '../helpers/synthetic-facts.mjs';
import { authorDocument, authorExplanation } from '../helpers/fill-frame.mjs';

const E5_TITLE = FRAME_SECTIONS[4].title;
const E6_TITLE = FRAME_SECTIONS[5].title;

/** The recorded points the fixture records, which one question can bind in a single answer. */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
function boundIdsOf(facts = syntheticFacts()) {
  return syntheticOpenIds(facts.projection);
}

/** An authored EXPLAIN built from the given facts: one question binding every recorded point. */
// [::TICKET::] PX-222, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-229) --for-spec --no-implementation-order`.
function authored(facts = syntheticFacts()) {
  return authorExplanation({ facts, boundIds: boundIdsOf(facts) });
}

/** The fault kinds a verdict reports, for assertions that care about which rule fired. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function faultKinds(verdict) {
  return verdict.faults.map((fault) => fault.kind);
}

/** The question label the gate names a question by, read from its heading. */
// [::TICKET::] PX-226, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-226|PX-229) --for-spec --no-implementation-order`.
function firstAskedQuestion(documentText) {
  const located = locateSections(documentText);
  const [item] = splitItems(located.bodies[HUMAN_SECTION_ID] ?? '', HUMAN_ITEM_HEADING);
  assert.notEqual(item, undefined, 'the fixture asks at least one question');
  const number = questionNumberOf(item.heading);
  return number === null ? item.heading : `Q${number}`;
}

/**
 * Replace one section's body, keeping every other section as it was.
 *
 * The blank lines between the heading and the body stay with the heading: handing them to
 * the caller would allow a replacement that prepends a line to land on the heading itself,
 * which is how a test stops testing what it meant to.
 */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function rewriteSection(documentText, title, replace) {
  const heading = `## ${title}`;
  const start = documentText.indexOf(heading);
  assert.notEqual(start, -1);
  const bodyStart = start + heading.length;
  const rest = documentText.slice(bodyStart);
  const end = rest.search(/\n## /);
  const rawBody = end < 0 ? rest : rest.slice(0, end);
  const tail = end < 0 ? '' : rest.slice(end);
  const leading = rawBody.match(/^\s*/)[0];

  return `${documentText.slice(0, bodyStart)}${leading}${replace(rawBody.slice(leading.length))}${tail}`;
}

test('C007 precondition and postcondition: an authored explanation verifies against the facts it was built from', () => {
  const facts = syntheticFacts();
  const verdict = verifyExplanation({ facts, explainText: authored(facts) });

  assert.deepEqual(verdict.faults, []);
  assert.equal(verdict.ok, true);
});

test('C007 postcondition: a marker left open is refused, and the section holding it is named', () => {
  const facts = syntheticFacts();
  const left = rewriteSection(authored(facts), FRAME_SECTIONS[1].title, (body) => `${MUST_FILL_MARKER} 書き忘れた説明\n${body}`);
  const verdict = verifyExplanation({ facts, explainText: left });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.faults.some((fault) => fault.kind === 'open-marker' && fault.section === 'E2'));
});

test('C007 postcondition: a digest that no longer matches the facts on disk is refused by section', () => {
  const facts = syntheticFacts();
  const stale = authored(facts).replace(/"digest":\s*"[0-9a-f]{64}"/, `"digest": "${'ab'.repeat(32)}"`);
  const verdict = verifyExplanation({ facts, explainText: stale });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.faults.some((fault) => fault.kind === 'stale-digest'), 'the drifted section is reported');
});

test('C007 postcondition: a section that is missing altogether is refused by name', () => {
  const facts = syntheticFacts();
  const start = authored(facts).indexOf(`## ${E6_TITLE}`);
  const withoutSection = authored(facts).slice(0, start);
  const verdict = verifyExplanation({ facts, explainText: withoutSection });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.faults.some((fault) => fault.kind === 'missing-section' && fault.section === 'E6'));
});

test('C006 invariant: a recorded open item that disappeared is refused, and the id is named', () => {
  const facts = syntheticFacts();
  const removed = authored(facts).split('residual-000001').join('（記録なし）');
  const verdict = verifyExplanation({ facts, explainText: removed });

  assert.equal(verdict.ok, false);
  assert.ok(
    verdict.faults.some((fault) => fault.kind === 'missing-open-item' && fault.id === 'residual-000001'),
    'the id that vanished is named',
  );
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C006 invariant: a point a question binds and an answer then settles is the end state, not a fault', () => {
  const facts = syntheticFacts();
  const settled = authorDocument({
    facts,
    questions: [{ number: 1, bound: ['residual-000001', 'boundary-001'], answer: 'A' }],
    preDecided: [
      { reference: 'residual-000001', ground: 'Q1 A' },
      { reference: 'boundary-001', ground: 'Q1 A' },
    ],
  });

  assert.deepEqual(
    verifyExplanation({ facts, explainText: settled }).faults,
    [],
    'both sections naming the point is what settling a bound point looks like, so it is accepted',
  );
});

test('C006 invariant: an open item may not be the ground of a pre-decision', () => {
  const facts = syntheticFacts();
  const misgrounded = authored(facts).replace(`${GROUND_LABEL}: contract_registry`, `${GROUND_LABEL}: residual-000001`);
  const verdict = verifyExplanation({ facts, explainText: misgrounded });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.faults.some((fault) => fault.kind === 'open-item-as-ground' && fault.id === 'residual-000001'));
});

test('C006 postcondition: a declared count that disagrees with the questions is refused', () => {
  const facts = syntheticFacts();
  const miscounted = authored(facts).replace(`${COUNT_LABEL}: ${countHumanDecisionItems(authored(facts))} 件`, `${COUNT_LABEL}: 7 件`);
  const verdict = verifyExplanation({ facts, explainText: miscounted });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.faults.some((fault) => fault.kind === 'count-mismatch' && fault.section === 'E1'));
});

test('C005 invariant: an item that names no affected party is refused by section', () => {
  const facts = syntheticFacts();
  const unnamed = authored(facts).replace(new RegExp(`- ${PARTY_LABEL}:\\n[^\\n]*`), `- ${PARTY_LABEL}:`);
  const verdict = verifyExplanation({ facts, explainText: unnamed });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.faults.some((fault) => fault.kind === 'unnamed-party' && fault.section === 'E5'));
});

// [::TICKET::] PX-227 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-227 --for-spec --no-implementation-order`.
test('C002 invariant: a question carrying no context of its own is refused, naming the section and the question', () => {
  const facts = syntheticFacts();
  const complete = authored(facts);
  const question = firstAskedQuestion(complete);
  const contextless = complete.replace(new RegExp(`- ${CONTEXT_LABEL}:\\n[^\\n]*`), `- ${CONTEXT_LABEL}:`);
  const verdict = verifyExplanation({ facts, explainText: contextless });

  assert.equal(verdict.ok, false, 'a question nothing above it explains is not one a person who knows nothing can answer');
  assert.ok(
    verdict.faults.some((fault) => fault.kind === 'missing-context' && fault.section === HUMAN_SECTION_ID && fault.id === question),
    'and the refusal names the section and the question it is about',
  );
});

// [::TICKET::] PX-227 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-227 --for-spec --no-implementation-order`.
test('C002 boundary: an empty context and one still carrying its instruction are both no context', () => {
  const facts = syntheticFacts();
  const complete = authored(facts);
  const gutted = [
    complete.replace(new RegExp(`- ${CONTEXT_LABEL}:\\n[^\\n]*`), `- ${CONTEXT_LABEL}:`),
    complete.replace(
      new RegExp(`- ${CONTEXT_LABEL}:\\n[^\\n]*`),
      `- ${CONTEXT_LABEL}:\n  ${MUST_FILL_MARKER} ${CONTEXT_LABEL} — まだ書いていない`,
    ),
  ];

  for (const text of gutted) {
    assert.ok(
      verifyExplanation({ facts, explainText: text }).faults.some((fault) => fault.kind === 'missing-context'),
      'the rule reads a value that exists, not a label that exists',
    );
  }
});

// [::TICKET::] PX-227 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-227 --for-spec --no-implementation-order`.
test('C002 invariant: the context omission is reported alongside the four direction omissions', () => {
  const facts = syntheticFacts();
  const complete = authored(facts);
  const missingEverything = OMISSIONS.reduce((text, [, omit]) => omit(text), complete).replace(
    new RegExp(`- ${CONTEXT_LABEL}:\\n[^\\n]*`),
    `- ${CONTEXT_LABEL}:`,
  );

  assert.deepEqual(
    [...new Set(faultKinds(verifyExplanation({ facts, explainText: missingEverything })))].sort(),
    [
      'missing-context',
      'missing-recommendation',
      'missing-recommendation-override',
      'missing-recommendation-reason',
      'too-few-options',
    ],
    'a document missing all five reports all five, so fixing one does not hide the rest',
  );
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C004 postcondition: a question binding one point while two or more are open is refused, naming the section and the question', () => {
  const facts = syntheticFacts();
  const thin = authorDocument({ facts, questions: [{ number: 1, bound: ['residual-000001'] }] });
  const verdict = verifyExplanation({ facts, explainText: thin });

  assert.ok(
    verdict.faults.some((fault) => fault.kind === 'too-few-bound-points' && fault.id === 'Q1' && fault.section === 'E5'),
    'one point is a point put to the human, not a direction',
  );
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C004 boundary: a question binding exactly two points is accepted by that rule', () => {
  const facts = syntheticFacts();
  const pair = authorDocument({ facts, questions: [{ number: 1, bound: ['residual-000001', 'boundary-001'] }] });

  assert.equal(
    verifyExplanation({ facts, explainText: pair }).faults.some((fault) => fault.kind === 'too-few-bound-points'),
    false,
  );
  assert.equal(MIN_BOUND_POINTS, 2, 'the declared minimum is what the rule enforces');
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C004 boundary: the two-point rule is exempt when fewer than two points are open, decided by the open count alone', () => {
  const onePoint = syntheticProjection({
    grill: {
      questions: [{ residual_id: 'residual-000001', question: 'Q', topic: 'T', why_unresolved: 'W' }],
      risky_boundaries: [],
    },
  });
  const facts = syntheticFacts({ projection: onePoint });
  const verdict = verifyExplanation({
    facts,
    explainText: authorDocument({ facts, questions: [{ number: 1, bound: ['residual-000001'] }] }),
  });

  assert.equal(verdict.faults.some((fault) => fault.kind === 'too-few-bound-points'), false, 'the exemption is decided by the open count alone');
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C004 postcondition: a bound id the manifests never recorded is refused as an unrecorded decision', () => {
  const facts = syntheticFacts();
  const stray = authorDocument({ facts, questions: [{ number: 1, bound: ['residual-000001', 'obj-000001'] }] });
  const verdict = verifyExplanation({ facts, explainText: stray });

  assert.ok(verdict.faults.some((fault) => fault.kind === 'unrecorded-decision' && fault.id === 'obj-000001'));
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C004 postcondition: a question carrying no scope line is refused, naming the section and the question', () => {
  const facts = syntheticFacts();
  const complete = authored(facts);
  const unscoped = complete.replace(new RegExp(`- ${SCOPE_LABEL}:\\n[^\\n]*`), `- ${SCOPE_LABEL}:`);
  const verdict = verifyExplanation({ facts, explainText: unscoped });

  assert.equal(verdict.ok, false, 'a question that does not say what an answer settles is not a direction');
  assert.ok(
    verdict.faults.some((fault) => fault.kind === 'missing-scope-line' && fault.id === firstAskedQuestion(complete)),
  );
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C006 postcondition: a pre-decision grounded on an answered question is accepted by the gate', () => {
  const facts = syntheticFacts();
  const accepted = verifyExplanation({
    facts,
    explainText: authorDocument({
      facts,
      questions: [{ number: 2, bound: ['residual-000001', 'boundary-001'], answer: 'A' }],
      preDecided: [{ reference: 'residual-000001', ground: 'Q2 A' }],
    }),
  });

  assert.equal(accepted.faults.some((fault) => fault.kind === 'unresolvable-ground'), false, 'an answered question is a ground');
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C006 error case: a pre-decision grounded on a question this document does not ask is refused', () => {
  const facts = syntheticFacts();
  const verdict = verifyExplanation({
    facts,
    explainText: authorDocument({
      facts,
      questions: [{ number: 2, bound: ['residual-000001', 'boundary-001'], answer: 'A' }],
      preDecided: [{ reference: 'residual-000001', ground: 'Q9 A' }],
    }),
  });

  assert.ok(verdict.faults.some((fault) => fault.kind === 'unknown-question-as-ground' && fault.section === 'E6'));
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C006 error case: a pre-decision grounded on a question that carries no answer is refused', () => {
  const facts = syntheticFacts();
  const verdict = verifyExplanation({
    facts,
    explainText: authorDocument({
      facts,
      questions: [{ number: 2, bound: ['residual-000001', 'boundary-001'] }],
      preDecided: [{ reference: 'residual-000001', ground: 'Q2 A' }],
    }),
  });

  assert.ok(verdict.faults.some((fault) => fault.kind === 'unanswered-question-as-ground' && fault.section === 'E6'));
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C006 invariant: a recorded open point is refused as a ground whether it is unattached or bound to a question', () => {
  const facts = syntheticFacts();
  const verdict = verifyExplanation({ facts, explainText: authored(facts) });
  const bound = syntheticOpenIds(facts.projection)[0];

  const misgrounded = authored(facts).replace(
    new RegExp(`- ${GROUND_LABEL}: [^\\n]*`),
    `- ${GROUND_LABEL}: ${bound}`,
  );

  assert.ok(
    verifyExplanation({ facts, explainText: misgrounded }).faults.some((fault) => fault.kind === 'open-item-as-ground' && fault.id === bound),
    'a point the manifests recorded as open can never be the ground of a decision',
  );
  assert.ok(verdict.faults.length >= 0, 'the document being served is the same one the surgery is applied to');
});

test('C007 postcondition: an item without its placeholder is refused by section', () => {
  const facts = syntheticFacts();
  const stripped = authored(facts)
    .split('\n')
    .filter((line) => !isPlaceholderLine(line) || line.includes('x'))
    .join('\n')
    .replace(/<!-- 人間の判断 -->\n/g, '');
  const verdict = verifyExplanation({ facts, explainText: stripped });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.faults.some((fault) => fault.kind === 'missing-placeholder' && fault.section === 'E5'));
});

test('C007 postcondition: one item carrying two placeholders is refused by section', () => {
  const facts = syntheticFacts();
  const doubled = rewriteSection(
    authored(facts),
    E5_TITLE,
    (body) => body.replace(/<!-- 人間の判断 -->/, '<!-- 人間の判断 -->\n<!-- 人間の判断 -->'),
  );
  const verdict = verifyExplanation({ facts, explainText: doubled });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.faults.some((fault) => fault.kind === 'duplicate-placeholder' && fault.section === 'E5'));
});

test('C006 postcondition: a pre-decision missing its decision, ground or override is refused', () => {
  const facts = syntheticFacts();
  const surgeries = [
    [DECISION_LABEL, 'missing-decision', (text) => text.replace(new RegExp(`- ${DECISION_LABEL}: [^\\n]*`), `- ${DECISION_LABEL}:`)],
    [GROUND_LABEL, 'missing-ground', (text) => text.replace(new RegExp(`- ${GROUND_LABEL}: [^\\n]*`), `- ${GROUND_LABEL}:`)],
    [OVERRIDE_LABEL, 'missing-override', (text) => text.replace(new RegExp(`- ${OVERRIDE_LABEL}:\\n[^\\n]*`), `- ${OVERRIDE_LABEL}:`)],
  ];

  for (const [label, kind, gut] of surgeries) {
    const verdict = verifyExplanation({ facts, explainText: gut(authored(facts)) });

    assert.equal(verdict.ok, false, `${label} must be filled`);
    assert.ok(
      verdict.faults.some((fault) => fault.kind === kind && fault.section === 'E6'),
      `${kind} is reported against E6`,
    );
  }
});

test('C005 postcondition: a ground that names no manifest record is refused as untraceable', () => {
  const facts = syntheticFacts();
  const untraceable = authored(facts).replace(new RegExp(`- ${GROUND_LABEL}: [^\\n]*`), `- ${GROUND_LABEL}: たぶんそう決まっているはず`);
  const verdict = verifyExplanation({ facts, explainText: untraceable });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.faults.some((fault) => fault.kind === 'unresolvable-ground' && fault.section === 'E6'));
});

test('C007 postcondition: the verdict states how many questions were answered and how much was decided for the human', () => {
  const facts = syntheticFacts();
  const verdict = verifyExplanation({ facts, explainText: authored(facts) });

  assert.equal(verdict.askedOfHuman, 1, 'the fixture asks the human one direction question');
  assert.ok(verdict.decidedForHuman > 0, 'the settled contracts and obligations were decided for them');
});

test('C007 invariant: the gate accepts exactly the documents the counter calls complete', () => {
  const facts = syntheticFacts();
  const complete = authored(facts);
  const withMarker = rewriteSection(complete, FRAME_SECTIONS[2].title, (body) => `${MUST_FILL_MARKER} 書き忘れ\n${body}`);

  assert.equal(verifyExplanation({ facts, explainText: complete }).ok, true);
  assert.equal(verifyExplanation({ facts, explainText: withMarker }).ok, false);
});

// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
test('C003 postcondition: a neighbour\'s decision satisfies the gate, and the human is asked one question fewer', () => {
  const facts = syntheticFacts({ projection: syntheticProjection({ settledElsewhere: SETTLED_ELSEWHERE }) });
  const verdict = verifyExplanation({ facts, explainText: authored(facts) });

  assert.deepEqual(verdict.faults, []);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.askedOfHuman, 1, 'the settled boundary is not asked, so one question still carries the rest');
  assert.equal(verdict.decidedForHuman > 0, true, 'and the neighbour\'s decision is recorded among the pre-decisions');
});

test('C003 invariant: an item the manifests no longer record as open is refused as a delegation', () => {
  const facts = syntheticFacts({ projection: syntheticProjection({ settledElsewhere: SETTLED_ELSEWHERE }) });
  const askedAnyway = authorDocument({
    facts,
    questions: [{ number: 1, bound: ['residual-000001', 'boundary-001'] }],
  });
  const verdict = verifyExplanation({ facts, explainText: askedAnyway });

  assert.equal(verdict.ok, false);
  assert.ok(
    verdict.faults.some((fault) => fault.kind === 'unrecorded-decision' && fault.id === 'boundary-001'),
    'the boundary is settled elsewhere, so binding it here is a point the manifests no longer record as open',
  );
});

/** One thing taken out of an authored document, and the fault taking it out must produce. */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
const OMISSIONS = [
  ['too-few-options', (text) => text.replace(/^ {2}B: .*$/m, '')],
  ['missing-recommendation', (text) => text.replace(new RegExp(`- ${RECOMMENDATION_LABEL}:\\n[^\\n]*`), `- ${RECOMMENDATION_LABEL}:`)],
  [
    'missing-recommendation-reason',
    (text) => text.replace(new RegExp(`- ${RECOMMENDATION_REASON_LABEL}:\\n[^\\n]*`), `- ${RECOMMENDATION_REASON_LABEL}:`),
  ],
  [
    'missing-recommendation-override',
    (text) => text.replace(new RegExp(`- ${RECOMMENDATION_OVERRIDE_LABEL}:\\n[^\\n]*`), `- ${RECOMMENDATION_OVERRIDE_LABEL}:`),
  ],
];

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C002 postcondition: each omission from a question is refused, naming the section and the question', () => {
  const facts = syntheticFacts();
  const complete = authored(facts);
  const question = firstAskedQuestion(complete);

  assert.equal(verifyExplanation({ facts, explainText: complete }).ok, true, 'the document without surgery is accepted');
  for (const [kind, omit] of OMISSIONS) {
    const verdict = verifyExplanation({ facts, explainText: omit(complete) });
    assert.equal(verdict.ok, false, `${kind} must be refused`);
    assert.ok(
      verdict.faults.some((fault) => fault.kind === kind && fault.section === HUMAN_SECTION_ID && fault.id === question),
      `${kind} names the section and the question it is about`,
    );
  }
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C002 invariant: the directions a document offers are its own, so a third is judged against itself', () => {
  const facts = syntheticFacts();
  const complete = authored(facts);

  const threeDirections = complete
    .replace(/^ {2}B: .*$/m, (line) => `${line}\n  C: 却下は記録だけして呼び出し側へ返す。`)
    .replace(new RegExp(`(- ${RECOMMENDATION_LABEL}:\\n)[^\\n]*`), '$1C');
  assert.equal(
    verifyExplanation({ facts, explainText: threeDirections }).ok,
    true,
    'a recommendation naming the third direction is a recommendation, so the letters are read rather than assumed',
  );

  const unknownLetter = complete.replace(new RegExp(`(- ${RECOMMENDATION_LABEL}:\\n)[^\\n]*`), '$1D');
  assert.deepEqual(
    faultKinds(verifyExplanation({ facts, explainText: unknownLetter })),
    ['missing-recommendation'],
    'a letter no direction uses points at nothing the human can choose',
  );
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C002 boundary: either colon opens a direction, so a full-width one is not a silent omission', () => {
  const facts = syntheticFacts();
  const withFullWidthColon = authored(facts).replace(/^ {2}A: /m, '  A： ');

  assert.equal(verifyExplanation({ facts, explainText: withFullWidthColon }).ok, true);
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C002 invariant: the four omissions are reported independently', () => {
  const facts = syntheticFacts();
  const complete = authored(facts);
  const missingAllFour = OMISSIONS.reduce((text, [, omit]) => omit(text), complete);

  assert.deepEqual(
    [...new Set(faultKinds(verifyExplanation({ facts, explainText: missingAllFour })))].sort(),
    ['missing-recommendation', 'missing-recommendation-override', 'missing-recommendation-reason', 'too-few-options'],
    'a document missing all four reports all four',
  );
  assert.deepEqual(
    faultKinds(verifyExplanation({ facts, explainText: OMISSIONS[0][1](complete) })),
    ['too-few-options'],
    'and repairing the other three leaves this one alone',
  );
});

// [::TICKET::] PX-226, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-226|PX-229) --for-spec --no-implementation-order`.
test('C002 invariant: a package that asks the human nothing carries none of the per-question omissions', () => {
  const facts = syntheticFacts({ projection: syntheticProjection({ grill: { questions: [], risky_boundaries: [] } }) });
  const verdict = verifyExplanation({ facts, explainText: authorDocument({ facts, questions: [] }) });

  assert.equal(verdict.askedOfHuman, 0, 'the fixture asks nothing, so an empty section is what is being judged');
  assert.deepEqual(verdict.faults, [], 'the per-question rules are per question, and no question is not an omission');
});

/** The command document, which is where the standard the gate cannot measure is stated. */
const COMMAND_FILE = fileURLToPath(new URL('../../../.claude/commands/explain-seed.md', import.meta.url));

/** One numbered item of the command file's flow, up to the next item. */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
function flowItem(commandFile, number) {
  const flowStart = commandFile.indexOf('\n## Flow');
  assert.notEqual(flowStart, -1, 'the command file has a flow to read');
  const flow = commandFile.slice(flowStart);
  const itemStart = flow.search(new RegExp(`^${number}\\. \\*\\*`, 'm'));
  assert.notEqual(itemStart, -1, `the flow has an item ${number}`);
  const item = flow.slice(itemStart);
  const end = item.search(new RegExp(`\\n${number + 1}\\. \\*\\*`));
  return end < 0 ? item : item.slice(0, end);
}

/** The `## ` section carrying a given block — found by the block, not by the section's own name. */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
function sectionAround(commandFile, token) {
  const at = commandFile.indexOf(token);
  assert.notEqual(at, -1, `the command file carries ${token}`);
  const section = commandFile.slice(commandFile.lastIndexOf('\n## ', at) + 1);
  const end = section.search(/\n## /);
  return end < 0 ? section : section.slice(0, end);
}

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C005 postcondition: the command document carries the asking step and the gate that ends it', () => {
  const commandFile = readFileSync(COMMAND_FILE, 'utf8');
  const askingStep = flowItem(commandFile, 4);

  assert.match(askingStep, /answers/, 'the asking step ends at the operation that decides it');
  assert.match(askingStep, /人間の判断/, 'and says where the answer is written');
  assert.match(sectionAround(commandFile, 'G5'), /answers/, 'the gate the step ends at is the fourth operation');
  assert.match(sectionAround(commandFile, 'G5'), /G4/, 'and only an explanation the earlier gate accepted may be put to the human');
  assert.match(sectionAround(commandFile, '### Kind'), /K7/, 'the Kind table states the standard the new prose is held to');
  assert.match(sectionAround(commandFile, '### Unfit'), /U9/, 'and so does the Unfit table');
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C005 invariant: the questions are put before anything is reported, not after', () => {
  const commandFile = readFileSync(COMMAND_FILE, 'utf8');
  const askingStep = flowItem(commandFile, 4);
  const reportStep = flowItem(commandFile, 5);

  assert.match(askingStep, /answers/, 'the step before the report is the one that ends at G5');
  assert.match(reportStep, /report/i, 'and the report follows it');
  assert.doesNotMatch(
    askingStep,
    /grill points/,
    'the report is not the step that asks: a report written before the questions are put describes a document nobody has answered yet',
  );
});

// [::TICKET::] PX-226, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-226|PX-229) --for-spec --no-implementation-order`.
test('C005 postcondition: the rules a question must satisfy are stated, and reach the instruction that builds it', () => {
  const commandFile = readFileSync(COMMAND_FILE, 'utf8');
  const rules = sectionAround(commandFile, '### The question');

  assert.match(rules, /high-school/i, 'the plainness criterion is a rule, not a matter of taste');
  assert.match(rules, /implementation/i, 'and says what the person answering does not know');
  assert.match(rules, /design/i, 'including the design: a question that needs the whole picture recalled is not one a person can answer');
  assert.match(rules, /direction/i, 'and what the question must be about instead of a technical choice');
  assert.match(rules, /script/i, 'and names the parts that are the script\'s job rather than the AI\'s');
});

// [::TICKET::] PX-226, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-226|PX-229) --for-spec --no-implementation-order`.
test('C005 invariant: adding the asking step leaves the criterion where the AI meets it', () => {
  const commandFile = readFileSync(COMMAND_FILE, 'utf8');

  assert.match(
    flowItem(commandFile, 2),
    /Can ground \+ decision \+ override condition be written now/,
    'the writing step still classifies a question as it writes it, by whether it can be grounded now',
  );
  assert.match(flowItem(commandFile, 3), /apply Criteria/, 'and the gate step still sends the AI back to the criterion');
  assert.doesNotMatch(commandFile, /\b(you|your|yours|yourself)\b/i, 'the two agents are named, never addressed');
  assert.doesNotMatch(commandFile, /\b(?:the|a) reader\b/i, 'and neither is called the reader');
});

/** An authored document whose first question offers exactly `count` directions, lettered from A. */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
function withDirections(documentText, count) {
  const letters = 'ABCDEFGH'.slice(0, count).split('');
  const block = letters.map((letter) => `  ${letter}: 却下は${letter}の形で返す。`).join('\n');
  return documentText.replace(new RegExp(`(- ${OPTIONS_LABEL}:\\n)(?: {2}[A-Z]: [^\\n]*\\n?)+`), `$1${block}\n`);
}

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C002 invariant: two directions written under one letter are one choice, not two', () => {
  const facts = syntheticFacts();
  const complete = authored(facts);
  const question = firstAskedQuestion(complete);
  const oneLetterTwice = complete.replace(/^ {2}B: /m, '  A: ');
  const verdict = verifyExplanation({ facts, explainText: oneLetterTwice });

  assert.equal(verdict.ok, false, 'a question whose two lines carry one letter offers one direction, not two');
  assert.ok(
    verdict.faults.some((fault) => fault.kind === 'too-few-options' && fault.id === question),
    'and the fault says the question is short of directions',
  );
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C002 boundary: the declared minimum is the number of directions a question must offer', () => {
  const facts = syntheticFacts();
  const complete = authored(facts);

  assert.equal(
    verifyExplanation({ facts, explainText: withDirections(complete, MIN_OPTION_COUNT) }).ok,
    true,
    'a question offering exactly the declared minimum is a question a person can answer',
  );
  assert.equal(
    verifyExplanation({ facts, explainText: withDirections(complete, MIN_OPTION_COUNT - 1) }).ok,
    false,
    'and one short of it is not',
  );
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C005 invariant: every table in the criteria section has as many cells per row as its header', () => {
  const commandFile = readFileSync(COMMAND_FILE, 'utf8');
  const lines = sectionAround(commandFile, '### The question').split('\n');
  const tables = [];
  let current = [];
  for (const line of lines) {
    if (line.startsWith('|')) {
      current.push(line);
      continue;
    }
    if (current.length > 0) tables.push(current);
    current = [];
  }
  if (current.length > 0) tables.push(current);

  assert.ok(tables.length >= 3, 'the criteria section carries a table per rule family');
  for (const table of tables) {
    const headerWidth = table[0].split('|').length;
    for (const row of table) {
      assert.equal(
        row.split('|').length,
        headerWidth,
        `a row carries as many cells as its header, or the row states a rule in a column the table does not have: ${row}`,
      );
    }
  }
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C005 postcondition: the asking step states what may be asked and how it is answered', () => {
  const commandFile = readFileSync(COMMAND_FILE, 'utf8');
  const askingStep = flowItem(commandFile, 4);
  const rules = sectionAround(commandFile, '### The question');

  assert.match(askingStep, /Q<n>: /, 'the step puts each question under the number the frame wrote');
  assert.match(askingStep, /`A` `B`/, 'the directions are put as letters');
  assert.match(askingStep, /prose/i, 'and the answer is a letter with prose only as an addition');
  assert.match(askingStep, /W1–W12/, 'and holds each question to the standard, one by one');
  assert.match(rules, /never technical/, 'the standard says a technical question is not put to the human, and where the technical part is settled instead');
  assert.match(rules, /W7/, 'the number is a rule, not a habit');
  assert.match(rules, /W8/, 'and so is the letter the answer names');
});
