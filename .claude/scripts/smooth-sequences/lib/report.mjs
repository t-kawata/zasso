/**
 * Render and write the detector's two reports.
 *
 * JSON is the complete record; Markdown and the console are the repair view. Every
 * finding line states where to edit, why it is wrong, what to change and which command
 * re-derives the verdict, so the executing AI repairs without opening the JSON. The cap
 * is stated rather than silent: a truncated list that says nothing is indistinguishable
 * from a complete one.
 *
 * Since PX-285 the report also carries the blocked surfaces. A run with no findings but
 * a blocked surface is `unproven`, not `pass`: the reader sees every check that could
 * not measure its evidence, and the verdict line says exit 4.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SmoothSequencesError } from './errors.mjs';
import { CHECK_FAMILY_COUNT } from './check-status.mjs';
import { formatProvenanceLine, emptyProvenance } from './provenance.mjs';
import { emptyReadings, formatReadingsLine, readUnresolvedReadingSubjects } from './readings-summary.mjs';
import { EXIT_FINDINGS, EXIT_JUDGMENT, EXIT_MISUSE, EXIT_PASS, EXIT_UNPROVEN } from './verdict.mjs';

export { EXIT_FINDINGS, EXIT_JUDGMENT, EXIT_MISUSE, EXIT_PASS, EXIT_UNPROVEN };
export const REPORT_SCHEMA_VERSION = 4;
export const MAX_MARKDOWN_FINDINGS = 200;
export const JSON_FILE_NAME = 'SMOOTH-SEQUENCES.json';
export const MARKDOWN_FILE_NAME = 'SMOOTH-SEQUENCES.md';
export const RUN_DIRECTORY_NAME = 'smooth-sequences';
export const STATUS_FILE_NAME = 'status.json';
export const ARCHIVE_DIRECTORY_NAME = 'archive';

const FINDING_CLASSES = Object.freeze(['omission', 'contradiction', 'deficiency', 'danger']);
const JSON_INDENT = 2;
const ROUTE_SEPARATOR = '\u0000';
const NEXT_FIX = 'next: fix every finding above; blocked surfaces must also be restored. exit 0 only when both sets are empty.';

/** The stable order every report uses. */
// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
function compareFindings(left, right) {
  return `${left.checkId}\u0000${left.subject}`.localeCompare(`${right.checkId}\u0000${right.subject}`);
}

/** The identity a finding keeps across runs. */
// [::TICKET::] PX-277, PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-277|PX-285) --for-spec --no-implementation-order`.
function computeFindingKey(finding) {
  return `${finding.checkId}${ROUTE_SEPARATOR}${finding.subject}`;
}

