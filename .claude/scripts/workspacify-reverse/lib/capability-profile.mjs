// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
/**
 * R8 — what the analysis can prove, and what it cannot.
 *
 * Whether reverse engineering succeeded is a judgement a human makes after
 * several loop rounds, so the machine's whole job here is to state its own
 * limits precisely enough that the judgement can be made from the page rather
 * than from the code. Five dimensions answer the five questions a reader asks
 * before deciding whether to continue: what can be proved, what cannot, how
 * observable the system is, how falsifiable the claims are, and where risk
 * concentrates.
 *
 * Every dimension carries both halves. A dimension that reports only what it
 * found reads as a capability statement, and a reader who cannot see the limit
 * will assume there is none — which is how a partial analysis becomes an
 * authoritative one. A dimension that could not be measured says so and stays
 * in the list: dropping it would allow a gap in the analysis to read as a clean
 * result, and "we did not look" is a different fact from "there is nothing
 * there".
 *
 * There is no `eligible` field and no verdict of any kind. A score would look
 * objective while encoding a threshold nobody chose (ABOUT-REVERSE 7.7.2), so
 * the profile presents material and the human picks the menu.
 */
export const CAPABILITY_PROFILE_STAGE = 'r8';

/** The five questions a reader needs answered before deciding to continue. */
export const CAPABILITY_DIMENSIONS = Object.freeze([
  'provable',
  'unprovable',
  'observability',
  'falsifiability',
  'risk_concentration',
]);

/** Each dimension's question, in the reader's own words. */
export const CAPABILITY_QUESTIONS = Object.freeze({
  provable: 'What can the analysis prove?',
  unprovable: 'What can it not prove?',
  observability: 'How observable is the system?',
  falsifiability: 'How falsifiable are its claims?',
  risk_concentration: 'Where does risk concentrate?',
});

/** What a dimension says when the channel that would settle it never ran. */
const UNMEASURED =
  'This dimension was not measured: the stage that supplies its material did not run, so there is nothing '
  + 'to prove anything from and nothing to prove it against. Running that stage would settle it.';

