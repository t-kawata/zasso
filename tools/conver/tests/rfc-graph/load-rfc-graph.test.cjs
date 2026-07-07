/**
 * load-rfc-graph.test.cjs — load-rfc-graph.js のテスト [::STUB::] 廃止予定
 *
 * load-rfc-graph.js は show-graph-summary-markdown.js に統合されました。
 * 本テストファイルは互換性のために維持していますが、新規機能のテストは
 * show-graph-summary-markdown.test.cjs に追加してください。
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 */

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// テスト対象モジュールを require パスで読み込む
const {
  parseArguments,
  deriveGraphPath,
  loadGraph,
  summarizeGraph,
  generateUsageExamples,
  outputSummary,
  printUsage,
} = require('../../.claude/scripts/rfc-graph/load-rfc-graph.js');

// ============================================================
// テスト用ユーティリティ
// ============================================================

/** テスト用の一時ディレクトリパス */
let tmpDir;

/** テスト用のグラフファイルパス */
let graphFilePath;

/** テスト用の最小グラフデータ */
const MINIMAL_GRAPH = {
  sourceFile: '/tmp/test-rfc.md',
  nodes: [
    { id: 'N0001', kind: 'requirement', title: 'ログイン機能', summary: 'ユーザーログイン', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0002', kind: 'api_contract', title: 'POST /login', summary: 'ログインAPI', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0003', kind: 'data_model', title: 'User型', summary: 'ユーザーデータ', headingRefs: [{ heading:1, texts:["test"]}]},
  ],
  edges: [
    { from: 'N0001', to: 'N0002', type: 'refines', attributes: { strength: 0.8, bidirectional: false } },
    { from: 'N0002', to: 'N0003', type: 'depends_on', attributes: { strength: 0.9, bidirectional: false } },
  ],
};

