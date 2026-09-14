// @verifies C002
/**
 * E13 — trivial compiler-normalisation equivalence, and nothing more.
 *
 * The verdict this item produces is drawn from two values: the two texts
 * normalise to the same tree under one named grammar, or they do not. That is a
 * syntactic statement about a pair of texts, and it is the whole of what the
 * instrument claims — semantic equivalence is undecidable for general programs,
 * which is why E13's capability cell reads `unsupported_in_principle` in every
 * language and why a walk of the published output is asserted to find no phrase
 * claiming more.
 *
 * The grammar is `GRAMMAR_BY_LANGUAGE`'s, never a table declared here: a second
 * table would drift on spelling, and each consumer's tests would pass against
 * its own copy while the two disagreed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CAPABILITY_MATRIX, TARGET_LANGUAGES } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';
import {
  GRAMMAR_BY_LANGUAGE,
  grammarIdentityFor,
} from '../../../.claude/scripts/workspacify-reverse/lib/structure.mjs';
import {
  NOT_TRIVIALLY_EQUIVALENT,
  TCE_VERDICTS,
  TRIVIALLY_EQUIVALENT,
  compareTrivially,
  normaliseUnderGrammar,
  tceConfigurationFor,
} from '../../../.claude/scripts/workspacify-reverse/lib/tce.mjs';

const PROJECT_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const LIB = join(PROJECT_ROOT, '.claude', 'scripts', 'workspacify-reverse', 'lib');

/** The phrase no output of this item may carry, in either spelling. */
const SEMANTIC_EQUIVALENCE = /semantically equivalent|semantic equivalence|proved equivalent/i;

/** Every string anywhere in a value, at full depth. */
function stringsIn(value, found = []) {
  if (typeof value === 'string') { found.push(value); return found; }
  if (Array.isArray(value)) { for (const entry of value) stringsIn(entry, found); return found; }
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) stringsIn(value[key], found);
  }
  return found;
}

/** A pair per language that differs only in whitespace and comments. */
const REFLOWED_PAIR_BY_LANGUAGE = Object.freeze({
  rust: ['pub fn add(a: i32, b: i32) -> i32 { a + b }\n', 'pub fn add(a: i32, b: i32) -> i32 {\n    // summed\n    a + b\n}\n'],
  typescript: ['export function add(a: number, b: number): number { return a + b }\n', 'export function add(a: number, b: number): number {\n  // summed\n  return a + b\n}\n'],
  javascript: ['function add(a, b) { return a + b }\n', 'function add(a, b) {\n  // summed\n  return a + b\n}\n'],
  go: ['package p\n\nfunc Add(a int, b int) int { return a + b }\n', 'package p\n\nfunc Add(a int, b int) int {\n\t// summed\n\treturn a + b\n}\n'],
  python: ['def add(a, b):\n    return a + b\n', 'def add(a, b):\n    # summed\n    return a + b\n'],
  c_cpp: ['int add(int a, int b) { return a + b; }\n', 'int add(int a, int b) {\n  // summed\n  return a + b;\n}\n'],
});

/** A pair per language whose operator differs, so the second value is exercised. */
const CHANGED_OPERATOR_PAIR_BY_LANGUAGE = Object.freeze({
  rust: ['pub fn add(a: i32, b: i32) -> i32 { a + b }\n', 'pub fn add(a: i32, b: i32) -> i32 { a - b }\n'],
  typescript: ['export function add(a: number, b: number): number { return a + b }\n', 'export function add(a: number, b: number): number { return a - b }\n'],
  javascript: ['function add(a, b) { return a + b }\n', 'function add(a, b) { return a - b }\n'],
  go: ['package p\n\nfunc Add(a int, b int) int { return a + b }\n', 'package p\n\nfunc Add(a int, b int) int { return a - b }\n'],
  python: ['def add(a, b):\n    return a + b\n', 'def add(a, b):\n    return a - b\n'],
  c_cpp: ['int add(int a, int b) { return a + b; }\n', 'int add(int a, int b) { return a - b; }\n'],
});

// ---------------------------------------------------------------------------
// C002 postcondition — the verdict and the normalisation it rests on
// ---------------------------------------------------------------------------

