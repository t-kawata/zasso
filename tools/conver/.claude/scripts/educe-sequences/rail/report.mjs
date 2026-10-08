// The closing report (PX-240, phase 17).
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

/** The health lines: a run below its declared counts is incomplete even at exit 0. */
export function healthLines({ summary, status, declaredChecks }) {
  const done = PHASES.filter((phase) => phaseState(status, phase.id).status === 'done').length;
  const reads = readPhases();
  const settled = reads.filter((phase) => readPhaseSettled(status, phase));
  const vacuous = reads.filter((phase) => readingOf(status, phase.name).vacuous === true);
  return [
    `phasesDone=${done} of ${PHASES.length}`,
    `checksRun=${summary?.checksRun ?? 0} of ${declaredChecks}`,
    `pinsRederived=${summary?.pinsRederived ?? 0} of ${summary?.pinsTotal ?? 0}`,
    `readPhasesSettled=${settled.length} of ${reads.length} (${vacuous.length} had nothing to read)`,
    `railExits=${summary?.railExits ?? 0} promotionCandidates=${summary?.promotionCandidates ?? 0}`,
  ];
}

/** Whether the run may be reported as complete. */
export function isComplete({ summary, status, declaredChecks }) {
  if (summary === null || summary === undefined) return false;
  if (summary.checksRun !== declaredChecks) return false;
  if (summary.pinsRederived !== summary.pinsTotal) return false;
  return readPhases().every((phase) => readPhaseSettled(status, phase));
}

/** The closing report, in two parts that are never summed. */
export function buildReport({ status, summary, artifactPath, digest, declaredChecks }) {
  const lines = [
    '## educe-sequences run',
    '',
    `- specification: ${status.spec.path} (${status.spec.lines} lines, sha256 ${status.spec.sha256})`,
    `- artifact: ${artifactPath}`,
    `- artifact digest: ${digest}`,
    '',
    '### Measured',
    '',
    ...healthLines({ summary, status, declaredChecks }).map((line) => `- ${line}`),
    '',
    '### Carried by a signature',
    '',
    SIGNATURE_CAVEAT,
    '',
    isComplete({ summary, status, declaredChecks })
      ? '**complete**'
      : '**incomplete** — a count is below the declared count, or a [read] phase carries no signature',
    '',
  ];
  return `${lines.join('\n')}\n`;
}
