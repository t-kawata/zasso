// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
/**
 * R6.5 — the reverse edge: a counterexample flows back into the claim ledger.
 *
 * Reverse rotation is abductive, not deductive, and a counterexample is its most
 * important update input. Without this edge the ledger only ever accumulates:
 * a falsification would be obtained, written into a results file, and change
 * nothing upstream — which is the failure ABOUT-REVERSE 6.10.1 exists to name
 * ("反証が死ぬ").
 *
 * Applying a counterexample therefore revises the claim it bears on, and the
 * word "revises" is doing real work. A red failure is evidence, not a verdict:
 * it may mean the implementation is wrong, or that the contract candidate was
 * read wrong, or that the mutation was equivalent after all, and deciding which
 * of those it is remains a human's work. This module records the observation and
 * leaves that decision open, which is why the ledger it returns carries
 * `verdict: null` and no field anywhere that asserts a specification error.
 *
 * The ledger is a value. Applying a counterexample returns a new ledger and
 * leaves the one it was given untouched, so a reader can see the claim before
 * and after and the revision is auditable rather than merely asserted.
 */

/** The stage this edge belongs to, so the artefact never names a stage by hand. */
export const STAGE = 'r6.5';

/** The fields a counterexample must carry before it can revise anything. */
export const COUNTEREXAMPLE_FIELDS = Object.freeze([
  'counterexample_plan_id',
  'claim_id',
  'observed',
  'observation',
]);

/**
 * The one observation that revises a claim.
 *
 * Anything else — that no red appeared, that the run produced no observation at
 * all — is recorded as unobservable. Counting it as a falsification would be the
 * same error as counting an unrun test as a passing one.
 */
export const OBSERVED_RED = 'red';

/**
 * The one other thing an executed counterexample can observe: no red appeared.
 *
 * It is a distinct value from a missing observation rather than its default. A
 * counterexample that ran and found the claim holding is a result; one that never
 * ran has no result at all, and the two must not collapse into one another.
 */
export const OBSERVED_NO_RED = 'no-red';

/**
 * What the machine is allowed to say about a claim, and nothing else.
 *
 * `not-proved` is the red appearing: the implementation broke and the check
 * noticed, so the claim did not hold under this counterexample. `proved` is the
 * check staying quiet, so the claim held. The conver layer's module of the same
 * name reads the identical observation and calls it `proved` — there the subject
 * is whether a ticket's Red exists, and here it is whether a claim survives, so
 * the same fact answers two different questions. The analysis re-declares the
 * values because the layer direction forbids importing them, and a test asserts
 * the two declarations name the same strings.
 */
export const RED_PROVED = 'proved';
export const RED_NOT_PROVED = 'not-proved';
export const RED_VERDICTS = Object.freeze([RED_PROVED, RED_NOT_PROVED]);

/** A pass either ran something or found nothing to run; neither is a success claim. */
export const PASS_EXECUTED = 'executed';
export const PASS_NOTHING_TO_EXECUTE = 'nothing-to-execute';
export const PASS_STATUSES = Object.freeze([PASS_EXECUTED, PASS_NOTHING_TO_EXECUTE]);

/** The reasons a counterexample cannot be executed, and no fourth is introduced. */
export const REASON_PLAN_ID_MISSING = 'plan-id-missing';
export const REASON_EXECUTOR_MISSING = 'executor-missing';
export const REASON_INVALID_EXECUTION_RESULT = 'invalid-execution-result';
export const REASON_CODES = Object.freeze([
  REASON_PLAN_ID_MISSING,
  REASON_EXECUTOR_MISSING,
  REASON_INVALID_EXECUTION_RESULT,
]);

/**
 * What a derived counterexample is refused with when this run supplied no executor.
 *
 * The refusal is about the run rather than about the claim: a counterexample that
 * could not be executed has refuted nothing and has been refuted by nothing.
 */
export const NO_EXECUTOR_DETAIL =
  'no executor was supplied to this run, so the counterexample was derived and never run — which is a '
  + 'statement about the run and not about the claim';

