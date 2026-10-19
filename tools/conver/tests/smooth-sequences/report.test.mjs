import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildReport, renderReportJson, renderReportMarkdown, writeReport, EXIT_FINDINGS, EXIT_PASS } from '../../.claude/scripts/smooth-sequences/lib/report.mjs';

const findings = [
  { checkId: 'S4.b', class: 'omission', subject: 'boundary-002', reason: 'missing', repair: 'add' },
  { checkId: 'S1.a', class: 'contradiction', subject: 'A-1__step', reason: 'unresolved', repair: 'fix' },
];

// [::TICKET::] PX-273 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-273 --for-spec --no-implementation-order`.
// @verifies C006
test('the JSON report is byte-identical and findings are sorted', () => {
  const first = renderReportJson(buildReport({ workspace: { root: '/tmp/x' }, findings, withheld: [], checks: { run: 2, failed: 2 } }));
  const second = renderReportJson(buildReport({ workspace: { root: '/tmp/x' }, findings, withheld: [], checks: { run: 2, failed: 2 } }));
  assert.equal(first, second);
  const parsed = JSON.parse(first);
  assert.deepEqual(parsed.findings.map((finding) => finding.checkId), ['S1.a', 'S4.b']);
  assert.equal(parsed.findingsByClass.omission, 1);
  assert.equal(parsed.findingsByClass.contradiction, 1);
});

test('the Markdown report caps the list and names the remainder', () => {
  const many = Array.from({ length: 205 }, (_, index) => ({
    checkId: `S1.${String(index).padStart(3, '0')}`,
    class: 'omission',
    subject: `subject-${index}`,
    reason: 'reason',
    repair: 'repair',
  }));
  const markdown = renderReportMarkdown(buildReport({ workspace: { root: '/tmp/x' }, findings: many, withheld: [], checks: { run: 205, failed: 205 } }));
  assert.match(markdown, /…and 5 more findings/);
});

test('writeReport writes both documents and returns their paths', () => {
  const output = mkdtempSync(join(tmpdir(), 'smooth-report-'));
  try {
    const report = buildReport({ workspace: { root: '/tmp/x' }, findings, withheld: [], checks: { run: 2, failed: 2 } });
    const paths = writeReport({ report, outputDirectory: output });
    assert.equal(paths.jsonPath, join(output, 'SMOOTH-SEQUENCES.json'));
    assert.equal(paths.markdownPath, join(output, 'SMOOTH-SEQUENCES.md'));
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});

test('exit constants are stable', () => {
  assert.equal(EXIT_PASS, 0);
  assert.equal(EXIT_FINDINGS, 1);
});
