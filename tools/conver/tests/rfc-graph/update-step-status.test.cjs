/**
 * update-step-status.test.cjs — update-step-status.js のテスト
 *
 * テストフレームワーク: Node.js 標準の node:test + node:assert/strict
 * テスト対象モジュールの全関数をカバーする。
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
  readStatus,
  createDefaultStatus,
  validateStepNumber,
  executeStartStep,
  executeEndStep,
  executeFailStep,
  executeResetToStep,
  executeStatus,
  executeCleanup,
  atomicWrite,
  MIN_STEP,
  MAX_STEP,
  ALLOWED_SUBCOMMANDS,
  STATUS_PENDING,
  STATUS_RUNNING,
  STATUS_DONE,
  STATUS_ERROR,
} = require('../../.claude/scripts/rfc-graph/update-step-status.js');

// ============================================================
// テスト用ユーティリティ
// ============================================================

/** テスト用の一時ディレクトリパス */
let tmpDir;

/** テスト用のステータスファイルパス */
let testStatusPath;

/**
 * テスト用の有効なステータスデータを作成する
 *
 * @param {number} currentStep — 設定する currentStep
 * @param {Object<string, string>} [overrides] — 上書きするStep状態
 * @returns {Object} ステータスデータ
 */
function createTestStatus(currentStep = 1, overrides = {}) {
  const steps = {};
  for (let i = MIN_STEP; i <= MAX_STEP; i++) {
    steps[String(i)] = STATUS_PENDING;
  }
  Object.assign(steps, overrides);
  return {
    sourceFile: '/test/source.md',
    graphFile: '/test/source-GRAPH.json',
    currentStep,
    steps,
  };
}

/**
 * テスト用のステータスファイルを作成する
 *
 * @param {Object} data — 書き込むステータスデータ
 * @returns {string} 作成されたファイルのパス
 */
function writeTestStatusFile(data) {
  const filePath = path.join(tmpDir, 'test-GRAPHIFY-Status.json');
  fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
  return filePath;
}

// ============================================================
// 定数テスト
// ============================================================

describe('定数', () => {
  it('MIN_STEP は 0 である', () => {
    assert.strictEqual(MIN_STEP, 0);
  });

  it('MAX_STEP は 5 である', () => {
    assert.strictEqual(MAX_STEP, 5);
  });

  it('ALLOWED_SUBCOMMANDS は7つのサブコマンド名を持つ', () => {
    assert.deepStrictEqual(ALLOWED_SUBCOMMANDS, [
      'start-step',
      'end-step',
      'fail-step',
      'reset-to-step',
      'status',
      'cleanup',
      'backup',
    ]);
  });

  it('Step状態定数が正しい', () => {
    assert.strictEqual(STATUS_PENDING, 'pending');
    assert.strictEqual(STATUS_RUNNING, 'running');
    assert.strictEqual(STATUS_DONE, 'done');
    assert.strictEqual(STATUS_ERROR, 'error');
  });
});

// ============================================================
// validateStepNumber テスト
// ============================================================

describe('validateStepNumber()', () => {
  it('1 は有効なStep番号', () => {
    assert.strictEqual(validateStepNumber(1), true);
  });

  it('3 は有効なStep番号', () => {
    assert.strictEqual(validateStepNumber(3), true);
  });

  it('5 は有効なStep番号', () => {
    assert.strictEqual(validateStepNumber(5), true);
  });

  it('0 は有効なStep番号（Step 0: 見出し重複排除）', () => {
    assert.strictEqual(validateStepNumber(0), true);
  });

  it('5 は有効なStep番号（範囲上限）', () => {
    assert.strictEqual(validateStepNumber(5), true);
  });

  it('6 は無効なStep番号（範囲超過）', () => {
    assert.strictEqual(validateStepNumber(6), false);
  });

  it('負の数は無効なStep番号', () => {
    assert.strictEqual(validateStepNumber(-1), false);
  });

  it('小数は無効なStep番号', () => {
    assert.strictEqual(validateStepNumber(2.5), false);
  });

  it('NaN は無効なStep番号', () => {
    assert.strictEqual(validateStepNumber(NaN), false);
  });
});

// ============================================================
// サブコマンド実行テスト（純粋関数）
// ============================================================

