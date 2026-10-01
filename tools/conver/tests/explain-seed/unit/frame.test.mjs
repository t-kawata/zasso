// PX-222 @verifies C003
// PX-222 @verifies C005
// PX-222 @verifies C006
// PX-224 @verifies C002
// PX-225 @verifies C003
// PX-225 @verifies C004
// PX-225 @verifies C006
// PX-226 @verifies C001
// PX-229 @verifies C007
// PX-230 @verifies C002
//
// The frame is the script's half of the explanation: the structure, the instructions, the
// placeholders and the count. The AI's half is the prose that replaces the markers, so the
// frame has to be readable and answerable before a single word of it is written.
//
// Since PX-229 the frame holds no per-point question: the human's section is maintained, and
// `next` appends the numbered question blocks. A frame with questions is therefore one a round
// has been appended to, and the tests that judge a question build it that way.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ABSENT_RESIDUALS_STATEMENT,
  CONTEXT_LABEL,
  FRAME_SECTIONS,
  GROUND_LABEL,
  HUMAN_ITEM_HEADING,
  HUMAN_SECTION_ID,
  OPTIONS_LABEL,
  OVERRIDE_LABEL,
  PARTY_LABEL,
  PREDECIDED_ITEM_HEADING,
  RECORD_REFERENCE_NOTICE,
  RECOMMENDATION_LABEL,
  RECOMMENDATION_OVERRIDE_LABEL,
  RECOMMENDATION_REASON_LABEL,
  SCOPE_LABEL,
  SHAPE_LABELS_THIS_FRAME_WRITES,
  COUNT_LABEL,
  appendQuestionRound,
  buildFrame,
  countHumanDecisionItems,
  locateSections,
  mentionsId,
  readQuestionNumbers,
  verifyExplanation,
} from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import {
  ADDED_POINT_CLOSE,
  ADDED_POINT_ID_PREFIX,
  ADDED_POINT_OPEN,
  ADDED_POINT_ORIGIN_LABEL,
  ADDED_POINT_STATEMENT_LABEL,
  RESERVED_POINT_ID,
  readAddedPoints,
  renderAddedPointBlock,
} from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import {
  HUMAN_PLACEHOLDER,
  MUST_FILL_MARKER,
  findHumanPlaceholders,
  findOpenMarkers,
  isPlaceholderLine,
  markerOffsetInLine,
} from '../../../.claude/scripts/explain-seed/lib/markers.mjs';
import { splitItems } from '../../../.claude/scripts/explain-seed/lib/items.mjs';
import { appendAddedPoint, authorExplanation } from '../helpers/fill-frame.mjs';
import {
  ABSENT_SETTLEMENTS_STATEMENT,
  INFO_SECTION_TITLES,
  MAX_DOCUMENT_CHARS,
  MAX_LISTED_ITEMS,
  MAX_QUOTED_DECISION_CHARS,
  renderInfo,
} from '../../../.claude/scripts/explain-seed/lib/render.mjs';
import { SETTLED_ELSEWHERE, syntheticFacts, syntheticOpenIds, syntheticProjection } from '../helpers/synthetic-facts.mjs';

const E5_TITLE = FRAME_SECTIONS[4].title;
const E6_TITLE = FRAME_SECTIONS[5].title;

/** The body under one section heading, up to the next heading of the same level. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function sectionBody(documentText, title) {
  const start = documentText.indexOf(`## ${title}`);
  assert.notEqual(start, -1, `the frame carries the section ${title}`);
  const rest = documentText.slice(start + title.length + 3);
  const end = rest.search(/\n## /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** How many items a section holds, counted from the heading that opens each one. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function itemsUnder(documentText, title, heading) {
  return sectionBody(documentText, title)
    .split('\n')
    .filter((line) => line.startsWith(heading)).length;
}

/** A frame holding a round of questions, which is the shape every question test judges. */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
function questionFrame({ facts = syntheticFacts(), size = 1 } = {}) {
  return appendQuestionRound({ documentText: buildFrame({ facts, previous: null }).text, size });
}

/** An authored explanation whose one question binds every recorded point. */
// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
function authored(facts = syntheticFacts()) {
  return authorExplanation({ facts, boundIds: syntheticOpenIds(facts.projection) });
}

