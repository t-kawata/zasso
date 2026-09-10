// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
/**
 * R6.5 — property-based tests generated from R3's invariants.
 *
 * A property engine generates test cases. It does not invent correct properties,
 * and this module is built so that it cannot pretend otherwise. A property that
 * merely restates a branch of the implementation is the co-conspirator oracle
 * (ABOUT-REVERSE 7.6 F17): it agrees with the code because it was read off the
 * code, and a suite of them is a green that proves nothing. Every property this
 * module emits therefore carries `property_origin`, naming the source fact it
 * was read from, the category it belongs to and where its oracle came from, and
 * every one is a `generated_candidate` requiring human approval.
 *
 * The categories are a **closed** vocabulary, and each one declares what it
 * generates and what it must not. The negative half is the load-bearing half:
 * `boundary_guard` may not generate the claim that the guard is a caller
 * obligation because that turns a defensive check into a specification, and
 * `collection_transform` may not promote an implementation's incidental ordering
 * into a required one because that is how a bug becomes a canon (F21).
 *
 * Classification is deliberately not attempted here. Whether an invariant is
 * about a boundary or about a state machine is a semantic reading, and a
 * vocabulary of keywords guessing at it would produce categories no reader could
 * trust. The category is supplied by the reading that performed it — R3's
 * semantic material, or the AI step that follows it — and this module's job is
 * to refuse what the category forbids and to record where the oracle came from.
 * An invariant with no category is not generated, and is never recorded as
 * verified (ABOUT-REVERSE 11.5 R-3: an invariant that cannot be classified into a
 * known category cannot be made into a property-based test).
 */
/**
 * The oracle independence vocabulary, ordered strongest first.
 *
 * The order is not a preference. An oracle from an external standard, an
 * independent implementation or a metamorphic relation rooted in a mathematical
 * property can falsify the implementation. An expected value reverse-engineered
 * from that same implementation cannot: it describes what the code does, and
 * describing what the code does is never evidence that the code is right.
 */
export const ORACLE_INDEPENDENCE = Object.freeze([
  'external_format_derived',
  'differential',
  'metamorphic',
  'implementation_derived',
  'implementation_reverse_engineered',
]);

/** The independences that can falsify an implementation. */
export const STRONG_ORACLE_INDEPENDENCE = Object.freeze([
  'external_format_derived',
  'differential',
  'metamorphic',
]);

/**
 * The independences that cannot, and are reported separately for that reason.
 *
 * They remain useful — they detect regressions and they make the code legible —
 * and presenting them as corroboration is the failure this separation exists to
 * prevent.
 */
export const WEAK_ORACLE_INDEPENDENCE = Object.freeze([
  'implementation_derived',
  'implementation_reverse_engineered',
]);

/**
 * What an unstated oracle is recorded as.
 *
 * The conservative direction is deliberate: a caller who did not say where the
 * oracle came from must not be handed a record that reads as a strong one. An
 * explicit value outside the vocabulary is refused instead, because a typo that
 * silently became this default would hide the drift it caused.
 */
export const DEFAULT_ORACLE_INDEPENDENCE = 'implementation_derived';

/** A property that has been generated and not yet approved. */
export const GENERATED_CANDIDATE = 'generated_candidate';

/** An invariant that produced no property. Never a synonym for verified. */
export const NOT_GENERATED = 'not_generated';

/** A candidate that was generated in shape and refused on content. */
export const REFUSED = 'refused';

/**
 * The engine per language, recorded rather than chosen at the call site.
 *
 * ABOUT-REVERSE 11.5 R-3 names these, and the ticket is explicit that the engine
 * is a secondary choice: the categories and the oracle ranking are what the
 * design depends on, and they do not change with the engine.
 */
export const PROPERTY_ENGINES = Object.freeze({
  rust: 'proptest',
  typescript: 'fast-check',
  javascript: 'fast-check',
  go: 'rapid',
  python: 'hypothesis',
  c_cpp: 'RapidCheck',
  unknown: 'unrecorded',
});

/**
 * The closed category vocabulary.
 *
 * `refusal` is a declared predicate over the proposition text, not a judgement
 * about whether the property is true — this module cannot decide that, and does
 * not try. It decides whether the proposition is of a shape the category's own
 * "never" clause forbids, so that the forbidden shape is refused where it is
 * written rather than discovered as a mis-specified test later.
 */
