// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
/**
 * R6 — the Red reconstruction plan.
 *
 * Forward rotation gets red for free: a test written before the behaviour fails
 * because there is no behaviour. Reverse rotation does not. Its tests were
 * written against an implementation that already existed, so they were green
 * from the moment they were written, and a green with no red behind it is
 * unproven (ABOUT-REVERSE 3.5, 7.6 F2). This stage reconstructs the red.
 *
 * It plans and does not execute, and the split is deliberate. Executing a plan
 * means deliberately breaking the implementation, which needs an isolated
 * environment and a guaranteed restoration — P22-18 supplies the environment and
 * P22-19 runs the plans. A ticket may not depend on a later one, so a plan that
 * cannot execute yet is recorded with that reason, which is the honest outcome
 * while no sandbox exists.
 *
 * Two rules keep the plan from overclaiming. A plan never targets production
 * state: its target is the isolated environment or nothing. And it never says
 * whether a red means the specification was wrong — a red failure is evidence,
 * and the design routes it back to the ledger as a retraction or a split rather
 * than as a verdict (ABOUT-REVERSE 6.10.1, 6.2 R6.5).
 *
 * The technique a claim gets is not chosen by preference here. R5 and R5.5
 * classify what is missing, and the gap's kind selects the technique
 * (ABOUT-REVERSE 6.10.1: 反証は上流を撤回させる). Where no gap names the claim,
 * the claim's own recorded falsification already says which observation would
 * count against it, and the technique is read from that.
 */
import { stemOf } from './claim-ledger.mjs';
// The oracle independence vocabulary is declared once, in the module whose
// schema requires it, and read here. A second declaration would drift on
// spelling, and the drift would be silent: each module's tests would pass
// against its own spelling and nothing would catch the disagreement.
import { STRONG_ORACLE_INDEPENDENCE, WEAK_ORACLE_INDEPENDENCE } from './property-tests.mjs';

/**
 * The counterexample techniques, and the closed vocabulary of them.
 *
 * `mutation` is the technique the design names first (3.5節), but it is not the
 * only one and it is not the default: applying mutation to every claim
 * indiscriminately is the misuse the design warns against, because a mutation
 * survivor is a question about the oracle rather than a failure of the
 * implementation.
 */
export const COUNTEREXAMPLE_TECHNIQUES = Object.freeze([
  'mutation',
  'negative_test',
  'property',
  'metamorphic',
  'differential',
  'trace_assertion',
]);

/**
 * The technique a claim's own falsification describes.
 *
 * Read from R3.5, which already recorded on each claim what observation would
 * count against it. An invariant says to mutate the asserted condition; a
 * failure contract says to remove the error path; a boundary crossing says to
 * remove the reference. Reusing those sentences keeps the technique grounded in
 * a reading that was actually made instead of a preference expressed here.
 */
export const TECHNIQUE_BY_SUBJECT_KIND = Object.freeze({
  invariant: 'mutation',
  failure_contract: 'negative_test',
  boundary_crossing: 'trace_assertion',
});

/** The technique R5's gap kinds select. `null` means the kind decides nothing. */
export const GAP_TECHNIQUE = Object.freeze({
  absent_red: 'mutation',
  stub: 'negative_test',
  dead_code: 'trace_assertion',
  comment_code_drift: 'trace_assertion',
  circular_reasoning: 'differential',
  unobserved_surface: 'differential',
});

/**
 * The technique R5.5's survivor causes select.
 *
 * `equivalent` selects nothing on purpose: an equivalent mutant is discarded
 * before classification, so reaching this table with that cause means the
 * discard did not happen, and a plan built on it would be built on a mutant that
 * is not distinguishable from the original (ABOUT-REVERSE 11.5 R-2, TCE).
 */
