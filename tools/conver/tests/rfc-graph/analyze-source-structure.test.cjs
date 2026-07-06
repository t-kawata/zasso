/**
 * analyze-source-structure.test.cjs — analyze-source-structure.js のテスト
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
  readSourceFile,
  extractCodeBlocks,
  extractHeadingTree,
  estimateKind,
  detectExternalDeps,
  formatReport,
  generateReport,
  KIND_PATTERNS,
  DEP_PATTERNS,
} = require('../../.claude/scripts/rfc-graph/analyze-source-structure.js');

// ============================================================
// テスト用ユーティリティ
// ============================================================

/** テスト用の一時ディレクトリパス */
let tmpDir;

/**
 * テスト前に一時ディレクトリを作成する
 */
function setupTempDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'analyze-test-'));
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

// ============================================================
// parseArguments テスト
// ============================================================

describe('parseArguments', () => {
  it('正常系: ソースパスをパースする', () => {
    const result = parseArguments(['node', 'script.js', '/path/to/doc.md']);
    assert.equal(result.sourcePath, '/path/to/doc.md');
  });

  it('異常系: 引数不足でエラーを投げる', () => {
    assert.throws(() => parseArguments(['node', 'script.js']), /ソースファイルのパスを指定/);
  });

  it('異常系: 余剰引数があるでエラーを投げる', () => {
    assert.throws(() => parseArguments(['node', 'script.js', 'doc.md', 'extra.md']), /余剰な引数/);
  });
});

// ============================================================
// readSourceFile テスト
// ============================================================

describe('readSourceFile', () => {
  before(setupTempDir);
  after(cleanupTempDir);

  it('正常系: ファイルを行配列として読み込む', () => {
    const filePath = writeSourceFile('test.md', ['# Title', '', 'Content']);
    const result = readSourceFile(filePath);
    assert.deepEqual(result, ['# Title', '', 'Content']);
  });

  it('異常系: 存在しないファイルでエラーを投げる', () => {
    assert.throws(() => {
      readSourceFile(path.join(tmpDir, 'nonexistent.md'));
    }, /見つかりません/);
  });
});

// ============================================================
// extractCodeBlocks テスト
// ============================================================

describe('extractCodeBlocks', () => {
  it('正常系: コードブロックを検出する', () => {
    const lines = [
      '行1',
      '```js',
      'コード1',
      'コード2',
      '```',
      '行2',
    ];
    const blocks = extractCodeBlocks(lines);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].start, 1);
    assert.equal(blocks[0].end, 4);
  });

  it('正常系: 複数のコードブロックを検出する', () => {
    const lines = [
      '```js',
      'a',
      '```',
      '# 見出し',
      '```',
      'b',
      'c',
      '```',
    ];
    const blocks = extractCodeBlocks(lines);
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].start, 0);
    assert.equal(blocks[0].end, 2);
    assert.equal(blocks[1].start, 4);
    assert.equal(blocks[1].end, 7);
  });

  it('正常系: コードブロックがないファイルは空配列を返す', () => {
    const lines = ['行1', '行2'];
    const blocks = extractCodeBlocks(lines);
    assert.deepEqual(blocks, []);
  });

  it('異常系: 閉じていないコードブロックは無視する', () => {
    const lines = ['```', '閉じてない'];
    const blocks = extractCodeBlocks(lines);
    assert.equal(blocks.length, 0, '閉じていないブロックは検出しない');
  });
});

// ============================================================
// extractHeadingTree テスト
// ============================================================

