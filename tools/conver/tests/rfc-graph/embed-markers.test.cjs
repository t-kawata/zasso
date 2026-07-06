/**
 * embed-markers.test.cjs — embed-markers.js のテスト
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
  extractExistingRefIds,
  embedAll,
  atomicWrite,
  exitWithError,
  printUsage,
} = require('../../.claude/scripts/rfc-graph/embed-markers.js');

// ============================================================
// テスト用ユーティリティ
// ============================================================

/** テスト用の一時ディレクトリパス */
let tmpDir;

/**
 * テスト前に一時ディレクトリを作成する
 */
function setupTempDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-test-'));
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
 * ソースファイルの内容を行配列として読み込む（検証用ヘルパー）
 *
 * @param {string} filePath — ファイルパス
 * @returns {string[]} 行配列
 */
function readLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n');
}

// ============================================================
// テストスイート
// ============================================================

describe('embed-markers.js — parseArguments', () => {
  const originalArgv = process.argv;

  function withArgv(args, fn) {
    process.argv = ['node', 'embed-markers.js', ...args];
    try {
      return fn();
    } finally {
      process.argv = originalArgv;
    }
  }

  it('正常系: --graph=p --source=q をパースする', () => {
    const result = withArgv(['--graph=/path/to/graph.json', '--source=/path/to/source.md'], () => {
      return parseArguments();
    });
    assert.equal(result.graphPath, '/path/to/graph.json');
    assert.equal(result.sourcePath, '/path/to/source.md');
  });

  it('異常系: 引数が不足している場合にエラーを投げる', () => {
    assert.throws(() => {
      withArgv(['--graph=/path.json'], () => parseArguments());
    }, /引数が不足/);
  });

  it('異常系: 余剰引数がある場合にエラーを投げる', () => {
    assert.throws(() => {
      withArgv(['--graph=p', '--source=q', '--extra'], () => parseArguments());
    }, /余剰な引数/);
  });
});

describe('embed-markers.js — readGraph', () => {
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
    fs.writeFileSync(filePath, '{不正}', 'utf8');

    assert.throws(() => {
      readGraph(filePath);
    }, /JSONパース/);
  });
});

describe('embed-markers.js — readSourceFile', () => {
  before(setupTempDir);
  after(cleanupTempDir);

  it('正常系: ソースファイルを行配列として読み込む', () => {
    const filePath = writeSourceFile('test.md', ['# Title', '', 'Content']);
    const result = readSourceFile(filePath);
    assert.deepEqual(result, ['# Title', '', 'Content']);
  });
});

describe('embed-markers.js — extractExistingRefIds', () => {
  it('正常系: 既存のREFマーカーを抽出する', () => {
    const sourceLines = [
      '[::REF001-START::] # セクション1',
      '内容',
      '[::REF001-END::]',
      '',
      '[::REF042-START::] ## セクション2',
      '詳細',
      '[::REF042-END::]',
    ];
    const result = extractExistingRefIds(sourceLines);
    assert.equal(result.size, 2);
    assert.ok(result.has('REF001'));
    assert.ok(result.has('REF042'));
  });

  it('正常系: マーカーがないファイルは空Setを返す', () => {
    const sourceLines = ['# タイトル', '', 'コンテンツ'];
    const result = extractExistingRefIds(sourceLines);
    assert.equal(result.size, 0);
  });

  it('正常系: ENDマーカーのみでも抽出できる', () => {
    const sourceLines = [
      '[::REF999-END::] 終了',
    ];
    const result = extractExistingRefIds(sourceLines);
    assert.equal(result.size, 1);
    assert.ok(result.has('REF999'));
  });
});

