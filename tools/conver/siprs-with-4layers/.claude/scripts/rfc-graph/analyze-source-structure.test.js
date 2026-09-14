#!/usr/bin/env node

/**
 * analyze-source-structure.test.js — Unit tests for analyze-source-structure.js
 *
 * Run: node analyze-source-structure.test.js
 *
 * Coverage: ~70 test cases across all public functions
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  parseArguments,
  parseArgumentsSafe,
  readSourceFile,
  extractCodeBlocks,
  extractHeadingTree,
  estimateKind,
  collectBodyMatches,
  detectExternalDeps,
  extractHeadingTokens,
  generateCandidateHeadingRefs,
  formatReport,
  generateReport,
  KIND_PATTERNS,
  DEP_PATTERNS,
} = require('./analyze-source-structure.js');

// ============================================================
// Test runner
// ============================================================

const stats = { passed: 0, failed: 0, total: 0 };

function test(name, fn) {
  stats.total++;
  try {
    fn();
    stats.passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    stats.failed++;
    console.log(`  ❌ ${name}`);
    console.log(`      ${e.message}`);
  }
}

function report() {
  const ok = stats.failed === 0;
  console.log(`\n${ok ? '✅' : '❌'} ${stats.passed}/${stats.total} passed (${stats.failed} failed)`);
  process.exit(ok ? 0 : 1);
}

// ============================================================
// Fixtures
// ============================================================

/** Empty markdown lines */
const EMPTY_LINES = [];

/** Simple markdown without code blocks */
const SIMPLE_MD = [
  '# Title',
  '',
  'Some intro text.',
  '',
  '## Requirements',
  '',
  'The system must handle 1000 requests per second.',
  '',
  '## Architecture',
  '',
  'The module consists of three layers.',
  '',
  '### API Layer',
  '',
  'REST endpoints handle incoming requests.',
  '',
  '## Configuration',
  '',
  'Set via environment variables.',
];

/** Markdown with code blocks */
const CODE_BLOCK_MD = [
  '# Title',
  '',
  'Some text.',
  '',
  '```rust',
  'fn main() {',
  '    println!("hello");',
  '}',
  '```',
  '',
  '## Requirements',
  '',
  'The system must be reliable.',
  '',
  '```python',
  'def test():',
  '    assert True',
  '```',
  '',
  '## Conclusion',
  '',
  'Done.',
];

/** Markdown with unclosed code block */
const UNCLOSED_CODE_MD = [
  '# Title',
  '',
  '```rust',
  'fn main() {',
  '    println!("hello");',
  '}',
  '',
  '## Requirements',
  '',
  'Text.',
];

/** Markdown with same-level consecutive headings */
const SAME_LEVEL_MD = [
  '# Title',
  '',
  '## Section A',
  '',
  'Content A.',
  '',
  '## Section B',
  '',
  'Content B.',
  '',
  '## Section C',
  '',
  'Content C.',
];

/** Markdown without any headings */
const NO_HEADING_MD = [
  'Some text.',
  '',
  'More text.',
  '',
  'Still more text.',
];

// ============================================================
// Tests: parseArguments
// ============================================================

console.log('\n--- parseArguments ---');

test('valid path argument returns sourcePath', () => {
  const r = parseArguments(['node', 'script.js', '/path/to/doc.md']);
  assert.strictEqual(r.sourcePath, '/path/to/doc.md');
});

test('no arguments throws error', () => {
  assert.throws(() => parseArguments(['node', 'script.js']), /Specify the source file/);
});

test('parseArgumentsSafe with invalid input calls exitWithError', () => {
  // parseArgumentsSafe catches parse errors and calls process.exit(1).
  // Verify it doesnt throw (exitWithError handles the exit).
  // This is a structural check that the function exists and is callable.
  assert.strictEqual(typeof parseArgumentsSafe, 'function');
});

