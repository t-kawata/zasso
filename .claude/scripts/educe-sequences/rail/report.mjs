// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
// The closing report (PX-240, phase 18).
//
// The report separates two things and never adds them together. What was measured is a
// block of counts a reading pass moves. What is carried by a signature is the one thing
// no check measures: that a reader opened the line. A run that printed a single total
// would make the second readable as the first, which is the confusion this file exists
// to prevent.
import { describeRefusedExemption } from '../../sequences-slice/lib/obligation-coverage.mjs';

import { NOT_MEASURED, coverageTerms, mappingNote, predecessorValueFor } from './coverage.mjs';
import { PHASES } from './gates.mjs';
import { phaseState, readingOf } from './run-state.mjs';
// [::TICKET::] PX-241 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-241 --for-spec --no-implementation-order`.

/** The line that names what no check in this run measured. */
export const SIGNATURE_CAVEAT =
  'carried by a signature: that a reader opened the line. No check measures this. A claim with no signature reddens the run; the honesty of a signature is carried the way any signed record is carried.';

/** The `[read]` phases, which are the ones a signature has to account for. */
export function readPhases() {
  return PHASES.filter((phase) => phase.tag === 'read');
}

/** A `[read]` phase is accounted for by a signed claim, or by having had nothing to read. */
export function readPhaseSettled(status, phase) {
  const record = readingOf(status, phase.name);
  return record.claims > 0 || record.vacuous === true;
}

/**
 * The health lines: a run below its declared counts is incomplete even at exit 0.
 *
 * The audit's three counts are printed as their own lines, beside the previous
 * generation's, and are never added to the apparatus counts above them. What the
 * apparatus measured and what a reader was asked are different kinds of number, and one
 * total would make the second readable as the first.
 */
// [::TICKET::] PX-243 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-243 --for-spec --no-implementation-order`.
// [::TICKET::] PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-244 --for-spec --no-implementation-order`.
// [::TICKET::] PX-261 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-261 --for-spec --no-implementation-order`.
export function healthLines({ summary, status, inquest = null, demand = null }) {
  const done = PHASES.filter((phase) => phaseState(status, phase.id).status === 'done').length;
  const reads = readPhases();
  const settled = reads.filter((phase) => readPhaseSettled(status, phase));
  const vacuous = reads.filter((phase) => readingOf(status, phase.name).vacuous === true);
  return [
    `phasesDone=${done} of ${PHASES.length}`,
    ...coverageLines(summary, status),
    // The declared count is read from the summary rather than passed beside it: a second
    // copy of it is a second thing that can disagree with the block it describes.
    `checksRun=${summary?.checksRun ?? 0} of ${summary?.checksDeclared ?? 0} checksAdhoc=${summary?.checksAdhoc ?? 0}`,
    `pinsRederived=${summary?.pinsRederived ?? 0} of ${summary?.pinsTotal ?? 0}`,
    ...limbCensusLines(summary),
    ...selectionLines(summary),
    `readPhasesSettled=${settled.length} of ${reads.length} (${vacuous.length} had nothing to read)`,
    `railExits=${summary?.railExits ?? 0} promotionCandidates=${summary?.promotionCandidates ?? 0}`,
    ...inquestLines(inquest),
    ...demandLines(demand),
  ];
}

/**
 * The demand, and the demands nobody owes.
 *
 * These lines are appended after everything the run measured, and are never added into it: what a
 * run measured is a property of the specification it read, while the demand is a property of the
 * workspace the specification sits in — a different set of numbers that a total would make
 * readable as one. A run handed no demand prints no line at all, so a rail run over a workspace
 * that carries no package reads exactly as it did before this existed.
 *
 * @param {{ facts: object, coverage: object }|null} demand
 * @returns {string[]}
 */
// [::TICKET::] PX-260 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-260 --for-spec --no-implementation-order`.
export function demandLines(demand) {
  if (demand === null || demand === undefined) return [];
  const { facts, coverage } = demand;
  const columns = facts.candidateColumns.length === 0 ? 'none' : facts.candidateColumns.join(', ');
  const lines = [
    `demand=${Object.entries(facts.counts).map(([axis, count]) => `${axis} ${count}`).join(', ')}`,
    `candidateColumns=${columns}`,
    `boundaryCount=${facts.boundaryCount}`,
  ];
  if (coverage === null || coverage === undefined) return lines;

  lines.push(`unassigned=${coverage.unassigned.length}`);
  for (const unplaced of coverage.unassigned) lines.push(`  ${unplaced.axis}: ${unplaced.id}`);
  const distribution = coverage.assignmentDistribution.filter((row) => row.count > 0);
  lines.push(`assignmentDistribution=${distribution.length === 0 ? 'no package holds an obligation unit' : distribution.map((row) => `${row.packageId} ${row.count}`).join(', ')}`);
  for (const row of coverage.refusedExemptions) lines.push(`refusedExemption=${describeRefusedExemption(row)}`);
  return lines;
}