/** One dimension, with both halves of the statement and the material behind them. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function dimensionOf(name, parts) {
  const { canProve, cannotProve, evidence, determined, undeterminedReason = null } = parts;
  const entry = {
    dimension: name,
    question: CAPABILITY_QUESTIONS[name],
    can_prove: canProve,
    cannot_prove: cannotProve,
    evidence,
    determined,
  };
  if (!determined) entry.undetermined_reason = undeterminedReason ?? UNMEASURED;
  return entry;
}

/** A pluralised count, so a sentence about one claim does not read as a template. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function countOf(value, noun) {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

/** What can be proved, from the claims the ledger settled and the evidence under them. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function provableDimension(analysis) {
  const ledger = analysis.ledger;
  if (ledger === null || ledger === undefined) {
    return dimensionOf('provable', {
      canProve: UNMEASURED,
      cannotProve: 'No claim was classified, so nothing is proved and nothing is refuted.',
      evidence: ['the claim ledger was not built in this run'],
      determined: false,
    });
  }

  const byClass = ledger.byClass ?? {};
  const observed = byClass.observed ?? 0;
  const normative = byClass.normative ?? 0;
  const evidenceCount = (ledger.claims ?? []).reduce((total, claim) => total + (claim.evidence ?? []).length, 0);
  const independent = ledger.independence?.independentCount ?? 0;

  return dimensionOf('provable', {
    canProve:
      `${countOf(observed, 'claim')} were read from the source text and carry `
      + `${countOf(evidenceCount, 'evidence record')}, folding to ${countOf(independent, 'independent component')}. `
      + `${countOf(normative, 'clause')} rest on a recorded human decision. Those are proved, under the tree `
      + 'hash this run fixed.',
    cannotProve:
      'No claim about runtime behaviour, dynamic dispatch, post-preprocessing composition or generated code is '
      + 'proved here: each of those needs execution, build or trace evidence, and this run gathered evidence '
      + 'from the source text alone.',
    evidence: [
      `observed ${observed}, inferred ${byClass.inferred ?? 0}, normative ${normative}, unresolved ${byClass.unresolved ?? 0}`,
      ledger.independence === undefined
        ? 'evidence independence was not folded in this run'
        : `${ledger.independence.foldedAway} record(s) folded into another and therefore count once`,
    ],
    determined: true,
  });
}

/** What cannot be proved, named as bounded rather than left open. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function unprovableDimension(analysis) {
  const ledger = analysis.ledger;
  const channels = ledger?.unavailableChannels ?? [];
  // The unobserved regions are the gap register's own count, read from the same
  // place the risk dimension reads it. Deriving them anywhere else would allow
  // two dimensions of one profile to disagree about the same number.
  const unobservedRegions = analysis.gaps?.by_kind?.unobserved_surface ?? 0;

  return dimensionOf('unprovable', {
    canProve:
      'The unprovable set is bounded rather than open: it is exactly the regions the unobserved entries name. '
      + `${countOf(unobservedRegions, 'region')} were recorded as not looked at, which is a stated limit and `
      + 'not an empty set.',
    cannotProve:
      'A region that was not observed cannot be shown to be empty. The absence of a finding in an unobserved '
      + 'region is absence of evidence, and reading it as evidence of absence is the failure this dimension '
      + 'exists to prevent.',
    evidence: channels.length === 0
      ? ['every analysis channel this run needed was available; the limits are the ones the unobserved entries name']
      : channels.map((channel) => `${channel.channel} unavailable: ${channel.reason}`),
    determined: ledger !== null && ledger !== undefined,
    undeterminedReason: ledger === null || ledger === undefined
      ? 'No ledger was built, so the regions that were not looked at cannot be enumerated.'
      : null,
  });
}

/** How observable the system is, from the execution surface that was measured. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function observabilityDimension(analysis) {
  const surface = analysis.surface;
  if (surface === null || surface === undefined) {
    return dimensionOf('observability', {
      canProve: UNMEASURED,
      cannotProve:
        "Whether the system's execution surface is observable cannot be stated at all while no "
        + 'execution-surface measurement exists: the import graph does not stand in for execution coupling.',
      evidence: ['the R2.5 execution-surface measurement did not run'],
      determined: false,
      undeterminedReason:
        'The execution surface was not measured, so how observable this system is cannot be determined from '
        + 'what this run gathered.',
    });
  }

  const entrypoints = surface.entrypoints ?? [];
  const mechanisms = surface.mechanisms ?? [];

  return dimensionOf('observability', {
    canProve:
      `${countOf(entrypoints.length, 'entrypoint')} and ${countOf(mechanisms.length, 'activation mechanism')} `
      + 'were found by reading the source, so the paths into this system that leave a static trace are known.',
    cannotProve:
      'Mechanisms that leave no static trace — a dispatch decided at run time, a plugin resolved from '
      + 'configuration, a handler registered by a framework — are invisible to a static reading and are not '
      + 'counted above.',
    evidence: [
      `${countOf(entrypoints.length, 'entrypoint')}, ${countOf(mechanisms.length, 'mechanism')}`,
      'the import graph is not treated as a proxy for execution coupling',
    ],
    determined: true,
  });
}

/** How falsifiable the claims are, from the plan that says what would refute them. */
// [::TICKET::] P22-8, P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(P22-8|P23-7) --for-spec --no-implementation-order`.
function falsifiabilityDimension(analysis) {
  const redPlan = analysis.redPlan;
  if (redPlan === null || redPlan === undefined) {
    return dimensionOf('falsifiability', {
      canProve: UNMEASURED,
      cannotProve:
        'No claim has been paired with an observation that would refute it, so none of them is falsifiable yet.',
      evidence: ['the R6 red-reconstruction plan did not run'],
      determined: false,
      undeterminedReason:
        'The red plan was not produced, so whether these claims can be refuted is not yet determined.',
    });
  }

  const entries = redPlan.entries ?? [];
  const unassigned = redPlan.unassigned ?? [];
  const strong = redPlan.oracle_independence_counts?.strong ?? 0;
  const counts = analysis.counterexamples?.counts ?? null;

  // The channel's own counts replace the plan's promise as the evidence once R6.5
  // has run. A plan says what would refute each claim; the counts say how many of
  // those attempts were actually made, which is the question this dimension asks.
  const executedEvidence = counts === null
    ? redPlan.environment?.available === false
      ? 'no execution environment exists in this run, and every plan records that'
      : 'the execution environment was available'
    : `${countOf(counts.executedCount, 'counterexample')} executed and ${counts.refusedCount} refused`;

  return dimensionOf('falsifiability', {
    canProve:
      `${countOf(entries.length, 'claim')} carry a plan naming the technique and the observation that would `
      + `refute them, so each is falsifiable in principle. Of those, ${strong} rest on an oracle independent `
      + `of the implementation. ${countOf(counts?.executedCount ?? 0, 'counterexample')} were actually `
      + 'executed, and each records whether the red appeared.',
    cannotProve:
      counts === null
        ? 'Whether any plan can actually be executed is not settled by planning it. No isolated environment '
          + 'exists in this run, so a plan that has never run refutes nothing yet — and a red result, once '
          + 'obtained, is evidence rather than an automatic conclusion that the specification was wrong.'
        : `${countOf(counts.refusedCount, 'counterexample')} could not be executed and ${counts.executedCount} `
          + 'produced no red, and neither is a statement that the claims hold: a red result, once obtained, is '
          + 'evidence rather than an automatic conclusion that the specification was wrong.',
    evidence: [
      `${countOf(entries.length, 'planned claim')}; ${unassigned.length} had no applicable technique`,
      executedEvidence,
      ...(counts === null ? [] : [`refusals by reason: ${describeRefusalCounts(counts.refusedByReason)}`]),
    ],
    determined: true,
  });
}