/** The first question of the human's section, heading included. */
// [::TICKET::] PX-226, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-226|PX-229) --for-spec --no-implementation-order`.
function firstHumanItem(frameText) {
  const start = frameText.indexOf(HUMAN_ITEM_HEADING);
  assert.notEqual(start, -1, 'the fixture asks the human at least one question');
  const rest = frameText.slice(start);
  const end = rest.indexOf(`\n${HUMAN_ITEM_HEADING}`, 1);
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * The same document with a person's answer written under the first place a person writes.
 *
 * The answer goes under a placeholder *line*: the document's own header explains what the
 * placeholder is for, and an answer written into that sentence is an answer to nothing.
 */
// [::TICKET::] PX-226, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-226|PX-229) --for-spec --no-implementation-order`.
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

/** The labels whose blocks the frame that asked for directions added, in one list for both surgeries below. */
// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
const DIRECTION_LABELS = [OPTIONS_LABEL, RECOMMENDATION_LABEL, RECOMMENDATION_REASON_LABEL, RECOMMENDATION_OVERRIDE_LABEL];

/**
 * The same document with the blocks under the given labels taken out of every item.
 *
 * A block is the label's own line and the indented lines under it — the same extent
 * `labelledLines` reads — so a document stripped here is one where the gate finds the label
 * absent rather than emptied, which is what a document written by an earlier frame looks like.
 */
// [::TICKET::] PX-226, PX-227, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-226|PX-227|PX-229) --for-spec --no-implementation-order`.
function withoutLabelBlocks(documentText, labels) {
  const kept = [];
  let skipping = false;
  for (const line of documentText.split('\n')) {
    if (labels.some((label) => line.startsWith(`- ${label}:`))) {
      skipping = true;
      continue;
    }
    if (skipping && /^\s+\S/.test(line)) continue;
    skipping = false;
    kept.push(line);
  }
  return kept.join('\n');
}

test('C003 precondition: the frame is built from the current facts and one seed path', () => {
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });

  assert.ok(frame.text.length > 0);
  assert.deepEqual(frame.keptSections, [], 'nothing pre-exists, so nothing is kept');
  assert.deepEqual(frame.reopenedSections, FRAME_SECTIONS.map((section) => section.id));
  assert.deepEqual(frame.faults, []);
});

test('C003 postcondition: the seven sections appear in the declared order', () => {
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });
  const positions = FRAME_SECTIONS.map((section) => frame.text.indexOf(`## ${section.title}`));

  assert.ok(positions.every((position) => position >= 0), 'every heading is present');
  assert.deepEqual([...positions].sort((left, right) => left - right), positions, 'in the constant order');
});

test('C003 postcondition: every explanation point is a whole-line marker carrying an instruction', () => {
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });
  const markers = findOpenMarkers(frame.text);

  assert.ok(markers.length > 0, 'a fresh frame has instructions to answer');
  for (const marker of markers) {
    assert.ok(
      marker.text.length > MUST_FILL_MARKER.length,
      `the marker on line ${marker.line} says what to write`,
    );
  }
});

test('C003 postcondition: every question carries exactly one placeholder', () => {
  const frame = questionFrame({ size: 2 });
  const bodies = sectionBody(frame, E5_TITLE).split(`\n${HUMAN_ITEM_HEADING} `).slice(1);

  assert.equal(bodies.length, 2, 'the frame carries the round it was given');
  for (const body of bodies) {
    const item = `${HUMAN_ITEM_HEADING} ${body}`;
    assert.equal(findHumanPlaceholders(item).length, 1, 'exactly one place for the human to write');
  }
});

test('C003 invariant: the frame names the seed it was built from and the facts it rests on', () => {
  const facts = syntheticFacts();
  const frame = buildFrame({ facts, previous: null });

  assert.ok(frame.text.includes(facts.seedPath));
  assert.deepEqual(
    frame.sectionDigests.map((entry) => entry.id),
    FRAME_SECTIONS.map((section) => section.id),
  );
  assert.equal(new Set(frame.sectionDigests.map((entry) => entry.digest)).size, FRAME_SECTIONS.length);
});

test('C006 postcondition: every recorded open id is bound in the human section, and none is pre-decided', () => {
  const facts = syntheticFacts();
  const authoredText = authored(facts);
  const decisions = sectionBody(authoredText, E5_TITLE);
  const preDecided = sectionBody(authoredText, E6_TITLE);
  const openIds = syntheticOpenIds(facts.projection);

  assert.equal(openIds.length, 2, 'the fixture records two open items');
  for (const id of openIds) {
    assert.ok(mentionsId(decisions, id), `${id} is bound by the question asked of the human`);
    assert.equal(mentionsId(preDecided, id), false, `${id} is not decided for them`);
  }
});

test('C006 postcondition: the frame holds no per-point question, and the introduction asks for the count', () => {
  const facts = syntheticFacts();
  const frame = buildFrame({ facts, previous: null });

  assert.equal(frame.humanDecisionItems.length, 0, 'the frame itself asks the human nothing until next appends a round');
  assert.match(
    frame.text,
    new RegExp(`${MUST_FILL_MARKER.replace(/[[\]]/g, '\\$&')}[^\\n]*${COUNT_LABEL}`),
    'the introduction asks for the count instead of stating it',
  );

  const authoredText = authored(facts);
  assert.equal(itemsUnder(authoredText, E5_TITLE, HUMAN_ITEM_HEADING), 1, 'the fixture binds both points from one direction question');
  assert.equal(countHumanDecisionItems(authoredText), 1, 'and the declared count follows the number of questions, not the number of points');
});

