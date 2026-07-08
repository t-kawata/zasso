/**
 * test-query-all.test.cjs — test-query-all.js のテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 * テスト対象: validateAllHeadingRefs, diagnoseBrokenRef, 診断補助関数
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  parseArguments,
  loadGraphAndSource,
  validateAllHeadingRefs,
  diagnoseBrokenRef,
  collectHeadingLines,
  computeTokenMatchScore,
  isMutuallyExclusive,
  checkOtherHeadingLevels,
  buildHintsJson,
  formatSuccessMessage,
  formatErrorMessage,
  MAX_DETAIL_ENTRIES,
  SCORE_THRESHOLDS,
  DIAGNOSIS_LABELS,
  HINTS_OUTPUT_FILENAME,
} = require('../../.claude/scripts/rfc-graph/test-query-all.js');

/** テスト用ソース行配列（resolve-by-heading.test.cjs と同様の形式） */
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

/** 全て解決可能なテスト用グラフ */
const VALID_GRAPH = {
  nodes: [
    {
      id: 'N0001',
      title: 'タイトルノード',
      kind: 'overview',
      summary: '概要',
      slug: 'overview',
      headingRefs: [
        { refId: 'REF001', heading: 1, texts: ['タイトル'] },
        { refId: 'REF002', heading: 2, texts: ['セクション1'] },
      ],
    },
    {
      id: 'N0002',
      title: 'サブセクション',
      kind: 'detail',
      summary: '詳細',
      slug: 'detail',
      headingRefs: [
        { refId: 'REF003', heading: 3, texts: ['サブセクション2.1'] },
      ],
    },
  ],
};

/** 一部解決不能なテスト用グラフ */
const BROKEN_GRAPH = {
  nodes: [
    {
      id: 'N0001',
      title: '正常ノード',
      kind: 'overview',
      summary: '概要',
      slug: 'overview',
      headingRefs: [
        { refId: 'REF001', heading: 2, texts: ['セクション1'] },
      ],
    },
    {
      id: 'N0002',
      title: '異常ノード',
      kind: 'detail',
      summary: '詳細',
      slug: 'detail',
      headingRefs: [
        { refId: 'REF002', heading: 2, texts: ['存在しない見出し'] },
      ],
    },
  ],
};

/** 全解決不能なテスト用グラフ（26件の broken） */
function buildAllBrokenGraph(count) {
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const nodeId = `N${String(i + 1).padStart(4, '0')}`;
    nodes.push({
      id: nodeId,
      title: `ノード${i + 1}`,
      kind: 'detail',
      summary: '詳細',
      slug: `node${i + 1}`,
      headingRefs: [
        { refId: `REF${String(i * 3 + 1).padStart(3, '0')}`, heading: 5, texts: [`存在しない${i + 1}`] },
      ],
    });
  }
  return { nodes };
}

/** 重複排除テスト用グラフ */
const DUPLICATE_GRAPH = {
  nodes: [
    {
      id: 'N0001',
      title: '重複テスト',
      kind: 'detail',
      summary: '詳細',
      slug: 'duplicate',
      headingRefs: [
        { refId: 'REF001', heading: 2, texts: ['存在しない'] },
        { refId: 'REF001', heading: 2, texts: ['存在しない'] }, // 同一 refId の重複
        { refId: 'REF002', heading: 2, texts: ['別の欠損'] },
      ],
    },
  ],
};

// ============================================================
// parseArguments
// ============================================================

describe('parseArguments', () => {
  it('正常系: --graph + --source', () => {
    const r = parseArguments(['node', 'script', '--graph=g.json', '--source=s.md']);
    assert.equal(r.graphPath, 'g.json');
    assert.equal(r.sourcePath, 's.md');
  });

  it('異常系: --graph のみ', () => {
    assert.throws(() => parseArguments(['node', 'script', '--graph=g.json']), /--source/);
  });

  it('異常系: --source のみ', () => {
    assert.throws(() => parseArguments(['node', 'script', '--source=s.md']), /--graph/);
  });

  it('正常系: --help', () => {
    const r = parseArguments(['node', 'script', '--help']);
    assert.equal(r.help, true);
  });

  it('異常系: 引数なし', () => {
    assert.throws(() => parseArguments(['node', 'script']), /--graph/);
  });
});

// ============================================================
// collectHeadingLines
// ============================================================

describe('collectHeadingLines', () => {
  it('h2: 3行収集できる', () => {
    const lines = collectHeadingLines(SAMPLE_LINES, 2);
    assert.equal(lines.length, 3);
    assert.equal(lines[0].text, '## セクション1');
  });

  it('h1: 1行収集できる', () => {
    const lines = collectHeadingLines(SAMPLE_LINES, 1);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].text, '# タイトル');
  });

  it('h5: 0行（存在しないレベル）', () => {
    const lines = collectHeadingLines(SAMPLE_LINES, 5);
    assert.equal(lines.length, 0);
  });
});

