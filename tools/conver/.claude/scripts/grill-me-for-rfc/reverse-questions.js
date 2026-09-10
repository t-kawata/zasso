#!/usr/bin/env node
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
/**
 * G1 to G3 — the reverse grill's question generation.
 *
 * The failure this module exists to prevent is the ratification RFC (ABOUT-REVERSE
 * 3.4): an RFC written from an existing implementation that restates the code in
 * the language of a specification. Such a document passes every later check while
 * proving nothing, because the implementation, its tests and its comments all
 * descend from one design and corroborate each other rather than the design.
 *
 * The defence is one question that the design makes mandatory rather than
 * optional — for every unresolved claim, whether the observed behaviour is
 * intended or accidental. A question framed as "what should this do?" invites the
 * answer "what it currently does"; a question that forces the distinction between
 * intent and accident does not.
 *
 * Two separations give this module its shape.
 *
 *   - Generation is separated from rendering. `generateReverseQuestions` returns
 *     data and never a document, so the logic that decides what must be asked can
 *     be tested without a question ever being formatted. `renderGrillQuestions`
 *     turns that data into the shape `/grill-me-for-rfc` has always demanded, and
 *     the command's own `validate-question-format.js` is what judges it.
 *   - The carried question is separated from the asked question. A claim arrives
 *     with the question P22-5 wrote for it; a residual arrives with the question
 *     the stage-one hand-off recorded. Both are carried verbatim under
 *     `carried_grill_question`, because a reworded observation is a lost one, and
 *     the machine's own question is what the grill is asked in addition.
 *
 * The seed is read, never composed here. Section 1 carries the reverse index
 * inside the machine-injected block, so the machine's question material is
 * machine-supplied all the way down.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { WorkSpacifyTreeError } from '../workspacify-tree/lib/errors.mjs';
import { parseSeed } from '../workspacify-allocate/lib/seed-parse.mjs';
import { RESIDUAL_ORIGINS } from '../workspacify-allocate/lib/self-grill.mjs';

/** The gate label the reverse changes carry in ABOUT-REVERSE 6.5. */
const GATE_IDS = Object.freeze({ G1: 'G1', G2: 'G2', G3: 'G3' });

/** The kinds of question the reverse grill puts to a human. */
export const QUESTION_KINDS = Object.freeze({
  intentOrAccident: 'intent-or-accident',
  residualAnswer: 'residual-answer',
});

/** The closed answer vocabulary. The command allows Yes/No or A/B/C, and nothing else. */
export const OPTION_IDS = Object.freeze(['A', 'B', 'C']);

/**
 * How few alternatives a residual can offer and still be a question.
 *
 * One alternative is not a choice, so a residual carrying fewer is reported rather
 * than put to a human as a question with a single answer.
 */
export const MINIMUM_ALTERNATIVES = 2;

/** The machine-injected key whose presence makes a seed a reverse seed. */
export const REVERSE_INDEX_FIELD = 'reverse_index';

/** Prefix of a question id. Ids are unique within a turn, as the command requires. */
export const QUESTION_ID_PREFIX = 'Q';

/**
 * The three answers to "is this intended or accidental?", in the order they are
 * offered.
 *
 * The third is not a refusal to answer. It is the answer that records what
 * actually happened when a human was asked and no decision was made — the only
 * answer that neither invents an intent nor invents an accident.
 */
export const INTENT_OR_ACCIDENT_OPTIONS = Object.freeze([
  Object.freeze({
    id: 'A',
    statement: 'Intended: the design requires this behaviour, so it must be stated as a norm in the RFC.',
  }),
  Object.freeze({
    id: 'B',
    statement: 'Accidental: this behaviour is a historical artefact, so it must be recorded as a residue and not as a norm.',
  }),
  Object.freeze({
    id: 'C',
    statement: 'Undecided: the material available does not settle whether this behaviour is intended.',
  }),
]);

/**
 * The answer adopted when the grill receives no answer.
 *
 * A default answering `A` would manufacture an intent and one answering `B` would
 * manufacture an accident; either way the machine would assert a fact about a
 * human decision it never received. `C` records the absence of a decision, and the
 * proposition therefore stays out of the norm instead of entering it by default.
 */
