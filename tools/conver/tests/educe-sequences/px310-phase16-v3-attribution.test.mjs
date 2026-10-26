// [::TICKET::] PX-310 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-310 --for-spec --no-implementation-order`.
// A v3 artifact carries the typed step contract, so deleting it is the mutation
// `step-carries-four-fields` exists to catch. Shape validation must not pre-empt that
// check: an unattributable mutation is a check the falsifier cannot prove, and phase 16
// then refuses a v3 run that is otherwise complete.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { checkAll } from '../../.claude/scripts/educe-sequences/rail/engine.mjs';
import { COUNTER_MUTATION_CORPUS, SPEC_MUTATION_CORPUS, runCase } from '../../.claude/scripts/educe-sequences/rail/harness.mjs';
import {
  readArtifactSchema,
  readSpecification,
  validateArtifactShape,
} from '../../.claude/scripts/educe-sequences/rail/load.mjs';

const FIXTURE_ROOT = new URL('./fixtures/spec/', import.meta.url).pathname;
const spec = readSpecification(`${FIXTURE_ROOT}ledger.md`);
const golden = JSON.parse(readFileSync(`${FIXTURE_ROOT}ledger-sequences.json`, 'utf8'));

const EMPTY_CONTRACT = Object.freeze({
  pre: [],
  post: [],
  invariants: [],
  consumes: [],
  produces: [],
  errors: [],
  crosses: [],
});

/** The v2 golden artifact, promoted to the v3 shape without changing its readings. */
// [::TICKET::] PX-310 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-310 --for-spec --no-implementation-order`.
function v3Golden() {
  const artifact = structuredClone(golden);
  artifact.schema_version = 3;
  artifact.steps = artifact.steps.map((step) => ({ ...step, contract: structuredClone(EMPTY_CONTRACT) }));
  artifact.operations = artifact.operations.map((operation) => ({ ...operation, registry_contribution: 'required' }));
  return artifact;
}

test('PX-310 a v3 artifact carrying a typed contract is shape-valid', () => {
  assert.deepEqual(validateArtifactShape(v3Golden(), readArtifactSchema()), []);
});

test('PX-310 deleting a v3 step contract reddens step-carries-four-fields, not artifact-shape', () => {
  const testCase = SPEC_MUTATION_CORPUS.find((candidate) => candidate.name === 'step-loses-its-contract');
  const outcome = runCase(testCase, { artifact: v3Golden(), specLines: spec.lines, fixtureRoot: FIXTURE_ROOT });

  assert.equal(outcome.red, true);
  assert.equal(outcome.attributable, true, outcome.reason);
  assert.equal(outcome.reddenedCheck, 'step-carries-four-fields');
});

test('PX-310 a v3 counter-mutation rewrites prose without reddening correct work', () => {
  const counter = COUNTER_MUTATION_CORPUS.find((candidate) => candidate.name === 'step-order-preserved-fields-rewritten');
  const outcome = runCase(counter, { artifact: v3Golden(), specLines: spec.lines, fixtureRoot: FIXTURE_ROOT });

  assert.equal(outcome.red, false, outcome.reason);
  assert.equal(outcome.counterGreen, true);
});

test('PX-310 a null v3 step contract is missing, so the declared check owns it', () => {
  const artifact = v3Golden();
  artifact.steps[0].contract = null;
  const { verdicts } = checkAll({ specLines: spec.lines, artifact, recorded: {} });

  assert.equal(verdicts.some((verdict) => verdict.check === 'step-carries-four-fields'), true);
});