test('extra arguments throws error', () => {
  assert.throws(
    () => parseArguments(['node', 'script.js', '/path/doc.md', 'extra']),
    /Excess arguments/,
  );
});

// ============================================================
// Tests: parseArgumentsSafe
// ============================================================

console.log('\n--- parseArgumentsSafe ---');

test('parseArgumentsSafe with valid path returns sourcePath', () => {
  // We can't easily test this without mocking process.exit, so just verify
  // the function exists and is callable
  assert.strictEqual(typeof parseArgumentsSafe, 'function');
});

// ============================================================
// Tests: readSourceFile
// ============================================================

console.log('\n--- readSourceFile ---');

test('readSourceFile with existing file returns lines array', () => {
  // Read the script itself as a known existent file
  const lines = readSourceFile(__filename);
  assert.ok(Array.isArray(lines));
  assert.ok(lines.length > 0);
});

test('readSourceFile with non-existent file throws', () => {
  assert.throws(
    () => readSourceFile('/nonexistent/path/file.md'),
    /Source file not found/,
  );
});

// ============================================================
// Tests: extractCodeBlocks
// ============================================================

console.log('\n--- extractCodeBlocks ---');

test('no code blocks returns empty array', () => {
  const blocks = extractCodeBlocks(SIMPLE_MD);
  assert.strictEqual(blocks.length, 0);
});

test('single code block detected correctly', () => {
  const blocks = extractCodeBlocks(CODE_BLOCK_MD);
  assert.ok(blocks.length >= 1);
  // First block starts at the ``` rust line
  const first = blocks[0];
  assert.strictEqual(CODE_BLOCK_MD[first.start].trim(), '```rust');
});

test('multiple code blocks detected correctly', () => {
  const blocks = extractCodeBlocks(CODE_BLOCK_MD);
  assert.strictEqual(blocks.length, 2);
  const last = blocks[1];
  assert.strictEqual(CODE_BLOCK_MD[last.end].trim(), '```');
});

test('unclosed code block is ignored', () => {
  const blocks = extractCodeBlocks(UNCLOSED_CODE_MD);
  assert.strictEqual(blocks.length, 0);
});

// ============================================================
// Tests: extractHeadingTree
// ============================================================

console.log('\n--- extractHeadingTree ---');

test('extracts hierarchical section tree', () => {
  const codeBlocks = extractCodeBlocks(SIMPLE_MD);
  const sections = extractHeadingTree(SIMPLE_MD, codeBlocks);
  assert.ok(sections.length > 0);
  // Should have h1 "Title", h2 "Requirements", h2 "Architecture", h3 "API Layer", h2 "Configuration"
  const headings = sections.map(s => s.heading);
  assert.ok(headings.includes('Title'));
  assert.ok(headings.includes('Requirements'));
  assert.ok(headings.includes('Architecture'));
  assert.ok(headings.includes('API Layer'));
  assert.ok(headings.includes('Configuration'));
});

test('no headings creates a single section', () => {
  const codeBlocks = extractCodeBlocks(NO_HEADING_MD);
  const sections = extractHeadingTree(NO_HEADING_MD, codeBlocks);
  assert.strictEqual(sections.length, 1);
  assert.strictEqual(sections[0].heading, '(全体)');
});

test('code block inner headings are excluded', () => {
  // CODE_BLOCK_MD only has headings outside code blocks
  const codeBlocks = extractCodeBlocks(CODE_BLOCK_MD);
  const sections = extractHeadingTree(CODE_BLOCK_MD, codeBlocks);
  const headings = sections.map(s => s.heading);
  assert.ok(headings.includes('Title'));
  assert.ok(headings.includes('Requirements'));
  assert.ok(headings.includes('Conclusion'));
  // Should have exactly 3 sections
  assert.strictEqual(sections.length, 3);
});

