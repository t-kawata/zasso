/**
 * analyze-source-structure.test.cjs — Tests for analyze-source-structure.js
 *
 * Test framework: Node.js standard node:test + node:assert/strict
 * Covers all public functions of the target module.
 * Includes actual file I/O tests using a temporary directory.
 */

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Load the target module via require path
const {
  parseArguments,
  readSourceFile,
  extractCodeBlocks,
  extractHeadingTree,
  estimateKind,
  detectExternalDeps,
  extractHeadingTokens,
  generateCandidateHeadingRefs,
  formatReport,
  generateReport,
  KIND_PATTERNS,
  DEP_PATTERNS,
} = require('../../.claude/scripts/rfc-graph/analyze-source-structure.js');

// ============================================================
// Test Utilities
// ============================================================

/** Temporary directory path for tests */
let tmpDir;

/**
 * Create a temporary directory before each test
 */
function setupTempDir() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'analyze-test-'));
}

/**
 * Remove the temporary directory after each test
 */
function cleanupTempDir() {
  if (tmpDir) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Write a test source file
 *
 * @param {string} fileName — File name
 * @param {string[]} lines — Array of lines
 * @returns {string} Absolute path to the created file
 */
function writeSourceFile(fileName, lines) {
  const filePath = path.join(tmpDir, fileName);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  return filePath;
}

// ============================================================
// parseArguments tests
// ============================================================

describe('parseArguments', () => {
  it('normal: parses source path', () => {
    const result = parseArguments(['node', 'script.js', '/path/to/doc.md']);
    assert.equal(result.sourcePath, '/path/to/doc.md');
  });

  it('error: throws on insufficient arguments', () => {
    assert.throws(() => parseArguments(['node', 'script.js']), /ソースファイルのパスを指定/);
  });

  it('error: throws on extra arguments', () => {
    assert.throws(() => parseArguments(['node', 'script.js', 'doc.md', 'extra.md']), /余剰な引数/);
  });
});

// ============================================================
// readSourceFile tests
// ============================================================

describe('readSourceFile', () => {
  before(setupTempDir);
  after(cleanupTempDir);

  it('normal: reads file as array of lines', () => {
    const filePath = writeSourceFile('test.md', ['# Title', '', 'Content']);
    const result = readSourceFile(filePath);
    assert.deepEqual(result, ['# Title', '', 'Content']);
  });

  it('error: throws when file does not exist', () => {
    assert.throws(() => {
      readSourceFile(path.join(tmpDir, 'nonexistent.md'));
    }, /見つかりません/);
  });
});

// ============================================================
// extractCodeBlocks tests
// ============================================================

describe('extractCodeBlocks', () => {
  it('normal: detects code blocks', () => {
    const lines = [
      'Line 1',
      '```js',
      'Code 1',
      'Code 2',
      '```',
      'Line 2',
    ];
    const blocks = extractCodeBlocks(lines);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].start, 1);
    assert.equal(blocks[0].end, 4);
  });

  it('normal: detects multiple code blocks', () => {
    const lines = [
      '```js',
      'a',
      '```',
      '# Heading',
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

  it('normal: file without code blocks returns empty array', () => {
    const lines = ['Line 1', 'Line 2'];
    const blocks = extractCodeBlocks(lines);
    assert.deepEqual(blocks, []);
  });

  it('error: ignores unclosed code blocks', () => {
    const lines = ['```', 'Unclosed'];
    const blocks = extractCodeBlocks(lines);
    assert.equal(blocks.length, 0, 'Unclosed blocks should not be detected');
  });
});

// ============================================================
// extractHeadingTree tests
// ============================================================

describe('extractHeadingTree', () => {
  it('normal: extracts headings at multiple levels', () => {
    const lines = [
      '# Title',
      'Body 1',
      '## Section 1',
      'Content 1',
      '### Sub 1',
      'Detail 1',
      '## Section 2',
      'Content 2',
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

  it('normal: does not mistake # inside code blocks as headings', () => {
    const lines = [
      '# Real Heading',
      'Body',
      '```',
      '# This is inside a code block',
      '```',
      '## Next Heading',
    ];
    const codeBlocks = [{ start: 2, end: 4 }];
    const sections = extractHeadingTree(lines, codeBlocks);
    assert.equal(sections.length, 2);
    assert.equal(sections[0].heading, 'Real Heading');
    assert.equal(sections[1].heading, 'Next Heading');
  });

  it('normal: treats document without headings as a single section', () => {
    const lines = ['Line 1', 'Line 2', 'Line 3'];
    const sections = extractHeadingTree(lines, []);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].heading, '(全体)');
    assert.equal(sections[0].startLine, 1);
    assert.equal(sections[0].endLine, 3);
  });

  it('normal: calculates prose lines excluding blank lines', () => {
    const lines = [
      '# S1',
      '',
      'Content 1',
      '',
      '## S2',
      'Content 2',
    ];
    const sections = extractHeadingTree(lines, []);
    // S1(h1) includes S2(h2) (h2 is lower level than h1)
    assert.equal(sections[0].proseLines, 4); // "# S1" + "Content 1" + "## S2" + "Content 2"
    assert.equal(sections[1].proseLines, 2); // "## S2" + "Content 2"
  });

  it('normal: calculates line count excluding code block lines', () => {
    const lines = [
      '# S1',
      'Body',
      '```',
      'code',
      'code',
      '```',
      '## S2',
      'Body 2',
    ];
    const codeBlocks = [{ start: 2, end: 5 }];
    const sections = extractHeadingTree(lines, codeBlocks);
    // S1(h1) includes S2(h2) (h2 is lower level than h1)
    assert.equal(sections[0].proseLines, 4); // "# S1" + "Body" + "## S2" + "Body 2"
    assert.equal(sections[1].proseLines, 2); // "## S2" + "Body 2"
  });
});

// ============================================================
// estimateKind tests
// ============================================================

describe('estimateKind', () => {
  it('normal: all 12 kinds are estimated from headings', () => {
    // Verify each kind in KIND_PATTERNS matches against its heading
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
        `Heading "${heading}" did not match kind "${expected}". Result: [${result.join(', ')}]`);
    }
  });

  it('normal: heading match takes priority over body keywords (if heading matches, body is skipped)', () => {
    // Both architecture and test_policy match via heading patterns
    const heading = 'テスト計画 - アーキテクチャ概要';
    const result = estimateKind(heading, '');
    assert.ok(result.includes('architecture'));
    assert.ok(result.includes('test_policy'));
  });

  it('normal: section without keywords returns empty array', () => {
    // Use text that does not match any kind pattern in heading or body
    const result = estimateKind('xyzzy', 'zwxy abcd efgh ijkl mnop qrst uvwx');
    assert.equal(result.length, 0);
  });

  it('normal: estimated from body keywords only', () => {
    const heading = 'Implementation Details';
    const body = '必須: この機能は MUST で実装すること';
    const result = estimateKind(heading, body);
    assert.ok(result.includes('requirement'), `Body keyword "MUST" should match requirement. Result: [${result.join(', ')}]`);
  });
});

// ============================================================
// detectExternalDeps tests
// ============================================================

describe('detectExternalDeps', () => {
  it('normal: all 11 dependency patterns are detected', () => {
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
        `Body "${body}" did not match dep "${expected}". Result: [${result.join(', ')}]`);
    }
  });

  it('normal: file without dependencies returns empty array', () => {
    const result = detectExternalDeps('これは特に依存のないプレーンテキストです。');
    assert.equal(result.length, 0);
  });

  it('normal: multiple dependencies are detected', () => {
    const body = 'fs.readFileSync でファイルを読み込み、async/await で非同期処理する';
    const result = detectExternalDeps(body);
    assert.ok(result.includes('ファイルI/O'));
    assert.ok(result.includes('非同期ランタイム'));
  });
});

