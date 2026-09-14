// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
/**
 * E13 — trivial compiler-normalisation equivalence, and nothing beyond it.
 *
 * Semantic equivalence is undecidable for general programs, so this module never
 * claims it. What it claims is small, syntactic and re-derivable: two texts, one
 * declared grammar, and the question of whether their normalised trees are the
 * same. The answer is drawn from two values — trivially equivalent, or not —
 * and each verdict carries the two normalised forms it rested on, so a reader
 * can see what was compared rather than being asked to trust the word.
 *
 * The grammar is `GRAMMAR_BY_LANGUAGE`'s, imported from `structure.mjs`. A
 * second table here would drift on spelling, and the drift would be silent:
 * extraction and normalisation would disagree about which grammar a language is
 * read under, and each side's tests would pass against its own copy.
 *
 * Two callers want two different behaviours from a text that cannot be read, and
 * both are honoured by naming them apart. `normaliseUnderGrammar` throws, which
 * is what a verdict resting on a normalisation must do — a comparison that fell
 * back to the raw text would be a text diff wearing an AST's name. The ladder's
 * `normaliseForComparison` returns null instead, because a corpus holding one
 * file in an undeclared language must still have its other mutants classified.
 */
import { GRAMMAR_BY_LANGUAGE, grammarIdentityFor, parseSourceText } from './structure.mjs';

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
 * What a normalised comparison does with comments.
 *
 * Recorded rather than left to the printer. Comment-borne evidence such as
 * `@verifies` annotations is part of what this project reasons about, so a
 * normaliser that discarded comments silently would discard evidence silently.
 * Naming the policy makes the loss visible; it does not make it disappear.
 */
export const COMMENT_POLICY = 'stripped';

/** The two values a TCE verdict is drawn from. There is no third. */
export const TRIVIALLY_EQUIVALENT = 'trivially-equivalent';
export const NOT_TRIVIALLY_EQUIVALENT = 'not-trivially-equivalent';
export const TCE_VERDICTS = Object.freeze([TRIVIALLY_EQUIVALENT, NOT_TRIVIALLY_EQUIVALENT]);

/** The node types that carry a comment, and are left out of a normalised form. */
const COMMENT_NODE_TYPES = new Set(['line_comment', 'block_comment', 'comment', 'doc_comment']);

/** The separator a token stream is joined with; it cannot occur inside a token. */
const TOKEN_SEPARATOR = String.fromCharCode(0);

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
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
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

/**
 * The tokens a parse produced, joined into one comparable string.
 *
 * This is what the ladder's second rung compares, and it is deliberately built
 * from the syntax tree rather than from the text. Collapsing whitespace in the
 * *text* would also collapse it inside a string or character literal, so
 * `"hello world"` and `"hello  world"` would be reported as the same token
 * sequence — a false equivalence, and the worst kind, because it discards a
 * mutant and manufactures a clean result. Reading the leaves instead keeps every
 * token's text exactly as written while discarding only the whitespace between
 * tokens.
 */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function tokenStream(node) {
  if (COMMENT_NODE_TYPES.has(node.type)) return [];
  if (node.childCount === 0) return [node.text];

  const tokens = [];
  for (const child of node.children) tokens.push(...tokenStream(child));
  return tokens;
}

/**
 * A text read under its grammar, as a value that says whether the read succeeded.
 *
 * This is the one place the parse happens, so the throwing reading and the
 * lenient one cannot disagree about what "readable" means.
 */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function readTextUnderGrammar({ language, text }) {
  const configuration = tceConfigurationFor(language);
  const parsed = parseSourceText(text, language);
  if (!parsed.ok) {
    return { ok: false, configuration, canonical: null, tokens: null, errorNodes: null, message: parsed.message };
  }
  return {
    ok: true,
    configuration,
    canonical: canonicalForm(parsed.tree.rootNode),
    tokens: tokenStream(parsed.tree.rootNode).join(TOKEN_SEPARATOR),
    errorNodes: parsed.errorNodes === true,
    message: null,
  };
}

/** Refuse a text that is not a string, before anything tries to parse it. */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function requireText(text, role) {
  if (typeof text !== 'string') {
    throw new Error(
      `normaliseUnderGrammar needs the ${role} text to normalise; it was given ${text === null ? 'null' : typeof text}. `
      + 'An absent text is missing evidence, and defaulting it to the empty string would turn "nothing to '
      + 'compare" into a positive match',
    );
  }
  return text;
}

/**
 * The normalised form of a text under its language's declared grammar.
 *
 * Throws when the text cannot be read, rather than handing back a value that a
 * caller could compare as though it were a normalisation: a comparison that fell
 * back to the raw text would be a text diff claiming to be an AST comparison,
 * which is the one thing this item must never become.
 *
 * @param {object} params
 * @param {string} params.language - the language whose grammar the text is read under
 * @param {string} params.text - the text to normalise
 * @returns {{language: string, configuration: object, normalised: string, errorNodes: boolean}}
 */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