/**
 * How many of the declared limbs a ruling cited, and how many it did not.
 *
 * Printed and compared to nothing. A census answers "which lens keeps finding things" and
 * "is the predicate deciding anything"; a census a run could fail would be a target, and
 * the number that matters here is the one that does not move between generations.
 * A run with no measurement prints no census, because an absent measurement is not a zero.
 */
export function limbCensusLines(summary) {
// [::TICKET::] PX-246 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-246 --for-spec --no-implementation-order`.
  if (summary === null || summary === undefined) return [];
  if (typeof summary.predicateLimbs !== 'number') return [];
  return [`predicateLimbs=${summary.predicateLimbs} cited=${summary.limbsCited ?? 0} unused=${summary.limbsUnused ?? 0}`];
}

/** How many of a check's selection the report names before it counts the rest. */
const SELECTION_NAMES_PRINTED = 8;

/**
 * How many rows each check that declares a selection examined.
 *
 * Printed and compared to nothing, and a zero is printed rather than omitted: a check that
 * examined no rows read exactly like a check that examined every row and found them sound until
 * this line existed, which is how a selection of nothing survived nine generations of a run
 * whose every phase passed. The names are capped so the line stays a fact rather than a list.
 */
// [::TICKET::] PX-268 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-268 --for-spec --no-implementation-order`.
export function selectionLines(summary) {
// [::TICKET::] PX-268 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-268 --for-spec --no-implementation-order`.
  const examinations = summary?.examinations;
  if (examinations === undefined || examinations === null) return [];
  const ids = Object.keys(examinations);
  const examinedNothing = ids.filter((id) => examinations[id] === 0);
  const named = examinedNothing.slice(0, SELECTION_NAMES_PRINTED);
  const rest = examinedNothing.length - named.length;
  const silent = examinedNothing.length === 0
    ? ''
    : ` examiningNothing=${named.join(', ')}${rest > 0 ? ` …and ${rest} more` : ''}`;
  return [`checksExaminingRows=${ids.length - examinedNothing.length} of ${ids.length}${silent}`];
}

/** How far a count moved, spelled with its sign so a fall cannot read as a small rise. */
// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
function signedChange(change) {
  return change > 0 ? `+${change}` : `${change}`;
}

/**
 * One measured count, with the generation before it beside it rather than added to it.
 *
 * The change is optional because only some callers have one to report. It is computed at
 * the point of printing and never stored: a number describing movement is the kind of
 * number that becomes a target, and this one exists only as a string in a report.
 */
// [::TICKET::] PX-243, PX-244, PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244|PX-245) --for-spec --no-implementation-order`.
/**
 * A spelled term with the generation before it beside it rather than added to it.
 *
 * The annotation is appended to a term the caller has already spelled, so the measured
 * block and the product path's line cannot drift: both print `coverageTerms`' own text and
 * this function only says what moved. It is the one place a `(previous generation …)` is
 * written, so the audit lines and the measured block annotate alike.
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
function withPrevious(spelled, previous, change = null) {
  if (previous === null || previous === undefined) return spelled;
  const moved = change === null ? '' : `, change ${signedChange(change)}`;
  return `${spelled} (previous generation: ${previous}${moved})`;
}

// [::TICKET::] PX-243, PX-244, PX-245, PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244|PX-245|PX-251) --for-spec --no-implementation-order`.
function againstPrevious(name, value, previous, change = null) {
  return withPrevious(`${name}=${value}`, previous, change);
}

/**
 * The three audit lines, or none when no audit was recorded.
 *
 * The audit arrives as one value carrying both generations, because the two belong
 * together: a count printed alone says how much was asked, and the same count beside the
 * generation before it says whether the asking moved anything.
 */
// [::TICKET::] PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244) --for-spec --no-implementation-order`.
function inquestLines(inquest) {
  if (inquest === null || inquest === undefined) return [];
  const previous = inquest.previous ?? null;
  return [
    againstPrevious('inquestAsked', inquest.asked, previous?.asked),
    againstPrevious('inquestAnswered', inquest.answered, previous?.answered),
    againstPrevious('inquestExempt', inquest.exempt, previous?.exempt),
  ];
}

