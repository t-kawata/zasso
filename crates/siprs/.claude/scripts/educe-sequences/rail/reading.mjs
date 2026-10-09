// the reader-facing half: briefs, worklists, and the prove-before-write integrator
// (PX-240, contracts C002, C003, C004, C007).
//
// Three decisions carry this file.
//
// A brief is checked by counting, not by searching for a phrase: a rendered brief
// must carry exactly one interrogative sentence, the verbatim-quote requirement, the
// no-line-window rule and the worklist path. Four counted clauses cannot be satisfied
// by a template that merely mentions them.
//
// A neighbour is selected by citation — a line inside the entry's own span — never by
// coverage, because a worklist that selected neighbours by coverage reproduced the
// fabrication the programme exists to catch.
//
// The integrator proves every field of every reading before anything is written. A
// partial write is the failure this module exists to make impossible, so a refusal
// leaves the artifact byte-identical and names every unproven field at once.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { digestOf, writeArtifact } from './load.mjs';
// The reading vocabularies are declared with the files that carry them, so the driver and
// the validator cannot hold two copies of what a reading is: the copy this module used to
// keep beside its own `neighbour` literal was a second thing to drift.
import { INQUEST_ANSWERS, INQUEST_LENSES, missingReadingFields } from './readings.mjs';
// The selection rule lives with the pins because a citation inside a span is what a
// pin is: the engine and the worklist builder must not be able to disagree about it.
import { selectNeighbourFor } from './pins.mjs';

/**
 * The five reader roles.
 *
 * Four of them read the specification; the fifth, `adhoc`, is asked of the author of a
 * check written for a defect class that none of the other four can be asked about. It
 * is a role rather than a note because the author needs the same discipline the readers
 * get: one question, the verbatim-quote clause, the no-window clause, and the worklist.
 */
// [::TICKET::] PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-243 --for-spec --no-implementation-order`.
export const BRIEF_NAMES = Object.freeze(['span', 'adjudicate', 'adversarial', 'reroute', 'adhoc', 'inquest']);

/** The two clauses a brief must carry verbatim, so removing one breaks rendering. */
export const BRIEF_CLAUSES = Object.freeze({
  VERBATIM_QUOTE: 'Quote the line you read, verbatim, in every step you report.',
  NO_LINE_WINDOW: 'Never assign a verdict from a line window; read the entry and its span.',
});

/** One question per brief: a single-point question is a fact-question wearing a question's clothes. */
export const BRIEF_QUESTIONS = Object.freeze({
  span: "For each entry, is the named operation performed by the named actor inside the entry's own span?",
  adjudicate: 'Is the entry a sequence, in the sense that one named actor performs two or more ordered acts there?',
  adversarial: 'Where is the weakest link in this ruling, and what would have to be true for it to be wrong?',
  reroute: 'Which entry should realize this one instead, and what line of that entry says so?',
  adhoc: 'Which check constructor, applied to which subject, reddens the defect named here, and what correct work must stay green?',
  inquest: 'For each subject under each lens, what does the line you read say, and what does it leave unsaid?',
});

export const QUESTION_PLACEHOLDER = '{{QUESTION}}';
export const VERBATIM_PLACEHOLDER = '{{VERBATIM_QUOTE}}';
export const NO_WINDOW_PLACEHOLDER = '{{NO_LINE_WINDOW}}';
export const WORKLIST_PLACEHOLDER = '{{WORKLIST_PATH}}';

/**
 * The three clauses only the audit brief carries.
 *
 * The lens and answer vocabularies are substituted from their one declaration rather than
 * typed into the template, so a vocabulary that grew would grow in one place. The previous
 * answers are what makes the audit a re-reading rather than a repetition.
 */
export const LENSES_PLACEHOLDER = '{{LENSES}}';
export const ANSWERS_PLACEHOLDER = '{{ANSWERS}}';
export const PREVIOUS_ANSWERS_PLACEHOLDER = '{{PREVIOUS_ANSWERS}}';

/** The lines the audit brief shows for one generation's questions. */
export function renderQuestionLines(questions) {
  if (questions.length === 0) return '- the declaration declares no subject, so there is nothing to ask';
  return questions
    .map((question) => `- ${question.subject} · ${question.lens} — ${question.question} — previous: ${question.previous ?? 'not asked'}`)
    .join('\n');
}

