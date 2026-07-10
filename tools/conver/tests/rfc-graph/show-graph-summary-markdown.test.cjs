/**
 * show-graph-summary-markdown.test.cjs — show-graph-summary-markdown.js のテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  parseArguments,
  loadGraph,
  truncateSummary,
  abbreviateEdgeType,
  buildNodeMap,
  generateSummary,
  EDGE_ABBREV,
} = require('../../.claude/scripts/rfc-graph/show-graph-summary-markdown.js');

// ============================================================
// テスト用データ
// ============================================================

const SAMPLE_GRAPH = {
  sourceFile: '/path/to/RFC-GRAPHIFY.md',
  nodes: [
    { id: 'N0001', kind: 'requirement', title: '認証API定義', summary: '認証の失敗時にリトライする回数と間隔を規定', headingRefs: [{ refId: 'REF001', heading:1, texts:["test"]}]},
    { id: 'N0002', kind: 'requirement', title: 'エラー型定義', summary: '本モジュールで使用するエラー型', headingRefs: [{ refId: 'REF002', heading:1, texts:["test"]}]},
    { id: 'N0003', kind: 'requirement', title: 'トークン検証', summary: 'JWTトークンの署名検証手順', headingRefs: [{ refId: 'REF003', heading:1, texts:["test"]}]},
    { id: 'N0004', kind: 'api_contract', title: 'POST /api/v1/auth/login', summary: 'ログインエンドポイントのリクエスト/レスポンス仕様', headingRefs: [{ refId: 'REF004', heading:1, texts:["test"]}]},
    { id: 'N0005', kind: 'architecture', title: 'セッション管理', summary: 'ユーザーセッションの作成と破棄のライフサイクル', headingRefs: [{ refId: 'REF005', heading:1, texts:["test"]}]},
    { id: 'N0006', kind: 'glossary', title: '用語定義', summary: '認証関連用語', headingRefs: [{ refId: 'REF006', heading:1, texts:["test"]}]},
  ],
  edges: [
    { from: 'N0001', to: 'N0003', type: 'depends_on', attributes: { strength: 'hard', bidirectional: false } },
    { from: 'N0001', to: 'N0004', type: 'implements', attributes: { strength: 'soft', bidirectional: false } },
    { from: 'N0002', to: 'N0003', type: 'depends_on', attributes: { strength: 'hard', bidirectional: false } },
    { from: 'N0003', to: 'N0005', type: 'refines', attributes: { strength: 'medium', bidirectional: false } },
    { from: 'N0004', to: 'N0005', type: 'validates', attributes: { strength: 'soft', bidirectional: false } },
  ],
};

/** マーカーを含むソーステキスト */
const SAMPLE_SOURCE = [
  '# RFC',
  '',
  '## 要件',
  '[::REF001-START::] 認証API定義',
  'リトライ回数の規定',
  '[::REF001-END::]',
  '',
  '[::REF002-START::] エラー型定義',
  'エラー型の詳細',
  '[::REF002-END::]',
  '',
  '## 実装',
  '[::REF003-START::] トークン検証',
  'JWT署名検証',
  '[::REF003-END::]',
  '',
  '[::REF004-START::] POST /api/v1/auth/login',
  'エンドポイント仕様',
  '[::REF004-END::]',
  '',
  '## 設計',
  '[::REF005-START::] セッション管理',
  'ライフサイクル',
  '[::REF005-END::]',
  '',
  '[::REF006-START::] 用語定義',
  '用語一覧',
  '[::REF006-END::]',
].join('\n');

// ============================================================
// テスト
// ============================================================