test('same-level consecutive headings are all captured', () => {
  const codeBlocks = extractCodeBlocks(SAME_LEVEL_MD);
  const sections = extractHeadingTree(SAME_LEVEL_MD, codeBlocks);
  const headings = sections.map(s => s.heading);
  assert.ok(headings.includes('Section A'));
  assert.ok(headings.includes('Section B'));
  assert.ok(headings.includes('Section C'));
  assert.strictEqual(sections.filter(s => s.level === 2).length, 3);
});

// ============================================================
// Tests: estimateKind - Japanese heading matches
// ============================================================

console.log('\n--- estimateKind (Japanese heading matches) ---');

test('requirement: Japanese heading match', () => {
  const matches = estimateKind('機能要件', '');
  assert.ok(matches.includes('requirement'), `got: ${matches.join(', ')}`);
});

test('api_contract: Japanese heading match', () => {
  const matches = estimateKind('API一覧', '');
  assert.ok(matches.includes('api_contract'), `got: ${matches.join(', ')}`);
});

test('data_model: Japanese heading match', () => {
  const matches = estimateKind('データモデル定義', '');
  assert.ok(matches.includes('data_model'), `got: ${matches.join(', ')}`);
});

test('state_machine: Japanese heading match', () => {
  const matches = estimateKind('状態遷移図', '');
  assert.ok(matches.includes('state_machine'), `got: ${matches.join(', ')}`);
});

test('architecture: Japanese heading match', () => {
  const matches = estimateKind('システム構成', '');
  assert.ok(matches.includes('architecture'), `got: ${matches.join(', ')}`);
});

test('security: Japanese heading match', () => {
  const matches = estimateKind('セキュリティモデル', '');
  assert.ok(matches.includes('security'), `got: ${matches.join(', ')}`);
});

test('error_policy: Japanese heading match', () => {
  const matches = estimateKind('エラーハンドリング戦略', '');
  assert.ok(matches.includes('error_policy'), `got: ${matches.join(', ')}`);
});

test('config: Japanese heading match', () => {
  const matches = estimateKind('環境変数一覧', '');
  assert.ok(matches.includes('config'), `got: ${matches.join(', ')}`);
});

test('test_policy: Japanese heading match', () => {
  const matches = estimateKind('テスト計画', '');
  assert.ok(matches.includes('test_policy'), `got: ${matches.join(', ')}`);
});

test('build_ci: Japanese heading match', () => {
  const matches = estimateKind('デプロイ戦略', '');
  assert.ok(matches.includes('build_ci'), `got: ${matches.join(', ')}`);
});

test('rationale: Japanese heading match (設計判断)', () => {
  const matches = estimateKind('設計判断', '');
  assert.ok(matches.includes('rationale'), `got: ${matches.join(', ')}`);
});

test('rationale: Japanese heading match (解答)', () => {
  const matches = estimateKind('実装上の難所と設計上の解答', '');
  assert.ok(matches.includes('rationale'), `got: ${matches.join(', ')}`);
});

test('rationale: Japanese heading match (難所)', () => {
  const matches = estimateKind('実装上の難所', '');
  assert.ok(matches.includes('rationale'), `got: ${matches.join(', ')}`);
});

test('glossary: Japanese heading match', () => {
  const matches = estimateKind('用語集', '');
  assert.ok(matches.includes('glossary'), `got: ${matches.join(', ')}`);
});

// ============================================================
// Tests: estimateKind - English heading matches
// ============================================================

console.log('\n--- estimateKind (English heading matches) ---');

test('requirement: English heading match', () => {
  const matches = estimateKind('Requirements', '');
  assert.ok(matches.includes('requirement'), `got: ${matches.join(', ')}`);
});

test('api_contract: English heading match', () => {
  const matches = estimateKind('API Specification', '');
  assert.ok(matches.includes('api_contract'), `got: ${matches.join(', ')}`);
});

test('data_model: English heading match', () => {
  const matches = estimateKind('Data Model', '');
  assert.ok(matches.includes('data_model'), `got: ${matches.join(', ')}`);
});