/** The identity of the route a finding belongs to. */
// [::TICKET::] PX-277, PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-277|PX-285) --for-spec --no-implementation-order`.
function computeRouteKey(finding) {
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
  const previous = new Set((previousReport?.findings ?? []).map((finding) => computeFindingKey(finding)));
  return findings.map((finding) => ({
    ...finding,
    persisted: previous.has(computeFindingKey(finding)),
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

/** Refuse a report that exists but cannot be read. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function readReportFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new SmoothSequencesError(`${path} is not valid JSON`, {
      code: 'UNREADABLE_REPORT',
      path,
      repair: `Repair or remove ${path}; the detector refuses to treat a corrupt history as a fresh one.`,
    });
  }
}

/** The generation report, or null when it is absent. */
// [::TICKET::] PX-281 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-281 --for-spec --no-implementation-order`.
export function readGenerationReport(root) {
  const path = join(runDirectoryFor(root), JSON_FILE_NAME);
  return existsSync(path) ? readReportFile(path) : null;
}

/**
 * The previous report, or null when no readable one exists.
 *
 * The generation report wins over the legacy root report. An unreadable generation
 * report is a named refusal: mixing it with the legacy report would report persisted
 * against a pass that never saw the current workspace.
 */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
// [::TICKET::] PX-281 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-281 --for-spec --no-implementation-order`.
export function readPreviousReport(root) {
  const generationPath = join(runDirectoryFor(root), JSON_FILE_NAME);
  if (existsSync(generationPath)) return readReportFile(generationPath);
  const legacyPath = join(root, JSON_FILE_NAME);
  return existsSync(legacyPath) ? readReportFile(legacyPath) : null;
}

/**
 * The most recent report that carried findings, current or archived.
 *
 * A later pass can reach zero findings by removing the evidence. Comparing only with
 * the current report would call that a resolution. The baseline therefore walks back
 * to the last generation that actually named a finding; a finding absent from the
 * current evaluation is then either resolved or withdrawn, never silently dropped.
 *
 * @param {string} root — workspace root
 * @returns {object|null} the baseline report
 */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
export function readFindingBaseline(root) {
  const current = readPreviousReport(root);
  if ((current?.findings ?? []).length > 0) return current;
  const archiveDirectory = join(runDirectoryFor(root), ARCHIVE_DIRECTORY_NAME);
  if (existsSync(archiveDirectory)) {
    const generations = readdirSync(archiveDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map((entry) => Number(entry.name))
      .sort((left, right) => right - left);
    for (const generation of generations) {
      const path = join(archiveDirectory, String(generation), JSON_FILE_NAME);
      if (!existsSync(path)) continue;
      const report = readReportFile(path);
      if ((report.findings ?? []).length > 0) return report;
    }
  }
  const legacyPath = join(root, JSON_FILE_NAME);
  if (existsSync(legacyPath)) {
    const legacy = readReportFile(legacyPath);
    if ((legacy.findings ?? []).length > 0) return legacy;
  }
  return current;
}

/**
 * The most recent report, regardless of whether it carries findings.
 *
 * The debt gate needs the whole debt a reader can see: a current report with zero
 * findings but blocked surfaces is the baseline, not a reason to fall back to an
 * older report. The finding ledger keeps its own "most recent with findings" rule.
 */
// [::TICKET::] PX-287 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-287 --for-spec --no-implementation-order`.
export function readBaselineReport(root) {
  const current = readGenerationReport(root);
  if (current !== null) return { report: current, source: 'current' };
  const archiveDirectory = join(runDirectoryFor(root), ARCHIVE_DIRECTORY_NAME);
  if (existsSync(archiveDirectory)) {
    const generations = readdirSync(archiveDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map((entry) => Number(entry.name))
      .sort((left, right) => right - left);
    for (const generation of generations) {
      const path = join(archiveDirectory, String(generation), JSON_FILE_NAME);
      if (existsSync(path)) return { report: readReportFile(path), source: `archive/${generation}` };
    }
  }
  const legacyPath = join(root, JSON_FILE_NAME);
  if (existsSync(legacyPath)) return { report: readReportFile(legacyPath), source: 'legacy' };
  return { report: null, source: 'empty' };
}

/**
 * The debt a regeneration transaction may carry.
 *
 * Findings and blocked checks come from the most recent report; reading subjects and
 * the Yes count come from the JSONL, because the report's display list is capped.
 *
 * @param {string} root — workspace root
 * @returns {{ findings: Set<string>, blocked: Set<string>, readingSubjects: Set<string>,
 *   readingCount: number, readingWithheld: number, source: string }}
 */
// [::TICKET::] PX-287 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-287 --for-spec --no-implementation-order`.
export function readDebtBaseline(root) {
  const { report, source } = readBaselineReport(root);
  const readings = readUnresolvedReadingSubjects(root);
  return {
    findings: new Set((report?.findings ?? []).map((finding) => `${finding.checkId}\u0000${finding.subject}`)),
    blocked: new Set((report?.blocked ?? []).map((entry) => entry.checkId ?? entry.check)),
    readingSubjects: readings.subjects,
    readingCount: readings.count,
    readingPresent: readings.present,
    readingWithheld: report?.readings?.withheld?.length ?? readings.withheldCount,
    source,
  };
}

/** The denominator a report carries when no axis was measured. */
export function emptyDenominator() {
  return { operations: null, sequences: null, boundaries: null, surfaces: null };
}

/** Normalize a checks record so older callers keep working. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function normalizeChecks(checks = {}) {
  const blocked = checks.blocked ?? checks.skipped ?? 0;
  return {
    families: checks.families ?? CHECK_FAMILY_COUNT,
    run: checks.run ?? 0,
    blocked,
    skipped: blocked,
    failed: checks.failed ?? 0,
    subChecks: checks.subChecks ?? [],
  };
}

/** The compatibility projection of blocked checks as withheld entries. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function projectWithheld(blocked) {
  return blocked.map((entry) => ({ layer: entry.family, check: entry.checkId, reason: entry.reason }));
}

/**
 * Assemble the report value.
 *
 * @param {{ workspace: object, findings: Array<object>, withheld?: Array<object>,
 *   blocked?: Array<object>, waived?: Array<object>, downgrade?: object|null,
 *   checks: { run: number, failed: number, families?: number, blocked?: number,
 *   skipped?: number, subChecks?: Array<object> },
 *   provenance?: object, readings?: object, denominator?: object,
 *   verdict?: string, wouldExit?: number|null }} input
 * @returns {object}
 */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
// [::TICKET::] PX-283 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-283 --for-spec --no-implementation-order`.
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
export function buildReport(input) {
  const {
    workspace, findings, withheld, blocked, waived, downgrade,
    checks, provenance, readings, denominator, verdict, wouldExit,
  } = input;
  const sorted = [...findings]
    .map((finding) => ({ ...finding, persisted: finding.persisted ?? false, repairClass: finding.repairClass ?? 'in-place' }))
    .sort(compareFindings);
  const blockedEntries = blocked ?? (withheld ?? []).map((entry) => ({
    checkId: entry.check ?? entry.layer ?? 'unknown',
    family: entry.layer ?? 'unknown',
    surface: entry.surface ?? 'unknown',
    reason: entry.reason,
  }));
  const waivedEntries = waived ?? [];
  const withheldEntries = withheld ?? projectWithheld(blockedEntries);
  const findingsByClass = Object.fromEntries(FINDING_CLASSES.map((name) => [name, 0]));
  for (const finding of sorted) {
    if (findingsByClass[finding.class] === undefined) findingsByClass[finding.class] = 0;
    findingsByClass[finding.class] += 1;
  }
  const defaultVerdict = sorted.length > 0
    ? 'findings'
    : (blockedEntries.length > 0 || (readings?.inquest?.yes ?? 0) > 0 ? 'unproven' : 'pass');
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    workspace: workspace.root,
    checks: normalizeChecks(checks),
    provenance: provenance ?? emptyProvenance(),
    readings: readings ?? emptyReadings(),
    denominator: denominator ?? emptyDenominator(),
    verdict: verdict ?? defaultVerdict,
    wouldExit: wouldExit ?? null,
    downgrade: downgrade ?? null,
    withheld: withheldEntries,
    blocked: blockedEntries,
    waived: waivedEntries,
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
    const key = computeRouteKey(finding);
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

/** The number of distinct surfaces a blocked set names. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function countBlockedSurfaces(blocked) {
  return new Set(blocked.map((entry) => entry.surface)).size;
}

/** Every blocked check, one line each. */
// [::TICKET::] PX-285, PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-285|PX-286) --for-spec --no-implementation-order`.
function renderBlockedSummary(blocked) {
  if (blocked.length === 0) return [];
  const surfaceCount = countBlockedSurfaces(blocked);
  const surfaceWord = surfaceCount === 1 ? 'surface' : 'surfaces';
  return [
    `blocked: ${blocked.length} check(s) in ${surfaceCount} ${surfaceWord}`,
    ...blocked.map((entry) => `  blocked: ${entry.checkId} | surface: ${entry.surface} | producer: ${entry.producer ?? 'unrouted'} | reason: ${entry.reason}`),
  ];
}

/** The next action for an unproven run: a producer per blocked surface, and readings. */
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-286) --for-spec --no-implementation-order`.
function renderUnprovenNext(report) {
  const producers = [...new Set((report.blocked ?? []).map((entry) => entry.producer).filter(Boolean))];
  const unresolvedReadings = report.readings?.inquest?.yes ?? 0;
  const actions = [];
  if (producers.length > 0) actions.push(`restore every blocked surface with its producer: ${producers.join(' | ')}`);
  if (unresolvedReadings > 0) actions.push(`resolve ${unresolvedReadings} Yes reading(s) by revising the spec and rerunning the educe reader phases`);
  const action = actions.length === 0 ? 'restore every blocked surface with its producer' : actions.join('; ');
  return `next: ${action}. verdict: unproven; exit: 4.`;
}

/** The verdict line a run ends at. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
// [::TICKET::] PX-283 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-283 --for-spec --no-implementation-order`.
// [::TICKET::] PX-285, PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-285|PX-286) --for-spec --no-implementation-order`.
function renderVerdictLine(report) {
  if (report.verdict === 'audit') return `next: none. verdict: audit; wouldExit: ${report.wouldExit ?? 0}.`;
  if (report.verdict === 'unproven') return renderUnprovenNext(report);
  if (report.verdict === 'findings') return NEXT_FIX;
  return 'next: none. verdict: pass.';
}

/** The readings files the summary could not parse, one line when any exist. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function renderReadingsWithheldLine(readings) {
  const withheld = readings?.withheld ?? [];
  return withheld.length === 0
    ? []
    : [`readings withheld: ${withheld.map((entry) => entry.check).join(', ')}`];
}

/** The lines every console block opens with after its finding count. */
// [::TICKET::] PX-283, PX-284 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-283|PX-284) --for-spec --no-implementation-order`.
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function buildSummaryLines(report) {
  const readingsLine = report.readings?.policy === 'advisory'
    ? `${formatReadingsLine(report.readings)} (advisory; not blocking)`
    : formatReadingsLine(report.readings);
  const lines = [
    `provenance: ${formatProvenanceLine(report.provenance)}`,
    `readings: ${readingsLine}`,
  ];
  if (report.checks.blocked > 0 || report.checks.failed > 0) {
    lines.push(`checks: run=${report.checks.run} blocked=${report.checks.blocked} failed=${report.checks.failed} families=${report.checks.families}`);
  }
  if (report.downgrade !== null) {
    lines.push(`downgrade: ${report.downgrade.from}->${report.downgrade.to} (${report.downgrade.code})`);
  }
  lines.push(...renderReadingsWithheldLine(report.readings));
  return lines;
}

/** The waived findings as one line. */
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
function renderWaivedLine(waived) {
  return waived.length === 0 ? [] : [`waived: ${waived.length} finding(s) with a ground`];
}

/**
 * The console block a run writes.
 *
 * Exit 1 is an input to the repair loop, never a completion: the block ends by naming
 * the only action that clears it. Exit 4 names every blocked surface instead.
 */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
// [::TICKET::] PX-283 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-283 --for-spec --no-implementation-order`.
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
export function renderConsoleReport(report, { jsonPath } = {}) {
  const suffix = jsonPath === undefined ? '' : `; ${jsonPath}`;
  if (report.findings.length === 0) {
    const lines = [
      `smooth-sequences: 0 finding(s)${suffix}`,
      ...buildSummaryLines(report),
      ...renderBlockedSummary(report.blocked),
      ...renderWaivedLine(report.waived),
      renderVerdictLine(report),
    ];
    return lines;
  }
  const routeCount = new Set(report.findings.map((finding) => computeRouteKey(finding))).size;
  return [
    `smooth-sequences: ${report.findings.length} finding(s) in ${routeCount} repair route(s)${suffix}`,
    ...buildSummaryLines(report),
    ...renderRouteBlock(report.findings),
    ...renderBlockedSummary(report.blocked),
    ...renderWaivedLine(report.waived),
    renderVerdictLine(report),
  ];
}

/** Render the complete JSON report. */
export function renderReportJson(report) {
  return `${JSON.stringify(report, null, JSON_INDENT)}\n`;
}

/** Render the capped Markdown report. */
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
export function renderReportMarkdown(report, { limit = MAX_MARKDOWN_FINDINGS } = {}) {
  const surfaceCount = countBlockedSurfaces(report.blocked);
  const header = [
    '# Smooth Sequences',
    '',
    `workspace: ${report.workspace}`,
    `checks: run=${report.checks.run} blocked=${report.checks.blocked} failed=${report.checks.failed} families=${report.checks.families}`,
    `provenance: ${formatProvenanceLine(report.provenance)}`,
    `readings: ${formatReadingsLine(report.readings)}`,
    ...renderReadingsWithheldLine(report.readings),
    `denominator: operations=${report.denominator.operations ?? 'unknown'} sequences=${report.denominator.sequences ?? 'unknown'} boundaries=${report.denominator.boundaries ?? 'unknown'} surfaces=${report.denominator.surfaces ?? 'unknown'}`,
    `blocked: ${report.blocked.length === 0 ? 'none' : `${report.blocked.length} check(s) in ${surfaceCount} surface(s)`}`,
    `waived: ${report.waived.length}`,
    `findings: ${report.findingsByClass.omission} omission, ${report.findingsByClass.contradiction} contradiction, ${report.findingsByClass.deficiency} deficiency, ${report.findingsByClass.danger} danger`,
  ];
  if (report.downgrade !== null) header.push(`downgrade: ${report.downgrade.from}->${report.downgrade.to} (${report.downgrade.code})`);
  if (report.wouldExit !== null) header.push(`wouldExit: ${report.wouldExit}`);
  const lines = [...header, '', '## Blocked surfaces', '', ...renderBlockedSummary(report.blocked), '', '## Repair routes', ''];
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