export const INTENT_OR_ACCIDENT_DEFAULT = 'C';

/**
 * The phrasings that demand free-form prose.
 *
 * Declared once so the invariant predicate and any future validation of a
 * rendered question read the same list. The vocabulary is the one the command's
 * own `validate-question-format.js` refuses.
 */
export const FREE_FORM_PATTERNS = Object.freeze([
  /どう思いますか/,
  /どう考えますか/,
  /いかがでしょうか/,
  /自由にお書きください/,
  /任意/,
  /教えてください/,
  /what do you think/i,
  /your thoughts/i,
  /\bdescribe\b/i,
  /\bexplain\b/i,
  /\[自由記述\]/,
  /\[フリーテキスト\]/,
]);

/**
 * The origins that came from stage one, and therefore have a candidate behind them.
 *
 * Derived from the shared vocabulary rather than restated: a residual whose origin
 * is not one of these was authored in this session, so there is no stage-one
 * candidate for it to be carried verbatim against.
 */
const STAGE_ONE_ORIGINS = Object.freeze(RESIDUAL_ORIGINS.filter((origin) => origin.startsWith('stage1_')));

/** The unanswered-claim report is grouped by what could not be asked. */
const UNASKED_KINDS = Object.freeze({ claim: 'claim', residual: 'residual' });

/**
 * The reverse index a parsed seed carries, or null when it carries none.
 *
 * A seed rendered in forward mode has no such key, and the difference between
 * "absent" and "empty" is kept: an empty index is a reverse seed that found no
 * provenance to record, which is a fact, while an absent one means this is not a
 * reverse seed at all.
 *
 * @param {object} parsedSeed - the result of `parseSeed`
 * @returns {Array<object>|null}
 */
export function reverseIndexOf(parsedSeed) {
  const referenceBlock = parsedSeed?.referenceBlock;
  if (referenceBlock === null || typeof referenceBlock !== 'object') {
    return null;
  }
  return Object.hasOwn(referenceBlock, REVERSE_INDEX_FIELD) ? referenceBlock[REVERSE_INDEX_FIELD] : null;
}

/**
 * Generate every question the reverse grill must put to a human.
 *
 * The intent-or-accident question is inserted for every unresolved claim without
 * exception — its insertion is the whole defence against the ratification RFC, so
 * it is not conditional on the claim carrying anything beyond a statement. The
 * claim's own question and the residual's own question are carried alongside
 * verbatim rather than replaced.
 *
 * A claim or residual no question can be built for is reported in `unasked` with
 * the reason. Reporting rather than skipping is deliberate: a silently dropped
 * question is indistinguishable from a question that was never owed.
 *
 * When the stage-one hand-off is supplied, the residuals are proven to carry it
 * verbatim before any question is built. G3 is a discipline rather than an offer,
 * so the check runs on the generation path itself: a reworded topic or question
 * stops the run here instead of reaching a human in a form the observation cannot
 * survive. A hand-off that carries no candidates asks nothing of this run, so an
 * empty one is not enforced.
 *
 * @param {{ seedText: string, claims?: Array<object>, residuals?: Array<object>, stageOneResiduals?: Array<object> }} input
 * @returns {{ questions: Array<object>, unasked: Array<object>, report: string }}
 * @throws {WorkSpacifyTreeError} gateId "G1" when the seed carries no reverse index, "G3" when a residual is not carried verbatim
 */