test('C005 postcondition: a question the facts settle is pre-decided with a decision, a ground and an override condition', () => {
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });
  const items = sectionBody(frame.text, E6_TITLE).split(`\n${PREDECIDED_ITEM_HEADING} `).slice(1);

  assert.ok(items.length > 0, 'the settled contracts, forbidden edges and obligations are listed');
  for (const body of items) {
    assert.ok(body.includes(GROUND_LABEL), `an item states its ${GROUND_LABEL}`);
    assert.ok(body.includes(OVERRIDE_LABEL), `an item states its ${OVERRIDE_LABEL}`);
  }
  assert.match(frame.text, /contract_registry/, 'a ground names the manifest field it came from');
});

test('C005 postcondition: every question asks whose experience changes, once per question', () => {
  const frame = questionFrame({ size: 2 });
  const partyLines = sectionBody(frame, E5_TITLE).split('\n').filter((line) => line.trimStart().startsWith(`- ${PARTY_LABEL}:`));

  assert.equal(partyLines.length, 2, 'one party line per question, and no more');
});

test('C001 invariant: the record material and the bound points stand in the AI-only region, below the notice', () => {
  const item = firstHumanItem(questionFrame());
  const noticeAt = item.indexOf(`- ${RECORD_REFERENCE_NOTICE}`);
  const boundAt = item.indexOf('- 束ねた論点:');
  const scopeAt = item.indexOf(`- ${SCOPE_LABEL}`);

  assert.ok(noticeAt >= 0, 'the frame speaks its own line telling the person what follows need not be read');
  assert.ok(boundAt > noticeAt, 'the points the question settles stand below it');
  assert.ok(scopeAt > noticeAt, 'and so does the scope line the person is not shown');
  assert.ok(
    item.includes('記録の写し'),
    'the question leaves a place for the AI to copy the record, which the frame itself no longer renders',
  );
});

test('C006 postcondition: a package that owns no open item says so in full rather than leaving the section empty', () => {
  const facts = syntheticFacts({
    projection: syntheticProjection({ grill: { questions: [], risky_boundaries: [] } }),
  });
  const frame = buildFrame({ facts, previous: null });
  const decisions = sectionBody(frame.text, E5_TITLE);

  assert.equal(frame.humanDecisionItems.length, 0);
  assert.ok(decisions.trim().length > 0, 'the section is not empty');
  assert.match(decisions, /登録されていません/, 'and it states the absence in full');
});

test('C002 postcondition: the position section asks for the serial and parallel axes separately', () => {
// [::TICKET::] PX-224 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-224 --for-spec --no-implementation-order`.
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });
  const position = sectionBody(frame.text, FRAME_SECTIONS[1].title);

  assert.match(position, /直列/, 'the instruction names the serial axis');
  assert.match(position, /並列/, 'and the parallel axis');
  assert.match(position, /宣言された辺/, 'and says the declared edge is what binds');
  assert.match(position, /段が違っても直列ではない/, 'and forbids reading a level difference as an order');
  assert.match(position, /段の規則/, 'and gives the level rule as the ground for parallel');
});

test('C002 postcondition: the position section carries the shape of the whole, not only this package', () => {
  const facts = syntheticFacts({
    projection: syntheticProjection({
      position: {
        wave: 1,
        serial_index: 1,
        level: 2,
        order: {
          level: 1,
          ordinal: 2,
          onCriticalPath: true,
          waitsFor: ['pkg-0002'],
          usedBy: [],
          parallelInLevel: [],
          plan: { directories: 28, levels: 11, dependencies: 82, criticalChainLength: 11 },
        },
      },
    }),
  });

  const position = sectionBody(buildFrame({ facts, previous: null }).text, FRAME_SECTIONS[1].title);

  assert.match(position, /直列[^\n]*1/, 'the serial count is stated');
  assert.match(position, /段の下限|critical chain/, 'and how many stages the whole cannot go below');
});

test('C003 postcondition: the glossary glosses the terms the package meets and leaves the rest out', () => {
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });
  const glossary = sectionBody(frame.text, FRAME_SECTIONS[6].title);

  assert.ok(glossary.includes('禁止'), 'the term overlapping an owned quotation is glossed');
  assert.equal(glossary.includes('成熟度'), false, 'a term the package never meets is not');
});

