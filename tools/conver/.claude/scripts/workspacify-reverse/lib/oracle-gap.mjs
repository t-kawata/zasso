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
import { GRAMMAR_BY_LANGUAGE, grammarIdentityFor, parseSourceText } from './structure.mjs';

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
 * The comparison ladder, which stops at the first rung that applies and never
 * claims more than that rung proves.
 *
 * Rungs four to six are unsafe unless the language, the types, the evaluation
 * order, the side effects, the arithmetic model and the configuration are all
 * named — so they carry `requiresNamedConfiguration`, and a claim resting on one
 * is refused unless it supplies them.
 */
export const TCE_LADDER_STEPS = Object.freeze([
  Object.freeze({ id: 1, name: 'text_identical', label: 'text identical', requiresNamedConfiguration: false }),
  Object.freeze({ id: 2, name: 'token_normalised_identical', label: 'token-normalised identical', requiresNamedConfiguration: false }),
  Object.freeze({ id: 3, name: 'ast_normalised_identical', label: 'AST-normalised identical under a named configuration', requiresNamedConfiguration: false }),
  Object.freeze({ id: 4, name: 'local_rewrite_equivalence', label: 'equal under a limited set of local rewrite rules', requiresNamedConfiguration: true }),
  Object.freeze({ id: 5, name: 'same_ir_or_diagnostics', label: 'the compiler or type checker emits the same IR or diagnostics', requiresNamedConfiguration: true }),
  Object.freeze({ id: 6, name: 'no_test_could_distinguish', label: 'no test, property or differential implementation could distinguish them', requiresNamedConfiguration: true }),
  Object.freeze({ id: 7, name: 'unknown', label: 'unknown', requiresNamedConfiguration: false }),
]);

/** The rung a comparison reaches when nothing decided it. */
export const UNKNOWN_LADDER_STEP = 7;

/** The fields a rung at four or beyond must name before its claim may be recorded. */
export const REQUIRED_NAMED_FIELDS = Object.freeze(['configuration_id', 'arithmetic_model', 'evaluation_order']);

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

/**
 * What a normalised comparison does with comments.
 *
 * Recorded rather than left to the printer. The Rust printer the design names,
 * `prettyplease`, can drop comments — and comment-borne evidence such as
 * `@verifies` annotations is part of what this project reasons about, so a
 * normaliser that discarded comments silently would discard evidence silently.
 * Naming the policy makes the loss visible; it does not make it disappear.
 */
export const COMMENT_POLICY = 'stripped';

/** The node types that carry a comment, and are left out of a normalised form. */
const COMMENT_NODE_TYPES = new Set(['line_comment', 'block_comment', 'comment', 'doc_comment']);

/** The reason each unclassified survivor carries, so a reader is told what is missing. */
const UNCLASSIFIED_REASON =
  'no evidence about reachability, observation or inputs was collected for this mutant, so its cause '
  + 'is unknown rather than assumed — the dynamic channel is not available in this run';

/** A record claims equivalence when it says so in either of the two shapes used here. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function claimsEquivalence(record) {
  return record?.verdict === 'equivalent' || record?.equivalent === true;
}

/** The rung a step id names, or null when the id names no rung. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function ladderStepOf(id) {
  return TCE_LADDER_STEPS.find((step) => step.id === id) ?? null;
}

/** The grammar and pinned version a language's comparisons run under. */
export function tceConfigurationFor(language) {
  const grammar = GRAMMAR_BY_LANGUAGE[language];
  if (!grammar) {
    throw new Error(
      `no TCE normaliser is declared for ${language}: a normaliser chosen for another language would `
      + `silently discard non-equivalent mutants. The declared languages are: ${Object.keys(GRAMMAR_BY_LANGUAGE).join(', ')}`,
    );
  }
  return {
    language,
    configuration_id: grammarIdentityFor(language),
    grammar: grammar.packageName,
    wasm: grammar.wasmName,
    comments: COMMENT_POLICY,
  };
}

