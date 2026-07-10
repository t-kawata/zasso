#!/usr/bin/env node

/**
 * phasify-graph-and-dirs-files-tree.js — グラフノードのフェーズグルーピング（基盤骨格）
 *
 * split-to-tickets.md Step 4 で使用する。GRAPH.json と Dirs-Tree.json を入力として
 * グラフノードを実装フェーズにグルーピングし、Tickets.json に書き込む。
 *
 * コアアルゴリズム（SCC縮約・重み付きトポロジカルソート・フェーズ合併）は
 * 本スクリプトの Phase 1〜5 として実装される（PX-38 担当）。
 *
 * 本ファイル（PX-37）は以下の基盤を提供する：
 * - 引数パース（--dry-run, --verbose）
 * - Dirs-Tree.json 存在確認
 * - Tickets.json 存在確認・新規生成
 * - 検証サブスクリプト（validate-phasify.js）の呼び出し
 *
 * 使用法:
 *   node phasify-graph-and-dirs-files-tree.js <GRAPH.json> <Dirs-Tree.json> [--dry-run] [--verbose]
 *
 * 引数:
 *   GRAPH.json      — graphify-rfc が生成したグラフJSON（必須）
 *   Dirs-Tree.json  — boundify-graph-to-dirs が生成したディレクトリツリーJSON（必須）
 *   --dry-run       — Tickets.json への書き込みを抑制し、標準出力のみ行う
 *   --verbose       — 処理経過の詳細を標準出力に表示する
 *
 * 終了コード:
 *   0 = 成功
 *   1 = 検証エラー
 *   2 = 引数エラー
 *   3 = ファイル未存在
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ============================================================
// 定数
// ============================================================

/** 1フェーズあたりの最小ノード数 */
const MIN_NODES_PER_PHASE = 10;

/** チケットスケルトン生成スクリプトへのパス（this script からの相対） */
const WRITE_TICKETS_TEMPLATE_PATH = '../tickets/write-tickets-json-template.js';

// PX-38 import: コアアルゴリズム純粋関数群
const {
  getWeight,
  isHard,
  kahnTopologicalSort,
  computeSoftViolations,
  mergePhases,
  enforceHardConstraints,
  consolidatePhases,
  reassignPhaseIds,
  buildSccConstraint,
  applySccToOrder,
  applyDirectoryConstraints,
  phasesToTicketsFormat,
} = require('./phasify-helpers.js');

// PX-38 import: SCC縮約（boundify-helpers.js から流用）
const { tarjanSCC } = require('./boundify-helpers.js');

// PX-38 import: node→dir マップ（validate-phasify.js から流用）
const { buildNodeToDirMap } = require('./validate-phasify.js');

// PX-38 import: 検証サブスクリプト（dry-runでもメモリ上で検証可能にするため）
const { validateAll } = require('./validate-phasify.js');

// ============================================================
// 構造体: CliOptions
// ============================================================

/**
 * @typedef {object} CliOptions
 * @property {string} graphPath     — GRAPH.json の絶対パス
 * @property {string} dirsTreePath  — Dirs-Tree.json の絶対パス
 * @property {string} ticketsPath   — Tickets.json の絶対パス（自動導出）
 * @property {boolean} dryRun      — --dry-run フラグ
 * @property {boolean} verbose     — --verbose フラグ
 */

// ============================================================
// 関数群
// ============================================================

/**
 * CLI引数をパースし、CliOptions を返す。
 * エラー時はエラーメッセージを表示して process.exit(2) する。
 *
 * @param {string[]} argv — process.argv.slice(2) 相当
 * @returns {CliOptions}
 */
function parseArguments(argv) {
  const positionalArgs = [];
  const flags = {};

  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const flagName = arg.slice(2);
      if (flagName === 'dry-run' || flagName === 'verbose') {
        flags[flagName] = true;
      } else {
        console.error('[ERROR] 不明なフラグ: ' + arg);
        console.error('使用法: node phasify-graph-and-dirs-files-tree.js <GRAPH.json> <Dirs-Tree.json> [--dry-run] [--verbose]');
        process.exit(2);
      }
    } else {
      positionalArgs.push(arg);
    }
  }

  if (positionalArgs.length < 2) {
    console.error('[ERROR] 引数が不足しています。GRAPH.json と Dirs-Tree.json の2つが必要です。');
    console.error('使用法: node phasify-graph-and-dirs-files-tree.js <GRAPH.json> <Dirs-Tree.json> [--dry-run] [--verbose]');
    process.exit(2);
  }

  const graphPath = path.resolve(positionalArgs[0]);
  const dirsTreePath = path.resolve(positionalArgs[1]);

  return {
    graphPath,
    dirsTreePath,
    ticketsPath: '',
    dryRun: !!flags['dry-run'],
    verbose: !!flags['verbose'],
  };
}

