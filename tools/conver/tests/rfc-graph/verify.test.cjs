/**
 * verify.test.cjs — verify.js のテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 * テスト対象モジュールの全公開関数をカバーする。
 * 一時ディレクトリを使用した実際のファイル I/O テストを含む。
 */

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// テスト対象モジュールを require パスで読み込む
const {
  parseArguments,
  readGraph,
  readSourceFile,
  checkCoverage,
  checkIsolated,
  exitWithResult,
  printUsage,
} = require('../../.claude/scripts/rfc-graph/verify.js');

// ============================================================
// テスト用ユーティリティ
// ============================================================

/** テスト用の一時ディレクトリパス */
let tmpDir;

/**
 * テスト前に一時ディレクトリを作成する
 */
function setupTempDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-test-'));
}

/**
 * テスト後に一時ディレクトリを削除する
 */
function cleanupTempDir() {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * テスト用のグラフファイルを作成する
 *
 * @param {string} fileName — ファイル名
 * @param {Object} data — グラフデータ
 * @returns {string} 作成されたファイルの絶対パス
 */
function writeGraphFile(fileName, data) {
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
  return filePath;
}

/**
 * テスト用のソースファイルを作成する
 *
 * @param {string} fileName — ファイル名
 * @param {string[]} lines — 行配列
 * @returns {string} 作成されたファイルの絶対パス
 */
function writeSourceFile(fileName, lines) {
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
}

/**
 * テスト用の有効なノードを作成する
 *
 * @param {string} id — ノードID
 * @param {Array} sourceRanges — sourceRanges 配列
 * @returns {Object} ノードデータ
 */
function createTestNode(id, sourceRanges) {
  return {
    id,
    title: 'テストノード ' + id,
    kind: 'requirement',
    summary: 'テスト用ノード',
    sourceRanges,
  };
}

/**
 * テスト用の有効なエッジを作成する
 *
 * @param {string} from — 参照元ノードID
 * @param {string} to — 参照先ノードID
 * @returns {Object} エッジデータ
 */
function createTestEdge(from, to) {
  return {
    from,
    to,
    type: 'references',
    attributes: { strength: 'hard', bidirectional: false },
  };
}

// ============================================================
// テストスイート
// ============================================================

describe('verify.js — parseArguments', () => {
  it('正常系: --graph=p --source=q をパースする', () => {
    const result = parseArguments(['--graph=/path/to/graph.json', '--source=/path/to/source.md']);
    assert.equal(result.graphPath, '/path/to/graph.json');
    assert.equal(result.sourcePath, '/path/to/source.md');
  });

  it('正常系: printUsage が使用法を表示する', () => {
    let logOutput = '';
    const originalLog = console.log;
    console.log = (msg) => { logOutput += msg; };

    try {
      printUsage();
      assert.ok(logOutput.includes('verify.js'));
      assert.ok(logOutput.includes('--graph'));
      assert.ok(logOutput.includes('--source'));
    } finally {
      console.log = originalLog;
    }
  });

  it('異常系: 引数が不足している場合にエラーを投げる', () => {
    assert.throws(() => {
      parseArguments(['--graph=/path.json']);
    }, /引数が不足/);
  });

  it('異常系: 引数なしでエラーを投げる', () => {
    assert.throws(() => {
      parseArguments([]);
    }, /引数が不足/);
  });

  it('異常系: 最初の引数が --graph でない場合にエラーを投げる', () => {
    assert.throws(() => {
      parseArguments(['--source=/path.md', '--graph=/path.json']);
    }, /最初の引数は --graph/);
  });

  it('異常系: 余剰引数がある場合にエラーを投げる', () => {
    assert.throws(() => {
      parseArguments(['--graph=p', '--source=q', '--extra']);
    }, /余剰な引数/);
  });
});

describe('verify.js — readGraph', () => {
  before(setupTempDir);
  after(cleanupTempDir);

  it('正常系: 有効なグラフJSONを読み込む', () => {
    const graphData = {
      sourceFile: '/test/source.md',
      nodes: [createTestNode('N0001', [{ refId: 'REF001', startLine: 1, endLine: 3 }])],
      edges: [],
    };
    const graphPath = writeGraphFile('valid-graph.json', graphData);

    const result = readGraph(graphPath);
    assert.deepEqual(result, graphData);
  });

  it('異常系: 存在しないファイルでエラーを投げる', () => {
    assert.throws(() => {
      readGraph(path.join(tmpDir, 'nonexistent.json'));
    }, /見つかりません/);
  });

  it('異常系: 不正なJSONでエラーを投げる', () => {
    const filePath = path.join(tmpDir, 'invalid.json');
    fs.writeFileSync(filePath, '{不正なJSON}', 'utf8');

    assert.throws(() => {
      readGraph(filePath);
    }, /JSONパース/);
  });

  it('異常系: nodes/edges がない構造でエラーを投げる', () => {
    const filePath = path.join(tmpDir, 'no-nodes.json');
    fs.writeFileSync(filePath, JSON.stringify({ sourceFile: '/test.md' }), 'utf8');

    assert.throws(() => {
      readGraph(filePath);
    }, /構造が不正/);
  });
});

describe('verify.js — readSourceFile', () => {
  before(setupTempDir);
  after(cleanupTempDir);

  it('正常系: ソースファイルを行配列として読み込む', () => {
    const filePath = writeSourceFile('test.md', [
      '# タイトル',
      '',
      'コンテンツ1',
      'コンテンツ2',
    ]);
    const result = readSourceFile(filePath);
    assert.deepEqual(result, ['# タイトル', '', 'コンテンツ1', 'コンテンツ2']);
  });

  it('異常系: 存在しないファイルでエラーを投げる', () => {
    assert.throws(() => {
      readSourceFile(path.join(tmpDir, 'nonexistent.md'));
    }, /見つかりません/);
  });

  it('正常系: 空ファイルは空配列を返す', () => {
    const filePath = writeSourceFile('empty.md', ['']);
    const result = readSourceFile(filePath);
    assert.deepEqual(result, ['']);
  });
});

describe('verify.js — checkCoverage', () => {
  it('正常系: 全行カバーされている', () => {
    const sourceLines = ['行1', '行2', '行3'];
    const nodes = [
      createTestNode('N0001', [{ refId: 'REF001', startLine: 1, endLine: 3 }]),
    ];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredLines, []);
  });

  it('正常系: 空行はカバレッジ対象外', () => {
    const sourceLines = ['行1', '', '行3'];
    const nodes = [
      createTestNode('N0001', [{ refId: 'REF001', startLine: 1, endLine: 1 }]),
      createTestNode('N0002', [{ refId: 'REF002', startLine: 3, endLine: 3 }]),
    ];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredLines, []);
  });

  it('異常系: 未カバー行を検出する', () => {
    const sourceLines = ['行1', '行2', '行3'];
    const nodes = [
      createTestNode('N0001', [{ refId: 'REF001', startLine: 1, endLine: 1 }]),
    ];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, false);
    assert.deepEqual(result.uncoveredLines, [2, 3]);
  });

  it('境界値: 空のソース', () => {
    const sourceLines = [];
    const nodes = [];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredLines, []);
  });

  it('正常系: 複数ノード＋範囲重複', () => {
    const sourceLines = ['行1', '行2', '行3', '行4', '行5'];
    const nodes = [
      createTestNode('N0001', [{ refId: 'REF001', startLine: 1, endLine: 3 }]),
      createTestNode('N0002', [{ refId: 'REF002', startLine: 3, endLine: 5 }]),
    ];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredLines, []);
  });

  it('正常系: ソースRangesがないノードは無視する', () => {
    const sourceLines = ['行1', '行2'];
    const nodes = [
      createTestNode('N0001', [{ refId: 'REF001', startLine: 1, endLine: 2 }]),
      { id: 'N0002', title: '空', kind: 'requirement', summary: '空', sourceRanges: [] },
    ];
    const result = checkCoverage(sourceLines, nodes);
    // N0002 は sourceRanges が空 → カバレッジに影響なし
    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredLines, []);
  });
});

