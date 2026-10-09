// [::TICKET::] PX-245 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-245 --for-spec --no-implementation-order`.
// The closing report (PX-240, phase 18).
//
// The report separates two things and never adds them together. What was measured is a
// block of counts a reading pass moves. What is carried by a signature is the one thing
// no check measures: that a reader opened the line. A run that printed a single total
// would make the second readable as the first, which is the confusion this file exists
// to prevent.
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
export function healthLines({ summary, status, inquest = null }) {
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
    `readPhasesSettled=${settled.length} of ${reads.length} (${vacuous.length} had nothing to read)`,
    `railExits=${summary?.railExits ?? 0} promotionCandidates=${summary?.promotionCandidates ?? 0}`,
    ...inquestLines(inquest),
  ];
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
function againstPrevious(name, value, previous, change = null) {
  if (previous === null || previous === undefined) return `${name}=${value}`;
  const moved = change === null ? '' : `, change ${signedChange(change)}`;
  return `${name}=${value} (previous generation: ${previous}${moved})`;
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
function coverageLines(summary, status) {
  const previous = status?.history?.at(-1)?.coverage ?? null;
  // A run whose checks refused is reported with a null summary, so it has no measurement
  // at all. Subtracting from the zero that stands in for it would print a fall the run
  // never took, which is worse than printing nothing: a missing measurement is not a zero.
  const measured = summary === null || summary === undefined;
  const comparable = previous === null || measured ? null : previous;
  const changeIn = (count) => (comparable === null ? null : summary[count] ?? 0) - (comparable?.[count] ?? 0);
  // A reach is a count against a length, so its change is withheld when the length moved:
  // two revisions of the document are two spaces, and the subtraction would compare them.
  const reachChange = comparable === null || comparable.specLines !== summary.specLines
    ? null
    : (summary.linesReached ?? 0) - comparable.linesReached;
  return [
    againstPrevious('sequences', summary?.sequences ?? 0, comparable?.sequences, changeIn('sequences')),
    againstPrevious('steps', summary?.steps ?? 0, comparable?.steps, changeIn('steps')),
    againstPrevious('operations', summary?.operations ?? 0, comparable?.operations, changeIn('operations')),
    againstPrevious('rows', summary?.rows ?? 0, comparable?.rows, changeIn('rows')),
    againstPrevious(
      'linesReached',
      `${summary?.linesReached ?? 0} of ${summary?.specLines ?? 0}`,
      comparable === null ? null : `${comparable.linesReached} of ${comparable.specLines}`,
      reachChange,
    ),
  ];
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
export function buildReport({ status, summary, artifact, inquest = null }) {
  const lines = [
    '## educe-sequences run',
    '',
    `- specification: ${status.spec.path} (${status.spec.lines} lines, sha256 ${status.spec.sha256})`,
    `- artifact: ${artifact.path}`,
    `- artifact digest: ${artifact.digest}`,
    '',
    '### Measured',
    '',
    ...healthLines({ summary, status, inquest }).map((line) => `- ${line}`),
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
