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
