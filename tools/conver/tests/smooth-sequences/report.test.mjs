// [::TICKET::] PX-285 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-285 --for-spec --no-implementation-order`.
// [::TICKET::] PX-281 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-281 --for-spec --no-implementation-order`.
// [::TICKET::] PX-275 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-275 --for-spec --no-implementation-order`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  annotatePersisted,
  buildReport,
  EXIT_FINDINGS,
  EXIT_PASS,
  EXIT_UNPROVEN,
  readFindingBaseline,
  readPreviousReport,
  renderConsoleReport,
  renderReportJson,
  renderReportMarkdown,
  writeReport,
} from '../../.claude/scripts/smooth-sequences/lib/report.mjs';

// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.

const SPEC_PRODUCER = '/educe-sequences spec.md';

const findings = [
  {
    checkId: 'S4.b',
    class: 'omission',
    subject: 'boundary-002',
    where: 'workspacify/allocate/DECISIONS.json#boundary-002',
    why: 'missing contract row',
    fix: 'add the contract edge',
    producer: 'node .claude/scripts/workspacify-allocate/run.mjs finalize ./WORKSPACIFY-TREE-MANIFEST.json',
  },
  {
    checkId: 'S1.a',
    class: 'contradiction',
    subject: 'A-1__step',
    where: 'spec.md#1',
    why: 'unresolved operation',
    fix: 'declare the operation',
    producer: SPEC_PRODUCER,
  },
];

/** A report over the default findings. */
// [::TICKET::] PX-288 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-288 --for-spec --no-implementation-order`.
// [::TICKET::] PX-277 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-277 --for-spec --no-implementation-order`.
function reportOf(overrides = {}) {
  return buildReport({
    workspace: { root: '/tmp/x' },
    findings,
    withheld: [],
    checks: { run: 2, failed: 2 },
    ...overrides,
  });
}

// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
// @verifies C001
// [::TICKET::] PX-278 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-278 --for-spec --no-implementation-order`.
// [::TICKET::] PX-283 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-283 --for-spec --no-implementation-order`.
test('the JSON report is byte-identical, sorted and at schemaVersion 4', () => {
  const first = renderReportJson(reportOf());
  const second = renderReportJson(reportOf());
  assert.equal(first, second);
  const parsed = JSON.parse(first);
  assert.equal(parsed.schemaVersion, 4);
  assert.deepEqual(parsed.findings.map((finding) => finding.checkId), ['S1.a', 'S4.b']);
  assert.equal(parsed.findingsByClass.omission, 1);
  assert.equal(parsed.findingsByClass.contradiction, 1);
  assert.equal(parsed.checks.families, 7);
  assert.equal(parsed.checks.skipped, 0);
  assert.equal(parsed.checks.blocked, 0);
  assert.deepEqual(parsed.checks.subChecks, []);
  assert.equal(parsed.provenance.status, 'not-recorded');
  assert.deepEqual(parsed.provenance.proseContract, { total: 0, typed: 0, legacy: 0, absent: 0 });
  assert.deepEqual(parsed.provenance.schemaHistory, []);
  assert.equal(parsed.provenance.downgrade, null);
  assert.equal(parsed.readings.status, 'not-available');
  assert.deepEqual(parsed.denominator, {
    operations: { all: null, active: null },
    sequences: { realized: null, entryRegions: null, source: 'unstated', members: null },
    boundaries: null,
    surfaces: { requiredInterfaces: null, demandColumns: null },
  });
  for (const finding of parsed.findings) {
    assert.deepEqual(
      Object.keys(finding).sort(),
      ['checkId', 'class', 'fix', 'persisted', 'producer', 'repairClass', 'subject', 'where', 'why'],
    );
  }
});

// @verifies C003
test('the console block groups findings under route headers and ends with next', () => {
  const lines = renderConsoleReport(reportOf());
  assert.equal(lines[0], 'smooth-sequences: 2 finding(s) in 2 repair route(s)');
  assert.ok(lines.includes('route: spec.md#1 | rerun: /educe-sequences spec.md'));
  assert.ok(lines.includes('  S1.a A-1__step | why: unresolved operation | fix: declare the operation'));
  assert.equal(lines.at(-1), 'next: fix every finding above; blocked surfaces must also be restored. exit 0 only when both sets are empty.');
});