/** The outcomes a reading may declare. */
export const ADJUDICATION_OUTCOMES = Object.freeze(['direct', 'viaNeighbour', 'notASequence', 'singleStep', 'exempt']);

/** The fields a supplied-rule reading adds. */
export const SUPPLIED_RULE_FIELDS = Object.freeze(['spec_name', 'presupposition', 'grounds', 'rule', 'why', 'override']);

/** How many sentences of the rendered brief end in a question mark. */
export function countInterrogatives(text) {
  return (text.match(/\?/g) ?? []).length;
}

/** Fill a template's placeholders; the clauses are substituted, never typed by hand. */
export function fillBriefTemplate(template, { briefName, worklistPath, previousAnswers = [] }) {
  const question = BRIEF_QUESTIONS[briefName];
  if (question === undefined) throw new Error(`unknown brief name: ${briefName}`);
  return template
    .replaceAll(QUESTION_PLACEHOLDER, question)
    .replaceAll(VERBATIM_PLACEHOLDER, BRIEF_CLAUSES.VERBATIM_QUOTE)
    .replaceAll(NO_WINDOW_PLACEHOLDER, BRIEF_CLAUSES.NO_LINE_WINDOW)
    .replaceAll(WORKLIST_PLACEHOLDER, worklistPath)
    // The three audit clauses are replaced in every template: a brief that does not carry
    // them is untouched by the substitution, and one that does cannot be rendered with a
    // placeholder left standing.
    .replaceAll(LENSES_PLACEHOLDER, INQUEST_LENSES.join(', '))
    .replaceAll(ANSWERS_PLACEHOLDER, INQUEST_ANSWERS.join(' / '))
    .replaceAll(PREVIOUS_ANSWERS_PLACEHOLDER, renderQuestionLines(previousAnswers));
}

/**
 * Render a brief from a template and refuse a template that lost a clause.
 *
 * The refusals are named by clause, not by line, so the caller learns which of the
 * four broke rather than that something did.
 */
export function renderBriefFrom({ template, briefName, worklistPath, previousAnswers = [] }) {
  const text = fillBriefTemplate(template, { briefName, worklistPath, previousAnswers });

  if (countInterrogatives(text) !== 1) {
    throw new Error(`the brief "${briefName}" carries ${countInterrogatives(text)} interrogative sentences; a brief asks exactly one question`);
  }
  if (!text.includes(BRIEF_CLAUSES.VERBATIM_QUOTE)) {
    throw new Error(`the brief "${briefName}" does not carry the verbatim-quote clause`);
  }
  if (!text.includes(BRIEF_CLAUSES.NO_LINE_WINDOW)) {
    throw new Error(`the brief "${briefName}" does not carry the no-line-window clause`);
  }
  if (!text.includes(worklistPath)) {
    throw new Error(`the brief "${briefName}" does not carry its worklist path`);
  }
  return text;
}

/** Render a named brief from the briefs directory beside this module. */
export function renderBrief({ briefName, worklistPath, briefsRoot = join(import.meta.dirname, '..', 'briefs'), previousAnswers = [] }) {
  // The name is checked before the directory is read, so a misspelt role is reported as
  // an unknown brief rather than as a missing file: those call for different responses,
  // and a fifth role appears only when a defect class appears that none of the four can
  // be asked about.
  if (!BRIEF_NAMES.includes(briefName)) {
    throw new Error(`unknown brief name: ${briefName}; the declared roles are ${BRIEF_NAMES.join(', ')}`);
  }
  const templatePath = join(briefsRoot, `${briefName}.md`);
  return renderBriefFrom({ template: readFileSync(templatePath, 'utf8'), briefName, worklistPath, previousAnswers });
}

/** The entries a selector chooses, as worklist lines naming the span to read. */
export function buildWorklist({ artifact, select }) {
  const lines = [];
  for (const entry of artifact.sequences) {
    if (!select(entry)) continue;
    const neighbour = selectNeighbourFor(artifact, entry);
    const neighbourNote = neighbour === null ? '' : ` realize-via ${neighbour}`;
    lines.push(`${entry.id} span ${entry.firstLine}-${entry.lastLine}${neighbourNote}`);
  }
  return lines;
}

