// PX-222 @verifies C003
// PX-222 @verifies C005
// PX-222 @verifies C006
//
// The frame is the script's half of the explanation: the structure, the instructions, the
// placeholders and the count. The AI's half is the prose that replaces the markers, so the
// frame has to be readable and answerable before a single word of it is written.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ABSENT_SECTION_STATEMENT,
  FRAME_SECTIONS,
  GROUND_LABEL,
  HUMAN_ITEM_HEADING,
  OVERRIDE_LABEL,
  PARTY_LABEL,
  PREDECIDED_ITEM_HEADING,
  COUNT_LABEL,
  buildFrame,
  mentionsId,
} from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import { MUST_FILL_MARKER, findHumanPlaceholders, findOpenMarkers } from '../../../.claude/scripts/explain-seed/lib/markers.mjs';
import { syntheticFacts, syntheticOpenIds, syntheticProjection } from '../helpers/synthetic-facts.mjs';

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

test('C003 postcondition: every human-decision item carries exactly one placeholder', () => {
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });
  const bodies = sectionBody(frame.text, FRAME_SECTIONS[4].title).split(`\n${HUMAN_ITEM_HEADING} `).slice(1);

  assert.equal(bodies.length, frame.humanDecisionItems.length);
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

test('C006 postcondition: every recorded open id is carried into the frame, and none is pre-decided', () => {
  const facts = syntheticFacts();
  const frame = buildFrame({ facts, previous: null });
  const decisions = sectionBody(frame.text, FRAME_SECTIONS[4].title);
  const preDecided = sectionBody(frame.text, FRAME_SECTIONS[5].title);
  const openIds = syntheticOpenIds(facts.projection);

  assert.equal(openIds.length, 2, 'the fixture records two open items');
  for (const id of openIds) {
    assert.ok(mentionsId(decisions, id), `${id} is asked of the human`);
    assert.equal(mentionsId(preDecided, id), false, `${id} is not decided for them`);
  }
});

test('C006 postcondition: one item per recorded open id, and the declared count is asked for rather than asserted', () => {
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });

  assert.equal(frame.humanDecisionItems.length, syntheticOpenIds().length);
  assert.equal(itemsUnder(frame.text, FRAME_SECTIONS[4].title, HUMAN_ITEM_HEADING), syntheticOpenIds().length);
  assert.match(
    frame.text,
    new RegExp(`${MUST_FILL_MARKER.replace(/[[\]]/g, '\\$&')}[^\\n]*${COUNT_LABEL}`),
    'the introduction asks for the count instead of stating it',
  );
});

test('C005 postcondition: a question the facts settle is pre-decided with a decision, a ground and an override condition', () => {
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });
  const items = sectionBody(frame.text, FRAME_SECTIONS[5].title).split(`\n${PREDECIDED_ITEM_HEADING} `).slice(1);

  assert.ok(items.length > 0, 'the settled contracts, forbidden edges and obligations are listed');
  for (const body of items) {
    assert.ok(body.includes(GROUND_LABEL), `an item states its ${GROUND_LABEL}`);
    assert.ok(body.includes(OVERRIDE_LABEL), `an item states its ${OVERRIDE_LABEL}`);
  }
  assert.match(frame.text, /contract_registry/, 'a ground names the manifest field it came from');
});

test('C005 postcondition: a question whose answer turns on how the result feels asks whose experience changes', () => {
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });
  const decisions = sectionBody(frame.text, FRAME_SECTIONS[4].title);
  const partyLines = decisions.split('\n').filter((line) => line.trimStart().startsWith(`- ${PARTY_LABEL}:`));

  assert.equal(partyLines.length, syntheticOpenIds().length, 'one party line per item, and no more');
});

test('C005 postcondition: a question about a boundary carries the contract that settles it', () => {
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });
  const boundaryItem = frame.humanDecisionItems.find((item) => item.id === 'boundary-001');

  assert.notEqual(boundaryItem, undefined, 'the fixture records boundary-001 as risky');
  assert.match(boundaryItem.text, /contract-boundary-001/, 'the contract that governs this boundary is named');
  assert.match(boundaryItem.text, /clauses\.canonicalization/, 'and the clause stage two already settled is quoted');
});

test('C005 postcondition: a boundary no contract covers still asks its question, and says what is missing', () => {
  const facts = syntheticFacts({
    projection: syntheticProjection({ grill: { questions: [], risky_boundaries: [{ id: 'boundary-999', topic: null }] } }),
  });
  const frame = buildFrame({ facts, previous: null });

  assert.equal(frame.humanDecisionItems.length, 1);
  assert.match(frame.humanDecisionItems[0].text, /boundary-999/);
  assert.ok(
    frame.humanDecisionItems[0].text.includes(ABSENT_SECTION_STATEMENT),
    'the absence of a governing contract is stated rather than left blank',
  );
});

test('C005 postcondition: the clauses quoted for a boundary are capped with an explicit remainder', () => {
  const clauses = Array.from({ length: 9 }, (_, index) => ({ name: `clause${index}`, text: `Settled clause ${index}.` }));
  const projection = syntheticProjection({
    contracts: [
      {
        contract_id: 'contract-boundary-001',
        boundary_id: 'boundary-001',
        connection_kind: 'value_only',
        direction: '提供',
        counterpart: 'pkg-0002',
        clauses,
      },
    ],
  });
  const frame = buildFrame({ facts: syntheticFacts({ projection }), previous: null });
  const boundaryItem = frame.humanDecisionItems.find((item) => item.id === 'boundary-001');

  assert.match(boundaryItem.text, /…ほか \d+ 件/, 'the clauses left out are counted');
});

test('C006 postcondition: a package that owns no open item says so in full rather than leaving the section empty', () => {
  const facts = syntheticFacts({
    projection: syntheticProjection({ grill: { questions: [], risky_boundaries: [] } }),
  });
  const frame = buildFrame({ facts, previous: null });
  const decisions = sectionBody(frame.text, FRAME_SECTIONS[4].title);

  assert.equal(frame.humanDecisionItems.length, 0);
  assert.ok(decisions.trim().length > 0, 'the section is not empty');
  assert.match(decisions, /登録されていません/, 'and it states the absence in full');
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