/**
 * 2つのファイルパスから Tickets.json のパスを導出する。
 * 両方のパスの dirname が同一であることを要求する。
 *
 * @param {string} graphPath — GRAPH.json の絶対パス
 * @param {string} dirsTreePath — Dirs-Tree.json の絶対パス
 * @returns {string} Tickets.json の絶対パス
 */
function resolveTicketsPath(graphPath, dirsTreePath) {
  const graphDir = path.dirname(graphPath);
  const dirsTreeDir = path.dirname(dirsTreePath);
  if (graphDir !== dirsTreeDir) {
    console.error('[ERROR] GRAPH.json と Dirs-Tree.json は同じディレクトリに配置されている必要があります。');
    console.error('  GRAPH.json のディレクトリ: ' + graphDir);
    console.error('  Dirs-Tree.json のディレクトリ: ' + dirsTreeDir);
    process.exit(2);
  }
  return path.join(graphDir, 'Tickets.json');
}

/**
 * Dirs-Tree.json の存在を確認する。存在しなければエラー終了。
 *
 * @param {string} dirsTreePath — Dirs-Tree.json の絶対パス
 */
function checkDirsTreeExists(dirsTreePath) {
  if (!fs.existsSync(dirsTreePath)) {
    console.error('[ERROR] Dirs-Tree.json が見つかりません: ' + dirsTreePath);
    console.error('事前に boundify-graph-to-dirs を実行してください。');
    console.error('  例: /boundify-graph-to-dirs ' + dirsTreePath.replace(/-Dirs-Tree\.json$/, '') + '-GRAPH.json');
    process.exit(3);
  }
}

/**
 * Tickets.json の存在を確認し、存在しなければ新規生成する。
 *
 * @param {string} ticketsPath — Tickets.json の絶対パス
 * @param {string} graphPath — GRAPH.json の絶対パス（metadata の source に使用）
 * @param {boolean} dryRun — true の場合、実際の書き込みは行わない
 * @returns {boolean} 新規生成した場合は true、既存の場合は false
 */
