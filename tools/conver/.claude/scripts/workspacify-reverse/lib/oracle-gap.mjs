// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
/**
 * R5.5 — is the oracle any good?
 *
 * A test suite written from the same design as the implementation agrees with it
 * by construction, so it cannot detect a divergence between the two. This stage
 * asks a sharper question than "did the tests pass": for each change the suite
 * did *not* detect, why not?
 *
 * Two things are kept strictly apart here.
 *
 * **Classifying a survivor is not deciding it is equivalent.** Equivalent-mutant
 * detection is undecidable in general, so this module only ever discards a mutant
 * that a normalised comparison positively decides, and it records *which rung of
 * the ladder* it stopped at. A rung-one discard and a rung-six discard are
 * different claims, and flattening them into the bare word "equivalent" is
 * exactly how an undecided mutant comes to be presented as a decided one. That is
 * why the rung is a required field rather than an explanation.
 *
 * **A mutation score is not contract coverage.** No score is emitted at all. A
 * survivor is a question about the oracle, not a failure of the implementation,
 * and a reader who took a score for coverage would be reading a measurement of
 * the tests as a measurement of the specification.
 *
 * The normaliser is the tree-sitter instrument P22-4 declared, not a new tool.
 * `docs/P22-ANALYSIS-TECH.md` §7 records that the per-language normalisers the
 * design names were never verified, and installing six language toolchains to
 * settle it is not this ticket's work. What tree-sitter gives is honest and
 * bounded: an AST-normalised match under a *named* configuration, which is what
 * rung three claims and nothing more.
 */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
import {
  TCE_LADDER_STEPS,
  UNKNOWN_LADDER_STEP,
  applyComparisonLadder,
  assertLadderClaimIsNamed,
  assertNoBareEquivalenceClaim,
  findUnnamedEquivalenceClaims,
  normaliseForComparison,
  renderLadderClaim,
  tceConfigurationFor,
  compareTrivially,
} from './tce.mjs';

// Re-exported so the consumers that already read these names from R5.5 keep
// working, and so there is one declaration rather than two. A second copy here
// would drift on spelling, and each consumer's tests would pass against its own.
export {
  TCE_LADDER_STEPS,
  UNKNOWN_LADDER_STEP,
  applyComparisonLadder,
  assertLadderClaimIsNamed,
  assertNoBareEquivalenceClaim,
  findUnnamedEquivalenceClaims,
  normaliseForComparison,
  renderLadderClaim,
  tceConfigurationFor,
};

/**
 * The survivor causes the design names, plus the one it requires when nothing fits.
 *
 * `unclassified` is not a seventh cause; it is the recorded absence of one. The
 * design forbids dropping a mutant that cannot be classified, so the fallback
 * has to be a value rather than an omission.
 */
export const SURVIVOR_CAUSES = Object.freeze([
  'equivalent',
  'unreachable',
  'insufficient_observation',
  'insufficient_oracle',
  'insufficient_input',
  'insufficient_environment',
  'unclassified',
]);

/**
 * The claim no mutation score supports.
 *
 * Constant rather than per-run, for the same reason the other caveats are: a
 * caveat that varies with the data invites reading it as a finding.
 */
export const MUTATION_SCORE_CAVEAT =
  'A mutation score measures how many injected changes the current tests detect. It is not a measure '
  + 'of contract coverage, and no score is emitted here. A survivor is a question about the oracle, '
  + 'not a failure of the implementation.';

/** The reason each unclassified survivor carries, so a reader is told what is missing. */
const UNCLASSIFIED_REASON =
  'no evidence about reachability, observation or inputs was collected for this mutant, so its cause '
  + 'is unknown rather than assumed — the dynamic channel is not available in this run';

