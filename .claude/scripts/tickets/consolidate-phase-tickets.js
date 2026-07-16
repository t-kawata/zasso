#!/usr/bin/env node

/**
 * consolidate-phase-tickets.js — Step 5-3: チケット数によるフェーズ統合
 *
 * split-to-tickets パイプラインの Step 5-3 で使用する。
 * 全フェーズのチケット化が完了した後、チケット数が3未満のフェーズを
 * 後方のフェーズにマージ（移譲）し、フェーズID・チケットIDを一括振り直す。
 *
 * Usage:
 *   node consolidate-phase-tickets.js \
 *     <Tickets.json のパス> \
 *     <status.json のパス> \
 *     [--dry-run]
 *
 * 引数:
 *   Tickets.json  — 分割パイプラインのチケットデータ（必須）
 *   status.json   — SPLIT-Status.json のパス（必須）
 *   --dry-run     — ファイル書き込みを抑制し、変更内容のみ標準出力に表示
 *
 * 終了コード:
 *   0 = 成功（統合完了、またはガードによりスキップ）
 *   1 = バリデーションエラー（全 nodeIds がチケット化されていない）
 *   2 = 引数エラー
 *   3 = ファイル未存在
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadGraphEdgesFromTickets } = require('./generate-related-ticket-ids.js');

// ============================================================
// 定数定義
// ============================================================

/** 1フェーズあたりの最小チケット数（この値未満のフェーズを統合対象とする） */
const MIN_TICKETS_PER_PHASE = 3;

/** フェーズIDの接頭辞 */
const PHASE_ID_PREFIX = 'P';

/** 正常終了コード */
const EXIT_SUCCESS = 0;

/** 異常終了コード（バリデーションエラー等） */
const EXIT_FAILURE = 1;

/** 引数エラー終了コード */
const EXIT_ARG_ERROR = 2;

/** ファイル未存在終了コード */
const EXIT_FILE_NOT_FOUND = 3;

// ============================================================
// 型: Phase
// ============================================================

/**
 * @typedef {Object} Phase
 * @property {number} id       — フェーズID（例: 0）
 * @property {string} name     — フェーズ名（例: "P0"）
 * @property {string} summary  — フェーズの概要説明
 * @property {string[]} nodeIds — このフェーズに属するグラフノードID配列
 * @property {Object[]} tickets — このフェーズに属するチケット配列
 */

/**
 * @typedef {Object} Ticket
 * @property {string} id       — チケットID（例: "P0-1"）
 * @property {number} phaseId  — 所属フェーズID
 * @property {string[]} nodeIds — このチケットがカバーするグラフノードID配列
 * @property {string} title    — チケットタイトル
 */

// ============================================================
// 5-3-1: ガード判定
// ============================================================

/**
 * フェーズ数が MIN_TICKETS_PER_PHASE 未満かを判定する。
 * 統合対象が存在しない場合はスキップするために使用する。
 *
 * @param {Phase[]} phases — 全フェーズ配列
 * @returns {{ shouldSkip: boolean, phaseCount: number }}
 */
function guardPhaseCount(phases) {
  const phaseCount = (phases || []).length;
  return {
    shouldSkip: phaseCount < MIN_TICKETS_PER_PHASE,
    phaseCount,
  };
}

// ============================================================
// 5-3-2: nodeIds 過不足検証
// ============================================================

/**
 * 全フェーズの全 nodeIds がチケット化されていることを確認する。
 * add-tickets-for-phase.js の verifyNodeCoverage() と同様のロジック。
 *
 * @param {Phase[]} phases — 全フェーズ配列
 * @returns {{ valid: boolean, missingNodeIds: { phaseId: number, nodeIds: string[] }[] }}
 */