describe('parseArguments', () => {
  it('正常系: --graph --source をパースする', () => {
    const result = parseArguments(['node', 'script.js', '--graph=/g.json', '--source=/s.md']);
    assert.equal(result.graphPath, '/g.json');
    assert.equal(result.sourcePath, '/s.md');
  });

  it('異常系: 引数不足', () => {
    assert.throws(() => parseArguments(['node', 'script.js', '--graph=/g.json']), /引数が不足/);
  });

  it('異常系: --graph プレフィックス誤り', () => {
    assert.throws(() => parseArguments(['node', 's.js', '--gra=/g.json', '--source=/s.md']), /最初の引数/);
  });

  it('異常系: --graph パス空', () => {
    assert.throws(() => parseArguments(['node', 's.js', '--graph=', '--source=/s.md']), /空です/);
  });
});

describe('truncateSummary', () => {
  it('28字以下はそのまま返す', () => {
    assert.equal(truncateSummary('短いサマリー'), '短いサマリー');
  });

  it('29字以上は25字+...で切る', () => {
    const long = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほ';
    const result = truncateSummary(long);
    assert.ok(result.endsWith('...'));
    assert.equal(result.length, 28); // 25 + ...
  });

  it('null/undefined は空文字を返す', () => {
    assert.equal(truncateSummary(null), '');
    assert.equal(truncateSummary(undefined), '');
  });
});

describe('abbreviateEdgeType', () => {
  it('全12種のエッジタイプが3文字に変換される', () => {
    const cases = [
      ['depends_on', 'dep'], ['implements', 'imp'], ['refines', 'rfn'],
      ['extends', 'ext'], ['conflicts_with', 'cnf'], ['triggers', 'trg'],
      ['constrains', 'cns'], ['supersedes', 'sup'], ['references', 'ref'],
      ['precedes', 'prc'], ['part_of', 'prt'], ['validates', 'vld'],
    ];
    for (const [type, expected] of cases) {
      assert.equal(abbreviateEdgeType(type), expected, `${type} → ${expected}`);
    }
  });

  it('未知のタイプは先頭3文字を返す', () => {
    assert.equal(abbreviateEdgeType('unknown'), 'unk');
  });
});

describe('EDGE_ABBREV', () => {
  it('全12種の定義が存在する', () => {
    assert.equal(Object.keys(EDGE_ABBREV).length, 12);
  });
});

describe('buildNodeMap', () => {
  it('ノードID → ノードオブジェクトのマップを構築する', () => {
    const map = buildNodeMap(SAMPLE_GRAPH.nodes);
    assert.equal(map['N0001'].title, '認証API定義');
    assert.equal(map['N0006'].kind, 'glossary');
    assert.equal(Object.keys(map).length, 6);
  });
});

describe('loadGraph', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'show-graph-test-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('有効なグラフJSONを読み込む', () => {
    const filePath = path.join(tmpDir, 'graph.json');
    fs.writeFileSync(filePath, JSON.stringify(SAMPLE_GRAPH), 'utf8');
    const graph = loadGraph(filePath);
    assert.equal(graph.sourceFile, SAMPLE_GRAPH.sourceFile);
    assert.equal(graph.nodes.length, 6);
  });

  it('存在しないファイルでエラー', () => {
    assert.throws(() => loadGraph(path.join(tmpDir, 'nonexist.json')), /見つかりません/);
  });

  it('不正なJSONでエラー', () => {
    const filePath = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(filePath, '{bad}', 'utf8');
    assert.throws(() => loadGraph(filePath), /JSONパース/);
  });
});