// @verifies C003
// [::TICKET::] PX-283 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-283 --for-spec --no-implementation-order`.
test('a clean console block prints next: none and no finding line', () => {
  const report = buildReport({
    workspace: { root: '/tmp/x' },
    findings: [],
    withheld: [],
    checks: { run: 7, failed: 0 },
  });
  assert.deepEqual(renderConsoleReport(report), [
    'smooth-sequences: 0 finding(s)',
    'provenance: not-recorded (no migration field; prose total 0: typed 0, legacy 0, absent 0)',
    'readings: not-available',
    'next: none. verdict: pass.',
  ]);
});

// @verifies C004
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
test('a console block with a blocked surface is unproven and never says pass', () => {
  const report = buildReport({
    workspace: { root: '/tmp/x' },
    findings: [],
    withheld: [{ layer: 'B', check: 'S5.precondition-not-implied', reason: 'v3 step contract absent' }],
    checks: { run: 7, failed: 0 },
  });
  const lines = renderConsoleReport(report);
  assert.ok(lines.includes('blocked: 1 check(s) in 1 surface'));
  assert.ok(lines.some((line) => line.includes('S5.precondition-not-implied')));
  assert.equal(lines.at(-1), 'next: restore every blocked surface with its producer. verdict: unproven; exit: 4.');
  assert.doesNotMatch(lines.join('\n'), /verdict: pass/);
});

// @verifies C005
test('a finding repeated from the previous report is marked persisted', () => {
  const annotated = annotatePersisted(findings, {
    findings: [{ checkId: 'S1.a', subject: 'A-1__step' }],
  });
  assert.deepEqual(annotated.map((finding) => finding.persisted), [false, true]);
});

// @verifies C005
test('a first run, an unreadable report or a changed subject marks nothing persisted', () => {
  assert.deepEqual(annotatePersisted(findings, null).map((finding) => finding.persisted), [false, false]);
  assert.deepEqual(
    annotatePersisted(findings, { findings: [{ checkId: 'S1.a', subject: 'other' }] }).map((finding) => finding.persisted),
    [false, false],
  );
});

// @verifies C005
test('a persisted finding is marked in the console and the Markdown', () => {
  const annotated = annotatePersisted(findings, { findings: [{ checkId: 'S1.a', subject: 'A-1__step' }] });
  const report = buildReport({ workspace: { root: '/tmp/x' }, findings: annotated, withheld: [], checks: { run: 2, failed: 2 } });
  assert.match(renderConsoleReport(report).join('\n'), /S1\.a A-1__step \| why: .* \| fix: .* \| persisted/);
  assert.match(renderReportMarkdown(report), /S1\.a A-1__step \| why: .* \| fix: .* \| persisted/);
});

test('the Markdown report caps the list and names the remainder', () => {
  const many = Array.from({ length: 205 }, (_, index) => ({
    checkId: `S1.${String(index).padStart(3, '0')}`,
    class: 'omission',
    subject: `subject-${index}`,
    where: `spec.md#${index}`,
    why: 'reason',
    fix: 'repair',
    producer: SPEC_PRODUCER,
  }));
  const markdown = renderReportMarkdown(buildReport({ workspace: { root: '/tmp/x' }, findings: many, withheld: [], checks: { run: 205, failed: 205 } }));
  assert.match(markdown, /…and 5 more findings/);
});

// @verifies C001
// [::TICKET::] PX-276 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-276 --for-spec --no-implementation-order`.
// [::TICKET::] PX-286 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-286 --for-spec --no-implementation-order`.
test('the Markdown report names each withheld surface and its check', () => {
  const report = buildReport({
    workspace: { root: '/tmp/x' },
    findings: [],
    withheld: [{ layer: 'vocabulary', check: 'S3.terminal-status', reason: 'terminalStatuses is not declared' }],
    checks: { run: 7, failed: 0 },
  });
  const markdown = renderReportMarkdown(report);
  assert.match(markdown, /blocked: 1 check\(s\) in 1 surface\(s\)/);
  assert.match(markdown, /S3\.terminal-status \| surface: unknown \| producer: unrouted \| reason: terminalStatuses is not declared/);
});