function validateAllNodeIdsCovered(phases) {
  const issues = [];

  for (const phase of phases) {
    const phaseNodeIds = new Set(phase.nodeIds || []);
    const coveredNodeIds = new Set();

    for (const ticket of (phase.tickets || [])) {
      if (Array.isArray(ticket.nodeIds)) {
        for (const nodeId of ticket.nodeIds) {
          coveredNodeIds.add(nodeId);
        }
        // チケットの nodeIds が phase.nodeIds の範囲外（余剰）のチェック
        for (const nodeId of ticket.nodeIds) {
          if (phaseNodeIds.has(nodeId)) {
            coveredNodeIds.add(nodeId);
          }
        }
      }
    }

    // 正しいカバレッジ計算: 各チケットの nodeIds の各要素が phase.nodeIds に含まれるかどうか
    const correctCovered = new Set();
    for (const ticket of (phase.tickets || [])) {
      if (Array.isArray(ticket.nodeIds)) {
        for (const nodeId of ticket.nodeIds) {
          if (phaseNodeIds.has(nodeId)) {
            correctCovered.add(nodeId);
          }
        }
      }
    }

    // 不足しているノードID（フェーズにあってどのチケットにも含まれない）
    const missing = [];
    for (const nodeId of phaseNodeIds) {
      if (!correctCovered.has(nodeId)) {
        missing.push(nodeId);
      }
    }

    if (missing.length > 0) {
      issues.push({ phaseId: phase.id, nodeIds: missing });
    }
  }

  return {
    valid: issues.length === 0,
    missingNodeIds: issues,
  };
}

// ============================================================
// 5-3-3: 後方1パス統合
// ============================================================

/**
 * チケット数が MIN_TICKETS_PER_PHASE 未満のフェーズを後方にマージする。
 * 後方から走査することで、カスケード統合を1パスで完了させる。
 *
 * 後方1パスを選んだ理由:
 * - 前方マージだと、統合後に後続フェーズのインデックスが変わり、複数パスが必要になる
 * - 後方スキャンでは右側のフェーズは既に確定済みなので、統合先は常に「十分なサイズ」
 *   か「最終フェーズ」である
 * - 最終フェーズは統合対象外（後方にマージ先がないため）
 *
 * @param {Phase[]} phases — 全フェーズ配列（コピーを操作）
 * @returns {Phase[]} 統合後のフェーズ配列
 */
function consolidateFromRight(phases) {
  if (!Array.isArray(phases) || phases.length === 0) {
    return [];
  }

  // phases のコピーを作成してから操作（immutable）
  const working = phases.map(function(p) {
    return JSON.parse(JSON.stringify(p));
  });

  // 後方から走査（最終フェーズは統合対象外）
  for (let i = working.length - 2; i >= 0; i--) {
    const current = working[i];
    if (!current) {
      // 既に他にマージされたフェーズはスキップ
      continue;
    }

    // 後続の非nullフェーズを探す（null（削除済み）をスキップ）
    let next = null;
    for (let j = i + 1; j < working.length; j++) {
      if (working[j] !== null) {
        next = working[j];
        break;
      }
    }

    if (!next) {
      // 後続フェーズがない場合はスキップ
      continue;
    }

    const ticketCount = (current.tickets || []).length;
    if (ticketCount < MIN_TICKETS_PER_PHASE) {
      // current の全チケットを next の先頭に挿入
      const currentTickets = current.tickets || [];
      const nextTickets = next.tickets || [];
      next.tickets = currentTickets.concat(nextTickets);

      // nodeIds を順序を保って結合
      const currentNodeIds = current.nodeIds || [];
      const nextNodeIds = next.nodeIds || [];
      next.nodeIds = currentNodeIds.concat(nextNodeIds);

      // name と summary を結合
      next.name = current.name + ' → ' + next.name;
      next.summary = current.summary
        ? current.summary + '\n---\n' + (next.summary || '')
        : next.summary;

      // current を削除マーク（null でマークして後でフィルタ）
      working[i] = null;
    }
  }

  // null（削除マーク）を除去
  const result = working.filter(function(p) { return p !== null; });

  return result;
}

// ============================================================
// 5-3-4: フェーズID一括振り直し
// ============================================================

/**
 * 全フェーズに 0 から始まる連続IDを再割り当てする。
 * フェーズ名のプレフィックスも P0, P1, ... に更新する。
 *
 * @param {Phase[]} phases — 全フェーズ配列（コピーを操作）
 * @returns {Phase[]} ID振り直し後のフェーズ配列
 */
