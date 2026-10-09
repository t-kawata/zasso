// What a generation measured of its artifact.
//
// The rail cannot see the specification's true sequence space, so it does not measure a
// fraction of one: a denominator nobody can enumerate would make every printed number a
// guess wearing a percentage. What it can measure is what the artifact holds and which
// lines of the document the reading reached, and both are recorded facts — a count of
// records, and the union of the line numbers those records name.
//
// The counts are not a pass condition. They are reported side by side across generations
// so a reader can see whether the returns are diminishing and decide, outside the run,
// whether to ask for another one. A generation that merges two sequences into one is an
// improvement carrying a smaller number, so a threshold on any of these would refuse the
// work it is meant to encourage.
//
// The line partition is the one thing here that is not a measurement of degree.
// `uncoveredRanges` answers which lines no record reaches, and a line in that answer is a
// line nobody read in any generation — categorical rather than comparative. That is why
// the counts above are a report and that answer is a refusal.
//
// Each measured term names one set. An entry is not a sequence: the rail requires every
// line of the specification to belong to an entry, so most entries of most documents are
// regions that were read and found to hold no sequence. A reader planning an interface
// needs the operations an interface must implement, which is `placed` and not the count of
// operation records; and the interface's own member list is a denominator the artifact does
// not hold, so it is printed as the borrowed census it is or named as absent.

import { DIAGRAMMED_OUTCOMES, UNREACHED_ESCAPES } from './load.mjs';

/** Every integer from `first` to `last`, or none when the ends are not a range. */
// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
function linesBetween(first, last) {
  if (!Number.isInteger(first) || !Number.isInteger(last) || last < first) return [];
  const lines = [];
  for (let line = first; line <= last; line += 1) lines.push(line);
  return lines;
}

/**
 * The line numbers the artifact declares, before any clipping.
 *
 * A sequence names the span it was read from and an operation names the line its entry
 * presupposes. A record that names neither contributes nothing rather than raising:
 * the shape of a thin artifact is a fact to report, not an error to throw.
 */
// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
function declaredLinesIn(artifact) {
  const fromSequences = (artifact.sequences ?? []).flatMap((sequence) => linesBetween(sequence.firstLine, sequence.lastLine));
  const fromOperations = (artifact.operations ?? []).map((operation) => operation.grounding?.presupposition);
  return [...fromSequences, ...fromOperations];
}

/** The line numbers of the document at least one span covers. */
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
function coveredLinesIn(spans, lineCount) {
  const covered = new Set();
  for (const span of spans ?? []) {
    for (const line of linesOfSpanInside(span, lineCount)) covered.add(line);
  }
  return covered;
}

/**
 * The lines of a span that lie inside the document.
 *
 * The span is clipped before it is walked rather than filtered while walking it. A
 * declaration is reader-supplied data, so a mistyped line number is a fact about the
 * reading rather than an impossibility, and a span claiming more lines than the document
 * has must cost the document's length: materialising it first raises on a large enough
 * typo, inside a gate that runs on every phase.
 */
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
function linesOfSpanInside(span, lineCount) {
  return linesBetween(Math.max(span?.firstLine ?? Number.NaN, 1), Math.min(span?.lastLine ?? Number.NaN, lineCount));
}

/** The maximal runs of 1..lineCount that no covered line falls in, ascending. */
// [::TICKET::] PX-247 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-247 --for-spec --no-implementation-order`.
function runsOfLinesNotIn(covered, lineCount) {
  const runs = [];
  for (let line = 1; line <= lineCount; line += 1) {
    if (covered.has(line)) continue;
    const previous = runs.at(-1);
    if (previous !== undefined && previous.last === line - 1) runs[runs.length - 1] = { first: previous.first, last: line };
    else runs.push({ first: line, last: line });
  }
  return runs;
}

/**
 * The lines of the document that belong to no span.
 *
 * A span whose ends are not integers, or whose end precedes its start, covers no line
 * rather than raising: a malformed span is an absence of coverage, and the rule reports
 * the lines it failed to cover rather than one it could not read. The answer is compared
 * against the document rather than against the partition, because a preamble before the
 * first heading lies outside the partition and inside the document.
 *
 * @param {{spans: Array<{firstLine: number, lastLine: number}>, lineCount: number}} input
 * @returns {Array<{first: number, last: number}>}
 */
