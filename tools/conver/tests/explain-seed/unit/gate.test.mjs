// PX-222 @verifies C005
// PX-222 @verifies C006
// PX-222 @verifies C007
// PX-225 @verifies C003
//
// The gate is the only thing standing between an unfinished explanation and the human who
// would act on it, so every rule it enforces is asserted twice: once as a document it must
// accept, and once as a document it must refuse while naming the section at fault.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COUNT_LABEL,
  FRAME_SECTIONS,
  GROUND_LABEL,
  HUMAN_ITEM_HEADING,
  OVERRIDE_LABEL,
  PARTY_LABEL,
  DECISION_LABEL,
  buildFrame,
  countHumanDecisionItems,
  verifyExplanation,
} from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import { MUST_FILL_MARKER, isPlaceholderLine } from '../../../.claude/scripts/explain-seed/lib/markers.mjs';
import { SETTLED_ELSEWHERE, syntheticFacts, syntheticOpenIds, syntheticProjection } from '../helpers/synthetic-facts.mjs';
import { fillEveryMarker } from '../helpers/fill-frame.mjs';

const E5_TITLE = FRAME_SECTIONS[4].title;
const E6_TITLE = FRAME_SECTIONS[5].title;

/** An authored EXPLAIN built from the given facts. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function authored(facts = syntheticFacts()) {
  return fillEveryMarker(buildFrame({ facts, previous: null }).text);
}

/** The fault kinds a verdict reports, for assertions that care about which rule fired. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function faultKinds(verdict) {
  return verdict.faults.map((fault) => fault.kind);
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

test('C006 invariant: an open item claimed by both sections is refused', () => {
  const facts = syntheticFacts();
  const duplicated = rewriteSection(authored(facts), E6_TITLE, (body) => `- 参考: residual-000001 はここでも触れておく。\n${body}`);
  const verdict = verifyExplanation({ facts, explainText: duplicated });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.faults.some((fault) => fault.kind === 'open-item-in-both-sections' && fault.id === 'residual-000001'));
});

test('C006 invariant: an open item may not be the ground of a pre-decision', () => {
  const facts = syntheticFacts();
  const misgrounded = authored(facts).replace(`${GROUND_LABEL}: contract_registry`, `${GROUND_LABEL}: residual-000001`);
  const verdict = verifyExplanation({ facts, explainText: misgrounded });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.faults.some((fault) => fault.kind === 'open-item-as-ground' && fault.id === 'residual-000001'));
});

test('C006 postcondition: a declared count that disagrees with the items is refused', () => {
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

test('C005 invariant: an item citing nothing the manifests recorded is refused as a delegation', () => {
  const facts = syntheticFacts();
  const invented = rewriteSection(
    authored(facts),
    E5_TITLE,
    (body) => `### ${HUMAN_ITEM_HEADING.slice(4)} X1 — エラーコードの命名\n\n決め方が分かりません。\n<!-- 判断内容を人間が書き込む -->\n\n${body}`,
  );
  const verdict = verifyExplanation({ facts, explainText: invented });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.faults.some((fault) => fault.kind === 'unrecorded-decision' && fault.section === 'E5'));
});

test('C007 postcondition: an item without its placeholder is refused by section', () => {
  const facts = syntheticFacts();
  const stripped = authored(facts)
    .split('\n')
    .filter((line) => !isPlaceholderLine(line) || line.includes('x'))
    .join('\n')
    .replace(/<!-- 判断内容を人間が書き込む -->\n/g, '');
  const verdict = verifyExplanation({ facts, explainText: stripped });

  assert.equal(verdict.ok, false);
  assert.ok(verdict.faults.some((fault) => fault.kind === 'missing-placeholder' && fault.section === 'E5'));
});

test('C007 postcondition: one item carrying two placeholders is refused by section', () => {
  const facts = syntheticFacts();
  const doubled = rewriteSection(
    authored(facts),
    E5_TITLE,
    (body) => body.replace(/<!-- 判断内容を人間が書き込む -->/, '<!-- 判断内容を人間が書き込む -->\n<!-- 判断内容を人間が書き込む -->'),
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

test('C007 postcondition: the verdict states how much was decided for the human and how much was left to them', () => {
  const facts = syntheticFacts();
  const verdict = verifyExplanation({ facts, explainText: authored(facts) });

  assert.equal(verdict.askedOfHuman, syntheticOpenIds().length, 'every recorded open item is asked of the human in this fixture');
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
  assert.equal(verdict.askedOfHuman, syntheticOpenIds(facts.projection).length, 'the settled boundary is not asked');
  assert.equal(verdict.decidedForHuman > 0, true, 'and the neighbour\'s decision is recorded among the pre-decisions');
});

test('C003 invariant: an item the manifests no longer record as open is refused as a delegation', () => {
  const facts = syntheticFacts({ projection: syntheticProjection({ settledElsewhere: SETTLED_ELSEWHERE }) });
  const bothAskedAndRecorded = rewriteSection(
    authored(facts),
    E5_TITLE,
    (body) =>
      `### ${HUMAN_ITEM_HEADING.slice(4)} H9 — boundary-001\n\n- ${PARTY_LABEL}:\n  面を作る開発者。\n<!-- 判断内容を人間が書き込む -->\n\n${body}`,
  );
  const verdict = verifyExplanation({ facts, explainText: bothAskedAndRecorded });

  assert.equal(verdict.ok, false);
  assert.ok(
    verdict.faults.some((fault) => fault.kind === 'unrecorded-decision' && fault.id === 'boundary-001'),
    'the boundary is settled elsewhere, so asking it here is a question the manifests no longer record',
  );
});