export const KNOWN_PROPERTY_CATEGORIES = Object.freeze([
  Object.freeze({
    id: 'parser_serialiser',
    generates: 'round-trip, re-serialise after a successful parse, rejection of invalid input',
    never: 'the correctness of a meaning-bearing canonicalisation',
    refusal: /\bcanonical(?:isation|ization)?\b/i,
    body: 'for all x: parse(serialise(x)) equals x, and serialise(parse(t)) equals t for every accepted t',
  }),
  Object.freeze({
    id: 'boundary_guard',
    generates: 'empty, minimum, maximum, just before and just after a boundary, null/None/undefined, invalid enum',
    never: 'the claim that the guard is a caller obligation',
    refusal: /\b(?:caller|callers|client|clients)\b[^.]*\b(?:must|shall|should|required to|obliged to)\b/i,
    body: 'for all x at the boundary: the guard accepts exactly the values inside it and rejects the value one step beyond',
  }),
  Object.freeze({
    id: 'pure_function',
    generates: 'determinism, referentially transparent re-execution, non-destructive on input',
    never: 'identical output for a function with external state',
    refusal: /\b(?:cache|cached|caching|memoised|memoized|external state|global state|clock|random|filesystem|network|environment variable)\b/i,
    body: 'for all x: f(x) equals f(x) and the argument is unchanged after the call',
  }),
  Object.freeze({
    id: 'collection_transform',
    generates: 'length, element preservation, order preservation or explicitly-unspecified order',
    never: 'promoting an implementation-derived ordering into a specification',
    refusal: /\b(?:insertion order|declaration order|implementation order|iteration order|current order|internal order)\b/i,
    body: 'for all xs: length(f(xs)) equals length(xs) and every element of xs appears in f(xs)',
  }),
  Object.freeze({
    id: 'encode_decode',
    generates: 'decode(encode(x)) agrees with x, size limits, rejection cases',
    never: 'the claim that the representation is unique',
    refusal: /\buniqu(?:e|eness)\b|\bcanonical\b/i,
    body: 'for all x: decode(encode(x)) equals x, and an oversized input is rejected rather than truncated',
  }),
  Object.freeze({
    id: 'state_transition',
    generates: 'declared refusal transitions and the local state after success or failure',
    never: 'a complete protocol specification',
    refusal: /\ball (?:the |possible )?(?:transitions|states|events)\b|\b(?:complete|full|entire)\b[^.]*\b(?:protocol|state machine|lifecycle|state chart)\b/i,
    body: 'for all state s and declared event e: applying e either refuses or yields a declared state, and the local state after a refusal is s',
  }),
  Object.freeze({
    id: 'error_type',
    generates: 'a known input yields a known error variant, as a fact',
    never: 'the norm that the error is the desirable API contract',
    refusal: /\bdesirable\b|\berrors? (?:is|are) the (?:correct|right|proper|intended)\b/i,
    body: 'for all known-bad x: f(x) is Err with the variant the carrier declares for that input',
  }),
  Object.freeze({
    id: 'differential_comparison',
    generates: 'the range over which a reference implementation, an older version or an alternate backend agrees',
    never: 'an oracle built from the same implementation',
    refusal: /\b(?:same implementation|implementation under test|this implementation|itself)\b/i,
    body: 'for all x in the recorded range: f(x) equals reference(x), and the range where they disagree is reported rather than narrowed',
  }),
]);

/** The category ids, in the declared order. */
export const PROPERTY_CATEGORY_IDS = Object.freeze(KNOWN_PROPERTY_CATEGORIES.map((category) => category.id));

/**
 * The claim no oracle count supports.
 *
 * Constant rather than per-run, for the same reason the other caveats are: a
 * caveat that varied with the data would invite reading it as a finding.
 */
export const ORACLE_INDEPENDENCE_CAVEAT =
  'An oracle derived from the implementation the property is meant to check cannot falsify that '
  + 'implementation: it agrees with the code because it was read off the code. The count of '
  + 'implementation-derived and implementation-reverse-engineered oracles is therefore reported '
  + 'separately from the count that could falsify, and is never presented as corroboration.';

/** What a generated property is, and what it is not. */
export const GENERATOR_CAVEAT =
  'A property engine generates test cases; it does not invent correct properties. Every property '
  + 'below is a candidate read from a source fact and requires human approval before it is treated '
  + 'as a specification. A counterexample from one of them establishes red; it does not by itself '
  + 'establish that the implementation is wrong.';

const SOURCE_FACT = /^[^:]+:\d+$/;