describe('extractHeadingTree', () => {
  it('正常系: 複数階層の見出しを抽出する', () => {
    const lines = [
      '# Title',
      '本文1',
      '## Section 1',
      '内容1',
      '### Sub 1',
      '詳細1',
      '## Section 2',
      '内容2',
    ];
    const sections = extractHeadingTree(lines, []);
    assert.equal(sections.length, 4);
    assert.equal(sections[0].heading, 'Title');
    assert.equal(sections[0].level, 1);
    assert.equal(sections[1].heading, 'Section 1');
    assert.equal(sections[1].level, 2);
    assert.equal(sections[2].heading, 'Sub 1');
    assert.equal(sections[2].level, 3);
    assert.equal(sections[3].heading, 'Section 2');
    assert.equal(sections[3].level, 2);
  });

  it('正常系: コードブロック内の # を見出しと誤認しない', () => {
    const lines = [
      '# 本当の見出し',
      '本文',
      '```',
      '# これはコードブロック内',
      '```',
      '## 次の見出し',
    ];
    const codeBlocks = [{ start: 2, end: 4 }];
    const sections = extractHeadingTree(lines, codeBlocks);
    assert.equal(sections.length, 2);
    assert.equal(sections[0].heading, '本当の見出し');
    assert.equal(sections[1].heading, '次の見出し');
  });

  it('正常系: 見出しがない場合は全体を1セクションとする', () => {
    const lines = ['行1', '行2', '行3'];
    const sections = extractHeadingTree(lines, []);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].heading, '(全体)');
    assert.equal(sections[0].startLine, 1);
    assert.equal(sections[0].endLine, 3);
  });

  it('正常系: 空行を除いた実質行数を計算する', () => {
    const lines = [
      '# S1',
      '',
      '内容1',
      '',
      '## S2',
      '内容2',
    ];
    const sections = extractHeadingTree(lines, []);
    assert.equal(sections[0].proseLines, 2); // S1: "# S1" + "内容1"
    assert.equal(sections[1].proseLines, 2); // S2: "## S2" + "内容2"
  });

  it('正常系: コードブロック行を除外した行数を計算する', () => {
    const lines = [
      '# S1',
      '本文',
      '```',
      'コード',
      'コード',
      '```',
      '## S2',
      '本文2',
    ];
    const codeBlocks = [{ start: 2, end: 5 }];
    const sections = extractHeadingTree(lines, codeBlocks);
    assert.equal(sections[0].proseLines, 2); // S1: "# S1" + "本文"
    assert.equal(sections[1].proseLines, 2); // S2: "## S2" + "本文2"
  });
});

// ============================================================
// estimateKind テスト
// ============================================================

describe('estimateKind', () => {
  it('正常系: 全12種の kind が見出しから推定される', () => {
    // KIND_PATTERNS の各 kind が見出しでマッチすることを確認
    const testCases = [
      { heading: '要件定義', expected: 'requirement' },
      { heading: 'API定義', expected: 'api_contract' },
      { heading: 'データモデル', expected: 'data_model' },
      { heading: '状態遷移図', expected: 'state_machine' },
      { heading: 'アーキテクチャ概要', expected: 'architecture' },
      { heading: 'セキュリティ対策', expected: 'security' },
      { heading: 'エラー処理方針', expected: 'error_policy' },
      { heading: '設定値一覧', expected: 'config' },
      { heading: 'テスト計画', expected: 'test_policy' },
      { heading: 'ビルド設定', expected: 'build_ci' },
      { heading: '設計判断根拠', expected: 'rationale' },
      { heading: '用語定義', expected: 'glossary' },
    ];

    for (const { heading, expected } of testCases) {
      const result = estimateKind(heading, '');
      assert.ok(result.includes(expected),
        `見出し "${heading}" が kind "${expected}" とマッチしません。結果: [${result.join(', ')}]`);
    }
  });

  it('正常系: 見出しマッチは本文キーワードより優先される（見出しにマッチしたら本文は探索しない）', () => {
    // 見出しに architecture がマッチし、かつ見出しにも test_policy がマッチする場合
    // 両方とも見出しマッチとして返る（continue は同一パターン内の body スキップのみ）
    const heading = 'テスト計画 - アーキテクチャ概要';
    const result = estimateKind(heading, '');
    assert.ok(result.includes('architecture'));
    assert.ok(result.includes('test_policy'));
  });

  it('正常系: キーワード不在のセクションは空配列を返す', () => {
    // 見出しにも本文にもどの kind パターンにもマッチしないテキストを使用する
    const result = estimateKind('xyzzy', 'zwxy abcd efgh ijkl mnop qrst uvwx');
    assert.equal(result.length, 0);
  });

  it('正常系: 本文キーワードのみでも推定される', () => {
    const heading = '実装詳細';
    const body = '必須: この機能は MUST で実装すること';
    const result = estimateKind(heading, body);
    assert.ok(result.includes('requirement'), `本文キーワード "MUST" で requirement が推定されること。結果: [${result.join(', ')}]`);
  });
});

