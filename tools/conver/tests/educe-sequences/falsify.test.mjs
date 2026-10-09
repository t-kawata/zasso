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
import { readSpecification } from '../../.claude/scripts/educe-sequences/rail/load.mjs';
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.

const FIXTURE_ROOT = new URL('./fixtures/spec/', import.meta.url).pathname;
const spec = readSpecification(new URL('./fixtures/spec/ledger.md', import.meta.url).pathname);
const golden = JSON.parse(readFileSync(new URL('./fixtures/spec/ledger-sequences.json', import.meta.url), 'utf8'));

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
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
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
