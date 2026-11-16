/**
 * Chronology invariants for the progress timeline.
 *
 * A broken timeline must fail before an HTML file is published. The validator
 * reports named violations; the caller decides whether the failure is fatal.
 */
import { progressAt, STAGE_ORDER } from './loop.js';

export const MAX_ORDER_SKEW_MS = 60 * 1000;
export const MAX_COLLAPSE_MS = 60 * 1000;
export const FINAL_STATE_TOLERANCE = 0.01;
const PREVIOUS_PROGRESS_EPSILON = 1e-6;

// [::TICKET::] PX-433 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-433 --for-spec --no-implementation-order`.
function violation(code, detail, severity = 'error') {
  return { code, severity, ...detail };
}

/**
 * Check the timeline's clock, collapse, previous-progress round-trip, and final
 * state parity. A clean timeline returns an empty array.
 */
export function validateTimeline({ model = {}, timeline = {}, previousSnapshot = null, artifactModel = null }) {
  const violations = [];
  const events = (timeline.timeline || []).filter((entry) => entry.kind === 'stage');
  const historyMode = model.timelineMode === 'history';

  for (const event of events) {
    if (historyMode && !event.recordId) {
      violations.push(violation('MISSING_STAGE_RECORD', {
        packageId: event.packageId ?? null,
        stage: event.stage,
        detail: 'history mode stage event has no record id',
      }));
    }
    if (Number.isFinite(event.orderT) && Number.isFinite(event.evidenceT)
      && Math.abs(event.orderT - event.evidenceT) > MAX_ORDER_SKEW_MS) {
      violations.push(violation('ORDER_SKEW', {
        packageId: event.packageId ?? null,
        stage: event.stage,
        detail: `orderT ${event.orderT} differs from evidenceT ${event.evidenceT}`,
      }));
    }
  }

  const buckets = new Map();
  for (const event of events) {
    if (!Number.isFinite(event.orderT) || !Number.isFinite(event.evidenceT)) continue;
    const bucket = buckets.get(event.orderT) || { min: event.evidenceT, max: event.evidenceT, packages: new Set(), stages: new Set() };
    bucket.min = Math.min(bucket.min, event.evidenceT);
    bucket.max = Math.max(bucket.max, event.evidenceT);
    bucket.packages.add(event.packageId ?? 'workspace');
    bucket.stages.add(event.stage);
    buckets.set(event.orderT, bucket);
  }
  for (const [orderT, bucket] of buckets) {
    if (bucket.max - bucket.min > MAX_COLLAPSE_MS) {
      violations.push(violation('COLLAPSED_ORDER_TIME', {
        packageId: [...bucket.packages].join(','),
        stage: [...bucket.stages].join(','),
        detail: `orderT ${orderT} holds evidence spanning ${bucket.max - bucket.min}ms`,
      }));
    }
  }

  const previousMode = previousSnapshot && previousSnapshot.timelineHealth && previousSnapshot.timelineHealth.mode;
  if (previousMode === 'history'
    && Number.isFinite(model.previousRender && model.previousRender.t)
    && Number.isFinite(previousSnapshot && previousSnapshot.overallProgress)) {
    const current = progressAt(model, model.previousRender.t);
    if (Math.abs(current - previousSnapshot.overallProgress) > PREVIOUS_PROGRESS_EPSILON) {
      violations.push(violation('PREVIOUS_PROGRESS_MISMATCH', {
        packageId: null,
        stage: null,
        detail: `progressAt(previous) ${current} != snapshot ${previousSnapshot.overallProgress}`,
      }));
    }
  }

  if (artifactModel) {
    const parity = compareFinalState(model, artifactModel);
    for (const discrepancy of parity.discrepancies) {
      violations.push(violation(discrepancy.code, discrepancy));
    }
  }
  return violations;
}

/** Compare the history-derived final stage fractions with the artifact final state. */
export function compareFinalState(historyModel, artifactModel, { tolerance = FINAL_STATE_TOLERANCE } = {}) {
  const historyById = new Map(((historyModel && historyModel.packages) || []).map((pkg) => [pkg.id, pkg]));
  const artifactById = new Map(((artifactModel && artifactModel.packages) || []).map((pkg) => [pkg.id, pkg]));
  const discrepancies = [];

  for (const [id, historyPkg] of historyById) {
    const artifactPkg = artifactById.get(id);
    if (!artifactPkg) continue;
    for (const stage of STAGE_ORDER) {
      const historyValue = Number(historyPkg.stages && historyPkg.stages[stage]) || 0;
      const artifactValue = Number(artifactPkg.stages && artifactPkg.stages[stage]) || 0;
      if (Math.abs(historyValue - artifactValue) > tolerance) {
        discrepancies.push({
          code: 'FINAL_STATE_MISMATCH',
          severity: 'warning',
          packageId: id,
          stage,
          detail: `history ${historyValue} != artifact ${artifactValue}`,
        });
      }
    }
  }
  return { ok: discrepancies.length === 0, discrepancies };
}

export function assertNoViolations(violations) {
  const errors = violations.filter((entry) => entry.severity !== 'warning');
  if (errors.length === 0) return;
  const codes = [...new Set(errors.map((entry) => entry.code))].join(',');
  throw new Error(`timeline violations: ${codes}`);
}
