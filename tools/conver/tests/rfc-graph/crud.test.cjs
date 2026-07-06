/**
 * crud.test.cjs — crud.js のテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 * 一時ディレクトリを使用した実際のファイル I/O テストを含む。
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// テスト対象モジュールを require パスで読み込む
const {
  parseArguments,
  readGraph,
  executeCreateNodes,
  executeListNodeIds,
  executeGetNode,
  executeUpdateNode,
  executeDeleteNode,
  executeCreateEdges,
  atomicWrite,
  ALLOWED_SUBCOMMANDS,
} = require('../../.claude/scripts/rfc-graph/crud.js');

// ============================================================
// テスト用ユーティリティ
// ============================================================

/** テスト用の一時ディレクトリパス */
let tmpDir;

/** 恒常的なテスト用グラフファイルパス */
let testGraphPath;

/** テスト用ファイルパス */
let testFilePath;

/**
 * テスト用の有効なノードを作成する
 *
 * @param {string} id — ノードID
 * @param {string} kind — ノード種別
 * @returns {Object} ノードデータ
 */
function createTestNode(id, kind) {
  return {
    id,
    title: 'テストノード ' + id,
    kind,
    summary: 'これはテスト用ノードです。',
    sourceRanges: [{ refId: 'REF001', startLine: 1, endLine: 5 }],
  };
}

/**
 * テスト用の有効なエッジを作成する
 *
 * @param {string} from — 参照元ノードID
 * @param {string} to — 参照先ノードID
 * @param {string} type — エッジタイプ
 * @returns {Object} エッジデータ
 */
function createTestEdge(from, to, type) {
  return {
    from,
    to,
    type,
    attributes: { strength: 'hard', bidirectional: false },
  };
}

/**
 * テスト用のグラフデータを作成する
 *
 * @param {Object[]} [nodes] — ノード配列
 * @param {Object[]} [edges] — エッジ配列
 * @returns {Object} グラフデータ
 */
function createTestGraph(nodes = [], edges = []) {
  return { sourceFile: '/test/source.md', nodes, edges };
}

// ============================================================
// テストスイート
// ============================================================