test('C003 postcondition: a long glossary is trimmed with an explicit remainder', () => {
  const terms = Array.from({ length: 20 }, (_, index) => ({
    id: `req-1${String(index).padStart(5, '0')}`,
    canonical_name: `用語${index}`,
    classification: 'concept',
    keyword: `用語${index}`,
    context: '第一章の本文。',
    line_start: 7,
    line_end: 7,
    source_refs: [{ line_start: 7, line_end: 7 }],
  }));
  const frame = buildFrame({ facts: syntheticFacts({ terms }), previous: null });

  assert.match(sectionBody(frame.text, FRAME_SECTIONS[6].title), /…ほか \d+ 件/, 'the remainder is counted');
});

/** The facts document for one projection, rendered the way `run.mjs` renders it. */
// [::TICKET::] PX-225 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-225 --for-spec --no-implementation-order`.
function renderFactsFor(projection) {
  const facts = syntheticFacts({ projection });
  return renderInfo({
    projection,
    workspace: facts.workspace,
    seedPath: facts.seedPath,
    verified: { specification: 'a'.repeat(64), stageOneManifest: 'b'.repeat(64), seed: 'c'.repeat(64) },
  });
}

test('C003 postcondition: a boundary a neighbour has decided is not asked of this human', () => {
  const facts = syntheticFacts({ projection: syntheticProjection({ settledElsewhere: SETTLED_ELSEWHERE }) });
  const authoredText = authorExplanation({ facts, boundIds: syntheticOpenIds(facts.projection) });
  const decisions = sectionBody(authoredText, E5_TITLE);

  assert.equal(syntheticOpenIds(facts.projection).length, 1, 'only the residual is still open here');
  assert.equal(mentionsId(decisions, 'boundary-001'), false, 'the boundary has left the human section');
  assert.equal(mentionsId(sectionBody(authoredText, E6_TITLE), 'boundary-001'), true, 'and stands in the pre-decided section instead');
});

test('C007 invariant: the questions that remain keep their order, and no run renumbers one', () => {
  const facts = syntheticFacts();
  const published = authored(facts);
  const merged = buildFrame({ facts, previous: published });

  assert.deepEqual(readQuestionNumbers(merged.text), readQuestionNumbers(published), 'the numbers are the ones the document already held');
  assert.deepEqual(merged.humanDecisionItems.map((item) => item.number), readQuestionNumbers(published));
});

test('C004 postcondition: the settled question is pre-decided, first, carrying its neighbour as the ground', () => {
  const frame = buildFrame({
    facts: syntheticFacts({ projection: syntheticProjection({ settledElsewhere: SETTLED_ELSEWHERE }) }),
    previous: null,
  });
  const preDecided = sectionBody(frame.text, E6_TITLE);
  const items = preDecided.split(`\n${PREDECIDED_ITEM_HEADING} `).slice(1);

  assert.match(items[0], /boundary-001/, 'it opens the list, so a capped list cannot drop it');
  assert.ok(items[0].includes(SETTLED_ELSEWHERE[0].decision), 'the decision is quoted from the neighbour');
  assert.match(items[0], /crates\/protocol\/beta\/EXPLAIN-RFC-SEED\.md/, 'and the ground names the document it came from');
});

test('C006 postcondition: the nine sections that existed before are not a function of the settlement', () => {
  const before = renderFactsFor(syntheticProjection({ settledElsewhere: [] }));
  const after = renderFactsFor(syntheticProjection({ settledElsewhere: SETTLED_ELSEWHERE }));

  for (const id of ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9']) {
    assert.equal(before.sections[id], after.sections[id], `${id} does not depend on what a neighbour decided`);
  }
  assert.notEqual(before.sections.I10, after.sections.I10, 'only the tenth section moves');
});

test('C004 postcondition: the tenth section states the boundary, the counterpart and the decision verbatim', () => {
  const { text, sections } = renderFactsFor(syntheticProjection({ settledElsewhere: SETTLED_ELSEWHERE }));

  assert.equal(sections.I10.startsWith(`## ${INFO_SECTION_TITLES.I10}`), true);
  assert.match(sections.I10, /boundary-001/);
  assert.match(sections.I10, /pkg-0002/);
  assert.match(sections.I10, /crates\/protocol\/beta\/EXPLAIN-RFC-SEED\.md/);
  assert.ok(sections.I10.includes(SETTLED_ELSEWHERE[0].decision), 'quoted, as the specification is quoted');
  assert.equal(text.trimEnd().endsWith(sections.I10.trimEnd()), true, 'and it is the last thing in the document');
});

test('C004 invariant: an empty settlement is stated in the facts document\'s own language, not omitted', () => {
  const { sections } = renderFactsFor(syntheticProjection({ settledElsewhere: [] }));

  assert.equal(sections.I10.includes(ABSENT_SETTLEMENTS_STATEMENT), true);
  assert.equal(/[぀-ヿ一-鿿]/.test(ABSENT_SETTLEMENTS_STATEMENT), false, 'the facts state an absence in English');
});

