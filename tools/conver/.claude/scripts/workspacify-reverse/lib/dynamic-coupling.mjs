/**
 * R2.5's dynamic half — what a session observed, and the difference from the
 * static reading.
 *
 * The static reading enumerates the entrances to dynamic behaviour and cannot
 * say which binding runs. That is rule R-1's whole premise: `observed` may only
 * mean a fact read from the source text or its syntax tree, so a mechanism the
 * static reading lists can never be promoted by it. This module is the other
 * channel — a session, inside a disposable copy, that the record can be built
 * from — and the difference between the two surfaces.
 *
 * Three things are deliberately absent from what it publishes.
 *
 * A mechanism the session did not exercise is not reported as absent from the
 * program. The static instrument's own words are "evidence of presence, not
 * proof of absence", and a session inherits that limit rather than lifting it:
 * it states what it ran, and the mechanisms it did not reach are recorded as
 * not exercised in this session. There is no fourth state meaning "the program
 * does not do this", because no run of one workload can establish it.
 *
 * A mechanism realised before a binary exists is not claimed to be observable.
 * `DYNAMIC_CHANNEL_REACH` declares, per mechanism kind, the construct kind the
 * channel would observe it as, or `null` with the reason — a compile-time
 * embedding, a macro expansion, a cfg selection and generated code all happen
 * while the program is being built, so a session of the built program has
 * nothing to look at. Those rows are reported as not reachable by this channel
 * with that reason rather than silently counted as exercised-and-missing.
 *
 * An empty difference is not published as agreement. A `dynamicOnly` set of
 * zero means this session ran nothing the static reading had failed to list,
 * which is a statement about the session. The design's §2.4 rule is quoted in
 * every caveat: "a difference of zero, or a disagreement of zero, can be a
 * signal of abnormality rather than of health".
 *
 * @see docs/ABOUT-REVERSE.md §6.2 (measure-dynamic-coupling, 80% deterministic)
 * @see docs/WORKSPACIFY-4-PATTERNS-COMPLETE-DESIGN.md §2.4 (a difference of zero can be a signal)
 */
import { recordAttempt } from './analysis-tech.mjs';
import { compareText } from './holdout-ledger.mjs';
import { validateDynamicSurface } from './dynamic-surface.mjs';
import { recordReplay, verifyReplay } from './record-replay.mjs';
import {
  START_PLAN_ECOSYSTEMS,
  assertSubjectUntouched,
  collectDynamicEvidence,
  createSandbox,
  detectStartPlan,
  disposeSandbox,
  startSession,
} from './sandbox.mjs';

/** The stage this measurement is R2.5's output of. */
export const DYNAMIC_COUPLING_STAGE = 'r2.5';

/**
 * The three states a listed mechanism may be in.
 *
 * The first is what the channel exists to earn. The other two are the two
 * different reasons a mechanism is not in it, and they are kept apart because
 * "this session did not reach it" and "no session can reach it" ask a reader
 * for different things.
 */
export const DYNAMIC_MECHANISM_STATUSES = Object.freeze([
  'observed_dynamically',
  'not_exercised_in_session',
  'not_reachable_by_channel',
]);

/** The three sets the difference is published as, in the order a reader reads them. */
export const DYNAMIC_DIFFERENCE_SETS = Object.freeze(['both', 'staticOnly', 'dynamicOnly']);

/** Why the dynamic channel did not run, when it did not. */
export const DYNAMIC_CHANNEL_REASONS = Object.freeze({
  noStartPlan: 'no-start-plan',
  sessionFailed: 'session-failed',
  recordInvalid: 'dynamic-record-invalid',
  replayInvalid: 'replay-invalid',
  subjectTouched: 'subject-touched',
});

/**
 * When each mechanism kind is realised, and therefore whether a session can see it.
 *
 * `construct` names the member of `DYNAMIC_CONSTRUCT_KINDS` through which the
 * channel would observe this kind — the shared vocabulary, so that a second
 * language's extractor feeding the same table needs no schema change. `null`
 * means the mechanism is realised before a session can exist, and the reason
 * travels with it so a reader is told which physical fact put it out of reach
 * rather than being left with an unexplained zero.
 *
 * The four `null` rows are not an oversight of coverage. A build-time
 * embedding, a generator, a macro expansion and a cfg selection all resolve
 * while the program is being constructed: a session that runs the result can
 * observe the consequence and never the mechanism, so counting them as
 * "not exercised" would blame the workload for a limit of the channel.
 */
