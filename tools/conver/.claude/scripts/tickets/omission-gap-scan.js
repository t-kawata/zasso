'use strict';

/**
 * PX-407 — the deterministic omission gap scan.
 *
 * The scan enumerates the finite surface set from the artifacts, runs every
 * registered mechanical detector through its real runner, and normalizes the
 * findings into one envelope. A blocked runner is a measurement state, never a
 * must-fix finding and never a clean run.
 */

const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  enumerateSurfaceReport,
  evaluateCoverage,
  judgmentObligations,
  loadRegistry,
  readJsonIfPresent,
  ticketKeyOf,
} = require('./lib/omission-detectors.js');
const { classifyFinding, stableFindingKey, diffAgainstBaseline } = require('./lib/omission-convergence.js');
const { createLedger, judgeCoverage, mergeObligations, readLedger, writeLedger } = require('./lib/judgment-ledger.js');

const DETECTOR_FAILED = 'DETECTOR_FAILED';
const DEFAULT_SEVERITY = 'high';
const RUNNER_STATUS = Object.freeze({ MEASURED: 'measured', NOT_MEASURED: 'notMeasured', BLOCKED: 'blocked' });

/** Read `--name=value` from the argument list. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

/** The ticket key an asset id exposes, or null. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function inferTicketKey(assetId) {
  if (typeof assetId !== 'string') return null;
  const match = assetId.match(/^((?:P\d+|PX)-\d+)(?:\/|$)/);
  return match ? match[1] : null;
}

/**
 * The normative source a surface can cite.
 *
 * A source exists only when the asset names a canon record. A detector id, a
 * danger observation or a failed runner has no source and becomes backlog.
 */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function deriveNormativeSource(surface, assetId, ticketKey) {
  if (surface === 'contract') {
    const parts = String(assetId).split('/');
    return 'contract:' + (parts.length >= 2 ? parts[1] : assetId);
  }
  if (surface === 'acceptance') return 'acceptance:' + assetId;
  if (surface === 'formula') return 'formula:' + assetId;
  if (surface === 'ticket' || surface === 'unit' || surface === 'operation') {
    const owner = ticketKey ?? inferTicketKey(assetId);
    return owner ? 'tickets:' + owner : null;
  }
  if (surface === 'boundary' || surface === 'sequence-step') return 'design:' + assetId;
  if (surface === 'file') return 'source:' + assetId;
  if (surface === 'stub') return 'stub:' + assetId;
  if (surface === 'graph-node' || surface === 'graph-edge') return /^N\d{4}/.test(assetId) || assetId.includes('->') ? 'design:' + assetId : null;
  if (surface === 'dirs-tree') return 'design:' + assetId;
  return null;
}

