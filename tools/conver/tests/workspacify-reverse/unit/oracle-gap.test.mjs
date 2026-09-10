// @verifies C003
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
// R5.5 classifies mutation survivors by cause and discards only what trivial
// compiler equivalence positively decides. A mutation score is never coverage.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MUTATION_SCORE_CAVEAT,
  SURVIVOR_CAUSES,
  TCE_LADDER_STEPS,
  UNKNOWN_LADDER_STEP,
  applyComparisonLadder,
  assertLadderClaimIsNamed,
  assertNoBareEquivalenceClaim,
  buildExpansionLineage,
  classifySurvivors,
  countExpansionsOf,
  discardEquivalentMutants,
  findUnnamedEquivalenceClaims,
  normaliseForComparison,
  renderLadderClaim,
  renderOracleGapReport,
  sourceFormOf,
  tceConfigurationFor,
} from '../../../.claude/scripts/workspacify-reverse/lib/oracle-gap.mjs';
import { GRAMMAR_BY_LANGUAGE } from '../../../.claude/scripts/workspacify-reverse/lib/structure.mjs';
import { TARGET_LANGUAGES } from '../../../.claude/scripts/workspacify-reverse/lib/analysis-tech.mjs';

/** A survivor whose dynamic evidence is absent, which is every survivor in this run. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function survivor(mutantId, extra = {}) {
  return { mutant_id: mutantId, language: 'rust', original: 'if i < n {', mutated: 'if i <= n {', status: 'survived', ...extra };
}

// --- The vocabulary -------------------------------------------------------------

test('C003 postcondition: the survivor causes are the six the contract names plus the mandated fallback', () => {
  assert.deepEqual([...SURVIVOR_CAUSES], [
    'equivalent',
    'unreachable',
    'insufficient_observation',
    'insufficient_oracle',
    'insufficient_input',
    'insufficient_environment',
    'unclassified',
  ]);
  assert.equal(Object.isFrozen(SURVIVOR_CAUSES), true);
});

test('the comparison ladder has seven rungs and stops at the first that applies', () => {
  assert.deepEqual(TCE_LADDER_STEPS.map((step) => step.id), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(UNKNOWN_LADDER_STEP, 7);
  // Rungs four and beyond are unsafe unless the configuration is named.
  for (const step of TCE_LADDER_STEPS.filter((entry) => entry.id >= 4 && entry.id <= 6)) {
    assert.equal(step.requiresNamedConfiguration, true, `rung ${step.id} must demand a named configuration`);
  }
  for (const step of TCE_LADDER_STEPS.filter((entry) => entry.id <= 3)) {
    assert.equal(step.requiresNamedConfiguration, false);
  }
});

// --- C003 precondition: mutation results exist ----------------------------------

test('C003 precondition: classifySurvivors refuses a run with no mutation results', () => {
  assert.throws(() => classifySurvivors(undefined), /mutation results must be supplied/);
  assert.throws(() => classifySurvivors(null), /mutation results must be supplied/);
  assert.throws(() => classifySurvivors([]), /mutation results must be supplied/);

  assert.equal(classifySurvivors([survivor('m1')]).results.length, 1);
});

// --- C003 postcondition ---------------------------------------------------------

test('UT-3: classifySurvivors assigns each survivor a cause from the vocabulary', () => {
  const classified = classifySurvivors([
    survivor('m-unreachable', { reached: false }),
    survivor('m-observation', { reached: true, observed_by: false }),
    survivor('m-input', { reached: true, observed_by: true, covered_inputs: 0, environment_matched: true }),
    survivor('m-environment', { reached: true, observed_by: true, covered_inputs: 4, environment_matched: false }),
    survivor('m-oracle', { reached: true, observed_by: true, covered_inputs: 4, environment_matched: true }),
    survivor('m-silent'),
    { mutant_id: 'm-killed', language: 'rust', original: 'a()', mutated: 'b()', status: 'killed' },
  ]);

  assert.equal(classified.results.length, 6);
  assert.equal(classified.discardedCount, 1, 'the killed mutant is not a survivor and is accounted for');
  assert.equal(classified.results.length + classified.discardedCount, 7);

  const causeOf = (mutantId) => classified.results.find((result) => result.mutant_id === mutantId).cause;
  assert.equal(causeOf('m-unreachable'), 'unreachable');
  assert.equal(causeOf('m-observation'), 'insufficient_observation');
  assert.equal(causeOf('m-input'), 'insufficient_input');
  assert.equal(causeOf('m-environment'), 'insufficient_environment');
  assert.equal(causeOf('m-oracle'), 'insufficient_oracle');

  for (const result of classified.results) {
    assert.ok(SURVIVOR_CAUSES.includes(result.cause), `cause outside the vocabulary: ${result.cause}`);
    assert.equal(typeof result.reason, 'string');
    assert.ok(result.reason.length > 0);
  }
  assert.deepEqual(
    Object.keys(classified.by_cause).sort(),
    [...new Set(classified.results.map((result) => result.cause))].sort(),
  );
});

test('UT-6: a survivor whose evidence is absent is recorded as unclassified rather than discarded', () => {
  // No dynamic analysis has run in this stage, so `reached`, `observed_by` and the
  // rest are genuinely unknown — and "unknown" is the honest answer, not a guess.
  const classified = classifySurvivors([survivor('m-silent')]);

  assert.equal(classified.results.length, 1);
  assert.equal(classified.results[0].cause, 'unclassified');
  assert.equal(classified.results[0].declared_cause, null);
  assert.equal(classified.unclassifiedCount, 1);
  assert.match(classified.results[0].reason, /no evidence|not observed|unavailable/i);
  // Nothing was dropped.
  assert.equal(classified.results.length + classified.discardedCount, 1);
});

test('UT-6: an equivalent cause is never guessed — only trivial compiler equivalence assigns it', () => {
  const classified = classifySurvivors([survivor('m1', { reached: true, observed_by: true, covered_inputs: 4, environment_matched: true })]);

  // Every rung of evidence can be present and the classification still stops at
  // `insufficient_oracle`: deciding equivalence needs the ladder, not an inference.
  assert.notEqual(classified.results[0].cause, 'equivalent');
});

// --- C003 invariant: a mutation score is never contract coverage -----------------

test('UT-11: a mutation score is never emitted as contract coverage', () => {
  const classified = classifySurvivors([survivor('m1')]);

  assert.equal(classified.mutation_score_claim, MUTATION_SCORE_CAVEAT);
  assert.match(classified.mutation_score_claim, /not a measure of contract coverage/i);
  assert.equal(classified.contract_coverage_proved, false);

  // No scalar a reader could mistake for a coverage figure is emitted at all.
  assert.equal('score' in classified, false);
  assert.equal('mutation_score' in classified, false);
  assert.equal('coverage' in classified, false);
});

test('UT-11: the oracle gap report carries the caveat in its text, not beside it', () => {
  const markdown = renderOracleGapReport({
    commit: null,
    mutationResultsSupplied: false,
    survivors: classifySurvivors([survivor('m1')]),
    unavailable: ['no mutation results were supplied to this run'],
  });

  assert.ok(markdown.includes(MUTATION_SCORE_CAVEAT));
  assert.match(markdown, /^## Oracle validity/m);
});

// --- UT-13 / UT-14: the ladder step is a required field -------------------------

test('UT-13: an equivalence claim without a ladder step is refused rather than serialised', () => {
  assert.throws(() => assertLadderClaimIsNamed({ verdict: 'equivalent' }), /no ladder step/);
  assert.throws(() => assertLadderClaimIsNamed({ ladder_step: 99, verdict: 'equivalent' }), /no ladder step/);
  assert.equal(findUnnamedEquivalenceClaims([{ verdict: 'equivalent' }]).length, 1);
  assert.throws(() => assertNoBareEquivalenceClaim([{ verdict: 'equivalent' }]), /no ladder step/);
  assert.doesNotThrow(() => assertNoBareEquivalenceClaim([{ verdict: 'equivalent', ladder_step: 1 }]));
});

test('UT-14: a rung-6 discard is distinguishable from a rung-1 discard', () => {
  const atRung1 = { verdict: 'equivalent', ladder_step: 1, mutant_id: 'm1' };
  const atRung6 = {
    verdict: 'equivalent',
    ladder_step: 6,
    mutant_id: 'm2',
    configuration_id: 'tree-sitter-rust@0.23.2',
    arithmetic_model: 'twos-complement-wrapping',
    evaluation_order: 'left-to-right',
  };

  const rendered1 = renderLadderClaim(atRung1);
  const rendered6 = renderLadderClaim(atRung6);
  assert.notEqual(rendered1, rendered6);
  assert.match(rendered1, /text identical/i);
  assert.match(rendered6, /no test/i);
  assert.match(rendered6, /twos-complement-wrapping/);
});

test('UT-15: reaching rung four or beyond without a named configuration is refused', () => {
  assert.throws(
    () => assertLadderClaimIsNamed({ verdict: 'equivalent', ladder_step: 4 }),
    /configuration_id/,
  );
  assert.throws(
    () => assertLadderClaimIsNamed({ verdict: 'equivalent', ladder_step: 5, configuration_id: 'c' }),
    /arithmetic_model/,
  );
  assert.throws(
    () => assertLadderClaimIsNamed({
      verdict: 'equivalent',
      ladder_step: 5,
      configuration_id: 'c',
      arithmetic_model: 'twos-complement-wrapping',
    }),
    /evaluation_order/,
  );
  assert.doesNotThrow(() => assertLadderClaimIsNamed({
    verdict: 'equivalent',
    ladder_step: 4,
    configuration_id: 'tree-sitter-rust@0.23.2',
    arithmetic_model: 'twos-complement-wrapping',
    evaluation_order: 'left-to-right',
  }));
});

// --- UT-12: the normaliser is language-appropriate -------------------------------

test('UT-12: every declared target language has a normaliser and a named configuration', () => {
  for (const language of TARGET_LANGUAGES) {
    assert.ok(GRAMMAR_BY_LANGUAGE[language], `no grammar is declared for ${language}`);
    const configuration = tceConfigurationFor(language);
    assert.equal(configuration.language, language);
    assert.equal(typeof configuration.configuration_id, 'string');
    assert.match(configuration.configuration_id, /@/, 'a configuration names a pinned tool, not a bare name');
    assert.equal(configuration.comments, 'stripped', 'the comment policy is recorded rather than left to the printer');
  }
  assert.throws(() => tceConfigurationFor('cobol'), /no TCE normaliser/);
});

test('UT-12: the tree-sitter normaliser makes a comment-only change identical and a code change not', () => {
  const original = 'pub fn parse(n: u32) -> u32 {\n    // the guard matters\n    n + 1\n}\n';
  const commentOnly = 'pub fn parse(n: u32) -> u32 {\n    /* rewritten comment */\n    n + 1\n}\n';
  const changed = 'pub fn parse(n: u32) -> u32 {\n    n + 2\n}\n';

  const normalisedOriginal = normaliseForComparison(original, 'rust');
  assert.equal(typeof normalisedOriginal, 'string');
  assert.equal(normaliseForComparison(commentOnly, 'rust'), normalisedOriginal);
  assert.notEqual(normaliseForComparison(changed, 'rust'), normalisedOriginal);
});

