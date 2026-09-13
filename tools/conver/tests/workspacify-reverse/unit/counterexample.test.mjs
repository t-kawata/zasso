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
  OBSERVED_NO_RED,
  OBSERVED_RED,
  PASS_STATUSES,
  REASON_CODES,
  RED_VERDICTS,
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

/**
 * A counterexample as `runCounterexamples` records one that ran.
 *
 * The reverse edge reads a record rather than a bare observation, so that the
 * document can say what happened to every counterexample the stage received.
 */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function executedRecord({
  claim_id = 'clm-login-invariant-3',
  observed = OBSERVED_RED,
  observations = ['the assertion at src/api/login.rs:3 did not fire when user was the empty string'],
} = {}) {
  return {
    claim_id,
    counterexample_plan_id: 'cxp-login-mutation-3',
    invariant: 'mutate the asserted condition at src/api/login.rs:3',
    technique: 'mutation',
    carrier: 'src/api/login.rs:3',
    status: 'executed',
    verdict: observed === OBSERVED_RED ? 'not-proved' : 'proved',
    reason: null,
    detail: null,
    observed,
    observations,
    worktreeRecord: null,
  };
}

/** A counterexample the channel derived and nothing was offered to run. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function derivedEntry(claim_id = 'clm-login-invariant-3') {
  return {
    claim_id,
    counterexample_plan_id: 'cxp-login-mutation-3',
    invariant: 'mutate the asserted condition at src/api/login.rs:3',
    technique: 'mutation',
    carrier: 'src/api/login.rs:3',
  };
}

/** A counterexample a run refused, carrying the code from the declared vocabulary. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function refusedRecord({ claim_id = 'clm-login-invariant-3', reason = 'executor-missing' } = {}) {
  return {
    ...derivedEntry(claim_id),
    status: 'nothing-to-execute',
    verdict: null,
    reason,
    detail: 'the reason in words',
    observed: null,
    observations: [],
    worktreeRecord: null,
  };
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

test('UT-6: a counterexample that ran and produced no red carries proved, and revises nothing', () => {
  const result = applyCounterexamples([executedRecord({ observed: OBSERVED_NO_RED })], LEDGER);

  assert.equal(result.unobservable.length, 1);
  assert.equal(result.unobservable[0].claim_id, 'clm-login-invariant-3');
  assert.equal(result.unobservable[0].verdict, 'proved', 'the check stayed quiet, so the claim held');
  assert.ok(result.unobservable[0].reason.length > 0);
  assert.equal(result.applied.length, 1, 'the counterexample stays in the published set');
  assert.equal(result.applied[0].status, 'executed');
  assert.equal(result.ledger.revisions.length, 0, 'a red that was not observed revises nothing');
  assert.equal(result.ledger.claims.some((claim) => claim.revision !== undefined), false);
});

test('UT-7: an empty counterexample set is reported as empty', () => {
  const result = applyCounterexamples([], LEDGER);

  assert.equal(result.empty, true);
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.unobservable, []);
  assert.equal(result.ledger.revisions.length, 0);
  assert.ok(result.caveat.length > 0);
  assert.deepEqual(result.counts, { derivedCount: 0, executedCount: 0, refusedCount: 0, refusedByReason: { 'plan-id-missing': 0, 'executor-missing': 0, 'invalid-execution-result': 0 } });
});

test('UT: the emptiness of the plan and the emptiness of a stage that ran nothing read differently', () => {
  const emptyPlan = applyCounterexamples([], LEDGER);
  const allRefused = applyCounterexamples([derivedEntry('clm-login-invariant-3'), derivedEntry('clm-login-invariant-7')], LEDGER);

  assert.equal(emptyPlan.empty, true);
  assert.equal(allRefused.empty, false, 'the plan was not empty, so neither is the set');
  assert.equal(allRefused.counts.executedCount, 0);
  assert.equal(allRefused.counts.refusedCount, 2);
  assert.notEqual(renderCounterexampleReport(emptyPlan), renderCounterexampleReport(allRefused));
  assert.match(renderCounterexampleReport(emptyPlan), /the plan was empty/);
  assert.equal(/the plan was empty/.test(renderCounterexampleReport(allRefused)), false);
  assert.match(renderCounterexampleReport(allRefused), /refused/);
});

test('UT: a set of counterexamples applies one edge per claim it names', () => {
  const result = applyCounterexamples(
    [executedRecord({ claim_id: 'clm-login-invariant-3' }), executedRecord({ claim_id: 'clm-login-invariant-7' })],
    LEDGER,
  );

  assert.equal(result.empty, false);
  assert.equal(result.applied.length, 2);
  assert.equal(result.ledger.revisions.length, 2);
  assert.deepEqual(result.counts, { derivedCount: 2, executedCount: 2, refusedCount: 0, refusedByReason: { 'plan-id-missing': 0, 'executor-missing': 0, 'invalid-execution-result': 0 } });
  assert.deepEqual(
    [...result.ledger.revisions.map((revision) => revision.claim_id)].sort(),
    ['clm-login-invariant-3', 'clm-login-invariant-7'],
  );
});

test('UT: a counterexample nothing ran is refused with its reason and stays in the published set', () => {
  const result = applyCounterexamples([derivedEntry()], LEDGER);

  assert.equal(result.applied.length, 1, 'a refusal must not shrink the set and read as a counterexample never derived');
  assert.equal(result.applied[0].status, 'nothing-to-execute');
  assert.equal(result.applied[0].verdict, null, 'a refusal is not a result');
  assert.equal(result.applied[0].reason, 'executor-missing');
  assert.equal(result.counts.refusedCount, 1);
  assert.equal(result.counts.executedCount, 0);
  assert.equal(result.counts.derivedCount, 1);
  assert.equal(result.ledger.revisions.length, 0);
  assert.deepEqual(result.unobservable, [], 'a counterexample that never ran did not observe "no red" either');
});

test('UT: a refusal that is not a red failure is never rendered as a not-proved verdict', () => {
  const result = applyCounterexamples([refusedRecord({ reason: 'plan-id-missing' })], LEDGER);

  assert.equal(result.applied[0].verdict, null);
  assert.equal(result.applied[0].reason, 'plan-id-missing');
  assert.equal(result.counts.refusedByReason['plan-id-missing'], 1);
  assert.match(result.applied[0].detail, /reason in words/);
});

test('UT: a record carrying a verdict a refusal may not have is refused rather than published', () => {
  assert.throws(
    () => applyCounterexamples([{ ...refusedRecord(), verdict: 'not-proved' }], LEDGER),
    /verdict/,
    'a refusal rendered as a verdict turns "we could not test it" into "we tested it"',
  );
  assert.throws(() => applyCounterexamples([{ ...executedRecord(), status: 'ran' }], LEDGER), /status/);
  assert.throws(() => applyCounterexamples([{ ...executedRecord(), verdict: 'held' }], LEDGER), /verdict/);
  assert.throws(() => applyCounterexamples([{ ...executedRecord(), observed: 'maybe' }], LEDGER), /observation/);
  assert.throws(() => applyCounterexamples([{ ...refusedRecord(), reason: 'ran-out-of-time' }], LEDGER), /reason/);
});

test('C003: the reverse edge renders as Markdown an AI reads', () => {
  const result = applyCounterexamples([executedRecord()], LEDGER);
  const report = renderCounterexampleReport(result);

  assert.match(report, /^## Counterexamples/m);
  assert.ok(report.includes(COUNTEREXAMPLE_CAVEAT));
  assert.equal(report.includes('{"'), false);
  assert.match(report, /Counterexamples derived\*\*: 1/);
  assert.ok(RED_VERDICTS.includes(result.applied[0].verdict));
  assert.ok(PASS_STATUSES.includes(result.applied[0].status));
  assert.ok(REASON_CODES.length === 3, 'the reason vocabulary is exactly the three declared, and no fourth');
});