export function uncoveredRanges({ spans, lineCount }) {
  return runsOfLinesNotIn(coveredLinesIn(spans, lineCount), lineCount);
}

/** The declared lines that lie inside the specification, each counted once. */
// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
function reachedLinesIn(artifact) {
  const specLines = artifact.spec?.lines ?? 0;
  return new Set(declaredLinesIn(artifact).filter((line) => Number.isInteger(line) && line >= 1 && line <= specLines));
}

/**
 * The members of the borrowed census that holds a role, or null when nothing is borrowed.
 *
 * The role is the caller's word for what the set is — the operations an interface must
 * implement, the entries a reading must adjudicate — and the rail selects by role rather
 * than by file name, so no project's registry is named anywhere in this module.
 */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function borrowedMembersOf(artifact, role) {
  const pin = (artifact.pins?.sourceEnumerations ?? []).find((entry) => entry.role === role);
  return pin === undefined ? null : [...(pin.members ?? [])];
}

/**
 * How far the artifact accounts for the borrowed operation census.
 *
 * Three numbers rather than one, because a census is only useful when it is visible which
 * members were realized by a step and which were excused by a grounded escape. Null when no
 * census is borrowed: a denominator nobody supplied must not be printed as a zero.
 */
// [::TICKET::] PX-248, PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-248|PX-251) --for-spec --no-implementation-order`.
function operationAccountingIn(artifact) {
  const members = borrowedMembersOf(artifact, 'operations');
  if (members === null) return { operationsEnumerated: null, operationsReached: null, operationsExcused: null };
  const escapes = new Set(UNREACHED_ESCAPES);
  const named = new Set((artifact.steps ?? []).map((step) => step.operation).filter((name) => typeof name === 'string' && name !== ''));
  const excused = new Set((artifact.operations ?? []).filter((operation) => escapes.has(operation.position)).map((operation) => operation.id));
  return {
    operationsEnumerated: members.length,
    operationsReached: members.filter((member) => named.has(member)).length,
    operationsExcused: members.filter((member) => excused.has(member)).length,
  };
}

/**
 * The version of the vocabulary the measured object is spelled in.
 *
 * The measured object is stored in the status history and read back by the report, so a
 * generation measured under another version holds fields whose names mean other sets:
 * version 1 stored the entry ledger as `sequences` and the heading partition as `rows`, and
 * never recorded the claiming count or the placement at all. The version is what decides
 * whether two generations may be compared and how, and it is why no comparison is drawn by
 * field name alone.
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
export const COVERAGE_VERSION = 2;

/** Whether a stored generation was measured in the vocabulary this module spells. */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
export function isComparableCoverage(coverage) {
  return coverage?.coverage_version === COVERAGE_VERSION;
}

/**
 * The records that fall into each class, keyed by the class the record carries.
 *
 * The class names come from the records and the schema rather than from this module, so a
 * vocabulary that gains a member gains it in every partition without an edit here.
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
function countBy(records, classOf) {
  const counts = {};
  for (const record of records) {
    const name = String(classOf(record));
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

/**
 * A partition of a measured set, spelled as `(name count, name count)`.
 *
 * Every member prints, in name order, including a member whose count is zero: a rule that
 * named the members it expected would drop a third if the vocabulary ever gained one, and
 * a measured zero is a fact rather than something to omit. An empty partition prints
 * nothing, because `()` would read as a member with no name.
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
function partition(counts) {
  const members = Object.entries(counts ?? {}).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  if (members.length === 0) return '';
  return ` (${members.map(([name, count]) => `${name} ${count}`).join(', ')})`;
}

/**
 * The borrowed denominator, or the word that says there is none.
 *
 * The artifact's own operation count is not a census: it counts the records this reading
 * declared, and a record may say the operation must not be implemented. Printing it where a
 * denominator belongs is what this term exists to stop, so an absent census is named rather
 * than stood in for. A census that was supplied and is empty is a different fact from one
 * that was never supplied, and the two print differently.
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
export function censusSpelling(coverage) {
  if (typeof coverage?.operationsEnumerated !== 'number') return 'none';
  return `${coverage.operationsEnumerated} (reached ${coverage.operationsReached ?? 0}, excused ${coverage.operationsExcused ?? 0})`;
}

/** The nine sets the measured line reports, in the order it reports them. */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
const MEASURED_TERMS = Object.freeze([
  'entries',
  'sequences',
  'steps',
  'operations',
  'placed',
  'excused',
  'sections',
  'linesReached',
  'census',
]);

