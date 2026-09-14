/**
 * R6.5's executor — the counterexample channel, from R6's plan to an observation.
 *
 * N2 measured `scope.mjs` handing R6.5 a **literal empty array**. The stage ran,
 * published a document, and falsified nothing: the input was manufactured empty
 * rather than derived, so `COUNTEREXAMPLE-RESULTS.json` read as a result over a
 * plan carrying one entry per claim. This module is the two halves that were
 * missing — the derivation that makes the input real, and the execution that
 * makes it an observation.
 *
 * The derivation reads R6's plan and takes every entry that carries a
 * counterexample plan identifier, which is exactly what makes a ticket a
 * reconstruction ticket. A deliberately empty plan and a stage that ran nothing
 * are different claims, and only the derivation can tell them apart.
 *
 * The execution runs each counterexample inside a disposable git worktree the
 * isolation owns. The analysis is read-only over its subject, so the breaking
 * happens where nothing can reach the tree being measured, and the isolation
 * digests the guarded tree before and after and refuses if it moved.
 *
 * The record is complete. A counterexample that could not be executed is refused
 * with its reason code and stays in the set: a refusal that vanished would read
 * as a counterexample that was never derived, and the set would look smaller and
 * cleaner than the run was.
 *
 * This module re-declares the verdict, status and reason vocabularies rather than
 * importing them from `.claude/scripts/conver/red-reconstruction.js`. The layer
 * direction runs one way — the loop may import this tree, not the reverse — so a
 * second declaration is forced, and a test asserts the two name the same strings
 * so they cannot drift while staying separate.
 */
import { withIsolatedWorktree, WorktreeIsolationError, WORKTREE_REASONS } from './worktree-isolation.mjs';
import {
  NO_EXECUTOR_DETAIL,
  OBSERVED_NO_RED,
  OBSERVED_RED,
  PASS_EXECUTED,
  PASS_NOTHING_TO_EXECUTE,
  PASS_STATUSES,
  REASON_CODES,
  REASON_EXECUTOR_MISSING,
  REASON_INVALID_EXECUTION_RESULT,
  REASON_PLAN_ID_MISSING,
  RED_NOT_PROVED,
  RED_PROVED,
  RED_VERDICTS,
  verdictOfObservation,
} from './counterexample.mjs';

export {
  PASS_EXECUTED,
  PASS_NOTHING_TO_EXECUTE,
  PASS_STATUSES,
  REASON_CODES,
  REASON_EXECUTOR_MISSING,
  REASON_INVALID_EXECUTION_RESULT,
  REASON_PLAN_ID_MISSING,
  RED_NOT_PROVED,
  RED_PROVED,
  RED_VERDICTS,
};

/**
 * The isolation's reason for an execution that threw, named from its own list.
 *
 * `worktree-isolation.mjs` exports its reason codes as one frozen list rather
 * than one by one, so the member is spelled here once and the derivation is
 * checked at load: a rename in that module stops this one rather than silently
 * turning an executor failure into an isolation failure the caller re-raises.
 */
const ISOLATION_REASON_EXECUTION_FAILED = 'execution-failed';

if (!WORKTREE_REASONS.includes(ISOLATION_REASON_EXECUTION_FAILED)) {
  throw new Error(
    `the isolation no longer declares ${ISOLATION_REASON_EXECUTION_FAILED}, so a failing executor cannot be `
    + `told from a failing isolation. It declares: ${WORKTREE_REASONS.join(', ')}`,
  );
}

/** What this channel is, and what it is not. */
export const COUNTEREXAMPLE_RUN_CAVEAT =
  'A counterexample establishes red; it does not establish that the specification was wrong. An executed '
  + 'counterexample reports whether the red appeared and leaves the decision to a human, and a counterexample '
  + 'that could not be executed is recorded with its reason rather than reported as a claim that held.';

/**
 * The field that makes a plan entry a reconstruction ticket.
 *
 * Declared here rather than imported from the loop: the analysis may not reach
 * into `.claude/scripts/conver/`, and the check is repeated at this boundary
 * rather than assumed from upstream — the alternative to running a ticket
 * isolated is not running it at all.
 */
export const RECONSTRUCTION_PLAN_FIELD = 'counterexample_plan_id';

/** True when a plan entry carries the identifier a reconstruction ticket must have. */
export function isReconstructionEntry(entry) {
  const planId = entry?.[RECONSTRUCTION_PLAN_FIELD];
  return typeof planId === 'string' && planId.trim().length > 0;
}

