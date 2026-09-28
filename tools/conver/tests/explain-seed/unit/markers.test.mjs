// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
// PX-222 @verifies C004
//
// The two tokens the frame and the gate are built on. Both are detected by one predicate
// each, and every consumer calls that predicate rather than matching the literal itself,
// because a counter and a gate that disagree about what a marker is would allow a document
// to pass while it still holds an instruction nobody wrote.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HUMAN_PLACEHOLDER,
  MUST_FILL_MARKER,
  countOpenMarkers,
  countPlaceholdersIn,
  findHumanPlaceholders,
  findOpenMarkers,
  markerOffsetInLine,
} from '../../../.claude/scripts/explain-seed/lib/markers.mjs';

test('C004 precondition: a document is parsed for both tokens and returns their lines', () => {
  const document = ['# 文書', '', `${MUST_FILL_MARKER} ここに書く`, '', HUMAN_PLACEHOLDER, ''].join('\n');

  assert.deepEqual(findOpenMarkers(document), [{ line: 3, text: `${MUST_FILL_MARKER} ここに書く`, offset: 0 }]);
  assert.deepEqual(findHumanPlaceholders(document), [{ line: 5 }]);
});

test('C004 postcondition: an occurrence inside a sentence is not a marker', () => {
  assert.equal(findOpenMarkers('この行は [::MUST-FILL::] に言及している。\n').length, 0);
  assert.equal(findOpenMarkers(`説明の途中で ${MUST_FILL_MARKER} と書いてみる\n`).length, 0);
  assert.equal(findOpenMarkers(`${MUST_FILL_MARKER} ここに書く\n`).length, 1);
});

test('C004 postcondition: indentation does not hide a marker, and a bullet is not a marker', () => {
  const indented = `  ${MUST_FILL_MARKER} ここに書く`;

  assert.equal(findOpenMarkers(`${indented}\n`).length, 1, 'an indented instruction is still an instruction');
  assert.equal(markerOffsetInLine(indented), 2, 'the offset is the marker itself, not the indentation');
  assert.equal(markerOffsetInLine(`- ${MUST_FILL_MARKER} ここに書く`), -1, 'a bullet makes the line a list item, not an instruction');
  assert.equal(markerOffsetInLine('- この文書では [::MUST-FILL::] を使う'), -1);
});

test('C004 postcondition: the placeholder is found only as its own line', () => {
  assert.equal(countPlaceholdersIn(`前置き ${HUMAN_PLACEHOLDER} 後置き\n`), 0);
  assert.equal(countPlaceholdersIn(`${HUMAN_PLACEHOLDER}\n`), 1);
  assert.equal(countPlaceholdersIn(`  ${HUMAN_PLACEHOLDER}  \n`), 1, 'surrounding whitespace does not hide it');
  assert.equal(countPlaceholdersIn(`- ${HUMAN_PLACEHOLDER}\n`), 0, 'a bullet makes it something else');
});

test('C004 invariant: one predicate serves the counter and the finder, so the two cannot disagree', () => {
  const document = [MUST_FILL_MARKER + ' a', `  ${MUST_FILL_MARKER} b`, 'c', `d ${MUST_FILL_MARKER} e`, ''].join('\n');

  assert.equal(countOpenMarkers(document), findOpenMarkers(document).length);
  assert.equal(countOpenMarkers(document), 2, 'the two real instructions, not the two mentions');
});

test('C004 invariant: prose that mentions the marker cannot satisfy the counter', () => {
  const prose = `この文書では ${MUST_FILL_MARKER} という印を使います。\n`;

  assert.equal(countOpenMarkers(prose), 0, 'a mention is not an instruction');
});
