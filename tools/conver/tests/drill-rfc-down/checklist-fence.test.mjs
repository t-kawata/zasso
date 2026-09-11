// [::TICKET::] PX-208 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-208 --for-spec --no-implementation-order`.
// @verifies C002
// @verifies C003
// @verifies C004
/**
 * checklist-fence — a generator owns a region, not a file.
 *
 * Both checklist generators end by pushing a comment that tells the reader to
 * append their own constraints, and then rewriting the whole file. The next run
 * deletes exactly what the previous run asked for (`./CheckList.md` line 137 is a
 * live specimen). This module is the shared answer: the generator replaces the
 * bytes between its fence markers and preserves every byte outside them.
 *
 * The fence is an HTML comment and not the project's `[::...::]` marker idiom,
 * because `CheckList.md` is Markdown rendered for a human: an HTML comment is
 * invisible in every renderer, while `[::STUB::]` and `[::TICKET::]` are read by
 * the repository's static scanner and would be misreported as stray markers. The
 * first test below pins that separation rather than trusting it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  AI_SUPPLEMENT_COMMENT,
  GENERATED_BEGIN,
  GENERATED_END,
  composeFencedFile,
  readFencedRegions,
} from '../../.claude/scripts/grill-me-for-rfc/lib/checklist-fence.mjs';

const HUMAN = '## AI補足: プロジェクト固有の制約・注意事項\n\n- プロジェクト固有の制約A\n- プロジェクト固有の制約B';
const BODY = '# RFC 要件チェックリスト\n\n## 全体チェック\n\n- [ ] 何か';
const sha = (text) => createHash('sha256').update(text).digest('hex');

/** A file the fixed generator would produce: one fence pair, then human content. */
const fenced = (body, human) => [GENERATED_BEGIN, body, GENERATED_END, human].join('\n');

/** A file the PRE-fix generator produced: sections, the trailing comment, then human content. */
const legacy = (human) => ['# RFC 要件チェックリスト', '', '## 全体チェック', '', AI_SUPPLEMENT_COMMENT, '', human].join('\n');

// --- The constants themselves -------------------------------------------------

test('the fence does not collide with the markers the repository scans for', () => {
  for (const constant of [GENERATED_BEGIN, GENERATED_END]) {
    assert.equal(/\[::/.test(constant), false, 'the fence must stay out of the [::...::] marker namespace');
    assert.equal(/STUB|TICKET|AMBIGUOUS|TEMPLATE-STUB/.test(constant), false, 'a fence must not be read as a work marker');
    assert.match(constant, /^<!--.*-->$/, 'and it must be an HTML comment, invisible in a Markdown renderer');
  }
  assert.notEqual(GENERATED_BEGIN, GENERATED_END, 'the pair must be distinguishable');
});

test('the trailing AI-supplement comment is defined once and still names the section', () => {
  assert.equal(typeof AI_SUPPLEMENT_COMMENT, 'string');
  assert.match(AI_SUPPLEMENT_COMMENT, /AI補足/);
  assert.match(AI_SUPPLEMENT_COMMENT, /^<!--.*-->$/);
});

// --- C002: the fence is the unit of ownership ---------------------------------

test('C002 postcondition: regeneration replaces the fenced region and preserves what follows', () => {
  const result = composeFencedFile({ generatedBody: BODY, existingText: fenced('OLD BODY', HUMAN) });

  assert.equal(result.ok, true);
  assert.equal(result.action, 'replaced');
  assert.equal(result.text.includes('OLD BODY'), false, 'the previous generated body is gone');
  assert.ok(result.text.includes(BODY), 'the new generated body is present');
  assert.equal(sha(result.text.slice(result.text.indexOf('## AI補足'))), sha(HUMAN), 'the human region is byte-identical');
});

test('C002 postcondition: content BETWEEN two generated sections survives', () => {
  const existing = [
    GENERATED_BEGIN, 'FIRST', GENERATED_END,
    '## AI補足: 人間が書いた中間セクション',
    GENERATED_BEGIN, 'SECOND', GENERATED_END,
    'tail note',
  ].join('\n');

  const result = composeFencedFile({ generatedBody: BODY, existingText: existing });
  assert.equal(result.ok, false, 'two fence pairs is ambiguous and must be refused rather than guessed at');
  assert.match(result.reason, /two|multiple|pair/i, 'and the reason must name the condition');
});

test('C002 invariant: two regenerations leave the preserved region identical', () => {
  const start = fenced('OLD', HUMAN);
  const once = composeFencedFile({ generatedBody: BODY, existingText: start }).text;
  const twice = composeFencedFile({ generatedBody: BODY, existingText: once }).text;

  assert.equal(twice, once, 'the second regeneration is a byte-level no-op');
  assert.equal(sha(once.slice(once.indexOf('## AI補足'))), sha(HUMAN));
});

// --- C004: legacy migration ---------------------------------------------------

test('C004 postcondition: a legacy file is migrated, closing the fence after the trailing comment', () => {
  const result = composeFencedFile({ generatedBody: BODY, existingText: legacy(HUMAN) });

  assert.equal(result.ok, true);
  assert.equal(result.action, 'migrated');
  assert.ok(result.text.includes(HUMAN), 'the hand-written section survives');
  assert.equal(sha(result.text.slice(result.text.indexOf('## AI補足'))), sha(HUMAN));
  assert.ok(
    result.text.indexOf(GENERATED_END) < result.text.indexOf('## AI補足'),
    'the fence closes before the human section, so the section is outside it',
  );
  assert.equal(result.text.indexOf(AI_SUPPLEMENT_COMMENT) < result.text.indexOf(GENERATED_END), true);
});

test('C004 invariant: the migration run is itself idempotent', () => {
  const migrated = composeFencedFile({ generatedBody: BODY, existingText: legacy(HUMAN) }).text;
  const again = composeFencedFile({ generatedBody: BODY, existingText: migrated });

  assert.equal(again.action, 'replaced');
  assert.equal(again.text, migrated);
});

test('C004 postcondition: a file with neither a fence nor the trailing comment is refused', () => {
  const result = composeFencedFile({ generatedBody: BODY, existingText: 'just some prose the generator cannot claim' });

  assert.equal(result.ok, false);
  assert.match(result.reason, /trailing|AI補足|refus/i);
  assert.equal(result.text, undefined, 'a refusal yields nothing to write');
});

test('C004 boundary: an absent or empty file is a creation, not a refusal', () => {
  for (const existingText of ['', undefined, null]) {
    const result = composeFencedFile({ generatedBody: BODY, existingText });
    assert.equal(result.ok, true, `existingText=${JSON.stringify(existingText)} must read as a creation`);
    assert.equal(result.action, 'created');
    assert.ok(result.text.includes(GENERATED_BEGIN) && result.text.includes(GENERATED_END));
    assert.ok(result.text.includes(BODY));
  }
});

// --- readFencedRegions --------------------------------------------------------

test('readFencedRegions names the three regions of a fenced file', () => {
  const read = readFencedRegions(fenced('MIDDLE', HUMAN));

  assert.equal(read.ok, true);
  assert.equal(read.generated, 'MIDDLE');
  assert.equal(read.after, HUMAN);
});

test('readFencedRegions reports the legacy shape rather than pretending it is fenced', () => {
  const read = readFencedRegions(legacy(HUMAN));

  assert.equal(read.ok, false);
  assert.match(read.reason, /fence|trailing/i);
});