/** The verdict an observation decides, and the only place the two are related. */
export function verdictOfObservation(observed) {
  return observed === OBSERVED_RED ? RED_NOT_PROVED : RED_PROVED;
}

/** The two ways a counterexample can revise the claim it bears on. */
export const REVISIONS = Object.freeze(['retracted', 'split']);

/** The verdict this stage never reaches, and the reason it is a field at all. */
export const UNREACHED_VERDICT = null;

/** What a counterexample is, and what it is not. */
export const COUNTEREXAMPLE_CAVEAT =
  'A counterexample establishes red; it does not establish that the specification was wrong. The '
  + 'observation is carried back to the claim it bears on and the claim is retracted or split, so '
  + 'that a human can decide what the red means. Deciding it automatically would turn an experiment '
  + 'into a verdict.';

/** The claim a counterexample names, or a refusal naming what was missing. */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function findClaim(ledger, claimId) {
  const claim = ledger.claims.find((item) => item.claim_id === claimId);
  if (!claim) {
    throw new Error(
      `the counterexample names claim ${claimId}, which this ledger does not hold: a revision that `
      + 'reached nothing must not read as a revision that was applied',
    );
  }
  return claim;
}

/** A counterexample whose required fields are all present. */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function assertWellFormed(counterexample) {
  if (counterexample === null || typeof counterexample !== 'object') {
    throw new Error('a counterexample must be a record naming the claim it bears on; it was given none');
  }
  for (const field of COUNTEREXAMPLE_FIELDS) {
    if (counterexample[field] === undefined || counterexample[field] === null) {
      throw new Error(
        `the counterexample is missing ${field}: a record without it cannot be told apart from a claim `
        + 'about nothing, so it is refused rather than applied',
      );
    }
  }
}

/**
 * The claim as it reads after the counterexample reached it.
 *
 * A counterexample that names what survived splits the claim, because something
 * remains to be checked and losing it would be the opposite of a revision. One
 * that names nothing beyond the observation retracts the claim outright.
 */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function reviseClaim(claim, counterexample) {
  const revision = counterexample.narrowed_to ? 'split' : 'retracted';
  const revised = { ...claim, revision, revised_by: counterexample.counterexample_plan_id };

  if (revision === 'retracted') return { claims: [revised], revision };

  return {
    revision,
    claims: [
      revised,
      {
        ...claim,
        claim_id: `${claim.claim_id}-split-${counterexample.counterexample_plan_id}`,
        statement: counterexample.narrowed_to,
        split_from: claim.claim_id,
        revision: 'split',
        revised_by: counterexample.counterexample_plan_id,
      },
    ],
  };
}

/** The record a revision leaves behind, carrying the observation and nothing more. */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function revisionRecord(claim, counterexample, revision) {
  return {
    claim_id: claim.claim_id,
    revision,
    counterexample_plan_id: counterexample.counterexample_plan_id,
    counterexample: {
      observed: counterexample.observed,
      observation: counterexample.observation,
    },
  };
}

/**
 * Apply one counterexample to the ledger it bears on.
 *
 * Returns a new ledger. The one passed in is not modified, so a caller holding
 * both can see what changed.
 */
export function applyCounterexample(counterexample, ledger) {
  if (ledger === null || typeof ledger !== 'object' || !Array.isArray(ledger.claims)) {
    throw new Error('applyCounterexample needs the claim ledger it is to revise; it was given none');
  }
  assertWellFormed(counterexample);
  if (counterexample.observed !== OBSERVED_RED) {
    throw new Error(
      `the counterexample for ${counterexample.claim_id} observed ${JSON.stringify(counterexample.observed)} `
      + `rather than ${OBSERVED_RED}: observing no red is not a falsification, and applying it as one would `
      + 'revise a claim on no evidence',
    );
  }

  const claim = findClaim(ledger, counterexample.claim_id);
  const { claims, revision } = reviseClaim(claim, counterexample);

  return {
    ...ledger,
    claims: [...ledger.claims.filter((item) => item.claim_id !== claim.claim_id), ...claims],
    revisions: [...(ledger.revisions ?? []), revisionRecord(claim, counterexample, revision)],
    // Never set by this stage, and present so that a consumer reading the
    // ledger cannot mistake an absent field for an unstated conclusion.
    verdict: UNREACHED_VERDICT,
  };
}

