// PX-222 @verifies C008
// PX-229 @verifies C007
//
// Re-running is the step that can quietly destroy a person's work, in one of two
// directions. A section kept when its facts moved presents a stale judgement as current;
// a section reopened when nothing moved discards thinking for nothing. Both directions are
// asserted here, and the merge reports which way it went so an operator can see it.
//
// The human's section is the exception that proves the rule: it is maintained rather than
// regenerated, so a moved fact reopens it — the AI must re-judge it — while its body, every
// question number and every answer under it are carried through byte for byte.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FRAME_SECTIONS,
  HUMAN_SECTION_ID,
  buildFrame,
  locateSections,
  readQuestionNumbers,
} from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import { countOpenMarkers, isPlaceholderLine } from '../../../.claude/scripts/explain-seed/lib/markers.mjs';
import { syntheticFacts, syntheticInfoSections, syntheticOpenIds } from '../helpers/synthetic-facts.mjs';
import { authorExplanation } from '../helpers/fill-frame.mjs';

const HUMAN_NOTE = '人間の判断: ここは現場の感覚では拒否のほうが自然だと考える。';

/** Put a person's own note under one placeholder, the way an operator would. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function withHumanNote(documentText, note = HUMAN_NOTE) {
  const lines = [];
  let written = false;
  for (const line of documentText.split('\n')) {
    lines.push(line);
    if (!written && isPlaceholderLine(line)) {
      lines.push(note);
      written = true;
    }
  }
  assert.equal(written, true, 'the fixture has a placeholder to write under');
  return lines.join('\n');
}

/** An authored EXPLAIN: a round of questions, a note written under the first placeholder. */
// [::TICKET::] PX-222, PX-229 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-222|PX-229) --for-spec --no-implementation-order`.
function authoredExplanation() {
  return withHumanNote(authorExplanation({ facts: syntheticFacts(), boundIds: syntheticOpenIds() }));
}

/** The same facts, with one INFO section moved, so only the sections resting on it reopen. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function factsWithMovedPosition() {
  return syntheticFacts({
    infoSections: syntheticInfoSections({ I2: '## 2. 全体の中での位置\n\n全体は 3 パッケージで構成されています。\n' }),
  });
}

test('C008 precondition: an EXPLAIN exists from an earlier run, carrying prose and a human note', () => {
  const previous = authoredExplanation();

  assert.equal(countOpenMarkers(previous), 0, 'the earlier document was authored');
  assert.ok(previous.includes(HUMAN_NOTE));
});

test('C008 postcondition: a run whose facts are unchanged keeps every section and every note', () => {
  const previous = authoredExplanation();
  const frame = buildFrame({ facts: syntheticFacts(), previous });

  assert.deepEqual(frame.reopenedSections, [], 'nothing moved, so nothing is reopened');
  assert.deepEqual(frame.keptSections, FRAME_SECTIONS.map((section) => section.id));
  assert.equal(countOpenMarkers(frame.text), 0, 'a kept document is not re-opened for writing');
  assert.ok(frame.text.includes(HUMAN_NOTE), 'the human note survives an unchanged run');
});

test('C008 postcondition: a run whose facts moved reopens only the sections resting on them', () => {
  const frame = buildFrame({ facts: factsWithMovedPosition(), previous: authoredExplanation() });

  assert.deepEqual(frame.reopenedSections, ['E1', 'E2']);
  assert.deepEqual(frame.keptSections, ['E3', 'E4', 'E5', 'E6', 'E7']);
  assert.ok(countOpenMarkers(frame.text) > 0, 'the reopened sections ask to be written again');
  assert.ok(frame.text.includes(HUMAN_NOTE), 'the human note is kept, not discarded');
  assert.match(frame.text, /INFO 2/, 'the note is annotated with the fact that moved');
});

test('C007 postcondition: a fact the human section rests on reopens it, and its body is carried byte for byte', () => {
  const previous = authoredExplanation();
  const facts = syntheticFacts({
    infoSections: syntheticInfoSections({ I9: '## 9. grill で詰めるべき点\n\n- residual-000001: 記録が更新された\n' }),
  });
  const frame = buildFrame({ facts, previous });

  assert.deepEqual(frame.reopenedSections, ['E5'], 'the section resting on the moved fact reopens so the AI re-judges it');
  assert.equal(
    locateSections(frame.text).bodies[HUMAN_SECTION_ID],
    locateSections(previous).bodies[HUMAN_SECTION_ID],
    'and the body a person wrote into is carried through without a byte changing',
  );
  assert.deepEqual(readQuestionNumbers(frame.text), readQuestionNumbers(previous), 'no question is renumbered either');
  assert.ok(frame.text.includes(HUMAN_NOTE), 'the human note is kept, not discarded');
});

test('C008 invariant: the merge reports how many sections were kept and which were reopened', () => {
  const frame = buildFrame({ facts: factsWithMovedPosition(), previous: authoredExplanation() });

  assert.equal(frame.keptSections.length + frame.reopenedSections.length, FRAME_SECTIONS.length);
  assert.deepEqual(frame.faults, [], 'a readable previous document raises no fault');
});

test('C008 invariant: a lost anchor is reported rather than merged over', () => {
  const previous = authoredExplanation().split('\n').filter((line) => !isPlaceholderLine(line)).join('\n');
  const frame = buildFrame({ facts: factsWithMovedPosition(), previous });
  const reported = frame.faults.filter((fault) => fault.kind === 'unreadable-section');

  assert.ok(
    reported.some((fault) => fault.section === 'E5'),
    'the section whose anchor cannot be found is named, rather than merged over in silence',
  );
  assert.ok(frame.text.includes(HUMAN_NOTE), 'what the person wrote is left where it is, not destroyed');
});

test('C008 invariant: a document whose section heading appears twice is reported by section', () => {
  const previous = `${authoredExplanation()}\n## ${FRAME_SECTIONS[1].title}\n\n- 重複した見出し\n`;
  const frame = buildFrame({ facts: syntheticFacts(), previous });

  assert.ok(
    frame.faults.some((fault) => fault.kind === 'duplicate-section' && fault.section === 'E2'),
    'the duplicated section is named',
  );
});

test('C008 invariant: no previous document reopens everything and raises no fault', () => {
  const frame = buildFrame({ facts: syntheticFacts(), previous: null });

  assert.deepEqual(frame.reopenedSections, FRAME_SECTIONS.map((section) => section.id));
  assert.deepEqual(frame.keptSections, []);
  assert.deepEqual(frame.faults, [], 'a first run is not a damaged document');
});
