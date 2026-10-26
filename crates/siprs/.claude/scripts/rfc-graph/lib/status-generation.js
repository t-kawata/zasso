/**
 * The generation and run counters every pipeline stage shares.
 *
 * `runs` counts invocations once per runId. `generation` counts successful artifacts whose
 * output digest changed. An audit observes without writing a generation, and a coverage
 * decrease is refused before the status file is written. The rules live in one module so
 * graphify, boundify and split cannot disagree about what a run is.
 *
 * [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
 */
'use strict';

const { createHash } = require('node:crypto');
const { existsSync, readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

const GENERATION_FIELD = 'generation';
const RUNS_FIELD = 'runs';
const RUN_ID_FIELD = 'runId';
const OUTPUT_DIGEST_FIELD = 'lastOutputDigest';
const COVERAGE_FIELD = 'coverage';

const COVERAGE_KEYS = Object.freeze(['units', 'steps', 'boundaries']);

/** A new status with the invocation counted once for a new runId. */
// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
function beginRun(status, runId) {
  const current = status ?? {};
  if (current[RUN_ID_FIELD] === runId) return { ...current };
  return {
    ...current,
    [RUN_ID_FIELD]: runId,
    [RUNS_FIELD]: (Number.isInteger(current[RUNS_FIELD]) ? current[RUNS_FIELD] : 0) + 1,
  };
}

/** The counts that decreased between two coverage records. */
// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
function compareCoverage(previous, next) {
  if (previous === null || previous === undefined || next === null || next === undefined) {
    return { ok: true, decreased: [] };
  }
  const decreased = COVERAGE_KEYS.filter((key) => Number.isInteger(previous[key])
    && Number.isInteger(next[key])
    && next[key] < previous[key]);
  return decreased.length === 0
    ? { ok: true, decreased }
    : { ok: false, code: 'COVERAGE_REGRESSION', decreased };
}

/**
 * Complete one stage generation.
 *
 * An unchanged output digest is a verification: it keeps the generation and the coverage
 * record. A changed digest advances the generation. Audit never writes either.
 */
// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
function completeGeneration(status, { outputDigest, coverage = null, audit = false } = {}) {
  const current = status ?? {};
  if (audit) return { ok: true, status: { ...current } };
  if (typeof outputDigest !== 'string' || outputDigest.length === 0) {
    return { ok: false, code: 'MISSING_OUTPUT' };
  }
  const regression = compareCoverage(current[COVERAGE_FIELD], coverage);
  if (!regression.ok) return { ok: false, code: regression.code, decreased: regression.decreased };
  if (current[OUTPUT_DIGEST_FIELD] === outputDigest) return { ok: true, status: { ...current } };
  return {
    ok: true,
    status: {
      ...current,
      [OUTPUT_DIGEST_FIELD]: outputDigest,
      [GENERATION_FIELD]: (Number.isInteger(current[GENERATION_FIELD]) ? current[GENERATION_FIELD] : 0) + 1,
      ...(coverage === null ? {} : { [COVERAGE_FIELD]: coverage }),
    },
  };
}

/** The sha256 of a file, or null when it is absent or unreadable. */
// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
function outputDigest(filePath) {
  if (typeof filePath !== 'string' || !existsSync(filePath)) return null;
  try {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
  } catch {
    return null;
  }
}

/** A coverage record for one stage's output, or null when the output is unreadable. */
// [::TICKET::] PX-313 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-313 --for-spec --no-implementation-order`.
/** The steps the sibling package view carries, or null when it is absent. */
function stepCountFromView(packageDirectory) {
  const viewPath = join(packageDirectory, 'SEQUENCES.json');
  if (!existsSync(viewPath)) return null;
  try {
    const view = JSON.parse(readFileSync(viewPath, 'utf8'));
    let count = 0;
    for (const field of ['ownedSequenceUnits', 'crossBoundarySequenceUnits']) {
      for (const unit of view[field] ?? []) {
        count += Array.isArray(unit.steps) ? unit.steps.length : 0;
      }
    }
    return count;
  } catch {
    return null;
  }
}

function coverageFor(kind, filePath) {
  if (typeof filePath !== 'string' || !existsSync(filePath)) return null;
  let document;
  try {
    document = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
  if (kind === 'graphify') {
    const units = new Set((document.nodes ?? []).flatMap((node) => node.unitIds ?? []));
    const sequenceUnits = [...units].filter((unitId) => unitId.startsWith('seq-'));
    return { units: units.size, steps: stepCountFromView(dirname(filePath)) ?? sequenceUnits.length, boundaries: [...units].filter((unitId) => unitId.startsWith('ctr-')).length };
  }
  if (kind === 'boundify') {
    const units = Object.keys(document.distribution?.units ?? {});
    const sequenceUnits = units.filter((unitId) => unitId.startsWith('seq-'));
    return {
      units: units.length,
      steps: stepCountFromView(dirname(filePath)) ?? sequenceUnits.length,
      boundaries: units.filter((unitId) => unitId.startsWith('ctr-')).length,
    };
  }
  if (kind === 'split') {
    const units = (document.phases ?? []).flatMap((phase) => phase.tickets ?? [])
      .flatMap((ticket) => ticket.distribution?.units ?? []);
    return {
      units: units.length,
      steps: units.reduce((count, unit) => count + (unit.obligation?.steps?.length ?? 0), 0),
      boundaries: units.filter((unit) => unit.unitId?.startsWith('ctr-')).length,
    };
  }
  return null;
}

module.exports = {
  GENERATION_FIELD,
  RUNS_FIELD,
  RUN_ID_FIELD,
  OUTPUT_DIGEST_FIELD,
  COVERAGE_FIELD,
  beginRun,
  compareCoverage,
  completeGeneration,
  outputDigest,
  coverageFor,
};