/**
 * The cause a survivor's evidence supports, or `unclassified` when there is none.
 *
 * `equivalent` is deliberately unreachable from here. It is only ever assigned
 * by a normalised comparison that positively decided it, because inferring
 * equivalence from the shape of the evidence would be guessing at something the
 * design says is undecidable.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function causeOf(mutant) {
  if (mutant.reached === false) return 'unreachable';
  if (mutant.reached !== true) return 'unclassified';
  if (mutant.observed_by === false) return 'insufficient_observation';
  if (mutant.observed_by !== true) return 'unclassified';
  if (mutant.covered_inputs === 0) return 'insufficient_input';
  if (mutant.environment_matched === false) return 'insufficient_environment';
  if (typeof mutant.covered_inputs === 'number' && mutant.covered_inputs > 0 && mutant.environment_matched === true) {
    return 'insufficient_oracle';
  }
  return 'unclassified';
}

/** What each cause means, so a reader is not left to guess at the vocabulary. */
const CAUSE_REASON = Object.freeze({
  equivalent: 'a normalised comparison decided it, and the rung that decided it is recorded',
  unreachable: 'the mutated code was never executed, so no test could have detected the change',
  insufficient_observation: 'the code ran, but nothing read the value the mutant changed',
  insufficient_oracle: 'the code ran, the value was read, and no assertion distinguishes the two behaviours',
  insufficient_input: 'the code ran, and no input exercised the behaviour the mutant changed',
  insufficient_environment: 'the code ran, and the environment the mutant affects was never reproduced',
  unclassified: UNCLASSIFIED_REASON,
});

/** One survivor, with the cause this stage derived and the cause the record claimed. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function classifySurvivor(mutant) {
  const cause = causeOf(mutant);
  return {
    mutant_id: mutant.mutant_id ?? null,
    language: mutant.language ?? null,
    cause,
    // The cause the mutation record asserted, kept apart from the one derived
    // here: R5.5 does not take a producer's word for why its own mutant survived.
    declared_cause: mutant.declared_cause ?? null,
    reason: CAUSE_REASON[cause],
    ladder_step: mutant.ladder_step ?? null,
  };
}

/** Classify a survivor list that is already known to be non-empty. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function classifySurvivorList(survivors) {
  const results = survivors.map(classifySurvivor);
  const by_cause = {};
  for (const result of results) by_cause[result.cause] = (by_cause[result.cause] ?? 0) + 1;
  return { results, by_cause, unclassifiedCount: results.filter((result) => result.cause === 'unclassified').length };
}

/**
 * Classify each surviving mutant by cause.
 *
 * Mutation results are an input, not an output. R5.5 neither generates nor
 * executes mutants: that needs a build and a test run, and it belongs to the
 * stages that own execution. A run with no mutation results has nothing to
 * classify, and saying so is the honest answer.
 */
export function classifySurvivors(mutations) {
  if (!Array.isArray(mutations) || mutations.length === 0) {
    throw new Error(
      'mutation results must be supplied: R5.5 classifies survivors, and a run with no mutation '
      + 'results has nothing to classify. An empty list is refused rather than reported as a clean result.',
    );
  }

  const survivors = mutations.filter((mutant) => mutant.status === undefined || mutant.status === 'survived');
  const classified = classifySurvivorList(survivors);

  return {
    ...classified,
    // Mutants this stage did not classify as survivors: killed by the suite, or
    // positively discarded as equivalent by the comparison ladder.
    discardedCount: mutations.length - survivors.length,
    mutation_score_claim: MUTATION_SCORE_CAVEAT,
    contract_coverage_proved: false,
  };
}

/**
 * Discard the mutants a normalised comparison positively decides, and keep the rest.
 *
 * Only a decided equivalence discards. A mutant the normaliser cannot read stays
 * a survivor with `unclassified` as its cause, because discarding what could not
 * be decided is how a false clean result is manufactured.
 */
