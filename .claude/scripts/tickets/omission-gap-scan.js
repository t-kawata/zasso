'use strict';

/**
 * PX-406 — the deterministic omission gap scan.
 *
 * The scan enumerates the finite surface set from the artifacts, runs every
 * registered mechanical detector, and normalizes the findings into one envelope.
 * It never decides that a missing measurement is clean.
 */

const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  enumerateSurfaces,
  evaluateCoverage,
  loadRegistry,
  readJsonIfPresent,
  ticketKeyOf,
} = require('./lib/omission-detectors.js');
const { classifyFinding, stableFindingKey } = require('./lib/omission-convergence.js');
const { judgeCoverage, readLedger } = require('./lib/judgment-ledger.js');

const DETECTOR_FAILED = 'DETECTOR_FAILED';
const DEFAULT_SEVERITY = 'high';

/** Read `--name=value` from the argument list. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = '--' + name + '=';
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

/** The normative source a surface can cite without the detector inventing one. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function deriveNormativeSource(surface, assetId, ticketKey) {
  if (surface === 'contract') return 'contract:' + assetId;
  if (surface === 'acceptance') return 'acceptance:' + assetId;
  if (surface === 'formula') return 'formula:' + assetId;
  if (['unit', 'operation', 'boundary', 'sequence-step'].includes(surface)) return 'tickets:' + (ticketKey ?? assetId);
  if (surface === 'file' || surface === 'stub') return 'source:' + assetId;
  if (['graph-node', 'graph-edge', 'dirs-tree'].includes(surface)) return 'design:' + assetId;
  return null;
}

/** Normalize one detector finding into the shared envelope. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function normalizeFinding(detector, rawFinding) {
  const surface = rawFinding.surface ?? detector.surfaces?.[0] ?? 'unknown';
  const assetId = rawFinding.assetId ?? rawFinding.asset ?? rawFinding.subject ?? rawFinding.file ?? 'unknown';
  const criterion = rawFinding.criterion ?? detector.criterion ?? detector.id;
  const ticketKey = rawFinding.ticketKey ?? null;
  const normativeSource = rawFinding.normativeSource ?? deriveNormativeSource(surface, assetId, ticketKey);
  const stableKey = stableFindingKey({ surface, assetId, criterion });
  const finding = {
    stableKey,
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
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function toOmissionTicket(finding) {
  return {
    title: finding.code + ': ' + finding.assetId,
    background: 'Detected by ' + finding.code + ' on the ' + finding.surface + ' surface ' + finding.assetId + '.',
    scope: [finding.surface + ':' + finding.assetId],
    testUnit: ['UT: ' + finding.problem],
    acceptanceCriteria: ['the ' + finding.code + ' finding no longer reproduces'],
    invariants: 'the stable finding key ' + finding.stableKey + ' is absent on the next scan',
  };
}

/** The tickets a per-ticket detector must run against. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js` --ticket-key=PX-406 --for-spec --no-implementation-order`.
function ticketKeys(ticketsPath) {
  const document = readJsonIfPresent(ticketsPath);
  const keys = [];
  for (const phase of document?.phases ?? []) {
    for (const ticket of phase.tickets ?? []) keys.push(ticketKeyOf({ ...ticket, phaseId: ticket.phaseId ?? phase.id }));
  }
  return keys;
}

/** Replace the placeholders a detector runner declares. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function replacePlaceholders(args, values) {
  return args.map((argument) => argument.replace(/\$\{(\w+)\}/g, (match, name) => values[name] ?? match));
}

/** Convert a detector's stdout into raw findings. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function parsedFindings(detector, parsed, status, fallbackProblem) {
  if (Array.isArray(parsed?.findings)) return parsed.findings;
  if (Array.isArray(parsed?.errors)) {
    return parsed.errors.map((problem) => ({ code: detector.findingCodes?.[0] ?? DETECTOR_FAILED, assetId: detector.id, problem: String(problem) }));
  }
  if (Array.isArray(parsed?.stubs)) {
    return parsed.stubs.map((stub) => ({
      code: 'STUB_KEY_UNRESOLVABLE',
      surface: 'stub',
      assetId: stub.file + ':' + stub.line,
      problem: stub.content,
    }));
  }
  if (status !== 0) return [{ code: DETECTOR_FAILED, assetId: detector.id, problem: fallbackProblem }];
  return [];
}

/** Run one mechanical detector, iterating tickets only when its args ask for one. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function runDetector(detector, { cwd, ticketsPath }) {
  const runner = detector.runner;
  if (!runner || typeof runner.script !== 'string') return { findings: [], measured: false };
  const script = path.join(__dirname, '..', runner.script);
  const argsTemplate = Array.isArray(runner.args) ? runner.args : [];
  const perTicket = argsTemplate.some((argument) => argument.includes('${ticketKey}'));

// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
  function runOnce(ticketKey = null) {
    const args = replacePlaceholders(argsTemplate, { cwd, ticketsPath, ticketKey: ticketKey ?? '', files: '' });
    let stdout = '';
    let stderr = '';
    let status = 0;
    try {
      stdout = execFileSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      status = error.status ?? 1;
      stdout = error.stdout ?? '';
      stderr = error.stderr ?? '';
    }
    let parsed = null;
    try {
      parsed = stdout.trim().length > 0 ? JSON.parse(stdout) : null;
    } catch {
      parsed = null;
    }
    return parsedFindings(detector, parsed, status, (stderr || stdout || 'detector exited ' + status).trim().split('\n')[0]);
  }

  const findings = perTicket
    ? ticketKeys(ticketsPath).flatMap((key) => runOnce(key))
    : runOnce();
  return { findings, measured: true };
}

/** Deduplicate findings by stable key. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function dedupeFindings(findings) {
  const byKey = new Map();
  for (const finding of findings) {
    if (!byKey.has(finding.stableKey)) byKey.set(finding.stableKey, finding);
  }
  return [...byKey.values()].sort((left, right) => left.stableKey.localeCompare(right.stableKey));
}

/** The digest of the measured state. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function digestValue(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Run the full gap scan. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function runGapScan({ cwd, ticketsPath = null, registry = null, runners = {} } = {}) {
  const loaded = registry ?? loadRegistry({ cwd });
  const ticketsFile = ticketsPath || path.join(cwd, 'Tickets.json');
  const surfaces = enumerateSurfaces({ cwd, ticketsPath: ticketsFile });
  const measurements = {};
  const findings = [];

  for (const detector of loaded.detectors) {
    if (detector.kind !== 'mechanical') continue;
    const runner = runners[detector.id];
    try {
      const result = typeof runner === 'function'
        ? runner({ cwd, ticketsPath: ticketsFile, detector })
        : runDetector(detector, { cwd, ticketsPath: ticketsFile });
      measurements[detector.id] = result.measured === false ? 'notMeasured' : 'measured';
      for (const raw of result.findings ?? []) findings.push(normalizeFinding(detector, raw));
    } catch {
      measurements[detector.id] = 'blocked';
    }
  }

  const coverage = evaluateCoverage({ registry: loaded, surfaces, measurements });
  const ledger = readLedger({ cwd });
  const judgments = ledger === null
    ? { unrecorded: [], byStatus: {}, recorded: 0, verdict: 'INCOMPLETE' }
    : judgeCoverage(ledger);
  const deduped = dedupeFindings(findings);

  return {
    version: loaded.version,
    surfaces,
    findings: deduped,
    measured: coverage.measured,
    notMeasured: coverage.notMeasured,
    blocked: [],
    coverage,
    judgments,
    digest: digestValue({ surfaces, findings: deduped }),
  };
}

/** CLI entry point. */
// [::TICKET::] PX-406 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-406 --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const cwd = path.resolve(argumentValue(args, 'cwd') || process.cwd());
  const tickets = argumentValue(args, 'tickets');
  const out = argumentValue(args, 'out');
  const report = runGapScan({ cwd, ticketsPath: tickets ? path.resolve(cwd, tickets) : null });
  if (out && !args.includes('--report')) {
    fs.writeFileSync(path.resolve(cwd, out), JSON.stringify(report, null, 2) + '\n');
  }
  process.stdout.write(JSON.stringify(report) + '\n');
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  DETECTOR_FAILED,
  dedupeFindings,
  deriveNormativeSource,
  normalizeFinding,
  runDetector,
  runGapScan,
  toOmissionTicket,
};
