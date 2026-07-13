#!/usr/bin/env node

/**
 * consolidate-phase-tickets.test.cjs — フェーズ統合スクリプトのユニットテスト
 *
 * テストフレームワーク非依存。node コマンドで直接実行可能。
 *   node tests/consolidate-phase-tickets.test.cjs
 *
 * Phase A（コアロジック）は全て純粋関数のためモック不要。
 * Phase B/C（PX-45/PX-46 依存）はモックを使用。
 */

'use strict';

const path = require('path');
const {
  guardPhaseCount,
  validateAllNodeIdsCovered,
  consolidateFromRight,
  renumberPhaseIds,
  renumberTicketIds,
  finalValidation,
  regenerateRelatedTicketIds,
  updateStatusJson,
  parseCliArgs,
  MIN_TICKETS_PER_PHASE,
  PHASE_ID_PREFIX,
} = require(path.resolve(__dirname, '../.claude/scripts/tickets/consolidate-phase-tickets.js'));

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

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr === expectedStr) {
    passedCount++;
  } else {
    failedCount++;
    failures.push(message);
    console.error('  ❌ FAIL: ' + message);
    console.error('      actual:   ' + actualStr);
    console.error('      expected: ' + expectedStr);
  }
}

/**
 * テスト用のフェーズデータを生成する
 *
 * @param {number} phaseId — フェーズID
 * @param {number} ticketCount — チケット数
 * @param {string[]} nodeIds — このフェーズの nodeIds
 * @returns {object} フェーズオブジェクト
 */
function createTestPhase(phaseId, ticketCount, nodeIds) {
  const tickets = [];
  const prefix = PHASE_ID_PREFIX + phaseId;
  for (let i = 0; i < ticketCount; i++) {
    // 各チケットに nodeIds を均等分配
    const tixNodeIds = [];
    if (nodeIds && nodeIds.length > 0) {
      const chunkSize = Math.max(1, Math.floor(nodeIds.length / ticketCount));
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, nodeIds.length);
      for (let j = start; j < end; j++) {
        tixNodeIds.push(nodeIds[j]);
      }
    }
    tickets.push({
      id: prefix + '-' + (i + 1),
      phaseId: phaseId,
      nodeIds: tixNodeIds,
      title: 'テストチケット ' + phaseId + '-' + (i + 1),
    });
  }
  return {
    id: phaseId,
    name: prefix,
    summary: 'フェーズ ' + phaseId + ' のテストデータ',
    nodeIds: nodeIds || [],
    tickets: tickets,
  };
}

// ============================================================
// テスト: guardPhaseCount
// ============================================================

function testGuardPhaseCount() {
  console.log('\n=== guardPhaseCount ===');

  // 正常系: 5フェーズ → shouldSkip=false
  const phases5 = [1, 2, 3, 4, 5].map(function(i) { return { id: i }; });
  const result5 = guardPhaseCount(phases5);
  assert(result5.shouldSkip === false, '5フェーズは shouldSkip=false');
  assert(result5.phaseCount === 5, '5フェーズは phaseCount=5');

  // 境界値: 3フェーズ（最小閾値） → shouldSkip=false
  const phases3 = [1, 2, 3].map(function(i) { return { id: i }; });
  const result3 = guardPhaseCount(phases3);
  assert(result3.shouldSkip === false, '3フェーズは shouldSkip=false（閾値と同値なら続行）');

  // 境界値: 2フェーズ → shouldSkip=true
  const phases2 = [1, 2].map(function(i) { return { id: i }; });
  const result2 = guardPhaseCount(phases2);
  assert(result2.shouldSkip === true, '2フェーズは shouldSkip=true');

  // 境界値: 1フェーズ → shouldSkip=true
  const phases1 = [{ id: 1 }];
  const result1 = guardPhaseCount(phases1);
  assert(result1.shouldSkip === true, '1フェーズは shouldSkip=true');

  // 境界値: 0フェーズ → shouldSkip=true
  const phases0 = [];
  const result0 = guardPhaseCount(phases0);
  assert(result0.shouldSkip === true, '0フェーズは shouldSkip=true');

  // 異常系: null/undefined → 0フェーズ相当として shouldSkip=true
  const resultNull = guardPhaseCount(null);
  assert(resultNull.shouldSkip === true, 'nullは shouldSkip=true');
  assert(resultNull.phaseCount === 0, 'nullは phaseCount=0');

  const resultUndef = guardPhaseCount(undefined);
  assert(resultUndef.shouldSkip === true, 'undefinedは shouldSkip=true');
}

