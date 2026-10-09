// The files the reading phases exchange (PX-240, the phase driver).
//
// A reading phase is where a machine cannot go, so what it hands back has to be a
// shape the machine can check. Two files carry that shape: the declaration, which says
// what to look for, and one readings file per brief, which says what was found. Both
// are validated line by line before anything downstream sees them, because a reading
// file that is only mostly well formed is the failure this module exists to catch.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The declaration a run reads at phase 2. */
export const DECLARATION_FILE = 'declaration.json';

/**
 * The two working files a deterministic phase writes, named here rather than in the
 * driver, because the driver needs the gates and the gates need these names: a name
 * declared in `phases.mjs` could not be imported by `gates.mjs` without a cycle, and a
 * second copy of it would be a second thing to drift.
 */
// [::TICKET::] PX-242 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-242 --for-spec --no-implementation-order`.
export const PINS_FILE = 'pins.json';
export const WORKLIST_FILE = 'worklist.txt';

/** The required keys of a declaration and of one entry of it. */
export const DECLARATION_SHAPE = Object.freeze({
  predicate: ['limbs'],
  rowSchema: ['fields'],
  weakestLink: ['subject', 'why', 'tightenedBy'],
  enumerations: ['name', 'members', 'closedness'],
  forms: ['name', 'proposes'],
  entries: ['id', 'kind', 'firstLine', 'lastLine'],
  sections: ['id', 'firstLine', 'lastLine'],
  exemptions: [],
});

/**
 * The sections that carry one object rather than a list of them.
 *
 * The distinction has to be declared: a section requiring keys is otherwise read as a
 * list of entries, and an empty list would satisfy it while saying nothing at all.
 */
export const SINGLE_SECTIONS = Object.freeze(['predicate', 'rowSchema', 'weakestLink']);

/** The file one brief's readings arrive in. */
export function readingsFileName(briefName) {
  return `readings-${briefName}.jsonl`;
}

/** The file the audit is answered in. */
export const INQUEST_FILE = readingsFileName('inquest');

/**
 * The four lenses (PX-243).
 *
 * Named rather than written out because the brief, the checks and the report all ask
 * under them, and a vocabulary with four copies is a vocabulary that drifts. The names
 * are the four the requirement states: 漏れ, 矛盾, 不足, 危険.
 */
export const INQUEST_LENSES = Object.freeze(['omission', 'contradiction', 'deficiency', 'risk']);

/** The answers a question may carry: the vocabulary the command already declares. */
export const INQUEST_ANSWERS = Object.freeze(['Yes', 'No', 'A', 'B', 'C']);

/**
 * The question each lens asks, phrased as a clause rather than a sentence.
 *
 * A clause rather than a question because the brief that carries them carries exactly
 * one interrogative sentence, and a brief that asked fifty-six questions would be
 * refused as a brief. `inquest.md` states the single question the reader answers.
 */
export const INQUEST_QUESTIONS = Object.freeze({
  omission: 'is a required act absent from this subject',
  contradiction: 'does this subject contradict another line of the specification',
  deficiency: 'is a required property of this subject left unstated',
  risk: 'could this subject fail in a way no line of the specification covers',
});

/** Every field an answer carries. */
export const INQUEST_FIELDS = Object.freeze(['subject', 'lens', 'question', 'answer', 'line', 'quote', 'reader']);

/** The fields every reading carries, and the extra one a neighbour verdict carries. */
export const READING_FIELDS = Object.freeze(['subject', 'outcome', 'reader']);
export const NEIGHBOUR_FIELD = 'neighbour';

/** Parse a JSON file, reporting a parse failure rather than throwing. */
export function readJsonFile(path) {
  if (!existsSync(path)) return { ok: false, problems: [`${path} does not exist`] };
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, 'utf8')) };
  } catch (error) {
    return { ok: false, problems: [`${path} is not readable JSON: ${error.message}`] };
  }
}

/** The keys a record is missing from a required list. */
// [::TICKET::] PX-240, PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-240|PX-241) --for-spec --no-implementation-order`.
function missingFrom(record, required) {
  return required.filter((key) => record?.[key] === undefined);
}

