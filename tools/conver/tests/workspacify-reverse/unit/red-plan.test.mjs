// @verifies C001
// @verifies C002
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
// R6 plans the red that an existing implementation never had, and R6.5 generates
// the properties that can break it. Planning and generation are separate so each
// can be tested without an environment that executes anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COUNTEREXAMPLE_TECHNIQUES,
  GAP_TECHNIQUE,
  ISOLATED_ENVIRONMENT,
  PLAN_REQUIRED_FIELDS,
  PRODUCTION_MARKERS,
  RED_PLAN_CAVEAT,
  TECHNIQUE_BY_SUBJECT_KIND,
  assertNoProductionTarget,
  buildCounterexamplePlanId,
  planRedReconstruction,
  renderRedReconstructionReport,
  selectTechnique,
} from '../../../.claude/scripts/workspacify-reverse/lib/red-reconstruction.mjs';
import {
  KNOWN_PROPERTY_CATEGORIES,
  NOT_GENERATED,
  ORACLE_INDEPENDENCE,
  PROPERTY_CATEGORY_IDS,
  classifyPropertyCandidate,
  generatePropertyTests,
  renderPropertyTestReport,
} from '../../../.claude/scripts/workspacify-reverse/lib/property-tests.mjs';
import { GAP_KINDS } from '../../../.claude/scripts/workspacify-reverse/lib/gaps.mjs';

// --- Fixtures -------------------------------------------------------------------

/**
 * One claim in the shape R3.5 emits, with only the fields a plan reads.
 *
 * The falsification text is R3.5's own, and it is what the expected red is read
 * from: a plan that invented its own expected red would be describing an
 * observation nobody recorded.
 */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function claimFor({ id = 'clm-login-invariant-3', kind = 'invariant', file = 'src/api/login.rs', line = 3 } = {}) {
  return {
    claim_id: id,
    subjectKind: kind,
    claim_type: 'inferred',
    scope: 'src/api',
    statement: `the condition asserted at ${file}:${line} holds`,
    evidence: [{ evidence_id: `ev-impl-${file}-${line}`, source_span: { file, line } }],
    falsification: `mutate the asserted condition at ${file}:${line} and observe whether any test fails`,
  };
}

/** A gap in the shape R5 emits. */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function gapFor({ id = 'gap-src/api/login.rs-absent_red-3', kind = 'absent_red', file = 'src/api/login.rs', line = 3 } = {}) {
  return { gap_id: id, kind, file, line, provenance: 'inferred', region: file, evidence: ['recorded by R5'], code: 'X' };
}

const SINGLE_CLAIM_LEDGER = Object.freeze({ claims: [claimFor()] });

/** An invariant carrying the category its semantic reading supplied. */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function invariantFor({ source_fact = 'src/model/codec.rs:12', category = 'parser_serialiser', proposition = 'the parse of a serialised value returns the original', oracle_independence = 'external_format_derived' } = {}) {
  return { proposition, kind: 'assert', source_fact, category, oracle_independence, scope: 'src/model' };
}

// --- The vocabulary -------------------------------------------------------------

test('C001 postcondition: the techniques are exactly the six the design names', () => {
  assert.deepEqual(
    [...COUNTEREXAMPLE_TECHNIQUES].sort(),
    ['differential', 'metamorphic', 'mutation', 'negative_test', 'property', 'trace_assertion'],
  );
  assert.equal(Object.isFrozen(COUNTEREXAMPLE_TECHNIQUES), true);
});

test('C001 postcondition: the plan schema is the eight fields the ticket names', () => {
  assert.deepEqual(
    [...PLAN_REQUIRED_FIELDS].sort(),
    ['claim_id', 'counterexample_plan_id', 'expected_red', 'oracle', 'reset', 'side_effects', 'target', 'technique'],
  );
  assert.equal(Object.isFrozen(PLAN_REQUIRED_FIELDS), true);
});