test('C004 invariant: a decision past the bound is quoted short, and what was dropped is stated', () => {
  const overlongDecision = 'A'.repeat(MAX_QUOTED_DECISION_CHARS + 250);
  const { sections } = renderFactsFor(
    syntheticProjection({ settledElsewhere: [{ ...SETTLED_ELSEWHERE[0], decision: overlongDecision }] }),
  );

  assert.equal(sections.I10.includes(overlongDecision), false, 'the document does not carry a decision past its bound whole');
  assert.match(sections.I10, /…\(\d+ more characters omitted\)/, 'and the omission is stated in full, as every other quotation states it');
  assert.ok(
    MAX_QUOTED_DECISION_CHARS * MAX_LISTED_ITEMS < MAX_DOCUMENT_CHARS / 4,
    'the bound on one decision keeps the whole section within a quarter of the document bound',
  );
});

test('C004 invariant: with facts that are entirely ASCII, the tenth section carries no Japanese', () => {
  const asciiProjection = JSON.parse(JSON.stringify(syntheticProjection({ settledElsewhere: SETTLED_ELSEWHERE })));
  asciiProjection.settledElsewhere.forEach((record) => {
    record.decision = 'refuse with a coded error';
  });
  const { sections } = renderFactsFor(asciiProjection);

  assert.deepEqual(
    sections.I10.split('\n').filter((line) => /[぀-ヿ一-鿿]/.test(line)),
    [],
    'every Japanese line would be Japanese the tool wrote itself',
  );
});

// [::TICKET::] PX-226, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-226|PX-229) --for-spec --no-implementation-order`.
test('C001 postcondition: every question offers directions and a recommendation, in the order a person reads them', () => {
  const item = firstHumanItem(questionFrame());
  const positions = [OPTIONS_LABEL, RECOMMENDATION_LABEL, RECOMMENDATION_REASON_LABEL, RECOMMENDATION_OVERRIDE_LABEL].map(
    (label) => item.indexOf(`- ${label}:`),
  );

  assert.ok(positions.every((position) => position >= 0), 'each of the four labels is in the item');
  assert.deepEqual([...positions].sort((left, right) => left - right), positions, 'in the declared order');
  assert.ok(item.indexOf(`- ${OPTIONS_LABEL}:`) > item.indexOf('何を決めるのか'), 'the directions follow the question itself');
  assert.ok(
    item.indexOf(`- ${PARTY_LABEL}:`) > item.indexOf(`- ${RECOMMENDATION_OVERRIDE_LABEL}:`),
    'and the stakes follow the recommendation, because the stakes are why the question is asked at all',
  );
  for (const label of [OPTIONS_LABEL, RECOMMENDATION_LABEL, RECOMMENDATION_REASON_LABEL, RECOMMENDATION_OVERRIDE_LABEL]) {
    assert.equal(item.split(`- ${label}:`).length - 1, 1, `${label} appears once per item`);
  }
});

// [::TICKET::] PX-226, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-226|PX-229) --for-spec --no-implementation-order`.
test('C001 postcondition: the new instructions are whole-line markers the counter can see', () => {
  const item = firstHumanItem(questionFrame());
  // Keyed on the instructions' own openings rather than on any mention of 推奨: the context
  // instruction names the reason it has to make readable, and a filter that counted that
  // mention would report six instructions where the block writes five.
  const added = findOpenMarkers(item).filter((marker) =>
    ['案A — ', '案B — ', '推奨 — ', '推奨の理由 — ', '推奨が覆る条件 — '].some((opening) => marker.text.includes(opening)),
  );

  assert.equal(added.length, 5, 'two directions, one recommendation, its reason and the condition that would overturn it');
  for (const marker of added) {
    assert.ok(marker.offset >= 0, `the instruction on line ${marker.line} is a line-first token`);
  }
});

// [::TICKET::] PX-226 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-226 --for-spec --no-implementation-order`.
test('C001 invariant: an instruction behind a label is not an instruction, which is why every new one opens its own line', () => {
  assert.equal(
    markerOffsetInLine(`- ${RECOMMENDATION_LABEL}: ${MUST_FILL_MARKER} 記号を1つだけ`),
    -1,
    'behind a label the marker is a sentence that mentions one, and the gate would neither see it nor be able to trust it',
  );
  assert.ok(
    markerOffsetInLine(`  ${MUST_FILL_MARKER} 案A — その案で何が起きるか`) >= 0,
    'indented on its own line the same marker is an instruction',
  );
});