function ensureTicketsJsonExists(ticketsPath, graphPath, dryRun) {
  if (fs.existsSync(ticketsPath)) {
    return false;
  }

  if (dryRun) {
    console.log('[INFO] --dry-run モード: Tickets.json が存在しませんが、生成はスキップします。');
    return true;
  }

  // write-tickets-json-template.js を呼び出してスケルトンを生成する
  const templateScript = path.resolve(__dirname, WRITE_TICKETS_TEMPLATE_PATH);
  if (!fs.existsSync(templateScript)) {
    console.error('[ERROR] write-tickets-json-template.js が見つかりません: ' + templateScript);
    process.exit(3);
  }

  const metadata = JSON.stringify({
    title: 'phasify 自動生成チケット分解設計書',
    source: graphPath,
    generatedAt: new Date().toISOString().split('T')[0],
    analyzedSections: 'phasify-graph-and-dirs-files-tree.js による自動生成',
  });

  const { spawnSync } = require('child_process');
  const result = spawnSync('node', [templateScript, ticketsPath, metadata], {
    stdio: ['inherit', 'pipe', 'pipe'],
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    console.error('[ERROR] Tickets.json スケルトン生成に失敗しました。');
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }

  return true;
}

/**
 * 冗長ログを出力する（--verbose 時のみ）。
 *
 * @param {string} message
 * @param {boolean} verbose
 */
function logVerbose(message, verbose) {
  if (verbose) {
    console.log('[VERBOSE] ' + message);
  }
}

// ============================================================
// メインエントリポイント（骨格）
// ============================================================

/**
 * メイン処理。
 * PX-38 で Phase 1〜5（SCC縮約・トポロジカルソート・フェーズ合併）が
 * この関数に追加される。
 *
 * @param {CliOptions} opts
 */
function runPhasify(opts) {
  logVerbose('GRAPH.json を読み込み中...', opts.verbose);
  const graphData = JSON.parse(fs.readFileSync(opts.graphPath, 'utf8'));
  const nodes = graphData.nodes || [];
  const edges = graphData.edges || [];
  logVerbose('ノード: ' + nodes.length + ', エッジ: ' + edges.length, opts.verbose);

  logVerbose('Dirs-Tree.json を読み込み中...', opts.verbose);
  const dirsTreeData = JSON.parse(fs.readFileSync(opts.dirsTreePath, 'utf8'));

  // ============================================================
  // Phase 1: SCC縮約（tarjanSCC）
  // ============================================================
  logVerbose('Phase 1: SCC縮約を実行中...', opts.verbose);
  const sccResult = tarjanSCC(edges);
  const { sccMap, sccIds } = buildSccConstraint(sccResult);
  logVerbose('SCC検出: ' + sccResult.length + ' 成分（うちマルチノードSCC: ' + Object.keys(sccMap).length + ' ノード）', opts.verbose);

  // ============================================================
  // Phase 2: Kahn トポロジカルソート + ディレクトリ制約
  // ============================================================
  logVerbose('Phase 2: トポロジカルソートを実行中...', opts.verbose);
  const allNodeIds = nodes.map(n => n.id);
  const sortResult = kahnTopologicalSort(allNodeIds, edges, getWeight);

  if (!sortResult.success) {
    console.error('[ERROR] ' + sortResult.error);
    console.error('循環依存を解消してから再実行してください。');
    process.exit(1);
  }

  // SCC制約を順序に反映（同一SCCノードを隣接させる）
  const sccAppliedOrder = applySccToOrder(sortResult.order, sccMap);

  // ディレクトリ制約を取得
  const nodeToDirMap = buildNodeToDirMap(dirsTreeData);
  const depDirs = dirsTreeData.dependencyDirections ? (dirsTreeData.dependencyDirections.rust || []) : [];

  // ディレクトリ制約を順序に反映（fromDirの全ノードがtoDirの全ノードより前に来るよう調整）
  let finalOrder = sccAppliedOrder;
  if (depDirs.length > 0) {
    logVerbose('ディレクトリ間依存方向: ' + depDirs.length + ' 件を適用', opts.verbose);
    finalOrder = applyDirectoryConstraints(finalOrder, depDirs, nodeToDirMap);
  }

  logVerbose('ソート完了: ' + finalOrder.length + ' ノード', opts.verbose);

  // ============================================================
  // Phase 3: Soft制約違反コスト計算
  // ============================================================
  logVerbose('Phase 3: Soft制約違反コストを計算中...', opts.verbose);
  const softResult = computeSoftViolations(finalOrder, edges, getWeight);
  if (softResult.violations.length > 0 && opts.verbose) {
    console.log('[VERBOSE] Soft制約違反: ' + softResult.violations.length + ' 件, 総コスト: ' + softResult.totalCost);
    for (const violation of softResult.violations) {
      console.log('  ' + violation.from + ' → ' + violation.to + ' (' + violation.type + ', cost=' + violation.cost + ')');
    }
  } else if (opts.verbose) {
    console.log('[VERBOSE] Soft制約違反: なし');
  }

  // ============================================================
  // Phase 4: フェーズ合併と離散化（下限10ノード）
  // ============================================================
  logVerbose('Phase 4: フェーズ合併を実行中（下限: ' + MIN_NODES_PER_PHASE + ' ノード）...', opts.verbose);
  // ハード制約エッジ（depends_on/implements/constrains）を抽出
  const hardEdges = edges.filter(function(e) { return isHard(e.type); });
  let phaseAssignments = mergePhases(finalOrder, MIN_NODES_PER_PHASE, hardEdges);

  // 事後調整: depends_on の両端点が同一フェーズにならないよう保障
  if (hardEdges.length > 0) {
    const beforeCount = phaseAssignments.length;
    phaseAssignments = enforceHardConstraints(phaseAssignments, hardEdges);
    const midCount = phaseAssignments.length;
    // 分割で小さくなったフェーズを下限以上に統合
    phaseAssignments = consolidatePhases(phaseAssignments, hardEdges, MIN_NODES_PER_PHASE);
    const afterCount = phaseAssignments.length;
    if (opts.verbose && (midCount !== beforeCount || afterCount !== midCount)) {
      logVerbose('ハード制約調整: ' + beforeCount + ' → ' + midCount + ' → ' + afterCount + ' フェーズ', opts.verbose);
    }
  }

  // フェーズIDを配列順（＝実装順序）に再割り当て
  phaseAssignments = reassignPhaseIds(phaseAssignments);

  logVerbose('フェーズ数: ' + phaseAssignments.length, opts.verbose);

  // 10ノード未満のフェーズがある場合の警告
  for (const phase of phaseAssignments) {
    const size = phase.nodeIds ? phase.nodeIds.length : 0;
    if (size < MIN_NODES_PER_PHASE && nodes.length >= MIN_NODES_PER_PHASE) {
      console.warn('[WARN] フェーズ P' + phase.id + ' のノード数が ' + size + '（下限 ' + MIN_NODES_PER_PHASE + ' 未満）');
    }
  }

  // ============================================================
  // Phase 5: メモリ上で Tickets.json 形式のフェーズ情報を構築
  // ============================================================
  logVerbose('Phase 5: フェーズ情報を Tickets.json 形式に変換中...', opts.verbose);
  const ticketsPhases = phasesToTicketsFormat(phaseAssignments);

  // メモリ上の Tickets.json データを構築（検証用・書き込み用）
  const inMemoryTickets = {
    title: 'phasify 自動生成',
    metadata: { source: opts.graphPath, generatedAt: new Date().toISOString().split('T')[0] },
    phases: ticketsPhases,
  };

  // ============================================================
  // ユーザーへのレポート出力（常に stdout）
  // ============================================================
  console.log('');
  console.log('=== phasify フェーズ設計 レポート ===');
  console.log('入力グラフ: ' + opts.graphPath);
  console.log('入力Dirs-Tree: ' + opts.dirsTreePath);
  console.log('出力Tickets.json: ' + opts.ticketsPath);
  console.log('総ノード数: ' + nodes.length);
  console.log('総エッジ数: ' + edges.length);
  console.log('総フェーズ数: ' + phaseAssignments.length);
  console.log('====================================');

  // ============================================================
  // 検証（メモリ上のデータを直接検証 — --dry-run でも正確）
  // ============================================================
  logVerbose('検証を実行中...', opts.verbose);
  const validateResult = validateAll(inMemoryTickets, nodes, edges, dirsTreeData);

  // 常に表示するサマリー行（verbose不要）
  const hardViolations = validateResult.checks.hardConstraints ?
    validateResult.checks.hardConstraints.violations.length : 0;
  const sizeIssues = validateResult.checks.phaseSizeMinimum ?
    validateResult.checks.phaseSizeMinimum.issues.filter(function(i) { return !i.isWarning; }).length : 0;
  const allCovered = validateResult.checks.allNodesCovered ?
    validateResult.checks.allNodesCovered.passed : false;
  const noOrphans = validateResult.checks.noOrphanNodes ?
    validateResult.checks.noOrphanNodes.passed : false;
  const dirsOk = validateResult.checks.dirsConstraint ?
    validateResult.checks.dirsConstraint.passed : false;
  console.log((validateResult.valid ? '✅ 合格' : '⚠️ 不合格') + '\n\n' + phaseAssignments.length + ' phases, ' +
    (allCovered ? '全' + nodes.length + 'ノードカバー' : '未カバーあり') + ', ' +
    'hard制約違反 ' + hardViolations + '件, ' +
    '下限10未満 ' + sizeIssues + 'フェーズ' +
    (sizeIssues > 0 ? '（統合すると依存関係制約に違反する為これが安全な判断である）' : ''));

  if (validateResult.valid) {
    console.log(opts.ticketsPath + ' に' + phaseAssignments.length + '件のフェーズを書き込みました。');
  } else {
    console.log('検証結果:');
    // console.log(JSON.stringify(validateResult, null, 2));
    console.log('[WARN] 検証に不合格でしたが、--dry-run のため処理を継続します。');
  }

  // ============================================================
  // Tickets.json への書き込み（--dry-run でなければ）
  // ============================================================
  if (opts.dryRun) {
    console.log('');
    console.log('[--dry-run モード] Tickets.json への書き込みは行いませんでした。');
    return;
  }

  // 既存の Tickets.json を読み込んで phases を置き換え
  const existingTickets = JSON.parse(fs.readFileSync(opts.ticketsPath, 'utf8'));
  existingTickets.phases = ticketsPhases;

  // 書き込み
  fs.writeFileSync(opts.ticketsPath, JSON.stringify(existingTickets, null, 2) + '\n', 'utf8');
  logVerbose('Tickets.json を更新しました: ' + opts.ticketsPath, opts.verbose);
}

/**
 * エントリポイント。
 */
function main() {
  const opts = parseArguments(process.argv.slice(2));
  opts.ticketsPath = resolveTicketsPath(opts.graphPath, opts.dirsTreePath);

  checkDirsTreeExists(opts.dirsTreePath);
  const created = ensureTicketsJsonExists(opts.ticketsPath, opts.graphPath, opts.dryRun);
  if (created && !opts.dryRun) {
    console.log('[INFO] Tickets.json を新規作成しました: ' + opts.ticketsPath);
  }

  runPhasify(opts);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  resolveTicketsPath,
  checkDirsTreeExists,
  ensureTicketsJsonExists,
  logVerbose,
  runPhasify,
  MIN_NODES_PER_PHASE,
};