/** The claim a counterexample names, or a refusal naming what was missing. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function claimNamedBy(ledger, claimId) {
  const claim = ledger.claims.find((item) => item.claim_id === claimId);
  if (!claim) {
    throw new Error(
      `the plan names claim ${claimId}, which this ledger does not hold: a counterexample derived for a claim `
      + 'that is not here could only be refused later, and deriving it would postpone the discovery',
    );
  }
  return claim;
}

/**
 * One counterexample per reconstruction ticket in R6's plan.
 *
 * The invariant this function carries is the one N2 broke: the input to the
 * stage comes from the plan, so a non-empty plan cannot produce an empty input,
 * and an empty input is a statement about the plan.
 *
 * @param {object} params
 * @param {object} params.redPlan - the plan R6 published
 * @param {object} params.ledger - the claim ledger the counterexamples bear on
 * @returns {ReadonlyArray<object>} one entry per reconstruction ticket
 */
export function deriveCounterexamples({ redPlan, ledger } = {}) {
  if (redPlan === null || typeof redPlan !== 'object' || Array.isArray(redPlan)) {
    throw new Error('deriveCounterexamples needs the R6 reconstruction plan to derive from; it was given none');
  }
  if (!Array.isArray(redPlan.entries)) {
    throw new Error('the reconstruction plan carries no entries list, so there is nothing to derive');
  }
  if (ledger === null || typeof ledger !== 'object' || !Array.isArray(ledger.claims)) {
    throw new Error('deriveCounterexamples needs the claim ledger the counterexamples bear on; it was given none');
  }

  const derived = redPlan.entries.filter(isReconstructionEntry).map((entry) => {
    const claim = claimNamedBy(ledger, entry.claim_id);
    return Object.freeze({
      claim_id: claim.claim_id,
      counterexample_plan_id: entry[RECONSTRUCTION_PLAN_FIELD],
      // The invariant the counterexample targets is the plan's own statement of
      // the observation that would count against the claim. Reading it from the
      // claim instead would leave the two free to disagree without saying so.
      invariant: entry.expected_red ?? claim.falsification ?? null,
      technique: entry.technique ?? null,
      carrier: entry.target?.carrier ?? null,
    });
  });

  return Object.freeze(derived);
}

/** A field a record carries, or a description of why the execution said nothing. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function describeResult(result) {
  if (result === null) return 'null';
  if (typeof result === 'function') return 'a function';
  if (typeof result !== 'object') return `${typeof result} ${String(result)}`;
  const keys = Object.keys(result);
  return `an object with key(s) ${keys.length === 0 ? 'none' : keys.join(', ')}`;
}

/**
 * What the execution said about the red, or a refusal naming why it said nothing.
 *
 * A result that does not state whether the red was proved is refused rather than
 * read as "it was not". An unstated answer is not an answer, and recording it as
 * one would turn "I did not look there" into evidence that nothing was there.
 */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function readObservation(execution) {
  if (execution === null || typeof execution !== 'object' || typeof execution.redProved !== 'boolean') {
    throw new Error(
      `the isolated execution returned ${describeResult(execution)}, which does not state whether the red was `
      + 'proved — an unstated answer is refused rather than recorded as a verdict',
    );
  }
  return {
    redProved: execution.redProved,
    observations: Array.isArray(execution.observations) ? [...execution.observations] : [],
  };
}

/** The identity a record carries, copied from the counterexample it belongs to. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function describeCounterexample(counterexample) {
  return {
    claim_id: counterexample.claim_id ?? null,
    counterexample_plan_id: counterexample.counterexample_plan_id ?? null,
    invariant: counterexample.invariant ?? null,
    technique: counterexample.technique ?? null,
    carrier: counterexample.carrier ?? null,
  };
}

/** A counterexample that never reached the isolation, with the reason it did not. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function refusalRecord(counterexample, reasonCode, detail, worktreeRecord = null) {
  return {
    ...describeCounterexample(counterexample),
    status: PASS_NOTHING_TO_EXECUTE,
    verdict: null,
    reason: reasonCode,
    detail,
    observed: null,
    observations: [],
    worktreeRecord,
  };
}

/** The record an isolated execution left behind, keyed by the observation it made. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function executionRecord(counterexample, observation, outcome) {
  const observed = observation.redProved ? OBSERVED_RED : OBSERVED_NO_RED;
  return {
    ...describeCounterexample(counterexample),
    status: PASS_EXECUTED,
    verdict: verdictOfObservation(observed),
    reason: null,
    detail: null,
    observed,
    observations: observation.observations,
    worktreeRecord: {
      worktreePath: outcome.worktreePath,
      scratchBase: outcome.scratchBase,
      mainTreeCleanAtCreation: outcome.mainTreeCleanAtCreation,
      mainTreeDigest: outcome.mainTreeDigest,
      restorationOutcome: outcome.restorationOutcome,
      restorationDetail: outcome.restorationDetail,
    },
  };
}

/** The worktree record of an isolation that already reported one, for a refused entry. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function worktreeRecordOf(outcome) {
  if (outcome === null || typeof outcome !== 'object') return null;
  return {
    worktreePath: outcome.worktreePath ?? null,
    scratchBase: outcome.scratchBase ?? null,
    mainTreeCleanAtCreation: outcome.mainTreeCleanAtCreation ?? null,
    mainTreeDigest: outcome.mainTreeDigest ?? null,
    restorationOutcome: outcome.restorationOutcome ?? null,
    restorationDetail: outcome.restorationDetail ?? null,
  };
}

/**
 * The refusal an executor's failure becomes, without hiding which failure it was.
 *
 * Only the isolation's `execution-failed` is recorded and continued: that one
 * means the caller's own `execute` threw, which is a finding about this
 * counterexample. A main tree that moved, or a worktree that could not be
 * destroyed, is a failure of the isolation itself and is raised — publishing
 * observations taken against a changed tree would make the whole channel worthless.
 */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function refusedForThrownExecutor(counterexample, error) {
  return refusalRecord(
    counterexample,
    REASON_INVALID_EXECUTION_RESULT,
    `the isolated execution threw: ${error.message}`,
    worktreeRecordOf(error.outcome),
  );
}

