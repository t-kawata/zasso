// @verifies C003
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
// R6.5's reverse edge: a counterexample reaches back into the claim ledger and
// retracts or splits the claim it bears on. The ledger would otherwise only ever
// accumulate, and a counterexample that changed nothing would be a falsification
// that died on arrival (ABOUT-REVERSE 6.10.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COUNTEREXAMPLE_CAVEAT,
  COUNTEREXAMPLE_FIELDS,
  OBSERVED_RED,
  REVISIONS,
  applyCounterexample,
  applyCounterexamples,
  renderCounterexampleReport,
} from '../../../.claude/scripts/workspacify-reverse/lib/counterexample.mjs';

// --- Fixtures -------------------------------------------------------------------

/** A ledger in the shape R3.5 emits, reduced to what the reverse edge reads. */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function ledgerWith(...claimIds) {
  return {
    root: '/tmp/subject',
    claims: claimIds.map((claim_id, index) => ({
      claim_id,
      subjectKind: 'invariant',
      claim_type: 'inferred',
      statement: `the condition asserted at src/api/login.rs:${index + 3} holds`,
      evidence: [{ evidence_id: `ev-impl-src_api_login.rs-${index + 3}`, source_span: { file: 'src/api/login.rs', line: index + 3 } }],
      falsification: `mutate the asserted condition at src/api/login.rs:${index + 3} and observe whether any test fails`,
    })),
    candidates: [
      { candidate_id: `cand-${claimIds[0]}`, classification: 'candidate', requires_human_approval: true, source_span: { file: 'src/api/login.rs', line: 3 } },
    ],
  };
}

const LEDGER = ledgerWith('clm-login-invariant-3', 'clm-login-invariant-7');

/** A counterexample as the plan's execution would report it. */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function counterexampleFor({ claim_id = 'clm-login-invariant-3', observed = OBSERVED_RED, narrowed_to = null } = {}) {
  const record = {
    counterexample_plan_id: 'cxp-login-mutation-3',
    claim_id,
    observed,
    observation: `the assertion at src/api/login.rs:3 did not fire when user was the empty string`,
  };
  return narrowed_to === null ? record : { ...record, narrowed_to };
}

// --- The vocabulary -------------------------------------------------------------

test('C003 precondition: a counterexample names the four fields the contract needs', () => {
  assert.deepEqual(
    [...COUNTEREXAMPLE_FIELDS].sort(),
    ['claim_id', 'counterexample_plan_id', 'observation', 'observed'],
  );
  assert.equal(Object.isFrozen(COUNTEREXAMPLE_FIELDS), true);
});

test('C003 precondition: a counterexample missing its claim is refused rather than applied to nothing', () => {
  const { claim_id: _omitted, ...withoutClaim } = counterexampleFor();

  assert.throws(() => applyCounterexample(withoutClaim, LEDGER), /claim_id/);
  assert.throws(() => applyCounterexample(counterexampleFor(), null), /ledger/);
});

// --- The reverse edge -----------------------------------------------------------

test('C003 postcondition: applying a counterexample retracts or splits the claim it bears on', () => {
  const after = applyCounterexample(counterexampleFor(), LEDGER);

  const touched = after.claims.find((claim) => claim.claim_id === 'clm-login-invariant-3');
  assert.ok(REVISIONS.includes(touched.revision), `expected retracted or split, got ${touched.revision}`);
  assert.equal(touched.revised_by, 'cxp-login-mutation-3');

  const untouched = after.claims.filter((claim) => claim.claim_id !== 'clm-login-invariant-3');
  assert.equal(untouched.length, 1);
  assert.equal(untouched.every((claim) => claim.revision === undefined), true, 'a counterexample reaches only the claim it bears on');
  assert.deepEqual(after.revisions.map((revision) => revision.claim_id), ['clm-login-invariant-3']);
});

test('C003 postcondition: a counterexample that names what survives splits the claim', () => {
  const after = applyCounterexample(counterexampleFor({ narrowed_to: 'the condition holds for a non-empty user' }), LEDGER);

  assert.equal(after.revisions[0].revision, 'split');
  assert.equal(after.claims.length, LEDGER.claims.length + 1, 'a split adds the part that survived');
  const survivor = after.claims.at(-1);
  assert.equal(survivor.statement, 'the condition holds for a non-empty user');
  assert.equal(survivor.split_from, 'clm-login-invariant-3');
  assert.equal(survivor.revised_by, 'cxp-login-mutation-3');
});

