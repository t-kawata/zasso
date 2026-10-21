/**
 * The debt a regeneration transaction may carry.
 *
 * A transaction is not a completion gate. The design it stages may still be
 * unproven, exactly as the live design was; what it must not do is add debt. This
 * module compares the live baseline with the staged result by identity: a finding
 * key, a blocked check id, a reading subject, and the Yes count. A carried debt
 * commits; a new identity or a rising count refuses.
 */
import { RegenerationError } from './errors.mjs';

const IDENTITY_SEPARATOR = '\u0000';

/** The debt a detector report names directly. */
export function debtOfDetectorReport(report) {
  const findings = new Set();
  for (const finding of report?.findings ?? []) {
    findings.add(`${finding.checkId}${IDENTITY_SEPARATOR}${finding.subject}`);
  }
  const blocked = new Set();
  for (const entry of report?.blocked ?? []) {
    blocked.add(entry.checkId ?? entry.check);
  }
  return { findings, blocked };
}

/** The debt a readings summary names. */
export function debtOfReadings({ subjects = new Set(), count = 0, withheldCount = 0, present = true } = {}) {
  return {
    readingSubjects: subjects instanceof Set ? subjects : new Set(subjects),
    readingCount: count,
    readingWithheld: withheldCount,
    readingPresent: present,
  };
}

/** Every identity the staging result adds, and the reading-count movement. */
export function computeDebtIncrease({ baseline = {}, staging = {} }) {
// [::TICKET::] PX-288 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-288 --for-spec --no-implementation-order`.
  const baselineFindings = baseline.findings ?? new Set();
  const baselineBlocked = baseline.blocked ?? new Set();
  const baselineSubjects = baseline.readingSubjects ?? new Set();
  const newFindings = [...(staging.findings ?? new Set())]
    .filter((identity) => !baselineFindings.has(identity))
    .sort();
  const newBlocked = [...(staging.blocked ?? new Set())]
    .filter((checkId) => !baselineBlocked.has(checkId))
    .sort();
  const stagingSubjects = staging.readingSubjects ?? new Set();
  const resolutions = staging.readingResolutions instanceof Map
    ? new Set(staging.readingResolutions.keys())
    : new Set(Object.keys(staging.readingResolutions ?? {}));
  const addedReadingSubjects = [...stagingSubjects].filter((subject) => !baselineSubjects.has(subject));
  // A Yes that disappears is not a resolution. It is either an answer that was withdrawn
  // (debt) or an answer the generation replaced with a verified resolution (carried),
  // and the only way to tell them apart is the resolution record.
  const disappearedUnresolved = [...baselineSubjects]
    .filter((subject) => !stagingSubjects.has(subject) && !resolutions.has(subject));
  const newReadingSubjects = [...new Set([...addedReadingSubjects, ...disappearedUnresolved])].sort();
  const readingCountDelta = (staging.readingCount ?? 0) - (baseline.readingCount ?? 0);
  const readingWithheldDelta = (staging.readingWithheld ?? 0) - (baseline.readingWithheld ?? 0);
  const readingsRemoved = baseline.readingPresent === true && staging.readingPresent === false;
  const readingsUnmeasured = (baseline.readingCount ?? 0) > 0
    && (staging.readingCount ?? 0) === 0
    && staging.readingPresent === false;
  const increased = newFindings.length > 0
    || newBlocked.length > 0
    || newReadingSubjects.length > 0
    || readingCountDelta > 0
    || readingWithheldDelta > 0
    || readingsRemoved
    || readingsUnmeasured;
  return {
    newFindings,
    newBlocked,
    newReadingSubjects,
    readingCountDelta,
    readingWithheldDelta,
    readingsRemoved,
    readingsUnmeasured,
    increased,
  };
}

/** The counts a receipt records for one debt set. */
export function summarizeDebt(debt = {}) {
  return {
    findings: debt.findings?.size ?? 0,
    blocked: debt.blocked?.size ?? 0,
    readingSubjects: debt.readingSubjects?.size ?? 0,
    readingCount: debt.readingCount ?? 0,
    readingWithheld: debt.readingWithheld ?? 0,
    readingPresent: debt.readingPresent ?? null,
  };
}

/** One line naming the first new identity of each kind. */
// [::TICKET::] PX-288 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-288 --for-spec --no-implementation-order`.
// [::TICKET::] PX-287 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-287 --for-spec --no-implementation-order`.
function increaseDetail(increase) {
  const parts = [];
  if (increase.newFindings.length > 0) parts.push(`finding ${increase.newFindings[0].replace(IDENTITY_SEPARATOR, ' ')}`);
  if (increase.newBlocked.length > 0) parts.push(`blocked ${increase.newBlocked[0]}`);
  if (increase.newReadingSubjects.length > 0) parts.push(`reading ${increase.newReadingSubjects[0]}`);
  if (increase.readingCountDelta > 0) parts.push(`reading count +${increase.readingCountDelta}`);
  if (increase.readingWithheldDelta > 0) parts.push(`unreadable readings +${increase.readingWithheldDelta}`);
  if (increase.readingsRemoved) parts.push('readings file removed');
  if (increase.readingsUnmeasured) parts.push('readings no longer measured');
  return parts.join(', ');
}

/** Refuse a staged result that adds debt. */
export function assertNonWorsening({ baseline, staging }) {
  const increase = computeDebtIncrease({ baseline, staging });
  if (increase.increased) {
    throw new RegenerationError(`the transaction adds debt: ${increaseDetail(increase)}`, {
      code: 'DEBT_INCREASED',
      repair: 'Resolve the new debt in the candidate, or open the transaction from the current baseline.',
    });
  }
  return increase;
}