/**
 * Execute every counterexample through the isolation, one disposable worktree each.
 *
 * An `execute` that throws does not stop the pass. The isolation guarantees there
 * is nothing left to clean up, and a counterexample whose execution failed is a
 * recorded refusal rather than a gap nobody was told about. Zero executed
 * counterexamples is still an explicit result: `counts` says how many were
 * derived, how many ran and why the rest did not.
 *
 * @param {object} params
 * @param {string} params.root - the working tree to isolate
 * @param {ReadonlyArray<object>} params.counterexamples - the derived set
 * @param {Function} [params.execute] - what to run inside the worktree
 * @param {object} [params.isolationOptions] - the isolation's own options
 * @returns {Promise<object>} the pass
 */
export async function runCounterexamples({ root, counterexamples, execute, isolationOptions = {} } = {}) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new Error('runCounterexamples needs the working tree to isolate; it was given none');
  }
  if (!Array.isArray(counterexamples)) {
    throw new Error('runCounterexamples needs the counterexamples to execute; it was given none');
  }

  const records = [];
  const worktrees = [];
  const refusedByReason = Object.fromEntries(REASON_CODES.map((reasonCode) => [reasonCode, 0]));

  for (const counterexample of counterexamples) {
    if (!isReconstructionEntry(counterexample)) {
      records.push(refusalRecord(
        counterexample,
        REASON_PLAN_ID_MISSING,
        `the entry for ${counterexample?.claim_id ?? '(unnamed)'} carries no ${RECONSTRUCTION_PLAN_FIELD}, so `
        + 'there is no falsification plan to execute',
      ));
      continue;
    }
    if (typeof execute !== 'function') {
      records.push(refusalRecord(counterexample, REASON_EXECUTOR_MISSING, NO_EXECUTOR_DETAIL));
      continue;
    }

    let outcome = null;
    try {
      outcome = await withIsolatedWorktree(
        root,
        (worktreePath) => execute({ counterexample, worktreePath }),
        isolationOptions,
      );
      const record = executionRecord(counterexample, readObservation(outcome.execution), outcome);
      records.push(record);
      worktrees.push(record.worktreeRecord);
      continue;
    } catch (error) {
      // Only an executor's own failure is recorded and the pass carried on. A main
      // tree that moved, or a worktree that could not be destroyed, is a failure of
      // the isolation itself and is raised: publishing observations taken against a
      // changed tree would make the whole channel worthless.
      const executorThrew = error instanceof WorktreeIsolationError;
      if (executorThrew && error.reason !== ISOLATION_REASON_EXECUTION_FAILED) throw error;

      // An execution that ran but said nothing still ran: its worktree was made,
      // digested and destroyed, and the record of that travels with the refusal
      // rather than being discarded with the answer that was missing.
      const record = executorThrew
        ? refusedForThrownExecutor(counterexample, error)
        : refusalRecord(counterexample, REASON_INVALID_EXECUTION_RESULT, error.message, worktreeRecordOf(outcome));
      records.push(record);
      if (record.worktreeRecord !== null) worktrees.push(record.worktreeRecord);
    }
  }

  for (const record of records) {
    if (record.status === PASS_NOTHING_TO_EXECUTE) refusedByReason[record.reason] += 1;
  }

  const executed = records.filter((record) => record.status === PASS_EXECUTED);
  const refused = records.filter((record) => record.status === PASS_NOTHING_TO_EXECUTE);

  return {
    root,
    // Whether this pass had a counterexample to run, not whether one succeeded:
    // an empty plan and a plan whose executions all failed are different results.
    status: records.length === 0 ? PASS_NOTHING_TO_EXECUTE : PASS_EXECUTED,
    executed,
    refused,
    counterexamples: records,
    worktrees,
    counts: Object.freeze({
      derivedCount: records.length,
      executedCount: executed.length,
      refusedCount: refused.length,
      refusedByReason: Object.freeze(refusedByReason),
    }),
    empty: records.length === 0,
    caveat: COUNTEREXAMPLE_RUN_CAVEAT,
  };
}
