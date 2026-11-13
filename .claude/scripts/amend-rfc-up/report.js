'use strict';

/**
 * /amend-rfc-up report.
 *
 * JSON is the complete record. Markdown is the readable matrix and is capped
 * with an explicit omitted count. COMPLETE is refused while any artifact is
 * blocked or unverifiable, or a *-law verification is not machine_verified.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPORT_JSON_BASENAME = 'amend-rfc-up-report.json';
const REPORT_MARKDOWN_BASENAME = 'amend-rfc-up-report.md';
const REPORT_DIRECTORY = 'amend';
const DEFAULT_ROW_LIMIT = 50;
const BLOCKED_ARTIFACT_STATES = new Set(['blocked', 'rolled-back']);

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

/** The complete machine record. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function renderReportJson(input = {}) {
  const {
    packages = null,
    artifacts = {},
    ruleCoverage = null,
    obligationCoverage = null,
    surfaceCoverage = [],
    impacts = [],
    lawVerification = null,
    clauses = [],
    findings = [],
    unverifiable = [],
    outcome = 'BLOCKED',
  } = input;
  if (packages && typeof packages === 'object' && !Array.isArray(packages)) {
    return {
      schema: 'amend-rfc-up.report/v2',
      packages,
      rule_coverage: ruleCoverage,
      obligation_coverage: obligationCoverage,
      surface_coverage: surfaceCoverage,
      impacts,
      law_verification: lawVerification,
      clauses,
      findings,
      unverifiable,
      outcome,
    };
  }
  return {
    artifacts,
    law_verification: lawVerification,
    clauses,
    findings,
    unverifiable,
    outcome,
  };
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function packageArtifactStatuses(report) {
  return Object.values(report.packages || {})
    .flatMap((entry) => Object.values(entry.artifacts || {}));
}

// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function ownerReceipts(report) {
  return Object.values(report.packages || {})
    .flatMap((entry) => entry.ownerReceipts || []);
}

/** Render the v2 package × artifact matrix, capped with an explicit count. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function renderPackageMatrix({ report, limit = DEFAULT_ROW_LIMIT }) {
  const rows = [];
  for (const [packageId, entry] of Object.entries(report.packages || {})) {
    for (const [artifact, status] of Object.entries(entry.artifacts || {})) {
      rows.push({ packageId, artifact, status });
    }
  }
  const clauses = report.clauses || [];
  const lines = [
    '# /amend-rfc-up report',
    '',
    `- outcome: ${report.outcome}`,
    `- rule coverage: covered=${report.rule_coverage?.covered || 0}, not_applicable=${report.rule_coverage?.not_applicable || 0}, uncovered=${report.rule_coverage?.uncovered || 0}`,
    `- obligation coverage: covered=${report.obligation_coverage?.covered || 0}, not_applicable=${report.obligation_coverage?.not_applicable || 0}, judged=${report.obligation_coverage?.judged || 0}, uncovered=${report.obligation_coverage?.uncovered || 0}`,
    '',
    '| Package | Artifact | Status |',
    '|---|---|---|',
  ];
  for (const row of rows.slice(0, limit)) {
    lines.push(`| ${row.packageId} | ${row.artifact} | ${row.status} |`);
  }
  if (rows.length > limit) lines.push('', `...and ${rows.length - limit} more package artifacts`);
  lines.push('', '| Clause | Changes |', '|---|---|');
  for (const clause of clauses.slice(0, limit)) {
    lines.push(`| ${clause.id || ''} | ${(clause.changeIds || []).join(', ')} |`);
  }
  if (clauses.length > limit) lines.push('', `...and ${clauses.length - limit} more clauses`);
  if ((report.findings || []).length > 0) {
    lines.push('', '## Findings');
    for (const finding of report.findings.slice(0, limit)) {
      lines.push(`- ${finding.code || 'FINDING'}: ${finding.problem || finding.asset || ''}`);
    }
    if (report.findings.length > limit) lines.push(`- ...and ${report.findings.length - limit} more`);
  }
  return `${lines.join('\n')}\n`;
}

/** Render one row per artifact and per clause, capped. */
// [::TICKET::] PX-418, PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-418|PX-419) --for-spec --no-implementation-order`.
function renderReportMarkdown({ report, limit = DEFAULT_ROW_LIMIT }) {
  if (report.schema === 'amend-rfc-up.report/v2') {
    return renderPackageMatrix({ report, limit });
  }
  const artifacts = Object.entries(report.artifacts || {});
  const clauses = report.clauses || [];
  const lines = [
    '# /amend-rfc-up report',
    '',
    `- outcome: ${report.outcome}`,
    `- law verification: ${report.law_verification ? report.law_verification.status : 'none'}`,
    '',
    '| Artifact | Status |',
    '|---|---|',
  ];
  for (const [artifact, artifactStatus] of artifacts.slice(0, limit)) {
    lines.push(`| ${artifact} | ${artifactStatus} |`);
  }
  if (artifacts.length > limit) lines.push('', `...and ${artifacts.length - limit} more artifacts`);
  lines.push('', '| Clause | Changes |', '|---|---|');
  for (const clause of clauses.slice(0, limit)) {
    lines.push(`| ${clause.id || ''} | ${(clause.changeIds || []).join(', ')} |`);
  }
  if (clauses.length > limit) lines.push('', `...and ${clauses.length - limit} more clauses`);
  if ((report.findings || []).length > 0) {
    lines.push('', '## Findings');
    for (const finding of report.findings.slice(0, limit)) {
      lines.push(`- ${finding.code || 'FINDING'}: ${finding.problem || finding.asset || ''}`);
    }
    if (report.findings.length > limit) lines.push(`- ...and ${report.findings.length - limit} more`);
  }
  return `${lines.join('\n')}\n`;
}