describe('executeStartStep()', () => {
  it('start-step 1 で steps[1]=running、currentStep=1 になる', () => {
    const status = createTestStatus(1);
    executeStartStep(status, 1);
    assert.strictEqual(status.steps['1'], STATUS_RUNNING);
    assert.strictEqual(status.currentStep, 1);
  });

  it('start-step 5 で steps[5]=running、currentStep=5 になる（最終Step）', () => {
    const status = createTestStatus(4);
    executeStartStep(status, 5);
    assert.strictEqual(status.steps['5'], STATUS_RUNNING);
    assert.strictEqual(status.currentStep, 5);
  });

  it('既に done のStepに start-step しても上書きされる（再実行対応）', () => {
    const status = createTestStatus(2, { '2': STATUS_DONE });
    executeStartStep(status, 2);
    assert.strictEqual(status.steps['2'], STATUS_RUNNING);
  });
});

describe('executeEndStep()', () => {
  it('end-step 1 で steps[1]=done、currentStep=2 になる', () => {
    const status = createTestStatus(1);
    executeEndStep(status, 1);
    assert.strictEqual(status.steps['1'], STATUS_DONE);
    assert.strictEqual(status.currentStep, 2);
  });

  it('end-step 5 で steps[5]=done、currentStep=6 になる（全完了）', () => {
    const status = createTestStatus(5);
    executeEndStep(status, 5);
    assert.strictEqual(status.steps['5'], STATUS_DONE);
    assert.strictEqual(status.currentStep, 6);
  });

  it('end-step を繰り返しても冪等に動作する', () => {
    const status = createTestStatus(1);
    executeEndStep(status, 1);
    executeEndStep(status, 1);
    assert.strictEqual(status.steps['1'], STATUS_DONE);
  });
});

describe('executeFailStep()', () => {
  it('fail-step 2 で steps[2]=error、currentStep は変更されない', () => {
    const status = createTestStatus(3);
    executeFailStep(status, 2);
    assert.strictEqual(status.steps['2'], STATUS_ERROR);
    assert.strictEqual(status.currentStep, 3);
  });

  it('fail-step を繰り返しても冪等に動作する', () => {
    const status = createTestStatus(1);
    executeFailStep(status, 1);
    executeFailStep(status, 1);
    assert.strictEqual(status.steps['1'], STATUS_ERROR);
  });
});

describe('executeResetToStep()', () => {
  it('reset-to-step 2 で steps[3]〜steps[5]=pending、currentStep=2、steps[1]〜steps[2] は不変', () => {
    const status = createTestStatus(4, {
      '1': STATUS_DONE,
      '2': STATUS_DONE,
      '3': STATUS_DONE,
      '4': STATUS_RUNNING,
    });
    executeResetToStep(status, 2);
    assert.strictEqual(status.steps['1'], STATUS_DONE);   // 不変
    assert.strictEqual(status.steps['2'], STATUS_DONE);   // 不変
    assert.strictEqual(status.steps['3'], STATUS_PENDING); // リセット
    assert.strictEqual(status.steps['4'], STATUS_PENDING); // リセット
    assert.strictEqual(status.steps['5'], STATUS_PENDING); // リセット
    assert.strictEqual(status.currentStep, 2);
  });

  it('reset-to-step 5 は何もリセットしない（5より大きいStepは存在しない）', () => {
    const status = createTestStatus(5, {
      '1': STATUS_DONE,
      '2': STATUS_DONE,
      '3': STATUS_DONE,
      '4': STATUS_DONE,
      '5': STATUS_RUNNING,
    });
    executeResetToStep(status, 5);
    assert.strictEqual(status.steps['1'], STATUS_DONE);
    assert.strictEqual(status.steps['5'], STATUS_RUNNING);
    assert.strictEqual(status.currentStep, 5);
  });
});

describe('executeStatus()', () => {
  it('status サブコマンドで整形JSONが出力される', () => {
    const status = createTestStatus(2, { '1': STATUS_DONE });
    const originalLog = console.log;
    const capturedOutput = [];
    console.log = (msg) => { capturedOutput.push(msg); };
    try {
      executeStatus(status);
      const output = capturedOutput.join('');
      const parsed = JSON.parse(output);
      assert.strictEqual(parsed.currentStep, 2);
      assert.strictEqual(parsed.steps['1'], STATUS_DONE);
      assert.strictEqual(parsed.steps['2'], STATUS_PENDING);
    } finally {
      console.log = originalLog;
    }
  });
});

// ============================================================
// parseArguments テスト（process.argv のモック）
// ============================================================