/** The file part of a `file:line` fact, as a slug an identifier can carry. */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function slugOf(sourceFact) {
  return sourceFact.slice(0, sourceFact.lastIndexOf(':')).split('/').join('_').replace(/[^A-Za-z0-9_]/g, '_');
}

/** The line part of a `file:line` fact. */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function lineOf(sourceFact) {
  return sourceFact.slice(sourceFact.lastIndexOf(':') + 1);
}

/** The category record for an id, or null when the id is not in the vocabulary. */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function categoryFor(id) {
  return KNOWN_PROPERTY_CATEGORIES.find((category) => category.id === id) ?? null;
}

/**
 * Whether a proposition is of a shape its category forbids.
 *
 * The answer is a clause of the category's own `never`, quoted back, so a reader
 * is told which rule refused the candidate rather than that a rule did.
 */
export function classifyPropertyCandidate({ proposition, source_fact: sourceFact, category } = {}) {
  const known = categoryFor(category);
  if (known === null) {
    return { proposition, source_fact: sourceFact ?? null, category: null, accepted: false, refused: null };
  }
  const refused = known.refusal.test(proposition) ? known.never : null;
  return { proposition, source_fact: sourceFact ?? null, category: known.id, accepted: refused === null, refused };
}

/**
 * The properties R3's invariants yield, and the ones they do not.
 *
 * Three outcomes are kept apart because collapsing any two of them would read as
 * a measurement it is not. `generated` are candidates. `refused` were generated
 * in shape and rejected on content, and are reported so the refusal is visible.
 * `notGenerated` carries no category and is never a synonym for verified.
 *
 * @param {Array<{proposition: string, source_fact: string, category?: string, oracle_independence?: string, kind?: string, requires_human_approval?: boolean}>} invariants
 */
export function generatePropertyTests(invariants) {
  if (!Array.isArray(invariants)) {
    throw new Error('generatePropertyTests needs the list of invariants to generate from; it was given none');
  }

  const generated = [];
  const notGenerated = [];
  const refused = [];

  for (const invariant of invariants) {
    const proposition = invariant?.proposition;
    if (typeof proposition !== 'string' || proposition.length === 0) {
      throw new Error('an invariant must state the proposition a property would check; one stated none');
    }
    const sourceFact = invariant.source_fact;
    if (typeof sourceFact !== 'string' || !SOURCE_FACT.test(sourceFact)) {
      throw new Error(
        `the invariant "${proposition}" must carry source_fact as a file:line in the target; it carried `
        + `${JSON.stringify(sourceFact)}`,
      );
    }
    // A caller attempting to weaken the approval requirement fails here rather
    // than succeeding with a record that reads as approved.
    if (invariant.requires_human_approval === false) {
      throw new Error(
        `the invariant at ${sourceFact} sets requires_human_approval to false: a generated property is a `
        + 'candidate, and a caller may not promote one to a settled specification',
      );
    }

    const known = categoryFor(invariant.category);
    if (known === null) {
      notGenerated.push({
        source_fact: sourceFact,
        category: null,
        status: NOT_GENERATED,
        reason: invariant.category === undefined || invariant.category === null
          ? 'no category was supplied, and this module does not guess one: whether an invariant is about a '
            + 'boundary, a parser or a state machine is a semantic reading, and a keyword match would produce '
            + 'a category no reader could trust'
          : `the category "${invariant.category}" is not in the closed vocabulary (${PROPERTY_CATEGORY_IDS.join(', ')})`,
      });
      continue;
    }

    const verdict = classifyPropertyCandidate({ proposition, source_fact: sourceFact, category: known.id });
    if (!verdict.accepted) {
      refused.push({
        source_fact: sourceFact,
        category: known.id,
        status: REFUSED,
        reason: `the category ${known.id} must not generate ${known.never}`,
        refused: known.never,
      });
      continue;
    }

    const declared = invariant.oracle_independence;
    if (declared !== undefined && declared !== null && !ORACLE_INDEPENDENCE.includes(declared)) {
      throw new Error(
        `the oracle independence "${declared}" is not one of (${ORACLE_INDEPENDENCE.join(', ')}): an `
        + 'unrecognised value is refused rather than defaulted, because a typo that became the default '
        + 'would hide the drift it caused',
      );
    }
    const oracleIndependence = declared ?? DEFAULT_ORACLE_INDEPENDENCE;

    generated.push({
      property_id: `prop-${known.id}-${slugOf(sourceFact)}-${lineOf(sourceFact)}`,
      engine: PROPERTY_ENGINES[invariant.language ?? 'unknown'] ?? PROPERTY_ENGINES.unknown,
      body: known.body,
      property_origin: {
        source_fact: sourceFact,
        category: known.id,
        oracle_independence: oracleIndependence,
        oracle_independence_declared: declared !== undefined && declared !== null,
        // Always true, and not read from the input: the record cannot be weakened
        // into reading as approved, which is what makes the marker trustworthy.
        status: GENERATED_CANDIDATE,
        requires_human_approval: true,
      },
    });
  }

  const counts = countOracleIndependence(generated);
  return {
    generated,
    notGenerated,
    refused,
    oracle_independence_counts: counts,
    environment: {
      engine: 'declared per language in PROPERTY_ENGINES',
      available: true,
      reason: 'a property test is a generated artefact, so this stage produces one whether or not an '
        + 'environment can execute it; execution belongs to P22-19',
    },
    caveat: GENERATOR_CAVEAT,
  };
}

