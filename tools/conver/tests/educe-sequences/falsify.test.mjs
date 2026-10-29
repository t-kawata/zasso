// The two-sided harness (PX-240, contract C005).
//
// A check is trusted only after both directions have been run: a mutation of the
// subject must redden the check it names, for a reason attributable to that check, and
// a counter-mutation on correct work must stay green. The corpus works on copies and
// the harness digests the tree anyway, because asserting restoration from a copy would
// be asserting the implementation's own claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { COUNTER_MUTATION_CORPUS, SPEC_MUTATION_CORPUS, digestOfTree, runCase } from '../../.claude/scripts/educe-sequences/rail/harness.mjs';
import { evaluateGate } from '../../.claude/scripts/educe-sequences/rail/gates.mjs';
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
import { buildContext } from '../../.claude/scripts/educe-sequences/rail/phases.mjs';
import { suppliedDocumentsOf } from '../../.claude/scripts/educe-sequences/rail/supplied.mjs';
// [::TICKET::] PX-241 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-241 --for-spec --no-implementation-order`.

const FIXTURE_ROOT = new URL('./fixtures/spec/', import.meta.url).pathname;
const spec = readSpecification(new URL('./fixtures/spec/ledger.md', import.meta.url).pathname);
const golden = JSON.parse(readFileSync(new URL('./fixtures/spec/ledger-sequences.json', import.meta.url), 'utf8'));

// This artifact borrows no census, so it is judged without material and the corpus below is
// correct as it stands. That is also why the corpus could not see the omission the PX-267
// section covers: a material-free artifact is the one case where handing the harness nothing
// looks the same as handing it what the run read.
const context = () => ({ artifact: golden, specLines: spec.lines, fixtureRoot: FIXTURE_ROOT });

test('C005 every mutation reddens the check it names, for an attributable reason', () => {
  for (const testCase of SPEC_MUTATION_CORPUS) {
    const outcome = runCase(testCase, context());

    assert.equal(outcome.red, true, `${testCase.name} left the run green`);
    assert.equal(outcome.attributable, true, `${testCase.name}: ${outcome.reason}`);
    assert.equal(outcome.reddenedCheck, testCase.check, testCase.name);
    assert.equal(outcome.reason, null, testCase.name);
  }
});

test('C005 the corpus restores the tree it reads, so it can be run twice', () => {
  const before = digestOfTree(FIXTURE_ROOT);
  for (const testCase of SPEC_MUTATION_CORPUS) {
    assert.equal(runCase(testCase, context()).restored, true, testCase.name);
  }
  assert.equal(digestOfTree(FIXTURE_ROOT), before);
});

test('C005 every counter-mutation leaves the run green', () => {
  for (const counter of COUNTER_MUTATION_CORPUS) {
    const outcome = runCase(counter, context());

    assert.equal(outcome.red, false, `${counter.name} reddened correct work — the rule is defective, not the subject`);
    assert.equal(outcome.counterGreen, true);
  }
});

test('C005 a case whose named check never fired is reported as carrying no verdict', () => {
  const outcome = runCase({ name: 'identity', check: 'predicate-pin-rederives', mutate: ({ artifact, specLines }) => ({ artifact, specLines }) }, context());

  assert.equal(outcome.red, false);
  assert.equal(outcome.attributable, false);
  assert.equal(outcome.reason, 'no-verdict-for-the-named-check');
});

// ---------------------------------------------------------------------------
// C007 — the corpus selects its subjects by structure, not by the fixture's names
// ---------------------------------------------------------------------------

/** The golden artifact with its operation vocabulary renamed away from the fixture's. */
// [::TICKET::] PX-246 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-246 --for-spec --no-implementation-order`.
function renamedVocabulary() {
  const renamed = structuredClone(golden);
  const rename = new Map([['Admit', 'ZenithAdmit'], ['Settle', 'ZenithSettle']]);
  for (const step of renamed.steps) step.operation = rename.get(step.operation) ?? step.operation;
  for (const operation of renamed.operations) operation.id = rename.get(operation.id) ?? operation.id;
  return renamed;
}

test('C007 every case runs over an artifact whose vocabulary is none of the fixture\'s', () => {
  const renamed = renamedVocabulary();
  assert.equal(renamed.operations.some((operation) => operation.id === 'Admit'), false, 'the rename reached the operations');

  for (const testCase of [...SPEC_MUTATION_CORPUS, ...COUNTER_MUTATION_CORPUS]) {
    // A case that names a row the artifact does not have cannot run at all, which is how
    // phase 16 was unrunnable on a specification whose operations are named otherwise.
    assert.doesNotThrow(
      () => runCase(testCase, { artifact: renamed, specLines: spec.lines, fixtureRoot: FIXTURE_ROOT }),
      `${testCase.name} could not run over a differently named artifact`,
    );
  }
});

