/**
 * The per-package drill report, and the only place COMPLETE is written.
 *
 * A Step 5 verdict used to live in stdout and in an operator's memory. That made
 * "complete" a reading rather than a value, and a package could be called complete while a
 * gate had failed. This report turns the verdict into two files: JSON for the machine, a
 * capped Markdown list for the reader. A caller that wants to know whether the package is
 * complete reads this file, never a console line.
 */
import fs from 'node:fs';
import path from 'node:path';

import repairFinding from '../lib/repair-finding.js';

const { createFinding, renderFinding } = repairFinding;

/** The two report files the drill writes into its session directory. */
export const REPORT_JSON = 'DRILL-REPORT.json';
export const REPORT_MARKDOWN = 'DRILL-REPORT.md';

/** The report schema, so a later reader can tell a v1 report from a later one. */
export const REPORT_SCHEMA_VERSION = 1;

/** The states a report may carry. Only COMPLETE is a completion. */
export const REPORT_STATES = Object.freeze({
  COMPLETE: 'COMPLETE',
  REPAIR_NO_PROGRESS: 'REPAIR_NO_PROGRESS',
  BLOCKED_PREREQUISITE: 'BLOCKED_PREREQUISITE',
});

/** The default number of finding blocks the Markdown report prints. */
export const DEFAULT_MARKDOWN_CAP = 50;

/**
 * One finding as the uniform repair record.
 *
 * A high finding is blocking and a low one is advisory; the action and verification are
 * part of the record so a reader never has to invent either.
 *
 * @param {{ severity?: string, code?: string, layer?: string, message: string,
 *   action?: string, verify?: string, formulaId?: string|null, field?: string|null }} finding
 * @param {{ artifact?: string, action?: string, verifyCommand?: string }} context
 * @returns {object}
 */
// [::TICKET::] PX-368 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-368 --for-spec --no-implementation-order`.
// [::TICKET::] PX-368 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-368 --for-spec --no-implementation-order`.
export function toRepairRecord(finding, context = {}) {
  return createFinding({
    severity: finding.severity === 'high' ? 'blocking' : 'advisory',
    code: finding.code ?? 'DRILL_FINDING',
    layer: finding.layer ?? 'drill',
    artifact: context.artifact ?? finding.artifact ?? 'RFC.md',
    formulaId: finding.formulaId ?? null,
    field: finding.field ?? null,
    cause: finding.message,
    action: context.action ?? finding.action
      ?? `repair the ${finding.layer ?? 'drill'} layer named in the cause, then rerun node "$(git rev-parse --show-toplevel)/.claude/scripts/drill-rfc-down/verify-step.js" with the same arguments`,
    verify: context.verifyCommand ?? finding.verify
      ?? 'node "$(git rev-parse --show-toplevel)/.claude/scripts/drill-rfc-down/verify-step.js"',
    route: finding.route ?? 'in-drill',
  });
}

/** The Markdown body for one report, capped so a long failure stays readable. */
export function renderReportMarkdown(report, cap = DEFAULT_MARKDOWN_CAP) {
  const lines = [
    '# Drill Report',
    '',
    `State: **${report.state}**`,
    '',
    `Package: ${report.package}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## P1 gates (blocking)',
    '',
    ...(report.p1.gates.length === 0
      ? ['- none']
      : report.p1.gates.map((gate) => `- ${gate.name}: exit ${gate.exitCode} (${gate.status})`)),
    '',
    '## P1 findings',
    '',
  ];

  const blocking = report.p1.findings;
  for (const finding of blocking.slice(0, cap)) lines.push(renderFinding(finding), '');
  if (blocking.length > cap) lines.push(`...and ${blocking.length - cap} more`, '');

  lines.push('## P2 residue (reported, never blocking)', '');
  if (report.p2.gates.length === 0) lines.push('- not measured');
  else lines.push(...report.p2.gates.map((gate) => `- ${gate.name}: exit ${gate.exitCode} (${gate.status})`));
  lines.push('');

  const advisory = report.p2.findings;
  for (const finding of advisory.slice(0, cap)) lines.push(renderFinding(finding), '');
  if (advisory.length > cap) lines.push(`...and ${advisory.length - cap} more`, '');

  lines.push(`Summary: ${report.summary.blocking} blocking, ${report.summary.advisory} advisory.`);
  return `${lines.join('\n')}\n`;
}

/**
 * Write the report pair and return the state it declares.
 *
 * @param {{ sessionDir: string, packageDir?: string, p1?: object, p2?: object,
 *   markdownCap?: number }} input
 * @returns {{ reportPath: string, markdownPath: string, state: string, report: object }}
 */
export function writeDrillReport(options = {}) {
  const {
    sessionDir,
    packageDir = '',
    p1 = { gates: [], findings: [] },
    p2 = { gates: [], findings: [] },
    markdownCap = DEFAULT_MARKDOWN_CAP,
  } = options;
  const gates = Array.isArray(p1.gates) ? p1.gates : [];
  const artifact = packageDir === '' ? undefined : path.join(packageDir, 'RFC.md');
  const p1Findings = (Array.isArray(p1.findings) ? p1.findings : [])
    .map((finding) => toRepairRecord(finding, { artifact }));
  const blocking = p1Findings.filter((finding) => finding.severity === 'blocking');
  const advisory = (Array.isArray(p2.findings) ? p2.findings : [])
    .map((finding) => toRepairRecord({ ...finding, severity: 'low' }, { artifact }));

  // A low finding is cosmetic; only a high one and a non-zero gate block completion.
  const p1Failed = gates.some((gate) => gate.exitCode !== 0) || blocking.length > 0;
  const state = p1Failed ? REPORT_STATES.REPAIR_NO_PROGRESS : REPORT_STATES.COMPLETE;

  const report = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    package: packageDir,
    state,
    p1: { gates, findings: p1Findings },
    p2: { gates: Array.isArray(p2.gates) ? p2.gates : [], findings: advisory },
    summary: { blocking: blocking.length, advisory: p1Findings.length - blocking.length + advisory.length },
  };

  fs.mkdirSync(sessionDir, { recursive: true });
  const reportPath = path.join(sessionDir, REPORT_JSON);
  const markdownPath = path.join(sessionDir, REPORT_MARKDOWN);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderReportMarkdown(report, markdownCap), 'utf8');
  return { reportPath, markdownPath, state, report };
}