export const DYNAMIC_CHANNEL_REACH = Object.freeze({
  compile_time_embedding: Object.freeze({
    construct: null,
    reason: 'the compiler reads a build-time input while constructing the program, so a session of the built program has nothing to observe',
  }),
  code_generation: Object.freeze({
    construct: null,
    reason: 'a generator runs before the program exists, so a session of the built program has nothing to observe',
  }),
  conditional_compilation: Object.freeze({
    construct: null,
    reason: 'the compiler selects a branch while constructing the program, so the branch not taken is absent from everything a session runs',
  }),
  macro_expansion: Object.freeze({
    construct: null,
    reason: 'expansion happens before the program exists, so the expansion a session would observe is already gone by the time it runs',
  }),
  dynamic_dispatch: Object.freeze({ construct: 'reflective_name', reason: null }),
  ffi: Object.freeze({ construct: 'extern_binding', reason: null }),
  runtime_loading: Object.freeze({ construct: 'dynamic_load', reason: null }),
  config_driven: Object.freeze({ construct: 'compile_time_config', reason: null }),
  runtime_registration: Object.freeze({ construct: 'reflective_name', reason: null }),
  reflection: Object.freeze({ construct: 'reflective_name', reason: null }),
});

/** The declared start-plan ecosystems, named so a refusal says what was looked for. */
const SEARCHED_ECOSYSTEMS = Object.freeze(START_PLAN_ECOSYSTEMS.map((row) => row.id));

/** The statement every published difference carries, so zero is never read as agreement. */
export const DYNAMIC_COUPLING_CAVEAT =
  'A difference of zero, or a disagreement of zero, can be a signal of abnormality rather than of health. '
  + 'The dynamic channel reports what one bounded session ran, and an empty dynamicOnly set means this session '
  + 'ran nothing the static reading had failed to list — not that no mechanism hides from a static reading. '
  + 'A mechanism that ran and left no static trace is invisible here exactly as it is there.';

/** The statement a document carries when the channel never ran, so silence is not read as a clean result. */
export const DYNAMIC_CHANNEL_UNRUN_CAVEAT =
  'The dynamic channel did not run, so it has looked at nothing. The three difference sets are published empty '
  + 'because nothing was observed, and not because nothing was found: an unrun channel cannot disagree with the '
  + 'static reading, and its silence is not evidence about the program.';

/**
 * The evidence mode a run produces.
 *
 * Named as a literal because it is one of the frozen three-value vocabulary in
 * `dynamic-surface.mjs`, and the guard that keeps this module keyed on the right
 * one is the test asserting the mode is a member of `EVIDENCE_MODES`.
 */
const RUNTIME_DYNAMIC_MODE = 'runtime_dynamic';

/** The prefix that identifies a difference member the static reading has no mechanism for. */
const DYNAMIC_ONLY_PREFIX = 'dynamic:';

/** The configuration a dynamic attempt is recorded under, so a reader finds it in the one ledger. */
const DYNAMIC_ATTEMPT_CONFIGURATION = 'sandboxed-session';

/** The tool a dynamic attempt is recorded under. */
const DYNAMIC_ATTEMPT_TOOL = 'bounded-offline-start-plan';

/** A channel that did not run, in the shape every caller reads. */
// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
function notRun(reason, detail) {
  return Object.freeze({
    ran: false,
    reason,
    detail,
    sessionId: null,
    session: null,
    record: null,
    replay: null,
  });
}

/**
 * A failure as one line, so the reason a reader is given names what actually broke.
 *
 * The machine-readable part leads when there is one: a sandbox error carries a
 * `reason` and a filesystem error carries a `code`, and both are what a reader
 * greps for. The prose follows it because the code alone does not say which
 * file or which directory was refused.
 */
// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
function describeError(error) {
  if (!(error instanceof Error)) return String(error);
  const code = error.reason ?? error.code ?? null;
  return code === null ? `${error.name}: ${error.message}` : `${code}: ${error.message}`;
}