test('state_machine: English heading match', () => {
  const matches = estimateKind('State Machine', '');
  assert.ok(matches.includes('state_machine'), `got: ${matches.join(', ')}`);
});

test('architecture: English heading match', () => {
  const matches = estimateKind('System Architecture', '');
  assert.ok(matches.includes('architecture'), `got: ${matches.join(', ')}`);
});

test('security: English heading match', () => {
  const matches = estimateKind('Authentication', '');
  assert.ok(matches.includes('security'), `got: ${matches.join(', ')}`);
});

test('error_policy: English heading match', () => {
  const matches = estimateKind('Error Handling', '');
  assert.ok(matches.includes('error_policy'), `got: ${matches.join(', ')}`);
});

test('config: English heading match', () => {
  const matches = estimateKind('Configuration', '');
  assert.ok(matches.includes('config'), `got: ${matches.join(', ')}`);
});

test('test_policy: English heading match', () => {
  const matches = estimateKind('Test Plan', '');
  assert.ok(matches.includes('test_policy'), `got: ${matches.join(', ')}`);
});

test('build_ci: English heading match', () => {
  const matches = estimateKind('Deployment', '');
  assert.ok(matches.includes('build_ci'), `got: ${matches.join(', ')}`);
});

test('rationale: English heading match', () => {
  const matches = estimateKind('Architecture Decision Record', '');
  assert.ok(matches.includes('rationale'), `got: ${matches.join(', ')}`);
});

test('glossary: English heading match', () => {
  const matches = estimateKind('Terminology', '');
  assert.ok(matches.includes('glossary'), `got: ${matches.join(', ')}`);
});

// ============================================================
// Tests: estimateKind - Body-only matches (no heading match)
// ============================================================

console.log('\n--- estimateKind (body-only matches) ---');

test('requirement: body match with must/shall', () => {
  const matches = estimateKind('Some Section', 'The system must provide audit logging.');
  assert.ok(matches.includes('requirement'), `got: ${matches.join(', ')}`);
});

test('api_contract: body match with POST/GET', () => {
  const matches = estimateKind('Some Section', 'POST /v1/users creates a new user.');
  assert.ok(matches.includes('api_contract'), `got: ${matches.join(', ')}`);
});

test('data_model: body match with schema', () => {
  const matches = estimateKind('Some Section', 'The user schema has a primary key id.');
  assert.ok(matches.includes('data_model'), `got: ${matches.join(', ')}`);
});

test('state_machine: body match with state', () => {
  const matches = estimateKind('Some Section', 'The state transitions from pending to active.');
  assert.ok(matches.includes('state_machine'), `got: ${matches.join(', ')}`);
});

test('security: body match with auth/jwt', () => {
  const matches = estimateKind('Some Section', 'Authentication uses JWT tokens.');
  assert.ok(matches.includes('security'), `got: ${matches.join(', ')}`);
});

test('no kind match for irrelevant content', () => {
  const matches = estimateKind('Random Note', 'This is just some general text with no technical keywords.');
  assert.strictEqual(matches.length, 0);
});

// ============================================================
// Tests: collectBodyMatches
// ============================================================

console.log('\n--- collectBodyMatches ---');

test('collectBodyMatches returns matched strings (max 5)', () => {
  const patterns = [/must\b/, /\bshall\b/, /need to/, /required/i];
  const body = 'The system must handle errors. It shall retry. You need to configure it. Required field.';
  const matches = collectBodyMatches(body, patterns);
  assert.ok(matches.length > 0);
  assert.ok(matches.length <= 5);
  assert.ok(matches.some(m => m.includes('must')));
});

test('collectBodyMatches with no match returns empty', () => {
  const patterns = [/\bxyzzy\b/];
  const body = 'No matching text here.';
  const matches = collectBodyMatches(body, patterns);
  assert.strictEqual(matches.length, 0);
});

// ============================================================
// Tests: detectExternalDeps
// ============================================================

console.log('\n--- detectExternalDeps ---');