describe('parseArguments()', () => {
  const originalArgv = process.argv;

  after(() => {
    process.argv = originalArgv;
  });

  it('正しい引数で start-step をパースできる', () => {
    process.argv = ['node', 'script.js', '--graphify-status=/tmp/status.json', 'start-step', '1'];
    const result = parseArguments();
    assert.strictEqual(result.statusPath, '/tmp/status.json');
    assert.strictEqual(result.subcommand, 'start-step');
    assert.strictEqual(result.stepNumber, 1);
  });

  it('正しい引数で status をパースできる（Step番号なし）', () => {
    process.argv = ['node', 'script.js', '--graphify-status=/tmp/status.json', 'status'];
    const result = parseArguments();
    assert.strictEqual(result.statusPath, '/tmp/status.json');
    assert.strictEqual(result.subcommand, 'status');
    assert.strictEqual(result.stepNumber, null);
  });

  it('引数不足（サブコマンドなし）でエラーを投げる', () => {
    process.argv = ['node', 'script.js', '--graphify-status=/tmp/status.json'];
    assert.throws(() => parseArguments(), /引数が不足/);
  });

  it('引数不足（Step番号なしの start-step）でエラーを投げる', () => {
    process.argv = ['node', 'script.js', '--graphify-status=/tmp/status.json', 'start-step'];
    assert.throws(() => parseArguments(), /Step番号が必要/);
  });

  it('未知のサブコマンドでエラーを投げる', () => {
    process.argv = ['node', 'script.js', '--graphify-status=/tmp/status.json', 'unknown-cmd', '1'];
    assert.throws(() => parseArguments(), /未知のサブコマンド/);
  });

  it('--graphify-status= がない（空 path）でエラーを投げる', () => {
    process.argv = ['node', 'script.js', '--graphify-status=', 'start-step', '1'];
    assert.throws(() => parseArguments(), /パスが空/);
  });

  it('--graphify-status フラグ自体がないでエラーを投げる', () => {
    process.argv = ['node', 'script.js', '/tmp/status.json', 'start-step', '1'];
    assert.throws(() => parseArguments(), /--graphify-status/);
  });

  it('Step番号が非数値でエラーを投げる', () => {
    process.argv = ['node', 'script.js', '--graphify-status=/tmp/s.json', 'start-step', 'abc'];
    assert.throws(() => parseArguments(), /数値ではありません/);
  });

  // ============================================================
  // --status= エイリアスフラグのテスト
  // ============================================================

  it('--status= で start-step をパースできる（エイリアス互換）', () => {
    process.argv = ['node', 'script.js', '--status=/tmp/boundify.json', 'start-step', '1'];
    const result = parseArguments();
    assert.strictEqual(result.statusPath, '/tmp/boundify.json');
    assert.strictEqual(result.subcommand, 'start-step');
    assert.strictEqual(result.stepNumber, 1);
  });

  it('--status= で status をパースできる（Step番号なし）', () => {
    process.argv = ['node', 'script.js', '--status=/tmp/boundify.json', 'status'];
    const result = parseArguments();
    assert.strictEqual(result.statusPath, '/tmp/boundify.json');
    assert.strictEqual(result.subcommand, 'status');
    assert.strictEqual(result.stepNumber, null);
  });

  it('--graphify-status= と --status= のフラグ定数が両方とも定義されている', () => {
    // FLAG_ALIAS_STATUS の存在を確認（テスト用に module.exports から参照）
    const mod = require('../../.claude/scripts/rfc-graph/update-step-status.js');
    assert.ok(mod.FLAG_GRAPHIFY_STATUS);
    assert.ok(mod.FLAG_ALIAS_STATUS);
    assert.strictEqual(mod.FLAG_GRAPHIFY_STATUS, '--graphify-status=');
    assert.strictEqual(mod.FLAG_ALIAS_STATUS, '--status=');
  });

  it('--status= の path が空でエラーを投げる', () => {
    process.argv = ['node', 'script.js', '--status=', 'start-step', '1'];
    assert.throws(() => parseArguments(), /パスが空/);
  });

  it('--stat=path の誤記（typo）でエラーを投げる', () => {
    process.argv = ['node', 'script.js', '--stat=/tmp/s.json', 'start-step', '1'];
    assert.throws(() => parseArguments(), /--graphify-status/);
  });
});

// ============================================================
// ファイルI/O テスト（一時ディレクトリ使用）
// ============================================================