test('selectTechnique: every gap kind the design names has a technique or an explicit none', () => {
  for (const kind of GAP_KINDS) {
    assert.ok(kind in GAP_TECHNIQUE, `${kind} must be decided rather than defaulted`);
    const technique = GAP_TECHNIQUE[kind];
    assert.ok(
      technique === null || COUNTEREXAMPLE_TECHNIQUES.includes(technique),
      `${kind} maps to ${technique}, which is not in the technique vocabulary`,
    );
  }
  assert.equal(Object.isFrozen(GAP_TECHNIQUE), true);
});

test('UT-1: a claim selects the technique its own falsification describes', () => {
  assert.equal(selectTechnique(claimFor({ kind: 'invariant' })).technique, 'mutation');
  assert.equal(selectTechnique(claimFor({ kind: 'failure_contract' })).technique, 'negative_test');
  assert.equal(selectTechnique(claimFor({ kind: 'boundary_crossing' })).technique, 'trace_assertion');
  for (const kind of Object.keys(TECHNIQUE_BY_SUBJECT_KIND)) {
    assert.ok(COUNTEREXAMPLE_TECHNIQUES.includes(TECHNIQUE_BY_SUBJECT_KIND[kind]));
  }
});

test('UT-1: a gap at the claim\'s own anchor selects the technique the gap kind names', () => {
  const claim = claimFor({ kind: 'boundary_crossing', file: 'src/api/login.rs', line: 3 });
  const selected = selectTechnique(claim, { gaps: [gapFor({ kind: 'circular_reasoning' })] });

  assert.equal(selected.technique, 'differential');
  assert.equal(selected.basis, 'gap_kind');
  assert.equal(selected.gap_id, 'gap-src/api/login.rs-absent_red-3');
});

test('UT-1: a named mutation survivor selects the technique its cause names', () => {
  const claim = claimFor();
  const oracleGap = {
    survivors: {
      results: [{
        mutant_id: 'mut-1',
        cause: 'insufficient_oracle',
        source_span: { file: 'src/api/login.rs', line: 3 },
      }],
    },
  };
  const selected = selectTechnique(claim, { oracleGap });

  assert.equal(selected.technique, 'property');
  assert.equal(selected.basis, 'mutation_survivor_cause');
});

test('UT-4: a claim whose subject kind is not in the vocabulary is decided as none, with its reason', () => {
  const selected = selectTechnique(claimFor({ kind: 'unheard_of_kind' }));

  assert.equal(selected.technique, null);
  assert.match(selected.reason, /unheard_of_kind/);
  assert.equal(selected.basis, 'no_applicable_technique');
});

// --- Planning -------------------------------------------------------------------

test('C001 postcondition: every claim yields a plan naming all eight fields', () => {
  const ledger = { claims: [claimFor({ kind: 'invariant' }), claimFor({ id: 'clm-login-failure-9', kind: 'failure_contract', line: 9 })] };
  const plan = planRedReconstruction({ ledger });

  assert.equal(plan.stage, 'r6');
  assert.equal(plan.entries.length, ledger.claims.length);
  for (const entry of plan.entries) {
    for (const field of PLAN_REQUIRED_FIELDS) {
      assert.ok(field in entry, `${entry.claim_id} is missing ${field}`);
    }
    assert.ok(COUNTEREXAMPLE_TECHNIQUES.includes(entry.technique));
    assert.ok(Array.isArray(entry.side_effects));
    assert.equal(typeof entry.reset, 'string');
    assert.ok(entry.reset.length > 0, 'a plan without a reset cannot be run twice');
    assert.equal(typeof entry.oracle, 'string');
    assert.ok(entry.oracle.length > 0);
    assert.match(entry.counterexample_plan_id, /^cxp-/);
  }
  assert.deepEqual(plan.unassigned, []);
});

test('UT-8: a single claim with one technique is a valid plan', () => {
  const plan = planRedReconstruction({ ledger: SINGLE_CLAIM_LEDGER });

  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].claim_id, 'clm-login-invariant-3');
  assert.equal(plan.entries[0].technique, 'mutation');
  assert.equal(plan.unassigned.length, 0);
});