/**
 * Validate a declaration.
 *
 * The declaration says what to look for, so an empty limb list is refused here rather
 * than surfacing later as a specification that "has no predicate" — which would be a
 * statement about the reader, not about the specification.
 */
export function validateDeclaration(declaration) {
  const problems = [];
  if (declaration === null || typeof declaration !== 'object') return ['the declaration is not an object'];

  for (const [section, required] of Object.entries(DECLARATION_SHAPE)) {
    const value = declaration[section];
    if (value === undefined) {
      problems.push(`the declaration has no ${section}`);
      continue;
    }
    if (SINGLE_SECTIONS.includes(section)) {
      if (Array.isArray(value) || typeof value !== 'object' || value === null) {
        problems.push(`${section} is not an object`);
        continue;
      }
      for (const key of missingFrom(value, required)) problems.push(`${section} has no ${key}`);
      if (Array.isArray(value[required[0]]) && value[required[0]].length === 0) problems.push(`${section}.${required[0]} is empty`);
      for (const key of required) {
        if (typeof value[key] === 'string' && value[key].trim() === '') problems.push(`${section}.${key} is empty`);
      }
      continue;
    }
    if (!Array.isArray(value)) {
      problems.push(`${section} is not a list`);
      continue;
    }
    value.forEach((entry, index) => {
      for (const key of missingFrom(entry, required)) problems.push(`${section}[${index}] has no ${key}`);
    });
  }

  if (Array.isArray(declaration.enumerations) && declaration.enumerations.every((entry) => (entry.members ?? []).length === 0)) {
    problems.push('every enumeration declares no members, which is a reading of nothing');
  }
  return problems;
}

/** Read and validate a declaration file. */
export function readDeclarationFile(path) {
  const parsed = readJsonFile(path);
  if (!parsed.ok) return { ok: false, problems: parsed.problems };
  const problems = validateDeclaration(parsed.value);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, declaration: parsed.value };
}

/** The fields one reading is missing, given the shape it declares. */
export function missingReadingFields(reading) {
  if (inquestShapeOf(reading) === 'inquest') return absentFields(reading, INQUEST_FIELDS);
  const required = reading?.outcome === 'viaNeighbour' ? [...READING_FIELDS, NEIGHBOUR_FIELD] : READING_FIELDS;
  return absentFields(reading, required);
}

/**
 * Which shape a reading declares.
 *
 * A record carrying a lens is an answer to the audit; anything else is a verdict about a
 * sequence. The shape is read from the record rather than passed beside it, so a file
 * cannot be half one shape and half the other without a line being refused for the
 * fields its own shape requires.
 */
export function inquestShapeOf(reading) {
  return reading?.lens === undefined ? 'sequence' : 'inquest';
}

/** The fields a record leaves absent or empty; an empty string answers nothing. */
// [::TICKET::] PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244) --for-spec --no-implementation-order`.
function absentFields(record, required) {
  return required.filter((key) => record?.[key] === undefined || record?.[key] === '');
}

/**
 * A lens outside the declared four, named so the reader knows what to repair.
 *
 * The lens vocabulary is refused here rather than by a check because it decides the
 * shape of the record: a reading whose lens is unknown is not an answer to anything the
 * audit asks, and every later check would be reading a record it cannot place.
 */
export function inquestVocabularyProblems(reading) {
  if (inquestShapeOf(reading) !== 'inquest') return [];
  return INQUEST_LENSES.includes(reading.lens)
    ? []
    : [`the lens "${reading.lens}" is not one of ${INQUEST_LENSES.join(', ')}`];
}

/**
 * Read and validate a readings file.
 *
 * A line that is not an object, and a reading missing a field, are both reported with
 * the line they were found on, so a reader learns which claim to redo rather than that
 * something somewhere is wrong.
 */
