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

import { readArtifactSchema } from './load.mjs';

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
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
function operationAccountingIn(artifact) {
  const members = borrowedMembersOf(artifact, 'operations');
  if (members === null) return { operationsEnumerated: null, operationsReached: null, operationsExcused: null };
  const escapes = new Set(readArtifactSchema().escapes);
  const named = new Set((artifact.steps ?? []).map((step) => step.operation).filter((name) => typeof name === 'string' && name !== ''));
  const excused = new Set((artifact.operations ?? []).filter((operation) => escapes.has(operation.position)).map((operation) => operation.id));
  return {
    operationsEnumerated: members.length,
    operationsReached: members.filter((member) => named.has(member)).length,
    operationsExcused: members.filter((member) => excused.has(member)).length,
  };
}

/**
 * What the artifact holds and how much of the specification it reaches.
 *
 * @returns {{sequences: number, steps: number, operations: number, rows: number,
 *            linesReached: number, specLines: number}}
 */
export function coverageOf(artifact) {
  return {
    sequences: (artifact.sequences ?? []).length,
    steps: (artifact.steps ?? []).length,
    operations: (artifact.operations ?? []).length,
    rows: (artifact.pins?.blocks ?? []).length,
    linesReached: reachedLinesIn(artifact).size,
    specLines: artifact.spec?.lines ?? 0,
    ...operationAccountingIn(artifact),
  };
}

/**
 * How the operations are spelled: the borrowed census when one exists, the count alone
 * otherwise.
 *
 * One function because two surfaces print it — the product path's line and the phase
 * driver's report — and a second spelling would be a second thing to keep in step. A
 * denominator nobody supplied is not printed as a zero.
 */
// [::TICKET::] PX-248 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-248 --for-spec --no-implementation-order`.
export function operationSpelling(coverage) {
  if (typeof coverage?.operationsEnumerated !== 'number') return String(coverage?.operations ?? 0);
  return `${coverage.operationsEnumerated} enumerated, ${coverage.operationsReached} reached by a step, ${coverage.operationsExcused} excused`;
}

/**
 * The measurements as one line, spelled the same wherever they are printed.
 *
 * Two surfaces print them — the product path and the phase driver's `begin` — and a
 * second spelling would be a second thing to keep in step with the first.
 */
export function coverageLine(coverage) {
  return [
    `sequences=${coverage.sequences}`,
    `steps=${coverage.steps}`,
    `operations=${operationSpelling(coverage)}`,
    `rows=${coverage.rows}`,
    `linesReached=${coverage.linesReached} of ${coverage.specLines}`,
  ].join(' ');
}