test('C001 invariant: no plan targets production state', () => {
  const plan = planRedReconstruction({ ledger: SINGLE_CLAIM_LEDGER });

  for (const entry of plan.entries) {
    assert.equal(entry.target.kind, ISOLATED_ENVIRONMENT);
    for (const marker of PRODUCTION_MARKERS) {
      assert.ok(!entry.target.ref.includes(marker), `${entry.counterexample_plan_id} must not name ${marker}`);
    }
  }
  assert.throws(() => assertNoProductionTarget({ target: { kind: ISOLATED_ENVIRONMENT, ref: 'production/cluster' } }), /production/);
  assert.throws(() => assertNoProductionTarget({ target: { kind: 'live_tree', ref: 'siprs-for-reverse/src' } }), /isolated environment/);
  assert.equal(assertNoProductionTarget({ target: { kind: ISOLATED_ENVIRONMENT, ref: 'worktree/siprs-for-reverse/src' } }), true);
});

test('UT-5: a plan that cannot execute in this environment is recorded, with its reason', () => {
  const plan = planRedReconstruction({ ledger: SINGLE_CLAIM_LEDGER });

  assert.equal(plan.environment.available, false);
  assert.equal(plan.environment.kind, ISOLATED_ENVIRONMENT);
  assert.ok(plan.environment.reason.length > 0);
  assert.equal(plan.environment.provided_by, 'P22-18');
  assert.equal(plan.entries[0].executable, false);
  assert.ok(plan.unavailable.length > 0);
  assert.ok(plan.unavailable.some((line) => /P22-19/.test(line)), 'the reason names the ticket that executes plans');
});

test('UT-4: a claim with no applicable technique is recorded rather than skipped', () => {
  const ledger = { claims: [claimFor({ kind: 'unheard_of_kind' })] };
  const plan = planRedReconstruction({ ledger });

  const entry = plan.entries[0];
  assert.equal(plan.entries.length, 1, 'the claim is still planned for, so the linkage to P22-16 is total');
  assert.equal(entry.technique, null);
  assert.ok(entry.reason.length > 0);
  assert.match(entry.counterexample_plan_id, /^cxp-/);

  // Absent is spelled one way. The two fields say the same thing about the same
  // entry, so a sentinel string beside a null would make a reader work out
  // whether the difference meant something.
  assert.equal(entry.oracle, null);
  assert.equal(entry.oracle_independence, null);

  assert.equal(plan.unassigned.length, 1);
  assert.equal(plan.unassigned[0].claim_id, 'clm-login-invariant-3');
  assert.match(plan.unassigned[0].reason, /unheard_of_kind/);
});

test('UT-11: the expected red is an observation, never a boolean', () => {
  const plan = planRedReconstruction({ ledger: SINGLE_CLAIM_LEDGER });
  const { expected_red: expected } = plan.entries[0];

  assert.equal(typeof expected, 'string');
  assert.notEqual(typeof expected, 'boolean');
  assert.ok(expected.length > 0, 'a plan that asserts nothing cannot satisfy the expected red');
  assert.match(expected, /observe whether/i, 'the expected red is what would be observed, not a verdict');
});

test('UT: the plan is byte-identical across runs', () => {
  const first = JSON.stringify(planRedReconstruction({ ledger: SINGLE_CLAIM_LEDGER }));
  const second = JSON.stringify(planRedReconstruction({ ledger: SINGLE_CLAIM_LEDGER }));

  assert.equal(first, second);
});

test('UT: the plan reports the implementation-derived oracles separately', () => {
  const plan = planRedReconstruction({ ledger: SINGLE_CLAIM_LEDGER });

  assert.ok('implementation_derived' in plan.oracle_independence_counts);
  assert.equal(
    plan.oracle_independence_counts.implementation_derived,
    1,
    'a mutation plan\'s oracle is the existing suite, which the implementation produced',
  );
  assert.ok(plan.oracle_independence_counts.caveat.length > 0);
});

