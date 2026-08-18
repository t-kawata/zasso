/**
 * backfill-confirmed-content.test.cjs — Tests for the idempotent migration that
 * backfills `confirmedContent` into an existing crystalize-readme run.
 *
 * The migration closes the gap introduced by the confirmedContent feature: the
 * current CRYSTALIZE-Status.json sections lack the field and the current README.md
 * section bodies lack the confirmed-content lead paragraph. Both backfills must
 * be idempotent so re-running the migration is safe.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/backfill-confirmed-content.js');
const { MARKER_README_RESIDUE, MARKER_TEMPLATE_EXAMPLES } = require(path.resolve(__dirname, '../../.claude/scripts/crystalize-readme/validate-marker-grammar.js'));
const { backfillStatus, backfillReadme } = require(SCRIPT);

const EXAMPLES_HEADING = '## Examples (implementation samples) spec and design';

function readmeWith(...sectionTexts) {
  return ['# RFC-ROOT', '', '> 対象 RFC: /path/RFC-ROOT.md', '> 生成グラフ: /path/RFC-ROOT-GRAPH.json', '', ...sectionTexts].join('\n');
}

function statusWith(nodes, sections = []) {
  return {
    sourceFile: '/tmp/RFC-ROOT.md',
    graphFile: '/tmp/RFC-ROOT-GRAPH.json',
    grill: { tocApproved: true, examplesApproved: false, toc: { nodes }, sections },
  };
}

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'px156-bcc-'));
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('backfillStatus — sections[].confirmedContent', () => {
  it('copies confirmedContent from the matching toc node by id', () => {
    const status = statusWith(
      [{ id: 'H1', heading: 'クイックスタート', confirmedContent: 'lead-A', status: 'confirmed' }],
      [{ id: 'H1', heading: 'クイックスタート', state: 'residue' }]
    );
    backfillStatus(status);
    assert.equal(status.grill.sections[0].confirmedContent, 'lead-A');
  });

  it('sets confirmedContent to null when no node matches the section id', () => {
    const status = statusWith(
      [{ id: 'H1', heading: 'クイックスタート', confirmedContent: 'lead-A', status: 'confirmed' }],
      [{ id: 'H1', heading: 'クイックスタート', state: 'residue' }, { id: 'H1-1', heading: '不明', state: 'complete' }]
    );
    backfillStatus(status);
    assert.equal(status.grill.sections[0].confirmedContent, 'lead-A');
    assert.equal(status.grill.sections[1].confirmedContent, null);
  });

  it('keeps state and heading intact while filling confirmedContent', () => {
    const status = statusWith(
      [{ id: 'H1', heading: 'クイックスタート', confirmedContent: 'lead-A', status: 'confirmed' }],
      [{ id: 'H1', heading: 'クイックスタート', state: 'residue' }]
    );
    backfillStatus(status);
    assert.deepEqual(status.grill.sections[0], { id: 'H1', heading: 'クイックスタート', state: 'residue', confirmedContent: 'lead-A' });
  });

  it('is idempotent — a second pass yields the same sections', () => {
    const status = statusWith(
      [{ id: 'H1', heading: 'クイックスタート', confirmedContent: 'lead-A', status: 'confirmed' }],
      [{ id: 'H1', heading: 'クイックスタート', state: 'complete' }]
    );
    backfillStatus(status);
    const first = JSON.stringify(status.grill.sections);
    backfillStatus(status);
    assert.equal(JSON.stringify(status.grill.sections), first);
  });

  it('is a no-op when the status has no sections', () => {
    const status = statusWith([{ id: 'H1', heading: 'A', confirmedContent: 'lead', status: 'confirmed' }]);
    backfillStatus(status);
    assert.deepEqual(status.grill.sections, []);
  });
});

describe('backfillReadme — confirmedContent lead paragraph', () => {
  it('inserts a confirmedContent paragraph after the heading of a residue section', () => {
    const heading = 'クイックスタート（SipClient 初期化と最初のステップ）';
    const status = statusWith(
      [{ id: 'H1', heading, confirmedContent: 'トランスポート（UDP/TCP/TLS）と STUN を設定した実用的な初期化コード', status: 'confirmed' }]
    );
    const readme = readmeWith(`# ${heading}\n\n${MARKER_README_RESIDUE}\n## RESIDUE — 完全記述の作成不可\n\nevidence`);
    const out = backfillReadme(readme, status);
    assert.ok(out.includes(`# ${heading}\n\nトランスポート（UDP/TCP/TLS）と STUN を設定した実用的な初期化コード\n\n${MARKER_README_RESIDUE}`));
  });

  it('inserts a confirmedContent paragraph into a complete section body', () => {
    const status = statusWith(
      [{ id: 'H1', heading: 'クイックスタート', confirmedContent: 'lead-A', status: 'confirmed' }]
    );
    const readme = readmeWith(`# クイックスタート\n\nComplete prose.`);
    const out = backfillReadme(readme, status);
    assert.ok(out.includes('# クイックスタート\n\nlead-A\n\nComplete prose.'));
  });

  it('leaves the Examples section untouched even when content would otherwise match', () => {
    const status = statusWith(
      [{ id: 'H1', heading: 'クイックスタート', confirmedContent: 'lead-A', status: 'confirmed' }]
    );
    const readme = readmeWith(`# クイックスタート\n\nComplete prose.`, `${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`);
    const out = backfillReadme(readme, status);
    assert.ok(out.includes(`${EXAMPLES_HEADING}\n\n${MARKER_TEMPLATE_EXAMPLES}`));
  });

  it('is idempotent — a second pass does not duplicate the lead paragraph', () => {
    const status = statusWith(
      [{ id: 'H1', heading: 'クイックスタート', confirmedContent: 'lead-A', status: 'confirmed' }]
    );
    const readme = readmeWith(`# クイックスタート\n\n${MARKER_README_RESIDUE}\n## RESIDUE\n\nevidence`);
    const once = backfillReadme(readme, status);
    const twice = backfillReadme(once, status);
    assert.equal(twice, once);
  });

  it('leaves a section unchanged when the node has no confirmedContent', () => {
    const status = statusWith([{ id: 'H1', heading: 'クイックスタート', status: 'confirmed' }]);
    const readme = readmeWith(`# クイックスタート\n\nComplete prose.`);
    assert.equal(backfillReadme(readme, status), readme);
  });

  it('leaves a section unchanged when its heading matches no toc node', () => {
    const status = statusWith([{ id: 'H1', heading: '別の見出し', confirmedContent: 'lead', status: 'confirmed' }]);
    const readme = readmeWith(`# クイックスタート\n\nComplete prose.`);
    assert.equal(backfillReadme(readme, status), readme);
  });
});

describe('CLI — end-to-end migration', () => {
  it('backfills both CRYSTALIZE-Status.json and README.md in one invocation', () => {
    const dir = path.join(tmpDir, 'cli-run');
    fs.mkdirSync(dir, { recursive: true });
    const sourceFile = path.join(dir, 'RFC-ROOT.md');
    fs.writeFileSync(sourceFile, '# RFC Root\n', 'utf8');
    const readmePath = path.join(dir, 'README.md');
    fs.writeFileSync(readmePath, readmeWith(`# クイックスタート\n\n${MARKER_README_RESIDUE}\n## RESIDUE\n\nevidence`), 'utf8');
    const graphPath = path.join(dir, 'RFC-ROOT-GRAPH.json');
    fs.writeFileSync(graphPath, JSON.stringify({ sourceFile, mainLanguage: 'rust', nodes: [], edges: [] }), 'utf8');
    const statusPath = path.join(dir, 'CRYSTALIZE-Status.json');
    fs.writeFileSync(statusPath, JSON.stringify({
      sourceFile,
      graphFile: graphPath,
      grill: {
        tocApproved: true,
        examplesApproved: false,
        toc: { nodes: [{ id: 'H1', heading: 'クイックスタート', confirmedContent: 'lead-A', status: 'confirmed' }] },
        sections: [{ id: 'H1', heading: 'クイックスタート', state: 'residue' }],
      },
    }, null, 2), 'utf8');

    const result = spawnSync('node', [SCRIPT, `--status=${statusPath}`], { encoding: 'utf8' });
    assert.equal(result.status, 0);

    const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    assert.equal(status.grill.sections[0].confirmedContent, 'lead-A');
    const readme = fs.readFileSync(readmePath, 'utf8');
    assert.ok(readme.includes('# クイックスタート\n\nlead-A\n\n<::README-RESIDUE::>'));

    // Re-running the migration leaves both files byte-identical (idempotent).
    const statusAfter = fs.readFileSync(statusPath, 'utf8');
    const readmeAfter = fs.readFileSync(readmePath, 'utf8');
    const second = spawnSync('node', [SCRIPT, `--status=${statusPath}`], { encoding: 'utf8' });
    assert.equal(second.status, 0);
    assert.equal(fs.readFileSync(statusPath, 'utf8'), statusAfter);
    assert.equal(fs.readFileSync(readmePath, 'utf8'), readmeAfter);
  });
});