// ============================================================
// computeTokenMatchScore
// ============================================================

describe('computeTokenMatchScore', () => {
  it('全トークン一致: 100%', () => {
    const score = computeTokenMatchScore(['セクション', '1'], '## セクション1');
    assert.equal(score, 100);
  });

  it('半数一致: 50%', () => {
    const score = computeTokenMatchScore(['セクション', '存在しない'], '## セクション1');
    assert.equal(score, 50);
  });

  it('0件一致: 0%', () => {
    const score = computeTokenMatchScore(['存在しない', '別の何か'], '## セクション1');
    assert.equal(score, 0);
  });

  it('空配列: 0%', () => {
    const score = computeTokenMatchScore([], '## セクション1');
    assert.equal(score, 0);
  });
});

// ============================================================
// isMutuallyExclusive
// ============================================================

describe('isMutuallyExclusive', () => {
  it('同じ行にあるトークン: false', () => {
    const lines = collectHeadingLines(SAMPLE_LINES, 2);
    const result = isMutuallyExclusive(['セクション', '1'], lines);
    assert.equal(result, false);
  });

  it('異なる行のトークン: true（M9）', () => {
    const lines = collectHeadingLines(SAMPLE_LINES, 2);
    // 'セクション1' と 'セクション3' は別の行
    const result = isMutuallyExclusive(['セクション1', 'セクション3'], lines);
    assert.equal(result, true);
  });

  it('1トークン: false', () => {
    const lines = collectHeadingLines(SAMPLE_LINES, 2);
    const result = isMutuallyExclusive(['セクション1'], lines);
    assert.equal(result, false);
  });

  it('マッチしないトークンを含む: false', () => {
    const lines = collectHeadingLines(SAMPLE_LINES, 2);
    const result = isMutuallyExclusive(['存在しない', '別の何か'], lines);
    assert.equal(result, false);
  });
});

// ============================================================
// checkOtherHeadingLevels
// ============================================================

describe('checkOtherHeadingLevels', () => {
  it('別レベルに高スコアがあれば返す', () => {
    // h3 で 'サブセクション2.1' を探す → 指定:h1 別:h3 で100%
    const result = checkOtherHeadingLevels(SAMPLE_LINES, 1, ['サブセクション2.1']);
    assert.notEqual(result, null);
    assert.equal(result.level, 3);
    assert.equal(result.score, 100);
  });

  it('他のレベルに高スコアがない場合は null', () => {
    const result = checkOtherHeadingLevels(SAMPLE_LINES, 2, ['セクション1']);
    // h2 が最も適切
    assert.equal(result, null);
  });
});

// ============================================================
// diagnoseBrokenRef
// ============================================================

describe('diagnoseBrokenRef', () => {
  it('M1: 全トークン不一致（0%一致）', () => {
    const result = diagnoseBrokenRef(SAMPLE_LINES, { heading: 2, texts: ['存在しない見出し'] });
    assert.equal(result.diagnosis, DIAGNOSIS_LABELS.M1);
    assert.equal(result.score, 0);
  });

  it('M2: 1トークンのみ一致（1〜25%）', () => {
    // 4トークンのうち1つだけ一致 = 25%
    const result = diagnoseBrokenRef(SAMPLE_LINES, { heading: 2, texts: ['セクション', 'X', 'Y', 'Z'] });
    assert.equal(result.diagnosis, DIAGNOSIS_LABELS.M2);
    assert.ok(result.score <= 25);
    assert.ok(result.score > 0);
  });

  it('M8: 別の見出しレベルの方が高スコア', () => {
    // h1 で 'サブセクション2.1' → h3 の方が適切
    const result = diagnoseBrokenRef(SAMPLE_LINES, { heading: 1, texts: ['サブセクション2.1'] });
    assert.equal(result.diagnosis, DIAGNOSIS_LABELS.M8);
  });

  it('M9: トークンが共存不可能', () => {
    const result = diagnoseBrokenRef(SAMPLE_LINES, { heading: 2, texts: ['セクション1', 'セクション3'] });
    assert.equal(result.diagnosis, DIAGNOSIS_LABELS.M9);
  });

  it('M0: 指定 heading の行が0件', () => {
    const result = diagnoseBrokenRef(SAMPLE_LINES, { heading: 7, texts: ['何か'] });
    assert.equal(result.diagnosis, DIAGNOSIS_LABELS.M0);
  });
});

// ============================================================
// validateAllHeadingRefs
// ============================================================

