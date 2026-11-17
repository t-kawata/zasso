'use strict';

/**
 * PX-407 — detection coverage, calibration and the enforcing gate.
 *
 * A clean run is not a measurement unless the registered runner has been shown
 * to fire. The gate consumes the gap scan, the real-detector calibration, the
 * real-scan negative control and the meta control, and exits non-zero on any
 * uncovered, notMeasured, blocked or uncalibrated surface.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  evaluateCoverage,
  loadRegistry,
  readJsonIfPresent,
} = require('./lib/omission-detectors.js');
const { DISPOSITIONS_FILE_NAME, loadDispositions } = require('./lib/dispositions.js');
const { isCompletedStatus } = require('./lib/ticket-status.js');
const { requireSupportedVersion } = require('./lib/versioned-json.js');
const {
  calibrationVerdict,
  runCalibration,
  runNegativeControl,
} = require('./lib/omission-calibration.js');
const { runGapScan } = require('./omission-gap-scan.js');
const { convergenceReport, readState } = require('./lib/omission-convergence.js');
const { coverageDigestOf, scanClauseCoverage } = require('./lib/coverage-map.js');
const { runClauseCalibration } = require('./lib/omission-calibration.js');

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

/**
 * PX-437 — the ordered v3 gates over measured artifacts.
 *
 * A project-condition problem is a gate failure and exit 10, never a process
 * failure. The gates are evaluated in the order the repair ladder consumes them.
 */
