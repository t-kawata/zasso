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
    // The declared count is read from the summary rather than passed beside it: a second
    // copy of it is a second thing that can disagree with the block it describes.
    `checksRun=${summary?.checksRun ?? 0} of ${summary?.checksDeclared ?? 0} checksAdhoc=${summary?.checksAdhoc ?? 0}`,
    `pinsRederived=${summary?.pinsRederived ?? 0} of ${summary?.pinsTotal ?? 0}`,
    `readPhasesSettled=${settled.length} of ${reads.length} (${vacuous.length} had nothing to read)`,
    `railExits=${summary?.railExits ?? 0} promotionCandidates=${summary?.promotionCandidates ?? 0}`,
    ...inquestLines(inquest),
  ];
}

/** One audit count, with the generation before it beside it rather than added to it. */
// [::TICKET::] PX-243, PX-244 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-243|PX-244) --for-spec --no-implementation-order`.
function againstPrevious(name, value, previous) {
  return previous === null || previous === undefined
    ? `${name}=${value}`
    : `${name}=${value} (previous generation: ${previous})`;
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