/** The worklist a neighbour verdict must have been dispatched from. */
export function neighbourIsCited(artifact, entry, namedNeighbour) {
  return selectNeighbourFor(artifact, entry) === namedNeighbour;
}

/** A refusal names the subject and the field, so the reader knows which reading to redo. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function refuse(refusals, subject, field, why, extra = {}) {
  refusals.push({ subject, field, why, ...extra });
}

/** Prove one reading against the artifact, the specification and the engine. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function proveReading({ reading, artifact, specLines, refusals }) {
  const subject = reading.subject ?? '(unnamed)';

  for (const field of missingReadingFields(reading)) {
    refuse(refusals, subject, field, `the reading carries no ${field}`);
  }
  if (refusals.some((entry) => entry.subject === subject)) return;

  if (!ADJUDICATION_OUTCOMES.includes(reading.outcome)) {
    refuse(refusals, subject, 'outcome', `outcome "${reading.outcome}" is not one of ${ADJUDICATION_OUTCOMES.join(', ')}`);
    return;
  }

  // A subject may be a sequence entry or an operation: a supplied rule is a reading
  // about an operation, and refusing it here would force every supplied rule to be
  // recorded as if it were a sequence.
  const entry =
    artifact.sequences.find((candidate) => candidate.id === subject) ??
    artifact.operations.find((candidate) => candidate.id === subject);
  if (entry === undefined) {
    refuse(refusals, subject, 'subject', 'the artifact declares no such entry');
    return;
  }

  if (reading.outcome === 'viaNeighbour') {
    const selected = selectNeighbourFor(artifact, entry);
    if (selected !== reading.neighbour) {
      refuse(refusals, subject, 'neighbour', `the reading names ${reading.neighbour}; the engine selects ${selected}`);
    }
  }

  if (reading.spec_name !== undefined) proveSuppliedRule({ reading, artifact, specLines, refusals, subject });
}

/** Prove a supplied rule: its presupposition must be an integer line naming its subject. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function proveSuppliedRule({ reading, artifact, specLines, refusals, subject }) {
  for (const field of SUPPLIED_RULE_FIELDS) {
    if (reading[field] === undefined) refuse(refusals, subject, field, `the supplied rule carries no ${field}`);
  }
  if (refusals.some((entry) => entry.subject === subject && entry.field !== 'defining_section')) return;

  if (!Number.isInteger(reading.presupposition)) {
    refuse(refusals, subject, 'presupposition', 'the presupposition is prose; a supplied rule names the line it reads', {
      searched: reading.grounds,
    });
    return;
  }
  const line = specLines[reading.presupposition - 1] ?? '';
  if (!line.includes(reading.spec_name)) {
    refuse(refusals, subject, 'presupposition', `line ${reading.presupposition} does not name ${reading.spec_name}`, {
      searched: reading.grounds,
    });
    return;
  }
  if (reading.grounds.length === 0) {
    refuse(refusals, subject, 'grounds', 'the supplied rule cites no ground');
  }

  const row = artifact.operations.find((operation) => operation.id === reading.spec_name);
  if (row?.defining_section !== undefined && row.defining_section !== null) {
    refuse(refusals, subject, 'defining_section', `the row keeps defining_section ${row.defining_section} that the supplied rule supersedes`);
  }
}

/**
 * Apply a set of readings to the artifact, writing only when every field is proven.
 *
 * @returns {{written: number} | {refused: Array<{subject: string, field: string, why: string}>}}
 */
export function applyReadings({ artifactPath, readings, artifact, specLines }) {
  const target = artifact ?? JSON.parse(readFileSync(artifactPath, 'utf8'));
  const refusals = [];

  const seen = new Set();
  for (const reading of readings) {
    if (seen.has(reading.subject)) {
      refuse(refusals, reading.subject ?? '(unnamed)', 'subject', 'a second reading for one subject is not a repair of the first');
      continue;
    }
    seen.add(reading.subject);
    proveReading({ reading, artifact: target, specLines, refusals });
  }

  if (refusals.length > 0) return { refused: refusals };

  writeArtifact(artifactPath, target);
  return { written: readings.length };
}

/** The digest of the artifact as it stands, or null when nothing has been written yet. */
export function artifactDigest(artifactPath) {
  return existsSync(artifactPath) ? digestOf(artifactPath) : null;
}
