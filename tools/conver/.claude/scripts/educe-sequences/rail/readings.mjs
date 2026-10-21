// [::TICKET::] PX-267 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-267 --for-spec --no-implementation-order`.
// The files the reading phases exchange (PX-240, the phase driver).
//
// A reading phase is where a machine cannot go, so what it hands back has to be a
// shape the machine can check. Two files carry that shape: the declaration, which says
// what to look for, and one readings file per brief, which says what was found. Both
// are validated line by line before anything downstream sees them, because a reading
// file that is only mostly well formed is the failure this module exists to catch.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SmoothSequencesError } from '../../smooth-sequences/lib/errors.mjs';

// The levels a partition may be taken at belong with the partition rule rather than here,
// so a declaration cannot be validated against a vocabulary the partitioner does not hold.
import { SECTION_LEVELS } from './pins.mjs';

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

/**
 * The worklist of borrowed census members no step has accounted for.
 *
 * A second file rather than a second section of the first, because the first is a list of
 * spans and the gate that reads it refuses a line that names no span — a rule that exists
 * so a worklist cannot select by coverage. This one is a list of names, and mixing the two
 * would mean loosening that gate.
 */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
export const UNCOVERED_WORKLIST_FILE = 'worklist-uncovered.txt';

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
 * Where a generation puts the readings it supersedes.
 *
 * A new generation moves the declaration and the readings of every `[read]` phase here,
 * which is what makes the promise that a generation asks the reader again true rather
 * than stated: the gate a `[read]` phase already has can see only that the file it is
 * told to read exists and is signed, so a file left in place is a file that passes. The
 * move is a rename, so nothing is deleted and the previous generation's answers stay
 * readable at one path, which is what a re-read is made against.
 */
// [::TICKET::] PX-254 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-254 --for-spec --no-implementation-order`.
export const ARCHIVE_DIRECTORY = 'archive';

/**
 * The name a working file takes once a generation has moved it aside.
 *
 * Derived from the name rather than declared beside it, so an archived reading cannot
 * drift from the reading it archives: the generation goes before the final extension,
 * which is the one place in the name that is not the file's identity.
 */
// [::TICKET::] PX-254 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-254 --for-spec --no-implementation-order`.
export function archivedFileName(fileName, generation) {
  return fileName.replace(/(\.[^.]*)$/, `.g${generation}$1`);
}

/**
 * Move a generation's working files aside, and answer with the names they took.
 *
 * A file that is not there is skipped rather than refused: the first generation and one
 * opened after a partial run both legitimately hold fewer files than the phase table
 * names, and a move that refused them would refuse the run that has read least.
 *
 * @param {{directory: string, generation: number, files: string[]}} request — the run
 *   directory, the generation being superseded, and the files it wrote
 * @returns {string[]} — the archived names, in the order the files were given
 */
// [::TICKET::] PX-254 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-254 --for-spec --no-implementation-order`.
export function archiveReadings({ directory, generation, files }) {
  const present = files.filter((name) => existsSync(join(directory, name)));
  if (present.length === 0) return [];

  const archive = join(directory, ARCHIVE_DIRECTORY);
  mkdirSync(archive, { recursive: true });
  return present.map((name) => {
    const archived = archivedFileName(name, generation);
    renameSync(join(directory, name), join(archive, archived));
    return archived;
  });
}

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

/** The shapes a resolved Yes-to-No answer may carry. */
export const RESOLUTION_KINDS = Object.freeze(['spec-change', 'artifact-change', 'misreading']);

/** The fields a resolution carries. */
export const INQUEST_RESOLUTION_FIELDS = Object.freeze(['kind', 'evidence']);

/** The outcomes an uncovered operation may carry. */
export const UNCOVERED_OUTCOMES = Object.freeze(['performed', 'escaped']);

/** The fields an uncovered record carries. */
export const UNCOVERED_FIELDS = Object.freeze(['subject', 'outcome', 'reader']);

/** The fields every reading carries, and the extra one a neighbour verdict carries. */
export const READING_FIELDS = Object.freeze(['subject', 'outcome', 'reader']);
export const NEIGHBOUR_FIELD = 'neighbour';