// ============================================================
// extractHeadingTokens tests
// ============================================================

describe('extractHeadingTokens', () => {
  it('normal: tokenizes Japanese heading', () => {
    const result = extractHeadingTokens('要件定義');
    assert.deepEqual(result, ['要件定義']);
  });

  it('normal: splits compound heading', () => {
    const result = extractHeadingTokens('API エンドポイント一覧');
    assert.deepEqual(result, ['API', 'エンドポイント一覧']);
  });

  it('normal: splits heading with delimiter character', () => {
    const result = extractHeadingTokens('セキュリティ・認証');
    assert.deepEqual(result, ['セキュリティ', '認証']);
  });

  it('normal: heading with alphanumeric characters', () => {
    const result = extractHeadingTokens('POST /api/v1/login');
    assert.deepEqual(result, ['POST', '/api/v1/login']);
  });
});

// ============================================================
// generateCandidateHeadingRefs tests
// ============================================================

describe('generateCandidateHeadingRefs', () => {
  it('normal: generates candidate headingRefs from sections', () => {
    const sections = [
      { level: 1, heading: 'Title', startLine: 1, endLine: 10, proseLines: 5 },
      { level: 2, heading: 'Requirements', startLine: 2, endLine: 10, proseLines: 5 },
    ];
    const result = generateCandidateHeadingRefs(sections);
    assert.equal(result.length, 2);
    assert.equal(result[0].heading, 1);
    assert.equal(result[0].texts[0], 'Title');
    assert.equal(result[1].heading, 2);
    assert.equal(result[1].texts[0], 'Requirements');
  });

  it('normal: empty sections array returns empty array', () => {
    const result = generateCandidateHeadingRefs([]);
    assert.deepEqual(result, []);
  });
});

// ============================================================
// formatReport tests
// ============================================================