test('UT: [Normal] C002 postcondition — a reflowed mutant is trivially equivalent, and the normalised form is recorded', () => {
  const [original, reflowed] = REFLOWED_PAIR_BY_LANGUAGE.rust;
  const verdict = compareTrivially({ original, mutant: reflowed, language: 'rust' });

  assert.equal(verdict.verdict, TRIVIALLY_EQUIVALENT);
  assert.equal(verdict.language, 'rust');
  assert.equal(typeof verdict.normalised_original, 'string');
  assert.equal(typeof verdict.normalised_mutant, 'string');
  assert.equal(verdict.normalised_original, verdict.normalised_mutant, 'the recorded normalisation is the support for the verdict');
  assert.equal(verdict.configuration_id, tceConfigurationFor('rust').configuration_id);
  assert.equal(typeof verdict.reason, 'string');
});

test('UT: [Normal] C002 postcondition — a changed operator is not trivially equivalent, so both vocabulary values are exercised', () => {
  const [original, changed] = CHANGED_OPERATOR_PAIR_BY_LANGUAGE.rust;
  const verdict = compareTrivially({ original, mutant: changed, language: 'rust' });

  assert.equal(verdict.verdict, NOT_TRIVIALLY_EQUIVALENT);
  assert.notEqual(verdict.normalised_original, verdict.normalised_mutant);
  assert.deepEqual(TCE_VERDICTS, [TRIVIALLY_EQUIVALENT, NOT_TRIVIALLY_EQUIVALENT]);
  assert.equal(Object.isFrozen(TCE_VERDICTS), true, 'the vocabulary is frozen so it cannot be widened at a call site');
});

test('UT: [Normal] C002 postcondition — every declared language produces both values of the vocabulary', () => {
  for (const language of TARGET_LANGUAGES) {
    const [original, reflowed] = REFLOWED_PAIR_BY_LANGUAGE[language];
    const [sameOriginal, changed] = CHANGED_OPERATOR_PAIR_BY_LANGUAGE[language];
    assert.equal(sameOriginal, original, `${language}: both pairs start from the same text`);

    assert.equal(
      compareTrivially({ original, mutant: reflowed, language }).verdict,
      TRIVIALLY_EQUIVALENT,
      `${language}: whitespace and comments do not decide the tree`,
    );
    assert.equal(
      compareTrivially({ original, mutant: changed, language }).verdict,
      NOT_TRIVIALLY_EQUIVALENT,
      `${language}: a changed operator is a different tree`,
    );
  }
});

test('UT: [Boundary] C002 postcondition — an identical mutant is trivially equivalent through the comparison, not through an identity short-circuit', () => {
  const calls = [];
  const normaliser = (text, language) => {
    calls.push([text, language]);
    return `N(${text.trim()})`;
  };
  const text = 'int main() { return 0; }';
  const verdict = compareTrivially({ original: text, mutant: text, language: 'c_cpp', normaliser });

  assert.equal(verdict.verdict, TRIVIALLY_EQUIVALENT);
  assert.equal(calls.length, 2, 'both texts are normalised: identity is not a special case');
  assert.deepEqual(calls.map(([, language]) => language), ['c_cpp', 'c_cpp']);
  assert.equal(verdict.normalised_original, verdict.normalised_mutant);
});

test('UT: [Boundary] C002 postcondition — a text the grammar cannot read produces the two-value verdict, never a third value', () => {
  const verdict = compareTrivially({ original: 'pub fn a( {}', mutant: 'pub fn b( {}', language: 'rust' });
  assert.ok(TCE_VERDICTS.includes(verdict.verdict), `the verdict ${verdict.verdict} is outside the vocabulary`);
  assert.equal(verdict.verdict, NOT_TRIVIALLY_EQUIVALENT, 'two unreadable texts are not the same normalised form by assertion');
  assert.equal(verdict.readable, false, 'the record states that the grammar could not read the pair');
});

test('UT: [Boundary] C002 — a multi-line source normalises to the same form regardless of comments, and to a different form when a literal changes', () => {
  const original = 'fn f() -> &\'static str { "hello world" }\n';
  const reflowedLiteral = 'fn f() -> &\'static str { "hello  world" }\n';
  assert.equal(
    compareTrivially({ original, mutant: reflowedLiteral, language: 'rust' }).verdict,
    NOT_TRIVIALLY_EQUIVALENT,
    'whitespace inside a literal is a token, not layout',
  );
});