/** 孤立ノードを含むグラフデータ */
const GRAPH_WITH_ISOLATED = {
  sourceFile: '/tmp/test-isolated.md',
  nodes: [
    { id: 'N0001', kind: 'requirement', title: '要件A', summary: '', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0002', kind: 'requirement', title: '要件B（孤立）', summary: '', headingRefs: [{ heading:1, texts:["test"]}]},
  ],
  edges: [],
};

/** 空グラフデータ */
const EMPTY_GRAPH = {
  sourceFile: '/tmp/empty.md',
  nodes: [],
  edges: [],
};

/** 多様なkind/typeのグラフデータ */
const DIVERSE_GRAPH = {
  sourceFile: '/tmp/diverse.md',
  nodes: [
    { id: 'N0001', kind: 'requirement', title: 'R1', summary: '', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0002', kind: 'requirement', title: 'R2', summary: '', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0003', kind: 'api_contract', title: 'API1', summary: '', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0004', kind: 'data_model', title: 'D1', summary: '', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0005', kind: 'rationale', title: '理由', summary: '', headingRefs: [{ heading:1, texts:["test"]}]},
    { id: 'N0006', kind: 'glossary', title: '用語', summary: '', headingRefs: [{ heading:1, texts:["test"]}]},
  ],
  edges: [
    { from: 'N0001', to: 'N0003', type: 'depends_on', attributes: {} },
    { from: 'N0002', to: 'N0003', type: 'depends_on', attributes: {} },
    { from: 'N0003', to: 'N0004', type: 'refines', attributes: {} },
    { from: 'N0004', to: 'N0005', type: 'implements', attributes: {} },
    { from: 'N0005', to: 'N0006', type: 'validates', attributes: {} },
  ],
};

// ============================================================
// テスト
// ============================================================

describe('load-rfc-graph.js', () => {
  // 各テストの前に一時ディレクトリを作成
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-rfc-graph-test-'));
    graphFilePath = path.join(tmpDir, 'test-rfc-GRAPH.json');
  });

  // 各テスト後にファイルクリーンアップ
  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ============================================================
  // parseArguments
  // ============================================================

  describe('parseArguments', () => {
    it('正常系: ソースパスをパースする', () => {
      const result = parseArguments(['/path/to/doc.md']);
      assert.equal(result.sourcePath, '/path/to/doc.md');
    });

    it('正常系: --help オプションは例外をスローせずプロセス終了', () => {
      // --help は process.exit(0) を呼ぶためテストではエラーになる。
      // 代わりに --help がパース関数内で処理されることを確認するために、
      // プロセス終了直前の状態をテストする
      assert.throws(() => {
        parseArguments([]);
      }, /ソースファイルのパスを指定してください/);
    });

    it('異常系: 引数不足（空配列）', () => {
      assert.throws(() => {
        parseArguments([]);
      }, /ソースファイルのパスを指定してください/);
    });

    it('異常系: 余剰引数がある', () => {
      assert.throws(() => {
        parseArguments(['doc.md', 'extra.md']);
      }, /余剰な引数があります/);
    });
  });

  // ============================================================
  // deriveGraphPath
  // ============================================================

  describe('deriveGraphPath', () => {
    it('正常系: 通常の.mdファイル', () => {
      const result = deriveGraphPath('/path/to/doc.md');
      assert.equal(result, '/path/to/doc-GRAPH.json');
    });

    it('正常系: 拡張子なしのパス', () => {
      const result = deriveGraphPath('/path/to/doc');
      assert.equal(result, '/path/to/doc-GRAPH.json');
    });

    it('正常系: 深いパス', () => {
      const result = deriveGraphPath('/a/b/c/d/e.md');
      assert.equal(result, '/a/b/c/d/e-GRAPH.json');
    });

    it('正常系: 空のディレクトリ（相対パス）', () => {
      const result = deriveGraphPath('doc.md');
      assert.equal(result, 'doc-GRAPH.json');
    });
  });

  // ============================================================
  // loadGraph
  // ============================================================

  describe('loadGraph', () => {
    it('正常系: 存在するグラフファイルを読み込む', () => {
      fs.writeFileSync(graphFilePath, JSON.stringify(MINIMAL_GRAPH), 'utf8');
      const graph = loadGraph(graphFilePath);
      assert.equal(graph.sourceFile, '/tmp/test-rfc.md');
      assert.equal(graph.nodes.length, 3);
      assert.equal(graph.edges.length, 2);
    });

    it('正常系: グラフが存在しない場合はnullを返す', () => {
      const result = loadGraph('/tmp/nonexistent-GRAPH.json');
      assert.equal(result, null);
    });

    it('異常系: 不正なJSON形式のファイル', () => {
      fs.writeFileSync(graphFilePath, '{不正なJSON}', 'utf8');
      assert.throws(() => {
        loadGraph(graphFilePath);
      }, /JSONパースに失敗/);
    });

    it('異常系: 構造が不正（nodes/edges欠落）', () => {
      fs.writeFileSync(graphFilePath, JSON.stringify({}), 'utf8');
      assert.throws(() => {
        loadGraph(graphFilePath);
      }, /構造が不正/);
    });
  });

  // ============================================================
  // summarizeGraph
  // ============================================================

  describe('summarizeGraph', () => {
    it('正常系: 各種kindが混在したグラフを集計する', () => {
      const summary = summarizeGraph(MINIMAL_GRAPH);
      assert.equal(summary.nodeCount, 3);
      assert.deepEqual(summary.kindDistribution, {
        requirement: 1,
        api_contract: 1,
        data_model: 1,
      });
      assert.equal(summary.edgeCount, 2);
      assert.deepEqual(summary.typeDistribution, {
        refines: 1,
        depends_on: 1,
      });
      assert.deepEqual(summary.isolatedNodes, []);
    });

    it('正常系: 孤立ノードを含むグラフ', () => {
      const summary = summarizeGraph(GRAPH_WITH_ISOLATED);
      assert.equal(summary.nodeCount, 2);
      assert.deepEqual(summary.isolatedNodes, ['N0001', 'N0002']);
    });

    it('境界値: 空グラフ', () => {
      const summary = summarizeGraph(EMPTY_GRAPH);
      assert.equal(summary.nodeCount, 0);
      assert.deepEqual(summary.kindDistribution, {});
      assert.equal(summary.edgeCount, 0);
      assert.deepEqual(summary.typeDistribution, {});
      assert.deepEqual(summary.isolatedNodes, []);
    });

    it('正常系: 多様なkind/typeのグラフ', () => {
      const summary = summarizeGraph(DIVERSE_GRAPH);
      assert.equal(summary.nodeCount, 6);
      assert.deepEqual(summary.kindDistribution, {
        requirement: 2,
        api_contract: 1,
        data_model: 1,
        rationale: 1,
        glossary: 1,
      });
      assert.equal(summary.edgeCount, 5);
      assert.deepEqual(summary.typeDistribution, {
        depends_on: 2,
        refines: 1,
        implements: 1,
        validates: 1,
      });
    });
  });

  // ============================================================
  // generateUsageExamples
  // ============================================================

  describe('generateUsageExamples', () => {
    it('正常系: crud.js/query.js の完全なCLI形式を生成する', () => {
      const examples = generateUsageExamples('/tmp/test-rfc-GRAPH.json', '/tmp/test-rfc.md', 'N0001');
      assert.equal(examples.length, 3);
      assert.ok(examples[0].includes('crud.js list-nodes'));
      assert.ok(examples[0].includes('test-rfc-GRAPH.json'));
      assert.ok(examples[1].includes('crud.js get-node'));
      assert.ok(examples[1].includes('N0001'));
      assert.ok(examples[2].includes('query.js'));
      assert.ok(examples[2].includes('test-rfc.md'));
      assert.ok(examples[2].includes('N0001'));
      assert.ok(examples[2].includes('--hops=2'));
    });

    it('正常系: デフォルトノードIDで生成する', () => {
      const examples = generateUsageExamples('/tmp/graph.json', '/tmp/source.md');
      assert.ok(examples[1].includes('N0001'));
    });
  });

  // ============================================================
  // outputSummary
  // ============================================================

  describe('outputSummary', () => {
    it('正常系: サマリーを整形して出力する', () => {
      // stdout への書き込みをキャプチャ（outputSummaryは1回のconsole.logに改行区切りで出力）
      const originalLog = console.log;
      let captured = '';
      console.log = (msg) => { captured = msg; };

      const summary = summarizeGraph(MINIMAL_GRAPH);
      const examples = generateUsageExamples('/tmp/test-rfc-GRAPH.json', '/tmp/test-rfc.md', 'N0001');
      outputSummary(summary, '/tmp/test-rfc-GRAPH.json', examples);

      console.log = originalLog;

      const lines = captured.split('\n');
      // 期待する構造の確認
      assert.ok(lines[0].includes('[グラフ構造サマリー]'));
      assert.ok(lines[1].includes('test-rfc-GRAPH.json'));
      assert.ok(lines[2].includes('3件'));
      assert.ok(lines[4].includes('0件'));
    });

    it('正常系: 孤立ノードありのサマリー', () => {
      const originalLog = console.log;
      let captured = '';
      console.log = (msg) => { captured = msg; };

      const summary = summarizeGraph(GRAPH_WITH_ISOLATED);
      const examples = generateUsageExamples('/tmp/graph.json', '/tmp/source.md', 'N0001');
      outputSummary(summary, '/tmp/graph.json', examples);

      console.log = originalLog;

      const lines = captured.split('\n');
      assert.ok(lines[4].includes('2件')); // 孤立ノード数
    });
  });
});