/**
 * The artifact's own measurements, each printed beside the generation before it.
 *
 * The predecessor is read from the status rather than handed in beside it, so a caller
 * cannot show a comparison the run never recorded. A run with no history prints each
 * number alone: a first generation has nothing to be measured against, and printing a
 * zero in its place would read as a fall from a generation that never existed.
 */
// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
/**
 * The measured block: every term of the console line, one per line, with what moved.
 *
 * The terms come from `coverageTerms` rather than being written here, so the block and the
 * product path's line are one spelling by construction and a term cannot be added to one
 * surface alone. Each term is annotated from the stored predecessor, through the mapping
 * `coverage` declares: a version-1 generation recorded other words, so it is read per key
 * and the terms it never measured are named rather than silenced.
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
function coverageLines(summary, status) {
  const previous = status?.history?.at(-1)?.coverage ?? null;
  // A run whose checks refused is reported with a null summary, so it has no measurement
  // at all. Subtracting from the zero that stands in for it would print a fall the run
  // never took, which is worse than printing nothing: a missing measurement is not a zero.
  const measured = summary === null || summary === undefined;
  const comparable = previous === null || measured ? null : previous;
  const lines = coverageTerms(measured ? {} : summary).map((term) => {
    const was = predecessorValueFor(term.key, comparable);
    return withPrevious(term.text, predecessorDisplayFor(term.key, comparable, was), changeFor(term.key, summary, comparable, was));
  });
  const note = comparable === null ? null : mappingNote(comparable);
  return note === null ? lines : [...lines, note];
}

/**
 * What the predecessor measured for a term, as it is shown beside this generation's.
 *
 * A reach prints against its length, because a count of lines means nothing without the
 * document it was counted in; a term the predecessor never measured is named rather than
 * left blank or shown as a zero.
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
function predecessorDisplayFor(key, comparable, was) {
  if (comparable === null) return null;
  if (was === null) return NOT_MEASURED;
  return key === 'linesReached' ? `${was} of ${comparable.specLines}` : was;
}

/** The counts whose movement is a plain subtraction. A reach and a census are not among them. */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
const SUBTRACTABLE_TERMS = Object.freeze(['entries', 'sequences', 'steps', 'operations', 'placed', 'excused', 'sections']);

/**
 * How far a term moved, or null when the two generations cannot be subtracted.
 *
 * A reach is a count against a length, so its change is withheld when the length moved: two
 * revisions of the document are two spaces and the subtraction would compare them. A census
 * is a borrowed member list rather than a count of the artifact, and a term the predecessor
 * never measured has nothing to subtract from; both answer null, which prints no change
 * rather than a fall the run never took.
 */
// [::TICKET::] PX-251 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-251 --for-spec --no-implementation-order`.
function changeFor(key, summary, comparable, was) {
  if (comparable === null || was === null) return null;
  if (key === 'linesReached') {
    return comparable.specLines === summary?.specLines ? (summary?.linesReached ?? 0) - was : null;
  }
  if (!SUBTRACTABLE_TERMS.includes(key)) return null;
  return (summary?.[key] ?? 0) - was;
}

/** Whether the run may be reported as complete. */
// [::TICKET::] PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-244 --for-spec --no-implementation-order`.
export function isComplete({ summary, status }) {
  if (summary === null || summary === undefined) return false;
  if (summary.checksRun !== summary.checksDeclared) return false;
  if (summary.pinsRederived !== summary.pinsTotal) return false;
  return readPhases().every((phase) => readPhaseSettled(status, phase));
}

/** The closing report, in two parts that are never summed. */
export function buildReport({ status, summary, artifact, inquest = null, demand = null }) {
  const lines = [
    '## educe-sequences run',
    '',
    `- specification: ${status.spec.path} (${status.spec.lines} lines, sha256 ${status.spec.sha256})`,
    `- artifact: ${artifact.path}`,
    `- artifact digest: ${artifact.digest}`,
    '',
    '### Measured',
    '',
    ...healthLines({ summary, status, inquest, demand }).map((line) => `- ${line}`),
    '',
    '### Carried by a signature',
    '',
    SIGNATURE_CAVEAT,
    '',
    isComplete({ summary, status })
      ? '**complete**'
      : '**incomplete** — a count is below the declared count, or a [read] phase carries no signature',
    '',
  ];
  return `${lines.join('\n')}\n`;
}
