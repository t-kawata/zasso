#!/usr/bin/env node

/**
 * update-split-step-status.js — SPLIT-Status.json 管理（6サブコマンド）
 *
 * /split-to-tickets スラッシュコマンドの進行状態を管理する。
 * SPLIT-Status.json に対して以下の6操作を提供する：
 * - start-step  <N>  : Step N を開始する
 * - end-step    <N>  : Step N を正常終了する
 * - fail-step   <N>  : Step N を異常終了する
 * - reset-to-step <N>: Step N に復帰する（N+1 以降を pending に戻す）
 * - status           : 現在の状態を出力する
 * - cleanup          : 既知の一時ファイルを全て削除する（冪等）
 * - backup           : graphFile の .bak ファイルを作成する
 *
 * 全書き込みは一時ファイル + rename のアトミック書込（atomicWrite）で行われ、
 * プロセス異常終了時に元ファイルが破損することはない。
 *
 * 本スクリプトは /split-to-tickets 専用。Step範囲は 0〜9。
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 定数定義
// ============================================================

/** 最小のStep番号（Step 0: 見出し重複排除） */
const MIN_STEP = 0;

/** 最大のStep番号（split-to-tickets はStep 0〜9 の10Step構成） */
const MAX_STEP = 9;

/** 認容されるサブコマンド名の配列 */
const ALLOWED_SUBCOMMANDS = [
  'start-step',
  'end-step',
  'fail-step',
  'reset-to-step',
  'status',
  'cleanup',
  'backup',
];

/** プライマリフラグ: GRAPHIFY-Status.json のパス指定 */
const FLAG_GRAPHIFY_STATUS = '--graphify-status=';

/** エイリアスフラグ: --graphify-status= のエイリアス、split-to-tickets でも汎用的に使用 */
const FLAG_ALIAS_STATUS = '--status=';

/** Stepの状態: 未着手 */
const STATUS_PENDING = 'pending';

/** Stepの状態: 実行中 */
const STATUS_RUNNING = 'running';

/** Stepの状態: 完了 */
const STATUS_DONE = 'done';

/** Stepの状態: 異常終了 */
const STATUS_ERROR = 'error';

/** 内部Step番号と表示ラベルの対応マップ（update-split-step-status.js 専用） */
const STEP_LABELS = {
  0: '0-1. 初期化',
  1: '0-2. RFC読込',
  2: '1. I/O境界参考情報',
  3: '2. グラフ構造確認',
  4: '3. boundify確認',
  5: '4-1. phasify',
  6: '4-2. フェーズ名・サマリー書き込み',
  7: '5-1. ノード詳細表示',
  8: '5-2. チケット化',
  9: '6. チェックリスト',
};

/**
 * Step番号に対応する表示ラベルを返す。
 * 明示的なラベルが指定された場合はそちらを優先し、なければ STEP_LABELS マップから取得する。
 * マップにない場合は "Step N" の汎用形式を返す。
 *
 * @param {number} n — Step番号
 * @param {string|null} explicitLabel — CLIから明示指定されたラベル（省略可）
 * @returns {string} 表示用ラベル
 */
function resolveStepLabel(n, explicitLabel) {
  if (explicitLabel) return explicitLabel;
  if (STEP_LABELS[n]) return STEP_LABELS[n];
  return 'Step ' + n;
}

// ============================================================
// 型: StatusData
// ============================================================

/**
 * GRAPHIFY-Status.json のデータ構造
 *
 * @typedef {Object} StatusData
 * @property {string} sourceFile — グラフ化対象のソースファイルパス
 * @property {string} graphFile — 出力先グラフファイルパス
 * @property {number} currentStep — 現在の進行Step番号
 * @property {Object<string, string>} steps — Step0〜9の状態マップ（キーは文字列 "0"〜"9"）
 */

// ============================================================
// コア関数
// ============================================================

/**
 * コマンドライン引数をパースする
 *
 * @returns {{ statusPath: string, subcommand: string, stepNumber: number|null, stepLabel: string|null }}
 * @throws {Error} 引数が不正な場合
 */