describe('verify.js — checkIsolated', () => {
  it('正常系: 全ノード接続', () => {
    const nodes = [
      { id: 'N0001' }, { id: 'N0002' }, { id: 'N0003' },
    ];
    const edges = [
      createTestEdge('N0001', 'N0002'),
      createTestEdge('N0002', 'N0003'),
    ];
    const result = checkIsolated(nodes, edges);
    assert.equal(result.connected, true);
    assert.deepEqual(result.isolatedNodes, []);
  });

  it('異常系: 孤立ノードを検出する', () => {
    const nodes = [
      { id: 'N0001' }, { id: 'N0002' }, { id: 'N0003' },
    ];
    const edges = [
      createTestEdge('N0001', 'N0002'),
    ];
    const result = checkIsolated(nodes, edges);
    assert.equal(result.connected, false);
    assert.deepEqual(result.isolatedNodes, ['N0003']);
  });

  it('境界値: エッジ0本 — 全ノードが孤立', () => {
    const nodes = [
      { id: 'N0001' }, { id: 'N0002' },
    ];
    const edges = [];
    const result = checkIsolated(nodes, edges);
    assert.equal(result.connected, false);
    assert.deepEqual(result.isolatedNodes, ['N0001', 'N0002']);
  });

  it('境界値: ノード0件', () => {
    const nodes = [];
    const edges = [];
    const result = checkIsolated(nodes, edges);
    assert.equal(result.connected, true);
    assert.deepEqual(result.isolatedNodes, []);
  });

  it('正常系: 双方向エッジでも正しく検出', () => {
    const nodes = [
      { id: 'N0001' }, { id: 'N0002' },
    ];
    const edges = [
      { from: 'N0001', to: 'N0002', type: 'references', attributes: { strength: 'soft', bidirectional: true } },
    ];
    const result = checkIsolated(nodes, edges);
    assert.equal(result.connected, true);
    assert.deepEqual(result.isolatedNodes, []);
  });
});