/**
 * The canonical form a parsed tree is compared in.
 *
 * Every child is rendered, named or not, because the unnamed ones carry the
 * operators: `n + 1` and `n - 1` differ only in an unnamed token, and a form
 * built from named children alone would report them identical. Comments are the
 * one exception, and the policy that drops them is recorded in the configuration
 * rather than hidden here.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function canonicalForm(node) {
  if (COMMENT_NODE_TYPES.has(node.type)) return '';
  if (node.childCount === 0) return node.text;

  const parts = [];
  for (const child of node.children) {
    const rendered = canonicalForm(child);
    if (rendered.length > 0) parts.push(rendered);
  }
  return `(${node.type} ${parts.join(' ')})`;
}

/** The separator a token stream is joined with; it cannot occur inside a token. */
const TOKEN_SEPARATOR = String.fromCharCode(0);

/**
 * The tokens a parse produced, joined into one comparable string.
 *
 * This is what rung two compares, and it is deliberately built from the syntax
 * tree rather than from the text. Collapsing whitespace in the *text* would also
 * collapse it inside a string or character literal, so `"hello world"` and
 * `"hello  world"` would be reported as the same token sequence — a false
 * equivalence, and the worst kind, because it discards a mutant and manufactures
 * a clean result. Reading the leaves instead keeps every token's text exactly as
 * written while discarding only the whitespace between tokens.
 */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function tokenStream(node) {
  if (COMMENT_NODE_TYPES.has(node.type)) return [];
  if (node.childCount === 0) return [node.text];

  const tokens = [];
  for (const child of node.children) tokens.push(...tokenStream(child));
  return tokens;
}

/**
 * The normalised form of a source text, or null when the instrument cannot decide.
 *
 * A null is not a failure to report: it is the honest answer for a language with
 * no grammar loaded, a language no normaliser is declared for, or a text the
 * grammar could not parse — and the ladder treats it as "nothing was proved"
 * rather than as "equivalent". It deliberately does not raise: a corpus holding
 * one file in an undeclared language must still have its other mutants
 * classified, and aborting the stage would discard every one of them.
 */
export function normaliseForComparison(text, language) {
  if (GRAMMAR_BY_LANGUAGE[language] === undefined) return null;
  const parsed = parseSourceText(String(text), language);
  if (!parsed.ok) return null;
  return canonicalForm(parsed.tree.rootNode);
}

/** The token stream of a text, or null when the instrument cannot read it. */
// [::TICKET::] P22-6 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-6 --for-spec --no-implementation-order`.
function tokensOf(text, language) {
  if (GRAMMAR_BY_LANGUAGE[language] === undefined) return null;
  const parsed = parseSourceText(String(text), language);
  if (!parsed.ok) return null;
  return tokenStream(parsed.tree.rootNode).join(TOKEN_SEPARATOR);
}

/**
 * Walk the ladder and stop at the first rung that applies.
 *
 * This instrument reaches rung three. Rungs four to six need a rewrite-rule
 * engine, a compiler, or a distinguishing-test search, none of which is built
 * here — so a comparison this instrument cannot decide returns `unknown`, and
 * the caller keeps the mutant rather than discarding it.
 *
 * The first rung is only reachable when both texts were actually supplied. A
 * mutant whose text is missing is not "byte-identical" to anything: defaulting
 * the absent value to the empty string would turn "no evidence" into "positively
 * equivalent" and silently discard every survivor a producer left unfilled.
 */
export function applyComparisonLadder({ original, mutated, language, normaliser = normaliseForComparison }) {
  if (typeof original !== 'string' || typeof mutated !== 'string') {
    return {
      ladder_step: UNKNOWN_LADDER_STEP,
      verdict: 'unknown',
      reason:
        'the mutant does not carry both of its two texts, so no rung of the ladder has anything to '
        + 'compare. An absent text is missing evidence, not equivalence, and the mutant is kept',
    };
  }
  if (original === mutated) {
    return { ladder_step: 1, verdict: 'equivalent', reason: 'the two texts are byte-identical' };
  }

  const leftTokens = tokensOf(original, language);
  const rightTokens = tokensOf(mutated, language);
  if (leftTokens !== null && rightTokens !== null && leftTokens === rightTokens) {
    return {
      ladder_step: 2,
      verdict: 'equivalent',
      reason: 'the two texts carry the same token sequence; only the whitespace between tokens differs',
    };
  }

  const left = normaliser(original, language);
  const right = normaliser(mutated, language);
  if (left !== null && right !== null && left === right) {
    return {
      ladder_step: 3,
      verdict: 'equivalent',
      configuration_id: tceConfigurationFor(language).configuration_id,
      reason: 'the two texts normalise to the same syntax tree under the named configuration',
    };
  }

  return {
    ladder_step: UNKNOWN_LADDER_STEP,
    verdict: 'unknown',
    reason:
      'no rung of the ladder decided this comparison. This instrument reaches rung three; the rungs '
      + 'beyond it need a rewrite-rule engine, a compiler or a distinguishing test, and none is built '
      + 'here — so the mutant is kept rather than presented as decided',
  };
}