function parseArguments() {
  const args = process.argv.slice(2);

  // --help オプション
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(0);
  }

  // 最小引数: --graphify-status=<path> subcommand [N]
  if (args.length < 2) {
    throw new Error(
      '引数が不足しています。\n' +
      '  Usage: update-split-step-status.js --graphify-status=<path>|--status=<path> <subcommand> [N] ["Stepラベル"]'
    );
  }

  // --graphify-status=<path> または --status=<path> のパース
  const statusFlag = args[0];
  if (!statusFlag.startsWith(FLAG_GRAPHIFY_STATUS) && !statusFlag.startsWith(FLAG_ALIAS_STATUS)) {
    throw new Error(
      '最初の引数は --graphify-status=<path> または --status=<path> である必要があります。\n' +
      `  実際の値: ${statusFlag}`
    );
  }
  const statusPath = statusFlag.split('=', 2)[1];
  if (!statusPath) {
    throw new Error(
      'パスが空です。--graphify-status=<path> または --status=<path> の <path> に有効なパスを指定してください。'
    );
  }

  const subcommand = args[1];

  // サブコマンドの検証
  if (!ALLOWED_SUBCOMMANDS.includes(subcommand)) {
    throw new Error(
      `未知のサブコマンドです: ${subcommand}`
    );
  }

  // step-number の読み取り（status / cleanup / backup 以外は必須）
  let stepNumber = null;
  let stepLabel = null;
  if (subcommand !== 'status' && subcommand !== 'cleanup' && subcommand !== 'backup') {
    if (args.length < 3) {
      throw new Error(
        `サブコマンド "${subcommand}" には Step番号が必要です。`
      );
    }
    stepNumber = parseInt(args[2], 10);
    if (isNaN(stepNumber)) {
      throw new Error(
        `Step番号が数値ではありません: ${args[2]}`
      );
    }
    // 第4引数に Stepラベル（省略可）
    stepLabel = args[3] || null;
  }

  return { statusPath, subcommand, stepNumber, stepLabel };
}

/**
 * GRAPHIFY-Status.json を読み込む。ファイルが存在しない場合はデフォルト状態を返す。
 *
 * @param {string} statusPath — ステータスファイルのパス
 * @returns {StatusData} パースされたステータスデータ
 */
function readStatus(statusPath) {
  if (!fs.existsSync(statusPath)) {
    return createDefaultStatus(statusPath);
  }

  const raw = fs.readFileSync(statusPath, 'utf8');
  const data = JSON.parse(raw);

  // 読み込みデータの簡易検証（必須フィールドの存在確認）
  if (!data.sourceFile || !data.graphFile || typeof data.currentStep !== 'number' || !data.steps) {
    throw new Error(
      `${statusPath} の形式が不正です。sourceFile / graphFile / currentStep / steps が必要です。`
    );
  }

  return data;
}

/**
 * デフォルトのステータスデータを生成する
 *
 * ファイル名のサフィックスから basename を抽出し、sourceFile（.md）と graphFile（-GRAPH.json）を逆算する。
 * 対応サフィックス:
 *   - GRAPHIFY: *-GRAPHIFY-Status.json → basename から -GRAPHIFY は除去されない（正しく逆算するため）
 *   - SPLIT: *-SPLIT-Status.json → basename から -SPLIT は除去されない
 *
 * @param {string} statusPath — ステータスファイルのパス
 * @returns {StatusData} デフォルト状態
 */
function createDefaultStatus(statusPath) {
  const dir = path.dirname(statusPath);
  const filename = path.basename(statusPath);

  // ファイル名から既知のサフィックスを除去して basename を得る
  const GRAPHIFY_SUFFIX = '-GRAPHIFY-Status.json';
  const SPLIT_SUFFIX = '-SPLIT-Status.json';
  let basename = filename;
  if (filename.endsWith(GRAPHIFY_SUFFIX)) {
    basename = filename.slice(0, -GRAPHIFY_SUFFIX.length);
  } else if (filename.endsWith(SPLIT_SUFFIX)) {
    basename = filename.slice(0, -SPLIT_SUFFIX.length);
  }

  // sourceFile: basename から元のソースファイルパスを逆算する
  const sourceFile = path.resolve(dir, basename + '.md');
  const graphFile = path.resolve(dir, basename + '-GRAPH.json');

  const steps = {};
  for (let i = MIN_STEP; i <= MAX_STEP; i++) {
    steps[String(i)] = STATUS_PENDING;
  }

  return {
    sourceFile,
    graphFile,
    currentStep: MIN_STEP,
    steps,
  };
}