export function generateReverseQuestions({
  seedText,
  claims = [],
  residuals = [],
  stageOneResiduals = [],
} = {}) {
  const reverseIndex = reverseIndexOf(parseSeed(seedText));
  if (reverseIndex === null) {
    throw new WorkSpacifyTreeError(
      'the seed does not carry a reverse_index in section 1, so the reverse rotation has no provenance to ask about. '
        + 'A forward seed is not the input of this grill; publish a reverse seed first.',
      { gateId: GATE_IDS.G1 },
    );
  }

  const carried = stageOneResiduals.length > 0
    ? carryResidualsVerbatim(residuals, stageOneResiduals).residual
    : residuals;
  const questions = [];
  const unasked = [];

  for (const claim of claims) {
    if (claim?.claim_type !== 'unresolved') {
      continue;
    }
    const reason = claimQuestionBlocker(claim);
    if (reason !== null) {
      unasked.push({ kind: UNASKED_KINDS.claim, claim_id: claim.claim_id ?? null, reason });
      continue;
    }
    questions.push(buildIntentOrAccidentQuestion(claim, questions.length));
  }

  for (const residual of carried) {
    const reason = residualQuestionBlocker(residual);
    if (reason !== null) {
      unasked.push({ kind: UNASKED_KINDS.residual, residual_id: residualIdentifierOf(residual), reason });
      continue;
    }
    questions.push(buildResidualQuestion(residual, questions.length));
  }

  return { questions, unasked, report: describeQuestionRun(questions, unasked) };
}

/**
 * Carry the upstream unresolved residuals into the grill verbatim.
 *
 * This is the existing discipline of the stage-two self-grill, applied at the
 * point where a question reaches a human rather than a seed: the same candidate
 * id, the same topic, and now the same question. Rewording any of the three loses
 * the observation, and a residual that stops at the payload is a question nobody
 * will ever answer.
 *
 * @param {Array<object>} residual - the residuals this grill will ask about
 * @param {Array<object>} stageOneResiduals - the stage-one hand-off
 * @returns {{ residual: Array<object> }}
 * @throws {WorkSpacifyTreeError} gateId "G3" naming the residual and the field that differs
 */
export function carryResidualsVerbatim(residual = [], stageOneResiduals = []) {
  const byCandidateId = new Map((stageOneResiduals ?? []).map((entry) => [entry.candidate_id, entry]));
  const carried = new Set();

  for (const entry of residual) {
    if (!STAGE_ONE_ORIGINS.includes(entry.origin)) {
      continue;
    }
    const candidateId = entry.origin_candidate_id;
    const source = byCandidateId.get(candidateId);
    if (source === undefined) {
      throw new WorkSpacifyTreeError(
        `${entry.id ?? candidateId} claims the stage-1 candidate ${candidateId}, which the stage-1 hand-off does not carry`,
        { gateId: GATE_IDS.G3 },
      );
    }
    carried.add(candidateId);
    assertCarriedField(entry, source, 'topic', candidateId);
    assertCarriedField(entry, source, 'grill_question', candidateId);
  }

  for (const candidateId of byCandidateId.keys()) {
    if (!carried.has(candidateId)) {
      throw new WorkSpacifyTreeError(
        `the stage-1 residual ${candidateId} is not carried into the reverse grill: every unresolved question must reach it verbatim`,
        { gateId: GATE_IDS.G3 },
      );
    }
  }

  return { residual: residual.map((entry) => ({ ...entry })) };
}

/**
 * Render the questions as the Markdown the command presents.
 *
 * Each block carries what the command's first-class rules require in order: an id,
 * the background and rationale, the choices one per line, and the recommendation
 * with its reasoning after them. The rendering is deliberately plain English,
 * because the AI reads it in order to decide.
 *
 * @param {Array<object>} questions - the output of `generateReverseQuestions`
 * @returns {string}
 */
export function renderGrillQuestions(questions = []) {
  return questions.map(renderOneQuestion).join('\n\n');
}

/**
 * Render the questions that could not be built, as a short report.
 *
 * @param {Array<object>} unasked
 * @returns {string}
 */
export function renderUnaskedReport(unasked = []) {
  if (unasked.length === 0) {
    return 'Every unresolved claim and every residual received its question.';
  }
  const lines = [
    'These could not be turned into a question and are reported rather than skipped:',
    '',
  ];
  for (const entry of unasked) {
    const subject = entry.claim_id ?? entry.residual_id ?? 'an unnamed item';
    lines.push(`- ${subject} (${entry.kind}): ${entry.reason}`);
  }
  return lines.join('\n');
}

