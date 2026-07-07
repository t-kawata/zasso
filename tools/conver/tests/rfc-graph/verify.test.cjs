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
  extractHeadings,
  isHeadingCovered,
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
 * @param {Array} headingRefs — headingRefs 配列
 * @returns {Object} ノードデータ
 */
/** headingRefs形式のテストノード作成（カバレッジテスト用） */
function createCoverageNode(id, headingRefs) {
  return {
    id,
    title: "テストノード " + id,
    kind: "requirement",
    summary: "これはverify.jsのテスト用ノードです。",
    headingRefs,
  };
}

/** 見出し参照を含むテストノード作成 */
function createTestNode(id, headingRefs) {
  return {
    id,
    title: 'テストノード ' + id,
    kind: 'requirement',
    summary: 'テスト用ノード',
    headingRefs,
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
      nodes: [createTestNode('N0001', [{ refId: 'REF001', heading:1, texts:["test"]}])],
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

describe('verify.js — extractHeadings', () => {
  it('正常系: 大見出し（##）を抽出する', () => {
    const sourceLines = [
      '# タイトル',
      '## 要件定義',
      '本文',
      '### サブ',
      '## アーキテクチャ',
    ];
    const result = extractHeadings(sourceLines);
    assert.equal(result.length, 2);
    assert.equal(result[0].text, '要件定義');
    assert.equal(result[0].level, 2);
    assert.equal(result[1].text, 'アーキテクチャ');
  });

  it('正常系: 見出しがない場合に空配列を返す', () => {
    const result = extractHeadings(['本文のみ', 'さらに本文']);
    assert.deepEqual(result, []);
  });

  it('正常系: 空行のみで空配列を返す', () => {
    const result = extractHeadings(['', '  ']);
    assert.deepEqual(result, []);
  });

  it('正常系: h1 や h3 は抽出対象外', () => {
    const result = extractHeadings(['# h1', '## h2', '### h3']);
    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'h2');
  });
});

describe('verify.js — checkCoverage', () => {
  it('正常系: 全見出しが headingRefs でカバーされている', () => {
    const sourceLines = [
      '## 要件定義',
      '内容1',
      '## アーキテクチャ',
      '内容2',
    ];
    const nodes = [
      createCoverageNode('N0001', [{ refId: 'REF001', heading: 2, texts: ['要件定義'] }]),
      createCoverageNode('N0002', [{ refId: 'REF002', heading: 2, texts: ['アーキテクチャ'] }]),
    ];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredHeadings, []);
  });

  it('異常系: 未カバー見出しを検出する', () => {
    const sourceLines = [
      '## 要件定義',
      '内容1',
      '## アーキテクチャ',
      '内容2',
      '## セキュリティ',
      '内容3',
    ];
    const nodes = [
      createCoverageNode('N0001', [{ refId: 'REF001', heading: 2, texts: ['要件定義'] }]),
      createCoverageNode('N0002', [{ refId: 'REF002', heading: 2, texts: ['アーキテクチャ'] }]),
    ];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, false);
    assert.deepEqual(result.uncoveredHeadings, ['セキュリティ']);
  });

  it('正常系: 空のソースはカバー済みとみなす', () => {
    const sourceLines = [];
    const nodes = [];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredHeadings, []);
  });

  it('正常系: 見出しがないソースはカバー済みとみなす', () => {
    const sourceLines = ['行1', '行2', '行3'];
    const nodes = [];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredHeadings, []);
  });

  it('正常系: headingRefs がないノードは無視する', () => {
    const sourceLines = ['## 要件定義', '内容'];
    const nodes = [
      { id: 'N0001', title: '空', kind: 'requirement', summary: '空', headingRefs: [] },
    ];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, false);
    assert.deepEqual(result.uncoveredHeadings, ['要件定義']);
  });

  it('正常系: 部分的に heading テキストが一致する場合もカバー済み', () => {
    const sourceLines = ['## 要件定義詳細', '内容'];
    const nodes = [
      createCoverageNode('N0001', [{ refId: 'REF001', heading: 2, texts: ['要件定義'] }]),
    ];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredHeadings, []);
  });

  it('正常系: texts に複数トークンがある場合も正しくマッチ', () => {
    const sourceLines = ['## エラー処理方針', '内容'];
    const nodes = [
      createCoverageNode('N0001', [{ refId: 'REF001', heading: 2, texts: ['error_policy', 'エラー処理'] }]),
    ];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, true);
    assert.deepEqual(result.uncoveredHeadings, []);
  });

  it('異常系: heading レベルが一致しない場合はカバーされない', () => {
    const sourceLines = ['## 要件定義'];
    const nodes = [
      createCoverageNode('N0001', [{ refId: 'REF001', heading: 3, texts: ['要件定義'] }]),
    ];
    const result = checkCoverage(sourceLines, nodes);
    assert.equal(result.covered, false);
    assert.deepEqual(result.uncoveredHeadings, ['要件定義']);
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

      exitWithResult(false, ['要件定義', 'アーキテクチャ'], ['N0003']);

      process.exit = originalExit;
      console.log = originalStdout;
      assert.ok(stderrOutput.includes('[ERROR]'));
      assert.ok(stderrOutput.includes('未カバー'));
      assert.ok(stderrOutput.includes('孤立ノード'));
    } finally {
      // process.exit と console.log は try 内で明示的に復元
    }
  });

  it('異常系: 未カバー見出しのみのエラーメッセージ', () => {
    try {
      let stderrOutput = '';
      const originalExit = process.exit;
      process.exit = () => {};
      const originalStdout = console.log;
      console.log = () => {};
      process.stderr.write = (msg) => { stderrOutput += msg; };

      exitWithResult(false, ['セキュリティ'], []);

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