export const SURVIVOR_CAUSE_TECHNIQUE = Object.freeze({
  equivalent: null,
  unreachable: 'trace_assertion',
  insufficient_observation: 'trace_assertion',
  insufficient_oracle: 'property',
  insufficient_input: 'property',
  insufficient_environment: 'trace_assertion',
  unclassified: null,
});

/**
 * The fields the ticket's schema names for a plan entry.
 *
 * Declared rather than implied: a plan missing one of these cannot be executed,
 * and a reader should be able to see which one is absent instead of inferring it
 * from a renderer's output.
 */
export const PLAN_REQUIRED_FIELDS = Object.freeze([
  'claim_id',
  'technique',
  'target',
  'side_effects',
  'reset',
  'oracle',
  'expected_red',
  'counterexample_plan_id',
]);

/** The stage these plans belong to, so the artefact never names a stage by hand. */
export const STAGE = 'r6';

/** The only kind of target a plan may name. */
export const ISOLATED_ENVIRONMENT = 'isolated_environment';

/**
 * Substrings that mark a reference as pointing at state that is not disposable.
 *
 * The list is checked against every target a plan emits, so that a target which
 * would have to be restored by hand — or not restored at all — is refused where
 * it is written rather than discovered when it is broken.
 */
export const PRODUCTION_MARKERS = Object.freeze([
  'production',
  'prod/',
  'live',
  'cluster',
  'siprs-with-4layers',
]);

/** The ticket that supplies the environment a plan executes in. */
export const ENVIRONMENT_PROVIDED_BY = 'P22-18';

/** The ticket that executes the plans. */
export const EXECUTION_OWNED_BY = 'P22-19';

/** What a plan is, and what it is not. */
export const RED_PLAN_CAVEAT =
  'Mutation is a means of reconstructing red; it is not proof of contract coverage, and this plan is '
  + 'not a coverage measurement. A survivor is a question about the oracle, not a failure of the '
  + 'implementation, and a red failure is evidence rather than a verdict.';

/**
 * What executing a technique would touch, and how its red would be observed.
 *
 * `independence` is where that technique's oracle comes from, and it is recorded
 * because a mutation plan's oracle is the suite that ships with the carrier —
 * which the implementation produced, and which therefore cannot corroborate it
 * (ABOUT-REVERSE 7.6 F17).
 */
export const TECHNIQUE_EFFECTS = Object.freeze({
  mutation: Object.freeze({
    side_effects: Object.freeze(['the carrier is rewritten inside the isolated environment', 'the mutation is recorded so it can be reverted']),
    oracle: 'the test suite that ships with the carrier',
    independence: 'implementation_derived',
  }),
  negative_test: Object.freeze({
    side_effects: Object.freeze(['a test is added inside the isolated environment']),
    oracle: 'the claim\'s own recorded falsification, read back as the observation that would count as failure',
    independence: 'implementation_reverse_engineered',
  }),
  property: Object.freeze({
    side_effects: Object.freeze(['a generated property test is added inside the isolated environment']),
    oracle: 'a generated candidate whose property_origin carries requires_human_approval',
    independence: 'implementation_derived',
  }),
  metamorphic: Object.freeze({
    side_effects: Object.freeze(['two executions of the carrier inside the isolated environment']),
    oracle: 'a relation resting on an external specification or a mathematical property',
    independence: 'metamorphic',
  }),
  differential: Object.freeze({
    side_effects: Object.freeze(['two implementations are executed inside the isolated environment']),
    oracle: 'an independent implementation, an older version or an alternate backend',
    independence: 'differential',
  }),
  trace_assertion: Object.freeze({
    side_effects: Object.freeze(['the carrier is executed with a trace inside the isolated environment']),
    oracle: 'the execution trace the carrier produces',
    independence: 'implementation_derived',
  }),
});

/**
 * How a plan is undone.
 *
 * One procedure for every technique, because the procedure is a property of the
 * instrument rather than of the technique: the digest R0.5 recorded is what a
 * run is restored from, and confirming it after the run is what makes the next
 * plan readable against an unchanged tree.
 */
