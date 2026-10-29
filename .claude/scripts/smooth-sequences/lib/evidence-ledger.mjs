/**
 * The finding ledger across generations.
 *
 * A finding is evidence that a repair is still owed. Removing the surface a finding was
 * measured over must not remove the finding: the ledger compares the most recent report
 * that carried findings with the current evaluation and emits `S.evidence-withdrawn`
 * for every finding whose check is now blocked. A waiver is the only way a finding
 * leaves the blocking set without being resolved, and a waiver without a ground is
 * refused rather than silently accepted.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SmoothSequencesError } from './errors.mjs';

export const EVIDENCE_WITHDRAWN = 'S.evidence-withdrawn';
export const WAIVERS_FILE_NAME = 'SMOOTH-SEQUENCES-WAIVERS.json';

const KEY_SEPARATOR = '\u0000';
const SUBJECT_SEPARATOR = ':';

/** The identity a finding keeps across runs. */
export function computeFindingKey(finding) {
  return `${finding.checkId}${KEY_SEPARATOR}${finding.subject}`;
}

/** The original check id encoded in a withdrawn finding's subject. */
// [::TICKET::] PX-285 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-285 --for-spec --no-implementation-order`.
function readOriginalCheckId(buildWithdrawnFinding) {
  const separator = buildWithdrawnFinding.subject.indexOf(SUBJECT_SEPARATOR);
  return separator === -1 ? buildWithdrawnFinding.subject : buildWithdrawnFinding.subject.slice(0, separator);
}

/** The key of the finding a withdrawn entry stands for. */
// [::TICKET::] PX-285 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-285 --for-spec --no-implementation-order`.
function computeOriginalKey(buildWithdrawnFinding) {
  const separator = buildWithdrawnFinding.subject.indexOf(SUBJECT_SEPARATOR);
  if (separator === -1) return `${buildWithdrawnFinding.subject}${KEY_SEPARATOR}`;
  return `${buildWithdrawnFinding.subject.slice(0, separator)}${KEY_SEPARATOR}${buildWithdrawnFinding.subject.slice(separator + 1)}`;
}

/** Refuse a waiver that does not carry a ground. */
// [::TICKET::] PX-285 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-285 --for-spec --no-implementation-order`.
function assertWaiver(waiver) {
  if (typeof waiver?.findingKey !== 'string' || waiver.findingKey.trim() === '') {
    throw new SmoothSequencesError('waiver names no findingKey', {
      code: 'INVALID_WAIVER',
      repair: `Every waiver in ${WAIVERS_FILE_NAME} must name the findingKey it covers.`,
    });
  }
  if (typeof waiver?.ground !== 'string' || waiver.ground.trim() === '') {
    throw new SmoothSequencesError(`waiver ${waiver.findingKey} carries no ground`, {
      code: 'INVALID_WAIVER',
      repair: `Record a non-empty ground for ${waiver.findingKey} in ${WAIVERS_FILE_NAME}.`,
    });
  }
}

/**
 * Read the authored waiver file, or return no waivers when the file is absent.
 *
 * @param {string} root — workspace root
 * @returns {Array<{findingKey: string, ground: string}>}
 */
export function readWaivers(root) {
  const path = join(root, WAIVERS_FILE_NAME);
  if (!existsSync(path)) return [];
  let body;
  try {
    body = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new SmoothSequencesError(`${WAIVERS_FILE_NAME} is not valid JSON`, {
      code: 'UNREADABLE_WAIVERS',
      path,
      repair: `Repair ${path}: ${error.message}`,
    });
  }
  if (!Array.isArray(body?.waivers)) {
    throw new SmoothSequencesError(`${WAIVERS_FILE_NAME} carries no waivers array`, {
      code: 'INVALID_WAIVERS',
      path,
      repair: `Write { "waivers": [ ... ] } in ${path}.`,
    });
  }
  for (const waiver of body.waivers) assertWaiver(waiver);
  return body.waivers;
}

/** One withdrawn finding that keeps the previous repair route. */
// [::TICKET::] PX-285, PX-341 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-285|PX-341) --for-spec --no-implementation-order`.
function buildWithdrawnFinding(previousFinding, blockedCheck) {
  const surface = blockedCheck.surface ?? 'the required surface';
  return {
    checkId: EVIDENCE_WITHDRAWN,
    class: 'danger',
    subject: `${previousFinding.checkId}${SUBJECT_SEPARATOR}${previousFinding.subject}`,
    where: previousFinding.where ?? 'the surface named by the blocked check',
    why: `previous finding ${previousFinding.checkId} on ${previousFinding.subject} is unresolved; ${surface} is absent or synthesized`,
    fix: `restore ${surface} and rerun the producer, or record a waiver with a non-empty ground in ${WAIVERS_FILE_NAME}`,
    producer: previousFinding.producer ?? 'node "$(git rev-parse --show-toplevel)/.claude/scripts/smooth-sequences/run.mjs"',
    repairClass: previousFinding.repairClass ?? 'regeneration',
  };
}

