/**
 * query-fix-hints.test.cjs — query-fix-hints.js のテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 * テスト対象: filterEntries, formatAsMarkdown, parseArguments
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  parseArguments,
  loadHintsFile,
  filterEntries,
  formatAsMarkdown,
} = require('../../.claude/scripts/rfc-graph/query-fix-hints.js');

/** テスト用の _fix_graph_hints.json データ */
const SAMPLE_HINTS = {
  generatedAt: '2026-07-08T12:00:00.000Z',
  totalBroken: 4,
  uniqueBroken: 4,
  nodes: [
    {
      nodeId: 'N0001',
      nodeTitle: '概要ノード',
      refId: 'REF001',
      diagnosis: 'M1',
      score: 0,
      heading: 2,
      texts: ['存在しない見出し'],
      details: {
        tokenMatches: [
          { token: '存在しない見出し', matched: false, matchCount: 0 },
        ],
        candidateLines: [
          { line: 3, text: '## セクション1', score: 0 },
        ],
      },
      summary: 'どのトークンもマッチしません。',
      remedyHint: 'headingRefs が全く異なります。ソースの見出しが改名された可能性があります。',
      remedyCommand: 'crud.js update --graph=<g> --source=<s> --id=N0001 --updateHeadingRefs',
    },
    {
      nodeId: 'N0002',
      nodeTitle: '詳細ノード',
      refId: 'REF002',
      diagnosis: 'M5',
      score: 75,
      heading: 2,
      texts: ['セクション', '1', 'タイトル'],
      details: {
        tokenMatches: [
          { token: 'セクション', matched: true, matchCount: 3 },
          { token: '1', matched: true, matchCount: 1 },
          { token: 'タイトル', matched: false, matchCount: 0 },
        ],
        candidateLines: [
          { line: 3, text: '## セクション1', score: 67 },
          { line: 7, text: '## セクション2', score: 33 },
        ],
      },
      summary: 'ほぼ一致しています（1トークン不足）。',
      remedyHint: '細かい表記揺れの可能性があります。',
      remedyCommand: 'crud.js update --graph=<g> --source=<s> --id=N0002 --updateHeadingRefs',
    },
    {
      nodeId: 'N0100',
      nodeTitle: '別ノード',
      refId: 'REF101',
      diagnosis: 'M8',
      score: 50,
      heading: 1,
      texts: ['サブセクション2.1'],
      details: {
        tokenMatches: [
          { token: 'サブセクション2.1', matched: false, matchCount: 0 },
        ],
        candidateLines: [
          { line: 9, text: '### サブセクション2.1', score: 100 },
        ],
      },
      summary: '別の見出しレベルの方が適切です。',
      remedyHint: '見出しレベルが誤っています。h3 が正しい可能性があります。',
      remedyCommand: 'crud.js update --graph=<g> --source=<s> --id=N0100 --heading=3',
    },
    {
      nodeId: 'N0101',
      nodeTitle: '共存不可能ノード',
      refId: 'REF102',
      diagnosis: 'M9',
      score: 0,
      heading: 2,
      texts: ['セクション1', 'セクション3'],
      details: {
        tokenMatches: [
          { token: 'セクション1', matched: false, matchCount: 1 },
          { token: 'セクション3', matched: false, matchCount: 1 },
        ],
        candidateLines: [
          { line: 3, text: '## セクション1', score: 50 },
          { line: 12, text: '## セクション3', score: 50 },
        ],
      },
      summary: 'トークンが共存不可能です。',
      remedyHint: '1つの headingRef に複数セクションのトークンが混在しています。',
      remedyCommand: 'crud.js update --graph=<g> --source=<s> --id=N0101 --splitHeadingRefs',
    },
  ],
};

/** 空の hints データ */
const EMPTY_HINTS = {
  generatedAt: '2026-07-08T12:00:00.000Z',
  totalBroken: 0,
  uniqueBroken: 0,
  nodes: [],
};

// ============================================================
// parseArguments
// ============================================================

describe('parseArguments', () => {
  it('正常系: --hints のみ', () => {
    const r = parseArguments(['node', 'script', '--hints=hints.json']);
    assert.equal(r.hintsPath, 'hints.json');
    assert.equal(r.idFilter, null);
    assert.equal(r.diagnosisFilter, null);
    assert.equal(r.refIdFilter, null);
  });

  it('正常系: 全フィルタ指定', () => {
    const r = parseArguments(['node', 'script', '--hints=h.json', '--id=N0100', '--diagnosis=M1', '--refId=REF101']);
    assert.equal(r.hintsPath, 'h.json');
    assert.equal(r.idFilter, 'N0100');
    assert.equal(r.diagnosisFilter, 'M1');
    assert.equal(r.refIdFilter, 'REF101');
  });

  it('正常系: --help', () => {
    const r = parseArguments(['node', 'script', '--help']);
    assert.equal(r.help, true);
  });

  it('異常系: --hints なし', () => {
    assert.throws(() => parseArguments(['node', 'script', '--id=N0100']), /--hints/);
  });
});

// ============================================================
// filterEntries
// ============================================================

