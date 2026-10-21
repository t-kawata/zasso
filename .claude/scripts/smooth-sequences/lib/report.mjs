/**
 * Render and write the detector's two reports.
 *
 * JSON is the complete record; Markdown and the console are the repair view. Every
 * finding line states where to edit, why it is wrong, what to change and which command
 * re-derives the verdict, so the executing AI repairs without opening the JSON. The cap
 * is stated rather than silent: a truncated list that says nothing is indistinguishable
 * from a complete one.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { formatProvenanceLine, emptyProvenance } from './provenance.mjs';
import { emptyReadings, formatReadingsLine } from './readings-summary.mjs';

export const EXIT_PASS = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_MISUSE = 2;
export const EXIT_JUDGMENT = 3;
export const REPORT_SCHEMA_VERSION = 3;
export const MAX_MARKDOWN_FINDINGS = 200;
export const JSON_FILE_NAME = 'SMOOTH-SEQUENCES.json';
export const MARKDOWN_FILE_NAME = 'SMOOTH-SEQUENCES.md';
export const RUN_DIRECTORY_NAME = 'smooth-sequences';
export const STATUS_FILE_NAME = 'status.json';
export const ARCHIVE_DIRECTORY_NAME = 'archive';

const FINDING_CLASSES = Object.freeze(['omission', 'contradiction', 'deficiency', 'danger']);
const JSON_INDENT = 2;
const ROUTE_SEPARATOR = '\u0000';
const NEXT_FIX = 'next: fix every finding above, then rerun this command. exit 0 only when this block is empty.';

/** The stable order every report uses. */
// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function compareFindings(left, right) {
  return `${left.checkId}\u0000${left.subject}`.localeCompare(`${right.checkId}\u0000${right.subject}`);
}

/** The identity a finding keeps across runs. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function identifyFinding(finding) {
  return `${finding.checkId}${ROUTE_SEPARATOR}${finding.subject}`;
}

/** The identity of the route a finding belongs to. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function identifyRoute(finding) {
  return `${finding.where}${ROUTE_SEPARATOR}${finding.producer}`;
}

/**
 * Mark the findings that survived the previous run.
 *
 * A persisted finding means the last repair did not address it; the loop uses that
 * signal to stop repeating an edit that changed nothing.
 */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
export function annotatePersisted(findings, previousReport) {
  const previous = new Set((previousReport?.findings ?? []).map((finding) => identifyFinding(finding)));
  return findings.map((finding) => ({
    ...finding,
    persisted: previous.has(identifyFinding(finding)),
  }));
}

/** The run directory a workspace root keeps its report generations in. */
export function runDirectoryFor(root) {
  return join(root, RUN_DIRECTORY_NAME);
}

/** The generation record inside the run directory. */
export function statusPathFor(root) {
  return join(runDirectoryFor(root), STATUS_FILE_NAME);
}

/** The generation report, or null when it is absent or unreadable. */
// [::TICKET::] PX-281 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-281 --for-spec --no-implementation-order`.
export function readGenerationReport(root) {
  const path = join(runDirectoryFor(root), JSON_FILE_NAME);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The previous report, or null when no readable one exists.
 *
 * The generation report wins over the legacy root report. An unreadable generation
 * report is not replaced by the legacy report: mixing two histories would report
 * persisted against a pass that never saw the current workspace.
 */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
// [::TICKET::] PX-281 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-281 --for-spec --no-implementation-order`.
export function readPreviousReport(root) {
  const generationPath = join(runDirectoryFor(root), JSON_FILE_NAME);
  if (existsSync(generationPath)) return readGenerationReport(root);
  const legacyPath = join(root, JSON_FILE_NAME);
  if (!existsSync(legacyPath)) return null;
  try {
    return JSON.parse(readFileSync(legacyPath, 'utf8'));
  } catch {
    return null;
  }
}

/** The denominator a report carries when no axis was measured. */
export function emptyDenominator() {
  return { operations: null, sequences: null, boundaries: null, surfaces: null };
}

/** Normalize a checks record so older callers keep working. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function normalizeChecks(checks = {}) {
  return {
    families: checks.families ?? 7,
    run: checks.run ?? 0,
    skipped: checks.skipped ?? 0,
    failed: checks.failed ?? 0,
    subChecks: checks.subChecks ?? [],
  };
}

/**
 * Assemble the report value.
 *
 * @param {{ workspace: object, findings: Array<object>, withheld: Array<object>,
 *   checks: { run: number, failed: number, families?: number, skipped?: number, subChecks?: Array<object> },
 *   provenance?: object, readings?: object, denominator?: object,
 *   verdict?: string, wouldExit?: number|null }} input
 * @returns {object}
 */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
// [::TICKET::] PX-283 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-283 --for-spec --no-implementation-order`.
export function buildReport(input) {
  const { workspace, findings, withheld, checks, provenance, readings, denominator, verdict, wouldExit } = input;
  const sorted = [...findings]
    .map((finding) => ({ ...finding, persisted: finding.persisted ?? false, repairClass: finding.repairClass ?? 'in-place' }))
    .sort(compareFindings);
  const findingsByClass = Object.fromEntries(FINDING_CLASSES.map((name) => [name, 0]));
  for (const finding of sorted) {
    if (findingsByClass[finding.class] === undefined) findingsByClass[finding.class] = 0;
    findingsByClass[finding.class] += 1;
  }
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    workspace: workspace.root,
    checks: normalizeChecks(checks),
    provenance: provenance ?? emptyProvenance(),
    readings: readings ?? emptyReadings(),
    denominator: denominator ?? emptyDenominator(),
    verdict: verdict ?? (sorted.length === 0 ? 'pass' : 'findings'),
    wouldExit: wouldExit ?? null,
    withheld,
    findingsByClass,
    findings: sorted,
  };
}

