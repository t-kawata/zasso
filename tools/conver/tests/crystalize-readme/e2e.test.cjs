/**
 * e2e.test.cjs — End-to-end tests for the /crystalize-readme pipeline
 *
 * (a) Branch: valid graph → README.md written → validate-readme-output passes.
 * (b) Branch: graph with omissions → residues/RESIDUE-<ts>.md → validate-residue-output passes.
 * Smoke: crates/siprs/RFC-ROOT-GRAPH.json → expected (b) RESIDUE (read-only, skipped if absent).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { deriveOutputPaths } = require('../../.claude/scripts/crystalize-readme/derive-output-paths.js');
const { checkReadmeWritable } = require('../../.claude/scripts/crystalize-readme/check-readme-writable.js');
const { generateResidueFilename } = require('../../.claude/scripts/crystalize-readme/generate-residue-filename.js');
const { validateReadmeOutput } = require('../../.claude/scripts/crystalize-readme/validate-readme-output.js');
const { validateResidueOutput } = require('../../.claude/scripts/crystalize-readme/validate-residue-output.js');

const {
  buildValidGraph,
  buildEmptyGraph,
  materializeFixture,
  rmrf,
} = require('./fixtures/helpers.cjs');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'px152-e2e-'));

const VALID_README = (rfcPath, graphPath) => [
  '# siprs README',
  '',
  `> 対象 RFC: ${rfcPath}`,
  `> 生成グラフ: ${graphPath}`,
  '',
  '## Overview',
  '',
  '## Usage',
  '',
  '## Examples (implementation samples) spec and design',
  '',
].join('\n');

after(() => rmrf(tmpRoot));

describe('End-to-end (a) branch — README generation', () => {
  it('derives paths, decides README, and the written README passes validation', () => {
    const dir = path.join(tmpRoot, 'e2e-valid');
    const fx = materializeFixture(dir, buildValidGraph(path.join(dir, 'RFC-ROOT.md')));

    const paths = deriveOutputPaths({ sourceFile: fx.sourceFile });
    assert.equal(paths.rfcDir, dir);

    const decision = checkReadmeWritable(fx.graphPath);
    assert.equal(decision.branch, 'README');

    // The AI writes README.md; validation confirms the trailing examples section.
    fs.mkdirSync(dir, { recursive: true });
    const readmePath = path.join(dir, 'README.md');
    fs.writeFileSync(readmePath, VALID_README(fx.sourceFile, fx.graphPath), 'utf8');
    const verdict = validateReadmeOutput(fs.readFileSync(readmePath, 'utf8'));
    assert.equal(verdict.ok, true);
  });
});

describe('End-to-end (b) branch — RESIDUE generation', () => {
  it('decides RESIDUE, generates a timestamped filename, and the residue passes validation', () => {
    const dir = path.join(tmpRoot, 'e2e-residue');
    const fx = materializeFixture(
      dir,
      buildValidGraph(path.join(dir, 'RFC-ROOT.md')),
      { withOmissions: true }
    );

    const decision = checkReadmeWritable(fx.graphPath);
    assert.equal(decision.branch, 'RESIDUE');
    assert.ok(decision.reasons.includes('unresolvedOmissions'));

    const filename = generateResidueFilename('20260817120000');
    assert.match(filename, /^RESIDUE-\d{14}\.md$/);

    const residuesDir = path.join(dir, 'residues');
    fs.mkdirSync(residuesDir, { recursive: true });
    const residuePath = path.join(residuesDir, filename);
    const residueText = [
      `# ${filename.replace('.md', '')}`,
      '',
      `> 対象 RFC: ${fx.sourceFile}`,
      `> 生成グラフ: ${fx.graphPath}`,
      '> 生成日時: 2026-08-17 12:00:00',
      `> 判定理由: ${decision.reasons.join(', ')}`,
      '',
      '## 未解決インベントリ',
      '',
      '### R-001 未実装機能',
      '- 要求事項: 機能が要件を満たしていない',
      '- 現状: 【OMISSION】',
      '- 証拠: グラフノード N0001 / sourceRanges RFC-ROOT.md:1-10',
      '- ステータス: open',
      '',
    ].join('\n');
    fs.writeFileSync(residuePath, residueText, 'utf8');

    const verdict = validateResidueOutput(fs.readFileSync(residuePath, 'utf8'));
    assert.equal(verdict.ok, true);
  });
});

describe('Empty graph handling', () => {
  it('does not crash and takes the RESIDUE branch', () => {
    const dir = path.join(tmpRoot, 'e2e-empty');
    const fx = materializeFixture(
      dir,
      buildEmptyGraph(path.join(dir, 'RFC-ROOT.md')),
      { withExamples: false, omitGrill: true }
    );
    const decision = checkReadmeWritable(fx.graphPath);
    assert.equal(decision.branch, 'RESIDUE');
    assert.ok(decision.reasons.length > 0);
  });
});

describe('Smoke test against crates/siprs (read-only)', () => {
  it('takes the RESIDUE branch because siprs has unresolved OMISSIONS', (t) => {
    const siprsGraph = path.resolve(__dirname, '../../../../crates/siprs/RFC-ROOT-GRAPH.json');
    if (!fs.existsSync(siprsGraph)) {
      t.skip(`siprs graph not found: ${siprsGraph}`);
      return;
    }
    // Verify ~/ expansion in the real graph and the expected branch decision.
    const raw = JSON.parse(fs.readFileSync(siprsGraph, 'utf8'));
    assert.match(raw.sourceFile, /^~\//);
    const paths = deriveOutputPaths(raw);
    assert.equal(paths.rfcDir, path.join(os.homedir(), 'shyme', 'zasso', 'crates', 'siprs'));
    const decision = checkReadmeWritable(siprsGraph);
    assert.equal(decision.branch, 'RESIDUE');
    assert.ok(decision.reasons.includes('unresolvedOmissions'));
  });
});