/** The refusal counts as one readable phrase, or the statement that there were none. */
// [::TICKET::] P23-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P23-7 --for-spec --no-implementation-order`.
function describeRefusalCounts(refusedByReason) {
  const named = Object.entries(refusedByReason ?? {})
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${reason}: ${count}`);
  return named.length === 0 ? 'none' : named.join(', ');
}

/** Where risk concentrates, from the gaps the analysis found and where it found them. */
// [::TICKET::] P22-8 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-8 --for-spec --no-implementation-order`.
function riskConcentrationDimension(analysis) {
  const gaps = analysis.gaps;
  if (gaps === null || gaps === undefined) {
    return dimensionOf('risk_concentration', {
      canProve: UNMEASURED,
      cannotProve:
        'No gap was enumerated, so where risk concentrates cannot be located — and a small number of gaps is '
        + 'not a statement that the system is sound.',
      evidence: ['the R5 gap enumeration did not run'],
      determined: false,
      undeterminedReason:
        'The gap register was not produced, so the concentration of risk across the tree is not determined.',
    });
  }

  const byKind = gaps.by_kind ?? {};
  const kinds = Object.keys(byKind).sort();
  const total = gaps.gap_count ?? 0;

  return dimensionOf('risk_concentration', {
    canProve:
      `${countOf(total, 'gap')} were enumerated across ${countOf(kinds.length, 'kind')}, so the kinds that `
      + 'dominate are known and the regions carrying them can be read from the register.',
    cannotProve:
      'Whether that concentration is acceptable is not a question the analysis answers. The count is material; '
      + 'the judgement belongs to the reader, and a small count is not evidence that the system is sound.',
    evidence: kinds.length === 0
      ? ['no gap of any kind was found, which is a measurement rather than a clearance']
      : kinds.map((kind) => `${kind}: ${byKind[kind]}`),
    determined: true,
  });
}

/**
 * The profile, built from the analysis that ran.
 *
 * @param {{ledger?: object, gaps?: object, surface?: object, redPlan?: object}} analysis
 */
export function buildCapabilityProfile(analysis = {}) {
  if (analysis === null || typeof analysis !== 'object') {
    throw new Error('a capability profile is built from the analysis that ran; it was given nothing to read');
  }

  return {
    stage: CAPABILITY_PROFILE_STAGE,
    dimensions: {
      provable: provableDimension(analysis),
      unprovable: unprovableDimension(analysis),
      observability: observabilityDimension(analysis),
      falsifiability: falsifiabilityDimension(analysis),
      risk_concentration: riskConcentrationDimension(analysis),
    },
    note:
      'These five dimensions are material for a decision, not the decision: which of these limits a project '
      + "can tolerate depends on its domain and its obligations, and that is a human's to judge.",
  };
}

/**
 * The profile as the Markdown a reader takes in before deciding.
 *
 * The JSON beside it carries the same five dimensions for a machine to gate on
 * structure; this is the form a person reads, so it states each dimension's two
 * halves in full sentences rather than leaving them to be reconstructed from
 * field names.
 */
export function renderCapabilityProfile(profile) {
  const lines = [
    '## Capability profile',
    '',
    profile.note,
    '',
  ];

  for (const name of CAPABILITY_DIMENSIONS) {
    const dimension = profile.dimensions[name];
    lines.push(`### ${name} — ${dimension.question}`, '');
    if (!dimension.determined) {
      lines.push(`**Undetermined.** ${dimension.undetermined_reason}`, '');
    }
    lines.push(`- **Can be proved**: ${dimension.can_prove}`);
    lines.push(`- **Cannot be proved**: ${dimension.cannot_prove}`);
    lines.push('- **Material**:');
    for (const item of dimension.evidence) lines.push(`  - ${item}`);
    lines.push('');
  }

  lines.push(
    'No dimension above is combined into a verdict, and no fixed threshold routes this run: the material is',
    'presented so that a human can choose how far to proceed.',
    '',
  );

  return lines.join('\n');
}