/** One finding as the reader repairs it: where, why, fix, producer. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
export function renderFindingLine(finding) {
  const persisted = finding.persisted ? ' | persisted' : '';
  return `  ${finding.checkId} ${finding.subject} | why: ${finding.why} | fix: ${finding.fix}${persisted}`;
}

/** The findings grouped under the surface and producer that repair them. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
export function renderRouteBlock(findings) {
  const groups = new Map();
  for (const finding of findings) {
    const key = identifyRoute(finding);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(finding);
  }
  const lines = [];
  for (const entries of groups.values()) {
    const { where, producer } = entries[0];
    lines.push(`route: ${where} | rerun: ${producer}`);
    for (const finding of entries) lines.push(renderFindingLine(finding));
  }
  return lines;
}

/** The withheld surfaces as one telegraphic phrase. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function withheldPhrase(withheld) {
  return withheld.map((entry) => `${entry.layer}${entry.check ? `:${entry.check}` : ''} (${entry.reason})`).join(', ');
}

/** The verdict line a run with no findings ends at. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function passVerdict(withheld) {
  if (withheld.length === 0) return 'next: none. verdict: pass.';
  const surface = withheld.length === 1 ? 'surface' : 'surfaces';
  return `next: none. verdict: pass with ${withheld.length} unproven ${surface}.`;
}

/** The verdict line an audit run ends at. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function auditVerdict(report) {
  return `next: none. verdict: audit; wouldExit: ${report.wouldExit ?? 0}.`;
}

/** The lines every console block opens with after its finding count. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
function summaryLines(report) {
  const lines = [
    `provenance: ${formatProvenanceLine(report.provenance)}`,
    `readings: ${formatReadingsLine(report.readings)}`,
  ];
  if (report.checks.skipped > 0) {
    lines.push(`checks: run=${report.checks.run} skipped=${report.checks.skipped} failed=${report.checks.failed} families=${report.checks.families}`);
  }
  return lines;
}

/**
 * The console block a run writes.
 *
 * Exit 1 is an input to the repair loop, never a completion: the block ends by naming
 * the only action that clears it.
 */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
// [::TICKET::] PX-283 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-283 --for-spec --no-implementation-order`.
export function renderConsoleReport(report, { jsonPath } = {}) {
  const suffix = jsonPath === undefined ? '' : `; ${jsonPath}`;
  if (report.findings.length === 0) {
    const lines = [`smooth-sequences: 0 finding(s)${suffix}`, ...summaryLines(report)];
    if (report.withheld.length > 0) lines.push(`withheld: ${withheldPhrase(report.withheld)} — not proved`);
    lines.push(report.verdict === 'audit' ? auditVerdict(report) : passVerdict(report.withheld));
    return lines;
  }
  const routeCount = new Set(report.findings.map((finding) => identifyRoute(finding))).size;
  return [
    `smooth-sequences: ${report.findings.length} finding(s) in ${routeCount} repair route(s)${suffix}`,
    ...summaryLines(report),
    ...renderRouteBlock(report.findings),
    report.verdict === 'audit' ? auditVerdict(report) : NEXT_FIX,
  ];
}

/** Render the complete JSON report. */
export function renderReportJson(report) {
  return `${JSON.stringify(report, null, JSON_INDENT)}\n`;
}

/** Render the capped Markdown report. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
export function renderReportMarkdown(report, { limit = MAX_MARKDOWN_FINDINGS } = {}) {
  const header = [
    '# Smooth Sequences',
    '',
    `workspace: ${report.workspace}`,
    `checks: run=${report.checks.run} skipped=${report.checks.skipped} failed=${report.checks.failed} families=${report.checks.families}`,
    `provenance: ${formatProvenanceLine(report.provenance)}`,
    `readings: ${formatReadingsLine(report.readings)}`,
    `denominator: operations=${report.denominator.operations ?? 'unknown'} sequences=${report.denominator.sequences ?? 'unknown'} boundaries=${report.denominator.boundaries ?? 'unknown'} surfaces=${report.denominator.surfaces ?? 'unknown'}`,
    `withheld: ${report.withheld.length === 0 ? 'none' : withheldPhrase(report.withheld)}`,
    `findings: ${report.findingsByClass.omission} omission, ${report.findingsByClass.contradiction} contradiction, ${report.findingsByClass.deficiency} deficiency, ${report.findingsByClass.danger} danger`,
  ];
  if (report.wouldExit !== null) header.push(`wouldExit: ${report.wouldExit}`);
  const lines = [...header, '', '## Repair routes', ''];
  const shown = report.findings.slice(0, limit);
  lines.push(...renderRouteBlock(shown));
  if (report.findings.length > shown.length) {
    lines.push('', `…and ${report.findings.length - shown.length} more findings (see ${JSON_FILE_NAME})`);
  }
  lines.push('', 'does not guarantee: whether the enumeration is complete relative to the world; semantic prose equivalence remains a judgment.', '');
  return lines.join('\n');
}

/** Write the JSON and Markdown reports and return both paths. */
export function writeReport({ report, outputDirectory }) {
  const jsonPath = join(outputDirectory, JSON_FILE_NAME);
  const markdownPath = join(outputDirectory, MARKDOWN_FILE_NAME);
  writeFileSync(jsonPath, renderReportJson(report));
  writeFileSync(markdownPath, renderReportMarkdown(report));
  return { jsonPath, markdownPath };
}