test('UT-12: a mutant the normaliser cannot decide is retained rather than discarded', () => {
  const mutants = [
    survivor('m-same', { original: 'let x = 1;', mutated: 'let x = 1;' }),
    survivor('m-renamed', { original: 'let total = 1;', mutated: 'let sum = 1;' }),
  ];

  const decided = discardEquivalentMutants(mutants, { normaliser: () => null });
  assert.equal(decided.discarded.length, 1, 'the identical text is discarded at rung one');
  assert.equal(decided.discarded[0].ladder_step, 1);
  assert.equal(decided.survivors.length, 1, 'the undecidable one stays');
  assert.equal(decided.survivors[0].mutant_id, 'm-renamed');
  assert.equal(decided.survivors[0].cause, 'unclassified');
});

test('UT-12 and UT-13: a rung-three discard names its configuration, and the ladder never claims more', () => {
  const normaliser = () => 'normalised-form';
  const mutants = [survivor('m-whitespace', { original: 'a  b', mutated: 'a b', language: 'rust' })];

  const decided = discardEquivalentMutants(mutants, { normaliser });
  assert.equal(decided.discarded.length, 1);
  assert.equal(decided.discarded[0].ladder_step, 2, 'whitespace alone is rung two, not rung three');
  assert.equal(decided.discarded[0].verdict, 'equivalent');

  const atRung3 = discardEquivalentMutants([survivor('m-ast', { original: 'x', mutated: 'y' })], { normaliser });
  assert.equal(atRung3.discarded[0].ladder_step, 3);
  assert.equal(typeof atRung3.discarded[0].configuration_id, 'string');
  assertNoBareEquivalenceClaim(decided.discarded);
});