/**
 * Refuse an equivalence claim that does not say which rung of the ladder it rests on.
 *
 * Rung four and beyond additionally name the configuration, the arithmetic model
 * and the evaluation order, because without them the claim is unsafe: `i < n`
 * and `i <= n - 1` are not interchangeable once overflow, types, side effects or
 * undefined behaviour are considered.
 */
export function assertLadderClaimIsNamed(record) {
  const step = ladderStepOf(record?.ladder_step);
  if (step === null) {
    throw new Error(
      'an equivalence claim carries no ladder step, so it cannot be recorded: a claim discarded at '
      + 'one rung and one discarded at another support different conclusions. '
      + `The claim was ${JSON.stringify(record)}`,
    );
  }
  // Rung seven is the absence of a decision, so it can never be the support for
  // one. Without this the record would read "equivalent, rung 7 (unknown)", which
  // is the flattening the ladder exists to prevent.
  if (step.id === UNKNOWN_LADDER_STEP && claimsEquivalence(record)) {
    throw new Error(
      'an equivalence claim rests on the unknown rung, which decides nothing. A comparison no rung '
      + 'settled is kept as a survivor, never recorded as equivalent. '
      + `The claim was ${JSON.stringify(record)}`,
    );
  }
  if (!step.requiresNamedConfiguration) return record;

  for (const field of REQUIRED_NAMED_FIELDS) {
    if (typeof record[field] !== 'string' || record[field].length === 0) {
      throw new Error(
        `ladder step ${step.id} (${step.name}) requires ${field}, and the claim does not name it. `
        + 'A comparison at this rung is unsafe without the language, the types, the evaluation order, '
        + 'the side effects, the arithmetic model and the configuration all being named.',
      );
    }
  }
  return record;
}

/** The equivalence claims in a list that carry no ladder step. */
export function findUnnamedEquivalenceClaims(records) {
  return (records ?? []).filter((record) => claimsEquivalence(record) && ladderStepOf(record.ladder_step) === null);
}

/** Refuse a list in which any equivalence claim carries no ladder step. */
export function assertNoBareEquivalenceClaim(records) {
  const unnamed = findUnnamedEquivalenceClaims(records);
  if (unnamed.length > 0) {
    throw new Error(
      `${unnamed.length} equivalence claim(s) carry no ladder step: ${JSON.stringify(unnamed)}. `
      + 'The word "equivalent" is never emitted without the rung that supports it.',
    );
  }
  return records;
}

/** One claim as a sentence a reader can act on, with its rung and named fields. */
export function renderLadderClaim(record) {
  const step = ladderStepOf(record?.ladder_step);
  if (step === null) {
    return `equivalent at an unnamed rung (mutant ${record?.mutant_id ?? 'unknown'}) — refused, not recorded`;
  }
  const named = REQUIRED_NAMED_FIELDS
    .filter((field) => typeof record[field] === 'string' && record[field].length > 0)
    .map((field) => `${field}=${record[field]}`);
  const suffix = named.length === 0 ? '' : ` [${named.join(', ')}]`;
  return `rung ${step.id} (${step.label})${suffix}`;
}

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
 * What R5.5 concludes about the oracle, and what it could not conclude.
 *
 * When no mutation results are supplied the stage records the missing channel
 * rather than an empty survivor list. A run that emitted zero survivors and said
 * nothing else would read as a suite with no gaps, which is the opposite of what
 * an unmeasured oracle means.
 */
export function assessOracleValidity({ root = null, commit = null, mutations = null, ledger = null } = {}) {
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

  return lines.join('\n');
}