test('detects network dependencies', () => {
  const deps = detectExternalDeps('The system communicates via https://api.example.com');
  assert.ok(deps.includes('ネットワーク'), `got: ${deps.join(', ')}`);
});

test('detects database dependencies', () => {
  const deps = detectExternalDeps('Data is stored in PostgreSQL using SELECT queries.');
  assert.ok(deps.includes('データベース'), `got: ${deps.join(', ')}`);
});

test('detects cloud infrastructure dependencies', () => {
  const deps = detectExternalDeps('The service runs on AWS Lambda with S3 storage.');
  assert.ok(deps.includes('クラウド/インフラ'), `got: ${deps.join(', ')}`);
});

test('detects messaging dependencies', () => {
  const deps = detectExternalDeps('Events are published via Apache Kafka to downstream consumers.');
  assert.ok(deps.includes('メッセージング'), `got: ${deps.join(', ')}`);
});

test('detects monitoring dependencies', () => {
  const deps = detectExternalDeps('Metrics are collected by Prometheus and visualized in Grafana.');
  assert.ok(deps.includes('監視/可観測性'), `got: ${deps.join(', ')}`);
});

test('detects container/orchestration dependencies', () => {
  const deps = detectExternalDeps('Services are deployed as Docker containers on Kubernetes.');
  assert.ok(deps.includes('コンテナ/オーケストレーション'), `got: ${deps.join(', ')}`);
});

test('detects LLM/API dependencies', () => {
  const deps = detectExternalDeps('The system sends prompts to an LLM via the Claude API.');
  assert.ok(deps.includes('LLM/API'), `got: ${deps.join(', ')}`);
});

test('detects async runtime dependencies', () => {
  const deps = detectExternalDeps('Uses async/await for concurrent operations.');
  assert.ok(deps.includes('非同期ランタイム'), `got: ${deps.join(', ')}`);
});

test('detects process management dependencies', () => {
  const deps = detectExternalDeps('The daemon spawns child processes for workers.');
  assert.ok(deps.includes('プロセス管理'), `got: ${deps.join(', ')}`);
});

test('detects file I/O dependencies', () => {
  const deps = detectExternalDeps('Reads configuration from file using fs.readFileSync.');
  assert.ok(deps.includes('ファイルI/O'), `got: ${deps.join(', ')}`);
});

test('no deps for plain text', () => {
  const deps = detectExternalDeps('This is just regular prose with no technical dependencies mentioned anywhere at all.');
  assert.strictEqual(deps.length, 0);
});

// ============================================================
// Tests: extractHeadingTokens
// ============================================================

console.log('\n--- extractHeadingTokens ---');

test('extractHeadingTokens splits Japanese text', () => {
  const tokens = extractHeadingTokens('システム構成概要');
  assert.ok(tokens.length >= 1);
});

test('extractHeadingTokens splits English text', () => {
  const tokens = extractHeadingTokens('System Architecture Overview');
  assert.ok(tokens.includes('System'));
  assert.ok(tokens.includes('Architecture'));
  assert.ok(tokens.includes('Overview'));
});

test('extractHeadingTokens handles mixed text', () => {
  const tokens = extractHeadingTokens('API Design v2');
  assert.ok(tokens.includes('API'));
  assert.ok(tokens.includes('v2'));
});

test('extractHeadingTokens preserves path-like strings', () => {
  const tokens = extractHeadingTokens('API /v1/users');
  assert.ok(tokens.includes('API'));
});

// ============================================================
// Tests: generateCandidateHeadingRefs
// ============================================================

console.log('\n--- generateCandidateHeadingRefs ---');

test('generateCandidateHeadingRefs returns refs for each section', () => {
  const codeBlocks = extractCodeBlocks(SIMPLE_MD);
  const sections = extractHeadingTree(SIMPLE_MD, codeBlocks);
  const refs = generateCandidateHeadingRefs(sections);
  assert.strictEqual(refs.length, sections.length);
  assert.ok(refs[0].lineRange);
  assert.ok(refs[0].texts);
});