describe('crud.js — 定数', () => {
  it('ALLOWED_SUBCOMMANDS は6つのサブコマンドを含む', () => {
    assert.equal(ALLOWED_SUBCOMMANDS.length, 6);
    assert.ok(ALLOWED_SUBCOMMANDS.includes('create-nodes'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('list-nodes'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('get-node'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('update-node'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('delete-node'));
    assert.ok(ALLOWED_SUBCOMMANDS.includes('create-edges'));
  });
});

describe('crud.js — parseArguments', () => {
  // 元の process.argv を保存
  let originalArgv;

  before(() => {
    originalArgv = process.argv;
  });

  after(() => {
    process.argv = originalArgv;
  });

  /**
   * parseArguments のテスト用ヘルパー
   *
   * @param {string[]} args — CLI引数（node/path を含まない）
   * @returns {Object} parseArguments の戻り値
   */
  function testParse(args) {
    process.argv = ['node', 'crud.js', ...args];
    return parseArguments();
  }

  it('create-nodes サブコマンドを正常にパースする', () => {
    const result = testParse(['--graph=/tmp/test.json', 'create-nodes', '--file=/tmp/nodes.json']);
    assert.equal(result.graphPath, '/tmp/test.json');
    assert.equal(result.subcommand, 'create-nodes');
    assert.equal(result.nodeId, null);
    assert.equal(result.filePath, '/tmp/nodes.json');
  });

  it('list-nodes サブコマンドを正常にパースする', () => {
    const result = testParse(['--graph=/tmp/test.json', 'list-nodes']);
    assert.equal(result.graphPath, '/tmp/test.json');
    assert.equal(result.subcommand, 'list-nodes');
    assert.equal(result.nodeId, null);
    assert.equal(result.filePath, null);
  });

  it('get-node サブコマンドを正常にパースする', () => {
    const result = testParse(['--graph=/tmp/test.json', 'get-node', '--id=N0001']);
    assert.equal(result.graphPath, '/tmp/test.json');
    assert.equal(result.subcommand, 'get-node');
    assert.equal(result.nodeId, 'N0001');
    assert.equal(result.filePath, null);
  });

  it('update-node サブコマンドを正常にパースする', () => {
    const result = testParse(['--graph=/tmp/test.json', 'update-node', '--id=N0001', '--file=/tmp/patch.json']);
    assert.equal(result.graphPath, '/tmp/test.json');
    assert.equal(result.subcommand, 'update-node');
    assert.equal(result.nodeId, 'N0001');
    assert.equal(result.filePath, '/tmp/patch.json');
  });

  it('delete-node サブコマンドを正常にパースする', () => {
    const result = testParse(['--graph=/tmp/test.json', 'delete-node', '--id=N0001']);
    assert.equal(result.graphPath, '/tmp/test.json');
    assert.equal(result.subcommand, 'delete-node');
    assert.equal(result.nodeId, 'N0001');
    assert.equal(result.filePath, null);
  });

  it('create-edges サブコマンドを正常にパースする', () => {
    const result = testParse(['--graph=/tmp/test.json', 'create-edges', '--file=/tmp/edges.json']);
    assert.equal(result.graphPath, '/tmp/test.json');
    assert.equal(result.subcommand, 'create-edges');
    assert.equal(result.nodeId, null);
    assert.equal(result.filePath, '/tmp/edges.json');
  });

  it('引数不足でパースエラーをスローする', () => {
    assert.throws(
      () => testParse(['--graph=/tmp/test.json']),
      /引数が不足しています/
    );
  });

  it('未知のサブコマンドでパースエラーをスローする', () => {
    assert.throws(
      () => testParse(['--graph=/tmp/test.json', 'unknown-command']),
      /未知のサブコマンドです/
    );
  });

  it('--graph= プレフィックスなしでパースエラーをスローする', () => {
    assert.throws(
      () => testParse(['/tmp/test.json', 'list-nodes']),
      /最初の引数は --graph=<path>/
    );
  });

  it('create-nodes に --file がない場合パースエラーをスローする', () => {
    assert.throws(
      () => testParse(['--graph=/tmp/test.json', 'create-nodes']),
      /--file=<path> が必要です/
    );
  });

  it('update-node に --id がない場合パースエラーをスローする', () => {
    assert.throws(
      () => testParse(['--graph=/tmp/test.json', 'update-node', '--file=/tmp/patch.json']),
      /--id=<nodeId> が必要です/
    );
  });
});

describe('crud.js — readGraph', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crud-test-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('存在しないファイルパスで空のグラフを返す', () => {
    const graph = readGraph(path.join(tmpDir, 'nonexistent.json'));
    assert.equal(graph.sourceFile, path.join(tmpDir, 'nonexistent.json'));
    assert.deepEqual(graph.nodes, []);
    assert.deepEqual(graph.edges, []);
  });

  it('有効なグラフJSONファイルを読み込む', () => {
    const graphPath = path.join(tmpDir, 'valid.json');
    const testGraph = createTestGraph(
      [createTestNode('N0001', 'requirement')],
      [createTestEdge('N0001', 'N0002', 'depends_on')]
    );
    atomicWrite(graphPath, JSON.stringify(testGraph, null, 2));

    const graph = readGraph(graphPath);
    assert.equal(graph.sourceFile, '/test/source.md');
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].id, 'N0001');
    assert.equal(graph.edges.length, 1);
  });
});

describe('crud.js — atomicWrite', () => {
  let tmpDir;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crud-test-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('ファイルを正常に書き込む', () => {
    const filePath = path.join(tmpDir, 'output.json');
    const data = JSON.stringify({ ok: true });
    atomicWrite(filePath, data);
    assert.ok(fs.existsSync(filePath));
    assert.equal(fs.readFileSync(filePath, 'utf-8'), data);
  });

  it('一時ファイルが書き込み後に残っていない', () => {
    const filePath = path.join(tmpDir, 'clean.json');
    atomicWrite(filePath, JSON.stringify({ test: true }));
    // .tmp.pid ファイルが残っていないことを確認
    const tmpFiles = fs.readdirSync(tmpDir).filter((f) => f.includes('.tmp.'));
    assert.equal(tmpFiles.length, 0);
  });
});

describe('crud.js — executeCreateNodes', () => {
  it('有効なノードを追加する', () => {
    const graph = createTestGraph();
    const nodes = [createTestNode('N0001', 'requirement')];
    executeCreateNodes(graph, nodes);
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].id, 'N0001');
  });

  it('複数の有効なノードを一括追加する', () => {
    const graph = createTestGraph();
    const nodes = [
      createTestNode('N0001', 'requirement'),
      createTestNode('N0002', 'api_contract'),
      createTestNode('N0003', 'data_model'),
    ];
    executeCreateNodes(graph, nodes);
    assert.equal(graph.nodes.length, 3);
  });

  it('スキーマ違反のノードでエラー終了する（未実装はタイトルは必須のため、空文字列でテスト）', () => {
    const graph = createTestGraph();
    const invalidNode = { id: 'N0001', title: '', kind: 'requirement', summary: 'test', sourceRanges: [{ refId: 'REF001', startLine: 1, endLine: 5 }] };
    assert.throws(
      () => executeCreateNodes(graph, [invalidNode]),
      /スキーマ検証に失敗しました/
    );
    // グラフは変更されていない
    assert.equal(graph.nodes.length, 0);
  });

  it('重複IDでエラー終了しグラフは変更されない', () => {
    const graph = createTestGraph([createTestNode('N0001', 'requirement')]);
    const duplicateNode = createTestNode('N0001', 'requirement');
    assert.throws(
      () => executeCreateNodes(graph, [duplicateNode]),
      /既に存在します/
    );
    // グラフは変更されていない（重複チェックは追加前に全件検証）
    assert.equal(graph.nodes.length, 1);
  });
});