describe('filterEntries', () => {
  it('全件表示（フィルタなし）', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: null, diagnosisFilter: null, refIdFilter: null });
    assert.equal(entries.length, 4);
  });

  it('--id=N0100 でフィルタ', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: 'N0100', diagnosisFilter: null, refIdFilter: null });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].nodeId, 'N0100');
  });

  it('--diagnosis=M1 でフィルタ', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: null, diagnosisFilter: 'M1', refIdFilter: null });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].diagnosis, 'M1');
  });

  it('--refId=REF101 でフィルタ', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: null, diagnosisFilter: null, refIdFilter: 'REF101' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].refId, 'REF101');
  });

  it('存在しない ID -> 0件', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: 'N9999', diagnosisFilter: null, refIdFilter: null });
    assert.equal(entries.length, 0);
  });

  it('複合フィルタ（AND）', () => {
    // M9 + N0101 → 1件
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: 'N0101', diagnosisFilter: 'M9', refIdFilter: null });
    assert.equal(entries.length, 1);
  });
});

// ============================================================
// formatAsMarkdown
// ============================================================

describe('formatAsMarkdown', () => {
  it('全件表示: Markdown が整形される', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: null, diagnosisFilter: null, refIdFilter: null });
    const md = formatAsMarkdown(entries, SAMPLE_HINTS);
    assert.ok(md.includes('# Fix Graph Hints'));
    assert.ok(md.includes('N0001'));
    assert.ok(md.includes('N0002'));
    assert.ok(md.includes('N0100'));
    assert.ok(md.includes('N0101'));
    // 各エントリの診断情報が含まれている
    assert.ok(md.includes(DIAGNOSIS_MARKERS.M1));
    assert.ok(md.includes(DIAGNOSIS_MARKERS.M5));
    assert.ok(md.includes(DIAGNOSIS_MARKERS.M8));
    assert.ok(md.includes(DIAGNOSIS_MARKERS.M9));
  });

  it('フィルタ表示: --id=N0100 のみ', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: 'N0100', diagnosisFilter: null, refIdFilter: null });
    const md = formatAsMarkdown(entries, SAMPLE_HINTS);
    assert.ok(md.includes('N0100'));
    assert.ok(!md.includes('N0001'));
  });

  it('フィルタ表示: --diagnosis=M1', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: null, diagnosisFilter: 'M1', refIdFilter: null });
    const md = formatAsMarkdown(entries, SAMPLE_HINTS);
    assert.ok(md.includes('REF001'));
    assert.ok(!md.includes('REF002'));
  });

  it('フィルタ表示: --refId=REF101', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: null, diagnosisFilter: null, refIdFilter: 'REF101' });
    const md = formatAsMarkdown(entries, SAMPLE_HINTS);
    assert.ok(md.includes('REF101'));
    assert.ok(!md.includes('REF001'));
  });

  it('空の hints: 「該当するエントリがありません」', () => {
    const entries = filterEntries(EMPTY_HINTS, { idFilter: null, diagnosisFilter: null, refIdFilter: null });
    const md = formatAsMarkdown(entries, EMPTY_HINTS);
    assert.equal(md, '該当するエントリがありません。');
  });

  it('Markdown にトークン一致状況表が含まれる', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: 'N0001', diagnosisFilter: null, refIdFilter: null });
    const md = formatAsMarkdown(entries, SAMPLE_HINTS);
    assert.ok(md.includes('### トークン別一致状況'));
    assert.ok(md.includes('存在しない見出し'));
  });

  it('Markdown に候補見出し行表が含まれる', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: 'N0001', diagnosisFilter: null, refIdFilter: null });
    const md = formatAsMarkdown(entries, SAMPLE_HINTS);
    assert.ok(md.includes('### 候補見出し行'));
    assert.ok(md.includes('セクション1'));
  });

  it('Markdown に修正コマンドが含まれる', () => {
    const entries = filterEntries(SAMPLE_HINTS, { idFilter: 'N0100', diagnosisFilter: null, refIdFilter: null });
    const md = formatAsMarkdown(entries, SAMPLE_HINTS);
    assert.ok(md.includes('```bash'));
    assert.ok(md.includes('--heading=3'));
  });
});

/** 診断ラベルマーカー（MD内での出現確認用） */
const DIAGNOSIS_MARKERS = {
  M1: 'M1:',
  M5: 'M5:',
  M8: 'M8:',
  M9: 'M9:',
};

// ============================================================
// loadHintsFile — 実際のファイルI/O
// ============================================================

describe('loadHintsFile', () => {
  let tmpDir;
  let hintsPath;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qfh-test-'));
    hintsPath = path.join(tmpDir, 'hints.json');
    fs.writeFileSync(hintsPath, JSON.stringify(SAMPLE_HINTS));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('正常系: JSON 読み込み成功', () => {
    const data = loadHintsFile(hintsPath);
    assert.equal(data.totalBroken, 4);
    assert.equal(data.nodes.length, 4);
  });

  it('異常系: 存在しないファイル → ENOENT', () => {
    assert.throws(() => loadHintsFile('/nonexistent/hints.json'));
  });

  it('異常系: 不正な JSON → SyntaxError', () => {
    const badPath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(badPath, '{broken json');
    assert.throws(() => loadHintsFile(badPath));
  });
});