// [::TICKET::] PX-226, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-226|PX-229) --for-spec --no-implementation-order`.
test('C001 invariant: the directions add no second place for the human to write', () => {
  const item = firstHumanItem(questionFrame());

  assert.equal(findHumanPlaceholders(item).length, 1, 'one place to write, however many directions the item offers');
  assert.ok(
    item.indexOf(`- ${OPTIONS_LABEL}:`) < item.indexOf(HUMAN_PLACEHOLDER),
    'the directions stand above the place the person answers in',
  );
});

// [::TICKET::] PX-226, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-226|PX-229) --for-spec --no-implementation-order`.
test('C001 invariant: a human section written before this command asked for directions is reset rather than kept', () => {
  const facts = syntheticFacts();
  const legacy = withoutLabelBlocks(authored(facts), DIRECTION_LABELS);
  const merged = buildFrame({ facts, previous: legacy });

  assert.ok(merged.reopenedSections.includes(HUMAN_SECTION_ID), 'the digest still matches, so only the shape of the earlier question can tell the two apart');
  assert.deepEqual(
    merged.keptSections,
    FRAME_SECTIONS.map((section) => section.id).filter((id) => id !== HUMAN_SECTION_ID),
    'and no other section is disturbed by it',
  );
  assert.ok(
    locateSections(merged.text).bodies[HUMAN_SECTION_ID].includes(ABSENT_RESIDUALS_STATEMENT),
    'a question in the old shape cannot be re-anchored, so the section is reset rather than kept half-read',
  );
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C007 error case: a reset reports the notes it could not carry, naming their anchors', () => {
  const facts = syntheticFacts();
  const note = '人間の判断: 現場では拒否のほうが自然だと考える。';
  const legacy = withNoteUnderFirstPlaceholder(withoutLabelBlocks(authored(facts), [OPTIONS_LABEL]), note);
  const merged = buildFrame({ facts, previous: legacy });

  assert.ok(
    merged.faults.some((fault) => fault.kind === 'unreadable-section' && fault.section === HUMAN_SECTION_ID),
    'the note the reset could not re-anchor is named rather than discarded in silence',
  );
  assert.ok(!merged.text.includes(note), 'and the reset does not pretend to have kept it');
});

// [::TICKET::] PX-227, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-227|PX-229) --for-spec --no-implementation-order`.
test('C001 postcondition: every question opens with its own context, above every line of the record', () => {
  const item = firstHumanItem(questionFrame());
  const contextAt = item.indexOf(`- ${CONTEXT_LABEL}:`);
  const noticeAt = item.indexOf(RECORD_REFERENCE_NOTICE);
  const boundAt = item.indexOf('- 束ねた論点:');

  assert.ok(contextAt >= 0, 'the question says what it is about before it says what is being decided');
  assert.ok(noticeAt > contextAt, 'the notice stands below the context it closes');
  assert.ok(boundAt > noticeAt, 'and above the material it marks as not required reading');
  assert.ok(noticeAt < item.indexOf('何を決めるのか'), 'so nothing written for the record stands above the part written for the person');
  assert.equal(item.split(`- ${CONTEXT_LABEL}:`).length - 1, 1, 'one context per question');
  assert.equal(item.split(RECORD_REFERENCE_NOTICE).length - 1, 1, 'and one notice per question');
});

// [::TICKET::] PX-227, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-227|PX-229) --for-spec --no-implementation-order`.
test('C001 invariant: the notice never stands over nothing', () => {
  const frame = questionFrame({ size: 2 });
  const items = splitItems(locateSections(frame).bodies[HUMAN_SECTION_ID], HUMAN_ITEM_HEADING);

  assert.ok(items.length > 0, 'the fixture asks at least one question');
  for (const item of items) {
    const lines = item.body.split('\n');
    const noticeAt = lines.findIndex((line) => line.trim() === `- ${RECORD_REFERENCE_NOTICE}`);
    const under = (lines[noticeAt + 1] ?? '').trim();

    assert.ok(noticeAt >= 0, `the frame speaks its own line in every question: ${item.heading}`);
    assert.ok(under.startsWith('- '), `and the line under it is the record it describes: ${item.heading}`);
    assert.ok(!under.includes(MUST_FILL_MARKER), `never the question itself, which the frame did not write and does not vouch for: ${item.heading}`);
  }
});

// [::TICKET::] PX-227, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-227|PX-229) --for-spec --no-implementation-order`.
test('C001 invariant: the notice closes the context, so the context value is the prose and not the line below it', () => {
  const facts = syntheticFacts();
  const authoredText = authored(facts);
  const lines = firstHumanItem(authoredText).split('\n');
  const labelAt = lines.findIndex((line) => line.startsWith(`- ${CONTEXT_LABEL}:`));
  const noticeAt = lines.findIndex((line) => line.trim() === `- ${RECORD_REFERENCE_NOTICE}`);

  assert.ok(labelAt >= 0 && noticeAt >= 0, 'the authored question carries both lines');
  assert.equal(noticeAt, labelAt + 2, 'the label, the prose written for it, then the notice that ends it');
  assert.notEqual(lines[labelAt + 1].trim(), '', 'so what the label reads is the prose, never the notice');
  assert.equal(
    verifyExplanation({ facts, explainText: authoredText }).ok,
    true,
    'and the document this frame authors is one the gate accepts',
  );
});