/**
 * The identity of a counterexample, which every record carries whether it ran or not.
 *
 * A record that has lost these would be indistinguishable from a claim about
 * nothing, so they are copied rather than referenced.
 */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function describeCounterexample(counterexample) {
  return {
    claim_id: counterexample.claim_id,
    counterexample_plan_id: counterexample.counterexample_plan_id,
    invariant: counterexample.invariant ?? null,
    technique: counterexample.technique ?? null,
    carrier: counterexample.carrier ?? null,
  };
}

/** A counterexample that could not be executed, staying in the set with its reason. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function refuseCounterexample(counterexample, reasonCode, detail) {
  return {
    ...describeCounterexample(counterexample),
    status: PASS_NOTHING_TO_EXECUTE,
    verdict: null,
    reason: reasonCode,
    detail,
    observed: null,
    observations: [],
    worktreeRecord: null,
  };
}

/**
 * The record a run left for a counterexample, checked rather than trusted.
 *
 * The fields are validated because this is a boundary: a record claiming
 * `executed` with no verdict, or a refusal carrying one, would put a statement
 * into the published document that the run never made.
 */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function assertRecord(record) {
  if (typeof record !== 'object' || record === null) {
    throw new Error('a counterexample record must be an object naming what happened; it was given none');
  }
  if (!PASS_STATUSES.includes(record.status)) {
    throw new Error(`the record for ${record.claim_id} carries status ${JSON.stringify(record.status)}, which is not one of ${PASS_STATUSES.join(', ')}`);
  }
  if (record.status === PASS_EXECUTED) {
    if (!RED_VERDICTS.includes(record.verdict)) {
      throw new Error(`the executed record for ${record.claim_id} carries verdict ${JSON.stringify(record.verdict)}, which is not one of ${RED_VERDICTS.join(', ')}`);
    }
    if (record.observed !== OBSERVED_RED && record.observed !== OBSERVED_NO_RED) {
      throw new Error(`the executed record for ${record.claim_id} carries observation ${JSON.stringify(record.observed)}, which states neither that a red appeared nor that none did`);
    }
    return {
      ...describeCounterexample(record),
      status: record.status,
      verdict: record.verdict,
      reason: null,
      detail: null,
      observed: record.observed,
      observations: Array.isArray(record.observations) ? [...record.observations] : [],
      worktreeRecord: record.worktreeRecord ?? null,
    };
  }
  if (record.verdict !== null) {
    throw new Error(`the refused record for ${record.claim_id} carries verdict ${JSON.stringify(record.verdict)}: a refusal is not a result, and rendering it as one would turn "we could not test it" into "we tested it"`);
  }
  if (!REASON_CODES.includes(record.reason)) {
    throw new Error(`the refused record for ${record.claim_id} carries reason ${JSON.stringify(record.reason)}, which is not one of ${REASON_CODES.join(', ')}`);
  }
  return { ...refuseCounterexample(record, record.reason, record.detail ?? null), observations: Array.isArray(record.observations) ? [...record.observations] : [] };
}

/**
 * Apply a set of counterexamples, keeping the ones that revise nothing apart.
 *
 * `applied` carries one record per counterexample the stage received or derived,
 * whatever happened to it: a refusal that vanished from the set would read as a
 * counterexample that was never derived, which is the collapse this stage exists
 * to prevent. `unobservable` is the subset that ran and produced no red — a
 * result, reported rather than counted as a falsification, because a stage that
 * found nothing and a stage that ran nothing are different findings.
 */