test('the ladder stops at rung three and reports the rest as unknown', () => {
  const outcome = applyComparisonLadder({ original: 'fn a() {}', mutated: 'fn b() {}', language: 'rust', normaliser: () => null });

  assert.equal(outcome.ladder_step, UNKNOWN_LADDER_STEP);
  assert.equal(outcome.verdict, 'unknown');
  assert.equal('equivalent' in outcome, false);
});

test('UT-12: rung two compares tokens, not collapsed text, so a literal is never normalised away', () => {
  // Collapsing whitespace in the *text* would also collapse it inside a string
  // literal, and `"hello world"` and `"hello  world"` would be reported as the
  // same token sequence. That is a false equivalence: it discards a mutant and
  // manufactures a clean result, which is the failure this stage exists to stop.
  const inLiteral = discardEquivalentMutants([{
    mutant_id: 'm-literal',
    language: 'rust',
    status: 'survived',
    original: 'pub fn greet() -> &\'static str { "hello world" }',
    mutated: 'pub fn greet() -> &\'static str { "hello  world" }',
  }], { normaliser: () => null });

  assert.equal(inLiteral.discarded.length, 0, 'whitespace inside a literal is a different program');
  assert.equal(inLiteral.survivors.length, 1);

  // Whitespace *between* tokens is still rung two.
  const betweenTokens = discardEquivalentMutants([{
    mutant_id: 'm-spacing',
    language: 'rust',
    status: 'survived',
    original: 'pub fn f() -> u32 { 1 }',
    mutated: 'pub fn f()  ->  u32  {  1  }',
  }], { normaliser: () => null });

  assert.equal(betweenTokens.discarded.length, 1);
  assert.equal(betweenTokens.discarded[0].ladder_step, 2);
});

