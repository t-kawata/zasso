/**
 * emit-readme-skeleton.test.cjs — Tests for emit-readme-skeleton.js (PX-156, Step 1 end)
 *
 * At the end of Step 1 (fresh mode only) a script mechanically writes a README.md
 * skeleton: the confirmed heading group (from CRYSTALIZE-Status.json grill.toc.nodes)
 * plus the trailing examples section. The output path is derived internally from
 * the status sourceFile (<rfcDir>/README.md) — there is no --readme flag. An
 * existing README.md (refine mode) is never overwritten.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/emit-readme-skeleton.js');
const {
  MARKER_TEMPLATE_README,
  MARKER_TEMPLATE_EXAMPLES,
} = require(path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/validate-marker-grammar.js'));
const {
  emitSkeleton,
  emitSkeletonToFile,
  deriveReadmePath,
  parseArguments,
} = require(SCRIPT);

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

describe('parseArguments', () => {
  it('accepts --graph without a --readme flag (readme is derived internally)', () => {
    const parsed = parseArguments([`--graph=${path.join(tmpDir, 'RFC-ROOT-GRAPH.json')}`]);
    assert.equal(parsed.graphPath, path.join(tmpDir, 'RFC-ROOT-GRAPH.json'));
    assert.equal(parsed.statusPath, null);
  });

  it('rejects a --readme flag', () => {
    assert.throws(() => parseArguments([`--graph=g.json`, `--readme=${tmpDir}/README.md`]), /Unknown argument/);
  });
});

describe('deriveReadmePath', () => {
  it('derives <rfcDir>/README.md from the status sourceFile', () => {
    const status = makeStatus([]);
    assert.equal(deriveReadmePath(status), path.join(tmpDir, 'README.md'));
  });
});

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
  it('writes the skeleton to the internally-derived README.md path', () => {
    emitSkeletonToFile(makeStatus([
      { id: 'H1', heading: 'クイックスタート', level: 1, confirmedContent: '本文', status: 'confirmed' },
    ]));
    const text = fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf8');
    assert.ok(text.includes(MARKER_TEMPLATE_README));
    assert.ok(text.includes(MARKER_TEMPLATE_EXAMPLES));
  });

  it('refuses to overwrite an existing README.md (fresh-mode-only; refine preserves)', () => {
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '## A\n\nComplete prose.\n', 'utf8');
    assert.throws(() => emitSkeletonToFile(makeStatus([])), /refus/i);
  });
});

describe('CLI', () => {
  it('emits the skeleton via --graph with an internally-derived README path', () => {
    // Materialize graph + status in a fresh RFC dir
    const sourceFile = path.join(tmpDir, 'cli', 'RFC-ROOT.md');
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourceFile, '# RFC Root\n', 'utf8');
    const graphPath = path.join(path.dirname(sourceFile), 'RFC-ROOT-GRAPH.json');
    fs.writeFileSync(graphPath, JSON.stringify({ sourceFile, mainLanguage: 'rust', nodes: [], edges: [] }), 'utf8');
    fs.writeFileSync(path.join(path.dirname(sourceFile), 'CRYSTALIZE-Status.json'), JSON.stringify({
      sourceFile,
      graphFile: graphPath,
      currentStep: 2,
      steps: {},
      grill: {
        tocApproved: true,
        examplesApproved: false,
        toc: { nodes: [{ id: 'H1', heading: 'クイックスタート', level: 1, confirmedContent: 'x', status: 'confirmed' }] },
        sections: [],
      },
    }), 'utf8');

    const result = spawnSync('node', [SCRIPT, `--graph=${graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    const readme = fs.readFileSync(path.join(path.dirname(sourceFile), 'README.md'), 'utf8');
    assert.ok(readme.includes(MARKER_TEMPLATE_README));
  });

  it('exits 1 in refine mode when README.md already exists', () => {
    const sourceFile = path.join(tmpDir, 'cli-refine', 'RFC-ROOT.md');
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourceFile, '# RFC Root\n', 'utf8');
    fs.writeFileSync(path.join(path.dirname(sourceFile), 'README.md'), '# Existing\n', 'utf8');
    const graphPath = path.join(path.dirname(sourceFile), 'RFC-ROOT-GRAPH.json');
    fs.writeFileSync(graphPath, JSON.stringify({ sourceFile, mainLanguage: 'rust', nodes: [], edges: [] }), 'utf8');
    fs.writeFileSync(path.join(path.dirname(sourceFile), 'CRYSTALIZE-Status.json'), JSON.stringify({
      sourceFile,
      graphFile: graphPath,
      currentStep: 2,
      steps: {},
      grill: { tocApproved: true, examplesApproved: false, toc: { nodes: [] }, sections: [] },
    }), 'utf8');

    const result = spawnSync('node', [SCRIPT, `--graph=${graphPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /refus/i);
  });
});