// ============================================================
// detectExternalDeps テスト
// ============================================================

describe('detectExternalDeps', () => {
  it('正常系: 全11種の依存パターンが検出される', () => {
    const testCases = [
      { body: 'fs.readFileSync', expected: 'ファイルI/O' },
      { body: 'https://example.com', expected: 'ネットワーク' },
      { body: 'database query', expected: 'データベース' },
      { body: 'LLM API key', expected: 'LLM/API' },
      { body: 'async function', expected: '非同期ランタイム' },
      { body: 'Math.random()', expected: '乱数生成' },
      { body: 'SystemTime now', expected: 'システム時間' },
      { body: 'child_process exec', expected: 'プロセス管理' },
      { body: 'const fs = require("fs")', expected: '外部モジュール読込' },
      { body: 'console.log', expected: '標準入出力' },
      { body: '.env config', expected: '設定ファイル読込' },
    ];

    for (const { body, expected } of testCases) {
      const result = detectExternalDeps(body);
      assert.ok(result.includes(expected),
        `本文 "${body}" が依存 "${expected}" とマッチしません。結果: [${result.join(', ')}]`);
    }
  });

  it('正常系: 依存がないファイルは空配列を返す', () => {
    const result = detectExternalDeps('これは特に依存のないプレーンテキストです。');
    assert.equal(result.length, 0);
  });

  it('正常系: 複数の依存が検出される', () => {
    const body = 'fs.readFileSync でファイルを読み込み、async/await で非同期処理する';
    const result = detectExternalDeps(body);
    assert.ok(result.includes('ファイルI/O'));
    assert.ok(result.includes('非同期ランタイム'));
  });
});

// ============================================================
// formatReport テスト
// ============================================================

describe('formatReport', () => {
  it('正常系: 全情報を含む自然言語レポートが出力される', () => {
    const report = formatReport(
      'test.md',
      100,  // totalLines
      30,   // codeLines
      [{ level: 1, heading: 'Title', startLine: 1, endLine: 10, proseLines: 5, codeBlockCount: 1, bodyText: 'body' }],
      [{ lineRange: 'L1-L10', kind: 'requirement', reason: '見出しマッチ' }],
      [{ lineRange: 'L1-L10', labels: ['ファイルI/O'] }],
      [{ lineRange: 'L1-L10', proseLines: 150, label: 'Title' }],
    );

    // 基本情報
    assert.ok(report.includes('基本情報'));
    assert.ok(report.includes('100行'));
    assert.ok(report.includes('70行')); // 100-30

    // セクション一覧
    assert.ok(report.includes('セクション一覧'));
    assert.ok(report.includes('<h1>'));
    assert.ok(report.includes('Title'));

    // kind 候補（第2軸）
    assert.ok(report.includes('kind 候補'));
    assert.ok(report.includes('上書き可能'));
    assert.ok(report.includes('requirement'));

    // 外部依存（第3軸）
    assert.ok(report.includes('外部依存'));
    assert.ok(report.includes('ファイルI/O'));

    // 100行超セクション
    assert.ok(report.includes('100行超セクション'));
    assert.ok(report.includes('150行'));
  });

  it('正常系: 空情報がある場合も「なし」と明示する', () => {
    const report = formatReport(
      'empty.md',
      5, 0,
      [{ level: 1, heading: 'S1', startLine: 1, endLine: 5, proseLines: 3, codeBlockCount: 0, bodyText: 'hello' }],
      [],
      [],
      [],
    );

    assert.ok(report.includes('該当なし'));
    assert.ok(report.includes('検出なし'));
    assert.ok(report.includes('なし（全セクションが100行未満）'));
  });
});