// ============================================================
// テスト: validateAllNodeIdsCovered
// ============================================================

function testValidateAllNodeIdsCovered() {
  console.log('\n=== validateAllNodeIdsCovered ===');

  // 正常系: 全 nodeIds がカバー済み
  const phaseFull = createTestPhase(0, 2, ['N0001', 'N0002', 'N0003', 'N0004']);
  const resultFull = validateAllNodeIdsCovered([phaseFull]);
  assert(resultFull.valid === true, '全カバー: valid=true');
  assert(resultFull.missingNodeIds.length === 0, '全カバー: missingNodeIds=0');

  // 異常系: 未カバーの nodeIds あり
  const phasePartial = createTestPhase(0, 1, ['N0001', 'N0002', 'N0003']);
  // チケットを上書き: 1チケットでN0001だけカバー
  phasePartial.tickets[0].nodeIds = ['N0001'];
  const resultPartial = validateAllNodeIdsCovered([phasePartial]);
  assert(resultPartial.valid === false, '未カバーあり: valid=false');
  assert(resultPartial.missingNodeIds.length === 1, '未カバーあり: missingNodeIds=1件');
  assert(resultPartial.missingNodeIds[0].phaseId === 0, '未カバーあり: phaseId=0');
  assertDeepEqual(
    resultPartial.missingNodeIds[0].nodeIds.sort(),
    ['N0002', 'N0003'],
    '未カバーあり: 不足ノードが N0002, N0003'
  );

  // 境界値: 空の nodeIds を持つフェーズ
  const phaseEmpty = createTestPhase(0, 0, []);
  const resultEmpty = validateAllNodeIdsCovered([phaseEmpty]);
  assert(resultEmpty.valid === true, '空 nodeIds: valid=true');

  // 境界値: チケットなしのフェーズ（nodeIds はあるが tickets が空）
  const phaseNoTickets = {
    id: 0,
    name: 'P0',
    summary: 'チケットなし',
    nodeIds: ['N0001', 'N0002'],
    tickets: [],
  };
  const resultNoTickets = validateAllNodeIdsCovered([phaseNoTickets]);
  assert(resultNoTickets.valid === false, 'チケットなし + nodeIdsあり: valid=false');
  assert(resultNoTickets.missingNodeIds.length === 1, 'チケットなし + nodeIdsあり: missingNodeIds=1件');

  // 複数フェーズの混在
  const phasesMixed = [
    createTestPhase(0, 2, ['N0001', 'N0002']), // ✅ 全カバー
    createTestPhase(1, 1, ['N0003']),           // ✅ 全カバー
  ];
  const resultMixed = validateAllNodeIdsCovered(phasesMixed);
  assert(resultMixed.valid === true, '複数フェーズ全カバー: valid=true');
}

// ============================================================
// テスト: consolidateFromRight
// ============================================================