// [::TICKET::] PX-227, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-227|PX-229) --for-spec --no-implementation-order`.
test('C001 invariant: a human section written before this command carried the context is reset rather than kept', () => {
  const facts = syntheticFacts();
  const legacy = withoutLabelBlocks(authored(facts), [CONTEXT_LABEL]);
  const merged = buildFrame({ facts, previous: legacy });

  assert.ok(
    merged.reopenedSections.includes(HUMAN_SECTION_ID),
    'a question that says nothing about what it is about is not the shape this frame writes',
  );
  assert.deepEqual(
    merged.keptSections,
    FRAME_SECTIONS.map((section) => section.id).filter((id) => id !== HUMAN_SECTION_ID),
    'and no other section is disturbed by it',
  );
  assert.ok(locateSections(merged.text).bodies[HUMAN_SECTION_ID].includes(ABSENT_RESIDUALS_STATEMENT), 'the section is reset');
});

// [::TICKET::] PX-227, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-227|PX-229) --for-spec --no-implementation-order`.
test('C001 invariant: every label the merge requires is one this frame writes', () => {
  const facts = syntheticFacts();
  const authoredText = authored(facts);

  assert.ok(SHAPE_LABELS_THIS_FRAME_WRITES.length >= 2, 'the human section carries more than one part the frame must find');
  for (const label of SHAPE_LABELS_THIS_FRAME_WRITES) {
    const merged = buildFrame({ facts, previous: withoutLabelBlocks(authoredText, [label]) });
    assert.ok(
      merged.reopenedSections.includes(HUMAN_SECTION_ID),
      `a section without ${label} is reopened, so the render and the merge cannot drift apart`,
    );
  }
});

// [::TICKET::] PX-227, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-227|PX-229) --for-spec --no-implementation-order`.
test('C001 invariant: the person the question is written for is one formula, and the earlier one is gone', () => {
  const item = firstHumanItem(questionFrame());
  const writtenForThem = findOpenMarkers(item).filter((marker) => /何を決めるのか|案[AB] —|推奨の理由 —/.test(marker.text));

  assert.equal(writtenForThem.length, 4, 'the question, its two directions and the reason for the recommendation');
  for (const marker of writtenForThem) {
    assert.match(marker.text, /実装も設計も知らない/, `the instruction says who it is written for: ${marker.text}`);
  }
  assert.doesNotMatch(
    item,
    /実装を知らない/,
    'the earlier formula asked only that the implementation be unknown, which a person who does not know the design cannot answer under',
  );
});

// [::TICKET::] PX-226, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-226|PX-229) --for-spec --no-implementation-order`.
test('C001 postcondition: every question is numbered, and the number is the one it is asked under', () => {
  const facts = syntheticFacts();
  const frame = questionFrame({ facts, size: 3 });
  const headings = frame.split('\n').filter((line) => line.startsWith(HUMAN_ITEM_HEADING));

  assert.deepEqual(headings, [`${HUMAN_ITEM_HEADING} Q1`, `${HUMAN_ITEM_HEADING} Q2`, `${HUMAN_ITEM_HEADING} Q3`]);

  const again = buildFrame({ facts, previous: frame });
  assert.deepEqual(
    again.text.split('\n').filter((line) => line.startsWith(HUMAN_ITEM_HEADING)),
    headings,
    'and the number a question is asked under does not move between runs of the same facts',
  );
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C007 postcondition: the human section keeps its body byte for byte when its facts moved, and the run reports it reopened', () => {
  const facts = syntheticFacts();
  const published = appendQuestionRound({ documentText: buildFrame({ facts, previous: null }).text, size: 1 });
  const movedFacts = syntheticFacts({
    projection: facts.projection,
    infoSections: { ...facts.infoSections, I10: '## 10. What a neighbour has already settled\n\n- a neighbour settled something\n' },
  });
  const second = buildFrame({ facts: movedFacts, previous: published });

  assert.equal(
    locateSections(second.text).bodies[HUMAN_SECTION_ID],
    locateSections(published).bodies[HUMAN_SECTION_ID],
    'the body is carried through without a byte changing',
  );
  assert.ok(second.reopenedSections.includes(HUMAN_SECTION_ID), 'and the run reports it reopened so the AI re-judges it');
  assert.deepEqual(readQuestionNumbers(second.text), readQuestionNumbers(published), 'no question is renumbered');
});

