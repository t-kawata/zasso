/**
 * loop-drive-readme.test.cjs — Tests for loop-drive-readme.js (PX-156, Step 2 loop driver)
 *
 * The independent loop-driving script scans README.md markers by heading, reports
 * unresolved sections, verifies the loop exit condition (zero TEMPLATE markers;
 * every section complete or residue), and applies per-section transitions.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/loop-drive-readme.js');
const {
  MARKER_TEMPLATE_README,
  MARKER_README_RESIDUE,
  MARKER_TEMPLATE_EXAMPLES,
  MARKER_EXAMPLES_RESIDUE,
} = require(path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/validate-marker-grammar.js'));
const { scanMarkers, checkLoopReady, resolveSection, markResidue } = require(SCRIPT);

const EXAMPLES_HEADING = '## Examples (implementation samples) spec and design';

function readmeWith(...sectionTexts) {
  return ['# siprs README', '', '> 対象 RFC: /path/RFC-ROOT.md', '> 生成グラフ: /path/RFC-ROOT-GRAPH.json', '', ...sectionTexts].join('\n');
}

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px156-ldr-'));
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('scanMarkers', () => {
  it('classifies pending / complete / residue sections and counts templates', () => {
    const text = readmeWith(
      `## A\n\n${MARKER_TEMPLATE_README}`,
      `## B\n\nComplete prose.`,
      `## C\n\n${MARKER_README_RESIDUE} evidence`,
      `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`
    );
    const scan = scanMarkers(text);
    assert.deepEqual(scan.pending, ['A']);
    assert.deepEqual(scan.complete, ['B']);
    assert.deepEqual(scan.residue, ['C']);
    assert.equal(scan.templateCount, 2);
  });
});

describe('checkLoopReady — C002', () => {
  it('is not ready while a TEMPLATE-README remains (C002-Pre)', () => {
    const text = readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`);
    const verdict = checkLoopReady(text);
    assert.equal(verdict.ready, false);
    assert.deepEqual(verdict.unresolved, ['A']);
  });

  it('is ready when zero TEMPLATE markers remain and only complete|residue sections exist (C002-Post)', () => {
    const text = readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\n${MARKER_EXAMPLES_RESIDUE} examples/ missing`);
    const verdict = checkLoopReady(text);
    assert.equal(verdict.ready, true);
    assert.deepEqual(verdict.unresolved, []);
  });
});

describe('resolveSection — C001 complete branch', () => {
  it('replaces the section body and removes the TEMPLATE-README marker', () => {
    const readme = readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`);
    const out = resolveSection(readme, 'A', `## A\n\nComplete usage prose.`);
    assert.ok(!out.includes(MARKER_TEMPLATE_README));
    assert.ok(out.includes('Complete usage prose.'));
  });

  it('leaves other sections untouched', () => {
    const readme = readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `## B\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`);
    const out = resolveSection(readme, 'A', `## A\n\nDone.`);
    assert.ok(out.includes(`## B\n\n${MARKER_TEMPLATE_README}`));
  });

  it('throws when the section heading does not exist', () => {
    const readme = readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`);
    assert.throws(() => resolveSection(readme, 'Nope', '## Nope\n\nX.'), /not found/);
  });
});

describe('markResidue — C001 residue branch', () => {
  it('replaces the TEMPLATE-README marker with README-RESIDUE plus evidence (C001-Post)', () => {
    const readme = readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`);
    const out = markResidue(readme, 'A', 'Evidence: spec missing; reinforcement: add API.');
    assert.ok(!out.includes(MARKER_TEMPLATE_README));
    assert.ok(out.includes(MARKER_README_RESIDUE));
    assert.ok(out.includes('Evidence: spec missing; reinforcement: add API.'));
  });

  it('keeps the original heading level in the residue section', () => {
    const readme = readmeWith(`### A-1\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`);
    const out = markResidue(readme, 'A-1', 'evidence');
    assert.ok(out.includes(`### A-1\n\n${MARKER_README_RESIDUE}`));
  });
});

describe('CLI — --check', () => {
  it('exits 0 when the loop has converged', () => {
    const filePath = path.join(tmpDir, 'converged.md');
    fs.writeFileSync(filePath, readmeWith(`## A\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\nSample.`), 'utf8');
    const result = spawnSync('node', [SCRIPT, '--check', `--readme=${filePath}`], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const out = JSON.parse(result.stdout);
    assert.equal(out.ready, true);
  });

  it('exits 1 and lists unresolved sections when templates remain', () => {
    const filePath = path.join(tmpDir, 'pending.md');
    fs.writeFileSync(filePath, readmeWith(`## A\n\n${MARKER_TEMPLATE_README}`, `${EXAMPLES_HEADING}\n\nSample.`), 'utf8');
    const result = spawnSync('node', [SCRIPT, '--check', `--readme=${filePath}`], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    const out = JSON.parse(result.stdout);
    assert.equal(out.ready, false);
    assert.ok(out.unresolved.includes('A'));
  });
});
