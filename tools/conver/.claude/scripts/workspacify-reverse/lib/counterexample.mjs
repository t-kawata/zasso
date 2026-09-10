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
 * Apply a set of counterexamples, keeping the ones that revise nothing apart.
 *
 * `applied` revised a claim. `unobservable` produced no red, or produced no
 * observation at all, and is reported rather than counted: an empty result and
 * a falsification that could not be observed are different findings, and a
 * single "0 applied" would collapse them.
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
  let revised = { ...ledger, claims: [...ledger.claims], revisions: [...(ledger.revisions ?? [])], verdict: UNREACHED_VERDICT };

  for (const counterexample of counterexamples) {
    assertWellFormed(counterexample);
    if (counterexample.observed !== OBSERVED_RED) {
      unobservable.push({
        claim_id: counterexample.claim_id,
        counterexample_plan_id: counterexample.counterexample_plan_id,
        observed: counterexample.observed,
        reason: `the plan observed ${JSON.stringify(counterexample.observed)} rather than ${OBSERVED_RED}, so `
          + 'no red was established and this is not a falsification',
      });
      continue;
    }
    revised = applyCounterexample(counterexample, revised);
    applied.push({ claim_id: counterexample.claim_id, counterexample_plan_id: counterexample.counterexample_plan_id });
  }

  return {
    ledger: revised,
    applied,
    unobservable,
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
  const lines = [
    '## Counterexamples',
    '',
    `> ${COUNTEREXAMPLE_CAVEAT}`,
    '',
    `**Counterexamples supplied**: ${result.applied.length + result.unobservable.length}. `
      + `**Claims revised**: ${result.applied.length}. **No red observed**: ${result.unobservable.length}.`,
    '',
  ];

  if (result.empty) {
    lines.push(
      'The counterexample set is empty. Nothing was retracted and nothing was split, and this is not a',
      'statement that the claims survived: no plan was executed in this run, so no counterexample could',
      'have been obtained. Execution belongs to the ticket that owns the isolated environment.',
      '',
    );
    return lines.join('\n');
  }

  if (result.applied.length === 0) {
    lines.push('No counterexample revised a claim.', '');
  } else {
    lines.push('| Claim | Revision | Plan |', '|---|---|---|');
    for (const revision of result.ledger.revisions.slice(0, limit)) {
      lines.push(`| \`${revision.claim_id}\` | ${revision.revision} | \`${revision.counterexample_plan_id}\` |`);
    }
    lines.push('');
  }

  if (result.unobservable.length > 0) {
    lines.push(
      '### Counterexamples whose red could not be observed',
      '',
      'These are reported rather than counted as falsifications. A run that observed nothing has not',
      'shown that the claim holds and has not shown that it fails.',
      '',
      ...result.unobservable.slice(0, limit).map((item) => `- \`${item.claim_id}\` — ${item.reason}`),
      '',
    );
  }

  return lines.join('\n');
}
