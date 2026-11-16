// [::TICKET::] PX-434 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-434 --for-spec --no-implementation-order`.
/**
 * Chronology invariants for the progress timeline.
 *
 * A broken timeline must fail before an HTML file is published. The validator
 * reports named violations; the caller decides whether the failure is fatal.
 */
import { gateImplementationProgress, progressAt, progressStateAt, STAGE_ORDER } from './loop.js';

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
export function validateTimeline(options = {}) {
  const {
    model = {}, timeline = {}, previousSnapshot = null, artifactModel = null, finalModel = null, uncovered = [],
  } = options;
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

  const referenceT = previousSnapshot && Number.isFinite(Date.parse(previousSnapshot.generatedAt))
    ? Date.parse(previousSnapshot.generatedAt)
    : null;
  if (referenceT !== null && Array.isArray(previousSnapshot.packages) && previousSnapshot.packages.length > 0) {
    // An old snapshot has no timelineHealth, but its package stages are still
    // the last accepted visual state. Skipping it is how a collapsed render
    // published unnoticed.
    const state = progressStateAt(model, referenceT);
    const currentById = new Map((model.packages || []).map((pkg, index) => [pkg.id, state.pi[index] || []]));
    for (const previousPkg of previousSnapshot.packages) {
      const current = currentById.get(previousPkg.id);
      if (!current) continue;
      const expected = gateImplementationProgress(STAGE_ORDER.map((stage) => Number(previousPkg.stages && previousPkg.stages[stage]) || 0));
      for (let index = 0; index < STAGE_ORDER.length; index += 1) {
        const value = Number(current[index]) || 0;
        if (Math.abs(value - expected[index]) <= FINAL_STATE_TOLERANCE) continue;
        violations.push(violation('PREVIOUS_STATE_MISMATCH', {
          packageId: previousPkg.id,
          stage: STAGE_ORDER[index],
          detail: `previous ${expected[index]} != current ${value}`,
        }));
      }
    }
  }

  if (referenceT !== null && Array.isArray(previousSnapshot.runs) && previousSnapshot.runs.length > 0) {
    const present = new Set((model.runs || [])
      .filter((run) => Number.isFinite(run.t) && run.t <= referenceT && run.runId)
      .map((run) => run.runId));
    for (const run of previousSnapshot.runs) {
      if (!run.runId) continue;
      const at = Number.isFinite(run.t) ? run.t : Date.parse(run.at);
      if (Number.isFinite(at) && at > referenceT) continue;
      if (present.has(run.runId)) continue;
      violations.push(violation('PREVIOUS_RUN_MISSING', {
        packageId: run.packageId ?? null,
        stage: run.stage ?? null,
        detail: `run ${run.runId} is missing from the live model`,
      }));
    }
  }

  // Hard causal edges only. A rerun may revisit an earlier stage; a producer
  // appearing after its consumer cannot be a real command order.
  const CAUSAL_PAIRS = [['educe', 'explain'], ['graphify', 'boundify'], ['boundify', 'split'], ['split', 'make']];
  const firstAt = new Map();
  for (const event of events) {
    if (!Number.isFinite(event.orderT) || firstAt.has(event.stage)) continue;
    firstAt.set(event.stage, event.orderT);
  }
  for (const [producer, consumer] of CAUSAL_PAIRS) {
    const producerAt = firstAt.get(producer);
    const consumerAt = firstAt.get(consumer);
    if (!Number.isFinite(producerAt) || !Number.isFinite(consumerAt)) continue;
    if (consumerAt >= producerAt) continue;
    violations.push(violation('CAUSAL_ORDER_VIOLATION', {
      packageId: null,
      stage: `${producer}->${consumer}`,
      detail: `${consumer} at ${consumerAt} precedes ${producer} at ${producerAt}`,
    }));
  }

  for (const entry of uncovered) {
    violations.push(violation(entry.code || 'UNCOVERED_ARTIFACT_STAGE', entry));
  }

  if (artifactModel) {
    // A real render compares the final frame, not the artifact model it came
    // from. Unit checks without a frame keep the warning shape.
    const parity = compareFinalState(finalModel || model, artifactModel, {
      severity: finalModel ? 'error' : 'warning',
    });
    for (const discrepancy of parity.discrepancies) {
      violations.push(violation(discrepancy.code, discrepancy));
    }
  }
  return violations;
}

/** Compare the history-derived final stage fractions with the artifact final state. */
export function compareFinalState(historyModel, artifactModel, { tolerance = FINAL_STATE_TOLERANCE, severity = 'warning' } = {}) {
  const historyById = new Map(((historyModel && historyModel.packages) || []).map((pkg) => [pkg.id, pkg]));
  const artifactById = new Map(((artifactModel && artifactModel.packages) || []).map((pkg) => [pkg.id, pkg]));
  const discrepancies = [];
  const staged = (pkg) => gateImplementationProgress(STAGE_ORDER.map((stage) => Number(pkg.stages && pkg.stages[stage]) || 0));

  for (const [id, historyPkg] of historyById) {
    const artifactPkg = artifactById.get(id);
    if (!artifactPkg) continue;
    const history = staged(historyPkg);
    const artifact = staged(artifactPkg);
    for (let index = 0; index < STAGE_ORDER.length; index += 1) {
      if (Math.abs(history[index] - artifact[index]) > tolerance) {
        discrepancies.push({
          code: 'FINAL_STATE_MISMATCH',
          severity,
          packageId: id,
          stage: STAGE_ORDER[index],
          detail: `history ${history[index]} != artifact ${artifact[index]}`,
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
