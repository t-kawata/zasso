/**
 * advisory-report.test.cjs — Tests for the shared four-axis advisory report (PX-166)
 *
 * Covers contract C002 of the graphify inspection layer:
 *   - buildAdvisoryReport(findings) renders Danger/Omission/Contradiction/
 *     Deficiency findings in kind English Markdown
 *   - an empty findings object renders 'none' in every axis
 *   - the output is deterministic for identical inputs
 *
 * RED at make time: advisory-report.js does not exist yet.
 *
 * @verifies C002  (advisory-report emits four-axis English findings, advisory-only)
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const ADVISORY = path.resolve(__dirname, '../../.claude/scripts/drill-rfc-down/advisory-report.js');

let tmpRoot;

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'advisory-report-'));
});

after(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

async function loadModule() {
  return import(pathToFileURL(ADVISORY).href);
}

describe('advisory-report.js (four-axis advisory)', () => {
  it('renders a four-axis report with the axis headers and each finding in English', async () => {
    const mod = await loadModule();
    const report = mod.buildAdvisoryReport({
      danger: [{ message: 'slug collision detected for "auth"' }],
      omission: [],
      contradiction: [{ message: 'contradiction candidate: graph N0002 "Auth module"' }],
      deficiency: [{ message: 'section "## Long" exceeds 100 lines' }],
    });
    assert.match(report, /### Danger/, 'Danger header');
    assert.match(report, /### Omission/, 'Omission header');
    assert.match(report, /### Contradiction/, 'Contradiction header');
    assert.match(report, /### Deficiency/, 'Deficiency header');
    assert.match(report, /slug collision detected for "auth"/, 'danger finding shown');
    assert.match(report, /contradiction candidate: graph N0002/, 'contradiction finding shown');
    assert.match(report, /exceeds 100 lines/, 'deficiency finding shown');
  });

  it('renders "none" in an empty axis', async () => {
    const mod = await loadModule();
    const report = mod.buildAdvisoryReport({
      danger: [], omission: [], contradiction: [], deficiency: [],
    });
    const omissionSection = report.split('### Omission')[1].split('###')[0];
    assert.match(omissionSection, /none/, 'empty axis shows none');
  });

  it('is deterministic: identical findings yield identical output', async () => {
    const mod = await loadModule();
    const findings = { danger: [{ message: 'x' }], omission: [], contradiction: [], deficiency: [] };
    assert.equal(mod.buildAdvisoryReport(findings), mod.buildAdvisoryReport(findings), 'identical output');
  });

  it('exposes an emptyAdvisory() factory with the four empty axes', async () => {
    const mod = await loadModule();
    assert.deepEqual(mod.emptyAdvisory(), { danger: [], omission: [], contradiction: [], deficiency: [] });
  });
});