/**
 * Throw a session's copy away, and report whether it went.
 *
 * A directory that will not go away is a leak rather than a wrong measurement,
 * so this never raises: raising out of a cleanup path would replace the reason
 * the caller is about to read with a stack trace, which is the failure the
 * whole channel is written to avoid. Because it reports rather than throws, the
 * one handle the sandbox refuses to dispose — a forged one — is what the
 * refusal path is tested with.
 */
export function disposeAndReport(handle) {
  try {
    disposeSandbox(handle);
    return { disposed: true, reason: null };
  } catch (error) {
    return { disposed: false, reason: describeError(error) };
  }
}

/**
 * The session's outcome, once a sandbox exists: run it, then read every check.
 *
 * Split from the disposal so that the checks read as the one sentence they are —
 * start a session, validate what it produced, verify the replay, confirm the
 * subject did not move — and so that a caller can see where the outcome stops
 * depending on the sandbox still existing.
 */
// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
function sessionOutcomeIn(handle, sandboxOptions, startPlan) {
  const session = startSession(handle, { tier: sandboxOptions.tier ?? null });
  const record = collectDynamicEvidence(handle, session, {
    observations: sandboxOptions.observations ?? [],
    unobservedChannels: sandboxOptions.unobservedChannels,
  });

  const verdict = validateDynamicSurface(record);
  if (!verdict.valid) {
    return notRun(
      DYNAMIC_CHANNEL_REASONS.recordInvalid,
      `the dynamic record built from session ${session.sessionId} is refused by its own validator at field `
        + `"${verdict.errors[0].field}": ${verdict.errors[0].detail}`,
    );
  }

  const replay = recordReplay(session);
  const replayVerdict = verifyReplay(replay);
  if (!replayVerdict.valid) {
    return notRun(
      DYNAMIC_CHANNEL_REASONS.replayInvalid,
      `the record of session ${session.sessionId} does not replay: ${replayVerdict.errors[0].detail}`,
    );
  }

  const untouched = assertSubjectUntouched(handle);
  if (!untouched.untouched) {
    return notRun(
      DYNAMIC_CHANNEL_REASONS.subjectTouched,
      `the session moved ${untouched.changedPaths.join(', ')} in the subject it was copied from, so its evidence `
        + 'describes a tree that no longer holds the bytes it was measured against',
    );
  }

  return {
    ran: true,
    reason: null,
    detail: null,
    sessionId: session.sessionId,
    session,
    record,
    replay,
    startPlan,
  };
}

/**
 * Run the subject's own declared start command inside a disposable copy.
 *
 * Every way this can fail is a named reason rather than an exception: the
 * analysis is read-only over its subject and the dynamic channel is its
 * optional half, so a machine without the toolchain, without room for the copy
 * or without permission to make one must still produce a report that says the
 * channel did not run. That is why the catch below is total rather than
 * restricted to the sandbox's own error type — a filesystem refusal is as much
 * a reason the channel did not run as a missing toolchain is.
 *
 * What is never returned is a session that merely observed nothing: `ran` is
 * true only when a session started, its record validated, its replay verified
 * and the subject still held the bytes it held at creation. When a copy was
 * made, the outcome carries whether it was removed, because a leak is a fact
 * about the run rather than something a cleanup path may decide silently.
 */
export function observeDynamically({ root, sandboxOptions = {} } = {}) {
  const detection = detectStartPlan(root, sandboxOptions);
  let handle = null;
  let outcome;

  if (detection.plan === null) {
    outcome = notRun(
      DYNAMIC_CHANNEL_REASONS.noStartPlan,
      `${detection.reason} The ecosystems searched were ${SEARCHED_ECOSYSTEMS.join(', ')}`,
    );
  } else {
    try {
      handle = createSandbox(root, sandboxOptions);
      outcome = sessionOutcomeIn(handle, sandboxOptions, detection.plan);
    } catch (error) {
      outcome = notRun(DYNAMIC_CHANNEL_REASONS.sessionFailed, describeError(error));
    }
  }

  return Object.freeze(
    handle === null ? outcome : { ...outcome, disposal: disposeAndReport(handle) },
  );
}