function testConsolidateFromRight() {
  console.log('\n=== consolidateFromRight ===');

  // 正常系: 3未満フェーズを後方統合（P0:1チケット, P1:5チケット）
  const p0 = createTestPhase(0, 1, ['N0001']);  // 3未満 → 統合対象
  const p1 = createTestPhase(1, 5, ['N0002', 'N0003', 'N0004', 'N0005', 'N0006']); // 3以上
  const result = consolidateFromRight([p0, p1]);
  assert(result.length === 1, '統合後: フェーズ数が1になる');
  assert(result[0].tickets.length === 6, '統合後: チケット数が1+5=6になる');
  assert(result[0].name.startsWith('P0'), '統合後: name が先頭フェーズ名を含む');
  assert(result[0].nodeIds.length === 6, '統合後: nodeIds が6個（1+5）');

  // 正常系: 全フェーズ既に3以上 → 変更なし
  const phasesAllOk = [
    createTestPhase(0, 3, ['N0001', 'N0002', 'N0003']),
    createTestPhase(1, 4, ['N0004', 'N0005', 'N0006', 'N0007']),
  ];
  const resultAllOk = consolidateFromRight(phasesAllOk);
  assert(resultAllOk.length === 2, '全3以上: フェーズ数が変わらない');

  // 境界値: 最終フェーズのみ3未満 → 変更なし
  const phasesLastOnly = [
    createTestPhase(0, 5, ['N0001', 'N0002', 'N0003', 'N0004', 'N0005']),
    createTestPhase(1, 1, ['N0006']),
  ];
  const resultLastOnly = consolidateFromRight(phasesLastOnly);
  assert(resultLastOnly.length === 2, '最終のみ3未満: フェーズ数が変わらない');

  // 境界値: 全フェーズ3未満 → 1フェーズに集約
  const phasesAllSmall = [
    createTestPhase(0, 1, ['N0001']),
    createTestPhase(1, 1, ['N0002']),
    createTestPhase(2, 1, ['N0003']),
  ];
  const resultAllSmall = consolidateFromRight(phasesAllSmall);
  assert(resultAllSmall.length === 1, '全3未満: 1フェーズに集約される');
  assert(resultAllSmall[0].tickets.length === 3, '全3未満: チケット数が3になる');

  // 境界値: 空配列 → 空配列
  const resultEmpty = consolidateFromRight([]);
  assertDeepEqual(resultEmpty, [], '空配列: 空配列が返る');

  // 異常系: null → 空配列
  const resultNull = consolidateFromRight(null);
  assert(resultNull.length === 0, 'null: 空配列が返る');

  // カスケード統合の確認（連続する3未満フェーズ）
  const phasesCascade = [
    createTestPhase(0, 1, ['N0001']),  // 3未満
    createTestPhase(1, 1, ['N0002']),  // 3未満（後方マージ後は前の統合を引き継ぐ）
    createTestPhase(2, 5, ['N0003', 'N0004', 'N0005', 'N0006', 'N0007']),
  ];
  const resultCascade = consolidateFromRight(phasesCascade);
  assert(resultCascade.length === 1, 'カスケード: 全フェーズが1つに統合');
  assert(resultCascade[0].tickets.length === 7, 'カスケード: チケット数が1+1+5=7になる');
}

// ============================================================
// テスト: renumberPhaseIds
// ============================================================

function testRenumberPhaseIds() {
  console.log('\n=== renumberPhaseIds ===');

  // 正常系: 複数フェーズのID振り直し
  const phases = [
    { id: 5, name: 'P5', summary: 'phase 5' },
    { id: 3, name: 'P3', summary: 'phase 3' },
    { id: 7, name: 'P7', summary: 'phase 7' },
  ];
  const result = renumberPhaseIds(phases);
  assert(result[0].id === 0, 'ID振り直し: 最初が0');
  assert(result[1].id === 1, 'ID振り直し: 次が1');
  assert(result[2].id === 2, 'ID振り直し: 次が2');
  assert(result[0].name === 'P0', '名前更新: P0');
  assert(result[1].name === 'P1', '名前更新: P1');
  assert(result[2].name === 'P2', '名前更新: P2');

  // 境界値: 1フェーズのみ
  const singlePhase = [{ id: 42, name: 'P42', summary: 'only' }];
  const resultSingle = renumberPhaseIds(singlePhase);
  assert(resultSingle[0].id === 0, '1フェーズ: ID=0');
  assert(resultSingle[0].name === 'P0', '1フェーズ: P0');

  // 境界値: 空配列
  assertDeepEqual(renumberPhaseIds([]), [], '空配列: 空配列が返る');

  // 異常系: null
  assertDeepEqual(renumberPhaseIds(null), [], 'null: 空配列が返る');
}