test('UT: the counterexample plan id is stable and names the claim it bears on', () => {
  const claim = claimFor({ file: 'src/api/login.rs', line: 3 });

  assert.equal(buildCounterexamplePlanId(claim, 'mutation'), 'cxp-login-mutation-3');
  assert.equal(buildCounterexamplePlanId(claim, 'mutation'), buildCounterexamplePlanId(claim, 'mutation'));
  assert.notEqual(buildCounterexamplePlanId(claim, 'negative_test'), buildCounterexamplePlanId(claim, 'mutation'));
});

test('C001: the plan renders as Markdown an AI reads', () => {
  const plan = planRedReconstruction({ ledger: SINGLE_CLAIM_LEDGER });
  const report = renderRedReconstructionReport(plan);

  assert.equal(typeof report, 'string');
  assert.match(report, /^## Red reconstruction plan/m);
  assert.match(report, /isolated environment/i);
  assert.ok(report.includes(RED_PLAN_CAVEAT));
  assert.equal(report.includes('{"'), false, 'a report a reader decides from is not a JSON dump');
});

// --- Property generation --------------------------------------------------------

test('C002 postcondition: the categories are exactly the eight the ticket names, and each says what it refuses', () => {
  assert.deepEqual(
    [...PROPERTY_CATEGORY_IDS].sort(),
    [
      'boundary_guard', 'collection_transform', 'differential_comparison', 'encode_decode',
      'error_type', 'parser_serialiser', 'pure_function', 'state_transition',
    ],
  );
  assert.equal(PROPERTY_CATEGORY_IDS.length, KNOWN_PROPERTY_CATEGORIES.length);
  assert.equal(Object.isFrozen(KNOWN_PROPERTY_CATEGORIES), true);
  for (const category of KNOWN_PROPERTY_CATEGORIES) {
    assert.ok(category.generates.length > 0, `${category.id} must say what it generates`);
    assert.ok(category.never.length > 0, `${category.id} must say what it must not generate`);
  }
});

test('C002 postcondition: a categorised invariant yields a generated candidate', () => {
  const result = generatePropertyTests([invariantFor()]);

  assert.equal(result.generated.length, 1);
  assert.deepEqual(result.notGenerated, []);
  const property = result.generated[0];
  assert.ok(PROPERTY_CATEGORY_IDS.includes(property.property_origin.category));
  assert.match(property.property_origin.source_fact, /^src\/model\/codec\.rs:12$/);
  assert.equal(property.property_origin.status, 'generated_candidate');
  assert.equal(property.property_origin.requires_human_approval, true);
  assert.match(property.property_id, /^prop-/);
  assert.ok(property.body.length > 0, 'a property carries the check a PBT engine would run');
});

test('C002 invariant: an invariant outside the known categories is not generated and never verified', () => {
  const result = generatePropertyTests([
    { proposition: 'the tenancy routing rule holds for enterprise contracts', kind: 'assert', source_fact: 'src/api/tenant.rs:40', scope: 'src/api' },
    invariantFor(),
  ]);

  assert.equal(result.generated.length, 1);
  assert.equal(result.notGenerated.length, 1);
  const withheld = result.notGenerated[0];
  assert.equal(withheld.source_fact, 'src/api/tenant.rs:40');
  assert.equal(withheld.category, null);
  assert.equal(withheld.status, NOT_GENERATED);
  assert.ok(withheld.reason.length > 0);
  assert.equal('verified' in withheld, false, 'not generated is never recorded as verified');
});

test('UT-10: a property that could not be generated is never marked verified', () => {
  const result = generatePropertyTests([{ proposition: 'a rule nobody classified', kind: 'assert', source_fact: 'src/api/x.rs:1' }]);

  // Structural, not a search for a word: every field of every emitted record is
  // walked, so a field that claimed a verdict under a name nobody thought to
  // grep for fails this test rather than slipping through it.
  const verdictWords = /verif|pass|proved|proven|confirm/i;
  for (const record of [...result.generated, ...result.notGenerated, ...result.refused]) {
    for (const [field, value] of Object.entries(record)) {
      assert.equal(verdictWords.test(field), false, `${field} reads as a verdict on ${record.source_fact}`);
      if (typeof value === 'string') {
        assert.equal(verdictWords.test(value), false, `${field} carries a verdict word: ${value}`);
      }
    }
  }
  assert.equal(verdictWords.test(result.oracle_independence_counts.status ?? ''), false);
});

test('UT-15: a category outside the closed vocabulary is refused and recorded as not generated', () => {
  const result = generatePropertyTests([invariantFor({ category: 'business_rule' })]);

  assert.equal(result.generated.length, 0);
  assert.equal(result.notGenerated.length, 1);
  assert.match(result.notGenerated[0].reason, /business_rule/);
  assert.equal(result.notGenerated[0].status, NOT_GENERATED);
});

test('UT-13: every generated property names where its oracle came from', () => {
  const result = generatePropertyTests([invariantFor(), invariantFor({ source_fact: 'src/model/order.rs:7', oracle_independence: 'implementation_derived' })]);

  for (const property of result.generated) {
    const origin = property.property_origin;
    assert.match(origin.source_fact, /^[^:]+:\d+$/, 'the source fact is a file:line in the target');
    assert.ok(PROPERTY_CATEGORY_IDS.includes(origin.category));
    assert.ok(ORACLE_INDEPENDENCE.includes(origin.oracle_independence));
    assert.equal(origin.status, 'generated_candidate');
    assert.equal(origin.requires_human_approval, true);
  }
});

test('UT-14: implementation-derived oracles are emitted as candidates and never counted as correctness evidence', () => {
  const result = generatePropertyTests([
    invariantFor({ oracle_independence: 'external_format_derived' }),
    invariantFor({ source_fact: 'src/model/order.rs:7', oracle_independence: 'implementation_derived' }),
    invariantFor({ source_fact: 'src/model/legacy.rs:9', oracle_independence: 'implementation_reverse_engineered' }),
  ]);

  assert.equal(result.generated.length, 3);
  assert.equal(result.oracle_independence_counts.external_format_derived, 1);
  assert.equal(result.oracle_independence_counts.implementation_derived, 1);
  assert.equal(result.oracle_independence_counts.implementation_reverse_engineered, 1);
  assert.equal(result.oracle_independence_counts.strong, 1);
  assert.equal(result.oracle_independence_counts.weak, 2);
  assert.ok(result.oracle_independence_counts.caveat.length > 0);
  assert.equal(
    result.generated.every((property) => property.property_origin.status === 'generated_candidate'),
    true,
  );

  // The weak oracles must be structurally unable to reach the strong total, and
  // no record may present one as support: every field of every property origin
  // is walked rather than searched for a word.
  const corroboration = /corroborat|confirm|support|evidence/i;
  for (const property of result.generated) {
    for (const [field, value] of Object.entries(property.property_origin)) {
      assert.equal(corroboration.test(field), false, `${field} presents an oracle as support`);
      if (typeof value === 'string') {
        assert.equal(corroboration.test(value), false, `${field} presents an oracle as support: ${value}`);
      }
    }
    assert.equal(
      property.property_origin.oracle_independence_declared,
      true,
      'the fixture declared its oracle, and the record says so',
    );
  }
  assert.equal(
    result.oracle_independence_counts.strong + result.oracle_independence_counts.weak,
    result.generated.length,
    'every generated candidate is counted exactly once, in one of the two totals',
  );
});

test('UT-14: an undeclared oracle is recorded as the weakest one, never as a strong one', () => {
  const result = generatePropertyTests([{ proposition: 'the parse round-trips', kind: 'assert', source_fact: 'src/model/codec.rs:12', category: 'parser_serialiser' }]);

  assert.equal(result.generated[0].property_origin.oracle_independence, 'implementation_derived');
  assert.equal(result.generated[0].property_origin.oracle_independence_declared, false);
  assert.equal(result.oracle_independence_counts.strong, 0);
  assert.equal(result.oracle_independence_counts.weak, 1);
});

test('UT-14: an oracle independence outside the vocabulary is refused rather than defaulted', () => {
  assert.throws(
    () => generatePropertyTests([invariantFor({ oracle_independence: 'looks_about_right' })]),
    /looks_about_right/,
    'a typo must not silently become the weakest value and hide the drift it caused',
  );
});

test('UT-14: the oracle independence vocabulary is ordered strongest first', () => {
  assert.deepEqual(
    [...ORACLE_INDEPENDENCE],
    ['external_format_derived', 'differential', 'metamorphic', 'implementation_derived', 'implementation_reverse_engineered'],
  );
});

test('UT-16: each category refuses the thing the design says it must not generate', () => {
  const accepted = {
    parser_serialiser: 'the parse of a serialised value returns the original',
    boundary_guard: 'an empty input is rejected',
    pure_function: 'two calls with the same argument return the same value',
    collection_transform: 'the transformed collection has the same length as the input',
    encode_decode: 'decode(encode(x)) agrees with x',
    state_transition: 'the machine refuses a transition it does not declare',
    error_type: 'an unknown token yields the UnknownToken error variant',
    differential_comparison: 'the new backend agrees with the reference backend over the recorded range',
  };
  const refused = {
    parser_serialiser: 'the canonical form of a document is preserved',
    boundary_guard: 'the caller must never pass an empty slice',
    pure_function: 'a cached call returns identical output',
    collection_transform: 'the elements come back in insertion order',
    encode_decode: 'the representation is unique',
    state_transition: 'these are all the transitions the protocol permits',
    error_type: 'the error is the desirable API contract',
    differential_comparison: 'the implementation under test agrees with itself',
  };

  for (const category of PROPERTY_CATEGORY_IDS) {
    const good = classifyPropertyCandidate({ proposition: accepted[category], source_fact: 'src/a.rs:1', category });
    assert.equal(good.accepted, true, `${category} accepted example was refused: ${good.refused}`);
    assert.equal(good.category, category);
    assert.equal(good.refused, null);

    const bad = classifyPropertyCandidate({ proposition: refused[category], source_fact: 'src/a.rs:1', category });
    assert.equal(bad.accepted, false, `${category} refused example was accepted`);
    assert.equal(bad.category, category, 'a refused candidate still names the category it was offered for');
    assert.ok(bad.refused.length > 0, `${category} must say which clause of "never" it hit`);
  }
});

test('UT-17: the generator cannot set requires_human_approval to false', () => {
  const result = generatePropertyTests([invariantFor()]);
  assert.equal(result.generated[0].property_origin.requires_human_approval, true);

  assert.throws(
    () => generatePropertyTests([{ ...invariantFor(), requires_human_approval: false }]),
    /requires_human_approval/,
    'a caller may not weaken a candidate; the attempt fails rather than succeeding with a weakened record',
  );
});

test('C002: the refused candidate is not silently dropped', () => {
  const result = generatePropertyTests([
    invariantFor(),
    invariantFor({ source_fact: 'src/api/tenant.rs:40', proposition: 'the caller must never pass an empty tenant id', category: 'boundary_guard' }),
  ]);

  assert.equal(result.generated.length, 1);
  assert.equal(result.refused.length, 1);
  assert.equal(result.refused[0].status, 'refused');
  assert.match(result.refused[0].source_fact, /tenant\.rs:40/);
  assert.ok(result.refused[0].refused.length > 0);
});

test('UT: the generator refuses a proposition that cannot be falsified by any observation', () => {
  assert.throws(() => generatePropertyTests([{ proposition: '', kind: 'assert', source_fact: 'src/a.rs:1', category: 'pure_function' }]), /proposition/);
  assert.throws(() => generatePropertyTests('not-a-list'), /invariants/);
  assert.throws(() => generatePropertyTests([{ proposition: 'x holds', kind: 'assert', category: 'pure_function' }]), /source_fact/);
});

test('C002: the generated properties render as Markdown an AI reads', () => {
  const result = generatePropertyTests([invariantFor(), invariantFor({ source_fact: 'src/model/order.rs:7', oracle_independence: 'implementation_derived' })]);
  const report = renderPropertyTestReport(result);

  assert.match(report, /^## Generated properties/m);
  assert.ok(report.includes(result.oracle_independence_counts.caveat));
  assert.equal(report.includes('{"'), false);
});