/** Why no question can be built for a claim, or null when one can. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function claimQuestionBlocker(claim) {
  if (typeof claim.statement !== 'string' || claim.statement.trim().length === 0) {
    return 'the claim states no proposition, so there is nothing to ask a human about';
  }
  return null;
}

/** Why no question can be built for a residual, or null when one can. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function residualQuestionBlocker(residual) {
  const alternatives = Array.isArray(residual?.alternatives) ? residual.alternatives : [];
  if (alternatives.length > OPTION_IDS.length) {
    return `the residual carries more alternatives than the grill's closed answer vocabulary (${OPTION_IDS.length})`;
  }
  if (alternatives.length < MINIMUM_ALTERNATIVES) {
    return `the residual carries fewer than ${MINIMUM_ALTERNATIVES} alternatives, so there is nothing to choose between`;
  }
  for (const field of ['topic', 'grill_question', 'why_unresolved']) {
    if (typeof residual[field] !== 'string' || residual[field].trim().length === 0) {
      return `the residual states no ${field}, so the question it records would be carried empty`;
    }
  }
  return null;
}

/** The intent-or-accident question, plus the question the claim already carried. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function buildIntentOrAccidentQuestion(claim, index) {
  return {
    question_id: questionIdAt(index),
    question_kind: QUESTION_KINDS.intentOrAccident,
    claim_id: claim.claim_id ?? null,
    residual_id: claim.residual_id ?? null,
    topic: null,
    statement: claim.statement,
    carried_grill_question: nonEmptyStringOrNull(claim.grill_question),
    grill_question: `Is the observed behaviour "${claim.statement}" intended, or accidental?`,
    options: INTENT_OR_ACCIDENT_OPTIONS,
    chosen_default: INTENT_OR_ACCIDENT_DEFAULT,
    recommendation: INTENT_OR_ACCIDENT_DEFAULT,
    recommendation_reason: 'a default answering A would manufacture an intent and one answering B an accident, '
      + 'while C is the only default that records the absence of a decision',
  };
}

/** The question a residual is asked, with its own question carried verbatim. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function buildResidualQuestion(residual, index) {
  const options = residual.alternatives
    .slice(0, OPTION_IDS.length)
    .map((alternative, position) => ({
      id: OPTION_IDS[position],
      statement: typeof alternative === 'string' ? alternative : alternative.statement,
    }));
  const chosenDefault = residual.chosen_default?.alternative_id ?? options[0].id;

  return {
    question_id: questionIdAt(index),
    question_kind: QUESTION_KINDS.residualAnswer,
    claim_id: null,
    residual_id: residualIdentifierOf(residual),
    topic: residual.topic,
    statement: residual.why_unresolved,
    carried_grill_question: residual.grill_question,
    grill_question: residual.grill_question,
    options,
    chosen_default: chosenDefault,
    recommendation: chosenDefault,
    recommendation_reason: residual.chosen_default?.reason
      ?? 'the recorded default is the answer the stage-one analysis could defend from the evidence it had',
  };
}

/** The one question block, in the order the command's first-class rules demand. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function renderOneQuestion(question) {
  const lines = [`${question.question_id} — ${questionTitle(question)}`, '', backgroundOf(question), ''];
  for (const option of question.options) {
    lines.push(`${option.id}) ${option.statement}`);
  }
  lines.push('', `I recommend ${question.recommendation} because ${question.recommendation_reason}.`);
  return lines.join('\n');
}

/** The title line, which names what the question is about without restating the answer. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function questionTitle(question) {
  if (question.question_kind === QUESTION_KINDS.intentOrAccident) {
    return 'Is this behaviour intended, or accidental?';
  }
  return `Answer the carried residual \`${question.residual_id}\`: ${question.topic}`;
}

/** The background and rationale, which must say why the question is worth a human's time. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function backgroundOf(question) {
  if (question.question_kind === QUESTION_KINDS.intentOrAccident) {
    const carried = question.carried_grill_question === null
      ? 'No question was recorded for this claim upstream, so this one is the only question it receives.'
      : `The question recorded for this claim is: ${question.carried_grill_question}`;
    return `Claim \`${question.claim_id}\` states: ${question.statement} This question is asked because an RFC written `
      + 'from the code alone would restate the behaviour as intent, and nothing downstream would then be able to tell '
      + `an intention from an accident. The alternatives below are the two answers the source cannot decide between, `
      + `and the answer that records that no decision was made. ${carried}`;
  }
  return `This question is carried from the stage-one hand-off verbatim because the observation it records is lost if `
    + `it is reworded. It is put to the grill so that the choice is recorded as a selection event rather than left `
    + `in a state the pipeline waits in. It stayed unresolved because: ${question.statement}`;
}

/** The report of a run: counts and what could not be asked, never a verdict. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function describeQuestionRun(questions, unasked) {
  if (questions.length === 0 && unasked.length === 0) {
    return 'This run asked nothing: there were no unresolved claims and no residuals to ask about.';
  }
  const asked = `This run put ${questions.length} question(s) to the grill.`;
  if (unasked.length === 0) {
    return `${asked} Every unresolved claim and every residual received one.`;
  }
  return `${asked} ${unasked.length} item(s) could not be asked and are reported below rather than skipped.\n\n`
    + renderUnaskedReport(unasked);
}

/** The canonical id of the nth question. The turn's order is the identity. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function questionIdAt(index) {
  return `${QUESTION_ID_PREFIX}${index + 1}`;
}

/** The identifier a residual is known by: its stage-one candidate when it has one. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function residualIdentifierOf(residual) {
  return residual?.origin_candidate_id ?? residual?.candidate_id ?? residual?.id ?? null;
}

/** One carried field, compared verbatim, with the difference named. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function assertCarriedField(entry, source, field, candidateId) {
  if (entry[field] !== source[field]) {
    throw new WorkSpacifyTreeError(
      `${entry.id ?? candidateId} must carry the ${field} of ${candidateId} verbatim; the stage-1 ${field} is `
        + `"${source[field]}"`,
      { gateId: GATE_IDS.G3 },
    );
  }
}

/** A string that carries something, or null. An empty string is the absence of a value. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function nonEmptyStringOrNull(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** The CLI layer: read the seed and the sidecars, print the questions as Markdown. */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function runCli(argv) {
  const [seedPath, ...options] = argv;
  if (seedPath === undefined) {
    process.stderr.write(
      'Usage: reverse-questions.js <RFC-SEED.md> [--claims=<json>] [--residuals=<json>] [--stage-one=<json>]\n'
        + '  --stage-one: the stage-one hand-off, so the residuals are proven to carry it verbatim before any question is built\n',
    );
    return 2;
  }
  try {
    const claims = readJsonOption(options, '--claims');
    const residuals = readJsonOption(options, '--residuals');
    const { questions, unasked, report } = generateReverseQuestions({
      seedText: readFileSync(seedPath, 'utf8'),
      claims,
      residuals,
      stageOneResiduals: readJsonOption(options, '--stage-one'),
    });
    process.stdout.write(`${renderGrillQuestions(questions)}\n\n${report}\n`);
    if (unasked.length > 0) {
      process.stdout.write(`\n${renderUnaskedReport(unasked)}\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return error.exitCode ?? 1;
  }
}

/**
 * The array an option names, read from a file holding either the array itself or
 * the object that carries it.
 *
 * Both shapes are accepted because both are things a caller legitimately has: an
 * array dumped straight from the ledger, and the sidecar alongside it. Refusing
 * the second would report a fact about the reader rather than about the input.
 * The key inside the object is the flag with dashes written as underscores, which
 * is one mechanical rule rather than a per-option guess, and the refusal names it
 * so a caller never has to guess back.
 */
// [::TICKET::] P22-13 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-13 --for-spec --no-implementation-order`.
function readJsonOption(options, name) {
  const match = options.find((option) => option.startsWith(`${name}=`));
  if (match === undefined) {
    return [];
  }
  const key = name.replace(/^--/, '').replace(/-/g, '_');
  const payload = JSON.parse(readFileSync(match.slice(name.length + 1), 'utf8'));
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.[key])) {
    return payload[key];
  }
  throw new WorkSpacifyTreeError(
    `${name} must name an array, or an object carrying one under "${key}"`,
    { gateId: GATE_IDS.G1 },
  );
}

// The CLI runs only when this file is the entry point, so the module stays
// importable: a module that prints and exits on import cannot be tested.
if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exit(runCli(process.argv.slice(2)));
}
