/**
 * The shape of the answer a dynamic analysis is allowed to give.
 *
 * Static reading can enumerate the syntactic entrances to dynamic behaviour —
 * `extern` and `#[link]` and `include_*`, `macro_rules!`, `build.rs`, `cfg`,
 * trait objects, `unsafe` boundaries — but it cannot in general enumerate which
 * binding is realised at run time. So the surface is four-valued and never a
 * boolean, and the two ways the answer can lie are closed here rather than left
 * to a caller's discipline.
 *
 * The first lie is reporting "no dynamic mechanism" when the truth is "I did
 * not look there". An environment that only ever says "nothing found" makes the
 * absence of a search look like the absence of a mechanism, and it does so with
 * the authority of a run that actually executed. Three things prevent it: an
 * undeclared channel list is read as *nothing was looked at* rather than as
 * *everything was*; a named unlooked-at channel forbids the absence claim
 * outright; and a detected construct is stated as what was seen, with a
 * statement asserting absence refused by name.
 *
 * The second lie is a status that disagrees with the evidence filed under it.
 * The validator therefore re-derives the status from the observations and runs
 * rather than trusting the stated one, so a record cannot claim absence while
 * carrying a construct it saw.
 */
import { SandboxError } from './sandbox-error.mjs';

/** How a fact came to be known. Runtime behaviour is never `source_static`. */
export const EVIDENCE_MODES = Object.freeze(['source_static', 'build_semantic', 'runtime_dynamic']);

/** The four values a dynamic surface may hold. A boolean is not among them. */
export const DYNAMIC_SURFACE_STATUSES = Object.freeze([
  'absent_under_scanned_patterns',
  'syntactically_present_unresolved',
  'partially_resolved_under_configuration',
  'runtime_observed',
]);

export const DYNAMIC_SURFACE_CONFIDENCES = Object.freeze(['high', 'medium', 'low']);

/** The channels a scan can fail to look at. Naming one is how the gap is recorded. */
export const UNOBSERVED_CHANNEL_KINDS = Object.freeze([
  'process environment',
  'generated files unavailable',
  'unresolved reflective name',
  'missing compilation database',
]);

/** The dynamic constructs a static scan can see the entrance to. */
export const DYNAMIC_CONSTRUCT_KINDS = Object.freeze([
  'dynamic_load',
  'reflective_name',
  'extern_binding',
  'macro_expansion',
  'generated_code',
  'compile_time_config',
]);

/**
 * Phrases that assert a mechanism is absent.
 *
 * A detected construct is stated as what was seen. The other phrasing is the
 * unobserved-absence failure with a machine-checkable shape, and it is worse
 * than a wording slip because it reads as a finding.
 */
export const ABSENCE_ASSERTION_PATTERNS = Object.freeze([
  /\bthere is no\b/i,
  /\bthere are no\b/i,
  /\bno dynamic (load|loads|loading|import|imports|dispatch|dispatches|mechanism|mechanisms|behaviou?r|behaviours)\b/i,
  /\bno (reflection|reflective|dlopen)\b/i,
  /\babsence of\b/i,
  /\bnothing (was |were |is |has been )?(found|detected|observed)\b/i,
  /\bnone (was|were) found\b/i,
  /\bdoes not (load|import|use|exist|contain)\b/i,
  /\bnot present\b/i,
]);

/** The confidence a status implies when the caller states none. */
const CONFIDENCE_BY_STATUS = Object.freeze({
  runtime_observed: 'high',
  absent_under_scanned_patterns: 'high',
  partially_resolved_under_configuration: 'medium',
  syntactically_present_unresolved: 'low',
});

/**
 * The channels a caller says it did not look at.
 *
 * A caller who did not say has not said that every channel was looked at, so
 * the missing declaration is read as the missing search. Reading it the other
 * way would hand out an absence claim nobody made, which is the failure this
 * whole module exists to prevent.
 */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function resolveUnobservedChannels(declared) {
  if (Array.isArray(declared)) return [...declared];
  return [...UNOBSERVED_CHANNEL_KINDS];
}

/**
 * Whether an observation records something that did not resolve.
 *
 * An explicit `unresolved` wins; otherwise a construct whose specifier or
 * symbol was never stated counts as unresolved, because a construct nobody
 * could name is not a construct that was resolved.
 */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function observationIsUnresolved(observation) {
  if (typeof observation?.unresolved === 'boolean') return observation.unresolved;
  if (observation?.kind === 'reflective_name') return (observation.symbol ?? null) === null;
  return (observation?.specifier ?? null) === null;
}

/**
 * State a detected construct as what was seen.
 *
 * The phrasing is the point: a variable module specifier is recorded as "a
 * dynamic load call exists and its specifier is not statically resolvable",
 * never as "there is no dynamic loading". The second is a conclusion nobody
 * drew; the first is a fact somebody observed.
 */