// ============================================================
// 統合テスト（実際のファイル I/O）
// ============================================================

describe('統合: generateReport', () => {
  before(setupTempDir);
  after(cleanupTempDir);

  it('正常系: 実際の Markdown ファイルに対してレポートを生成する', () => {
    const lines = [
      '# 要件定義',
      '',
      'この機能はユーザー認証を提供します。',
      '認証には JWT トークンを使用します。',
      'fs.readFileSync で秘密鍵を読み込みます。',
      '',
      '## API エンドポイント',
      '',
      'POST /api/v1/auth/login を提供します。',
      'async function で非同期処理します。',
      '',
      '## セキュリティ',
      '',
      'パスワードは bcrypt でハッシュ化します。',
      'トークンは暗号化して保存します。',
    ];
    const filePath = writeSourceFile('test-rfc.md', lines);
    const sourceLines = fs.readFileSync(filePath, 'utf8').split('\n');

    const report = generateReport(filePath, sourceLines);

    // 基本的な構造が含まれている
    assert.ok(report.includes('test-rfc.md 構造分析レポート'));
    assert.ok(report.includes('基本情報'));
    assert.ok(report.includes('セクション一覧'));
    assert.ok(report.includes('kind 候補'));
    assert.ok(report.includes('外部依存'));
    assert.ok(report.includes('100行超セクション'));

    // セクションが抽出されている
    assert.ok(report.includes('要件定義'));
    assert.ok(report.includes('API エンドポイント'));
    assert.ok(report.includes('セキュリティ'));

    // 第2軸の但し書き
    assert.ok(report.includes('上書き可能'));

    // 第3軸の但し書き
    assert.ok(report.includes('強度と影響範囲を判断'));
  });

  it('正常系: コードブロック内の # を見出しと誤認しない', () => {
    const lines = [
      '# 本当の見出し',
      '内容',
      '```',
      '# これはコードなので見出しにしない',
      '```',
      '## 次のセクション',
    ];
    const filePath = writeSourceFile('code-in-block.md', lines);
    const sourceLines = fs.readFileSync(filePath, 'utf8').split('\n');

    const report = generateReport(filePath, sourceLines);

    const sectionMatches = report.match(/<h\d>/g);
    // h1 と h2 のみ（コードブロック内の h1 は除外）
    assert.equal(sectionMatches.length, 2);
  });

  // generateReport は既に読み込んだ行配列を処理する関数のため、ファイル不在はスコープ外
});

// ============================================================
// KIND_PATTERNS / DEP_PATTERNS 完全性テスト
// ============================================================

describe('KIND_PATTERNS 完全性', () => {
  it('全12種の kind が定義されている', () => {
    const kinds = KIND_PATTERNS.map(p => p.kind);
    assert.equal(kinds.length, 12);
    const expectedKinds = [
      'requirement', 'api_contract', 'data_model', 'state_machine',
      'architecture', 'security', 'error_policy', 'config',
      'test_policy', 'build_ci', 'rationale', 'glossary',
    ];
    for (const k of expectedKinds) {
      assert.ok(kinds.includes(k), `kind "${k}" が定義されていません`);
    }
  });

  it('各 kind に少なくとも1つの見出しパターンがある', () => {
    for (const p of KIND_PATTERNS) {
      assert.ok(p.heading.length >= 1,
        `kind "${p.kind}" に見出しパターンがありません`);
    }
  });
});

describe('DEP_PATTERNS 完全性', () => {
  it('全11種の依存パターンが定義されている', () => {
    const depLabels = DEP_PATTERNS.map(p => p.label);
    assert.equal(depLabels.length, 11);
    const expectedLabels = [
      'ファイルI/O', 'ネットワーク', 'データベース', 'LLM/API',
      '非同期ランタイム', '乱数生成', 'システム時間', 'プロセス管理',
      '外部モジュール読込', '標準入出力', '設定ファイル読込',
    ];
    for (const lbl of expectedLabels) {
      assert.ok(depLabels.includes(lbl), `依存 "${lbl}" が定義されていません`);
    }
  });
});