describe('validateAllHeadingRefs', () => {
  it('正常系: 全 headingRefs が解決可能 → broken 0件', () => {
    const { broken, totalRefs } = validateAllHeadingRefs(VALID_GRAPH, SAMPLE_LINES);
    assert.equal(broken.length, 0);
    assert.equal(totalRefs, 3);
  });

  it('異常系: 一部解決不能 → broken 1件', () => {
    const { broken, totalRefs } = validateAllHeadingRefs(BROKEN_GRAPH, SAMPLE_LINES);
    assert.equal(broken.length, 1);
    assert.equal(totalRefs, 2);
    assert.equal(broken[0].nodeId, 'N0002');
  });

  it('異常系: 全 headingRefs が解決不能 → broken 全件', () => {
    const graph = buildAllBrokenGraph(3);
    const { broken, totalRefs } = validateAllHeadingRefs(graph, SAMPLE_LINES);
    assert.equal(broken.length, 3);
    assert.equal(totalRefs, 3);
  });

  it('重複排除: 同一 nodeId + 同一 refId は1件にまとまる', () => {
    const { broken } = validateAllHeadingRefs(DUPLICATE_GRAPH, SAMPLE_LINES);
    // REF001 は重複しているので1件にまとまる、REF002 は別
    assert.equal(broken.length, 2);
  });
});

// ============================================================
// buildHintsJson / formatSuccessMessage / formatErrorMessage
// ============================================================

describe('buildHintsJson', () => {
  it('hints JSON が正しい構造を持つ', () => {
    const { broken } = validateAllHeadingRefs(BROKEN_GRAPH, SAMPLE_LINES);
    const hints = buildHintsJson(broken);
    assert.ok(hints.generatedAt);
    assert.equal(hints.totalBroken, 1);
    assert.equal(hints.uniqueBroken, 1);
    assert.equal(hints.nodes.length, 1);
    assert.ok(hints.nodes[0].nodeId);
    assert.ok(hints.nodes[0].diagnosis);
    assert.ok(hints.nodes[0].details);
  });

  it('broken 0件でも正常動作', () => {
    const hints = buildHintsJson([]);
    assert.equal(hints.totalBroken, 0);
    assert.equal(hints.nodes.length, 0);
  });
});

describe('formatSuccessMessage', () => {
  it('正常メッセージを生成する', () => {
    const msg = formatSuccessMessage(5);
    assert.ok(msg.includes('5'));
    assert.ok(msg.includes('正常解決'));
  });
});

describe('formatErrorMessage', () => {
  it('1件のエラーメッセージを生成する', () => {
    const { broken } = validateAllHeadingRefs(BROKEN_GRAPH, SAMPLE_LINES);
    const msg = formatErrorMessage(broken);
    assert.ok(msg.includes('N0002'));
    assert.ok(msg.includes(DIAGNOSIS_LABELS.M1));
  });

  it('25件以下は全件詳細表示', () => {
    const graph = buildAllBrokenGraph(5);
    const { broken } = validateAllHeadingRefs(graph, SAMPLE_LINES);
    const msg = formatErrorMessage(broken);
    assert.ok(!msg.includes('その他'));
  });

  it('26件以上は25件詳細 + 残り件数表示', () => {
    const graph = buildAllBrokenGraph(26);
    const { broken } = validateAllHeadingRefs(graph, SAMPLE_LINES);
    const msg = formatErrorMessage(broken);
    assert.ok(msg.includes('その他 1 件'));
  });
});

// ============================================================
// MAX_DETAIL_ENTRIES — 定数確認
// ============================================================

describe('定数', () => {
  it('MAX_DETAIL_ENTRIES は25', () => {
    assert.equal(MAX_DETAIL_ENTRIES, 25);
  });

  it('HINTS_OUTPUT_FILENAME は _fix_graph_hints.json', () => {
    assert.equal(HINTS_OUTPUT_FILENAME, '_fix_graph_hints.json');
  });
});

// ============================================================
// loadGraphAndSource — 実際のファイルI/O
// ============================================================

describe('loadGraphAndSource', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tqa-test-'));
    fs.writeFileSync(path.join(tmpDir, 'test.json'), JSON.stringify(VALID_GRAPH));
    fs.writeFileSync(path.join(tmpDir, 'test.md'), SAMPLE_LINES.join('\n'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('正常系: ファイル読み込み成功', () => {
    const { graph, sourceLines } = loadGraphAndSource(
      path.join(tmpDir, 'test.json'),
      path.join(tmpDir, 'test.md')
    );
    assert.equal(graph.nodes.length, 2);
    assert.equal(sourceLines.length, SAMPLE_LINES.length);
  });

  it('異常系: 存在しないファイルパス → エラー', () => {
    assert.throws(() => loadGraphAndSource('/nonexistent/file.json', '/nonexistent/file.md'));
  });
});
