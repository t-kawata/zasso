#!/usr/bin/env node

/**
 * generate-related-ticket-ids.test.cjs — relatedTicketIds 生成のユニットテスト
 *
 * テストフレームワーク非依存。node コマンドで直接実行可能。
 *   node tests/generate-related-ticket-ids.test.cjs
 */

'use strict';

const path = require('path');
const mod = require(path.resolve(__dirname, '../.claude/scripts/tickets/generate-related-ticket-ids.js'));
const { generateRelatedTicketIds, DIRECTION_LABELS } = mod;

// ============================================================
// テストユーティリティ
// ============================================================

let passedCount = 0;
let failedCount = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passedCount++;
  } else {
    failedCount++;
    failures.push(message);
    console.error('  ❌ FAIL: ' + message);
  }
}

function assertMapSize(map, expectedSize, message) {
  if (map.size === expectedSize) {
    passedCount++;
  } else {
    failedCount++;
    failures.push(message + ' (size: ' + map.size + ', expected: ' + expectedSize + ')');
    console.error('  ❌ FAIL: ' + message);
    console.error('      size: ' + map.size + ', expected: ' + expectedSize);
  }
}

function assertContains(str, substring, message) {
  if (str && str.indexOf(substring) !== -1) {
    passedCount++;
  } else {
    failedCount++;
    failures.push(message);
    console.error('  ❌ FAIL: ' + message);
    console.error('      string: "' + str + '"');
    console.error('      expected to contain: "' + substring + '"');
  }
}

function assertNotContains(str, substring, message) {
  if (!str || str.indexOf(substring) === -1) {
    passedCount++;
  } else {
    failedCount++;
    failures.push(message);
    console.error('  ❌ FAIL: ' + message);
    console.error('      string: "' + str + '"');
    console.error('      expected NOT to contain: "' + substring + '"');
  }
}

/**
 * テスト用のチケットを生成する
 */
function makeTicket(id, nodeIds, title, phaseId) {
  return { id: id, nodeIds: nodeIds || [], phaseId: phaseId !== undefined ? phaseId : 0, title: title || 'ticket ' + id };
}

/**
 * テスト用のエッジを生成する
 */
function makeEdge(from, to, type) {
  return { from: from, to: to, type: type || 'depends_on' };
}

// ============================================================
// テスト: 逆引きマップ構築
// ============================================================

function testReverseMap() {
  console.log('\n=== 逆引きマップ（内部実装間接検証）===');

  // 2チケット・2ノードの単純ケース
  const tickets = [
    makeTicket(1, ['N0001', 'N0002'], 'First', 0),
    makeTicket(2, ['N0003'], 'Second', 0),
  ];
  const edges = [makeEdge('N0001', 'N0003', 'depends_on')];
  const result = generateRelatedTicketIds(tickets, edges);
  assertMapSize(result, 2, '2チケット間エッジ: 双方向とも出力される');
  assertContains(result.get("0:1"), 'P0-2', 'ticket 1 の related に P0-2 が含まれる');
  assertContains(result.get("0:2"), 'P0-1', 'ticket 2 の related に P0-1 が含まれる');
}

// ============================================================
// テスト: 単一エッジ・交差チケット
// ============================================================

function testSingleEdgeCrossTicket() {
  console.log('\n=== 単一エッジ・交差チケット ===');

  const tickets = [
    makeTicket(1, ['N0001'], 'Ticket A', 0),
    makeTicket(2, ['N0002'], 'Ticket B', 0),
  ];
  const edges = [makeEdge('N0001', 'N0002', 'depends_on')];
  const result = generateRelatedTicketIds(tickets, edges);

  // P0-1: N0001→N0002 の依存元 → "依存先"
  assertMapSize(result, 2, '双方向にエントリ');
  assertContains(result.get("0:1"), '[depends_on] P0-2', 'P0-1 に [depends_on] P0-2');
  assertContains(result.get("0:1"), '依存先', 'P0-1 は依存先方向');
  assertContains(result.get("0:2"), '[depends_on] P0-1', 'P0-2 に [depends_on] P0-1');
  assertContains(result.get("0:2"), '被依存元（依存元）', 'P0-2 は被依存元方向');
}