export function discardEquivalentMutants(mutants, { normaliser = normaliseForComparison } = {}) {
  const discarded = [];
  const survivors = [];

  for (const mutant of mutants ?? []) {
    const outcome = applyComparisonLadder({
      original: mutant.original,
      mutated: mutant.mutated,
      language: mutant.language,
      normaliser,
    });
    if (outcome.verdict !== 'equivalent') {
      survivors.push(mutant);
      continue;
    }
    discarded.push(assertLadderClaimIsNamed({
      mutant_id: mutant.mutant_id ?? null,
      verdict: 'equivalent',
      ladder_step: outcome.ladder_step,
      ...(outcome.configuration_id === undefined ? {} : { configuration_id: outcome.configuration_id }),
      reason: outcome.reason,
    }));
  }

  return {
    discarded,
    survivors: survivors.map((mutant) => ({ ...mutant, ...classifySurvivor(mutant) })),
  };
}

/** How many expansion sites a lineage records for its origin. */
export function countExpansionsOf(lineage) {
  return lineage.expansion_spans.length;
}

/** The source form a human maintains, as opposed to the expanded form a compiler sees. */
export function sourceFormOf(lineage) {
  return lineage.origin;
}

/** One span, or a list of them, normalised to a list. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function toSpans(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/** How a generator's call sites map onto its expansions. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function relationOf(originCount, expansionCount) {
  if (originCount === 1 && expansionCount === 1) return 'one_to_one';
  if (originCount === 1) return 'one_to_many';
  if (expansionCount === 1) return 'many_to_one';
  return 'many_to_many';
}

/**
 * Join the pre-expansion and post-expansion forms of one generated artefact.
 *
 * They are two objects, not one. The source form is what a human maintains: it
 * has its own location, its review surface and its design intent. The expanded
 * form is what name resolution and type checking actually see, and it is only
 * defined under a fixed configuration. Joining them through a one-to-one
 * assumption would lose the lineage whenever a macro call site expands to more
 * than one place, which is the ordinary case — this corpus has `build.rs` and
 * `wrapper.h`, so the many-to-many case is concrete rather than hypothetical.
 */
export function buildExpansionLineage({ origin_span, expansion_span, configuration_id, generator_identity }) {
  if (typeof generator_identity !== 'string' || generator_identity.length === 0) {
    throw new Error(
      'an expansion lineage must name its generator_identity: without it there is no record of which '
      + 'tool produced the second form, and the relation is an assertion rather than an observation',
    );
  }
  if (typeof configuration_id !== 'string' || configuration_id.length === 0) {
    throw new Error(
      'an expansion lineage must name its configuration_id: the expanded form is defined only under a '
      + 'fixed configuration, so without one there is nothing to say what was expanded',
    );
  }

  // Each span is frozen as well as the list holding it: freezing only the array
  // would leave `lineage.origin.file` writable, and a record that can be edited
  // after the fact is not the observation it claims to be.
  const originSpans = toSpans(origin_span).map((span) => Object.freeze({ ...span }));
  const expansionSpans = toSpans(expansion_span).map((span) => Object.freeze({ ...span }));
  if (originSpans.length === 0 || expansionSpans.length === 0) {
    throw new Error('an expansion lineage must carry at least one origin_span and at least one expansion_span');
  }

  return Object.freeze({
    origin: originSpans[0],
    expansion: expansionSpans[0],
    origin_spans: Object.freeze(originSpans),
    expansion_spans: Object.freeze(expansionSpans),
    relation: relationOf(originSpans.length, expansionSpans.length),
    configuration_id,
    generator_identity,
  });
}

/**
 * The claim no trivial comparison supports.
 *
 * Constant rather than per-run, for the same reason the other caveats are: a
 * caveat that varied with the data would invite reading it as a finding.
 */
export const TCE_CAVEAT =
  'A trivial comparison decides whether two texts normalise to the same tree under one named grammar. It '
  + 'is not a decision about meaning: semantic equivalence is undecidable for general programs, so this '
  + 'stage never claims it, and every verdict records the two normalised forms it rested on so a reader '
  + 'can see what was compared.';

/** The reason a run that was presented no pair carries. */
const NO_PAIR_PRESENTED =
  'no mutant pair was presented to this run, so no comparison was computed. E13 decides a pair, and an '
  + 'empty comparison list is the absence of an input rather than a clean result';