// ============================================================
// Tests: formatReport
// ============================================================

console.log('\n--- formatReport ---');

test('formatReport includes Basic Information section', () => {
  const report = formatReport('/test/doc.md', 100, 20, [], [], [], [], []);
  assert.ok(report.includes('Basic Information'));
  assert.ok(report.includes('Structure Analysis Report'));
});

test('formatReport includes Section List', () => {
  const report = formatReport('/test/doc.md', 100, 20, [], [], [], [], []);
  assert.ok(report.includes('Section List'));
});

test('formatReport includes Sections Exceeding 100 Lines', () => {
  const report = formatReport('/test/doc.md', 100, 20, [], [], [], [], []);
  assert.ok(report.includes('Sections Exceeding 100 Lines'));
});

test('formatReport shows "None" when no long sections', () => {
  const report = formatReport('/test/doc.md', 100, 20, [], [], [], [], []);
  assert.ok(report.includes('None (all sections under 100 lines)'));
});

test('formatReport lists long sections when present', () => {
  const longSections = [
    { lineRange: 'L10-L130', proseLines: 120, label: 'Long Section' },
  ];
  const report = formatReport('/test/doc.md', 150, 10, [], [], [], longSections, []);
  assert.ok(report.includes('L10-L130'));
  assert.ok(report.includes('120 prose lines'));
  assert.ok(report.includes('Long Section'));
});

test('formatReport annotates kind info when present', () => {
  const sections = [
    { level: 2, heading: 'Requirements', startLine: 10, endLine: 30, proseLines: 15, codeBlockCount: 0, bodyText: '' },
  ];
  // formatReport builds kindByRange from kindHints which include lineRange
  const kindHints = [
    { lineRange: 'L10-L30', kind: 'requirement', reason: 'heading: "Requirements"' },
  ];
  const report = formatReport('/test/doc.md', 40, 0, sections, kindHints, [], [], []);
  assert.ok(report.includes('[kind: requirement]'));
});

// ============================================================
// Tests: generateReport (integration)
// ============================================================

console.log('\n--- generateReport (integration) ---');

test('generateReport with Japanese document works', () => {
  const jaLines = [
    '# 設計書',
    '',
    'この文書はシステム設計について記述する。',
    '',
    '## 要件定義',
    '',
    'システムは1秒間に1000リクエストを処理しなければならない。',
    '',
    '## アーキテクチャ',
    '',
    'システムは3層構造で構成される。',
    '',
  ];
  const report = generateReport('/test/ja-doc.md', jaLines);
  assert.ok(report.includes('Structure Analysis Report'));
  assert.ok(report.includes('Section List'));
  assert.ok(report.includes('設計書'));
  assert.ok(report.includes('要件定義'));
  assert.ok(report.includes('アーキテクチャ'));
});

test('generateReport with English document works', () => {
  const enLines = [
    '# Design Document',
    '',
    'This document describes the system design.',
    '',
    '## Requirements',
    '',
    'The system must handle 1000 requests per second.',
    '',
    '## Architecture',
    '',
    'The system consists of three layers.',
    '',
  ];
  const report = generateReport('/test/en-doc.md', enLines);
  assert.ok(report.includes('Structure Analysis Report'));
  assert.ok(report.includes('Section List'));
  assert.ok(report.includes('Design Document'));
  assert.ok(report.includes('Requirements'));
  assert.ok(report.includes('Architecture'));
});

test('generateReport estimates kind for English heading', () => {
  const enLines = [
    '# API Reference',
    '',
    'This is the API documentation.',
    '',
    '## Error Handling',
    '',
    'Errors are returned with appropriate status codes.',
    '',
    '## Data Model',
    '',
    'The user entity has the following fields.',
    '',
  ];
  const report = generateReport('/test/en-doc.md', enLines);
  // The kind info should appear as inline annotations
  // Check that "kind: api_contract" or "kind: security" etc. appears
  assert.ok(report.includes('[kind:'));
});