// @verifies C006
test('an unreadable readings file is named in the console and Markdown', () => {
  const readings = {
    status: 'partial',
    inquest: { records: 0, byLens: {}, byAnswer: {}, yes: 0, no: 0, unresolvedSubjects: [], overflow: 0 },
    adversarial: { records: 0, byOutcome: {} },
    uncovered: { records: 0 },
    withheld: [{ layer: 'readings', check: 'readings:readings-inquest.jsonl', reason: 'line 2 is malformed' }],
  };
  const report = buildReport({
    workspace: { root: '/tmp/x' },
    findings: [],
    readings,
    checks: { run: 7, failed: 0 },
    verdict: 'unproven',
  });
  assert.ok(renderConsoleReport(report).some((line) => line.includes('readings withheld: readings:readings-inquest.jsonl')));
  assert.match(renderReportMarkdown(report), /readings withheld: readings:readings-inquest\.jsonl/);
});

// [::TICKET::] PX-283 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-283 --for-spec --no-implementation-order`.
test('an audit report names the would-be exit in JSON and Markdown', () => {
  const report = buildReport({
    workspace: { root: '/tmp/x' },
    findings,
    withheld: [],
    checks: { run: 2, failed: 2 },
    verdict: 'audit',
    wouldExit: 1,
  });
  const parsed = JSON.parse(renderReportJson(report));
  assert.equal(parsed.verdict, 'audit');
  assert.equal(parsed.wouldExit, 1);
  assert.match(renderReportMarkdown(report), /wouldExit: 1/);
});

test('writeReport writes both documents and returns their paths', () => {
  const output = mkdtempSync(join(tmpdir(), 'smooth-report-'));
  try {
    const paths = writeReport({ report: reportOf(), outputDirectory: output });
    assert.equal(paths.jsonPath, join(output, 'SMOOTH-SEQUENCES.json'));
    assert.equal(paths.markdownPath, join(output, 'SMOOTH-SEQUENCES.md'));
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

// @verifies C003
test('readFindingBaseline falls back to a legacy root report when the generation is clean', () => {
  const root = mkdtempSync(join(tmpdir(), 'smooth-report-baseline-'));
  try {
    mkdirSync(join(root, 'smooth-sequences'), { recursive: true });
    writeFileSync(join(root, 'smooth-sequences', 'SMOOTH-SEQUENCES.json'), JSON.stringify({ findings: [] }));
    writeFileSync(join(root, 'SMOOTH-SEQUENCES.json'), JSON.stringify({ findings: [{ subject: 'legacy' }] }));
    assert.equal(readFindingBaseline(root).findings[0].subject, 'legacy');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// @verifies C005
test('readPreviousReport prefers the generation report over the legacy root report', () => {
  const root = mkdtempSync(join(tmpdir(), 'smooth-report-history-'));
  try {
    writeFileSync(join(root, 'SMOOTH-SEQUENCES.json'), JSON.stringify({ findings: [{ subject: 'legacy' }] }));
    mkdirSync(join(root, 'smooth-sequences'));
    writeFileSync(join(root, 'smooth-sequences', 'SMOOTH-SEQUENCES.json'), JSON.stringify({ findings: [{ subject: 'generation' }] }));

    assert.equal(readPreviousReport(root).findings[0].subject, 'generation');
    rmSync(join(root, 'smooth-sequences'), { recursive: true, force: true });
    assert.equal(readPreviousReport(root).findings[0].subject, 'legacy');
    assert.equal(readFileSync(join(root, 'SMOOTH-SEQUENCES.json'), 'utf8'), JSON.stringify({ findings: [{ subject: 'legacy' }] }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('exit constants are stable', () => {
  assert.equal(EXIT_PASS, 0);
  assert.equal(EXIT_FINDINGS, 1);
  assert.equal(EXIT_UNPROVEN, 4);
});