export function describeDynamicConstruct({ kind, specifier = null, symbol = null } = {}) {
  if (!DYNAMIC_CONSTRUCT_KINDS.includes(kind)) {
    throw new SandboxError(
      'construct-kind-unknown',
      `the construct kind "${kind}" is not one of ${DYNAMIC_CONSTRUCT_KINDS.join(', ')}`,
    );
  }
  const named = specifier ?? null;
  const symbolName = symbol ?? null;

  if (kind === 'dynamic_load') {
    return named === null
      ? 'a dynamic load call exists and its specifier is not statically resolvable'
      : `a dynamic load call exists and its specifier resolves statically to "${named}"`;
  }
  if (kind === 'reflective_name') {
    return symbolName === null
      ? 'a reflective name lookup exists and the name it resolves is not statically determinable'
      : `a reflective name lookup exists and it names "${symbolName}"`;
  }
  if (kind === 'extern_binding') {
    return named === null
      ? 'an extern binding declaration exists and the library it binds to is not statically determinable'
      : `an extern binding declaration exists and it binds to "${named}"`;
  }
  if (kind === 'generated_code') {
    return named === null
      ? 'a generator is configured to produce code and the produced file is not available in the tree'
      : `a generator is configured to produce the file "${named}"`;
  }
  if (kind === 'macro_expansion') {
    return 'a macro invocation exists and the code it expands to is not statically determinable from the invocation site';
  }
  return 'a compile-time configuration gate exists and the branch it selects is not statically determinable without the build configuration';
}

/** Expand an observation into the stored shape, deriving a statement when none was given. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function expandObservation(observation) {
  return {
    kind: observation.kind,
    statement: observation.statement ?? describeDynamicConstruct(observation),
    evidence_mode: observation.evidence_mode ?? 'source_static',
    unresolved: observationIsUnresolved(observation),
  };
}

/**
 * Derive the status of a dynamic surface from what was seen and what was not.
 *
 * A channel that was never looked at forbids the absence claim: the honest
 * answer there is that the surface was resolved only partially, under the
 * configuration that was actually scanned.
 *
 * A run counts as well as an observation. A task that ran the target at runtime
 * holds runtime evidence whether or not it also managed to name the construct
 * it exercised, and reading only the observations would let such a run report
 * an absence it had already disproved.
 */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function deriveDynamicSurfaceStatus(observations, unobservedChannelCount, runs) {
  const atRuntime =
    observations.some((observation) => observation.evidence_mode === 'runtime_dynamic') ||
    runs.some((run) => run.evidence_mode === 'runtime_dynamic');
  if (atRuntime) {
    return 'runtime_observed';
  }
  if (observations.some((observation) => observation.unresolved === false)) {
    return 'partially_resolved_under_configuration';
  }
  if (observations.some((observation) => observation.unresolved === true)) {
    return 'syntactically_present_unresolved';
  }
  if (unobservedChannelCount > 0) {
    return 'partially_resolved_under_configuration';
  }
  return 'absent_under_scanned_patterns';
}

/** The status a set of observations, channels and runs amounts to. */
// [::TICKET::] P22-18 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-18 --for-spec --no-implementation-order`.
function statusOfEvidence(observations, unobservedChannelCount, runs) {
  const normalised = observations.map((observation) => ({
    evidence_mode: observation?.evidence_mode ?? 'source_static',
    unresolved: observationIsUnresolved(observation ?? {}),
  }));
  return deriveDynamicSurfaceStatus(normalised, unobservedChannelCount, runs.map((run) => ({ evidence_mode: run?.evidence_mode })));
}

/**
 * Assemble a dynamic surface from the observations a caller holds.
 *
 * This derives rather than validates: a caller may build a record the validator
 * then refuses, which is how the shape is checked at the boundary rather than
 * trusted at the source.
 */
export function buildDynamicSurface(spec = {}) {
  const observations = spec.observations ?? [];
  const channels = resolveUnobservedChannels(spec.unobservedChannels);
  const sandboxId = spec.sandboxId ?? null;
  const session = spec.session ?? null;

  const expanded = observations.map((observation) => expandObservation(observation));
  const storedRuns = (spec.runs ?? []).map((run) => ({ ...run }));
  const status = deriveDynamicSurfaceStatus(expanded, channels.length, storedRuns);
  return {
    status,
    confidence: CONFIDENCE_BY_STATUS[status],
    unobserved_channels: channels,
    observations: expanded,
    runs: storedRuns,
    sandboxId,
    session,
  };
}

/**
 * The facts a dynamic surface is not allowed to get wrong.
 *
 * Each error names the field it is about and says what to do instead, because a
 * refusal a reader cannot act on is only marginally better than no refusal.
 *
 * The status is re-derived from the evidence rather than trusted. A record may
 * be assembled by hand, and one that states an absence while carrying a
 * construct it saw is precisely the report this module exists to refuse.
 */
