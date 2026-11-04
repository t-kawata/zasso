// PX-359 @verifies C001
// [::TICKET::] PX-359 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-359 --for-spec --no-implementation-order`.
/**
 * Formula extraction and token normalization.
 *
 * The two delimiter families are equivalent identities, not two syntaxes with two
 * meanings: a formula transcribed from `\[...\]` into `$$...$$` must keep its digest,
 * while a changed symbol or coefficient must change it. The tests below fix both
 * directions before the extractor exists.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractFormulas,
  formulaId,
  normalizeFormula,
  uniqueFormulas,
} from '../../.claude/scripts/spec-formula/index.mjs';

const BRACKET_SPEC = [
  '# Specification',
  '',
  '\\[ r=(id_r,origin,payload,context,parent), \\quad q^v=(id_q,v,input,objective,constraints,context,derivation), \\]',
  '',
  'The width is \\( M=2^b \\) bits.',
].join('\n');

const DOLLAR_SPEC = [
  '# Specification',
  '',
  '$$ r=(id_r,origin,payload,context,parent), \\quad q^v=(id_q,v,input,objective,constraints,context,derivation), $$',
  '',
  'The width is $M=2^b$ bits.',
].join('\n');

test('C001 precondition: display and inline bracket formulas are extracted with line ranges', () => {
  const formulas = extractFormulas(BRACKET_SPEC);

  assert.equal(formulas.length, 2);
  assert.equal(formulas[0].display, true);
  assert.equal(formulas[0].lineStart, 3);
  assert.equal(formulas[1].display, false);
  assert.equal(formulas[1].lineStart, 5);
  assert.match(formulas[1].body, /M=2\^b/);
});

test('C001 invariant: the dollar family produces the same digests as the bracket family', () => {
  const bracket = extractFormulas(BRACKET_SPEC).map((formula) => formula.digest);
  const dollar = extractFormulas(DOLLAR_SPEC).map((formula) => formula.digest);

  assert.deepEqual(dollar, bracket);
});

test('C001 invariant: grouping braces and whitespace do not change the digest', () => {
  assert.equal(normalizeFormula('\\mathcal E'), normalizeFormula('\\mathcal{E}'));
  assert.equal(normalizeFormula('x^2'), normalizeFormula('x^{2}'));
  assert.equal(
    normalizeFormula('a + b'),
    normalizeFormula('a+b'),
  );
});

test('C001 invariant: a changed symbol or coefficient changes the digest', () => {
  const eDigest = extractFormulas('\\[ \\mathcal E \\]')[0].digest;
  const dDigest = extractFormulas('\\[ \\mathcal D \\]')[0].digest;
  const coefficientDigest = extractFormulas('\\[ M=2^b \\]')[0].digest;
  const changedCoefficientDigest = extractFormulas('\\[ M=3^b \\]')[0].digest;

  assert.notEqual(eDigest, dDigest);
  assert.notEqual(coefficientDigest, changedCoefficientDigest);
});

test('C001 invariant: the fx id is stable for one body and changes with the digest', () => {
  const first = extractFormulas('\\[ M=2^b \\]')[0];
  const second = extractFormulas('$$M=2^b$$')[0];

  assert.equal(first.id, second.id);
  assert.equal(first.id, formulaId(first.digest));
  assert.match(first.id, /^fx-[0-9a-f]{12}$/);
});

test('C001 boundary: fenced blocks, code spans and escaped dollars are not formulas', () => {
  const text = [
    '```markdown',
    '\\[ not-a-formula \\]',
    '```',
    '',
    'Use `\\( inline-code \\)` literally.',
    '',
    'A price of \\$5 and \\( M=2^b \\).',
  ].join('\n');
  const formulas = extractFormulas(text);

  assert.equal(formulas.length, 1);
  assert.match(formulas[0].body, /M=2\^b/);
});

test('C001 boundary: multi-line display math and aligned environments are extracted', () => {
  const text = [
    '\\[',
    '\\begin{aligned}',
    'a &= b + c, \\\\',
    'd &= e',
    '\\end{aligned}',
    '\\]',
  ].join('\n');
  const formulas = extractFormulas(text);

  assert.equal(formulas.length, 1);
  assert.equal(formulas[0].display, true);
  assert.equal(formulas[0].lineStart, 1);
  assert.equal(formulas[0].lineEnd, 6);
  assert.match(formulas[0].normalized, /aligned/);
});

test('C001 boundary: an unscoped dollar sign is not an inline formula', () => {
  const formulas = extractFormulas('It costs $5 and $6 today.');

  assert.equal(formulas.length, 0);
});

test('C001 boundary: one display body written twice is two occurrences with one identity', () => {
  const text = '\\[ M=2^b \\]\n\nSame again: $$M=2^b$$';
  const formulas = extractFormulas(text);
  const unique = uniqueFormulas(formulas);

  assert.equal(formulas.length, 2);
  assert.equal(unique.length, 1);
  assert.equal(unique[0].id, formulas[0].id);
});