/**
 * Step番号が 1〜5 の範囲内か検証する
 *
 * @param {number} n — 検証対象のStep番号
 * @returns {boolean} 有効なStep番号なら true
 */
function validateStepNumber(n) {
  return Number.isInteger(n) && n >= MIN_STEP && n <= MAX_STEP;
}

/**
 * start-step <N>: Step N を開始状態に設定する
 *
 * @param {StatusData} status — 更新対象のステータスデータ
 * @param {number} n — 開始するStep番号
 * @param {string|null} [label] — メッセージに使用するStepラベル（省略時は "Step N"）
 */
function executeStartStep(status, n, label) {
  status.steps[String(n)] = STATUS_RUNNING;
  status.currentStep = n;
  const stepName = resolveStepLabel(n, label);
  console.log(`${stepName} を開始しました。状態: ${STATUS_RUNNING}。`);
}

/**
 * end-step <N>: Step N を正常終了状態に設定する
 *
 * 完了後、currentStep は N+1 に進む。
 * MAX_STEP 完了時は currentStep が MAX_STEP+1 になる（全Step完了を示す）。
 *
 * @param {StatusData} status — 更新対象のステータスデータ
 * @param {number} n — 終了するStep番号
 * @param {string|null} [label] — メッセージに使用するStepラベル（省略時は STEP_LABELS マップ優先）
 */
function executeEndStep(status, n, label) {
  status.steps[String(n)] = STATUS_DONE;
  status.currentStep = n + 1;
  const stepName = resolveStepLabel(n, label);
  if (n >= MAX_STEP) {
    console.log(`${stepName} が完了しました。全Stepが完了しました。`);
  } else {
    const nextName = resolveStepLabel(n + 1);
    console.log(`${stepName} が完了しました。状態: ${STATUS_DONE}。次に ${nextName} を実行してください。`);
  }
}

/**
 * fail-step <N>: Step N を異常終了状態に設定する
 *
 * currentStep は変更しない（現在位置を維持して再開可能にする）。
 *
 * @param {StatusData} status — 更新対象のステータスデータ
 * @param {number} n — 異常終了したStep番号
 */
function executeFailStep(status, n, label) {
  status.steps[String(n)] = STATUS_ERROR;
  const stepName = resolveStepLabel(n, label);
  console.log(`${stepName} が異常終了しました。状態: ${STATUS_ERROR}。currentStep は ${status.currentStep} のままです。エラーメッセージを確認して修正した上で、reset-to-step ${n} で再実行してください。`);
}

/**
 * reset-to-step <N>: Step N に復帰する
 *
 * N より大きい全Step（N+1 〜 5）を pending に戻す。
 * N 自身のステータスは変更しない（N の内容を保持したまま再実行可能にする）。
 *
 * @param {StatusData} status — 更新対象のステータスデータ
 * @param {number} n — 復帰先のStep番号
 */
function executeResetToStep(status, n, label) {
  for (let i = n + 1; i <= MAX_STEP; i++) {
    status.steps[String(i)] = STATUS_PENDING;
  }
  status.currentStep = n;
  const stepName = resolveStepLabel(n, label);
  console.log(`${stepName} に復帰しました。${stepName} より後のStepを pending にリセットしました。${stepName} のコマンドを最初から再実行してください。`);
}

/**
 * status: 現在のステータスデータを整形JSONとして標準出力に出力する
 *
 * @param {StatusData} status — 出力対象のステータスデータ
 */
function executeStatus(status) {
  console.log(JSON.stringify(status, null, 2));
}

/**
 * cleanup: 既知の一時ファイルを全て削除する（冪等）
 *
 * 削除対象:
 * - $graphFile.bak（graphFile と同じディレクトリ）
 * - CWD 配下の _temp_nodes.json / _temp_edges.json / _patch.json
 *   / _remove_edges.json / _add_edges.json
 *
 * 本関数は冪等である。何度実行しても安全で、ファイルが存在しない場合は
 * 何も削除せず正常終了する。
 *
 * @param {StatusData} status — ステータスデータ（graphFile の取得に使用）
 */