describe('embed-markers.js — embedAll', () => {
  it('正常系: 初回実行でマーカーを挿入する', () => {
    const sourceLines = ['行1', '行2', '行3'];
    const nodes = [
      createTestNode('N0001', [{ refId: 'REF001', startLine: 1, endLine: 3 }]),
    ];
    const result = embedAll(sourceLines, nodes);
    assert.equal(result.insertedCount, 1);
    assert.ok(result.result[0].startsWith('[::REF001-START::]'));
    assert.ok(result.result[2].includes('[::REF001-END::]'));
  });

  it('正常系: 冪等性 — 2回実行で差分ゼロ', () => {
    const sourceLines = ['行1', '行2', '行3'];
    const nodes = [
      createTestNode('N0001', [{ refId: 'REF001', startLine: 1, endLine: 3 }]),
    ];

    // 1回目
    const firstResult = embedAll(sourceLines, nodes);

    // 2回目（1回目の結果を入力として使う）
    const secondResult = embedAll(firstResult.result, nodes);

    assert.equal(secondResult.insertedCount, 0);
    assert.deepEqual(secondResult.result, firstResult.result);
  });

  it('正常系: 同一refIdの重複挿入を防止する', () => {
    const sourceLines = ['行1', '行2', '行3'];
    const nodes = [
      createTestNode('N0001', [
        { refId: 'REF001', startLine: 1, endLine: 1 },
        { refId: 'REF001', startLine: 2, endLine: 3 },  // 同一refIdが別範囲
      ]),
    ];
    const result = embedAll(sourceLines, nodes);
    // REF001 は1回しか挿入されない
    assert.equal(result.insertedCount, 1);
    assert.ok(result.result[0].startsWith('[::REF001-START::]'));
  });

  it('正常系: 異種refIdの範囲重複を許容する', () => {
    const sourceLines = ['行1', '行2'];
    const nodes = [
      createTestNode('N0001', [{ refId: 'REF001', startLine: 1, endLine: 2 }]),
      createTestNode('N0002', [{ refId: 'REF002', startLine: 1, endLine: 2 }]),
    ];
    const result = embedAll(sourceLines, nodes);
    assert.equal(result.insertedCount, 2);
    assert.ok(result.result[0].includes('[::REF001-START::]'));
    assert.ok(result.result[0].includes('[::REF002-START::]'));
  });

  it('正常系: 1行のみの範囲でSTARTとENDが両方挿入される', () => {
    const sourceLines = ['ただ1行'];
    const nodes = [
      createTestNode('N0001', [{ refId: 'REF001', startLine: 1, endLine: 1 }]),
    ];
    const result = embedAll(sourceLines, nodes);
    assert.equal(result.insertedCount, 1);
    assert.ok(result.result[0].startsWith('[::REF001-START::]'));
    assert.ok(result.result[0].includes('[::REF001-END::]'));
  });

  it('異常系: 行番号超過でエラーを投げる', () => {
    const sourceLines = ['行1', '行2'];
    const nodes = [
      createTestNode('N0001', [{ refId: 'REF001', startLine: 1, endLine: 5 }]),  // 5行目は存在しない
    ];
    assert.throws(() => {
      embedAll(sourceLines, nodes);
    }, /行番号/);
  });
});

describe('embed-markers.js — atomicWrite', () => {
  before(setupTempDir);
  after(cleanupTempDir);

  it('正常系: ファイルをアトミックに書き込む', () => {
    const targetPath = path.join(tmpDir, 'test-output.md');
    const data = '# テスト出力\n\n内容\n';

    atomicWrite(targetPath, data);

    assert.ok(fs.existsSync(targetPath));
    const written = fs.readFileSync(targetPath, 'utf8');
    assert.equal(written, data);
  });

  it('正常系: 上書きしても一時ファイルが残らない', () => {
    const targetPath = path.join(tmpDir, 'overwrite.md');
    fs.writeFileSync(targetPath, 'old content', 'utf8');

    atomicWrite(targetPath, 'new content');

    const tmpFiles = fs.readdirSync(tmpDir).filter(f => f.includes('.tmp.'));
    assert.equal(tmpFiles.length, 0);
    const written = fs.readFileSync(targetPath, 'utf8');
    assert.equal(written, 'new content');
  });
});

describe('embed-markers.js — exitWithError', () => {
  const originalExit = process.exit;
  const originalStderrWrite = process.stderr.write;

  afterEach(() => {
    process.exit = originalExit;
    process.stderr.write = originalStderrWrite;
  });

  it('終了コード1 + 3段テンプレートをstderrに出力する', () => {
    let exitCode = null;
    let stderrOutput = '';
    process.exit = (code) => { exitCode = code; };
    process.stderr.write = (msg) => { stderrOutput += msg; };

    exitWithError(
      'ファイルが見つかりません。',
      '/path/to/file.md が存在しません。',
      '正しいパスを指定してください。'
    );

    assert.equal(exitCode, 1);
    assert.ok(stderrOutput.includes('[ERROR]'));
    assert.ok(stderrOutput.includes('原因:'));
    assert.ok(stderrOutput.includes('対応:'));
  });
});