export const RESET_PROCEDURE =
  'restore every file the plan touched from the target digest recorded in ANALYSIS-SCOPE.json, then '
  + 'confirm the digest matches before the next plan runs';

/** A stable identifier for a claim's plan, unique within a plan and across runs. */
export function buildCounterexamplePlanId(claim, technique) {
  const span = claim?.evidence?.[0]?.source_span;
  const stem = span ? stemOf(span.file) : (claim?.claim_id ?? 'unrecorded');
  return `cxp-${stem}-${technique ?? 'unassigned'}-${span ? span.line : 0}`;
}

/** The anchor a plan points its carrier at, or the fact that none was recorded. */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function anchorOf(claim) {
  const span = claim.evidence?.[0]?.source_span;
  return span ? { file: span.file, line: span.line } : { file: '(unrecorded)', line: 0 };
}

/** The gaps in the shape a caller may hold them: a list, or R5's classified record. */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function gapList(gaps) {
  if (Array.isArray(gaps)) return gaps;
  return gaps?.gaps ?? [];
}

/**
 * The technique a claim's red would be reconstructed with, and why.
 *
 * The order is the design's dataflow and not a preference. A named mutation
 * survivor is the most specific fact available about this claim, so it decides
 * first. A gap at the claim's own anchor is next: R5 classified what is missing
 * there, and the kind selects the technique. Where neither names the claim, its
 * own recorded falsification decides. Where even that names nothing — a subject
 * kind this vocabulary does not cover — the answer is that no technique applies,
 * and that is recorded rather than defaulted.
 */
export function selectTechnique(claim, { gaps = null, oracleGap = null } = {}) {
  const anchor = anchorOf(claim);

  const survivor = (oracleGap?.survivors?.results ?? []).find(
    (result) => result?.source_span?.file === anchor.file && result?.source_span?.line === anchor.line,
  );
  if (survivor) {
    const technique = SURVIVOR_CAUSE_TECHNIQUE[survivor.cause] ?? null;
    return {
      technique,
      basis: 'mutation_survivor_cause',
      mutant_id: survivor.mutant_id ?? null,
      reason: technique === null
        ? `the surviving mutant ${survivor.mutant_id ?? '(unnamed)'} was classified ${survivor.cause}, which selects no technique`
        : `the surviving mutant ${survivor.mutant_id ?? '(unnamed)'} was classified ${survivor.cause}`,
    };
  }

  const gap = gapList(gaps).find((item) => item?.file === anchor.file && item?.line === anchor.line);
  if (gap) {
    const technique = GAP_TECHNIQUE[gap.kind] ?? null;
    return {
      technique,
      basis: 'gap_kind',
      gap_id: gap.gap_id ?? null,
      reason: technique === null
        ? `the gap ${gap.gap_id ?? '(unnamed)'} has kind ${gap.kind}, which selects no technique`
        : `the gap ${gap.gap_id ?? '(unnamed)'} has kind ${gap.kind}`,
    };
  }

  const technique = TECHNIQUE_BY_SUBJECT_KIND[claim.subjectKind] ?? null;
  return {
    technique,
    basis: technique === null ? 'no_applicable_technique' : 'claim_falsification',
    reason: technique === null
      ? `the subject kind "${claim.subjectKind}" is not one this vocabulary selects a technique for, so no `
        + 'technique applies and the claim is recorded rather than defaulted'
      : `the claim's own recorded falsification reads as ${technique}: ${claim.falsification}`,
  };
}

/**
 * Refuse a target that is not the isolated environment.
 *
 * Exported so a caller can assert the invariant over a plan it did not build,
 * and called on every entry this module emits.
 */