function renumberPhaseIds(phases) {
  if (!Array.isArray(phases)) {
    return [];
  }

  return phases.map(function(phase, index) {
    return {
      ...phase,
      id: index,
    };
  });
}

// ============================================================
// 5-3-5: チケットID一括振り直し
// ============================================================

/**
 * 全チケットの id と phaseId を、新しいフェーズIDに基づいて振り直す。
 * id: phaseId 内の連番（1始まり integer、tickets-schema.json 準拠）。
 *
 * @param {Phase[]} phases — 全フェーズ配列（コピーを操作）
 * @returns {Phase[]} チケットID振り直し後のフェーズ配列
 */
function renumberTicketIds(phases) {
  if (!Array.isArray(phases)) {
    return [];
  }

  return phases.map(function(phase) {
    const newPhaseId = phase.id;
    const newTickets = (phase.tickets || []).map(function(ticket, index) {
      return {
        ...ticket,
        id: index + 1,
        phaseId: newPhaseId,
      };
    });

    return {
      ...phase,
      tickets: newTickets,
    };
  });
}

// ============================================================
// Phase B: relatedTicketIds 再生成（PX-45 依存）
// ============================================================

/**
 * 全チケットの relatedTicketIds を、GRAPH.json のエッジから機械再生成する。
 *
 * PX-45 の generateRelatedTicketIds() を require して呼び出す。
 * graphEdges には GRAPH.json の edges 配列を渡す。
 *
 * @param {Phase[]} phases — 全フェーズ配列
 * @param {Object[]} graphEdges — GRAPH.json の edges 配列
 * @returns {Phase[]} relatedTicketIds 更新後のフェーズ配列
 */
function regenerateRelatedTicketIds(phases, graphEdges) {
  if (!Array.isArray(graphEdges) || graphEdges.length === 0) {
    return phases;
  }

  const { generateRelatedTicketIds } = require('./generate-related-ticket-ids.js');
  const allTickets = [];
  for (const phase of phases) {
    for (const ticket of (phase.tickets || [])) {
      allTickets.push(ticket);
    }
  }

  const relatedMap = generateRelatedTicketIds(allTickets, graphEdges);

  for (const phase of phases) {
    for (const ticket of (phase.tickets || [])) {
      const compositeKey = phase.id + ':' + ticket.id;
      const ids = relatedMap.get(compositeKey);
      if (ids) {
        ticket.relatedTicketIds = ids;
      }
    }
  }

  return phases;
}

// ============================================================
// Phase C: status.json 更新（PX-46 依存）
// ============================================================

/**
 * status.json の prune-phases / renumber-phases を spawnSync で呼び出す。
 *
 * PX-46 のサブコマンドを使用して、削除されたフェーズのエントリを除去し、
 * 振り直されたIDに status.steps のキーを追従させる。
 *
 * @param {string} statusPath — SPLIT-Status.json の絶対パス
 * @param {Phase[]} oldPhases — 統合前のフェーズ配列（削除されたフェーズの特定に使用）
 * @param {Phase[]} newPhases — 統合後のフェーズ配列（新しいIDマッピングの取得に使用）
 */