test('C007 the mutation still reddens its own check and the counter-mutation still stays green over that artifact', () => {
  const renamed = renamedVocabulary();
  const context = { artifact: renamed, specLines: spec.lines, fixtureRoot: FIXTURE_ROOT };

  for (const testCase of SPEC_MUTATION_CORPUS) {
    const outcome = runCase(testCase, context);
    assert.equal(outcome.red, true, `${testCase.name} left the run green`);
    assert.equal(outcome.attributable, true, `${testCase.name}: ${outcome.reason}`);
  }
  for (const counter of COUNTER_MUTATION_CORPUS) {
    const outcome = runCase(counter, context);
    assert.equal(outcome.red, false, `${counter.name} reddened a run that is correct: ${outcome.reason}`);
  }
});

test('C007 the counter-mutation runs over an artifact that binds a single step to an operation', () => {
  // A small specification is not a special case. A counter-mutation that needs two bound
  // steps is a case that cannot run on such a document, and a case that cannot run is a
  // phase that cannot finish.
  const small = structuredClone(golden);
  small.steps = small.steps.slice(0, 1);
  const counter = COUNTER_MUTATION_CORPUS.find((testCase) => testCase.name === 'step-rebound-to-another-declared-operation');

  // The property the case exists for is that the relation is unchanged and the vocabulary
  // is not: a run over the mutation is not evidence about anything the check is not asking.
  let mutated = null;
  assert.doesNotThrow(() => {
    mutated = counter.mutate({ artifact: structuredClone(small), specLines: spec.lines }).artifact;
  });

  const declared = new Set(mutated.operations.map((operation) => operation.id));
  assert.equal(mutated.steps.every((step) => declared.has(step.operation)), true, 'every step still names a declared operation');
  assert.equal(mutated.steps.every((step, index) => step.sequence === small.steps[index].sequence), true, 'and every step still belongs to the entry it did');
  assert.equal(mutated.operations.some((operation) => operation.id === 'Admit'), false, 'the vocabulary differs from the fixture\'s');
  assert.equal(mutated.steps[0].operation !== small.steps[0].operation, true, 'and it is not the same run as the input');
});

// ---------------------------------------------------------------------------
// PX-267 — the harness judges the mutated artifact with the material the run read
// ---------------------------------------------------------------------------
//
// A census is re-derived from the supplied file it was read from, so `checkAll` cannot
// judge an artifact that borrows one without being handed the material. The falsification
// harness was the one caller that did not hand it over, which made the baseline red for
// every artifact that borrows a census: each counter-mutation then "reddened correct work",
// and the gate refused with the rule blamed instead of the subject. The golden fixture the
// corpus was written against borrows nothing, so nothing covered the omission until a run
// over a specification that does.

const CENSUS_ROOT = new URL('./fixtures/census/', import.meta.url).pathname;
const censusSpec = readSpecification(`${CENSUS_ROOT}ledger.md`);
const censusGolden = JSON.parse(readFileSync(`${CENSUS_ROOT}ledger-sequences.json`, 'utf8'));
const CENSUS_SUPPLIED = suppliedDocumentsOf(`${CENSUS_ROOT}educe-sequences`);

/** What a run that borrowed a census hands the harness: the artifact and the material. */
const censusContext = () => ({
  artifact: censusGolden,
  specLines: censusSpec.lines,
  fixtureRoot: CENSUS_ROOT,
  recorded: { supplied: CENSUS_SUPPLIED },
});

test('PX-267 an artifact that borrows a census is not red before anything is mutated', () => {
  const identity = { name: 'identity', check: 'predicate-pin-rederives', mutate: ({ artifact, specLines }) => ({ artifact, specLines }) };

  const judged = runCase(identity, censusContext());
  assert.equal(judged.red, false, `the census the run read is beside it: ${judged.reason}`);

  // Without the material the census pin refuses, which is why the harness has to be given it.
  const withoutMaterial = runCase(identity, { artifact: censusGolden, specLines: censusSpec.lines, fixtureRoot: CENSUS_ROOT });
  assert.equal(withoutMaterial.red, true);
  assert.equal(withoutMaterial.reddenedCheck, 'source-enumeration-pin-rederives');
});

test('PX-267 every mutation reddens the check it names over an artifact that borrows a census', () => {
  for (const testCase of SPEC_MUTATION_CORPUS) {
    const outcome = runCase(testCase, censusContext());

    assert.equal(outcome.red, true, `${testCase.name} left the run green`);
    assert.equal(outcome.attributable, true, `${testCase.name}: ${outcome.reason}`);
    assert.equal(outcome.reddenedCheck, testCase.check, testCase.name);
  }
});

test('PX-267 every counter-mutation stays green over an artifact that borrows a census', () => {
  for (const counter of COUNTER_MUTATION_CORPUS) {
    const outcome = runCase(counter, censusContext());

    assert.equal(outcome.red, false, `${counter.name} reddened correct work — the rule is defective, not the subject`);
    assert.equal(outcome.counterGreen, true);
  }
});

test('PX-267 phase 16 hands the harness the material the run recorded', () => {
  const ctx = buildContext({
    specPath: `${CENSUS_ROOT}ledger.md`,
    spec: censusSpec,
    run: { directory: `${CENSUS_ROOT}educe-sequences`, status: {} },
  });

  const verdict = evaluateGate(16, ctx);

  assert.equal(verdict.ok, true, verdict.reason);
  assert.match(verdict.reason, /counter-mutation\(s\) green/);
});
