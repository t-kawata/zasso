'use strict';

/**
 * /amend-rfc-up verification.
 *
 * Two gates: the amendment chain (`verify-amendment.js`) and the cross-artifact
 * chain (`drill-rfc-down/verify-step.js`). Convergence means zero new findings
 * twice with the same digest.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const CONVERGENCE_RUNS = 2;
const VERIFY_AMENDMENT_PATH = path.resolve(__dirname, '../tickets/verify-amendment.js');
const VERIFY_STEP_PATH = path.resolve(__dirname, '../drill-rfc-down/verify-step.js');
const DRILL_REPORT_FILENAME = 'DRILL-REPORT.json';
const IMPACT_READ_FILES = Object.freeze(['RFC.md', 'RFC-GRAPH.json', 'RFC-Dirs-Tree.json', 'Tickets.json']);

// [::TICKET::] PX-417 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-417 --for-spec --no-implementation-order`.
function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

// [::TICKET::] PX-417 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-417 --for-spec --no-implementation-order`.
function defaultRunner({ scriptPath, args, cwd }) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// [::TICKET::] PX-417 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-417 --for-spec --no-implementation-order`.
function parseJsonOutput(result, code) {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw fail(code, `output is not JSON: ${error.message}`, { stdout: result.stdout });
  }
}

/** A stable digest that ignores the run timestamp but keeps every finding. */
function stableDigest(value) {
  const clone = JSON.parse(JSON.stringify(value || {}));
  delete clone.generatedAt;
  return createHash('sha256').update(JSON.stringify(clone)).digest('hex');
}

/** The amendment chain report. */
// [::TICKET::] PX-417 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-417 --for-spec --no-implementation-order`.
function runVerifyAmendment({ ticketKey, packageDir, runner = defaultRunner }) {
  const args = [`--ticket-key=${ticketKey}`, `--cwd=${packageDir}`, '--report'];
  const result = runner({ scriptPath: VERIFY_AMENDMENT_PATH, args, cwd: packageDir });
  if (result.status !== 0) {
    throw fail('VERIFY_AMENDMENT_FAILED', `verify-amendment exited ${result.status}`, {
      stderr: result.stderr,
    });
  }
  const report = parseJsonOutput(result, 'VERIFY_AMENDMENT_FAILED');
  const findings = report.findings || [];
  const skipped = report.skipped || [];
  const unverifiable = report.unverifiable || [];
  return {
    findings,
    skipped,
    unverifiable,
    digest: stableDigest({ findings, skipped, unverifiable }),
  };
}

/** The cross-artifact chain report. */
// [::TICKET::] PX-417 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-417 --for-spec --no-implementation-order`.
function runCrossArtifactVerify(input = {}) {
  const {
    rfcPath,
    graphPath,
    dirsTreePath,
    srcDir,
    ticketsPath,
    sessionDir,
    workspaceRoot,
    runner = defaultRunner,
  } = input;
  const args = [
    `--rfc=${rfcPath}`,
    `--graph=${graphPath}`,
    `--dirs-tree=${dirsTreePath}`,
    `--src=${srcDir}`,
    `--tickets=${ticketsPath}`,
    `--session-dir=${sessionDir}`,
    `--workspace=${workspaceRoot}`,
  ];
  const result = runner({ scriptPath: VERIFY_STEP_PATH, args, cwd: path.dirname(rfcPath) });
  const reportPath = path.join(sessionDir, DRILL_REPORT_FILENAME);
  const report = fs.existsSync(reportPath)
    ? JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    : null;
  if (result.status !== 0) {
    return {
      ok: false,
      findings: (report && report.findings) || [{ code: 'VERIFY_BLOCKED', problem: 'verify-step failed' }],
      report,
      digest: report ? stableDigest(report) : null,
    };
  }
  return { ok: true, findings: [], report, digest: report ? stableDigest(report) : null };
}

/** Zero findings twice with the same digest. */
// [::TICKET::] PX-417 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-417 --for-spec --no-implementation-order`.
async function assertConverged({ run, runs = CONVERGENCE_RUNS }) {
  const observations = [];
  for (let index = 0; index < runs; index += 1) {
    observations.push(await run(index));
  }
  const findings = observations.flatMap((observation) => observation.findings || []);
  const digests = observations.map((observation) => observation.digest);
  const sameDigest = digests.every((digest) => digest === digests[0]);
  if (findings.length > 0 || !sameDigest) {
    return {
      ok: false,
      code: 'CONVERGENCE_FAILED',
      runs: observations.length,
      digests,
      findings,
    };
  }
  return { ok: true, runs: observations.length, digest: digests[0] };
}