/**
 * The limb a ruling that something is not an operation must name, and which rulings owe one.
 *
 * Required of the rulings that apply the predicate and of no others, because a ruling that
 * says an entry is not an operation has decided the predicate and a ruling that says it is a
 * single step has not. The value is either one of the declared limbs or the literal for no
 * limb applying: no limb applying is a finding, and a vocabulary that had no word for it would
 * force the reader to invent one.
 *
 * All three are declared in `artifact-schema.json` and read by `load.mjs`, which owns what the
 * artifact's words mean, and re-exported here so a reader imports the vocabulary from the
 * reading side without a second copy existing. A literal kept here bound no project to it: a
 * check selecting by one examined nothing at all over a specification whose rows are worded
 * differently, which is how it stayed green while measuring nothing.
 */
export { LIMB_RULING_OUTCOMES, NO_LIMB_APPLIES, PREDICATE_LIMB_FIELD } from './load.mjs';

/**
 * The fields a step must carry to be grounded in the document it was read from.
 *
 * `line` and `quote` are the pair the check `step-is-grounded-in-its-line` compares, and
 * the pair the campaign identified as the only thing that makes a decomposition
 * detectable: 1178 steps carrying the four act fields, in order, with the bijection
 * holding, and none of them a reading. A step that carries the fields and not the line is
 * a step no check can ask about, so the integrator refuses the reading rather than
 * recording one.
 */
export const STEP_GROUNDING_FIELDS = Object.freeze(['line', 'quote']);

/** The grounding fields one step leaves absent or empty, by field name. */
export function missingStepFields(step) {
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
  return absentFields(step, STEP_GROUNDING_FIELDS);
}

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

  // The section level is a scalar rather than a section: it says how the document is
  // partitioned, not what to look for in it. A level the apparatus cannot partition at is
  // refused here rather than quietly replaced by the default, because a declaration that
  // asked for one level and partitioned at another would be read at a level nobody chose.
  const sectionLevel = declaration.sectionLevel;
  if (sectionLevel !== undefined && !SECTION_LEVELS.includes(sectionLevel)) {
    problems.push(`sectionLevel ${JSON.stringify(sectionLevel)} is not one of ${SECTION_LEVELS.join(', ')}`);
  }

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

/** The suffix a reader uses to name the generation that performed the reading. */
export const GENERATION_SUFFIX_PATTERN = /generation-?\d+/;

/** The number a reader names, or null when the reader is legacy. */
export function resolveGenerationNumber(reader) {
  const match = String(reader ?? '').match(GENERATION_SUFFIX_PATTERN);
  return match === null ? null : Number.parseInt(match[0].replace(/\D/g, ''), 10);
}

/**
 * The reader identities a readings file actually carries.
 *
 * A generation is the unit that owns an answer: a file whose rows were written by two
 * generations is two audits stitched together, and a count over it would be a count over
 * neither. A reader name without a generation suffix is a legacy reader and is one family,
 * because the older files never carried the generation directory.
 */
// [::TICKET::] PX-294 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-294 --for-spec --no-implementation-order`.
export function readerGenerationsOf(rows) {
  const generations = new Set();
  for (const row of rows) {
    const reader = typeof row?.reader === 'string' ? row.reader : '';
    const match = reader.match(GENERATION_SUFFIX_PATTERN);
    if (match !== null) generations.add(reader.slice(0, match.index + match[0].length));
  }
  return [...generations].sort();
}

/**
 * Refuse a file written by more than one generation, or by an older one.
 *
 * The same reader name repeated is one generation; the absence of a generation suffix is
 * a legacy reader and is treated as one. A mixture is the laundering path this guard
 * exists to close: the newest generation would otherwise inherit the older generation's
 * answers while its own reader count read as complete. A named generation mixed with a
 * legacy row is a mixture too, because the legacy row has no generation to compare.
 *
 * `currentGeneration` is supplied only by a run that carries an evidence manifest; a
 * legacy workspace has no generation to compare against and keeps the old behavior.
 */
// [::TICKET::] PX-294 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-294 --for-spec --no-implementation-order`.
export function assertSingleReader(rows, { currentGeneration = null } = {}) {
  const generations = readerGenerationsOf(rows);
  const legacyPresent = rows.some((row) => resolveGenerationNumber(row?.reader) === null);
  if (generations.length > 1 || (generations.length === 1 && legacyPresent)) {
    const named = legacyPresent ? [...generations, 'legacy'] : generations;
    throw new SmoothSequencesError(
      `READER_MIXED: the readings carry ${named.length} reader generation(s): ${named.join(', ')}`,
      { code: 'READER_MIXED', repair: 're-answer every question in one generation, or archive the old answers and start a new generation' },
    );
  }
  if (generations.length === 1) {
    if (Number.isInteger(currentGeneration)) {
      const stale = generations.find((reader) => resolveGenerationNumber(reader) !== currentGeneration);
      if (stale !== undefined) {
        throw new SmoothSequencesError(
          `READER_STALE: ${stale} is not generation ${currentGeneration}`,
          { code: 'READER_STALE', repair: `re-answer the file under educe-sequences/generation-${currentGeneration}` },
        );
      }
    }
    return { ok: true, readers: generations };
  }
  const legacy = [...new Set(rows.map((row) => String(row?.reader ?? '')))].sort();
  return { ok: true, readers: legacy };
}