// ============================================================
// テスト: 自己参照ガード
// ============================================================

function testSelfReferenceGuard() {
  console.log('\n=== 自己参照ガード ===');

  // 同一チケット内の nodeIds に両端点が含まれるエッジ → 出力しない
  const tickets = [
    makeTicket(1, ['N0001', 'N0002'], 'Self ticket', 0),
    makeTicket(2, ['N0003'], 'Other', 0),
  ];
  const edges = [makeEdge('N0001', 'N0002', 'refines')];
  const result = generateRelatedTicketIds(tickets, edges);
  assertMapSize(result, 0, '自己参照エッジは出力されない');

  // 混合ケース: 自己参照 + 交差エッジ
  const tickets2 = [
    makeTicket(1, ['N0001', 'N0002'], 'Mixed', 0),
    makeTicket(2, ['N0003'], 'Other', 0),
  ];
  const edges2 = [
    makeEdge('N0001', 'N0002', 'refines'), // 自己参照 → スキップ
    makeEdge('N0001', 'N0003', 'depends_on'), // 交差 → 出力
  ];
  const result2 = generateRelatedTicketIds(tickets2, edges2);
  assertMapSize(result2, 2, '混合: 自己参照をスキップし交差のみ出力');
  assertContains(result2.get("0:1"), 'P0-2', 'ticket1 に P0-2 への交差エッジ');
  assertNotContains(result2.get("0:1"), 'refines', 'ticket1 に refines 自己参照は含まれない');
}

// ============================================================
// テスト: 複数エッジの連結
// ============================================================

function testMultipleEdges() {
  console.log('\n=== 複数エッジの連結 ===');

  const tickets = [
    makeTicket(1, ['N0001'], 'Source', 0),
    makeTicket(2, ['N0002'], 'Target A', 0),
    makeTicket(3, ['N0003'], 'Target B', 0),
  ];
  const edges = [
    makeEdge('N0001', 'N0002', 'depends_on'),
    makeEdge('N0001', 'N0003', 'refines'),
  ];
  const result = generateRelatedTicketIds(tickets, edges);

  assertMapSize(result, 3, '3チケット・2エッジ: 全3チケットにエントリ');
  assertContains(result.get("0:1"), "P0-2", "P0-1 に P0-2 へのエッジ");
  assertContains(result.get("0:1"), 'P0-3', 'P0-1 に P0-3 へのエッジ');
  // 2つのエッジが ", " で連結されていることを確認
  const prose = result.get("0:1");
  assert(prose.indexOf(', ') !== -1, '複数エッジが ", " で連結される');
}

// ============================================================
// テスト: 全エッジ種別
// ============================================================

function testAllEdgeTypes() {
  console.log('\n=== 全エッジ種別 ===');

  const tickets = [
    makeTicket(1, ['N0001'], 'Source', 0),
    makeTicket(2, ['N0002'], 'Target', 0),
  ];

  const types = [
    'depends_on', 'implements', 'constrains', 'precedes',
    'triggers', 'refines', 'references', 'extends',
    'conflicts_with', 'supersedes', 'validates', 'part_of',
  ];

  for (const type of types) {
    const edges = [makeEdge('N0001', 'N0002', type)];
    const result = generateRelatedTicketIds(tickets, edges);
    assertMapSize(result, 2, 'type=' + type + ': 双方向に出力');
    assertContains(result.get("0:1"), '[' + type + ']', 'type=' + type + ': P0-1 に [' + type + ']');
  }

  // 未知のエッジ種別 → type 名をそのまま方向ラベルとして使用
  const unknownEdges = [makeEdge('N0001', 'N0002', 'unknown_type')];
  const result = generateRelatedTicketIds(tickets, unknownEdges);
  assertMapSize(result, 2, '未知のエッジ種別: 双方向に出力');
  assertContains(result.get("0:1"), '[unknown_type]', '未知のエッジ種別: type名がそのまま使われる');
  assertContains(result.get("0:1"), 'unknown_type', '方向ラベルに type 名がフォールバック');
}