export function normaliseUnderGrammar({ language, text } = {}) {
  const read = readTextUnderGrammar({ language, text: requireText(text, 'source') });
  if (!read.ok) {
    throw new Error(
      `the ${language} grammar could not read the text, so nothing can be normalised under it: ${read.message}. `
      + 'A comparison that fell back to the raw text would claim an equivalence it did not compute',
    );
  }
  return {
    language,
    configuration: read.configuration,
    normalised: read.canonical,
    errorNodes: read.errorNodes,
  };
}

/**
 * The normalised form of a source text, or null when the instrument cannot decide.
 *
 * A null is not a failure to report: it is the honest answer for a language with
 * no grammar loaded, a language no normaliser is declared for, or a text the
 * grammar could not parse — and the ladder treats it as "nothing was proved"
 * rather than as "equivalent". It deliberately does not raise, because a corpus
 * holding one file in an undeclared language must still have its other mutants
 * classified.
 *
 * @param {string} text - the text to read
 * @param {string} language - the language whose grammar it is read under
 */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
export function normaliseForComparison(text, language) {
  if (GRAMMAR_BY_LANGUAGE[language] === undefined) return null;
  let read;
  try {
    read = readTextUnderGrammar({ language, text: String(text) });
  } catch {
    return null;
  }
  return read.ok ? read.canonical : null;
}

/**
 * Compare a mutant against its original under one declared grammar.
 *
 * The verdict is one of two values, and it is reached by normalising both texts
 * and comparing the normalised forms — never by an identity check on the inputs,
 * because an identical mutant and a reflowed one must be decided by the same
 * comparison the rest of the vocabulary rests on.
 *
 * @param {object} params
 * @param {string} params.original - the original text
 * @param {string} params.mutant - the text to compare against it
 * @param {string} params.language - the language both texts are read under
 * @param {Function} [params.normaliser] - `(text, language) => normalised`, for a caller with its own reading
 * @returns {object} the verdict and the two normalised forms it rests on
 */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
export function compareTrivially({ original, mutant, language, normaliser = null } = {}) {
  if (typeof original !== 'string' || typeof mutant !== 'string') {
    throw new Error(
      'a trivial comparison needs both of its two texts: the mutant and the original. An absent text is '
      + 'missing evidence, not equivalence, and this comparison has no value for "nothing to compare"',
    );
  }

  const leftRead = readTextUnderGrammar({ language, text: original });
  const rightRead = readTextUnderGrammar({ language, text: mutant });
  for (const read of [leftRead, rightRead]) {
    if (!read.ok) {
      throw new Error(
        `the ${language} grammar could not read one of the two texts, so no comparison under it was `
        + `computed: ${read.message}`,
      );
    }
  }

  const normalisedOriginal = normaliser === null ? leftRead.canonical : normaliser(original, language);
  const normalisedMutant = normaliser === null ? rightRead.canonical : normaliser(mutant, language);
  if (typeof normalisedOriginal !== 'string' || typeof normalisedMutant !== 'string') {
    throw new Error(
      `the normaliser returned ${typeof normalisedOriginal} and ${typeof normalisedMutant} rather than the `
      + 'two normalised forms. A verdict needs both of them recorded, because the normalisation is what the '
      + 'verdict can be re-derived from',
    );
  }

  const equivalent = normalisedOriginal === normalisedMutant;
  return Object.freeze({
    language,
    verdict: equivalent ? TRIVIALLY_EQUIVALENT : NOT_TRIVIALLY_EQUIVALENT,
    normalised_original: normalisedOriginal,
    normalised_mutant: normalisedMutant,
    readable: leftRead.errorNodes === false && rightRead.errorNodes === false,
    configuration_id: leftRead.configuration.configuration_id,
    grammar: leftRead.configuration.grammar,
    comments: leftRead.configuration.comments,
    reason: equivalent
      ? 'the two texts normalise to the same form under the named grammar'
      : 'the two texts normalise to different forms under the named grammar',
  });
}

/** A record claims equivalence when it says so in either of the two shapes used here. */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function claimsEquivalence(record) {
  return record?.verdict === 'equivalent' || record?.equivalent === true;
}

/** The rung a step id names, or null when the id names no rung. */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function ladderStepOf(id) {
  return TCE_LADDER_STEPS.find((step) => step.id === id) ?? null;
}

/** The token stream of a text, or null when the instrument cannot read it. */
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
function tokensOf(text, language) {
  if (GRAMMAR_BY_LANGUAGE[language] === undefined) return null;
  const read = readTextUnderGrammar({ language, text: String(text) });
  return read.ok ? read.tokens : null;
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
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
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
// [::TICKET::] P24-5 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P24-5 --for-spec --no-implementation-order`.
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
