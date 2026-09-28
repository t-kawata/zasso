// PX-222 @verifies C002
// PX-222 @verifies C003
//
// One document is addressed to a machine and an AI, the other to a person about to hold a
// design conversation. That difference is the whole reason there are two documents, so it
// is asserted as an invariant rather than left to whoever edits a string next: give both
// documents facts written entirely in ASCII, and the facts document must come back with no
// Japanese in it at all, while the explanation must still be Japanese. Any Japanese left in
// the facts document is then, by construction, Japanese the tool wrote itself.
//
// The one thing this cannot assert is that the facts are English — they are not, and they
// must not be. The specification is a Japanese document, and the facts quote it verbatim.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ABSENT_RESIDUALS_STATEMENT as INFO_ABSENT_RESIDUALS,
  ABSENT_SECTION_STATEMENT as INFO_ABSENT_SECTION,
  renderInfo,
} from '../../../.claude/scripts/explain-seed/lib/render.mjs';
import {
  ABSENT_RESIDUALS_STATEMENT as EXPLAIN_ABSENT_RESIDUALS,
  ABSENT_SECTION_STATEMENT as EXPLAIN_ABSENT_SECTION,
  buildFrame,
} from '../../../.claude/scripts/explain-seed/lib/frame.mjs';
import { syntheticFacts, syntheticProjection } from '../helpers/synthetic-facts.mjs';

/** Japanese script: hiragana, katakana or a CJK ideograph. */
const JAPANESE = /[぀-ヿ一-鿿]/;

/** The same value with every non-ASCII character replaced, so any Japanese left is the tool's. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function asciiOnly(value) {
  if (typeof value === 'string') return value.replace(/[^\x20-\x7e]/g, '#');
  if (Array.isArray(value)) return value.map(asciiOnly);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, asciiOnly(entry)]));
  }
  return value;
}

/** Facts whose every value is ASCII, so the tool is the only possible source of Japanese. */
// [::TICKET::] PX-222 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-222 --for-spec --no-implementation-order`.
function asciiFacts() {
  return syntheticFacts({ projection: asciiOnly(syntheticProjection()) });
}

test('C002 invariant: given ASCII facts, the facts document contains no Japanese at all', () => {
  const facts = asciiFacts();
  const { text } = renderInfo({
    projection: facts.projection,
    workspace: facts.workspace,
    seedPath: facts.seedPath,
    verified: { specification: 'a'.repeat(64), stageOneManifest: 'b'.repeat(64), seed: 'c'.repeat(64) },
  });

  const japanese = text.split('\n').filter((line) => JAPANESE.test(line));
  assert.deepEqual(japanese, [], 'every Japanese line in the facts document would be the tool writing Japanese');
});

test('C002 invariant: the same facts produce an explanation that is still Japanese', () => {
  const frame = buildFrame({ facts: asciiFacts(), previous: null });

  assert.match(frame.text, JAPANESE, 'the explanation is the document addressed to a person, and stays in their language');
});

test('C003 invariant: the two documents state their absences in their own language, from their own constant', () => {
  assert.equal(JAPANESE.test(INFO_ABSENT_RESIDUALS), false, 'the facts state an absence in English');
  assert.equal(JAPANESE.test(INFO_ABSENT_SECTION), false, 'the facts state an empty section in English');
  assert.match(EXPLAIN_ABSENT_RESIDUALS, JAPANESE, 'the explanation states an absence in Japanese');
  assert.match(EXPLAIN_ABSENT_SECTION, JAPANESE, 'the explanation states an empty section in Japanese');
  assert.notEqual(INFO_ABSENT_RESIDUALS, EXPLAIN_ABSENT_RESIDUALS, 'one constant per document, so neither can move the other');
  assert.notEqual(INFO_ABSENT_SECTION, EXPLAIN_ABSENT_SECTION, 'one constant per document, so neither can move the other');
});

test('C003 invariant: a trimmed list says what it dropped, in the facts document\'s own words', () => {
  const boundaries = Array.from({ length: 15 }, (_, index) => ({
    id: `boundary-1${String(index).padStart(2, '0')}`,
    reason_code: 'canonical-object',
    contract_scope: ['input'],
    counterpart: 'pkg-0002',
  }));
  const facts = syntheticFacts({
    projection: asciiOnly(syntheticProjection({ boundaries: { provided: boundaries, consumed: [] } })),
  });
  const { text } = renderInfo({
    projection: facts.projection,
    workspace: facts.workspace,
    seedPath: facts.seedPath,
    verified: { specification: 'a'.repeat(64), stageOneManifest: 'b'.repeat(64), seed: 'c'.repeat(64) },
  });

  assert.equal(JAPANESE.test(text), false, 'the facts do not borrow the explanation\'s wording for a trim');
  assert.match(text, /…and 3 more/, 'and the trim is stated in the facts\' own words');
});