/**
 * The oracle provenance counts, with the weak ones kept out of the strong total.
 *
 * `strong` is what could falsify the implementation. `weak` is what describes it.
 * Summing them would produce the single number the design forbids.
 */
// [::TICKET::] P22-7 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-7 --for-spec --no-implementation-order`.
function countOracleIndependence(generated) {
  const counts = {};
  for (const independence of ORACLE_INDEPENDENCE) counts[independence] = 0;
  for (const property of generated) counts[property.property_origin.oracle_independence] += 1;

  let strong = 0;
  for (const independence of STRONG_ORACLE_INDEPENDENCE) strong += counts[independence];
  let weak = 0;
  for (const independence of WEAK_ORACLE_INDEPENDENCE) weak += counts[independence];

  // Frozen because the counts travel with the properties into a report a reader
  // decides from, and a caller that could adjust them could make the weak total
  // look like the strong one after the fact.
  return Object.freeze({ ...counts, strong, weak, caveat: ORACLE_INDEPENDENCE_CAVEAT });
}

/**
 * The generated properties as the Markdown a human or an AI reads.
 *
 * The caveat and the oracle counts are part of the report rather than notes
 * beside it, because a reader who has the property count and not the provenance
 * has the wrong idea about what the count measures.
 */
export function renderPropertyTestReport(result, limit = 20) {
  const counts = result.oracle_independence_counts;
  const lines = [
    '## Generated properties',
    '',
    `> ${GENERATOR_CAVEAT}`,
    '',
    `**Generated candidates**: ${result.generated.length}. **Refused on content**: ${result.refused.length}. `
      + `**Not generated**: ${result.notGenerated.length}.`,
    '',
    `> ${ORACLE_INDEPENDENCE_CAVEAT}`,
    '',
    '| Oracle independence | Candidates |',
    '|---|---|',
  ];
  for (const independence of ORACLE_INDEPENDENCE) {
    lines.push(`| ${independence} | ${counts[independence]} |`);
  }
  lines.push(
    '',
    `**Could falsify the implementation**: ${counts.strong}. `
      + `**Describe the implementation and cannot falsify it**: ${counts.weak}.`,
    '',
  );

  if (result.generated.length === 0) {
    lines.push('No property was generated from this population.', '');
  } else {
    lines.push('| Property | Category | Source fact | Oracle independence |', '|---|---|---|---|');
    for (const property of result.generated.slice(0, limit)) {
      lines.push(
        `| \`${property.property_id}\` | ${property.property_origin.category} | `
        + `\`${property.property_origin.source_fact}\` | ${property.property_origin.oracle_independence} |`,
      );
    }
    if (result.generated.length > limit) {
      lines.push('', `_${result.generated.length - limit} further candidates are in the sidecar and not printed here._`);
    }
    lines.push('');
  }

  if (result.refused.length > 0) {
    lines.push('### Refused on content', '');
    for (const item of result.refused) {
      lines.push(`- \`${item.source_fact}\` (${item.category}) — must not generate ${item.refused}`);
    }
    lines.push('');
  }

  lines.push(
    '### Not generated',
    '',
    'An invariant here produced no property. This is not a verdict on the invariant and is never a',
    'statement that it was verified: it is a reading this stage could not make, handed to a human.',
    '',
  );
  for (const item of result.notGenerated.slice(0, limit)) {
    lines.push(`- \`${item.source_fact}\` — ${item.reason}`);
  }
  if (result.notGenerated.length > limit) {
    lines.push(`- _${result.notGenerated.length - limit} further entries are in the sidecar and not printed here._`);
  }
  lines.push('');
  return lines.join('\n');
}