test('UT-12: a mutant whose texts were never supplied is kept, not called byte-identical', () => {
  // Defaulting an absent text to the empty string turns "no evidence" into
  // "positively equivalent" and silently discards every survivor a producer left
  // unfilled — the exact inversion of the invariant that an undecided mutant stays.
  const kept = discardEquivalentMutants([{ mutant_id: 'm-no-text', language: 'rust', status: 'survived' }]);

  assert.equal(kept.discarded.length, 0);
  assert.equal(kept.survivors.length, 1);
  assert.equal(kept.survivors[0].cause, 'unclassified');
});

test('UT-12: a language with no declared normaliser is retained rather than aborting the stage', () => {
  // A corpus holding one file in an undeclared language must still have its
  // other mutants classified. Raising here would discard every one of them.
  const mixed = discardEquivalentMutants([
    { mutant_id: 'm-cobol', language: 'cobol', status: 'survived', original: 'a', mutated: 'b' },
    { mutant_id: 'm-rust', language: 'rust', status: 'survived', original: 'fn a() {}', mutated: 'fn a() {}' },
  ]);

  assert.equal(mixed.survivors.length, 1);
  assert.equal(mixed.survivors[0].mutant_id, 'm-cobol');
  assert.equal(mixed.survivors[0].cause, 'unclassified');
  assert.equal(mixed.discarded.length, 1, 'the Rust mutant is still compared');
});