/** One pair's language, refused when the pairs disagree about it. */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function languageOfPairs(tcePairs) {
  const languages = [...new Set(tcePairs.map((pair) => pair?.language))];
  if (languages.length !== 1 || typeof languages[0] !== 'string') {
    throw new Error(
      `the presented pairs must all name one language, and they named ${JSON.stringify(languages)}. Every `
      + 'comparison in this block shares one configuration, and mixing grammars inside it would make the '
      + 'recorded configuration_id describe some of the rows and not others',
    );
  }
  return languages[0];
}

/** The comparisons a run's presented pairs yield, with a refusal recorded rather than raised. */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function comparePairs(language, tcePairs) {
  return tcePairs.map((pair) => {
    const mutantId = pair?.mutant_id ?? null;
    try {
      return Object.freeze({ mutant_id: mutantId, ...compareTrivially({
        original: pair?.original,
        mutant: pair?.mutated,
        language,
      }) });
    } catch (error) {
      return Object.freeze({
        mutant_id: mutantId,
        language,
        verdict: null,
        normalised_original: null,
        normalised_mutant: null,
        readable: false,
        configuration_id: tceConfigurationFor(language).configuration_id,
        grammar: tceConfigurationFor(language).grammar,
        comments: null,
        reason: error.message,
      });
    }
  });
}

/**
 * E13's block: the configuration, the comparisons, and what was not compared.
 *
 * The configuration is published whether or not a pair was presented, because a
 * reader asking which grammar this run compared under is asking a question the
 * run can answer even when it had nothing to compare.
 */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function buildTceBlock({ language, tcePairs }) {
  const pairs = Array.isArray(tcePairs) ? tcePairs : [];
  const compared = pairs.length === 0 ? null : languageOfPairs(pairs);
  if (compared !== null && language !== null && compared !== language) {
    throw new Error(
      `the presented pairs name ${compared} and this run measured ${language}. A comparison recorded under `
      + 'one language\'s configuration while presenting another language\'s texts would state a provenance '
      + 'the verdict does not have',
    );
  }

  const resolved = compared ?? language;
  const comparisons = resolved === null ? [] : comparePairs(resolved, pairs);
  const unavailable = resolved === null
    ? ['no language was named for this stage, so no TCE configuration could be published']
    : [];
  if (pairs.length === 0 && resolved !== null) unavailable.push(NO_PAIR_PRESENTED);

  return Object.freeze({
    language: resolved,
    configuration: resolved === null ? null : Object.freeze(tceConfigurationFor(resolved)),
    comparisons: Object.freeze(comparisons),
    counts: Object.freeze({
      comparisons: comparisons.length,
      triviallyEquivalent: comparisons.filter((record) => record.verdict === 'trivially-equivalent').length,
      notTriviallyEquivalent: comparisons.filter((record) => record.verdict === 'not-trivially-equivalent').length,
      unreadable: comparisons.filter((record) => record.verdict === null).length,
    }),
    unavailable: Object.freeze(unavailable),
    caveat: TCE_CAVEAT,
  });
}

/**
 * What R5.5 concludes about the oracle, and what it could not conclude.
 *
 * When no mutation results are supplied the stage records the missing channel
 * rather than an empty survivor list. A run that emitted zero survivors and said
 * nothing else would read as a suite with no gaps, which is the opposite of what
 * an unmeasured oracle means.
 *
 * @param {object} params
 * @param {string|null} [params.language] - the language this run measured, for the TCE configuration
 * @param {ReadonlyArray<object>} [params.tcePairs] - the mutant pairs E13 was presented
 */