/** Normalize one detector finding into the shared envelope. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function normalizeFinding(detector, rawFinding) {
  const surface = detector.findingSurfaces?.[rawFinding.code] ?? rawFinding.surface ?? detector.surfaces?.[0] ?? 'unknown';
  const assetId = rawFinding.assetId ?? rawFinding.asset ?? rawFinding.subject ?? rawFinding.file ?? 'unknown';
  const criterion = rawFinding.criterion ?? detector.criterion ?? detector.id;
  const ticketKey = rawFinding.ticketKey ?? inferTicketKey(assetId);
  const normativeSource = rawFinding.normativeSource ?? deriveNormativeSource(surface, assetId, ticketKey);
  const finding = {
    stableKey: stableFindingKey({ surface, assetId, criterion }),
    surface,
    assetId,
    criterion,
    code: rawFinding.code ?? detector.findingCodes?.[0] ?? detector.id,
    problem: rawFinding.problem ?? rawFinding.message ?? 'detector reported a finding',
    severity: rawFinding.severity ?? DEFAULT_SEVERITY,
    ticketKey,
    normativeSource,
    repair: rawFinding.repair ?? detector.repair ?? null,
  };
  finding.class = classifyFinding(finding);
  return finding;
}

/** The minimum ticket shape add-omission-ticket.js accepts. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function toOmissionTicket(finding) {
  return {
    title: finding.code + ': ' + finding.assetId,
    background: 'Detected by ' + finding.code + ' on the ' + finding.surface + ' surface ' + finding.assetId + '.',
    scope: [finding.surface + ':' + finding.assetId],
    testUnit: ['UT: ' + finding.problem],
    acceptanceCriteria: ['the ' + finding.code + ' finding no longer reproduces'],
    invariants: 'the stable finding key ' + finding.stableKey + ' is absent on the next scan',
    originalTicketKey: finding.ticketKey,
    omissionStableKey: finding.stableKey,
  };
}

/** The tickets a per-ticket detector must run against. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function ticketKeys(ticketsPath) {
  const document = readJsonIfPresent(ticketsPath);
  const keys = [];
  for (const phase of document?.phases ?? []) {
    for (const ticket of phase.tickets ?? []) keys.push(ticketKeyOf({ ...ticket, phaseId: ticket.phaseId ?? phase.id }));
  }
  return keys;
}

/** The files a per-file detector must run against, grouped by ticket. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function ticketFiles(ticketsPath) {
  const document = readJsonIfPresent(ticketsPath);
  const rows = [];
  for (const phase of document?.phases ?? []) {
    for (const ticket of phase.tickets ?? []) {
      const key = ticketKeyOf({ ...ticket, phaseId: ticket.phaseId ?? phase.id });
      const files = (ticket.default_files ?? []).filter((file) => typeof file === 'string' && file.length > 0);
      if (files.length > 0) rows.push({ ticketKey: key, files });
    }
  }
  return rows;
}

/** Replace the placeholders a detector runner declares. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function replacePlaceholders(args, values) {
  return args.map((argument) => argument.replace(/\$\{(\w+)\}/g, (match, name) => values[name] ?? match));
}

/** Flatten a quality report into findings. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function qualityFindings(parsed) {
  const findings = [];
  for (const [name, check] of Object.entries(parsed?.checks ?? {})) {
    for (const finding of check.findings ?? []) {
      findings.push({
        code: 'QUALITY_DANGER',
        surface: 'danger',
        assetId: finding.file + ':' + finding.line,
        problem: name + ': ' + finding.match,
        severity: check.severity ?? DEFAULT_SEVERITY,
      });
    }
  }
  return findings;
}

/** The file path relative to the package root, when it is absolute. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function relativeFile(file, cwd) {
  return typeof file === 'string' && path.isAbsolute(file) ? path.relative(cwd, file) : file;
}

/** Convert a detector's stdout into raw findings. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function parsedFindings(detector, parsed, status, fallbackProblem, cwd) {
  const output = detector.runner?.output ?? 'json-findings';
  if (output === 'quality-report') return qualityFindings(parsed);
  if (output === 'stub-findings') {
    return (parsed?.stubs ?? [])
      .filter((stub) => /MUST RESOLVE|PX-\d+/.test(String(stub.content ?? '')))
      .map((stub) => ({ code: 'STUB_KEY_UNRESOLVABLE', surface: 'stub', assetId: relativeFile(stub.file, cwd) + ':' + stub.line, problem: stub.content }));
  }
  if (Array.isArray(parsed?.findings)) return parsed.findings;
  if (Array.isArray(parsed?.errors)) {
    return parsed.errors.map((problem) => ({ code: detector.findingCodes?.[0] ?? DETECTOR_FAILED, assetId: detector.id, problem: String(problem) }));
  }
  if (Array.isArray(parsed?.stubs)) {
    return parsed.stubs.map((stub) => ({ code: 'STUB_KEY_UNRESOLVABLE', surface: 'stub', file: relativeFile(stub.file, cwd), line: stub.line, assetId: relativeFile(stub.file, cwd) + ':' + stub.line, problem: stub.content }));
  }
  if (status !== 0) return [{ code: DETECTOR_FAILED, assetId: detector.id, problem: fallbackProblem }];
  return [];
}

/** One blocked measurement, not a finding. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function blockedResult(reason) {
  return { findings: [], status: RUNNER_STATUS.BLOCKED, measured: false, reason };
}

/** Run one mechanical detector over its declared scope. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function runDetector(detector, { cwd, ticketsPath, graphPath = null, reportOnly = false } = {}) {
  const runner = detector.runner;
  if (!runner || typeof runner.script !== 'string') return blockedResult('RUNNER_MISSING');
  const script = path.join(__dirname, '..', runner.script);
  if (!fs.existsSync(script)) return blockedResult('RUNNER_MISSING');
  const argsTemplate = Array.isArray(runner.args) ? runner.args : [];
  const scope = runner.scope ?? (argsTemplate.some((argument) => argument.includes('${ticketKey}')) ? 'ticket' : 'package');
  const artifacts = require('./lib/omission-detectors.js').artifactStatus({ cwd, ticketsPath, graphPath });

  // [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
  function runOnce(values, files = []) {
    const args = replacePlaceholders(argsTemplate, {
      cwd,
      ticketsPath,
      graphPath: graphPath ?? artifacts.paths.graph ?? '',
      rfcPath: artifacts.paths.rfc ?? '',
      dirsTreePath: artifacts.paths.dirsTree ?? '',
      sequencesPath: artifacts.paths.sequences ?? '',
      formulasPath: artifacts.paths.formulas ?? '',
      ticketKey: values.ticketKey ?? '',
    });
    const expanded = [];
    for (const argument of args) {
      if (argument === '${files}') expanded.push(...files);
      else expanded.push(argument);
    }
    let stdout = '';
    let stderr = '';
    let status = 0;
    try {
      stdout = execFileSync(process.execPath, [script, ...expanded], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      status = error.status ?? 1;
      stdout = error.stdout ?? '';
      stderr = error.stderr ?? '';
    }
    const output = runner.output ?? 'json-findings';
    if (output === 'stderr-template') {
      if (status === 0) return { findings: [], status: RUNNER_STATUS.MEASURED };
      const first = stderr.split('\n').find((line) => line.trim().length > 0) ?? '';
      if (first.startsWith('[ERROR]')) {
        const owner = first.match(/Ticket ((?:P\d+|PX)-\d+)/);
        const ticketKey = values.ticketKey ?? (owner ? owner[1] : null);
        return {
          findings: [{ code: detector.findingCodes?.[0] ?? DETECTOR_FAILED, assetId: ticketKey ?? detector.id, ticketKey, problem: first }],
          status: RUNNER_STATUS.MEASURED,
        };
      }
      return blockedResult('RUNNER_EXIT_' + status);
    }
    let parsed = null;
    try {
      parsed = stdout.trim().length > 0 ? JSON.parse(stdout) : null;
    } catch {
      parsed = null;
    }
    const findings = parsedFindings(detector, parsed, status, (stderr || stdout || 'detector exited ' + status).trim().split('\n')[0], cwd);
    const recognized = parsed !== null || findings.length > 0;
    if (!recognized && status !== 0) return blockedResult('RUNNER_EXIT_' + status);
    return { findings, status: RUNNER_STATUS.MEASURED };
  }

  let result = { findings: [], status: RUNNER_STATUS.MEASURED };
  if (scope === 'ticket') {
    for (const key of ticketKeys(ticketsPath)) {
      const current = runOnce({ ticketKey: key });
      if (current.status === RUNNER_STATUS.BLOCKED) return current;
      result.findings.push(...current.findings);
    }
  } else if (scope === 'ticket-files') {
    for (const row of ticketFiles(ticketsPath)) {
      const current = runOnce({ ticketKey: row.ticketKey }, row.files);
      if (current.status === RUNNER_STATUS.BLOCKED) return current;
      result.findings.push(...current.findings);
    }
  } else {
    result = runOnce({ ticketKey: null });
  }
  return { ...result, measured: result.status === RUNNER_STATUS.MEASURED };
}

/** Deduplicate findings by stable key. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function dedupeFindings(findings) {
  const byKey = new Map();
  for (const finding of findings) {
    if (!byKey.has(finding.stableKey)) byKey.set(finding.stableKey, finding);
  }
  return [...byKey.values()].sort((left, right) => left.stableKey.localeCompare(right.stableKey));
}

/** The digest of the measured state. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function digestValue(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Enumerate the stubs the surface universe needs. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function enumerateStubs({ cwd, ticketsPath }) {
  const detector = { id: 'stub-enumerator', kind: 'mechanical', surfaces: ['stub'], runner: { script: 'tickets/review/find-all-stubs.js', args: ['.'], scope: 'package', output: 'json-findings' } };
  const result = runDetector(detector, { cwd, ticketsPath });
  return result.findings
    .filter((finding) => finding.file && finding.line)
    .map((finding) => ({ file: relativeFile(finding.file, cwd), line: finding.line, content: finding.problem }));
}

/** Run the full gap scan. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function runGapScan({ cwd, ticketsPath = null, graphPath = null, registry = null, reportOnly = false } = {}) {
  const loaded = registry ?? loadRegistry({ cwd });
  const ticketsFile = ticketsPath || path.join(cwd, 'Tickets.json');
  const stubs = enumerateStubs({ cwd, ticketsPath: ticketsFile });
  const surfaceReport = enumerateSurfaceReport({ cwd, ticketsPath: ticketsFile, graphPath, stubs });
  const measurements = {};
  const blocked = [];
  const findings = [];

  for (const detector of loaded.detectors) {
    if (detector.kind !== 'mechanical') continue;
    const result = runDetector(detector, { cwd, ticketsPath: ticketsFile, graphPath, reportOnly });
    measurements[detector.id] = result.status;
    if (result.status === RUNNER_STATUS.BLOCKED) blocked.push({ detectorId: detector.id, reason: result.reason });
    for (const raw of result.findings ?? []) findings.push(normalizeFinding(detector, raw));
  }

  const coverage = evaluateCoverage({ registry: loaded, surfaces: surfaceReport.surfaces, measurements, artifacts: surfaceReport.artifacts });
  const obligations = judgmentObligations({ registry: loaded, surfaces: surfaceReport.surfaces });
  const existing = readLedger({ cwd });
  const ledger = existing === null ? createLedger({ obligations }) : mergeObligations(existing, obligations);
  if (!reportOnly) writeLedger({ cwd, ledger });
  const judgments = judgeCoverage(ledger);
  const deduped = dedupeFindings(findings);
  const artifactStates = Object.fromEntries(Object.entries(surfaceReport.artifacts.families).map(([family, state]) => [family, { state: state.state, reason: state.reason }]));
  const digest = digestValue({ surfaces: surfaceReport.surfaces, findings: deduped, artifacts: artifactStates, obligations });

  return {
    version: loaded.version,
    surfaces: surfaceReport.surfaces,
    artifacts: surfaceReport.artifacts,
    findings: deduped,
    obligations,
    measured: coverage.measured,
    notMeasured: coverage.notMeasured,
    blocked,
    coverage,
    judgments,
    digest,
  };
}

/** The findings this run introduced against a baseline. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function newFindingsSince(report, baseline) {
  return diffAgainstBaseline(baseline, report.findings);
}

/** CLI entry point. */
// [::TICKET::] PX-407 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-407 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const cwd = path.resolve(argumentValue(args, 'cwd') || process.cwd());
  const tickets = argumentValue(args, 'tickets');
  const graph = argumentValue(args, 'graph');
  const out = argumentValue(args, 'out');
  const reportOnly = args.includes('--report-only');
  const report = runGapScan({
    cwd,
    ticketsPath: tickets ? path.resolve(cwd, tickets) : null,
    graphPath: graph ? path.resolve(cwd, graph) : null,
    reportOnly,
  });
  if (out && !reportOnly) {
    fs.writeFileSync(path.resolve(cwd, out), JSON.stringify(report, null, 2) + '\n');
  }
  process.stdout.write(JSON.stringify(report) + '\n');
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  DETECTOR_FAILED,
  RUNNER_STATUS,
  dedupeFindings,
  deriveNormativeSource,
  inferTicketKey,
  newFindingsSince,
  normalizeFinding,
  runDetector,
  runGapScan,
  toOmissionTicket,
};
