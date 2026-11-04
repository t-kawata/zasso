#!/usr/bin/env node
/**
 * verify-step.js --rfc=<path> --graph=<path> --dirs-tree=<path> --src=<dir> --tickets=<path>
 *
 * /drill-rfc-down Step 5 verify driver: the final blocking gate.
 *
 * Two scopes, deliberately apart. P1 is the per-package penetration chain and decides the
 * run: verify-consistencies, the formula coverage gate and the formula chain. P2 is the
 * workspace residue; it is recorded and never blocks this package, because a drill must be
 * able to evolve one package while a neighbour is incomplete.
 *
 * The verdict lives in DRILL-REPORT.json/.md. COMPLETE is written only there, and only
 * when every P1 gate exits zero; the session state follows the report.
 *
 * The driver never writes to an artifact outside the session directory.
 *
 * Exit codes: 0 = PASS (every P1 gate zero), 1 = FAIL (a P1 gate non-zero / missing args).
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 5).
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { verifyFormulaChain } from '../sequences-slice/verify-chain.mjs';
import { parseSeedIdentity, resolveWorkspaceRoot } from '../spec-formula/index.mjs';
import repairFinding from '../lib/repair-finding.js';
import recorder from '../lib/run-history-recorder.cjs';
import { REPORT_STATES, writeDrillReport } from './drill-report.js';

const { renderFindings } = repairFinding;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const VERIFY_CONSISTENCIES = path.join(SCRIPT_DIR, 'verify-consistencies.js');
const FORMULA_COVERAGE = path.join(SCRIPT_DIR, 'check-formula-coverage.js');
const UPDATE_STATUS = path.join(SCRIPT_DIR, 'update-status.js');
const SESSION_DIR_NAME = 'drills';
const RFC_SEED_FILENAME = 'RFC-SEED.md';
const STATUS_FILENAME = 'Status.json';

/** The P1 gate names, in the order the report prints them. */
export const P1_GATE_NAMES = Object.freeze(['verify-consistencies', 'check-formula-coverage', 'verifyFormulaChain']);

/** The value of --name=value from argv. */
function argumentFor(args, name) {
  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
  return inline === undefined ? null : inline.slice(`--${name}=`.length);
}

/** The first non-empty line of a program's output. */
// [::TICKET::] PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-368|PX-369) --for-spec --no-implementation-order`.
function firstLine(text) {
  return String(text ?? '').split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? '';
}

/** Resolve the specification the seed names, when the seed is readable. */
// [::TICKET::] PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-368|PX-369) --for-spec --no-implementation-order`.
function resolveSpecification(rfcPath, workspaceRoot, explicit) {
  if (explicit !== null) return explicit;
  if (rfcPath === null || workspaceRoot === null) return null;
  const seedPath = path.join(path.dirname(rfcPath), RFC_SEED_FILENAME);
  if (!existsSync(seedPath)) return null;
  try {
    const seed = parseSeedIdentity(readFileSync(seedPath, 'utf8'));
    return path.resolve(workspaceRoot, seed.sourceSpec.path);
  } catch {
    return null;
  }
}

// [::TICKET::] PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-368|PX-369) --for-spec --no-implementation-order`.
function existsSync(filePath) {
  return fs.existsSync(filePath);
}

// [::TICKET::] PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-368|PX-369) --for-spec --no-implementation-order`.
function readFileSync(filePath, encoding) {
  return fs.readFileSync(filePath, encoding);
}

/** Run verify-consistencies.js and return its parsed result. */
// [::TICKET::] PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-368|PX-369) --for-spec --no-implementation-order`.
function runVerifyConsistencies(args) {
  const res = spawnSync(process.execPath, [VERIFY_CONSISTENCIES, ...args], { encoding: 'utf8' });
  if (res.status !== 0) {
    process.stderr.write(res.stderr || res.stdout);
    return null;
  }
  return JSON.parse(res.stdout);
}

/** Run one P1 program and report its evidence. */
// [::TICKET::] PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-368|PX-369) --for-spec --no-implementation-order`.
function runGate(name, scriptPath, args) {
  const res = spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });
  const exitCode = typeof res.status === 'number' ? res.status : 1;
  return {
    name,
    exitCode,
    status: exitCode === 0 ? 'passed' : 'failed',
    detail: firstLine(res.stdout) || firstLine(res.stderr),
  };
}

/** Render the findings as a Markdown report grouped by severity. */
// [::TICKET::] PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-368|PX-369) --for-spec --no-implementation-order`.
function formatFindingsReport(result) {
  const lines = ['## /drill-rfc-down Step 5 Verify', ''];
  const high = result.findings.filter((f) => f.severity === 'high');
  const low = result.findings.filter((f) => f.severity === 'low');
  lines.push('### High-severity findings (blocking)');
  if (high.length === 0) lines.push('- none');
  else for (const finding of high) lines.push(`- ${finding.message}`);
  lines.push('');
  lines.push('### Low-severity findings (cosmetic)');
  if (low.length === 0) lines.push('- none');
  else for (const finding of low) lines.push(`- ${finding.message}`);
  lines.push('');
  lines.push(`Summary: ${result.summary.high} high, ${result.summary.low} low (${result.summary.total} total).`);
  return lines.join('\n');
}

/** The session directory this run reports into. */
// [::TICKET::] PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-368|PX-369) --for-spec --no-implementation-order`.
function resolveSessionDir(rfcPath) {
  const explicit = argumentFor(process.argv.slice(2), 'session-dir');
  if (explicit !== null) return path.resolve(explicit);
  return path.join(path.dirname(rfcPath), SESSION_DIR_NAME);
}