// ============================================================
// テスト: renumberTicketIds
// ============================================================

function testRenumberTicketIds() {
  console.log('\n=== renumberTicketIds ===');

  // 正常系: 複数フェーズ・複数チケットのID振り直し
  const phase1 = createTestPhase(0, 3, ['N0001', 'N0002', 'N0003']);
  phase1.id = 0;
  phase1.name = 'P0';
  const phase2 = createTestPhase(0, 2, ['N0004', 'N0005']);
  phase2.id = 1;
  phase2.name = 'P1';

  const result = renumberTicketIds([phase1, phase2]);

  // P0 のチケット
  assert(result[0].tickets[0].id === 'P0-1', 'P0-1: ID=P0-1');
  assert(result[0].tickets[0].phaseId === 0, 'P0-1: phaseId=0');
  assert(result[0].tickets[1].id === 'P0-2', 'P0-2: ID=P0-2');
  assert(result[0].tickets[1].phaseId === 0, 'P0-2: phaseId=0');
  assert(result[0].tickets[2].id === 'P0-3', 'P0-3: ID=P0-3');
  assert(result[0].tickets[2].phaseId === 0, 'P0-3: phaseId=0');

  // P1 のチケット
  assert(result[1].tickets[0].id === 'P1-1', 'P1-1: ID=P1-1');
  assert(result[1].tickets[0].phaseId === 1, 'P1-1: phaseId=1');
  assert(result[1].tickets[1].id === 'P1-2', 'P1-2: ID=P1-2');
  assert(result[1].tickets[1].phaseId === 1, 'P1-2: phaseId=1');

  // 境界値: チケット0個のフェーズ
  const emptyTicketPhase = {
    id: 0, name: 'P0', summary: 'ticketless', nodeIds: [], tickets: [],
  };
  const resultEmpty = renumberTicketIds([emptyTicketPhase]);
  assert(resultEmpty[0].tickets.length === 0, '空チケット: チケット数0');

  // 境界値: 空配列
  assertDeepEqual(renumberTicketIds([]), [], '空配列: 空配列が返る');

  // 異常系: null
  assertDeepEqual(renumberTicketIds(null), [], 'null: 空配列が返る');
}

// ============================================================
// テスト: finalValidation
// ============================================================