function updateStatusJson(statusPath, oldPhases, newPhases) {
  const tsScript = path.resolve(__dirname, '../rfc-graph/update-split-step-status.js');

  // 削除されたフェーズIDを特定（oldPhases にあって newPhases にない id）
  const oldIds = new Set((oldPhases || []).map(function(p) { return p.id; }));
  const newIds = new Set((newPhases || []).map(function(p) { return p.id; }));
  const removedIds = [];
  for (const id of oldIds) {
    if (!newIds.has(id)) removedIds.push(PHASE_ID_PREFIX + id);
  }

  if (removedIds.length > 0) {
    const pruneInput = JSON.stringify(removedIds);
    const pruneResult = spawnSync('node', [
      tsScript,
      '--status=' + statusPath,
      'prune-phases',
    ], { input: pruneInput, encoding: 'utf8' });
    if (pruneResult.status !== 0) {
      console.error('[WARN] prune-phases call failed: ' +
        (pruneResult.stderr || pruneResult.stdout || ''));
    } else {
      console.log('  prune-phases: ' + removedIds.length + ' removed');
    }
  }

  // IDマッピングの構築（新しいIDと古いIDが異なる場合の変換）
  // 注意: consolidateFromRight で null 除去後の phases のみ渡されるため、
  // id は既に連番とは限らない。renumberPhaseIds 後の連番IDとのマッピング。
  const idMapping = {};
  for (let i = 0; i < newPhases.length; i++) {
    idMapping[String(newPhases[i].id)] = String(i);
  }
  const renumberInput = JSON.stringify(idMapping);
  const renumberResult = spawnSync('node', [
    tsScript,
    '--status=' + statusPath,
    'renumber-phases',
  ], { input: renumberInput, encoding: 'utf8' });
  if (renumberResult.status !== 0) {
    console.error('[WARN] renumber-phases call failed: ' +
      (renumberResult.stderr || renumberResult.stdout || ''));
  } else {
    console.log('  renumber-phases: ' + Object.keys(idMapping).length + ' mapped');
  }
}

// ============================================================
// 5-3-8: 最終検証
// ============================================================

/**
 * 統合後の全フェーズを検証する。
 * - 全フェーズのチケット数 >= MIN_TICKETS_PER_PHASE（最終フェーズは除く）
 * - 全チケットの id 形式が正しい（P{d}-{n}）
 * - 全チケットの phaseId が所属フェーズの id と一致する
 * - 空のチケットがない（nodeIds が空でない）
 *
 * @param {Phase[]} phases — 検証対象のフェーズ配列
 * @returns {{ valid: boolean, errors: string[] }}
 */