// ============================================================
// テスト: 無関係エッジ
// ============================================================

function testUnrelatedEdge() {
  console.log('\n=== 無関係エッジ ===');

  const tickets = [
    makeTicket(1, ['N0001'], 'Ticket', 0),
  ];
  const edges = [
    makeEdge('N9999', 'N8888', 'depends_on'), // どのチケットの nodeId にも含まれない
  ];
  const result = generateRelatedTicketIds(tickets, edges);
  assertMapSize(result, 0, '無関係エッジ: 出力されない');
}

// ============================================================
// テスト: 空/null 入力
// ============================================================

function testEmptyInputs() {
  console.log('\n=== 空/null 入力 ===');

  // 空チケット配列
  assertMapSize(generateRelatedTicketIds([], [makeEdge('N1', 'N2')]), 0, '空チケット配列: 空マップ');

  // 空エッジ配列
  const tickets = [makeTicket(1, ['N1'], undefined, 0)];
  assertMapSize(generateRelatedTicketIds(tickets, []), 0, '空エッジ配列: 空マップ');

  // null/undefined
  assertMapSize(generateRelatedTicketIds(null, [makeEdge('N1', 'N2')]), 0, 'null tickets: 空マップ');
  assertMapSize(generateRelatedTicketIds(tickets, null), 0, 'null edges: 空マップ');
  assertMapSize(generateRelatedTicketIds(undefined, undefined), 0, 'undefined/undefined: 空マップ');

  // 空の nodeIds を持つチケット
  const emptyNodeTickets = [makeTicket(1, [], 'empty', 0)];
  assertMapSize(generateRelatedTicketIds(emptyNodeTickets, [makeEdge('N1', 'N2')]), 0, '空nodeIds: 空マップ');
}

// ============================================================
// テスト: ID振り直し後の再実行（冪等性）
// ============================================================

function testIdempotentAfterRename() {
  console.log('\n=== ID振り直し後の再実行 ===');

  // GRAPH.json は不変（nodeId は変わらない）
  const edges = [makeEdge('N0001', 'N0002', 'depends_on')];

  // 1回目: 古いID
  const oldTickets = [
    makeTicket(1, ['N0001'], 'Old A', 0),
    makeTicket(2, ['N0002'], 'Old B', 0),
  ];
  const oldResult = generateRelatedTicketIds(oldTickets, edges);
  assertContains(oldResult.get("0:1"), 'P0-2', '古いID: phase0-ticket1→P0-2');

  // ID振り直し後: 新しいIDでも同じ GRAPH.json から正しく生成される
  const newTickets = [
    makeTicket(1, ['N0001'], 'New A', 3),
    makeTicket(2, ['N0002'], 'New B', 3),
  ];
  const newResult = generateRelatedTicketIds(newTickets, edges);
  assertContains(newResult.get("3:1"), 'P3-2', '新しいID: P3-1→P3-2');
  assertNotContains(newResult.get("3:1"), 'P0-2', '古いIDが残らない');
}

// ============================================================
// テスト: direction の正確性
// ============================================================