/** The line at a 1-indexed position, or an empty string when the position is absent. */
// [::TICKET::] PX-288 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-288 --for-spec --no-implementation-order`.
function lineAt(spec, line) {
  if (!Number.isInteger(line) || line < 1) return '';
  return typeof spec?.lines?.[line - 1] === 'string' ? spec.lines[line - 1] : '';
}

/** Whether a quote is present in a line, after whitespace normalization. */
// [::TICKET::] PX-288 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-288 --for-spec --no-implementation-order`.
function quoteIsIn(quote, text) {
  if (typeof quote !== 'string' || quote.trim() === '') return false;
  const normalizedQuote = quote.replace(/\s+/g, ' ').trim();
  const normalizedText = String(text).replace(/\s+/g, ' ').trim();
  return normalizedText.includes(normalizedQuote);
}

/**
 * Verify the evidence a previous Yes -> current No answer owes.
 *
 * The resolution is the only thing that distinguishes a reader who learned something from
 * a reader who changed their mind: a specification change must show the cited line before
 * and after, an artifact change must show the transaction that moved it, and a misreading
 * must name the second reader and is refused unless an explicit waiver covers it.
 */
export function verifyResolution(record, { previousSpec = null, currentSpec = null } = {}) {
  if (record?.previous !== 'Yes' || record?.answer !== 'No') return { ok: true, required: false };
  const resolution = record?.resolution;
  if (resolution === null || typeof resolution !== 'object' || !RESOLUTION_KINDS.includes(resolution.kind)) {
    throw new SmoothSequencesError(
      `READING_UNRESOLVED: ${record.subject}/${record.lens} moved from Yes to No without a resolution`,
      { code: 'READING_UNRESOLVED', repair: 'record resolution.kind as spec-change, artifact-change or misreading, with evidence' },
    );
  }
  const evidence = resolution.evidence ?? {};
  if (resolution.kind === 'spec-change') {
    const previousLine = lineAt(previousSpec, evidence.line) || String(evidence.previousQuote ?? '');
    const currentLine = lineAt(currentSpec, evidence.line) || String(evidence.currentQuote ?? '');
    if (previousLine === currentLine) {
      throw new SmoothSequencesError(
        `READING_UNRESOLVED: ${record.subject}/${record.lens} cites line ${evidence.line}, which did not change`,
        { code: 'READING_UNRESOLVED', repair: 'cite the line the specification actually changed, or record a different resolution kind' },
      );
    }
    if (!quoteIsIn(evidence.previousQuote, previousLine) || !quoteIsIn(evidence.currentQuote, currentLine)) {
      throw new SmoothSequencesError(
        `READING_UNRESOLVED: ${record.subject}/${record.lens} does not quote the cited line on both sides`,
        { code: 'READING_UNRESOLVED', repair: 'make previousQuote and currentQuote quotations of the cited line' },
      );
    }
    return { ok: true, required: true, kind: resolution.kind };
  }
  if (resolution.kind === 'artifact-change') {
    if (typeof evidence.transaction !== 'string' || evidence.transaction.trim() === '') {
      throw new SmoothSequencesError(
        `READING_UNRESOLVED: ${record.subject}/${record.lens} names no artifact transaction`,
        { code: 'READING_UNRESOLVED', repair: 'name the regeneration transaction that changed the artifact record' },
      );
    }
    return { ok: true, required: true, kind: resolution.kind };
  }
  if (typeof evidence.secondReader !== 'string' || evidence.secondReader.trim() === '' || evidence.waiver !== true) {
    throw new SmoothSequencesError(
      `READING_UNRESOLVED: ${record.subject}/${record.lens} claims a misreading without a second reader and a waiver`,
      { code: 'READING_UNRESOLVED', repair: 'record the second reader and an explicit waiver, or use a verified change' },
    );
  }
  return { ok: true, required: true, kind: resolution.kind };
}