function testFinalValidation() {
  console.log('\n=== finalValidation ===');

  // 正常系: 全条件を満たす
  const validPhase = {
    id: 0, name: 'P0', summary: 'valid',
    nodeIds: ['N0001', 'N0002', 'N0003'],
    tickets: [
      {
        id: 'P0-1', phaseId: 0, nodeIds: ['N0001'],
        title: 'ticket 1',
      },
      {
        id: 'P0-2', phaseId: 0, nodeIds: ['N0002'],
        title: 'ticket 2',
      },
      {
        id: 'P0-3', phaseId: 0, nodeIds: ['N0003'],
        title: 'ticket 3',
      },
    ],
  };
  const result = finalValidation([validPhase]);
  assert(result.valid === true, '全条件充足: valid=true');
  assert(result.errors.length === 0, '全条件充足: errors=0');

  // 異常系: 3未満チケットのフェーズ（最終でない）
  const smallPhase = {
    id: 0, name: 'P0', summary: 'small',
    nodeIds: ['N0001'],
    tickets: [
      { id: 'P0-1', phaseId: 0, nodeIds: ['N0001'], title: 'ticket 1' },
    ],
  };
  const largePhase = {
    id: 1, name: 'P1', summary: 'large',
    nodeIds: ['N0002', 'N0003', 'N0004'],
    tickets: [
      { id: 'P1-1', phaseId: 1, nodeIds: ['N0002'], title: 'ticket 1' },
      { id: 'P1-2', phaseId: 1, nodeIds: ['N0003'], title: 'ticket 2' },
      { id: 'P1-3', phaseId: 1, nodeIds: ['N0004'], title: 'ticket 3' },
    ],
  };
  const resultSmall = finalValidation([smallPhase, largePhase]);
  assert(resultSmall.valid === false, '3未満フェーズ（最終以外）: valid=false');

  // 境界値: 最終フェーズが3未満 → エラーにならない
  const lastSmallPhase = {
    id: 1, name: 'P1', summary: 'last small',
    nodeIds: ['N0002'],
    tickets: [
      { id: 'P1-1', phaseId: 1, nodeIds: ['N0002'], title: 'ticket 1' },
    ],
  };
  const resultLastSmall = finalValidation([largePhase, lastSmallPhase]);
  assert(resultLastSmall.valid === true, '最終フェーズのみ3未満: valid=true');

  // 異常系: ID形式不正
  const badIdPhase = {
    id: 0, name: 'P0', summary: 'bad id',
    nodeIds: ['N0001'],
    tickets: [
      { id: 'invalid-id', phaseId: 0, nodeIds: ['N0001'], title: 'bad' },
    ],
  };
  const resultBadId = finalValidation([badIdPhase]);
  assert(resultBadId.valid === false, 'ID形式不正: valid=false');

  // 異常系: phaseId 不整合
  const badPhaseIdTicket = {
    id: 0, name: 'P0', summary: 'bad phaseId',
    nodeIds: ['N0001'],
    tickets: [
      { id: 'P0-1', phaseId: 999, nodeIds: ['N0001'], title: 'bad' },
    ],
  };
  const resultBadPhaseId = finalValidation([badPhaseIdTicket]);
  assert(resultBadPhaseId.valid === false, 'phaseId不整合: valid=false');

  // 異常系: 空 nodeIds のチケット
  const emptyNodeIdsPhase = {
    id: 0, name: 'P0', summary: 'empty nodeIds',
    nodeIds: [],
    tickets: [
      { id: 'P0-1', phaseId: 0, nodeIds: [], title: 'empty' },
    ],
  };
  const resultEmptyNodeIds = finalValidation([emptyNodeIdsPhase]);
  assert(resultEmptyNodeIds.valid === false, '空nodeIds: valid=false');

  // 境界値: 空配列
  const resultEmpty = finalValidation([]);
  assert(resultEmpty.valid === true, '空配列: valid=true');
  assert(resultEmpty.errors.length === 0, '空配列: errors=0');
}

// ============================================================
// テスト: regenerateRelatedTicketIds（Phase B スタブ）
// ============================================================

function testRegenerateRelatedTicketIds() {
  console.log('\n=== regenerateRelatedTicketIds（Phase B スタブ）===');

  const phases = [createTestPhase(0, 2, ['N0001', 'N0002'])];
  const result = regenerateRelatedTicketIds(phases);

  // スタブなので phases がそのまま返る（変更なし）
  assert(result.length === 1, 'スタブ: フェーズ数が変わらない');
  assert(result[0].tickets.length === 2, 'スタブ: チケット数が変わらない');
  // relatedTicketIds が設定されていない（スタブ動作）
  assert(result[0].tickets[0].relatedTicketIds === undefined, 'スタブ: relatedTicketIds が未設定');
}

// ============================================================
// テスト: updateStatusJson（Phase C スタブ）
// ============================================================