export function validateDynamicSurface(record) {
  const errors = [];
  const status = record?.status;
  const channels = record?.unobserved_channels;
  const observations = record?.observations ?? [];
  const runs = record?.runs ?? [];
  const statusIsKnown = typeof status === 'string' && DYNAMIC_SURFACE_STATUSES.includes(status);

  if (!statusIsKnown) {
    errors.push({
      field: 'status',
      detail: `status must be one of ${DYNAMIC_SURFACE_STATUSES.join(', ')}, and never a boolean — got ${JSON.stringify(status)}`,
    });
  } else if (status === 'absent_under_scanned_patterns' && Array.isArray(channels) && channels.length > 0) {
    errors.push({
      field: 'status',
      detail: `status is "absent_under_scanned_patterns" while ${channels.map((c) => `"${c}"`).join(', ')} is named as unobserved — an unlooked-at channel is not a clean one, so the absence claim cannot be made for it`,
    });
  }

  if (!DYNAMIC_SURFACE_CONFIDENCES.includes(record?.confidence)) {
    errors.push({
      field: 'confidence',
      detail: `confidence must be one of ${DYNAMIC_SURFACE_CONFIDENCES.join(', ')} — got ${JSON.stringify(record?.confidence)}`,
    });
  }

  if (!Array.isArray(channels)) {
    errors.push({ field: 'unobserved_channels', detail: 'unobserved_channels must be a list, empty when every channel was looked at' });
  } else {
    const unknown = channels.filter((channel) => !UNOBSERVED_CHANNEL_KINDS.includes(channel));
    if (unknown.length > 0) {
      errors.push({
        field: 'unobserved_channels',
        detail: `unobserved_channels must name the declared kinds ${UNOBSERVED_CHANNEL_KINDS.map((k) => `"${k}"`).join(', ')} — got ${unknown.map((c) => `"${c}"`).join(', ')}`,
      });
    }
  }

  if (statusIsKnown && Array.isArray(channels)) {
    const derived = statusOfEvidence(observations, channels.length, runs);
    if (status !== derived) {
      errors.push({
        field: 'status',
        detail: `the evidence filed under this record amounts to "${derived}", so it cannot be reported as "${status}" — a status that disagrees with its own evidence is the report this validator exists to refuse`,
      });
    }
  }

  for (const observation of observations) {
    const statement = observation?.statement ?? '';
    if (ABSENCE_ASSERTION_PATTERNS.some((pattern) => pattern.test(statement))) {
      errors.push({
        field: 'observations',
        detail: `the statement "${statement}" asserts that a mechanism is absent; a detected construct is stated as what was seen — write it as the call that exists and the name that did not resolve, which names what was seen`,
      });
    }
  }

  for (const run of runs) {
    if (!EVIDENCE_MODES.includes(run?.evidence_mode)) {
      errors.push({
        field: 'runs',
        detail: `every run that backs this surface carries an evidence_mode from ${EVIDENCE_MODES.join(', ')} — got ${JSON.stringify(run?.evidence_mode)}`,
      });
    }
  }

  const runtimeEvidence =
    observations.some((observation) => observation?.evidence_mode === 'runtime_dynamic') ||
    runs.some((run) => run?.evidence_mode === 'runtime_dynamic');
  const sessionNamesARun = typeof record?.session?.sessionId === 'string' && record.session.sessionId.length > 0;
  if (runtimeEvidence && !sessionNamesARun) {
    errors.push({
      field: 'session',
      detail: 'runtime evidence makes the status "runtime_observed", and a runtime_observed record names the session it came from so the evidence is traceable to a reproducible run',
    });
  }
  if (status === 'runtime_observed' && !sessionNamesARun) {
    errors.push({
      field: 'session',
      detail: 'a runtime_observed record names the session it came from so the evidence is traceable to a reproducible run, and none was named',
    });
  }

  return { valid: errors.length === 0, errors };
}

/** Render a dynamic surface as the Markdown a human reads before deciding. */
export function renderDynamicSurface(record) {
  const lines = ['## Dynamic surface', '', `Status: \`${record.status}\` — confidence ${record.confidence}.`];
  if (record.sandboxId) lines.push(`Sandbox: \`${record.sandboxId}\`.`);
  if (record.session?.sessionId) {
    lines.push(`Run: session \`${record.session.sessionId}\`, traceable to a reproducible run.`);
  }

  lines.push('', '### What was run', '');
  if (record.runs.length === 0) {
    lines.push('- Nothing was executed to back this surface.');
  } else {
    for (const run of record.runs) {
      lines.push(`- \`${run.command} ${run.args.join(' ')}\` exited ${run.exitCode} (${run.evidence_mode})`);
    }
  }

  lines.push('', '### What was seen', '');
  if (record.observations.length === 0) {
    lines.push('- The scanned patterns produced no construct to record.');
  } else {
    for (const observation of record.observations) {
      lines.push(`- ${observation.statement} (${observation.evidence_mode})`);
    }
  }

  lines.push('', '### What was not looked at', '');
  if (record.unobserved_channels.length === 0) {
    lines.push('- Every declared channel was looked at.');
  } else {
    for (const channel of record.unobserved_channels) {
      lines.push(`- ${channel}`);
    }
    lines.push('');
    lines.push('A channel above was left unlooked-at, so this record states only what the scan resolved and does not draw a conclusion about that channel.');
  }

  lines.push('');
  return lines.join('\n');
}