export function assertNoProductionTarget(entry) {
  const target = entry?.target;
  if (target?.kind !== ISOLATED_ENVIRONMENT) {
    throw new Error(
      `the plan for ${entry?.claim_id ?? '(unnamed)'} targets ${JSON.stringify(target?.kind)}: a plan `
      + 'executes against the isolated environment or not at all, because active exploration of '
      + 'production state is forbidden',
    );
  }
  for (const marker of PRODUCTION_MARKERS) {
    if (target.ref.includes(marker)) {
      throw new Error(
        `the plan for ${entry?.claim_id ?? '(unnamed)'} names ${target.ref}, which carries the `
        + `production marker "${marker}": a plan may only target state that can be discarded`,
      );
    }
  }
  return true;
}

/** One plan entry, with every field the schema names and the environment's verdict. */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function buildEntry(claim, { selected, environment }) {
  const anchor = anchorOf(claim);
  const technique = selected.technique;
  const effects = technique === null ? null : TECHNIQUE_EFFECTS[technique];

  if (typeof claim.falsification !== 'string' || claim.falsification.length === 0) {
    throw new Error(
      `claim ${claim.claim_id} states no falsification condition, so no expected red can be read from it: `
      + 'a plan whose expected red were invented here would be describing an observation nobody recorded',
    );
  }

  const entry = {
    claim_id: claim.claim_id,
    technique,
    technique_basis: selected.basis,
    target: {
      kind: ISOLATED_ENVIRONMENT,
      // The carrier is named by its path inside the target and not by an
      // absolute path, so a plan cannot accidentally address this machine's tree.
      ref: `isolated/${anchor.file}`,
      carrier: `${anchor.file}:${anchor.line}`,
    },
    side_effects: effects === null ? [] : [...effects.side_effects],
    reset: RESET_PROCEDURE,
    // Absent, not a sentinel string. `oracle` and `oracle_independence` say the
    // same thing about the same entry, so they must not say it two different
    // ways: a reader comparing them would see a value beside a null and have to
    // work out whether the difference meant something.
    oracle: effects === null ? null : effects.oracle,
    oracle_independence: effects === null ? null : effects.independence,
    // A description of the observation that would count as failure, never a
    // boolean, so that a plan cannot be satisfied by asserting nothing.
    expected_red: claim.falsification,
    counterexample_plan_id: buildCounterexamplePlanId(claim, technique),
    executable: environment.available,
  };
  if (technique === null) entry.reason = selected.reason;

  assertNoProductionTarget(entry);
  return entry;
}

/**
 * The oracle provenance counts of a plan, keeping the weak ones out of the strong total.
 *
 * `strong` is what could falsify the implementation; `weak` is what describes
 * it. Summing them would produce the single number the design forbids, so the
 * separation is reported rather than left to a reader to work out from the rows.
 */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function countOracleIndependence(entries) {
  const counts = {};
  for (const independence of [...STRONG_ORACLE_INDEPENDENCE, ...WEAK_ORACLE_INDEPENDENCE]) counts[independence] = 0;
  for (const entry of entries) {
    if (entry.oracle_independence === null) continue;
    counts[entry.oracle_independence] += 1;
  }

  const strong = STRONG_ORACLE_INDEPENDENCE.reduce((total, name) => total + counts[name], 0);
  const weak = WEAK_ORACLE_INDEPENDENCE.reduce((total, name) => total + counts[name], 0);

  return Object.freeze({
    ...counts,
    strong,
    weak,
    caveat: 'Every oracle above is read from the implementation or from a reading of it, unless it is '
      + 'differential or metamorphic. A mutation plan\'s oracle is the suite that ships with the carrier, '
      + 'which the implementation produced and which therefore cannot corroborate it.',
  });
}

/**
 * The plan for every claim in a ledger.
 *
 * The environment is a parameter with the honest default: the sandbox P22-18
 * provides does not exist yet, so `available` is false and every entry records
 * that it cannot run. That is not a gap in this stage — this stage plans, and
 * P22-19 executes once the environment exists.
 */