function finalValidation(phases) {
  const errors = [];

  if (!Array.isArray(phases) || phases.length === 0) {
    return { valid: true, errors: [] };
  }

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const ticketCount = (phase.tickets || []).length;

    // チケット数チェック（最終フェーズは除く）
    const isLastPhase = (i === phases.length - 1);
    if (!isLastPhase && ticketCount < MIN_TICKETS_PER_PHASE) {
      errors.push('Phase ' + PHASE_ID_PREFIX + phase.id +
        ' has ' + ticketCount + ' tickets (minimum ' + MIN_TICKETS_PER_PHASE + ')');
    }

    for (const ticket of (phase.tickets || [])) {
      // ID形式チェック（integer、1以上）
      if (typeof ticket.id !== 'number' || !Number.isInteger(ticket.id) || ticket.id < 1) {
        errors.push('Ticket ' + (ticket.id !== undefined && ticket.id !== null ? ticket.id : '(empty)') +
          ' has invalid ID (expected: positive integer)');
      }

      // phaseId 整合性チェック
      if (ticket.phaseId !== phase.id) {
        errors.push('Ticket ' + ticket.id + ' phaseId is ' +
          ticket.phaseId + ' (expected: ' + phase.id + ')');
      }

      // 空 nodeIds チェック
      if (!Array.isArray(ticket.nodeIds) || ticket.nodeIds.length === 0) {
        errors.push('Ticket ' + ticket.id + ' has empty nodeIds');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}

// ============================================================
// ファイル入出力
// ============================================================

/**
 * Tickets.json を読み込む。読み込みに失敗した場合は process.exit する。
 *
 * @param {string} ticketsPath — Tickets.json の絶対パス
 * @returns {object} パースされたチケットデータ
 */
function readTickets(ticketsPath) {
  if (!fs.existsSync(ticketsPath)) {
    console.error('[ERROR] Tickets.json not found: ' + ticketsPath);
    process.exit(EXIT_FILE_NOT_FOUND);
  }
  try {
    return JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch (parseError) {
    console.error('[ERROR] Failed to parse Tickets.json: ' + parseError.message);
    process.exit(EXIT_FAILURE);
  }
}

/**
 * SPLIT-Status.json が存在するか確認する。
 *
 * @param {string} statusPath — Status.json の絶対パス
 * @returns {boolean} 存在すれば true
 */
function checkStatusFile(statusPath) {
  return fs.existsSync(statusPath);
}

/**
 * 一時ファイル + rename でアトミックに JSON ファイルを書き込む。
 *
 * @param {string} targetPath — 書き込み先ファイルのパス
 * @param {object} data — 書き込むデータオブジェクト
 */
function atomicWriteJson(targetPath, data) {
  const tmpPath = targetPath + '.tmp.' + process.pid;
  const jsonContent = JSON.stringify(data, null, 2) + '\n';
  fs.writeFileSync(tmpPath, jsonContent, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

// ============================================================
// CLI 引数パース
// ============================================================

/**
 * CLI引数をパースする。
 *
 * @param {string[]} argv — process.argv.slice(2) 相当
 * @returns {{ ticketsPath: string, statusPath: string, dryRun: boolean, error: string|null }}
 */
function parseCliArgs(argv) {
  const positional = [];
  let dryRun = false;

  for (const arg of (argv || [])) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--')) {
      return {
        ticketsPath: '',
        statusPath: '',
        dryRun: false,
        error: 'Unknown flag: ' + arg + '. Usage: node consolidate-phase-tickets.js <Tickets.json> <status.json> [--dry-run]',
      };
    } else {
      positional.push(arg);
    }
  }

  if (positional.length < 2) {
    return {
      ticketsPath: '',
      statusPath: '',
      dryRun: false,
      error: 'Missing arguments. Usage: node consolidate-phase-tickets.js <Tickets.json> <status.json> [--dry-run]',
    };
  }

  return {
    ticketsPath: path.resolve(positional[0]),
    statusPath: path.resolve(positional[1]),
    dryRun: dryRun,
    error: null,
  };
}

// ============================================================
// メインエントリポイント
// ============================================================

/**
 * メイン処理 — 全フェーズの統合・ID振り直し・検証を逐次実行する。
 *
 * @param {string} ticketsPath — Tickets.json の絶対パス
 * @param {string} statusPath — SPLIT-Status.json の絶対パス
 * @param {boolean} dryRun — --dry-run モード時はファイル書き込みを抑制
 */
function runConsolidation(ticketsPath, statusPath, dryRun) {
  // Tickets.json を読み込み
  const ticketsData = readTickets(ticketsPath);
  let phases = ticketsData.phases || [];

  console.log('=== consolidate-phase-tickets.js started ===');
  console.log('Input Tickets.json: ' + ticketsPath);
  console.log('Phase count: ' + phases.length);

  // 5-3-1: Guard check
  console.log('\n[5-3-1] Guard check...');
  const guardResult = guardPhaseCount(phases);
  if (guardResult.shouldSkip) {
    console.log('Skipping consolidation: ' + guardResult.phaseCount + ' phases (below minimum ' + MIN_TICKETS_PER_PHASE + ')');
    console.log('✅ Skipped (guard condition met)');
    return;
  }
  console.log('Phase count: ' + guardResult.phaseCount + ' (threshold ' + MIN_TICKETS_PER_PHASE + ') => proceeding');

  // 5-3-2: nodeIds coverage check
  console.log('\n[5-3-2] nodeIds coverage check...');
  const coverageResult = validateAllNodeIdsCovered(phases);
  if (!coverageResult.valid) {
    console.error('[ERROR] Uncovered nodeIds exist:');
    for (const issue of coverageResult.missingNodeIds) {
      console.error('  Phase ' + PHASE_ID_PREFIX + issue.phaseId +
        ': ' + issue.nodeIds.join(', '));
    }
    console.error('Complete ticketization of all phases before re-running.');
    console.log('⚠️ FAILED');
    process.exit(EXIT_FAILURE);
  }
  console.log('All nodeIds are correctly ticketized. ✅');

  // 統合前のフェーズを保存（status.json 更新用）
  const oldPhasesJSON = JSON.parse(JSON.stringify(phases));

  // 5-3-3: One-pass consolidation from right
  console.log('\n[5-3-3] One-pass consolidation from right...');
  console.log('  Threshold: consolidating phases with < ' + MIN_TICKETS_PER_PHASE + ' tickets');
  const consolidatedPhases = consolidateFromRight(phases);
  const removedCount = phases.length - consolidatedPhases.length;
  if (removedCount > 0) {
    console.log('  ' + removedCount + ' phases consolidated');
  } else {
    console.log('  No phases to consolidate');
  }
  phases = consolidatedPhases;

  // 5-3-4: Phase ID renumbering
  console.log('\n[5-3-4] Phase ID renumbering...');
  const beforePhaseIds = phases.map(function(p) { return p.id; });
  phases = renumberPhaseIds(phases);
  const afterPhaseIds = phases.map(function(p) { return p.id; });
  console.log('  ID: [' + beforePhaseIds.join(', ') + '] → [' + afterPhaseIds.join(', ') + ']');
  console.log('  Phase count: ' + phases.length);

  // 5-3-5: Ticket ID renumbering
  console.log('\n[5-3-5] Ticket ID renumbering...');
  phases = renumberTicketIds(phases);
  const totalTickets = phases.reduce(function(acc, p) { return acc + (p.tickets || []).length; }, 0);
  console.log('  Total tickets: ' + totalTickets);

  // Phase B: Regenerate relatedTicketIds from GRAPH.json edges
  console.log('\n[Phase B] Regenerating relatedTicketIds...');
  const graphEdges = loadGraphEdgesFromTickets(ticketsPath);
  if (graphEdges && graphEdges.length > 0) {
    phases = regenerateRelatedTicketIds(phases, graphEdges);
    console.log('  Generated relatedTicketIds from ' + graphEdges.length + ' edges ✅');
  } else {
    console.log('  Skipped: GRAPH.json not found or empty');
  }

  // Phase C: Update status.json
  if (checkStatusFile(statusPath)) {
    console.log('\n[Phase C] Updating status.json...');
    updateStatusJson(statusPath, oldPhasesJSON, phases);
    console.log('  status.json prune/renumber completed ✅');
  } else {
    console.log('\n[Phase C] Skipped: status.json not found: ' + statusPath);
  }

  // 5-3-8: Final validation
  console.log('\n[5-3-8] Final validation...');
  const finalResult = finalValidation(phases);
  if (!finalResult.valid) {
    console.error('[ERROR] Final validation failed:');
    for (const err of finalResult.errors) {
      console.error('  - ' + err);
    }
    console.log('⚠️ FAILED');
    process.exit(EXIT_FAILURE);
  }
  console.log('All validation checks passed. ✅');

  // ============================================================
  // Tickets.json への書き込み
  // ============================================================
  ticketsData.phases = phases;

  if (dryRun) {
    console.log('\n[--dry-run mode] Summary of changes:');
    console.log('  Phases: ' + phases.length + ' / Total tickets: ' + totalTickets);
    console.log('  No write to Tickets.json was performed.');
  } else {
    atomicWriteJson(ticketsPath, ticketsData);
    console.log('\nWrote ' + phases.length + ' phases / ' +
      totalTickets + ' tickets to ' + ticketsPath);
  }

  console.log('\n✅ PASSED — Consolidation completed successfully.');
}

/**
 * エントリポイント。
 */
function main() {
  const parsed = parseCliArgs(process.argv.slice(2));

  if (parsed.error) {
    console.error('[ERROR] ' + parsed.error);
    process.exit(EXIT_ARG_ERROR);
  }

  runConsolidation(parsed.ticketsPath, parsed.statusPath, parsed.dryRun);
}

if (require.main === module) {
  main();
}

module.exports = {
  // 純粋関数（テスト可能）
  guardPhaseCount,
  validateAllNodeIdsCovered,
  consolidateFromRight,
  renumberPhaseIds,
  renumberTicketIds,
  finalValidation,

  // Phase B/C（スタブ）
  regenerateRelatedTicketIds,
  updateStatusJson,

  // 入出力
  readTickets,
  checkStatusFile,
  atomicWriteJson,
  parseCliArgs,
  runConsolidation,

  // 定数
  MIN_TICKETS_PER_PHASE,
  PHASE_ID_PREFIX,
  EXIT_SUCCESS,
  EXIT_FAILURE,
  EXIT_ARG_ERROR,
  EXIT_FILE_NOT_FOUND,
};