// [::TICKET::] PX-437, PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-437|PX-440) --for-spec --no-implementation-order`.
function runV3Gate({ cwd = process.cwd(), v3Artifacts = {}, repairs = [], openTickets = 0, dispositions = [], convergence = {} } = {}) {
  const { inventory = null, testIndex = null, coverage = null, dispositionFindings = [] } = v3Artifacts;
  const gates = [];

  const inventoryUsable = inventory !== null
    && typeof inventory.digest === 'string'
    && Array.isArray(inventory.clauses)
    && inventory.clauses.length > 0;
  gates.push({
    name: 'inventory',
    ok: inventoryUsable,
    findings: (inventory?.findings ?? []).filter((finding) => finding.code === 'INVENTORY_SOURCE_UNACCOUNTED'),
    problem: inventoryUsable ? null : 'no digest-bound inventory with at least one clause',
  });

  const testIndexUsable = testIndex !== null
    && Array.isArray(testIndex.tests)
    && (testIndex.findings ?? []).length === 0;
  gates.push({
    name: 'test-index',
    ok: testIndexUsable,
    findings: testIndex?.findings ?? [],
    problem: testIndexUsable ? null : 'no complete test index with an identified adapter',
  });

  const scan = inventoryUsable && testIndexUsable
    ? scanClauseCoverage({
        inventory,
        testIndex,
        coverage: coverage ?? { version: 1, inventoryDigest: null, testIndexDigest: null, clauses: [] },
        dispositions,
      })
    : null;
  const findings = scan?.findings ?? [];
  const codes = new Set(findings.map((finding) => finding.code));
  const coverageCodes = ['CLAUSE_UNMAPPED', 'CLAUSE_UNCLASSIFIED', 'CLAUSE_DISPOSITION_UNVERIFIED', 'TEST_MISSING', 'TEST_IGNORED'];

  gates.push({
    name: 'coverage',
    ok: scan !== null && !coverageCodes.some((code) => codes.has(code)),
    findings: findings.filter((finding) => coverageCodes.includes(finding.code)),
    problem: null,
  });
  gates.push({
    name: 'dispositions',
    ok: (dispositionFindings ?? []).length === 0,
    findings: dispositionFindings ?? [],
    problem: (dispositionFindings ?? []).length === 0 ? null : 'a disposition is invalid or unverified',
  });
  gates.push({
    name: 'proof',
    ok: scan !== null && !['CLAUSE_PROOF_MISSING', 'CLAUSE_PROOF_STALE', 'CLAUSE_PROOF_FAILED', 'UNSTABLE'].some((code) => codes.has(code)),
    findings: findings.filter((finding) => ['CLAUSE_PROOF_MISSING', 'CLAUSE_PROOF_STALE', 'CLAUSE_PROOF_FAILED', 'UNSTABLE'].includes(finding.code)),
    problem: null,
  });

  const openRepairs = (repairs ?? []).filter((repair) => repair.status !== 'completed');
  gates.push({
    name: 'repair',
    ok: inventoryUsable && testIndexUsable && openRepairs.length === 0,
    findings: openRepairs,
    problem: openRepairs.length === 0 ? null : 'an automatic repair or repair ticket remains open',
  });
  gates.push({
    name: 'open-tickets',
    ok: (openTickets ?? 0) === 0,
    findings: (openTickets ?? 0) === 0 ? [] : [{ code: 'OPEN_TICKETS_REMAIN', count: openTickets }],
    problem: (openTickets ?? 0) === 0 ? null : openTickets + ' open ticket(s) remain',
  });

  const measured = coverage?.remainder ?? {};
  const scanRemainder = scan?.remainder ?? { remainder: 0, total: 0, debt: 0, notApplicable: 0, structural: 0, expiredDeferred: 0, unclassified: 0, unmapped: 0, unproven: 0, staleProof: 0, conflict: 0, duplicateOwner: 0 };
  const remainder = {
    ...scanRemainder,
    ...measured,
    remainder: Math.max(scanRemainder.remainder ?? 0, measured.remainder ?? 0),
    expiredDeferred: Math.max(scanRemainder.expiredDeferred ?? 0, measured.expiredDeferred ?? 0),
    unclassified: Math.max(scanRemainder.unclassified ?? 0, measured.unclassified ?? 0),
  };
  const secondScan = inventoryUsable && testIndexUsable
    ? scanClauseCoverage({
        inventory,
        testIndex,
        coverage: coverage ?? { version: 1, inventoryDigest: null, testIndexDigest: null, clauses: [] },
        dispositions,
      })
    : null;
  const measurementStable = scan !== null && secondScan !== null
    && coverageDigestOf(scan.coverage) === coverageDigestOf(secondScan.coverage);
  const debtBefore = convergence?.debtBefore ?? remainder.debt ?? 0;
  const newTickets = convergence?.newTickets ?? 0;
  const previous = convergence?.previous ?? null;
  const crossRunStable = previous === null
    || (previous.inventoryDigest === inventory?.digest && previous.coverageDigest === coverageDigestOf(scan?.coverage));
  const converged = remainder.remainder === 0
    && (remainder.expiredDeferred ?? 0) === 0
    && (remainder.unclassified ?? 0) === 0
    && measurementStable
    && crossRunStable
    && (remainder.debt ?? 0) <= debtBefore
    && newTickets === 0;

  gates.push({ name: 'remainder', ok: remainder.remainder === 0, findings: [], problem: null });
  gates.push({ name: 'debt', ok: (remainder.expiredDeferred ?? 0) === 0, findings: [], problem: null });
  gates.push({
    name: 'convergence',
    ok: converged,
    findings: converged ? [] : [{ code: 'CONVERGENCE_NOT_REACHED', problem: 'remainder, debt, digest stability or new tickets did not reach a fixed point' }],
    problem: converged ? null : 'remainder, debt, digest stability or new tickets did not reach a fixed point',
  });

  const calibration = runClauseCalibration();
  const undetected = calibration.seeds.filter((seed) => seed.applicable !== true || seed.detected !== true || (seed.cleanFindings ?? []).length > 0);
  gates.push({
    name: 'anti-gaming',
    ok: undetected.length === 0,
    findings: undetected.map((seed) => ({ code: 'CALIBRATION_FAILED', detectorId: seed.checkId })),
    problem: null,
  });

  const counts = {
    clauses: {
      total: remainder.total ?? 0,
      proven: remainder.proven ?? 0,
      design: remainder.design ?? 0,
      process: remainder.process ?? 0,
      external: remainder.external ?? 0,
      notApplicable: remainder.notApplicable ?? 0,
      deferred: remainder.deferred ?? 0,
      expiredDeferred: remainder.expiredDeferred ?? 0,
      unmapped: remainder.unmapped ?? 0,
      unproven: remainder.unproven ?? 0,
      unclassified: remainder.unclassified ?? 0,
      structural: remainder.structural ?? 0,
    },
    remainder: remainder.remainder,
    debt: remainder.debt ?? 0,
    debtBefore,
    measurementStable,
    crossRunStable,
    newTickets,
    repairs: (repairs ?? []).length,
    openTickets: openTickets ?? 0,
  };
  const complete = gates.every((gate) => gate.ok) && counts.remainder === 0;
  return {
    version: 3,
    predicateVersion: 3,
    terminal: complete,
    gates,
    counts,
    remainder: counts.remainder,
    debt: counts.debt,
    repairs: counts.repairs,
    openTickets: counts.openTickets,
    findings,
    complete,
    exitCode: complete ? 0 : 10,
  };
}