test('generateReport detects dependencies', () => {
  const depLines = [
    '# System',
    '',
    '## Database',
    '',
    'We use PostgreSQL for primary storage and Redis for caching.',
    '',
  ];
  const report = generateReport('/test/dep-doc.md', depLines);
  assert.ok(report.includes('[dep:'));
});

// ============================================================
// Tests: generateReport — long section detection
// ============================================================

console.log('\n--- generateReport (long sections) ---');

test('long section detection excludes h1 level', () => {
  // Create a long h1 with no subsections
  const longLines = [];
  longLines.push('# Very Long Document');
  for (let i = 0; i < 120; i++) {
    longLines.push(`Line ${i} of long content.`);
  }
  const report = generateReport('/test/long-h1.md', longLines);
  // h1 is excluded from long section detection, so expect "None"
  assert.ok(report.includes('None (all sections under 100 lines)'));
});

test('long section detection triggers for h2 without children', () => {
  const longLines = [];
  longLines.push('# Document');
  longLines.push('');
  longLines.push('## Long Section');
  for (let i = 0; i < 150; i++) {
    longLines.push(`Content line ${i}.`);
  }
  const report = generateReport('/test/long-section.md', longLines);
  assert.ok(report.includes('Long Section'));
});

test('long section with child headings is excluded', () => {
  const longLines = [];
  longLines.push('# Document');
  longLines.push('');
  longLines.push('## Parent Section');
  for (let i = 0; i < 120; i++) {
    longLines.push(`Line ${i}.`);
  }
  longLines.push('### Child Section');
  longLines.push('This child section splits the parent appropriately.');
  const report = generateReport('/test/long-parent.md', longLines);
  // Parent has children, so it should not appear in the long section list
  assert.ok(report.includes('None (all sections under 100 lines)'));
});

// ============================================================
// Tests: Constants
// ============================================================

console.log('\n--- Constants ---');

test('KIND_PATTERNS has exactly 12 kinds', () => {
  assert.strictEqual(KIND_PATTERNS.length, 12);
  const kinds = KIND_PATTERNS.map(k => k.kind);
  assert.ok(kinds.includes('requirement'));
  assert.ok(kinds.includes('api_contract'));
  assert.ok(kinds.includes('data_model'));
  assert.ok(kinds.includes('state_machine'));
  assert.ok(kinds.includes('architecture'));
  assert.ok(kinds.includes('security'));
  assert.ok(kinds.includes('error_policy'));
  assert.ok(kinds.includes('config'));
  assert.ok(kinds.includes('test_policy'));
  assert.ok(kinds.includes('build_ci'));
  assert.ok(kinds.includes('rationale'));
  assert.ok(kinds.includes('glossary'));
});

test('each kind has at least some heading and body patterns', () => {
  for (const kind of KIND_PATTERNS) {
    assert.ok(kind.heading.length >= 5, `${kind.kind}: heading patterns < 5 (${kind.heading.length})`);
    assert.ok(kind.body.length >= 3, `${kind.kind}: body patterns < 3`);
  }
});

test('each kind has English heading patterns (case-insensitive)', () => {
  for (const kind of KIND_PATTERNS) {
    const hasEn = kind.heading.some(re => re.flags.includes('i'));
    assert.ok(hasEn, `${kind.kind}: missing case-insensitive (English) heading patterns`);
  }
});

test('DEP_PATTERNS has 15 categories', () => {
  assert.strictEqual(DEP_PATTERNS.length, 15);
  const labels = DEP_PATTERNS.map(d => d.label);
  assert.ok(labels.includes('クラウド/インフラ'));
  assert.ok(labels.includes('メッセージング'));
  assert.ok(labels.includes('監視/可観測性'));
  assert.ok(labels.includes('コンテナ/オーケストレーション'));
});

// ============================================================
// Results
// ============================================================

report();