/**
 * What the artifact holds and how much of the specification it reaches.
 *
 * Each key is the size of the set its word denotes, and the partitions are recorded rather
 * than derived at a print site, so that both surfaces and the stored history carry them and
 * a later generation can compare a partition without re-reading an artifact the history
 * does not keep.
 *
 * @returns {{coverage_version: number, entries: number, entriesByKind: object,
 *            sequences: number, steps: number, stepsDrawn: number, operations: number,
 *            operationsByPosition: object, placed: number, excused: number, sections: number,
 *            linesReached: number, specLines: number}}
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
export function coverageOf(artifact) {
  const entries = artifact.sequences ?? [];
  const steps = artifact.steps ?? [];
  const operations = artifact.operations ?? [];
  const ownerOf = new Map(entries.map((entry) => [entry.id, entry]));
  const claims = (entry) => DIAGRAMMED_OUTCOMES.includes(entry?.outcome);
  const escaped = (operation) => UNREACHED_ESCAPES.includes(operation?.position);
  const excused = operations.filter(escaped).length;
  return {
    coverage_version: COVERAGE_VERSION,
    entries: entries.length,
    entriesByKind: countBy(entries, (entry) => entry.kind),
    // An entry whose outcome is absent does not claim a sequence, which is what the
    // `includes` answers for an undefined outcome without a branch of its own.
    sequences: entries.filter(claims).length,
    steps: steps.length,
    stepsDrawn: steps.filter((step) => claims(ownerOf.get(step.sequence))).length,
    operations: operations.length,
    operationsByPosition: countBy(operations, (operation) => operation.position),
    placed: operations.length - excused,
    excused,
    sections: (artifact.pins?.blocks ?? []).length,
    linesReached: reachedLinesIn(artifact).size,
    specLines: artifact.spec?.lines ?? 0,
    ...operationAccountingIn(artifact),
  };
}

/**
 * The measured terms, each spelled once, for both surfaces to print.
 *
 * The block the phase driver prints is these terms one per line and the line the product
 * path prints is these terms joined, so a term cannot reach one surface without reaching
 * the other and the two can never disagree about the same measurement.
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
export function coverageTerms(coverage) {
  const measured = coverage ?? {};
  const elsewhere = (measured.steps ?? 0) - (measured.stepsDrawn ?? 0);
  return [
    { key: 'entries', text: `entries=${measured.entries ?? 0}${partition(measured.entriesByKind)}` },
    { key: 'sequences', text: `sequences=${measured.sequences ?? 0}` },
    { key: 'steps', text: `steps=${measured.steps ?? 0}${partition({ drawn: measured.stepsDrawn ?? 0, elsewhere })}` },
    { key: 'operations', text: `operations=${measured.operations ?? 0}${partition(measured.operationsByPosition)}` },
    { key: 'placed', text: `placed=${measured.placed ?? 0}` },
    { key: 'excused', text: `excused=${measured.excused ?? 0}` },
    { key: 'sections', text: `sections=${measured.sections ?? 0}` },
    { key: 'linesReached', text: `linesReached=${measured.linesReached ?? 0} of ${measured.specLines ?? 0}` },
    { key: 'census', text: `census=${censusSpelling(measured)}` },
  ];
}

/**
 * The measurements as one line, spelled the same wherever they are printed.
 *
 * Two surfaces print them — the product path and the phase driver's report — and a second
 * spelling would be a second thing to keep in step with the first. The product path prints
 * this line and no block, so every composition the block carries is carried here too.
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
export function coverageLine(coverage) {
  return coverageTerms(coverage).map((term) => term.text).join(' ');
}

/**
 * The field a version-1 generation recorded each set under, and null where it recorded none.
 *
 * Version 1 counted the same arrays under other words: `sequences` was the entry ledger,
 * because the measured object was named after the artifact section rather than after what
 * it counted, and `rows` was the heading partition. Its `steps`, `operations`,
 * `linesReached` and `specLines` mean what this version's do. The rest — the claiming count,
 * the placement, the drawn split and both partitions — were never measured, and are declared
 * null here so that a reader is told they were not recorded rather than shown a zero.
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
const PREDECESSOR_FIELD_FOR = Object.freeze({
  entries: 'sequences',
  entriesByKind: null,
  sequences: null,
  steps: 'steps',
  stepsDrawn: null,
  operations: 'operations',
  operationsByPosition: null,
  placed: null,
  excused: null,
  sections: 'rows',
  linesReached: 'linesReached',
  specLines: 'specLines',
  census: null,
});

/** The word a term prints when the generation before it never measured that set. */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
export const NOT_MEASURED = 'not measured';

