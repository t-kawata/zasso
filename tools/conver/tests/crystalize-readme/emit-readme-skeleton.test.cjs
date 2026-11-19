// [::TICKET::] PX-452 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-452 --for-spec --no-implementation-order`.
// [::TICKET::] PX-451 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-451 --for-spec --no-implementation-order`.
/**
 * emit-readme-skeleton.test.cjs — Tests for emit-readme-skeleton.js (PX-156, Step 1 end)
 *
 * At the end of Step 1 a script mechanically writes a README.md skeleton: the
 * confirmed heading group (from CRYSTALIZE-Status.json grill.toc.nodes) plus the
 * trailing examples section. The output path is derived internally from the status
 * sourceFile (<rfcDir>/README.md) — there is no --readme flag. Both fresh and
 * refine modes emit the skeleton: an existing README.md (refine mode) is
 * overwritten so that Step 2 re-analyzes every section from scratch.
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
  backupHumanReadme,
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
    assert.ok(text.includes(`> Source RFC: ${path.join(tmpDir, 'RFC-ROOT.md')}`));
    assert.ok(text.includes(`> Generated graph: ${path.join(tmpDir, 'RFC-ROOT-GRAPH.json')}`));
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

  it('appends the examples heading as an H1 sibling of the usage headings, with TEMPLATE-EXAMPLES (C003)', () => {
    const text = emitSkeleton(makeStatus([]));
    const lines = text.trimEnd().split('\n');
    const lastHeadingIndex = lines.findLastIndex((line) => /^#+\s+\S/.test(line));
    assert.equal(lines[lastHeadingIndex], '# Examples (implementation samples) spec and design');
    assert.ok(text.includes(MARKER_TEMPLATE_EXAMPLES));
  });

  it('emits the examples heading at the same level as the top-level usage headings (all H1)', () => {
    const status = makeStatus([
      { id: 'H1', heading: 'クイックスタート', level: 1, confirmedContent: '本文', status: 'confirmed' },
    ]);
    const text = emitSkeleton(status);
    const headingLines = text.split('\n').filter((line) => /^#+\s+\S/.test(line));
    const usageLine = headingLines.find((line) => line.includes('クイックスタート'));
    const examplesLine = headingLines.find((line) => line.includes('Examples (implementation samples) spec and design'));
    assert.equal(usageLine.replace(/\s.*$/, ''), '#');
    assert.equal(examplesLine.replace(/\s.*$/, ''), '#');
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

  it('overwrites an existing README.md with the new skeleton (refine re-emits for full re-analysis)', () => {
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '## 旧見出し\n\nComplete prose from the previous run.\n', 'utf8');
    const text = emitSkeletonToFile(makeStatus([
      { id: 'H1', heading: 'クイックスタート', level: 1, confirmedContent: '本文', status: 'confirmed' },
    ]));
    assert.ok(!text.includes('旧見出し'), 'the previous body is replaced by the new skeleton');
    assert.ok(text.includes('# クイックスタート'));
    assert.ok(text.includes(MARKER_TEMPLATE_README));
    assert.ok(text.includes(MARKER_TEMPLATE_EXAMPLES));
    const onDisk = fs.readFileSync(path.join(tmpDir, 'README.md'), 'utf8');
    assert.equal(onDisk, text);
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

  it('re-emits the skeleton over an existing README.md (refine mode, exit 0)', () => {
    const sourceFile = path.join(tmpDir, 'cli-refine', 'RFC-ROOT.md');
    fs.mkdirSync(path.dirname(sourceFile), { recursive: true });
    fs.writeFileSync(sourceFile, '# RFC Root\n', 'utf8');
    fs.writeFileSync(path.join(path.dirname(sourceFile), 'README.md'), '# 旧タイトル\n\nComplete prose.\n', 'utf8');
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
    assert.equal(result.status, 0);
    const readme = fs.readFileSync(path.join(path.dirname(sourceFile), 'README.md'), 'utf8');
    assert.ok(readme.includes(MARKER_TEMPLATE_EXAMPLES));
    assert.ok(!readme.includes('旧タイトル'));
  });
});

describe('--plan carry-forward — PX-451', () => {
  it('preserves a body and marks only the reanalyzed section', () => {
    const status = makeStatus([
      { id: 'H1', heading: 'Quick start', level: 1, confirmedContent: 'x', status: 'derived' },
      { id: 'H2', heading: 'Errors', level: 1, confirmedContent: 'y', status: 'derived' },
    ]);
    const text = emitSkeleton(status, {
      plan: {
        nodes: [
          { id: 'H1', heading: 'Quick start', level: 1, action: 'preserve', body: 'Complete prose.' },
          { id: 'H2', heading: 'Errors', level: 1, action: 'reanalyze' },
        ],
        examples: { action: 'preserve', body: 'Complete example.' },
      },
    });
    assert.ok(text.includes('Complete prose.'));
    assert.equal((text.match(/<::TEMPLATE-README::>/g) || []).length, 1);
    assert.ok(text.includes('Complete example.'));
    assert.ok(!text.includes(MARKER_TEMPLATE_EXAMPLES));
  });

  it('rejects Japanese content when englishOnly is set', () => {
    const status = makeStatus([
      { id: 'H1', heading: 'クイックスタート', level: 1, confirmedContent: 'x', status: 'derived' },
    ]);
    assert.throws(() => emitSkeletonToFile(status, { englishOnly: true }), /README language violation/);
  });
});

describe('C001 — human README backup', () => {
  it('backs up a human README once and never overwrites the backup', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'px452-c001-'));
    try {
      const readmePath = path.join(dir, 'README.md');
      fs.writeFileSync(readmePath, '# Human notes\n\nKeep me.\n', 'utf8');
      const first = backupHumanReadme(readmePath);
      assert.equal(first.backedUp, true);
      assert.equal(
        fs.readFileSync(path.join(dir, 'README.pre-crystalize.md'), 'utf8'),
        '# Human notes\n\nKeep me.\n',
      );
      const second = backupHumanReadme(readmePath);
      assert.equal(second.backedUp, false);
      assert.equal(second.reason, 'backup-exists');
      fs.writeFileSync(readmePath, '# Rewritten notes\n', 'utf8');
      backupHumanReadme(readmePath);
      assert.equal(
        fs.readFileSync(path.join(dir, 'README.pre-crystalize.md'), 'utf8'),
        '# Human notes\n\nKeep me.\n',
        'the first backup is never replaced',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not back up a marked README or a missing README', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'px452-c001-marked-'));
    try {
      const readmePath = path.join(dir, 'README.md');
      fs.writeFileSync(readmePath, '# Generated\n\n<::TEMPLATE-README::>\n', 'utf8');
      assert.deepEqual(backupHumanReadme(readmePath), { backedUp: false, reason: 'marked-readme' });
      assert.equal(fs.existsSync(path.join(dir, 'README.pre-crystalize.md')), false);
      assert.deepEqual(backupHumanReadme(path.join(dir, 'absent.md')), { backedUp: false, reason: 'no-readme' });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('C003 — packageRoot README writer', () => {
  it('prefers packageRoot over rfcDir and keeps the legacy path when absent', () => {
    const rfcDir = path.join(tmpDir, 'docs');
    const status = {
      sourceFile: path.join(rfcDir, 'RFC-ROOT.md'),
      graphFile: path.join(rfcDir, 'RFC-ROOT-GRAPH.json'),
      grill: { toc: { nodes: [] } },
    };
    assert.equal(deriveReadmePath(status, { packageRoot: tmpDir }), path.join(tmpDir, 'README.md'));
    assert.equal(deriveReadmePath(status), path.join(rfcDir, 'README.md'));
  });

  it('parses --package-root and the CLI writes the package-root README', () => {
    const root = path.join(tmpDir, 'cli-package-root');
    const rfcDir = path.join(root, 'docs');
    fs.mkdirSync(rfcDir, { recursive: true });
    const sourceFile = path.join(rfcDir, 'RFC-ROOT.md');
    fs.writeFileSync(sourceFile, '# RFC Root\n', 'utf8');
    const graphPath = path.join(rfcDir, 'RFC-ROOT-GRAPH.json');
    fs.writeFileSync(graphPath, JSON.stringify({ sourceFile, mainLanguage: 'rust', nodes: [], edges: [] }), 'utf8');
    fs.writeFileSync(path.join(rfcDir, 'CRYSTALIZE-Status.json'), JSON.stringify({
      sourceFile,
      graphFile: graphPath,
      currentStep: 2,
      steps: {},
      grill: { tocApproved: true, examplesApproved: false, toc: { nodes: [] }, sections: [] },
    }), 'utf8');
    fs.writeFileSync(path.join(rfcDir, 'README.md'), '# Human RFC notes\n', 'utf8');

    const parsed = parseArguments([`--graph=${graphPath}`, `--package-root=${root}`]);
    assert.equal(parsed.packageRoot, root);

    const result = spawnSync('node', [SCRIPT, `--graph=${graphPath}`, `--package-root=${root}`], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(root, 'README.md')), true);
    assert.equal(fs.existsSync(path.join(rfcDir, 'README.md')), true, 'the human RFC-dir README is untouched');
    assert.ok(fs.readFileSync(path.join(rfcDir, 'README.md'), 'utf8').includes('Human RFC notes'));
  });
});

describe('C010 and C014 — preserved body integrity', () => {
  it('copies a preserved body byte-identically', () => {
    const body = 'Run `tool --help`.\n\n- first\n- second';
    const status = makeStatus([]);
    const text = emitSkeleton(status, {
      plan: { nodes: [{ id: 'H1', heading: 'Quick start', level: 1, action: 'preserve', body }] },
    });
    assert.ok(text.includes(body));
    assert.equal((text.match(/<::TEMPLATE-README::>/g) || []).length, 0);
  });

  it('refuses a preserved body that starts with a markdown heading', () => {
    const status = makeStatus([]);
    assert.throws(() => emitSkeleton(status, {
      plan: { nodes: [{ id: 'H1', heading: 'Quick start', level: 1, action: 'preserve', body: '## Injected\n\nBody.' }] },
    }), /must not include a heading/);
  });
});