export function planRedReconstruction({ ledger, oracleGap = null, gaps = null, environment = null } = {}) {
  if (ledger === null || typeof ledger !== 'object' || !Array.isArray(ledger.claims)) {
    throw new Error('planRedReconstruction needs the claim ledger to plan against; it was given none');
  }
  const resolvedEnvironment = environment ?? {
    kind: ISOLATED_ENVIRONMENT,
    available: false,
    provided_by: ENVIRONMENT_PROVIDED_BY,
    reason: `no isolated environment exists in this run. This stage builds plans and does not execute them: `
      + `the environment is supplied by ${ENVIRONMENT_PROVIDED_BY} and the plans are executed by `
      + `${EXECUTION_OWNED_BY}, so every plan is recorded as not executable here rather than dropped.`,
  };

  const entries = [];
  const unassigned = [];
  for (const claim of ledger.claims) {
    const selected = selectTechnique(claim, { gaps, oracleGap });
    const entry = buildEntry(claim, { selected, environment: resolvedEnvironment });
    entries.push(entry);
    if (entry.technique === null) unassigned.push({ claim_id: entry.claim_id, reason: selected.reason });
  }

  return {
    root: ledger.root ?? null,
    stage: STAGE,
    environment: resolvedEnvironment,
    entries,
    unassigned,
    oracle_independence_counts: countOracleIndependence(entries),
    unavailable: resolvedEnvironment.available ? [] : [resolvedEnvironment.reason],
    caveat: RED_PLAN_CAVEAT,
  };
}

/**
 * The plan as the Markdown a human or an AI reads before deciding anything.
 *
 * The caveat and the environment are part of the report rather than notes beside
 * it, because a reader who has the plan and not the reason it cannot run yet
 * would read a complete plan as a completed one.
 */
export function renderRedReconstructionReport(plan, limit = 20) {
  const counts = plan.oracle_independence_counts;
  const lines = [
    '## Red reconstruction plan',
    '',
    `> ${RED_PLAN_CAVEAT}`,
    '',
    `**Claims planned for**: ${plan.entries.length}. **Techniques selected**: `
      + `${plan.entries.length - plan.unassigned.length}. **No applicable technique**: ${plan.unassigned.length}.`,
    '',
  ];

  lines.push(
    `**Executable in this run**: ${plan.environment.available ? 'yes' : 'no'}.`,
    '',
    plan.environment.available
      ? `Every plan targets \`${plan.environment.kind}\`.`
      : `No plan targets production state: every one names \`${plan.environment.kind}\`. ${plan.environment.reason}`,
    '',
  );

  const techniqueCounts = new Map();
  for (const entry of plan.entries) {
    if (entry.technique === null) continue;
    techniqueCounts.set(entry.technique, (techniqueCounts.get(entry.technique) ?? 0) + 1);
  }
  lines.push('| Technique | Claims |', '|---|---|');
  for (const technique of COUNTEREXAMPLE_TECHNIQUES) {
    lines.push(`| ${technique} | ${techniqueCounts.get(technique) ?? 0} |`);
  }
  lines.push('', `> ${counts.caveat}`, '');

  if (plan.unassigned.length > 0) {
    lines.push(
      '### Claims with no applicable technique',
      '',
      'These are recorded rather than skipped, so that a claim nothing could be planned for is visible',
      'instead of absent from the plan.',
      '',
      ...plan.unassigned.slice(0, limit).map((item) => `- \`${item.claim_id}\` — ${item.reason}`),
      '',
    );
  }

  lines.push(
    '### Claims planned',
    '',
    '| Plan | Technique | Carrier | Oracle independence | Expected red |',
    '|---|---|---|---|---|',
    ...plan.entries.slice(0, limit).map((entry) => (
      `| \`${entry.counterexample_plan_id}\` | ${entry.technique ?? '(none)'} | \`${entry.target.carrier}\` | `
      + `${entry.oracle_independence ?? '(none)'} | ${entry.expected_red} |`
    )),
    '',
  );
  return lines.join('\n');
}