// ---------------------------------------------------------------------------
// C002 error — a grammar that cannot be loaded is named, never silently defaulted
// ---------------------------------------------------------------------------

test('UT: [Error] C002 postcondition — a grammar that cannot be loaded throws naming the grammar rather than falling back to a text diff', () => {
  assert.throws(
    () => compareTrivially({ original: 'x', mutant: 'y', language: 'cobol' }),
    /no TCE normaliser is declared for cobol/,
  );
  assert.throws(
    () => normaliseUnderGrammar({ language: 'cobol', text: 'x' }),
    /no TCE normaliser is declared for cobol/,
  );
  assert.throws(
    () => normaliseUnderGrammar({ language: 'rust', text: null }),
    /needs the source text/,
  );
});

test('UT: [Error] C002 invariant — a full-depth walk of the comparison output finds no phrase claiming semantic equivalence', () => {
  const verdicts = TARGET_LANGUAGES.flatMap((language) => {
    const [original, reflowed] = REFLOWED_PAIR_BY_LANGUAGE[language];
    const [, changed] = CHANGED_OPERATOR_PAIR_BY_LANGUAGE[language];
    return [
      compareTrivially({ original, mutant: reflowed, language }),
      compareTrivially({ original, mutant: changed, language }),
    ];
  });
  const offenders = stringsIn(verdicts).filter((string) => SEMANTIC_EQUIVALENCE.test(string));
  assert.deepEqual(offenders, [], 'no output of E13 may claim semantic equivalence');
});

// ---------------------------------------------------------------------------
// C002 invariant — the cell, and the grammar's provenance
// ---------------------------------------------------------------------------

test('UT: [Invariant] C002 invariant — E13\'s cell reads unsupported_in_principle in all six, asserted per language', () => {
  for (const language of TARGET_LANGUAGES) {
    assert.equal(
      CAPABILITY_MATRIX[language].E13,
      'unsupported_in_principle',
      `${language}: this ticket implements TCE and does not widen the claim`,
    );
  }
});

test('UT: [Invariant] C002 invariant — the normaliser reads GRAMMAR_BY_LANGUAGE rather than declaring a second grammar table', () => {
  const source = readFileSync(join(LIB, 'tce.mjs'), 'utf8');
  assert.match(source, /import \{[^}]*GRAMMAR_BY_LANGUAGE[^}]*\} from '\.\/structure\.mjs'/);
  assert.equal(/wasmName:\s*'/.test(source), false, 'tce.mjs declares no grammar name of its own');
  assert.equal(/packageName:\s*'/.test(source), false, 'tce.mjs declares no package name of its own');

  for (const language of TARGET_LANGUAGES) {
    const configuration = tceConfigurationFor(language);
    assert.equal(configuration.grammar, GRAMMAR_BY_LANGUAGE[language].packageName);
    assert.equal(configuration.wasm, GRAMMAR_BY_LANGUAGE[language].wasmName);
    assert.equal(configuration.configuration_id, grammarIdentityFor(language));
    assert.equal(configuration.language, language);
  }
});

test('UT: [Error] C002 precondition — a comparison is refused when one of its two texts is absent', () => {
  assert.throws(() => compareTrivially({ original: 'x', language: 'rust' }), /both of its two texts/);
  assert.throws(() => compareTrivially({ mutant: 'x', language: 'rust' }), /both of its two texts/);
  assert.throws(() => compareTrivially({ original: null, mutant: null, language: 'rust' }), /both of its two texts/);
});

test('UT: [Invariant] C002 invariant — oracle-gap re-exports the one declaration rather than keeping a second copy', async () => {
  const oracleGap = await import('../../../.claude/scripts/workspacify-reverse/lib/oracle-gap.mjs');
  const tce = await import('../../../.claude/scripts/workspacify-reverse/lib/tce.mjs');

  for (const name of ['TCE_LADDER_STEPS', 'normaliseForComparison', 'applyComparisonLadder', 'tceConfigurationFor']) {
    assert.equal(
      oracleGap[name],
      tce[name],
      `${name} must be the same object in both modules, or the two can drift`,
    );
  }
});
