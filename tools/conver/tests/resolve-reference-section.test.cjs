#!/usr/bin/env node

/**
 * resolve-reference-section.test.cjs — referenceSection 機械生成のユニットテスト
 *
 * Run: node tests/resolve-reference-section.test.cjs
 */

'use strict';

const path = require('path');
const mod = require(path.resolve(__dirname, '../.claude/scripts/tickets/add-tickets-for-phase.js'));
const { resolveReferenceSection } = mod;

let passedCount = 0;
let failedCount = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) { passedCount++; }
  else { failedCount++; failures.push(msg); console.error('  FAIL: ' + msg); }
}

function assertEqual(actual, expected, msg) {
  if (actual === expected) { passedCount++; }
  else {
    failedCount++; failures.push(msg);
    console.error('  FAIL: ' + msg);
    console.error('    actual:   ' + JSON.stringify(actual));
    console.error('    expected: ' + JSON.stringify(expected));
  }
}

/** テスト用ノード生成 */
function node(id, title) {
  return { id: id, title: title };
}

// ============================================================
// テスト 1: 単一ノード → § 抽出
// ============================================================

function testSingleNode() {
  const nodes = [node('N0001', '§1 目的 — 本crateの責務定義')];
  const result = resolveReferenceSection(['N0001'], nodes, 'RFC-ROOT.md');
  assertEqual(result, 'RFC-ROOT (§1)', '単一ノード: §1');
}

// ============================================================
// テスト 2: 複数ノード → ソート
// ============================================================

function testMultipleNodesSorted() {
  const nodes = [
    node('N0005', '§2.1 Tauri統合との責務境界'),
    node('N0001', '§1 目的'),
    node('N0004', '§2 非目的'),
  ];
  const result = resolveReferenceSection(['N0001', 'N0004', 'N0005'], nodes, 'RFC-ROOT.md');
  assertEqual(result, 'RFC-ROOT (§1, §2, §2.1)', '複数ノード: 正しい順序でソート');
}

// ============================================================
// テスト 3: 重複 § の除去
// ============================================================

function testDuplicateSections() {
  const nodes = [
    node('N0002', '§1a M20実装優先度マップ'),
    node('N0003', '§1a 設計判断対応表'),
    node('N0001', '§1 目的'),
  ];
  const result = resolveReferenceSection(['N0001', 'N0002', 'N0003'], nodes, 'RFC-ROOT.md');
  assertEqual(result, 'RFC-ROOT (§1, §1a)', '重複除去: §1a は1回のみ');
}

// ============================================================
// テスト 4: § なしノード → 空文字列
// ============================================================

function testNoSectionMarker() {
  const nodes = [node('N0030', 'M20 追補: 新RuntimeCommandのエラー設計')];
  const result = resolveReferenceSection(['N0030'], nodes, 'RFC-ROOT.md');
  assertEqual(result, "", '§なし: 空文字列');
}

// Wait - the spec says empty string for §-less. Let me re-check.
// Actually the spec says: "" (empty string)
// Let me fix this assertion.

// ============================================================
// テスト 5: 存在しない nodeId → 空
// ============================================================

function testNonExistentNodeId() {
  const result = resolveReferenceSection(['NX000'], [], 'RFC-ROOT.md');
  assertEqual(result, '', '存在しない nodeId: 空文字列');
}

// ============================================================
// テスト 6: 空の nodeIds → 空
// ============================================================

function testEmptyNodeIds() {
  const nodes = [node('N0001', '§1 目的')];
  const result = resolveReferenceSection([], nodes, 'RFC-ROOT.md');
  assertEqual(result, '', '空 nodeIds: 空文字列');
}

// ============================================================
// テスト 7: ソート順（§1, §1a, §2, §10）
// ============================================================

function testSortOrder() {
  const nodes = [
    node('N010', '§10 セクション10'),
    node('N001', '§1 セクション1'),
    node('N01a', '§1a セクション1a'),
    node('N002', '§2 セクション2'),
  ];
  const result = resolveReferenceSection(['N001', 'N01a', 'N002', 'N010'], nodes, 'RFC-ROOT.md');
  assertEqual(result, 'RFC-ROOT (§1, §1a, §2, §10)', 'ソート順: 数値→接尾辞');
}

// ============================================================
// テスト 8: sourceFile の .md 除去 + 絶対パス処理
// ============================================================

function testSourceFilePath() {
  const nodes = [node('N0001', '§1 目的')];
  const result = resolveReferenceSection(['N0001'], nodes, '/path/to/RFC-ROOT.md');
  assertEqual(result, '/path/to/RFC-ROOT (§1)', 'sourceFile: .md 除去と絶対パス維持');
}

// ============================================================
// テスト 9: 全ノードが § なし → 空
// ============================================================

function testAllNoSection() {
  const nodes = [
    node('N0030', 'M20 追補: 新RuntimeCommandのエラー設計'),
    node('N0031', 'M20 追補: 別の追補'),
  ];
  const result = resolveReferenceSection(['N0030', 'N0031'], nodes, 'RFC-ROOT.md');
  assertEqual(result, '', '全§なし: 空文字列');
}

// ============================================================
// テストランナー
// ============================================================

function run() {
  console.log('=== resolve-reference-section.test.cjs ===');
  const tests = [
    testSingleNode,
    testMultipleNodesSorted,
    testDuplicateSections,
    testNoSectionMarker,
    testNonExistentNodeId,
    testEmptyNodeIds,
    testSortOrder,
    testSourceFilePath,
    testAllNoSection,
  ];
  for (const fn of tests) {
    try { fn(); }
    catch (e) { failedCount++; failures.push('[CRASH] ' + fn.name + ': ' + e.message); }
  }
  const total = passedCount + failedCount;
  console.log('Result: ' + passedCount + '/' + total + ' PASS');
  if (failedCount > 0) {
    console.error('Failures:', failures.join(', '));
    process.exit(1);
  }
}

run();