describe('generateSummary', () => {
  it('kind 別グループでノード一覧を出力する', () => {
    const output = generateSummary(SAMPLE_GRAPH, SAMPLE_SOURCE);
    const lines = output.split('\n');

    // 先頭行: 絶対パス + カウント
    assert.ok(lines[0].startsWith('/path/to/RFC-GRAPHIFY.md'));
    assert.ok(lines[0].includes('6 nodes / 5 edges'));

    // kind 別グループ
    assert.ok(output.includes('## requirement (3件)'));
    assert.ok(output.includes('## api_contract (1件)'));
    assert.ok(output.includes('## architecture (1件)'));
    assert.ok(output.includes('## glossary (1件)'));

    // 各ノードのID + タイトル
    assert.ok(output.includes('N0001: 認証API定義'));
    assert.ok(output.includes('N0002: エラー型定義'));
    assert.ok(output.includes('N0003: トークン検証'));
    assert.ok(output.includes('N0004: POST /api/v1/auth/login'));
    assert.ok(output.includes('N0005: セッション管理'));

    // 要約
    assert.ok(output.includes('ログインエンドポイント'));

    // エッジ関係（新しい形式）
    assert.ok(output.includes('[N0001] -> depends_on -> [N0003: トークン検証]'));
    assert.ok(output.includes('[N0003] <- depends_on <- [N0001: 認証API定義]'));
  });

  it('孤立ノードのみのグラフでも空のエッジ一覧になる', () => {
    const isolatedGraph = {
      sourceFile: '/test.md',
      nodes: [
        { id: 'N0001', kind: 'requirement', title: '孤立', summary: '孤立ノード', headingRefs: [{ refId: 'REF001', heading:1, texts:["test"]}]},
      ],
      edges: [],
    };
    const singleLineSource = '[::REF001-START::] 孤立\n内容\n[::REF001-END::]';
    const output = generateSummary(isolatedGraph, singleLineSource);
    assert.ok(output.includes('孤立'));
    // エッジがないので矢印表記がない
    assert.ok(!output.includes('→'));
    assert.ok(!output.includes('←'));
  });

  it('headingRefs がないノードは行番号なしで表示される', () => {
    const noRangeGraph = {
      sourceFile: '/test.md',
      nodes: [
        { id: 'N0001', kind: 'requirement', title: '範囲なし', summary: '範囲なしノード' },
      ],
      edges: [],
    };
    const output = generateSummary(noRangeGraph, '');
    assert.ok(output.includes('範囲なし'));
    assert.ok(!output.includes('[L')); // 行番号なし
  });

  it('bidirectional エッジで双方向矢印が表示される', () => {
    const graph = {
      sourceFile: '/test.md',
      nodes: [
        { id: 'N0001', kind: 'requirement', title: 'A', summary: 'A', headingRefs: [{ refId: 'REF001', heading:1, texts:["test"]}]},
        { id: 'N0002', kind: 'requirement', title: 'B', summary: 'B', headingRefs: [{ refId: 'REF002', heading:1, texts:["test"]}]},
      ],
      edges: [
        { from: 'N0001', to: 'N0002', type: 'depends_on', attributes: { strength: 'hard', bidirectional: true } },
      ],
    };
    const src = '[::REF001-START::] A\n[::REF001-END::]\n[::REF002-START::] B\n[::REF002-END::]';
    const output = generateSummary(graph, src);
    // bidirectional は <-> で表示
    assert.ok(output.includes('<->'));
  });
});

describe('generateCliExamples', () => {
  const { generateCliExamples } = require('../../.claude/scripts/rfc-graph/show-graph-summary-markdown.js');

  it('query.js のCLI使用例を含む', () => {
    const examples = generateCliExamples('/g.json', '/s.md', 'N0001');
    const output = examples.join('\n');
    assert.ok(output.includes('query.js'));
    assert.ok(output.includes('--graph=g.json'));
    assert.ok(output.includes('--source=s.md'));
    assert.ok(output.includes('--id=N0001'));
    assert.ok(output.includes('--hops=2'));
  });
});

describe('parseArguments with --with-cli-examples', () => {
  const { parseArguments } = require('../../.claude/scripts/rfc-graph/show-graph-summary-markdown.js');

  it('--with-cli-examples フラグをパースする', () => {
    const result = parseArguments(['node', 's.js', '--graph=/g.json', '--source=/s.md', '--with-cli-examples']);
    assert.equal(result.withCliExamples, true);
  });

  it('フラグなしの場合は false', () => {
    const result = parseArguments(['node', 's.js', '--graph=/g.json', '--source=/s.md']);
    assert.equal(result.withCliExamples, false);
  });
});