/**
 * Compare obligation closure across two generations.
 *
 * A closed obligation that is open again with the same input and the same evidence digest
 * is an evidence regression; the same pair is also stuck because another run with the same
 * evidence cannot change it. New evidence on the same input is not a regression.
 */
// [::TICKET::] PX-289 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-289 --for-spec --no-implementation-order`.
export function compareObligationClosure({ baseline = {}, staging = {} } = {}) {
  const baselineClosed = new Set(Array.isArray(baseline.closed) ? baseline.closed : []);
  const stagingOpen = new Set(Array.isArray(staging.open) ? staging.open : []);
  const sameInput = baseline.inputDigest === staging.inputDigest;
  const baselineDigests = baseline.evidenceDigests ?? {};
  const stagingDigests = staging.evidenceDigests ?? {};
  const regressions = [...baselineClosed]
    .filter((id) => stagingOpen.has(id)
      && sameInput
      && (baselineDigests[id] ?? null) === (stagingDigests[id] ?? null))
    .sort();
  const newObligations = [...stagingOpen].filter((id) => !baselineClosed.has(id)).sort();
  return {
    regressions,
    stuck: [...regressions],
    newObligations,
    code: regressions.length > 0 ? 'EVIDENCE_REGRESSION' : null,
  };
}

/**
 * Compare the previous finding set with the current evaluation.
 *
 * @param {object|null} previousReport — the baseline report
 * @param {Array<object>} currentFindings — findings the current evaluation produced
 * @param {{ blocked?: Array<object>, waivers?: Array<object> }} [options]
 * @returns {{ resolved: Array<object>, withdrawn: Array<object>, waived: Array<object> }}
 */
export function compareFindingSets(previousReport, currentFindings, { blocked = [], waivers = [] } = {}) {
  const currentKeys = new Set(currentFindings.map(computeFindingKey));
  const blockedByCheck = new Map(blocked.map((entry) => [entry.checkId ?? entry.id, entry]));
  const waiverByKey = new Map();
  for (const waiver of waivers) {
    assertWaiver(waiver);
    waiverByKey.set(waiver.findingKey, waiver);
  }

  const resolved = [];
  const withdrawn = [];
  const waived = [];
  const withdrawnOriginalKeys = new Set();
  const withdrawnKeys = new Set();

  for (const previousFinding of previousReport?.findings ?? []) {
    if (previousFinding.checkId === EVIDENCE_WITHDRAWN) continue;
    const key = computeFindingKey(previousFinding);
    if (currentKeys.has(key)) continue;
    if (withdrawnKeys.has(key)) continue;
    const blockedCheck = blockedByCheck.get(previousFinding.checkId);
    if (blockedCheck === undefined) {
      resolved.push(previousFinding);
      continue;
    }
    if (waiverByKey.has(key)) {
      waived.push({ ...previousFinding, waiver: waiverByKey.get(key) });
      continue;
    }
    withdrawn.push(buildWithdrawnFinding(previousFinding, blockedCheck));
    withdrawnOriginalKeys.add(key);
    withdrawnKeys.add(key);
  }

  for (const previousFinding of previousReport?.findings ?? []) {
    if (previousFinding.checkId !== EVIDENCE_WITHDRAWN) continue;
    if (currentKeys.has(computeFindingKey(previousFinding))) continue;
    const key = computeOriginalKey(previousFinding);
    if (withdrawnOriginalKeys.has(key)) continue;
    if (waiverByKey.has(key)) {
      waived.push({ ...previousFinding, waiver: waiverByKey.get(key) });
      continue;
    }
    const blockedCheck = blockedByCheck.get(readOriginalCheckId(previousFinding));
    if (blockedCheck === undefined) {
      resolved.push(previousFinding);
      continue;
    }
    if (withdrawnKeys.has(key)) continue;
    withdrawn.push({ ...previousFinding, persisted: true });
    withdrawnOriginalKeys.add(key);
    withdrawnKeys.add(key);
  }

  return { resolved, withdrawn, waived };
}
