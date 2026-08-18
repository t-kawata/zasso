/**
 * emit-readme-skeleton.test.cjs — Tests for emit-readme-skeleton.js (PX-156, Step 1 end)
 *
 * At the end of Step 1 a script mechanically writes a README.md skeleton: the
 * confirmed heading group (from CRYSTALIZE-Status.json grill.toc.nodes) plus the
 * trailing examples section. Each usage heading is followed by a
 * <::TEMPLATE-README::> marker line; the examples heading by <::TEMPLATE-EXAMPLES::>.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/emit-readme-skeleton.js');
const {
  MARKER_TEMPLATE_README,
  MARKER_TEMPLATE_EXAMPLES,
} = require(path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/validate-marker-grammar.js'));
const { emitSkeleton, emitSkeletonToFile } = require(SCRIPT);

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px156-ers-'));
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function makeStatus(nodes) {
  return {
    sourceFile: path.join(tmpDir, 'RFC-ROOT.md'),
    graphFile: path.join(tmpDir, 'RFC-ROOT-GRAPH.json'),
    currentStep: 2,
    steps: {},
    grill: { tocApproved: true, examplesApproved: false, toc: { nodes } },
  };
}

describe('emitSkeleton', () => {
  it('emits the H1 title, target RFC line, and graph line', () => {
    const text = emitSkeleton(makeStatus([]));
    assert.ok(text.startsWith('# RFC-ROOT\n'));
    assert.ok(text.includes(`> 対象 RFC: ${path.join(tmpDir, 'RFC-ROOT.md')}`));
    assert.ok(text.includes(`> 生成グラフ: ${path.join(tmpDir, 'RFC-ROOT-GRAPH.json')}`));
  });

  it('emits exactly one TEMPLATE-README per confirmed usage heading (C001-Pre)', () => {
    const status = makeStatus([
      { id: 'H1', heading: 'クイックスタート', level: 1, confirmedContent: '本文', status: 'confirmed' },
      { id: 'H1-1', heading: 'アカウントの追加', level: 2, confirmedContent: '本文2', status: 'confirmed' },
    ]);
    const text = emitSkeleton(status);
    assert.equal((text.match(/<::TEMPLATE-README::>/g) || []).length, 2);
    assert.ok(text.includes('# クイックスタート'));
    assert.ok(text.includes('## アカウントの追加'));
  });

  it('appends the examples heading with TEMPLATE-EXAMPLES as the trailing section (C003)', () => {
    const text = emitSkeleton(makeStatus([]));
    const lines = text.trimEnd().split('\n');
    const lastHeadingIndex = lines.findLastIndex((line) => /^#+\s+\S/.test(line));
    assert.equal(lines[lastHeadingIndex], '## Examples (implementation samples) spec and design');
    assert.ok(text.includes(MARKER_TEMPLATE_EXAMPLES));
  });

  it('emits no usage markers when there are no confirmed headings', () => {
    const text = emitSkeleton(makeStatus([]));
    assert.equal((text.match(/<::TEMPLATE-README::>/g) || []).length, 0);
  });
});

describe('emitSkeletonToFile', () => {
  it('writes the skeleton to the given path', () => {
    const readmePath = path.join(tmpDir, 'README.md');
    emitSkeletonToFile(makeStatus([
      { id: 'H1', heading: 'クイックスタート', level: 1, confirmedContent: '本文', status: 'confirmed' },
    ]), readmePath);
    const text = fs.readFileSync(readmePath, 'utf8');
    assert.ok(text.includes(MARKER_TEMPLATE_README));
    assert.ok(text.includes(MARKER_TEMPLATE_EXAMPLES));
  });

  it('refuses to overwrite a README that still has unresolved TEMPLATE markers (refine-mode safety)', () => {
    const readmePath = path.join(tmpDir, 'existing.md');
    fs.writeFileSync(readmePath, `## A\n\n${MARKER_TEMPLATE_README}\n`, 'utf8');
    assert.throws(() => emitSkeletonToFile(makeStatus([]), readmePath), /refus/i);
  });

  it('overwrites a fully-written README with no markers', () => {
    const readmePath = path.join(tmpDir, 'complete.md');
    fs.writeFileSync(readmePath, '## A\n\nComplete prose.\n', 'utf8');
    const text = emitSkeletonToFile(makeStatus([]), readmePath);
    assert.ok(text.includes(MARKER_TEMPLATE_EXAMPLES));
  });
});