test('UT: the reverse edge never mutates the ledger it was given', () => {
  const before = JSON.stringify(LEDGER);
  applyCounterexample(counterexampleFor(), LEDGER);

  assert.equal(JSON.stringify(LEDGER), before, 'the ledger is a value, and the revision is a new one');
  assert.equal(LEDGER.claims.some((claim) => claim.revision !== undefined), false);
});

test('UT: the reverse edge leaves a claim that no counterexample names untouched', () => {
  const after = applyCounterexample(counterexampleFor({ claim_id: 'clm-login-invariant-7' }), LEDGER);

  const untouched = after.claims.find((claim) => claim.claim_id === 'clm-login-invariant-3');
  assert.equal(untouched.revision, undefined);
  assert.equal(untouched.revised_by, undefined);
  assert.deepEqual(after.revisions.map((revision) => revision.claim_id), ['clm-login-invariant-7']);
});

test('UT: a counterexample naming a claim the ledger does not hold is an error, not a silent no-op', () => {
  assert.throws(
    () => applyCounterexample(counterexampleFor({ claim_id: 'clm-absent-1' }), LEDGER),
    /clm-absent-1/,
    'a revision that reached nothing must not read as a revision that was applied',
  );
});

// --- The invariant --------------------------------------------------------------

test('C003 invariant: a red failure is never automatically concluded to be a specification error', () => {
  const after = applyCounterexample(counterexampleFor(), LEDGER);
  const serialised = JSON.stringify(after);

  for (const verdict of ['specification_error', 'spec_error', 'bug_confirmed', 'implementation_wrong', 'contract_violated', 'defect']) {
    assert.equal(serialised.includes(verdict), false, `the ledger must not assert ${verdict}`);
  }
  assert.equal(after.verdict, null);
  assert.equal(Object.hasOwn(after, 'verdict_set_by'), false);
});

test('C003 invariant: the revision carries the observation forward, and nothing more', () => {
  const after = applyCounterexample(counterexampleFor(), LEDGER);
  const revision = after.revisions[0];

  assert.deepEqual(revision.counterexample, {
    observed: OBSERVED_RED,
    observation: 'the assertion at src/api/login.rs:3 did not fire when user was the empty string',
  });
  assert.equal(revision.counterexample_plan_id, 'cxp-login-mutation-3');
  assert.equal(Object.hasOwn(revision, 'conclusion'), false);
});

// --- Boundary -------------------------------------------------------------------

test('UT-6: a counterexample whose red cannot be observed is reported, never counted as a falsification', () => {
  const result = applyCounterexamples([counterexampleFor({ observed: 'unobservable' })], LEDGER);

  assert.equal(result.unobservable.length, 1);
  assert.equal(result.unobservable[0].claim_id, 'clm-login-invariant-3');
  assert.ok(result.unobservable[0].reason.length > 0);
  assert.deepEqual(result.applied, []);
  assert.equal(result.ledger.revisions.length, 0, 'an unobserved red revises nothing');
  assert.equal(result.ledger.claims.some((claim) => claim.revision !== undefined), false);
});

test('UT-7: an empty counterexample set is reported as empty', () => {
  const result = applyCounterexamples([], LEDGER);

  assert.equal(result.empty, true);
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.unobservable, []);
  assert.equal(result.ledger.revisions.length, 0);
  assert.ok(result.caveat.length > 0);
});

test('UT: a set of counterexamples applies one edge per claim it names', () => {
  const result = applyCounterexamples(
    [counterexampleFor({ claim_id: 'clm-login-invariant-3' }), counterexampleFor({ claim_id: 'clm-login-invariant-7' })],
    LEDGER,
  );

  assert.equal(result.empty, false);
  assert.equal(result.applied.length, 2);
  assert.equal(result.ledger.revisions.length, 2);
  assert.deepEqual(
    [...result.ledger.revisions.map((revision) => revision.claim_id)].sort(),
    ['clm-login-invariant-3', 'clm-login-invariant-7'],
  );
});

test('UT: a refusal whose claim is unobservable is not reported as a successful falsification', () => {
  const result = applyCounterexamples([counterexampleFor({ observed: 'no_red' })], LEDGER);

  assert.equal(result.applied.length, 0, 'observing no red is not a falsification');
  assert.equal(result.unobservable.length, 1);
  assert.match(result.unobservable[0].reason, /not a falsification/);
});

test('C003: the reverse edge renders as Markdown an AI reads', () => {
  const result = applyCounterexamples([counterexampleFor()], LEDGER);
  const report = renderCounterexampleReport(result);

  assert.match(report, /^## Counterexamples/m);
  assert.ok(report.includes(COUNTEREXAMPLE_CAVEAT));
  assert.equal(report.includes('{"'), false);
});