describe('verify.js — exitWithResult', () => {
  it('正常系: ok=true で stderr 出力なし', () => {
    try {
      let stderrOutput = '';
      const originalExit = process.exit;
      process.exit = () => {};
      const originalStdout = console.log;
      console.log = () => {};
      process.stderr.write = (msg) => { stderrOutput += msg; };

      exitWithResult(true, [], []);

      process.exit = originalExit;
      console.log = originalStdout;
      assert.equal(stderrOutput, '');
    } finally {
      // process.exit と console.log は try 内で明示的に復元
    }
  });

  it('異常系: ok=false で stderr に3段テンプレートを出力する', () => {
    try {
      let stderrOutput = '';
      const originalExit = process.exit;
      process.exit = () => {};
      const originalStdout = console.log;
      console.log = () => {};
      process.stderr.write = (msg) => { stderrOutput += msg; };

      exitWithResult(false, [2, 3], ['N0003']);

      process.exit = originalExit;
      console.log = originalStdout;
      assert.ok(stderrOutput.includes('[ERROR]'));
      assert.ok(stderrOutput.includes('未カバー'));
      assert.ok(stderrOutput.includes('孤立ノード'));
    } finally {
      // process.exit と console.log は try 内で明示的に復元
    }
  });

  it('異常系: 未カバー行のみのエラーメッセージ', () => {
    try {
      let stderrOutput = '';
      const originalExit = process.exit;
      process.exit = () => {};
      const originalStdout = console.log;
      console.log = () => {};
      process.stderr.write = (msg) => { stderrOutput += msg; };

      exitWithResult(false, [2], []);

      process.exit = originalExit;
      console.log = originalStdout;
      assert.ok(stderrOutput.includes('[ERROR]'));
      assert.ok(stderrOutput.includes('未カバー'));
      assert.ok(!stderrOutput.includes('孤立'));
    } finally {
      // process.exit と console.log は try 内で明示的に復元
    }
  });

  it('異常系: 孤立ノードのみのエラーメッセージ', () => {
    try {
      let stderrOutput = '';
      const originalExit = process.exit;
      process.exit = () => {};
      const originalStdout = console.log;
      console.log = () => {};
      process.stderr.write = (msg) => { stderrOutput += msg; };

      exitWithResult(false, [], ['N0001']);

      process.exit = originalExit;
      console.log = originalStdout;
      assert.ok(stderrOutput.includes('[ERROR]'));
      assert.ok(stderrOutput.includes('孤立ノード'));
      assert.ok(!stderrOutput.includes('未カバー'));
    } finally {
      // process.exit と console.log は try 内で明示的に復元
    }
  });
});