/** The fields an uncovered record is missing or carrying outside the vocabulary. */
export function validateUncoveredRecord(record) {
  const problems = absentFields(record, UNCOVERED_FIELDS);
  if (record?.outcome !== undefined && !UNCOVERED_OUTCOMES.includes(record.outcome)) {
    problems.push(`outcome ${record.outcome} is not performed or escaped`);
  }
  if (record?.outcome === 'performed' && (typeof record.step !== 'string' || record.step.trim() === '')) {
    problems.push('a performed record must name its step');
  }
  if (record?.outcome === 'escaped') {
    if (typeof record.position !== 'string' || record.position.trim() === '') problems.push('an escaped record must name its position');
    if (!Number.isInteger(record.line) || record.line < 1) problems.push('an escaped record must cite its line');
    if (typeof record.quote !== 'string' || record.quote.trim() === '') problems.push('an escaped record must quote its line');
    if (typeof record.why !== 'string' || record.why.trim() === '') problems.push('an escaped record must say why');
  }
  return problems;
}

/**
 * The anchor an inquest answer owes when its subject is an object.
 *
 * A quote-at-line is not a subject anchor: an object answer must cite a line that names
 * the object, or carry an explicit anchor quote that does. The gate verifies existence and
 * the naming; it does not judge whether the answer is semantically right.
 */
// [::TICKET::] PX-289 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-289 --for-spec --no-implementation-order`.
export function validateInquestRecord(record, { specLines = [], subject = record?.subject } = {}) {
  const problems = [];
  if (typeof subject !== 'string' || !subject.startsWith('@object:')) return problems;
  const name = subject.slice('@object:'.length);
  const line = Number.isInteger(record?.line) && record.line > 0 ? specLines[record.line - 1] : '';
  const lineNamesObject = typeof line === 'string' && line.includes(name);
  const anchorQuote = typeof record?.anchor?.quote === 'string' ? record.anchor.quote : '';
  const anchorNamesObject = anchorQuote.includes(name);
  if (!lineNamesObject && !anchorNamesObject) {
    problems.push(`object ${name} is not named on the cited line and no anchor quote names it`);
  }
  return problems;
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
// [::TICKET::] PX-294 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-294 --for-spec --no-implementation-order`.
export function readReadingsFile(path, { currentGeneration = null } = {}) {
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

  if (problems.length > 0) return { ok: false, problems };
  try {
    assertSingleReader(readings, { currentGeneration });
  } catch (error) {
    return { ok: false, problems: [error.message] };
  }
  return { ok: true, readings };
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

/**
 * The newest archived inquest, which is the previous generation's answers.
 *
 * `archiveReadings` renames the current file into the archive at the start of a run, so a
 * brief built from the current path alone would see no previous answer. The archive is the
 * only place that answer survives, and the generation number in the name orders them.
 */
export function previousInquestRecordsIn(directory) {
  const archive = join(directory, 'archive');
  if (!existsSync(archive)) return [];
  const names = readdirSync(archive)
    .map((name) => ({ name, match: name.match(/^readings-inquest\.g(\d+)\.jsonl$/) }))
    .filter((entry) => entry.match !== null)
    .sort((left, right) => Number(right.match[1]) - Number(left.match[1]));
  if (names.length === 0) return [];
  const read = readReadingsFile(join(archive, names[0].name));
  return read.ok ? read.readings : [];
}

/** Read and validate the file the audit is answered in. */
// [::TICKET::] PX-294 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-294 --for-spec --no-implementation-order`.
export function readInquestFile(path, options = {}) {
  if (!existsSync(path)) return { ok: false, problems: [`${path} does not exist — the audit has not been answered`] };
  return readReadingsFile(path, options);
}

/**
 * The subjects the audit puts: the declaration's sections and entries, and the escapes.
 *
 * An escape is an operation no step performs that a grounded reason covers — the one
 * reading in the run that nothing else interrogates, because no step carries it. It is a
 * subject here rather than an exception at one call site so that the brief, the gate, the
 * check and the report cannot disagree about how many questions the audit asks.
 *
 * @param {{sections?: Array<object>, entries?: Array<object>, escaped?: string[]}} input
 */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
export function inquestSubjects({ sections = [], entries = [], escaped = [] }) {
  return [...[...sections, ...entries].map((record) => record.id), ...escaped];
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
export function inquestQuestions({ declaration, previousAnswers = [], escaped = [] }) {
  const answered = new Map(previousAnswers.map((record) => [`${record.subject}\u0000${record.lens}`, record.answer ?? null]));
  return inquestPairs(inquestSubjects({ ...declaration, escaped })).map((pair) => ({
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