describe('formatReport', () => {
  it('normal: outputs natural language report with full information', () => {
    const report = formatReport(
      'test.md',
      100,  // totalLines
      30,   // codeLines
      [{ level: 1, heading: 'Title', startLine: 1, endLine: 10, proseLines: 5, codeBlockCount: 1, bodyText: 'body' }],
      [{ lineRange: 'L1-L10', kind: 'requirement', reason: '見出しマッチ' }],
      [{ lineRange: 'L1-L10', labels: ['ファイルI/O'] }],
      [{ lineRange: 'L1-L10', proseLines: 150, label: 'Title' }],
      [{ lineRange: 'L1-L10', heading: 1, texts: ['Title'] }],
    );

    // Basic info
    assert.ok(report.includes('基本情報'));
    assert.ok(report.includes('100行'));
    assert.ok(report.includes('70行')); // 100-30

    // Section list (kind/dep inline)
    assert.ok(report.includes('セクション一覧'));
    assert.ok(report.includes('- h1'));
    assert.ok(report.includes('Title'));
    assert.ok(report.includes('[kind:')); // kind annotated inline
    assert.ok(report.includes('requirement'));
    assert.ok(report.includes('[dep:'));  // dep annotated inline
    assert.ok(report.includes('ファイルI/O'));

    // Sections over 100 lines
    assert.ok(report.includes('100行超セクション'));
    assert.ok(report.includes('150行'));
  });

  it('normal: explicitly states "(none)" for empty data', () => {
    const report = formatReport(
      'empty.md',
      5, 0,
      [{ level: 1, heading: 'S1', startLine: 1, endLine: 5, proseLines: 3, codeBlockCount: 0, bodyText: 'hello' }],
      [],
      [],
      [],
      [], // headingRefCandidates
    );

    assert.ok(report.includes('なし（全セクションが100行未満）'));
  });
});

// ============================================================
// Integration tests (actual file I/O)
// ============================================================

describe('Integration: generateReport', () => {
  before(setupTempDir);
  after(cleanupTempDir);

  it('normal: generates report for an actual Markdown file', () => {
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

    // Contains basic structure
    assert.ok(report.includes('test-rfc.md 構造分析レポート'));
    assert.ok(report.includes('基本情報'));
    assert.ok(report.includes('セクション一覧'));
    assert.ok(report.includes('[kind:')); // kind annotated inline
    assert.ok(report.includes('[dep:'));  // dep annotated inline
    assert.ok(report.includes('100行超セクション'));

    // Sections are extracted
    assert.ok(report.includes('要件定義'));
    assert.ok(report.includes('API エンドポイント'));
    assert.ok(report.includes('セキュリティ'));
  });

  it('normal: does not mistake # inside code blocks as headings', () => {
    const lines = [
      '# Real Heading',
      'Content',
      '```',
      '# This is inside a code block, not a heading',
      '```',
      '## Next Section',
    ];
    const filePath = writeSourceFile('code-in-block.md', lines);
    const sourceLines = fs.readFileSync(filePath, 'utf8').split('\n');

    const report = generateReport(filePath, sourceLines);

    const sectionMatches = report.match(/- h\d/g);
    // Only h1 and h2 (h1 inside code block is excluded)
    assert.equal(sectionMatches.length, 2);
  });

  // generateReport processes an already-loaded line array, so file-not-found is out of scope
});

// ============================================================
// KIND_PATTERNS / DEP_PATTERNS completeness tests
// ============================================================

describe('KIND_PATTERNS completeness', () => {
  it('all 12 kinds are defined', () => {
    const kinds = KIND_PATTERNS.map(p => p.kind);
    assert.equal(kinds.length, 12);
    const expectedKinds = [
      'requirement', 'api_contract', 'data_model', 'state_machine',
      'architecture', 'security', 'error_policy', 'config',
      'test_policy', 'build_ci', 'rationale', 'glossary',
    ];
    for (const k of expectedKinds) {
      assert.ok(kinds.includes(k), `kind "${k}" is not defined`);
    }
  });

  it('each kind has at least one heading pattern', () => {
    for (const p of KIND_PATTERNS) {
      assert.ok(p.heading.length >= 1,
        `kind "${p.kind}" has no heading pattern`);
    }
  });
});

describe('DEP_PATTERNS completeness', () => {
  it('all 11 dependency patterns are defined', () => {
    const depLabels = DEP_PATTERNS.map(p => p.label);
    assert.equal(depLabels.length, 11);
    const expectedLabels = [
      'ファイルI/O', 'ネットワーク', 'データベース', 'LLM/API',
      '非同期ランタイム', '乱数生成', 'システム時間', 'プロセス管理',
      '外部モジュール読込', '標準入出力', '設定ファイル読込',
    ];
    for (const lbl of expectedLabels) {
      assert.ok(depLabels.includes(lbl), `Dependency "${lbl}" is not defined`);
    }
  });
});
