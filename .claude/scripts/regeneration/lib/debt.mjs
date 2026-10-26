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
  const certificate = report?.certificate;
  const obligations = certificate === null || certificate === undefined ? null : {
    inputDigest: certificate.inputs?.artifact ?? null,
    closed: Array.isArray(certificate.closed) ? certificate.closed : [],
    open: Array.isArray(certificate.open) ? certificate.open.map((entry) => entry.id) : [],
    evidenceDigests: {},
    staleReceipts: Array.isArray(certificate.open) ? certificate.open.filter((entry) => entry.code === 'STALE_RECEIPT').length : 0,
    vacuousChecks: Array.isArray(certificate.open) ? certificate.open.filter((entry) => entry.code === 'VACUOUS').length : 0,
    unheldJudgments: certificate.judged === undefined ? 0 : (certificate.judged.broken ?? 0) + (certificate.judged.unresolved ?? 0),
  };
  const staleEvidenceCodes = new Set([
    'STALE_EVIDENCE',
    'WORKLIST_MISMATCH',
    'ATTACK_MISMATCH',
    'READER_GENERATION_STALE',
    'READING_NOT_REREAD',
  ]);
  const openEntries = Array.isArray(certificate?.open) ? certificate.open : [];
  const staleEvidence = openEntries.filter((entry) => staleEvidenceCodes.has(entry.code)).length;
  return { findings, blocked, obligations, staleEvidence };
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
  // A closed obligation that reopens with the same input and the same evidence digest is
  // an evidence regression; the same pair is stuck because another run with the same
  // evidence cannot change it. Both are debt even when the finding counts did not rise.
  const baselineObligations = baseline.obligations ?? {};
  const stagingObligations = staging.obligations ?? {};
  const baselineClosed = new Set(Array.isArray(baselineObligations.closed) ? baselineObligations.closed : []);
  const baselineOpen = new Set(Array.isArray(baselineObligations.open) ? baselineObligations.open : []);
  const stagingOpen = new Set(Array.isArray(stagingObligations.open) ? stagingObligations.open : []);
  const sameInput = baselineObligations.inputDigest === stagingObligations.inputDigest;
  const baselineDigests = baselineObligations.evidenceDigests ?? {};
  const stagingDigests = stagingObligations.evidenceDigests ?? {};
  const obligationRegressions = [...baselineClosed]
    .filter((id) => stagingOpen.has(id)
      && sameInput
      && (baselineDigests[id] ?? null) === (stagingDigests[id] ?? null))
    .sort();
  const stuckObligations = [...baselineOpen]
    .filter((id) => stagingOpen.has(id)
      && sameInput
      && (baselineDigests[id] ?? null) === (stagingDigests[id] ?? null))
    .sort();
  const staleReceipts = Number.isInteger(stagingObligations.staleReceipts) ? stagingObligations.staleReceipts : 0;
  const vacuousChecks = Number.isInteger(stagingObligations.vacuousChecks) ? stagingObligations.vacuousChecks : 0;
  const unheldJudgments = Number.isInteger(stagingObligations.unheldJudgments) ? stagingObligations.unheldJudgments : 0;
  const staleEvidence = Number.isInteger(staging.staleEvidence) ? staging.staleEvidence : 0;
  const increased = newFindings.length > 0
    || newBlocked.length > 0
    || newReadingSubjects.length > 0
    || readingCountDelta > 0
    || readingWithheldDelta > 0
    || readingsRemoved
    || readingsUnmeasured
    || obligationRegressions.length > 0
    || stuckObligations.length > 0
    || staleReceipts > 0
    || vacuousChecks > 0
    || unheldJudgments > 0
    || staleEvidence > 0;
  const code = obligationRegressions.length > 0
    ? 'EVIDENCE_REGRESSION'
    : stuckObligations.length > 0
      ? 'NO_NEW_EVIDENCE'
      : 'DEBT_INCREASED';
  return {
    newFindings,
    newBlocked,
    newReadingSubjects,
    readingCountDelta,
    readingWithheldDelta,
    readingsRemoved,
    readingsUnmeasured,
    obligationRegressions,
    stuckObligations,
    staleReceipts,
    vacuousChecks,
    unheldJudgments,
    staleEvidence,
    increased,
    code,
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
// [::TICKET::] PX-287, PX-289, PX-290, PX-310 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-287|PX-289|PX-290|PX-310) --for-spec --no-implementation-order`.
function increaseDetail(increase) {
  const parts = [];
  if (increase.newFindings.length > 0) parts.push(`finding ${increase.newFindings[0].replace(IDENTITY_SEPARATOR, ' ')}`);
  if (increase.newBlocked.length > 0) parts.push(`blocked ${increase.newBlocked[0]}`);
  if (increase.newReadingSubjects.length > 0) parts.push(`reading ${increase.newReadingSubjects[0]}`);
  if (increase.readingCountDelta > 0) parts.push(`reading count +${increase.readingCountDelta}`);
  if (increase.readingWithheldDelta > 0) parts.push(`unreadable readings +${increase.readingWithheldDelta}`);
  if (increase.readingsRemoved) parts.push('readings file removed');
  if (increase.readingsUnmeasured) parts.push('readings no longer measured');
  if (increase.obligationRegressions.length > 0) parts.push(`obligation ${increase.obligationRegressions[0]}`);
  if (increase.staleReceipts > 0) parts.push(`stale receipts ${increase.staleReceipts}`);
  if (increase.vacuousChecks > 0) parts.push(`vacuous checks ${increase.vacuousChecks}`);
  if (increase.unheldJudgments > 0) parts.push(`unheld judgments ${increase.unheldJudgments}`);
  if (increase.staleEvidence > 0) parts.push(`stale evidence ${increase.staleEvidence}`);
  return parts.join(', ');
}

/** Refuse a staged result that adds debt. */
export function assertNonWorsening({ baseline, staging }) {
  const increase = computeDebtIncrease({ baseline, staging });
  if (increase.increased) {
    throw new RegenerationError(`the transaction adds debt: ${increaseDetail(increase)}`, {
      code: increase.code ?? 'DEBT_INCREASED',
      repair: increase.code === 'EVIDENCE_REGRESSION'
        ? 'Restore the evidence the baseline closed, or change the input that made the obligation open.'
        : increase.code === 'NO_NEW_EVIDENCE'
          ? 'Produce new evidence for the stuck obligation; another run with the same evidence cannot close it.'
          : 'Resolve the new debt in the candidate, or open the transaction from the current baseline.',
    });
  }
  return increase;
}