// [::TICKET::] PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-229 --for-spec --no-implementation-order`.
test('C007 boundary: a human section whose headings carry a record reference is reset to the absent statement', () => {
  const facts = syntheticFacts();
  const legacy = [
    `## ${E5_TITLE}`,
    '',
    `${HUMAN_ITEM_HEADING} Q1 — residual-000001`,
    '',
    `- ${CONTEXT_LABEL}:`,
    '  これは古い形である。',
    '',
    HUMAN_PLACEHOLDER,
    '',
  ].join('\n');
  const rebuilt = buildFrame({ facts, previous: legacy });

  assert.ok(locateSections(rebuilt.text).bodies[HUMAN_SECTION_ID].includes(ABSENT_RESIDUALS_STATEMENT));
  assert.deepEqual(readQuestionNumbers(rebuilt.text), []);
});

/** The added point the human's answer raised, in the shape every case here uses. */
const ADDED_POINT = { id: 'added-001', origin: '「監査ログは残せない」', statement: '監査ログを残すかどうか' };

/** A published frame with one empty question round, before any block is appended. */
// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
function framedWithOneRound() {
  return appendQuestionRound({ documentText: buildFrame({ facts: syntheticFacts(), previous: null }).text, size: 1 });
}

// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
test('C002 normal: an added-point block is read with its id, its origin and its one-line statement', () => {
  const plain = framedWithOneRound();
  const documentText = appendAddedPoint(plain, ADDED_POINT);

  assert.deepEqual(readAddedPoints({ documentText }), [ADDED_POINT]);
  assert.deepEqual(readAddedPoints({ documentText: plain }), [], 'a document with no block reads as no added points');
});

// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
test('C002 normal: the writer and the reader are one format, so a written block round-trips', () => {
  const rendered = renderAddedPointBlock(ADDED_POINT);

  assert.equal(
    rendered,
    [
      `${ADDED_POINT_OPEN} id="added-001" -->`,
      `- ${ADDED_POINT_ORIGIN_LABEL}: 「監査ログは残せない」`,
      `- ${ADDED_POINT_STATEMENT_LABEL}: 監査ログを残すかどうか`,
      ADDED_POINT_CLOSE,
    ].join('\n'),
  );
  assert.deepEqual(readAddedPoints({ documentText: rendered }), [ADDED_POINT]);
});

// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
test('C002 boundary: the reserved id is the prefix followed by three digits and nothing else', () => {
  assert.equal(ADDED_POINT_ID_PREFIX, 'added-');
  assert.equal(RESERVED_POINT_ID.test('added-001'), true);
  assert.equal(RESERVED_POINT_ID.test('added-1'), false, 'one digit is not the shape');
  assert.equal(RESERVED_POINT_ID.test('added-0001'), false, 'four digits is not the shape');
  assert.equal(RESERVED_POINT_ID.test('residual-000001'), false, 'a recorded id is not reserved');
});

// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
test('C002 boundary: a line that mentions the added-point marker inside prose is not a block', () => {
  const plain = framedWithOneRound();
  const prose = plain.replace(
    '## ',
    'この節は <!-- explain-seed:added-point id="added-001" --> という形のブロックを持ちます。\n\n## ',
  );

  assert.deepEqual(readAddedPoints({ documentText: prose }), []);
});

// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
test('C002 normal: the blocks are read in document order, so a later round reads the round before it', () => {
  const first = appendAddedPoint(framedWithOneRound(), { id: 'added-002', origin: '「その2」', statement: '論点2' });
  const later = appendAddedPoint(first, { id: 'added-001', origin: '「その1」', statement: '論点1' });

  assert.deepEqual(readAddedPoints({ documentText: later }).map((point) => point.id), ['added-002', 'added-001']);
});

// [::TICKET::] PX-230 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-230 --for-spec --no-implementation-order`.
test('C002 boundary: a shape-carrying human section with an added-point block still reopens when its facts moved, carrying the block', () => {
  const facts = syntheticFacts();
  const previous = appendAddedPoint(authorExplanation({ facts, boundIds: syntheticOpenIds(facts.projection) }), ADDED_POINT);
  const movedFacts = syntheticFacts({
    projection: facts.projection,
    infoSections: { ...facts.infoSections, I9: '## 9. grill で詰めるべき点\n\n- residual-000001: 記録が更新された\n' },
  });
  const second = buildFrame({ facts: movedFacts, previous });

  assert.ok(second.reopenedSections.includes(HUMAN_SECTION_ID), 'a moved fact reopens the human section');
  assert.deepEqual(readAddedPoints({ documentText: second.text }), [ADDED_POINT], 'the added point is carried through');
});