/** The runtime constructs a record holds, deduplicated, in the order they first appear. */
// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
function runtimeObservationsOf(dynamicRecord) {
  const seen = new Map();
  for (const observation of dynamicRecord.observations) {
    if (observation.evidence_mode !== RUNTIME_DYNAMIC_MODE) continue;
    if (!seen.has(observation.kind)) seen.set(observation.kind, []);
    seen.get(observation.kind).push(observation);
  }
  return seen;
}

/**
 * The state of one listed mechanism, and the evidence that put it there.
 *
 * A mechanism outside the declared reach table is reported as unmatched as well
 * as unreachable: a kind this channel has never been taught about is a finding
 * about the instrument — the shape a second language's extractor arrives in —
 * and guessing a construct for it would hide that.
 */
// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
function stateOfMechanism(mechanism, observedByConstruct, sessionId) {
  const reach = DYNAMIC_CHANNEL_REACH[mechanism.kind];
  if (reach === undefined) {
    return {
      status: 'not_reachable_by_channel',
      reason: `this channel declares no construct for the mechanism kind "${mechanism.kind}", so no session can place it`,
      evidence: null,
      observationCount: 0,
      unmatched: true,
    };
  }
  if (reach.construct === null) {
    return { status: 'not_reachable_by_channel', reason: reach.reason, evidence: null, observationCount: 0, unmatched: false };
  }

  const observations = observedByConstruct.get(reach.construct) ?? [];
  if (observations.length === 0) {
    return {
      status: 'not_exercised_in_session',
      reason: null,
      evidence: null,
      observationCount: 0,
      unmatched: false,
    };
  }

  return {
    status: 'observed_dynamically',
    reason: null,
    evidence: {
      kind: observations[0].kind,
      evidence_mode: observations[0].evidence_mode,
      statement: observations[0].statement,
      sessionId,
    },
    observationCount: observations.length,
    unmatched: false,
  };
}

/**
 * The difference between the mechanisms the static reading lists and what a session observed.
 *
 * The join is by construct kind, because that is the one identity both sides
 * can express: a mechanism is named by its syntax site, an observation by the
 * construct that was seen, and `DYNAMIC_CHANNEL_REACH` is where the two meet.
 * A construct the static reading has no mechanism for is published in
 * `dynamicOnly` under its own name rather than dropped, which is the case the
 * channel exists to find.
 *
 * A construct that was observed but carries no `runtime_dynamic` evidence does
 * not promote anything: the postcondition is that an observed mechanism carries
 * runtime evidence, and a build-time observation is not a run.
 */
export function diffSurfaces(staticMechanisms = [], dynamicRecord = { observations: [], runs: [] }) {
  const observedByConstruct = runtimeObservationsOf(dynamicRecord);

  const mechanisms = staticMechanisms
    .map((mechanism) => ({
      id: mechanism.id,
      static: {
        kind: mechanism.kind,
        file: mechanism.file,
        line: mechanism.line,
        spelling: mechanism.spelling,
        note: mechanism.note,
      },
      dynamic: stateOfMechanism(mechanism, observedByConstruct, dynamicRecord.session?.sessionId ?? null),
    }))
    .sort((left, right) => compareText(left.id, right.id));

  const observed = mechanisms.filter((item) => item.dynamic.status === 'observed_dynamically');
  const observedIds = new Set(observed.map((item) => item.id));
  const accounted = new Set(mechanisms.map((item) => DYNAMIC_CHANNEL_REACH[item.static.kind]?.construct).filter(Boolean));

  const both = observed;
  const staticOnly = mechanisms.filter((item) => !observedIds.has(item.id));
  const dynamicOnly = [...observedByConstruct.entries()]
    .filter(([constructKind]) => !accounted.has(constructKind))
    .map(([constructKind, observations]) => ({
      id: `${DYNAMIC_ONLY_PREFIX}${constructKind}`,
      kind: constructKind,
      evidence: {
        kind: constructKind,
        evidence_mode: observations[0].evidence_mode,
        statement: observations[0].statement,
        sessionId: dynamicRecord.session?.sessionId ?? null,
      },
    }))
    .sort((left, right) => compareText(left.id, right.id));

  const members = { both, staticOnly, dynamicOnly };
  return {
    mechanisms,
    difference: Object.fromEntries(
      DYNAMIC_DIFFERENCE_SETS.map((name) => [name, { count: members[name].length, members: members[name] }]),
    ),
    unmatched: mechanisms.filter((item) => item.dynamic.unmatched).map((item) => item.id),
  };
}