describe('ファイルI/O', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-step-status-test-'));
    testStatusPath = path.join(tmpDir, 'test-GRAPHIFY-Status.json');
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('createDefaultStatus()', () => {
    it('存在しないパスからデフォルト状態を生成する', () => {
      const nonExistentPath = path.join(tmpDir, 'non-existent-GRAPHIFY-Status.json');
      const status = createDefaultStatus(nonExistentPath);
      assert.ok(status.sourceFile.endsWith('non-existent.md'));
      assert.ok(status.graphFile.endsWith('non-existent-GRAPH.json'));
      assert.strictEqual(status.currentStep, MIN_STEP);
      assert.strictEqual(status.steps['0'], STATUS_PENDING);
      assert.strictEqual(status.steps['5'], STATUS_PENDING);
      assert.strictEqual(Object.keys(status.steps).length, MAX_STEP - MIN_STEP + 1);
    });
  });

  describe('readStatus()', () => {
    it('存在するファイルを正しく読み込む', () => {
      const testData = createTestStatus(2, { '1': STATUS_DONE });
      const filePath = writeTestStatusFile(testData);
      const loaded = readStatus(filePath);
      assert.strictEqual(loaded.currentStep, 2);
      assert.strictEqual(loaded.steps['1'], STATUS_DONE);
    });

    it('存在しないファイルはデフォルト状態を返す', () => {
      const nonExistentPath = path.join(tmpDir, 'no-such-file-GRAPHIFY-Status.json');
      const status = readStatus(nonExistentPath);
      assert.strictEqual(status.currentStep, MIN_STEP);
      assert.strictEqual(status.steps['0'], STATUS_PENDING);
    });

    it('不正なJSONファイルでエラーを投げる', () => {
      const badPath = path.join(tmpDir, 'bad-json-GRAPHIFY-Status.json');
      fs.writeFileSync(badPath, '{ invalid json }', 'utf8');
      assert.throws(() => readStatus(badPath), /SyntaxError/);
    });

    it('必須フィールド不足のファイルでエラーを投げる', () => {
      const badPath = path.join(tmpDir, 'incomplete-Status.json');
      fs.writeFileSync(badPath, JSON.stringify({ foo: 'bar' }), 'utf8');
      assert.throws(() => readStatus(badPath), /形式が不正/);
    });
  });

  describe('atomicWrite()', () => {
    // NOTE: tmpDir は before() で設定されるため、describe 評価時ではなく test 実行時に解決する
    function getTestFilePath() {
      return path.join(tmpDir, 'atomic-test.json');
    }

    afterEach(() => {
      // 後片付け
      try { fs.unlinkSync(getTestFilePath()); } catch { /* 無視 */ }
    });

    it('正常にファイルを書き込める', () => {
      atomicWrite(getTestFilePath(), JSON.stringify({ key: 'value' }));
      const content = fs.readFileSync(getTestFilePath(), 'utf8');
      assert.strictEqual(JSON.parse(content).key, 'value');
    });

    it('書き込み後、一時ファイルが残っていない', () => {
      atomicWrite(getTestFilePath(), JSON.stringify({ test: 'data' }));
      const tmpFiles = fs.readdirSync(tmpDir).filter(f => f.includes('.tmp.'));
      assert.strictEqual(tmpFiles.length, 0);
    });

    it('大きなJSONデータでも正常に書き込める', () => {
      const largeObj = {
        sourceFile: '/test/big.md',
        graphFile: '/test/big-GRAPH.json',
        currentStep: 3,
        steps: {
          '1': 'done', '2': 'done', '3': 'running',
          '4': 'pending', '5': 'pending',
        },
        nodes: Array.from({ length: 100 }, (_, i) => ({ id: `N${String(i + 1).padStart(4, '0')}` })),
      };
      const json = JSON.stringify(largeObj);
      assert.ok(json.length > 1000); // 1000行相当のサイズより多いことを確認
      atomicWrite(getTestFilePath(), json);
      const loaded = JSON.parse(fs.readFileSync(getTestFilePath(), 'utf8'));
      assert.strictEqual(loaded.currentStep, 3);
      assert.strictEqual(loaded.nodes.length, 100);
    });
  });
});

// ============================================================
// 統合テスト（ファイル経由のサブコマンド実行）
// ============================================================