export function applyCounterexamples(counterexamples, ledger) {
  if (ledger === null || typeof ledger !== 'object' || !Array.isArray(ledger.claims)) {
    throw new Error('applyCounterexamples needs the claim ledger they are to revise; it was given none');
  }
  if (!Array.isArray(counterexamples)) {
    throw new Error('applyCounterexamples needs the counterexamples to apply; it was given none');
  }

  const applied = [];
  const unobservable = [];
  const refusedByReason = Object.fromEntries(REASON_CODES.map((reasonCode) => [reasonCode, 0]));
  let revised = { ...ledger, claims: [...ledger.claims], revisions: [...(ledger.revisions ?? [])], verdict: UNREACHED_VERDICT };

  for (const counterexample of counterexamples) {
    // A derived counterexample carries no status because nothing ran it. It is
    // refused rather than dropped, and the reason names what the run lacked.
    const record = counterexample.status === undefined
      ? refuseCounterexample(counterexample, REASON_EXECUTOR_MISSING, NO_EXECUTOR_DETAIL)
      : assertRecord(counterexample);
    applied.push(record);

    if (record.status === PASS_NOTHING_TO_EXECUTE) {
      refusedByReason[record.reason] += 1;
      continue;
    }
    if (record.observed !== OBSERVED_RED) {
      unobservable.push({
        claim_id: record.claim_id,
        counterexample_plan_id: record.counterexample_plan_id,
        observed: record.observed,
        verdict: record.verdict,
        reason: `the plan observed ${JSON.stringify(record.observed)} rather than ${OBSERVED_RED}, so `
          + 'no red was established and this is not a falsification',
      });
      continue;
    }
    revised = applyCounterexample({
      claim_id: record.claim_id,
      counterexample_plan_id: record.counterexample_plan_id,
      observed: record.observed,
      observation: record.observations.join('\n'),
    }, revised);
  }

  const executedCount = applied.filter((record) => record.status === PASS_EXECUTED).length;

  return {
    ledger: revised,
    applied,
    unobservable,
    counts: Object.freeze({
      derivedCount: applied.length,
      executedCount,
      refusedCount: applied.length - executedCount,
      refusedByReason: Object.freeze(refusedByReason),
    }),
    // True only when nothing was derived. A plan that was empty and a stage that
    // ran nothing are different statements, and the document carries which one it is.
    empty: counterexamples.length === 0,
    caveat: COUNTEREXAMPLE_CAVEAT,
  };
}

/**
 * The reverse edge as the Markdown a human or an AI reads.
 *
 * An empty set is printed as empty rather than omitted, because a section that
 * vanished would read as a stage that did not run.
 */
export function renderCounterexampleReport(result, limit = 20) {
  const { derivedCount, executedCount, refusedCount } = result.counts;
  const lines = [
    '## Counterexamples',
    '',
    `> ${COUNTEREXAMPLE_CAVEAT}`,
    '',
    `**Counterexamples derived**: ${derivedCount}. **Executed**: ${executedCount}. **Refused**: ${refusedCount}. `
      + `**Claims revised**: ${result.ledger.revisions.length}. **No red observed**: ${result.unobservable.length}.`,
    '',
  ];

  if (result.empty) {
    lines.push(
      'The derived set is empty because the plan was empty: R6 produced no reconstruction ticket, so there',
      'was no counterexample to derive. Nothing was retracted and nothing was split, and this says nothing',
      'about whether the claims hold.',
      '',
    );
    return lines.join('\n');
  }

  lines.push('| Claim | Verdict | Status | Plan |', '|---|---|---|---|');
  for (const record of result.applied.slice(0, limit)) {
    lines.push(
      `| \`${record.claim_id}\` | ${record.verdict ?? `(refused: ${record.reason})`} `
      + `| ${record.status} | \`${record.counterexample_plan_id}\` |`,
    );
  }
  lines.push('');

  if (result.unobservable.length > 0) {
    lines.push(
      '### Counterexamples whose red could not be observed',
      '',
      'These ran and produced no red. They are reported rather than counted as falsifications: a check that',
      'stayed quiet has not shown that the claim holds against every input, and it has not shown that it fails.',
      '',
      ...result.unobservable.slice(0, limit).map((item) => `- \`${item.claim_id}\` — ${item.reason}`),
      '',
    );
  }

  return lines.join('\n');
}