function executeCleanup(status) {
  const removed = [];

  // .bak ファイル（グラフファイルと同じディレクトリ）
  const bakPath = status.graphFile + '.bak';
  try {
    if (fs.existsSync(bakPath)) {
      fs.unlinkSync(bakPath);
      removed.push(bakPath);
    }
  } catch (_) { /* 削除競合など — 無視して続行 */ }

  // CWD の一時ファイル
  const cwd = process.cwd();
  const tempFiles = [
    '_temp_nodes.json',
    '_temp_edges.json',
    '_patch.json',
    '_remove_edges.json',
    '_add_edges.json',
  ];
  for (const f of tempFiles) {
    const fp = path.join(cwd, f);
    try {
      if (fs.existsSync(fp)) {
        fs.unlinkSync(fp);
        removed.push(f);
      }
    } catch (_) { /* 同上 */ }
  }

  if (removed.length > 0) {
    console.log(`cleanup: ${removed.join(', ')} を削除しました。`);
  } else {
    console.log('cleanup: 削除対象の一時ファイルはありませんでした。');
  }
}

/**
 * backup: graphFile のバックアップを作成する（冪等）
 *
 * 古い .bak ファイルがあれば削除した上で、graphFile を graphFile.bak にコピーする。
 * 退行チェック（verify-graph-integrity.js）の --graph-before 引数で使用する。
 *
 * @param {StatusData} status — ステータスデータ（graphFile の取得に使用）
 */
function executeBackup(status) {
  const bakPath = status.graphFile + '.bak';
  try {
    if (fs.existsSync(bakPath)) {
      fs.unlinkSync(bakPath);
    }
    fs.copyFileSync(status.graphFile, bakPath);
    console.log(`backup: ${status.graphFile} → ${bakPath}`);
  } catch (err) {
    exitWithError(
      `バックアップ作成に失敗しました: ${err.message}`,
      `graphFile=${status.graphFile}`,
      'ディスク容量や書き込み権限を確認してください。'
    );
  }
}

// ============================================================
// ファイル入出力
// ============================================================

/**
 * 一時ファイル + rename でアトミックにファイルを書き込む
 *
 * 書き込み途中でプロセスが異常終了した場合でも、.tmp ファイルは残るが
 * 元ファイルは破損しない。これは rename が OS レベルのアトミック操作であるため。
 *
 * @param {string} targetPath — 書き込み先ファイルのパス
 * @param {string} data — 書き込むデータ（UTF-8文字列）
 */