/**
 * What the generation before this one measured for a term, or null.
 *
 * The answer is read by field name only when the two generations share a vocabulary; a
 * version-1 record is read through the mapping above, so `entries` is compared against what
 * version 1 called `sequences` and never against its `sequences` field, which counted
 * something else. A term the predecessor never measured answers null, which is the same
 * answer as "there is no predecessor" and is told apart by the caller.
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
export function predecessorValueFor(key, coverage) {
  if (coverage === null || coverage === undefined) return null;
  if (isComparableCoverage(coverage)) {
    // The census is a borrowed triple rather than a count of the artifact, so it is spelled
    // rather than read: a predecessor that borrowed no census answers with the word for
    // that, which is a measurement and not an absence.
    if (key === 'census') return censusSpelling(coverage);
    return coverage[key] ?? null;
  }
  const field = PREDECESSOR_FIELD_FOR[key];
  if (field === null || field === undefined) return null;
  return coverage[field] ?? null;
}

/**
 * A stored generation respelled in the current vocabulary, for a console line.
 *
 * Only the terms the predecessor measured are spelled, in the order the measured line
 * spells them, so a run that compares a version-1 generation shows the numbers that do
 * correspond and stays silent about the rest. Spelling a version-1 record with
 * `coverageLine` would print `entries=undefined` — reading its fields by names that had
 * another meaning when it was written.
 *
 * The terms are spelled without their partitions, and that is deliberate rather than an
 * omission: a version-1 record carries no partition at all, and a derived one would be
 * wrong rather than absent — `steps` minus a `stepsDrawn` the record never held would spell
 * every step of that generation as unplaced. The scalars are what the two generations can
 * be compared on, so the scalars are what this spells.
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
export function predecessorLine(coverage) {
  if (coverage === null || coverage === undefined) return null;
  return MEASURED_TERMS
    .map((key) => ({ key, value: predecessorValueFor(key, coverage) }))
    .filter(({ value }) => value !== null)
    .map(({ key, value }) => (key === 'linesReached'
      ? `linesReached=${value} of ${predecessorValueFor('specLines', coverage) ?? 0}`
      : `${key}=${value}`))
    .join(' ');
}

/**
 * The one line that names how a predecessor was read, or null when it needs no naming.
 *
 * A generation measured under another vocabulary is compared through the mapping, and the
 * mapping is a decision a reader did not make. Naming it once, on the block, keeps a
 * renamed comparison from reading as a like-for-like one; a predecessor in the current
 * vocabulary needs no note, and no predecessor needs none either.
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
export function mappingNote(coverage) {
  if (coverage === null || coverage === undefined || isComparableCoverage(coverage)) return null;
  const renamed = [];
  const unrecorded = [];
  for (const key of Object.keys(PREDECESSOR_FIELD_FOR)) {
    const field = PREDECESSOR_FIELD_FOR[key];
    if (field === null) unrecorded.push(key);
    else if (field !== key) renamed.push(`${key} was recorded as ${field}`);
  }
  return `(previous generation measured under coverage v${coverage.coverage_version ?? 'an earlier version'}: ${renamed.join('; ')}; ${unrecorded.join(', ')} were not recorded)`;
}