/**
 * R2.5's dynamic half, as one measurement.
 *
 * The call sequence is the sentence: observe the subject in a disposable copy,
 * diff what was seen against what was listed, and publish both with the caveat
 * that says what the difference is not.
 */
export function measureDynamicCoupling({ root, staticMechanisms = [], sandboxOptions = {} } = {}) {
  const channel = observeDynamically({ root, sandboxOptions });

  // An unrun channel has looked at nothing, so it places nothing: the three sets
  // are published empty and the per-mechanism rows are not emitted at all.
  // Diffing the static list against an empty record would publish every
  // mechanism as `not_exercised_in_session`, which is a finding this channel is
  // not entitled to — it never looked. The emptiness is the signal, and the
  // caveat says so.
  const { mechanisms, difference, unmatched } = channel.ran
    ? diffSurfaces(staticMechanisms, channel.record)
    : {
      mechanisms: [],
      difference: Object.fromEntries(DYNAMIC_DIFFERENCE_SETS.map((name) => [name, { count: 0, members: [] }])),
      unmatched: [],
    };

  const observedCount = mechanisms.filter((item) => item.dynamic.status === 'observed_dynamically').length;
  return {
    stage: DYNAMIC_COUPLING_STAGE,
    root,
    dynamicChannel: {
      ran: channel.ran,
      reason: channel.reason,
      detail: channel.detail,
      sessionId: channel.sessionId,
      // Whether the copy this channel measured inside was removed. A channel
      // that made no copy reports nothing here, and a channel that made one and
      // could not remove it says so rather than leaving a leak unrecorded.
      disposal: channel.disposal ?? null,
    },
    mechanisms,
    difference,
    unmatched,
    caveat: channel.ran ? DYNAMIC_COUPLING_CAVEAT : DYNAMIC_CHANNEL_UNRUN_CAVEAT,
    attempts: buildDynamicAttemptRows({
      root,
      ran: channel.ran,
      reason: channel.reason,
      observedCount,
      subjectFiles: staticMechanisms.length,
    }),
  };
}

/**
 * The dynamic channel's attempt, in the same ledger every other attempt lives in.
 *
 * A channel that did not run is recorded as `skipped` and not as `failed`: the
 * ledger's `couldNotRunCount` counts attempts that could not run, and an
 * instrument that declined to run for a stated reason is a different thing from
 * an analyser that broke. The reason travels on the row either way, so "the
 * dynamic channel was never attempted here" is readable in the same place as
 * every other attempt's outcome.
 */
export function buildDynamicAttemptRows({ root, ran, reason, observedCount = 0, subjectFiles = 0 }) {
  return [
    recordAttempt({
      target: root,
      configuration: DYNAMIC_ATTEMPT_CONFIGURATION,
      tool: DYNAMIC_ATTEMPT_TOOL,
      outcome: {
        phase: 'execute',
        status: ran ? 'success' : 'skipped',
        extractedCount: ran ? observedCount : 0,
        reason: ran ? null : reason,
      },
    }),
  ];
}

/** The mechanism kinds the channel cannot reach, grouped with their reason. */
// [::TICKET::] P23-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-6 --for-spec --no-implementation-order`.
function unreachableReasons(mechanisms) {
  const byReason = new Map();
  for (const item of mechanisms) {
    if (item.dynamic.status !== 'not_reachable_by_channel') continue;
    if (!byReason.has(item.dynamic.reason)) byReason.set(item.dynamic.reason, []);
    byReason.get(item.dynamic.reason).push(item.static.kind);
  }
  return [...byReason.entries()].map(([reason, kinds]) => ({ reason, kinds: [...new Set(kinds)].sort(compareText) }));
}

/**
 * The coupling as the Markdown a reader decides from.
 *
 * The order is what a reader needs in the order they need it: whether the
 * channel ran at all, then what it exercised, then what it did not and why, then
 * the difference, and last the statement that an empty third set is a signal.
 */