export function readReadingsFile(path) {
  if (!existsSync(path)) return { ok: false, problems: [`${path} does not exist — the brief has not reported`] };

  const problems = [];
  const readings = [];
  for (const [index, line] of readFileSync(path, 'utf8').split('\n').entries()) {
    if (line.trim() === '') continue;
    let reading;
    try {
      reading = JSON.parse(line);
    } catch (error) {
      problems.push(`line ${index + 1} is not JSON: ${error.message}`);
      continue;
    }
    const missing = missingReadingFields(reading);
    if (missing.length > 0) {
      problems.push(`line ${index + 1} carries no ${missing.join(', ')}`);
      continue;
    }
    const vocabulary = inquestVocabularyProblems(reading);
    if (vocabulary.length > 0) {
      problems.push(`line ${index + 1}: ${vocabulary.join('; ')}`);
      continue;
    }
    readings.push(reading);
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, readings };
}

/**
 * The audit a run directory holds, or null when it holds none.
 *
 * Null and an empty list are different findings and the checks read them differently: a
 * run with no audit anywhere has nothing to judge, while an audit that was opened and
 * answered nothing is incomplete. Collapsing the two would make a specification with no
 * run directory beside it indistinguishable from one whose reader never reported.
 */
// [::TICKET::] PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-243 --for-spec --no-implementation-order`.
export function inquestBeside(directory) {
  const read = readInquestFile(join(directory, INQUEST_FILE));
  return read.ok ? read.readings : null;
}

/** The answers a run directory holds, or none when the audit has not been answered. */
export function inquestRecordsIn(directory) {
  return inquestBeside(directory) ?? [];
}

/** Read and validate the file the audit is answered in. */
export function readInquestFile(path) {
  if (!existsSync(path)) return { ok: false, problems: [`${path} does not exist — the audit has not been answered`] };
  return readReadingsFile(path);
}

/** The subjects a declaration puts to the audit: its sections and its entries. */
export function inquestSubjects({ sections = [], entries = [] }) {
  return [...sections, ...entries].map((record) => record.id);
}

/** Every (subject, lens) pair a set of subjects puts. */
export function inquestPairs(subjects) {
  return subjects.flatMap((subject) => INQUEST_LENSES.map((lens) => ({ subject, lens })));
}

/** Whether an exemption covers a pair. */
export function isExempt(exemptions, { subject, lens }) {
  return (exemptions ?? []).some((entry) => entry.subject === subject && entry.lens === lens);
}

/**
 * The questions this generation asks, each carrying what the previous one answered.
 *
 * The previous answers are attached rather than substituted, so a pair the previous
 * generation never carried renders as unanswered rather than vanishing: an audit that
 * silently shrank between generations would be the one change nobody could see.
 */
export function inquestQuestions({ declaration, previousAnswers = [] }) {
  const answered = new Map(previousAnswers.map((record) => [`${record.subject}\u0000${record.lens}`, record.answer ?? null]));
  return inquestPairs(inquestSubjects(declaration)).map((pair) => ({
    ...pair,
    question: INQUEST_QUESTIONS[pair.lens],
    previous: answered.get(`${pair.subject}\u0000${pair.lens}`) ?? null,
  }));
}

/** How many pairs the declaration puts, how many were answered, and how many are exempt. */
export function inquestCounts({ subjects, records = [], exemptions = [] }) {
  const pairs = inquestPairs(subjects);
  return {
    asked: pairs.length,
    answered: pairs.filter((pair) => records.some((record) => record.subject === pair.subject && record.lens === pair.lens)).length,
    exempt: pairs.filter((pair) => isExempt(exemptions, pair)).length,
  };
}

/** The lens a record answers under, or null when it is not an answer. */
export function lensOf(reading) {
  return inquestShapeOf(reading) === 'inquest' ? reading.lens : null;
}

/** The signature a reading carries; a claim with no signature is not a reading. */
export function isSigned(reading) {
  return typeof reading.reader === 'string' && reading.reader.trim() !== '';
}

/** How many readings in a file carry a signature. */
export function signedCount(readings) {
  return readings.filter(isSigned).length;
}

/** Write a readings file, one reading per line. */
export function writeReadingsFile(path, readings) {
  writeFileSync(path, `${readings.map((reading) => JSON.stringify(reading)).join('\n')}\n`);
}