function atomicWrite(targetPath, data) {
  const tmpPath = targetPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, data, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

// ============================================================
// ユーティリティ
// ============================================================

/**
 * エラー情報を3段テンプレートで stderr に出力し、プロセスを終了する
 *
 * @param {string} message — 何が起きたか
 * @param {string} reason — なぜ起きたか
 * @param {string} action — 次に取るべきアクション
 */
function exitWithError(message, reason, action) {
  console.error('[ERROR] ' + message);
  console.error('原因: ' + reason);
  console.error('対応: ' + action);
  process.exit(1);
}

/**
 * 使用方法を表示する
 */
function printUsage() {
  console.log(`
update-split-step-status.js — SPLIT-Status.json 管理（graphify非互換）

使用方法:
  node update-split-step-status.js --graphify-status=<path>|--status=<path> <subcommand> [N]
  node update-split-step-status.js --help

フラグ:
  --graphify-status=<path>  GRAPHIFY-Status.json のパス（従来形式）
  --status=<path>           上記のエイリアス（split-to-tickets 等でも汎用的に使用）

サブコマンド:
  start-step <N>    Step N を開始（running, currentStep=N）
  end-step <N>      Step N を正常終了（done, currentStep=N+1）
  fail-step <N>     Step N を異常終了（error, currentStep 不変）
  reset-to-step <N> Step N に復帰（N+1〜5 を pending に戻す）
  status            現在の状態を整形JSONで出力
  cleanup           既知の一時ファイルを全て削除（冪等）
  backup            graphFile の .bak ファイルを作成（退行チェック用）

Step番号: ${MIN_STEP}〜${MAX_STEP}
`);
}

// ============================================================
// エントリポイント
// ============================================================

/**
 * メイン処理: 引数パース、サブコマンドディスパッチ、ファイル書込を実行する
 */
function main() {
  let parsed;

  // Step 1: 引数パース
  try {
    parsed = parseArguments();
  } catch (parseError) {
    exitWithError(
      `引数パースに失敗しました: ${parseError.message}`,
      'コマンドライン引数の形式が正しくありません。',
      '--help オプションで使用方法を確認し、正しい引数で再実行してください。'
    );
  }

  const { statusPath, subcommand, stepNumber, stepLabel } = parsed;

  // Step 2: ステータスファイル読み込み（存在しなければデフォルト状態）
  let status;
  try {
    status = readStatus(statusPath);
  } catch (readError) {
    exitWithError(
      `ステータスファイルの読み込みに失敗しました: ${readError.message}`,
      `ファイルパス: ${statusPath}`,
      'ファイルが存在し、有効なJSON形式であることを確認してください。'
    );
  }

  // Step 3: サブコマンド実行
  try {
    switch (subcommand) {
      case 'start-step':
        if (!validateStepNumber(stepNumber)) {
          exitWithError(
            `Step番号が範囲外です: ${stepNumber}`,
            `Step番号は ${MIN_STEP}〜${MAX_STEP} の整数である必要があります。`,
            `${MIN_STEP}〜${MAX_STEP} の範囲の整数を指定して再実行してください。`
          );
        }
        executeStartStep(status, stepNumber, stepLabel);
        break;

      case 'end-step':
        if (!validateStepNumber(stepNumber)) {
          exitWithError(
            `Step番号が範囲外です: ${stepNumber}`,
            `Step番号は ${MIN_STEP}〜${MAX_STEP} の整数である必要があります。`,
            `${MIN_STEP}〜${MAX_STEP} の範囲の整数を指定して再実行してください。`
          );
        }
        executeEndStep(status, stepNumber, stepLabel);
        break;

      case 'fail-step':
        if (!validateStepNumber(stepNumber)) {
          exitWithError(
            `Step番号が範囲外です: ${stepNumber}`,
            `Step番号は ${MIN_STEP}〜${MAX_STEP} の整数である必要があります。`,
            `${MIN_STEP}〜${MAX_STEP} の範囲の整数を指定して再実行してください。`
          );
        }
        executeFailStep(status, stepNumber, stepLabel);
        break;

      case 'reset-to-step':
        if (!validateStepNumber(stepNumber)) {
          exitWithError(
            `Step番号が範囲外です: ${stepNumber}`,
            `Step番号は ${MIN_STEP}〜${MAX_STEP} の整数である必要があります。`,
            `${MIN_STEP}〜${MAX_STEP} の範囲の整数を指定して再実行してください。`
          );
        }
        executeResetToStep(status, stepNumber, stepLabel);
        break;

      case 'status':
        executeStatus(status);
        process.exit(0);
        // status はファイル書き込み不要で終了する

      case 'backup':
        executeBackup(status);
        process.exit(0);
        // backup はファイル書き込み不要で終了する

      case 'cleanup':
        executeCleanup(status);
        process.exit(0);
        // cleanup はファイル書き込み不要で終了する

      default:
        // parseArguments で検証済みなのでここには到達しない
        exitWithError(
          `未知のサブコマンドです: ${subcommand}`,
          'start-step / end-step / fail-step / reset-to-step / status / cleanup のいずれかを指定してください。',
          '正しいサブコマンド名で再実行してください。'
        );
    }
  } catch (execError) {
    exitWithError(
      `サブコマンド実行中にエラーが発生しました: ${execError.message}`,
      'サブコマンドの引数が不正か、内部エラーが発生しました。',
      'エラーメッセージを確認し、正しい引数で再実行してください。'
    );
  }

  // Step 4: アトミック書き込み
  // status サブコマンド以外はファイルを更新する
  try {
    atomicWrite(statusPath, JSON.stringify(status, null, 2));
  } catch (writeError) {
    exitWithError(
      `ステータスファイルの書き込みに失敗しました: ${writeError.message}`,
      `ファイルパス: ${statusPath}`,
      'ディスク容量や書き込み権限を確認してください。'
    );
  }
}

// 直接実行時のみ main() を呼び出す
if (require.main === module) {
  main();
}

module.exports = {
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
  executeBackup,
  atomicWrite,
  MIN_STEP,
  MAX_STEP,
  ALLOWED_SUBCOMMANDS,
  FLAG_GRAPHIFY_STATUS,
  FLAG_ALIAS_STATUS,
  STATUS_PENDING,
  STATUS_RUNNING,
  STATUS_DONE,
  STATUS_ERROR,
};