describe('read-modify-write 統合', () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'update-step-status-integration-'));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('ファイルを読み込んで start-step で変更し書き込む一連の流れ', () => {
    const statusPath = path.join(tmpDir, 'flow-test-GRAPHIFY-Status.json');
    const initialData = createTestStatus(1);
    fs.writeFileSync(statusPath, JSON.stringify(initialData), 'utf8');

    // read → modify → write
    const status = readStatus(statusPath);
    executeStartStep(status, 1);
    atomicWrite(statusPath, JSON.stringify(status, null, 2));

    const loaded = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    assert.strictEqual(loaded.steps['1'], STATUS_RUNNING);
    assert.strictEqual(loaded.currentStep, 1);
  });

  it('存在しないファイルから始めて full flow（start→end→reset）', () => {
    const statusPath = path.join(tmpDir, 'full-flow-GRAPHIFY-Status.json');

    // Step 1: ファイルなしからデフォルト読み込み（MIN_STEP から開始）
    let status = readStatus(statusPath);
    assert.strictEqual(status.currentStep, MIN_STEP);
    assert.strictEqual(status.steps['0'], STATUS_PENDING);

    // Step 2: start-step 1 に進む
    executeStartStep(status, 1);
    atomicWrite(statusPath, JSON.stringify(status, null, 2));
    status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    assert.strictEqual(status.currentStep, 1);
    assert.strictEqual(status.steps['1'], STATUS_RUNNING);

    // Step 3: end-step 1
    executeEndStep(status, 1);
    atomicWrite(statusPath, JSON.stringify(status, null, 2));
    status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    assert.strictEqual(status.currentStep, 2);
    assert.strictEqual(status.steps['1'], STATUS_DONE);

    // Step 4: fail-step 2
    executeFailStep(status, 2);
    atomicWrite(statusPath, JSON.stringify(status, null, 2));
    status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    assert.strictEqual(status.steps['2'], STATUS_ERROR);
    assert.strictEqual(status.currentStep, 2); // failはcurrentStep不変

    // Step 5: reset-to-step 1
    executeResetToStep(status, 1);
    atomicWrite(statusPath, JSON.stringify(status, null, 2));
    status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    assert.strictEqual(status.currentStep, 1);
    assert.strictEqual(status.steps['1'], STATUS_DONE);   // 不変
    assert.strictEqual(status.steps['2'], STATUS_PENDING); // リセット
    assert.strictEqual(status.steps['3'], STATUS_PENDING);
  });

  // ============================================================
  // cleanup サブコマンドテスト
  // ============================================================

  describe('cleanup', () => {
    it('cleanup 実行後に _fix_graph_hints.json が削除されている', () => {
      // Arrange: cleanup は CWD から temp ファイルを探す
      const status = createTestStatus(2);
      const testGraphFile = path.join(tmpDir, 'test-GRAPH.json');
      status.graphFile = testGraphFile;
      fs.writeFileSync(testGraphFile, JSON.stringify({ nodes: [], edges: [] }), 'utf8');
      const hintsFile = path.join(process.cwd(), '_fix_graph_hints.json');
      try {
        fs.writeFileSync(hintsFile, JSON.stringify({ diagnosis: 'test' }), 'utf8');

        // Act: cleanup 実行
        executeCleanup(status);

        // Assert: _fix_graph_hints.json が削除されている
        assert.strictEqual(fs.existsSync(hintsFile), false);
      } finally {
        // 後片付け（テスト失敗時も確実に削除）
        try { fs.unlinkSync(hintsFile); } catch { /* 無視 */ }
      }
    });

    it('cleanup 実行後も必須ファイル（グラフJSON）は削除されない', () => {
      // Arrange
      const status = createTestStatus(2);
      const testGraphFile = path.join(tmpDir, 'test-GRAPH.json');
      status.graphFile = testGraphFile;
      fs.writeFileSync(testGraphFile, JSON.stringify({ nodes: [], edges: [] }), 'utf8');
      const hintsFile = path.join(process.cwd(), '_fix_graph_hints.json');
      try {
        fs.writeFileSync(hintsFile, JSON.stringify({ diagnosis: 'test' }), 'utf8');

        // Act
        executeCleanup(status);

        // Assert: グラフJSONは残っている
        assert.strictEqual(fs.existsSync(testGraphFile), true);
      } finally {
        try { fs.unlinkSync(hintsFile); } catch { /* 無視 */ }
      }
    });

    it('_fix_graph_hints.json が存在しない状態でもエラーにならない（冪等性）', () => {
      // Arrange: _fix_graph_hints.json を作成しない
      const status = createTestStatus(2);
      const testGraphFile = path.join(tmpDir, 'test-GRAPH.json');
      status.graphFile = testGraphFile;
      fs.writeFileSync(testGraphFile, JSON.stringify({ nodes: [], edges: [] }), 'utf8');

      // Act & Assert: エラーが発生しない
      assert.doesNotThrow(() => executeCleanup(status));
    });
  });
});

console.log('update-step-status.js 全テスト完了');