function testDirectionAccuracy() {
  console.log('\n=== direction の正確性 ===');

  // depends_on: N0001 → N0002 (N0001 は P0-1, N0002 は P0-2)
  const tickets = [
    makeTicket(1, ['N0001'], 'From', 0),
    makeTicket(2, ['N0002'], 'To', 0),
  ];
  const edges = [makeEdge('N0001', 'N0002', 'depends_on')];
  const result = generateRelatedTicketIds(tickets, edges);

  // P0-1 は from 側 → "依存先"
  assertContains(result.get("0:1"), '依存先', 'from 側チケット: "依存先"');
  // P0-2 は to 側 → "被依存元（依存元）"
  assertContains(result.get("0:2"), '被依存元（依存元）', 'to 側チケット: "被依存元（依存元）"');

  // refines, references, extends の方向ラベル確認 (from→to のラベル)
  const testCases = Object.entries(DIRECTION_LABELS);
  for (const [type, label] of testCases) {
    const e = [makeEdge('N0001', 'N0002', type)];
    const r = generateRelatedTicketIds(tickets, e);
    assertContains(r.get("0:1"), label, type + ': from側に "' + label + '"');
  }
}

// ============================================================
// テスト: エッジの欠落フィールド
// ============================================================

function testEdgeMissingFields() {
  console.log('\n=== エッジ欠落フィールド ===');

  const tickets = [makeTicket(1, ['N0001'], 'Ticket', 0)];

  // from がないエッジ
  const missingFrom = [{ to: 'N0002', type: 'depends_on' }];
  assertMapSize(generateRelatedTicketIds(tickets, missingFrom), 0, 'from欠落: スキップ');

  // to がないエッジ
  const missingTo = [{ from: 'N0001', type: 'depends_on' }];
  assertMapSize(generateRelatedTicketIds(tickets, missingTo), 0, 'to欠落: スキップ');

  // type がないエッジ
  const missingType = [{ from: 'N0001', to: 'N0002' }];
  assertMapSize(generateRelatedTicketIds(tickets, missingType), 0, 'type欠落: スキップ');
}

// ============================================================
// テスト: 複数フェーズにまたがるチケット
// ============================================================

function testCrossPhaseTickets() {
  console.log('\n=== 複数フェーズまたがり ===');

  const tickets = [
    makeTicket(1, ['N0001'], 'Phase0 ticket', 0),
    makeTicket(1, ['N0002'], 'Phase1 ticket', 1),
    makeTicket(1, ['N0003'], 'Phase2 ticket', 2),
  ];
  const edges = [
    makeEdge('N0001', 'N0002', 'depends_on'),
    makeEdge('N0002', 'N0003', 'implements'),
  ];
  const result = generateRelatedTicketIds(tickets, edges);

  assertMapSize(result, 3, "3フェーズ間エッジ: 全3チケットにエントリ（複合キーで区別）");
  assertContains(result.get("0:1"), '[depends_on] P1-1', 'phase0 ticket → P1-1 (depends_on)');
  assertContains(result.get("1:1"), '[depends_on] P0-1', 'phase1 ticket が P0-1 からの被依存＋');
  assertContains(result.get("1:1"), '[implements] P2-1', 'phase1 ticket → P2-1 (implements)');
  assertContains(result.get("2:1"), 'P1-1', 'phase2 ticket が P1-1 からの被依存');
}

// ============================================================
// テストランナー
// ============================================================

function runAllTests() {
  console.log('=== generate-related-ticket-ids.test.cjs ===');
  console.log('開始時刻: ' + new Date().toISOString());

  const tests = [
    testReverseMap,
    testSingleEdgeCrossTicket,
    testSelfReferenceGuard,
    testMultipleEdges,
    testAllEdgeTypes,
    testUnrelatedEdge,
    testEmptyInputs,
    testIdempotentAfterRename,
    testDirectionAccuracy,
    testEdgeMissingFields,
    testCrossPhaseTickets,
  ];

  for (const testFn of tests) {
    try {
      testFn();
    } catch (e) {
      failedCount++;
      console.error('  ❌ CRASH: ' + e.message);
      failures.push('[CRASH] ' + testFn.name + ': ' + e.message);
    }
  }

  const total = passedCount + failedCount;
  console.log('\n=== 結果: ' + passedCount + '/' + total + ' PASS ===');

  if (failedCount > 0) {
    console.error('\n失敗したテスト:');
    for (const f of failures) {
      console.error('  ' + f);
    }
    process.exit(1);
  }
}

runAllTests();