describe('crud.js — executeListNodeIds', () => {
  it('全ノード一覧をJSONで出力する', () => {
    const graph = createTestGraph([
      createTestNode('N0001', 'requirement'),
      createTestNode('N0002', 'api_contract'),
    ]);
    // 標準出力への出力を補足
    const logs = [];
    const originalLog = console.log;
    console.log = (msg) => logs.push(msg);

    try {
      executeListNodeIds(graph);
      assert.equal(logs.length, 1);
      const output = JSON.parse(logs[0]);
      assert.equal(output.length, 2);
      assert.equal(output[0].id, 'N0001');
      assert.equal(output[1].id, 'N0002');
    } finally {
      console.log = originalLog;
    }
  });

  it('空のグラフで空配列を出力する', () => {
    const graph = createTestGraph();
    const logs = [];
    const originalLog = console.log;
    console.log = (msg) => logs.push(msg);

    try {
      executeListNodeIds(graph);
      assert.equal(logs.length, 1);
      const output = JSON.parse(logs[0]);
      assert.deepEqual(output, []);
    } finally {
      console.log = originalLog;
    }
  });
});

describe('crud.js — executeGetNode', () => {
  it('既存ノードを取得する', () => {
    const graph = createTestGraph([createTestNode('N0001', 'requirement')]);
    const logs = [];
    const originalLog = console.log;
    console.log = (msg) => logs.push(msg);

    try {
      executeGetNode(graph, 'N0001');
      assert.equal(logs.length, 1);
      const output = JSON.parse(logs[0]);
      assert.equal(output.id, 'N0001');
      assert.equal(output.kind, 'requirement');
    } finally {
      console.log = originalLog;
    }
  });

  it('存在しないノードIDでエラー終了する', () => {
    const graph = createTestGraph([createTestNode('N0001', 'requirement')]);
    assert.throws(
      () => executeGetNode(graph, 'N9999'),
      /見つかりません/
    );
  });
});

describe('crud.js — executeUpdateNode', () => {
  it('ノードを更新する', () => {
    const graph = createTestGraph([createTestNode('N0001', 'requirement')]);
    executeUpdateNode(graph, 'N0001', { title: '更新後のタイトル', kind: 'api_contract' });
    assert.equal(graph.nodes[0].title, '更新後のタイトル');
    assert.equal(graph.nodes[0].kind, 'api_contract');
    // 更新していないフィールドは維持される
    assert.equal(graph.nodes[0].summary, 'これはテスト用ノードです。');
  });

  it('存在しないノードIDでエラー終了する', () => {
    const graph = createTestGraph([createTestNode('N0001', 'requirement')]);
    assert.throws(
      () => executeUpdateNode(graph, 'N9999', { title: '新しいタイトル' }),
      /見つかりません/
    );
  });
});

describe('crud.js — executeDeleteNode', () => {
  it('ノードを削除する', () => {
    const graph = createTestGraph([
      createTestNode('N0001', 'requirement'),
      createTestNode('N0002', 'api_contract'),
    ]);
    executeDeleteNode(graph, 'N0001');
    assert.equal(graph.nodes.length, 1);
    assert.equal(graph.nodes[0].id, 'N0002');
  });

  it('存在しないノードIDでエラー終了する', () => {
    const graph = createTestGraph([createTestNode('N0001', 'requirement')]);
    assert.throws(
      () => executeDeleteNode(graph, 'N9999'),
      /見つかりません/
    );
  });
});

describe('crud.js — executeCreateEdges', () => {
  it('有効なエッジを追加する', () => {
    const graph = createTestGraph([
      createTestNode('N0001', 'requirement'),
      createTestNode('N0002', 'api_contract'),
    ]);
    const edges = [createTestEdge('N0001', 'N0002', 'depends_on')];
    executeCreateEdges(graph, edges);
    assert.equal(graph.edges.length, 1);
    assert.equal(graph.edges[0].from, 'N0001');
    assert.equal(graph.edges[0].to, 'N0002');
  });

  it('存在しないfromノードを参照するエッジでエラー終了し変更されない', () => {
    const graph = createTestGraph([createTestNode('N0001', 'requirement')]);
    const edges = [createTestEdge('N9999', 'N0001', 'depends_on')];
    assert.throws(
      () => executeCreateEdges(graph, edges),
      /存在しません/
    );
    assert.equal(graph.edges.length, 0);
  });

  it('存在しないtoノードを参照するエッジでエラー終了し変更されない', () => {
    const graph = createTestGraph([createTestNode('N0001', 'requirement')]);
    const edges = [createTestEdge('N0001', 'N9999', 'depends_on')];
    assert.throws(
      () => executeCreateEdges(graph, edges),
      /存在しません/
    );
    assert.equal(graph.edges.length, 0);
  });
});
