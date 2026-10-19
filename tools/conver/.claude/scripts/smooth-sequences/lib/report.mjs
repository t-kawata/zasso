/**
 * Render and write the detector's two reports.
 *
 * JSON is the complete record; Markdown is a human view with a declared cap. The cap is
 * stated rather than silent: a truncated list that says nothing is indistinguishable
 * from a complete one, which is the failure the "…and N more" line exists to prevent.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const EXIT_PASS = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_MISUSE = 2;
export const MAX_MARKDOWN_FINDINGS = 200;
export const JSON_FILE_NAME = 'SMOOTH-SEQUENCES.json';
export const MARKDOWN_FILE_NAME = 'SMOOTH-SEQUENCES.md';

const FINDING_CLASSES = Object.freeze(['omission', 'contradiction', 'deficiency', 'danger']);

/** The stable order every report uses. */
// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
function compareFindings(left, right) {
  return `${left.checkId}\u0000${left.subject}`.localeCompare(`${right.checkId}\u0000${right.subject}`);
}

/**
 * Assemble the report value.
 *
 * @param {{ workspace: object, findings: Array<object>, withheld: Array<object>,
 *   checks: { run: number, failed: number } }} input
 * @returns {object}
 */
export function buildReport({ workspace, findings, withheld, checks }) {
  const sorted = [...findings].sort(compareFindings);
  const findingsByClass = Object.fromEntries(FINDING_CLASSES.map((name) => [name, 0]));
  for (const finding of sorted) {
    if (findingsByClass[finding.class] === undefined) findingsByClass[finding.class] = 0;
    findingsByClass[finding.class] += 1;
  }
  return {
    schemaVersion: 1,
    workspace: workspace.root,
    checks,
    withheld,
    findingsByClass,
    findings: sorted,
  };
}

/** Render the complete JSON report. */
export function renderReportJson(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** Render the capped Markdown report. */
export function renderReportMarkdown(report, { limit = MAX_MARKDOWN_FINDINGS } = {}) {
  const lines = [
    '# Smooth Sequences',
    '',
    `workspace: ${report.workspace}`,
    `checks: run=${report.checks.run} failed=${report.checks.failed}`,
    `withheld: ${report.withheld.length === 0 ? 'none' : report.withheld.map((entry) => `${entry.layer} (${entry.reason})`).join(', ')}`,
    `findings: ${report.findingsByClass.omission} omission, ${report.findingsByClass.contradiction} contradiction, ${report.findingsByClass.deficiency} deficiency, ${report.findingsByClass.danger} danger`,
    '',
    '## Findings',
    '',
  ];
  const shown = report.findings.slice(0, limit);
  for (const finding of shown) {
    lines.push(`- \`${finding.checkId}\` ${finding.subject} — ${finding.reason}${finding.repair ? ` (repair: ${finding.repair})` : ''}`);
  }
  if (report.findings.length > shown.length) {
    lines.push('', `…and ${report.findings.length - shown.length} more findings (see ${JSON_FILE_NAME})`);
  }
  lines.push('', 'does not guarantee: whether the enumeration is complete relative to the world; semantic prose equivalence remains a judgment.', '');
  return lines.join('\n');
}

/**
 * Write both reports into a directory.
 *
 * @param {{ report: object, outputDirectory: string }} input
 * @returns {{ jsonPath: string, markdownPath: string }}
 */
export function writeReport({ report, outputDirectory }) {
  const jsonPath = join(outputDirectory, JSON_FILE_NAME);
  const markdownPath = join(outputDirectory, MARKDOWN_FILE_NAME);
  writeFileSync(jsonPath, renderReportJson(report));
  writeFileSync(markdownPath, renderReportMarkdown(report));
  return { jsonPath, markdownPath };
}