/** Declare COMPLETE in the session when a session record exists. */
// [::TICKET::] PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-368|PX-369) --for-spec --no-implementation-order`.
function markSessionComplete(sessionDir) {
  if (!fs.existsSync(path.join(sessionDir, STATUS_FILENAME))) return { ok: true, skipped: true };
  const res = spawnSync(process.execPath, [UPDATE_STATUS, sessionDir, 'set-state', REPORT_STATES.COMPLETE], { encoding: 'utf8' });
  return { ok: res.status === 0, detail: firstLine(res.stderr) };
}

/** The P2 workspace gates, when a workspace root was supplied. */
// [::TICKET::] PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-368|PX-369) --for-spec --no-implementation-order`.
function runWorkspaceResidue(workspaceRoot) {
  if (workspaceRoot === null) return { gates: [], findings: [] };
  const shared = path.join(SCRIPT_DIR, '..', 'grill-me-for-rfc');
  const apiConsistency = path.join(SCRIPT_DIR, '..', 'api-consistency', 'verify-api-consistency.mjs');
  return {
    gates: [
      runGate('check-obligation-coverage', path.join(shared, 'check-obligation-coverage.js'), [workspaceRoot]),
      runGate('check-distribution-completeness', path.join(shared, 'check-distribution-completeness.js'), [workspaceRoot]),
      // P2 like the two above: a cross-package disagreement is reported, never allowed
      // to block this package's own COMPLETE.
      runGate('verify-api-consistency', apiConsistency, [`--workspace=${workspaceRoot}`]),
    ],
    findings: [],
  };
}

// [::TICKET::] PX-169, PX-365, PX-368, PX-369 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-169|PX-365|PX-368|PX-369) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const rfcPath = argumentFor(args, 'rfc');
  const graphPath = argumentFor(args, 'graph');
  const dirsPath = argumentFor(args, 'dirs-tree');
  const ticketsPath = argumentFor(args, 'tickets');
  if (rfcPath === null || graphPath === null || dirsPath === null) {
    process.stderr.write('Usage: verify-step.js --rfc=<path> --graph=<path> --dirs-tree=<path> --src=<dir> --tickets=<path>\n');
    process.exit(1);
  }

  const consistency = runVerifyConsistencies(args);
  if (consistency === null) {
    process.exit(1);
  }
  const report = formatFindingsReport(consistency);

  const formulaFindings = [];
  if (existsSync(graphPath) && existsSync(dirsPath)) {
    const workspaceRoot = resolveWorkspaceRoot(path.dirname(rfcPath));
    const specPath = resolveSpecification(rfcPath, workspaceRoot, argumentFor(args, 'spec'));
    const specText = specPath !== null && existsSync(specPath) ? readFileSync(specPath, 'utf8') : null;
    verifyFormulaChain({
      graph: JSON.parse(readFileSync(graphPath, 'utf8')),
      dirsTree: JSON.parse(readFileSync(dirsPath, 'utf8')),
      tickets: ticketsPath !== null && existsSync(ticketsPath) ? JSON.parse(readFileSync(ticketsPath, 'utf8')) : null,
      checkDirs: true,
      checkTickets: ticketsPath !== null && existsSync(ticketsPath),
      graphPath,
      specText,
      specPath,
      findings: formulaFindings,
    });
  }

  if (formulaFindings.length > 0) {
    report += '\n\n### Formula findings (blocking)\n';
    for (const finding of formulaFindings) report += `- ${finding.code}: ${finding.subject ?? ''} ${finding.message}\n`;
  }

  const seedPresent = existsSync(path.join(path.dirname(rfcPath), RFC_SEED_FILENAME));
  const formulaGate = seedPresent
    ? runGate('check-formula-coverage', FORMULA_COVERAGE, [path.dirname(rfcPath)])
    : { name: 'check-formula-coverage', exitCode: 0, status: 'passed', detail: 'no seed; zero owned formulas' };
  const chainGate = {
    name: 'verifyFormulaChain',
    exitCode: formulaFindings.length === 0 ? 0 : 1,
    status: formulaFindings.length === 0 ? 'passed' : 'failed',
    detail: formulaFindings.length === 0 ? 'no formula finding' : firstLine(formulaFindings[0].message),
  };
  const consistencyGate = {
    name: 'verify-consistencies',
    exitCode: consistency.ok ? 0 : 1,
    status: consistency.ok ? 'passed' : 'failed',
    detail: `summary: ${consistency.summary.high} high, ${consistency.summary.low} low`,
  };

  const p1 = { gates: [consistencyGate, formulaGate, chainGate], findings: [...consistency.findings, ...formulaFindings] };
  const p2 = runWorkspaceResidue(argumentFor(args, 'workspace'));
  const sessionDir = resolveSessionDir(rfcPath);
  const written = writeDrillReport({ sessionDir, packageDir: path.dirname(rfcPath), p1, p2 });

  if (written.state === REPORT_STATES.COMPLETE) {
    markSessionComplete(sessionDir);
    process.stdout.write(`${report}\nPASS: every P1 gate exited zero; DRILL-REPORT state ${written.state}.\n`);
    process.exit(0);
  }

  const blockingRecords = written.report.p1.findings.filter((finding) => finding.severity === 'blocking');
  if (blockingRecords.length > 0) {
    process.stderr.write(`${renderFindings(blockingRecords, { cap: blockingRecords.length })}\n`);
  }
  process.stdout.write(`${report}\nFAIL: a P1 gate did not exit zero; DRILL-REPORT state ${written.state}.\n`);
  process.exit(1);
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  process.once('exit', (code) => {
    recorder.recordRunHistory('finish', {
      command: 'drill-rfc-down',
      stage: 'drill',
      status: code === 0 ? 'COMPLETE' : 'REPAIR_NO_PROGRESS',
    });
  });
  main();
}

export { formatFindingsReport, main };