function testUpdateStatusJson() {
  console.log('\n=== updateStatusJson（Phase C スタブ）===');

  // スタブ関数は何もせず戻り値なしで正常終了することを確認
  let didThrow = false;
  try {
    updateStatusJson('/tmp/nonexistent-status.json', [], []);
  } catch (e) {
    didThrow = true;
  }
  assert(didThrow === false, 'スタブ: 例外を投げない');
}

// ============================================================
// テスト: parseCliArgs
// ============================================================

function testParseCliArgs() {
  console.log('\n=== parseCliArgs ===');

  // 正常系: 2引数
  const result2 = parseCliArgs(['tickets.json', 'status.json']);
  assert(result2.error === null, '2引数: error=null');
  assert(result2.ticketsPath.endsWith('tickets.json'), '2引数: ticketsPath');
  assert(result2.statusPath.endsWith('status.json'), '2引数: statusPath');
  assert(result2.dryRun === false, '2引数: dryRun=false');

  // 正常系: 3引数 + --dry-run
  const result3 = parseCliArgs(['tickets.json', 'status.json', '--dry-run']);
  assert(result3.error === null, '3引数(--dry-run): error=null');
  assert(result3.dryRun === true, '3引数(--dry-run): dryRun=true');

  // 異常系: 引数不足
  const result0 = parseCliArgs([]);
  assert(result0.error !== null, '0引数: errorあり');

  const result1 = parseCliArgs(['tickets.json']);
  assert(result1.error !== null, '1引数: errorあり');

  // 異常系: 不明なフラグ
  const resultBadFlag = parseCliArgs(['tickets.json', 'status.json', '--unknown']);
  assert(resultBadFlag.error !== null, '不明フラグ: errorあり');
}

// ============================================================
// テストランナー
// ============================================================

function runAllTests() {
  console.log('=== consolidate-phase-tickets.test.cjs ===');
  console.log('開始時刻: ' + new Date().toISOString());

  try { testGuardPhaseCount(); } catch (e) {
    failedCount++;
    console.error('  ❌ CRASH: ' + e.message);
    failures.push('[CRASH] testGuardPhaseCount: ' + e.message);
  }

  try { testValidateAllNodeIdsCovered(); } catch (e) {
    failedCount++;
    console.error('  ❌ CRASH: ' + e.message);
    failures.push('[CRASH] testValidateAllNodeIdsCovered: ' + e.message);
  }

  try { testConsolidateFromRight(); } catch (e) {
    failedCount++;
    console.error('  ❌ CRASH: ' + e.message);
    failures.push('[CRASH] testConsolidateFromRight: ' + e.message);
  }

  try { testRenumberPhaseIds(); } catch (e) {
    failedCount++;
    console.error('  ❌ CRASH: ' + e.message);
    failures.push('[CRASH] testRenumberPhaseIds: ' + e.message);
  }

  try { testRenumberTicketIds(); } catch (e) {
    failedCount++;
    console.error('  ❌ CRASH: ' + e.message);
    failures.push('[CRASH] testRenumberTicketIds: ' + e.message);
  }

  try { testFinalValidation(); } catch (e) {
    failedCount++;
    console.error('  ❌ CRASH: ' + e.message);
    failures.push('[CRASH] testFinalValidation: ' + e.message);
  }

  try { testRegenerateRelatedTicketIds(); } catch (e) {
    failedCount++;
    console.error('  ❌ CRASH: ' + e.message);
    failures.push('[CRASH] testRegenerateRelatedTicketIds: ' + e.message);
  }

  try { testUpdateStatusJson(); } catch (e) {
    failedCount++;
    console.error('  ❌ CRASH: ' + e.message);
    failures.push('[CRASH] testUpdateStatusJson: ' + e.message);
  }

  try { testParseCliArgs(); } catch (e) {
    failedCount++;
    console.error('  ❌ CRASH: ' + e.message);
    failures.push('[CRASH] testParseCliArgs: ' + e.message);
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
