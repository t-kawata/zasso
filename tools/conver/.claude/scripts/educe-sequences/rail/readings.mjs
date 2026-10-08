// The files the reading phases exchange (PX-240, the phase driver).
//
// A reading phase is where a machine cannot go, so what it hands back has to be a
// shape the machine can check. Two files carry that shape: the declaration, which says
// what to look for, and one readings file per brief, which says what was found. Both
// are validated line by line before anything downstream sees them, because a reading
// file that is only mostly well formed is the failure this module exists to catch.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** The declaration a run reads at phase 2. */
export const DECLARATION_FILE = 'declaration.json';

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

/** The fields one reading is missing, given its outcome. */
export function missingReadingFields(reading) {
  const required = reading?.outcome === 'viaNeighbour' ? [...READING_FIELDS, NEIGHBOUR_FIELD] : READING_FIELDS;
  return missingFrom(reading, required);
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
    readings.push(reading);
  }

  return problems.length > 0 ? { ok: false, problems } : { ok: true, readings };
}

/** Write a readings file, one reading per line. */
export function writeReadingsFile(path, readings) {
  writeFileSync(path, `${readings.map((reading) => JSON.stringify(reading)).join('\n')}\n`);
}

/** The signature a reading carries; a claim with no signature is not a reading. */
export function isSigned(reading) {
  return typeof reading.reader === 'string' && reading.reader.trim() !== '';
}

/** How many readings in a file carry a signature. */
export function signedCount(readings) {
  return readings.filter(isSigned).length;
}
