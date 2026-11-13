'use strict';

/**
 * PX-418 — report: artifact statuses, law verification, false-COMPLETE guard.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  assertNoFalseComplete,
  renderReportJson,
  renderReportMarkdown,
} = require('../../.claude/scripts/amend-rfc-up/report.js');

// @verifies C012
test('C012: report is artifact-centric; unverifiable blocks COMPLETE', () => {
  const report = renderReportJson({
    artifacts: { rfc: 'promoted', graph: 'rederived', 'dirs-tree': 'rederived', tickets: 'rederived' },
    lawVerification: { skill: 'fixture-law', status: 'machine_verified' },
    clauses: [{ id: 'I1', changeIds: ['CH1'] }],
    findings: [],
    unverifiable: [],
    outcome: 'DESIGN_AMENDED',
  });
  assert.equal(report.artifacts.rfc, 'promoted');
  assert.equal(report.law_verification.status, 'machine_verified');
  assert.equal('law_gate' in report, false);
  assert.equal(assertNoFalseComplete({ report }).ok, true);
  const blocked = renderReportJson({ artifacts: {}, unverifiable: [{ name: 'x' }] });
  assert.equal(assertNoFalseComplete({ report: blocked }).code, 'UNVERIFIABLE');
});

test('a non-machine-verified law blocks COMPLETE', () => {
  const report = renderReportJson({
    artifacts: { rfc: 'promoted' },
    lawVerification: { skill: 'fixture-law', status: 'failed' },
    outcome: 'DESIGN_AMENDED',
  });
  assert.equal(assertNoFalseComplete({ report }).code, 'LAW_SKILL_INVALID');
});

test('a blocked artifact blocks COMPLETE', () => {
  const report = renderReportJson({
    artifacts: { rfc: 'promoted', graph: 'blocked' },
    outcome: 'DESIGN_AMENDED',
  });
  assert.equal(assertNoFalseComplete({ report }).code, 'BLOCKED_ARTIFACT');
});

test('an undispositioned semantic obligation blocks COMPLETE', () => {
  const report = renderReportJson({
    packages: { 'pkg-a': { artifacts: { rfc: 'promoted' } } },
    ruleCoverage: { covered: 0, not_applicable: 0, uncovered: 0 },
    obligationCoverage: { total: 2, covered: 1, not_applicable: 0, judged: 0, uncovered: 1 },
    surfaceCoverage: [],
    impacts: [],
    findings: [],
    unverifiable: [],
    outcome: 'DESIGN_AMENDED',
  });
  assert.equal(assertNoFalseComplete({ report }).code, 'OBLIGATION_COVERAGE_INCOMPLETE');
});

test('Markdown caps rows and says how many were omitted', () => {
  const report = renderReportJson({
    artifacts: Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`artifact-${index}`, 'promoted'])),
    clauses: [],
    outcome: 'DESIGN_AMENDED',
  });
  const markdown = renderReportMarkdown({ report, limit: 10 });
  assert.match(markdown, /\.\.\.and 50 more artifacts/);
});

test('JSON keeps every artifact', () => {
  const artifacts = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`artifact-${index}`, 'promoted']));
  const report = renderReportJson({ artifacts, clauses: [], outcome: 'DESIGN_AMENDED' });
  assert.equal(Object.keys(report.artifacts).length, 60);
});

// @verifies C013
test('C013: report v2 carries a package × artifact matrix', () => {
  const report = renderReportJson({
    packages: {
      'pkg-a': { ticketKey: 'PX-1', artifacts: { rfc: 'promoted', graph: 'rederived' } },
      'pkg-b': { ticketKey: 'PX-2', artifacts: { rfc: 'promoted', tickets: 'rederived' } },
    },
    ruleCoverage: { covered: 2, not_applicable: 0, uncovered: 0 },
    surfaceCoverage: [],
    impacts: [],
    findings: [],
    unverifiable: [],
    outcome: 'DESIGN_AMENDED',
  });
  assert.equal(report.schema, 'amend-rfc-up.report/v2');
  assert.equal(Object.keys(report.packages).length, 2);
  assert.equal(report.packages['pkg-a'].artifacts.graph, 'rederived');
  assert.equal(assertNoFalseComplete({ report }).ok, true);
});

test('C013: uncovered rules, surfaces, impacts, or receipts block COMPLETE', () => {
  const base = {
    packages: { 'pkg-a': { ticketKey: 'PX-1', artifacts: { rfc: 'promoted' } } },
    ruleCoverage: { covered: 0, not_applicable: 0, uncovered: 0 },
    surfaceCoverage: [],
    impacts: [],
    findings: [],
    unverifiable: [],
    outcome: 'DESIGN_AMENDED',
  };
  assert.equal(
    assertNoFalseComplete({ report: renderReportJson({ ...base, ruleCoverage: { covered: 0, not_applicable: 0, uncovered: 1 } }) }).code,
    'RULE_COVERAGE_INCOMPLETE',
  );
  assert.equal(
    assertNoFalseComplete({ report: renderReportJson({ ...base, surfaceCoverage: [{ surface: 'MCP', status: 'unassigned' }] }) }).code,
    'SURFACE_COVERAGE_INCOMPLETE',
  );
  assert.equal(
    assertNoFalseComplete({ report: renderReportJson({ ...base, impacts: [{ from: 'pkg-a', to: 'pkg-b', verified: false }] }) }).code,
    'IMPACT_UNVERIFIED',
  );
  assert.equal(
    assertNoFalseComplete({ report: renderReportJson({ ...base, packages: { 'pkg-a': { ticketKey: 'PX-1', artifacts: { rfc: 'promoted' }, ownerReceipts: [{ owner: 'graphify', verified: false }] } } }) }).code,
    'OWNER_RECEIPT_UNVERIFIED',
  );
});