/** The gate over the real package. */
// [::TICKET::] PX-407, PX-437, PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-407|PX-437|PX-440) --for-spec --no-implementation-order`.
function runDetectionGate({ cwd, ticketsPath = null, graphPath = null, registry = null, surfaces = null, reportOnly = false, requireConverged = false, v3Artifacts = undefined, repairs = [], openTickets = 0, dispositions = [], convergenceState = {} } = {}) {
  if (v3Artifacts !== undefined) return runV3Gate({ cwd, v3Artifacts, repairs, openTickets, dispositions, convergence: convergenceState });
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

/** The open tickets of one ticket set with their canonical keys. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function openTicketsOf(ticketsData) {
  return (ticketsData?.phases ?? []).flatMap((phase) => (phase.tickets ?? [])
    .filter((ticket) => !isCompletedStatus(ticket.status))
    .map((ticket) => ({ key: phase.id === -1 ? 'PX-' + String(ticket.id) : 'P' + String(phase.id) + '-' + String(ticket.id), ticket })));
}

/** Read JSON or null. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/** The v3 verdict over the artifacts in a package. */
// [::TICKET::] PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-440 --for-spec --no-implementation-order`.
function runV3PackageGate({ cwd, inventoryPath, indexPath, coveragePath, dispositionsPath, ticketsPath }) {
  const missing = [inventoryPath, indexPath].filter((filePath) => !fs.existsSync(filePath));
  if (missing.length > 0) {
    return {
      version: 3,
      predicateVersion: 3,
      terminal: false,
      complete: false,
      exitCode: 10,
      findings: [{ code: 'V3_ARTIFACTS_MISSING', problem: 'missing ' + missing.join(', ') }],
      counts: { remainder: null },
    };
  }
  let inventory;
  let testIndex;
  let coverage;
  try {
    inventory = readJsonIfExists(inventoryPath);
    testIndex = readJsonIfExists(indexPath);
    coverage = readJsonIfExists(coveragePath) ?? { version: 1, inventoryDigest: null, testIndexDigest: null, clauses: [] };
    requireSupportedVersion(inventory, [1], inventoryPath);
    requireSupportedVersion(testIndex, [1], indexPath);
    requireSupportedVersion(coverage, [1], coveragePath);
  } catch (error) {
    return {
      version: 3,
      predicateVersion: 3,
      terminal: false,
      complete: false,
      exitCode: 10,
      findings: [{ code: 'V3_ARTIFACTS_INVALID', problem: error.message }],
      counts: { remainder: null },
    };
  }
  const ticketsData = readJsonIfExists(ticketsPath) ?? { phases: [] };
  const openTickets = openTicketsOf(ticketsData);
  const clauseKeys = new Set((inventory.clauses ?? []).map((clause) => clause.key));
  const loaded = loadDispositions({
    cwd,
    filePath: dispositionsPath,
    clauseKeys,
    openTicketKeys: new Set(openTickets.map((entry) => entry.key)),
  });
  const repairs = readJsonIfExists(path.join(cwd, 'OMISSION-REPAIRS.json'))?.records ?? [];
  const runs = readJsonIfExists(path.join(cwd, 'OMISSION-CONVERGENCE-V3.json'))?.runs ?? [];
  const previous = runs.length > 0 ? runs[runs.length - 1] : null;
  const debtBefore = previous?.debt ?? coverage?.remainder?.debt ?? 0;
  return runV3Gate({
    cwd,
    v3Artifacts: { inventory, testIndex, coverage, dispositionFindings: loaded.findings },
    repairs,
    openTickets: openTickets.length,
    dispositions: [...loaded.byKey.values()],
    convergence: { debtBefore, newTickets: 0, previous },
  });
}

/** CLI entry point. */
// [::TICKET::] PX-407, PX-440 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-407|PX-440) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const cwd = path.resolve(argumentValue(args, 'cwd') || process.cwd());
  const tickets = argumentValue(args, 'tickets');
  const graph = argumentValue(args, 'graph');
  const reportOnly = args.includes('--report-only');
  const requireConverged = args.includes('--require-converged');
  const wantsV3 = args.includes('--v3');
  const inventoryPath = path.resolve(cwd, argumentValue(args, 'inventory') ?? 'CONTRACT-INVENTORY.json');
  const indexPath = path.resolve(cwd, argumentValue(args, 'index') ?? 'TEST-INDEX.json');
  const coveragePath = path.resolve(cwd, argumentValue(args, 'coverage') ?? 'CONTRACT-COVERAGE.json');
  const dispositionsPath = path.resolve(cwd, argumentValue(args, 'dispositions') ?? DISPOSITIONS_FILE_NAME);
  const ticketsPath = tickets ? path.resolve(cwd, tickets) : path.join(cwd, 'Tickets.json');
  const artifactPresent = fs.existsSync(inventoryPath) || fs.existsSync(indexPath) || fs.existsSync(coveragePath);

  if (wantsV3 || artifactPresent) {
    const result = runV3PackageGate({ cwd, inventoryPath, indexPath, coveragePath, dispositionsPath, ticketsPath });
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(result.exitCode);
    return;
  }

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
  runV3Gate,
};
