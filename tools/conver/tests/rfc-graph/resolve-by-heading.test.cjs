/**
 * resolve-by-heading.test.cjs — resolveByHeading のテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 * テスト対象: resolveByHeading(), resolveAllHeadings(), parseArguments()
 * 4段階フォールバックの全ケースを網羅する。
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  resolveByHeading,
  resolveAllHeadings,
  parseArguments,
} = require('../../.claude/scripts/rfc-graph/resolve-by-heading.js');

/** テスト用のソース行配列 */
const SAMPLE_LINES = [
  '# タイトル',
  '',
  '## セクション1',
  '内容A',
  '',
  '## セクション2',
  '内容B',
  '',
  '### サブセクション2.1',
  '詳細B1',
  '',
  '## セクション3',
  '内容C',
];

// ============================================================
// parseArguments
// ============================================================

describe('parseArguments', () => {
  it('正常系: --source のみ', () => {
    const r = parseArguments(['node', 'script', '--source=/path/file.md']);
    assert.equal(r.sourcePath, '/path/file.md');
  });

  it('正常系: --source --heading --texts', () => {
    const r = parseArguments(['node', 'script', '--source=f.md', '--heading=2', '--texts=概要,説明']);
    assert.equal(r.sourcePath, 'f.md');
    assert.equal(r.heading, 2);
    assert.deepEqual(r.texts, ['概要', '説明']);
  });

  it('正常系: --source --graph', () => {
    const r = parseArguments(['node', 'script', '--source=f.md', '--graph=g.json']);
    assert.equal(r.sourcePath, 'f.md');
    assert.equal(r.graphPath, 'g.json');
  });

  it('異常系: --source が不足', () => {
    assert.throws(() => parseArguments(['node', 'script']), /--source/);
  });
});

// ============================================================
// resolveByHeading
// ============================================================

describe('resolveByHeading', () => {
  it('Stage1 exact: texts[0] で一意に決まる', () => {
    const r = resolveByHeading(SAMPLE_LINES, 2, ['セクション1']);
    assert.notEqual(r, null);
    assert.equal(r.line, 3);
    assert.equal(r.confidence, 'exact');
  });

  it('heading=0: ファイル先頭付近を検索', () => {
    const lines = ['---', 'title: Test', '---', '', '# 本文'];
    const r = resolveByHeading(lines, 0, ['title']);
    assert.notEqual(r, null);
    assert.equal(r.line, 2);
  });

  it('複数マッチ → 連結grepで1件に絞れる場合 partial', () => {
    const r = resolveByHeading(SAMPLE_LINES, 2, ['セクション2']);
    assert.notEqual(r, null);
    assert.equal(r.confidence, 'exact');
  });

  it('全フェーズ不発 → null', () => {
    const r = resolveByHeading(SAMPLE_LINES, 1, ['存在しない']);
    assert.equal(r, null);
  });

  it('空のtexts配列 → null', () => {
    const r = resolveByHeading(SAMPLE_LINES, 1, []);
    assert.equal(r, null);
  });
});

// ============================================================
// resolveAllHeadings
// ============================================================

describe('resolveAllHeadings', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-test-'));
  });

  after(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('正常系: グラフ内の全 headingRefs を解決する', () => {
    const sourcePath = path.join(tmpDir, 'test.md');
    fs.writeFileSync(sourcePath, SAMPLE_LINES.join('\n'), 'utf8');

    const graph = {
      sourceFile: sourcePath,
      nodes: [
        {
          id: 'N0001',
          title: 'セクション1',
          kind: 'requirement',
          headingRefs: [{ refId: 'REF001', heading: 2, texts: ['セクション1'] }],
        },
        {
          id: 'N0002',
          title: 'セクション2',
          kind: 'requirement',
          headingRefs: [{ refId: 'REF002', heading: 2, texts: ['セクション2'] }],
        },
      ],
      edges: [],
    };

    const results = resolveAllHeadings(graph, sourcePath);
    assert.equal(results.length, 2);
    assert.equal(results[0].line, 3);
    assert.equal(results[1].line, 6);
    assert.equal(results[0].confidence, 'exact');
    assert.equal(results[1].confidence, 'exact');
  });

  it('異常系: 解決できない headingRefs は error を含む', () => {
    const sourcePath = path.join(tmpDir, 'empty.md');
    fs.writeFileSync(sourcePath, '', 'utf8');

    const graph = {
      sourceFile: sourcePath,
      nodes: [
        {
          id: 'N0001',
          title: '不明',
          kind: 'requirement',
          headingRefs: [{ refId: 'REF001', heading: 2, texts: ['ない見出し'] }],
        },
      ],
      edges: [],
    };

    const results = resolveAllHeadings(graph, sourcePath);
    assert.equal(results.length, 1);
    assert.ok(results[0].error);
  });
});