test('m1: the unknown rung can never be the support for an equivalence claim', () => {
  assert.throws(
    () => assertLadderClaimIsNamed({ verdict: 'equivalent', ladder_step: UNKNOWN_LADDER_STEP }),
    /unknown rung/,
  );
  assert.equal(
    findUnnamedEquivalenceClaims([{ verdict: 'equivalent', ladder_step: UNKNOWN_LADDER_STEP }]).length,
    0,
    'it carries a rung, so the unnamed-claim scan is not what catches it',
  );
});

test('m4: the spans of a lineage are frozen, not only the lists holding them', () => {
  const lineage = buildExpansionLineage({
    origin_span: { file: 'src/ffi.rs', line: 12 },
    expansion_span: { file: 'build/bindings.rs', line: 440 },
    configuration_id: 'tree-sitter-rust@0.23.2',
    generator_identity: 'bindgen',
  });

  assert.equal(Object.isFrozen(lineage.origin), true);
  assert.equal(Object.isFrozen(lineage.expansion), true);
  assert.equal(Object.getOwnPropertyDescriptor(lineage.origin, 'file').writable, false);
  assert.equal(Object.isFrozen(lineage.expansion_spans[0]), true);
});

// --- UT-16 / UT-17: expansion lineage is many-to-many ----------------------------

test('UT-16: pre-expansion and post-expansion forms are separate objects joined by spans', () => {
  const lineage = buildExpansionLineage({
    origin_span: { file: 'src/ffi.rs', line: 12 },
    expansion_span: { file: 'build/pjsua_bindings.rs', line: 440 },
    configuration_id: 'tree-sitter-rust@0.23.2',
    generator_identity: 'bindgen',
  });

  assert.notDeepEqual(lineage.origin, lineage.expansion);
  assert.equal(lineage.origin.file, 'src/ffi.rs');
  assert.equal(lineage.expansion.file, 'build/pjsua_bindings.rs');
  assert.equal(lineage.generator_identity, 'bindgen');

  // Asking for the source form never yields the expanded one.
  assert.equal(sourceFormOf(lineage), lineage.origin);
  assert.notEqual(sourceFormOf(lineage), lineage.expansion);
  assert.equal(countExpansionsOf(lineage), 1);
});

test('UT-17: a generator relation that is not one-to-one stays many-to-many', () => {
  const lineage = buildExpansionLineage({
    origin_span: { file: 'src/ffi.rs', line: 12 },
    expansion_span: [
      { file: 'build/bindings.rs', line: 440 },
      { file: 'build/bindings.rs', line: 512 },
      { file: 'build/raw.rs', line: 7 },
    ],
    configuration_id: 'tree-sitter-rust@0.23.2',
    generator_identity: 'bindgen',
  });

  // A macro call site and its expansion do not correspond one to one; forcing
  // them into a single mapping is how the lineage is silently lost.
  assert.equal(lineage.relation, 'one_to_many');
  assert.equal(countExpansionsOf(lineage), 3);
  assert.notEqual(lineage.relation, 'one_to_one');
  assert.equal(Object.isFrozen(lineage.expansion_spans), true);

  const manyToMany = buildExpansionLineage({
    origin_span: [{ file: 'src/a.rs', line: 1 }, { file: 'src/b.rs', line: 2 }],
    expansion_span: [{ file: 'build/x.rs', line: 1 }, { file: 'build/y.rs', line: 2 }],
    configuration_id: 'tree-sitter-rust@0.23.2',
    generator_identity: 'build.rs',
  });
  assert.equal(manyToMany.relation, 'many_to_many');
});

test('buildExpansionLineage refuses a relation with no generator or no configuration', () => {
  assert.throws(
    () => buildExpansionLineage({ origin_span: { file: 'a', line: 1 }, expansion_span: { file: 'b', line: 1 }, configuration_id: 'c' }),
    /generator_identity/,
  );
  assert.throws(
    () => buildExpansionLineage({ origin_span: { file: 'a', line: 1 }, expansion_span: { file: 'b', line: 1 }, generator_identity: 'g' }),
    /configuration_id/,
  );
});
