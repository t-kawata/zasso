'use strict';

/**
 * PX-407 — detection coverage, calibration and the enforcing gate.
 *
 * A clean run is not a measurement unless the registered runner has been shown
 * to fire. The gate consumes the gap scan, the real-detector calibration, the
 * real-scan negative control and the meta control, and exits non-zero on any
 * uncovered, notMeasured, blocked or uncalibrated surface.
 */

const path = require('node:path');
const {
  evaluateCoverage,
  loadRegistry,
  readJsonIfPresent,
} = require('./lib/omission-detectors.js');
const {
  calibrationVerdict,
  runCalibration,
  runNegativeControl,
} = require('./lib/omission-calibration.js');
const { runGapScan } = require('./omission-gap-scan.js');
const { convergenceReport, readState } = require('./lib/omission-convergence.js');

/** Read `--name=value` from the argument list. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

/** The meta control: removing a detector must be observable. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function runMetaControl({ registry, surfaces = null }) {
  const probe = surfaces ?? [...new Set(registry.detectors.filter((detector) => detector.kind === 'mechanical').flatMap((detector) => detector.surfaces))]
    .map((surface) => ({ surface, assetId: '_meta_' }));
  const findings = [];
  const failures = [];
  for (const detector of registry.detectors.filter((entry) => entry.kind === 'mechanical')) {
    const reduced = { ...registry, detectors: registry.detectors.filter((entry) => entry.id !== detector.id) };
    const coverage = evaluateCoverage({ registry: reduced, surfaces: probe });
    const uncovered = coverage.findings.filter((finding) => finding.code === 'SURFACE_UNCOVERED' && detector.surfaces.includes(finding.surface));
    findings.push(...uncovered);
    const observed = uncovered.length > 0 || coverage.surfaces.every((surface) => !surface.detectors.includes(detector.id));
    if (!observed) {
      failures.push({ code: 'META_CONTROL_FAILED', surface: detector.surfaces[0], assetId: detector.id, problem: 'removing the detector did not change the coverage report' });
    }
  }
  return { findings: [...findings, ...failures], failures, ok: failures.length === 0 };
}

/** The gate over the real package. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function runDetectionGate({ cwd, ticketsPath = null, graphPath = null, registry = null, surfaces = null, reportOnly = false, requireConverged = false } = {}) {
  const loaded = registry ?? loadRegistry({ cwd });
  const gap = runGapScan({ cwd, ticketsPath: ticketsPath || path.join(cwd, 'Tickets.json'), graphPath, registry: loaded, reportOnly });
  const enumerated = surfaces ?? gap.surfaces;
  const coverage = evaluateCoverage({ registry: loaded, surfaces: enumerated, measurements: measurementsOf(gap), artifacts: gap.artifacts });
  const calibrationRun = runCalibration({ registry: loaded });
  const calibration = { ...calibrationRun, verdict: calibrationVerdict(calibrationRun) };
  const negative = runNegativeControl({ registry: loaded });
  const meta = runMetaControl({ registry: loaded, surfaces: enumerated });
  const ticketIndex = readJsonIfPresent(path.join(cwd, 'OMISSION-TICKET-INDEX.json')) ?? { tickets: {}, createdThisRound: 0 };
  const ticketedKeys = Object.keys(ticketIndex.tickets ?? {});
  const convergence = reportOnly
    ? convergenceOnly({ cwd, report: gap, judgments: gap.judgments, ticketedKeys })
    : convergenceReport({ cwd, report: gap, judgments: gap.judgments, newTickets: ticketIndex.createdThisRound ?? 0, ticketedKeys });

  const findings = [
    ...coverage.findings,
    ...(calibration.verdict.ok ? [] : [{ code: calibration.verdict.code, surface: 'calibration', assetId: 'calibration', problem: 'calibration did not pass' }]),
    ...(negative.findings.map((finding) => ({ ...finding, code: 'NEGATIVE_CONTROL_FAILED' }))),
    ...(meta.failures ?? []),
    ...(requireConverged && !convergence.converged ? [{ code: 'CONVERGENCE_NOT_REACHED', surface: 'convergence', assetId: 'convergence', problem: 'the loop has not reached a fixed point' }] : []),
  ];
  const ok = coverage.ok && calibration.verdict.ok && negative.ok && meta.ok && (!requireConverged || convergence.converged);

  return { version: loaded.version, coverage, calibration, negative, meta, convergence, findings, exitCode: ok ? 0 : 1 };
}

/** The measurements the coverage evaluator reads. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function measurementsOf(gap) {
  const measurements = {};
  for (const id of gap.measured ?? []) measurements[id] = 'measured';
  for (const id of gap.notMeasured ?? []) measurements[id] = 'notMeasured';
  for (const entry of gap.blocked ?? []) measurements[entry.detectorId] = 'blocked';
  return measurements;
}

/** Convergence without writing a run (report-only). */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function convergenceOnly({ cwd, report, judgments, ticketedKeys = [] }) {
  const state = readState({ cwd });
  const { isConverged, unticketedMustFix } = require('./lib/omission-convergence.js');
  const latest = state.runs[state.runs.length - 1];
  const predicateState = {
    unrecorded: judgments?.unrecorded ?? [],
    unticketedMustFix: unticketedMustFix(report, ticketedKeys),
    debt: latest?.debt ?? { before: 0, after: 0 },
    runs: state.runs,
    newTickets: 0,
  };
  return { ...predicateState, converged: isConverged(predicateState), digest: report.digest, baseline: state.baseline, runs: state.runs };
}

/** CLI entry point. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const cwd = path.resolve(argumentValue(args, 'cwd') || process.cwd());
  const tickets = argumentValue(args, 'tickets');
  const graph = argumentValue(args, 'graph');
  const reportOnly = args.includes('--report-only');
  const requireConverged = args.includes('--require-converged');
  const result = runDetectionGate({
    cwd,
    ticketsPath: tickets ? path.resolve(cwd, tickets) : null,
    graphPath: graph ? path.resolve(cwd, graph) : null,
    reportOnly,
    requireConverged,
  });
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(result.exitCode);
}

if (require.main === module) main();

module.exports = {
  calibrationVerdict,
  runCalibration,
  runDetectionGate,
  runMetaControl,
  runNegativeControl,
};
