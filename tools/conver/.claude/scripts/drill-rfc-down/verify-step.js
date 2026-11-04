#!/usr/bin/env node
/**
 * verify-step.js --rfc=<path> --graph=<path> --dirs-tree=<path> --src=<dir> --tickets=<path>
 *
 * /drill-rfc-down Step 5 verify driver (PX-169): the final blocking gate.
 *
 * Runs verify-consistencies.js, prints the severity-ranked findings, and
 * decides PASS/FAIL:
 *   - exit 1 when any high-severity finding remains → loop back to Step 2
 *   - exit 0 when only low-severity (cosmetic) findings remain → PASS
 *
 * The driver is READ-ONLY: it never writes to any artifact.
 *
 * Exit codes: 0 = PASS, 1 = FAIL (high-severity findings remain / missing args).
 *
 * Design context: tools/conver/README.md — 進化ループ / /drill-rfc-down (Step 5).
 */

import path from 'path';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';
import { verifyFormulaChain } from '../sequences-slice/verify-chain.mjs';
import { parseSeedIdentity, resolveWorkspaceRoot } from '../spec-formula/index.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const VERIFY_CONSISTENCIES = path.join(SCRIPT_DIR, 'verify-consistencies.js');

/** The value of --name=value from argv. */
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function argumentFor(args, name) {
  const inline = args.find((argument) => argument.startsWith(`--${name}=`));
  return inline === undefined ? null : inline.slice(`--${name}=`.length);
}

/** Resolve the specification the seed names, when the seed is readable. */
// [::TICKET::] PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-365 --for-spec --no-implementation-order`.
function resolveSpecification(rfcPath, workspaceRoot, explicit) {
  if (explicit !== null) return explicit;
  if (rfcPath === null || workspaceRoot === null) return null;
  const seedPath = path.join(path.dirname(rfcPath), 'RFC-SEED.md');
  if (!existsSync(seedPath)) return null;
  try {
    const seed = parseSeedIdentity(readFileSync(seedPath, 'utf8'));
    return path.resolve(workspaceRoot, seed.sourceSpec.path);
  } catch {
    return null;
  }
}

/** Run verify-consistencies.js and return the parsed result. */
// [::TICKET::] PX-169 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-169 --for-spec --no-implementation-order`.
function runVerifyConsistencies(args) {
  const res = spawnSync(process.execPath, [VERIFY_CONSISTENCIES, ...args], { encoding: 'utf8' });
  if (res.status !== 0) {
    process.stderr.write(res.stderr || res.stdout);
    process.exit(1);
  }
  return JSON.parse(res.stdout);
}

/** Render the findings as a Markdown report grouped by severity. */
// [::TICKET::] PX-169 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-169 --for-spec --no-implementation-order`.
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

// [::TICKET::] PX-169, PX-365 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-169|PX-365) --for-spec --no-implementation-order`.
function main() {
  const args = process.argv.slice(2);
  const result = runVerifyConsistencies(args);
  const report = formatFindingsReport(result);

  const rfcPath = argumentFor(args, 'rfc');
  const graphPath = argumentFor(args, 'graph');
  const dirsPath = argumentFor(args, 'dirs-tree');
  const ticketsPath = argumentFor(args, 'tickets');
  const formulaFindings = [];
  if (graphPath !== null && dirsPath !== null && existsSync(graphPath) && existsSync(dirsPath)) {
    const workspaceRoot = resolveWorkspaceRoot(rfcPath === null ? path.dirname(graphPath) : path.dirname(rfcPath));
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
  if (result.ok && formulaFindings.length === 0) {
    process.stdout.write(report + '\nPASS: all high-severity consistency findings resolved.\n');
    process.exit(0);
  }
  process.stdout.write(report + '\nFAIL: high-severity findings remain; fix via Step 2/3/4, then re-verify.\n');
  process.exit(1);
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export { formatFindingsReport, main };