export function renderDynamicCoupling(measurement) {
  const lines = [
    '# R2.5 — the static/dynamic coupling difference',
    '',
    `Stage: \`${measurement.stage}\`. Subject: \`${measurement.root}\`.`,
    '',
    '> ' + measurement.caveat,
    '',
    '## The dynamic channel',
    '',
  ];

  if (measurement.dynamicChannel.ran) {
    lines.push(`A session ran: \`${measurement.dynamicChannel.sessionId}\`, inside a disposable copy of the subject.`);
    lines.push('The subject was digested before and after and did not move.');
  } else {
    lines.push(`The channel did not run. Reason: \`${measurement.dynamicChannel.reason}\`.`);
    lines.push('');
    lines.push(measurement.dynamicChannel.detail);
    lines.push('');
    lines.push('An unrun dynamic channel has looked at nothing. The difference below is empty for that reason,');
    lines.push('and not because the two surfaces were compared and agreed.');
  }

  // Nothing below is a statement about mechanisms when the channel did not run:
  // the rows are empty because nothing was placed, and an empty list rendered as
  // "None" or "Every kind is reachable" would be a claim made from no
  // measurement at all. The sections say what happened instead.
  if (!measurement.dynamicChannel.ran) {
    lines.push('');
    lines.push('## What the session exercised, and what it did not');
    lines.push('');
    lines.push('Neither question was asked. No session ran, so no mechanism was placed in any of the three states,');
    lines.push('and the sections that would report them are absent rather than empty.');
    lines.push('');
    return `${lines.join('\n')}\n`;
  }

  lines.push('', '## What the session exercised', '');
  const exercised = measurement.mechanisms.filter((item) => item.dynamic.status === 'observed_dynamically');
  if (exercised.length === 0) {
    lines.push('Nothing. The session ran the subject\'s own declared start command and observed no dynamic construct at run time.');
  } else {
    lines.push(
      'A mechanism is placed here when the session observed the construct kind its own kind resolves to. The join is '
        + 'by construct kind and not by source line, so every listed mechanism whose kind matches an observed '
        + 'construct is placed here together: the observation shows that this program exercises that construct, not '
        + 'that this particular line was executed. What was seen, and where, is in the dynamic record beside this '
        + 'document.',
    );
    lines.push('');
    for (const item of exercised) {
      lines.push(`- \`${item.id}\` — observed ${item.dynamic.observationCount} time(s) (\`${item.dynamic.evidence.evidence_mode}\`)`);
    }
  }

  lines.push('', '## What the session did not exercise', '');
  const notExercised = measurement.mechanisms.filter((item) => item.dynamic.status === 'not_exercised_in_session');
  lines.push(
    notExercised.length === 0
      ? 'None: every mechanism this channel can reach was exercised by this session.'
      : `${notExercised.length} mechanism(s) this channel can reach were not exercised by this session. `
        + 'That is a statement about the session\'s scope, not about the program: a mechanism this session did not '
        + 'reach has not been shown to be absent from the program.',
  );

  lines.push('', '## What this channel cannot reach at all', '');
  const unreachable = unreachableReasons(measurement.mechanisms);
  if (unreachable.length === 0) {
    lines.push('Every listed mechanism kind is reachable by this channel.');
  } else {
    for (const { reason, kinds } of unreachable) {
      lines.push(`- ${kinds.map((kind) => `\`${kind}\``).join(', ')} — ${reason}`);
    }
  }

  lines.push('', '## The difference between the two surfaces', '');
  for (const name of DYNAMIC_DIFFERENCE_SETS) {
    const set = measurement.difference[name];
    lines.push(`- \`${name}\`: ${set.count}`);
  }
  lines.push('');
  lines.push(
    'A `dynamicOnly` of zero is a signal rather than a clean result. A mechanism that ran and left no static trace '
      + 'is the case the static reading cannot see and the case this channel exists to find; a session that '
      + 'surfaced none of them has told a reader about its own scope and nothing about the program.',
  );

  if (measurement.unmatched.length > 0) {
    lines.push('', '## Mechanisms this instrument could not place', '');
    lines.push(
      'These are listed mechanisms whose kind the channel declares no construct for. They are reported rather '
        + 'than guessed at or dropped, because an unplaceable mechanism is a finding about the instrument.',
    );
    for (const id of measurement.unmatched) lines.push(`- \`${id}\``);
  }

  lines.push('');
  return lines.join('\n');
}