/** Stable one-line findings for the report. */
// [::TICKET::] PX-417 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-417 --for-spec --no-implementation-order`.
function renderFindings({ findings = [] }) {
  return findings.map((finding) => (
    `${finding.code || 'FINDING'}: ${finding.asset || ''} ${finding.problem || ''}`.trim()
  ));
}

/** Read the text artifacts a cross-package reference may appear in. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function readPackageArtifacts(directory) {
  return IMPACT_READ_FILES
    .map((name) => path.join(directory, name))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => fs.readFileSync(filePath, 'utf8'))
    .join('\n');
}

/** Verify every cross-package impact against the target package's design. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function runWorkspaceVerify({ packages = [], impacts = [] } = {}) {
  const byId = new Map(packages.map((entry) => [entry.id, entry]));
  const findings = [];
  for (const impact of impacts) {
    const source = byId.get(impact.from);
    const target = byId.get(impact.to);
    if (!source) {
      findings.push({ code: 'IMPACT_SOURCE_MISSING', asset: impact.from, problem: 'impact source package is absent' });
      continue;
    }
    if (!target) {
      findings.push({ code: 'IMPACT_TARGET_MISSING', asset: impact.to, problem: 'impact target package is absent' });
      continue;
    }
    const reference = String(impact.reference || '');
    if (reference === '' || !readPackageArtifacts(target.dir).includes(reference)) {
      findings.push({
        code: 'IMPACT_REFERENCE_MISSING',
        asset: `${impact.from} -> ${impact.to}`,
        problem: `reference is not present in the target design: ${reference}`,
      });
    }
  }
  const digest = createHash('sha256').update(JSON.stringify(findings)).digest('hex');
  return { ok: findings.length === 0, findings, digest };
}

// [::TICKET::] PX-417 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-417 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const match = args.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

// [::TICKET::] PX-417 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-417 --for-spec --no-implementation-order`.
function readJsonInput(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const text = value.startsWith('@') ? fs.readFileSync(value.slice(1), 'utf8') : value;
  return JSON.parse(text);
}

// [::TICKET::] PX-417 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-417 --for-spec --no-implementation-order`.
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
async function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  try {
    if (command === 'amendment') {
      const result = runVerifyAmendment({
        ticketKey: argumentValue(argv, 'ticket-key'),
        packageDir: path.resolve(argumentValue(argv, 'package') || process.cwd()),
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return 0;
    }
    if (command === 'cross-artifact') {
      const result = runCrossArtifactVerify({
        rfcPath: argumentValue(argv, 'rfc'),
        graphPath: argumentValue(argv, 'graph'),
        dirsTreePath: argumentValue(argv, 'dirs-tree'),
        srcDir: argumentValue(argv, 'src'),
        ticketsPath: argumentValue(argv, 'tickets'),
        sessionDir: argumentValue(argv, 'session-dir'),
        workspaceRoot: argumentValue(argv, 'workspace'),
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return result.ok ? 0 : 1;
    }
    if (command === 'converge') {
      const first = readJsonInput(argumentValue(argv, 'first'));
      const second = readJsonInput(argumentValue(argv, 'second'));
      const result = await assertConverged({
        run: (index) => (index === 0 ? first : second),
        runs: 2,
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return result.ok ? 0 : 1;
    }
    if (command === 'workspace') {
      const packages = readJsonInput(argumentValue(argv, 'packages')) || [];
      const impactInput = readJsonInput(argumentValue(argv, 'impacts'));
      const impacts = Array.isArray(impactInput) ? impactInput : (impactInput?.crossPackageImpacts || []);
      const result = runWorkspaceVerify({ packages, impacts });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return result.ok ? 0 : 1;
    }
    process.stdout.write(`${JSON.stringify({ code: 'UNKNOWN_SUBCOMMAND', command })}\n`);
    return 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ code: error.code || 'VERIFY_FAILED', message: error.message })}\n`);
    return 1;
  }
}

if (require.main === module) main().then((code) => process.exit(code));

module.exports = {
  CONVERGENCE_RUNS,
  assertConverged,
  renderFindings,
  runCrossArtifactVerify,
  runVerifyAmendment,
  runWorkspaceVerify,
  stableDigest,
};