/** Refuse a COMPLETE claim the report cannot prove. */
// [::TICKET::] PX-419 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-419 --for-spec --no-implementation-order`.
function assertNoFalseComplete({ report }) {
  if ((report.unverifiable || []).length > 0) return { ok: false, code: 'UNVERIFIABLE' };
  if ((report.findings || []).length > 0) return { ok: false, code: 'FINDINGS_PRESENT' };
  if (report.schema === 'amend-rfc-up.report/v2') {
    if ((report.rule_coverage?.uncovered || 0) > 0) return { ok: false, code: 'RULE_COVERAGE_INCOMPLETE' };
    if ((report.obligation_coverage?.uncovered || 0) > 0) return { ok: false, code: 'OBLIGATION_COVERAGE_INCOMPLETE' };
    const badSurface = (report.surface_coverage || []).some((entry) => (
      entry.status !== 'covered' && entry.status !== 'not_applicable'
    ));
    if (badSurface) return { ok: false, code: 'SURFACE_COVERAGE_INCOMPLETE' };
    if ((report.impacts || []).some((entry) => entry.verified === false)) {
      return { ok: false, code: 'IMPACT_UNVERIFIED' };
    }
    if (ownerReceipts(report).some((entry) => entry.verified === false)) {
      return { ok: false, code: 'OWNER_RECEIPT_UNVERIFIED' };
    }
    if (packageArtifactStatuses(report).some((value) => BLOCKED_ARTIFACT_STATES.has(value))) {
      return { ok: false, code: 'BLOCKED_ARTIFACT' };
    }
  }
  if (report.law_verification && report.law_verification.status !== 'machine_verified') {
    return { ok: false, code: 'LAW_SKILL_INVALID' };
  }
  const blocked = Object.values(report.artifacts || {}).find((value) => BLOCKED_ARTIFACT_STATES.has(value));
  if (blocked) return { ok: false, code: 'BLOCKED_ARTIFACT' };
  if (report.outcome === 'BLOCKED') return { ok: false, code: 'BLOCKED' };
  return { ok: true };
}

/** Write both report forms under the package's amend/ directory. */
// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function writeReport({ packageDir, report }) {
  const directory = path.join(packageDir, REPORT_DIRECTORY);
  fs.mkdirSync(directory, { recursive: true });
  const jsonPath = path.join(directory, REPORT_JSON_BASENAME);
  const markdownPath = path.join(directory, REPORT_MARKDOWN_BASENAME);
  const temporarySuffix = `.tmp.${process.pid}`;
  fs.writeFileSync(`${jsonPath}${temporarySuffix}`, JSON.stringify(report, null, 2) + '\n');
  fs.renameSync(`${jsonPath}${temporarySuffix}`, jsonPath);
  fs.writeFileSync(`${markdownPath}${temporarySuffix}`, renderReportMarkdown({ report }));
  fs.renameSync(`${markdownPath}${temporarySuffix}`, markdownPath);
  return { jsonPath, markdownPath };
}

// [::TICKET::] PX-418 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-418 --for-spec --no-implementation-order`.
function argumentValue(args, name) {
  const prefix = `--${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(`--${name}`);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

function readJsonInput(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const text = value.startsWith('@') ? fs.readFileSync(value.slice(1), 'utf8') : value;
  return JSON.parse(text);
}

function main(argv = process.argv.slice(2)) {
  const command = argv[0];
  const packageDir = path.resolve(argumentValue(argv, 'package') || process.cwd());
  try {
    if (command !== 'write') {
      process.stdout.write(`${JSON.stringify({ code: 'UNKNOWN_SUBCOMMAND', command })}\n`);
      return 1;
    }
    const report = readJsonInput(argumentValue(argv, 'report'));
    if (!report) throw fail('REPORT_INPUT_MISSING', '--report=@file is required');
    const written = writeReport({ packageDir, report });
    process.stdout.write(`${JSON.stringify({ ok: true, ...written })}\n`);
    return 0;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ code: error.code || 'REPORT_FAILED', message: error.message })}\n`);
    return 1;
  }
}

if (require.main === module) process.exit(main());

module.exports = {
  REPORT_JSON_BASENAME,
  REPORT_MARKDOWN_BASENAME,
  assertNoFalseComplete,
  renderReportJson,
  renderReportMarkdown,
  writeReport,
};