export function assessOracleValidity({
  root = null,
  commit = null,
  mutations = null,
  ledger = null,
  language = null,
  tcePairs = null,
} = {}) {
  const unavailable = [];

  let survivors = classifySurvivorList([]);
  let discarded = [];
  if (Array.isArray(mutations) && mutations.length > 0) {
    const filtered = discardEquivalentMutants(mutations, {});
    discarded = filtered.discarded;
    survivors = classifySurvivorList(filtered.survivors);
  } else {
    unavailable.push(
      'no mutation results were supplied to this run, so no survivor was classified and no equivalence '
      + 'was decided. This is a missing channel, not a suite with no gaps: mutation execution belongs '
      + 'to a stage that can build and run the target.',
    );
  }

  for (const channel of ledger?.unavailable_channels ?? []) {
    if (channel.used !== true) {
      unavailable.push(`the ${channel.channel} channel was never consulted: ${channel.reason}`);
    }
  }

  return {
    root,
    commit,
    mutationResultsSupplied: Array.isArray(mutations) && mutations.length > 0,
    survivors,
    discarded,
    tce: buildTceBlock({ language, tcePairs }),
    unavailable,
    mutation_score_claim: MUTATION_SCORE_CAVEAT,
    contract_coverage_proved: false,
  };
}

/**
 * The oracle validity finding as the Markdown a human or an AI reads.
 *
 * The caveat is part of the report rather than a note beside it, because a
 * reader who has the survivor counts and not the caveat has the wrong idea about
 * what they measure.
 */
export function renderOracleGapReport(oracleGap) {
  // A record rendered before any mutation results exist legitimately carries
  // neither list, and a missing collection means "none recorded" rather than
  // "not measured" — the `unavailable` list is what says the latter.
  const unavailable = oracleGap.unavailable ?? [];
  const discarded = oracleGap.discarded ?? [];
  const { results, by_cause } = oracleGap.survivors;

  const lines = [
    '## Oracle validity',
    '',
    `> ${MUTATION_SCORE_CAVEAT}`,
    '',
    `**Mutation results supplied**: ${oracleGap.mutationResultsSupplied ? 'yes' : 'no'}.`,
    '',
  ];

  if (unavailable.length > 0) {
    lines.push('**Channels this run could not consult:**', '');
    for (const reason of unavailable) lines.push(`- ${reason}`);
    lines.push('');
  }

  lines.push(
    `**Survivors classified**: ${results.length}. **Discarded as equivalent by the ladder**: ${discarded.length}.`,
    '',
  );

  if (results.length > 0) {
    lines.push('| Cause | Count | Meaning |', '|---|---|---|');
    for (const cause of Object.keys(by_cause).sort()) {
      lines.push(`| \`${cause}\` | ${by_cause[cause]} | ${CAUSE_REASON[cause] ?? 'unclassified'} |`);
    }
    lines.push('');
  }

  for (const record of discarded) {
    lines.push(`- mutant \`${record.mutant_id ?? 'unknown'}\`: ${renderLadderClaim(record)}`);
  }
  if (discarded.length > 0) lines.push('');

  lines.push(...renderTceSection(oracleGap.tce));

  return lines.join('\n');
}

/** E13's half of the report: what was compared, under which grammar, and what was not. */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function renderTceSection(tce) {
  if (tce === undefined || tce === null) return [];

  const lines = [
    '### Trivial compiler-normalisation equivalence',
    '',
    `> ${tce.caveat}`,
    '',
  ];

  if (tce.configuration === null) {
    lines.push('No grammar was named for this stage, so no configuration is recorded.', '');
  } else {
    lines.push(
      `**Grammar**: \`${tce.configuration.grammar}\` (\`${tce.configuration.configuration_id}\`), `
      + `comments \`${tce.configuration.comments}\`.`,
      '',
    );
  }

  for (const reason of tce.unavailable) lines.push(`- ${reason}`);
  if (tce.unavailable.length > 0) lines.push('');

  lines.push(
    `**Comparisons**: ${tce.counts.comparisons} (${tce.counts.triviallyEquivalent} trivially equivalent, `
    + `${tce.counts.notTriviallyEquivalent} not trivially equivalent, ${tce.counts.unreadable} unreadable).`,
    '',
  );

  for (const record of tce.comparisons) {
    const verdict = record.verdict === null ? 'not compared' : record.verdict;
    lines.push(`- mutant \`${record.mutant_id ?? 'unknown'}\`: \`${verdict}\` — ${record.reason}`);
  }
  if (tce.comparisons.length > 0) lines.push('');

  return lines;
}
