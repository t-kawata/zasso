#!/usr/bin/env node

/**
 * update-split-step-status.js — SPLIT-Status.json 管理（6サブコマンド）
 *
 * /split-to-tickets スラッシュコマンドの進行状態を管理する。
 * SPLIT-Status.json に対して以下の6操作を提供する：
 * - start-step  <STEP_ID>  : Step を開始する
 * - end-step    <STEP_ID>  : Step を正常終了する
 * - fail-step   <STEP_ID>  : Step を異常終了する
 * - reset-to-step <STEP_ID>: Step に復帰する（後続Stepを pending に戻す）
 * - status           : 現在の状態を出力する
 * - cleanup          : 既知の一時ファイルを全て削除する（冪等）
 * - backup           : graphFile の .bak ファイルを作成する
 *
 * 全書き込みは一時ファイル + rename のアトミック書込（atomicWrite）で行われ、
 * プロセス異常終了時に元ファイルが破損することはない。
 *
 * Step ID は実際のステップ識別子（"0-1", "0-2", "1", "4-1" 等）をそのまま使用する。
 * 本スクリプトは /split-to-tickets 専用。
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 定数定義
// ============================================================

/** 全Step ID の定義順配列（インデックスが進行順序） */
const STEP_ORDER = [
  '0-1',
  '0-2',
  '1',
  '2',
  '3',
  '4-1',
  '4-2',
  '5-1',
  '5-2',
  '5-3',
  '6',
];

/** 認容されるサブコマンド名の配列 */
const ALLOWED_SUBCOMMANDS = [
  'start-step',
  'end-step',
  'fail-step',
  'reset-to-step',
  'status',
  'cleanup',
  'backup',
  'prune-phases',
  'renumber-phases',
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

// ============================================================
// 型: StatusData
// ============================================================

/**
 * GRAPHIFY-Status.json のデータ構造
 *
 * @typedef {Object} StatusData
 * @property {string} sourceFile — グラフ化対象のソースファイルパス
 * @property {string} graphFile — 出力先グラフファイルパス
 * @property {string} currentStep — 現在の進行Step ID（例: "0-1", "4-2"）
 * @property {Object<string, string>} steps — Step状態マップ（キーは Step ID）
 */

// ============================================================
// コア関数
// ============================================================

/**
 * コマンドライン引数をパースする
 *
 * @returns {{ statusPath: string, subcommand: string, stepId: string|null }}
 * @throws {Error} 引数が不正な場合
 */
function parseArguments() {
  const args = process.argv.slice(2);

  // --help オプション
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(0);
  }

  // 最小引数: --graphify-status=<path> subcommand [STEP_ID]
  if (args.length < 2) {
    throw new Error(
      '引数が不足しています。\n' +
      '  Usage: update-split-step-status.js --graphify-status=<path>|--status=<path> <subcommand> [STEP_ID]'
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

  // step-id の読み取り（status / cleanup / backup / prune-phases / renumber-phases 以外は必須）
  let stepId = null;
  if (subcommand !== 'status' && subcommand !== 'cleanup' && subcommand !== 'backup'
      && subcommand !== 'prune-phases' && subcommand !== 'renumber-phases') {
    if (args.length < 3) {
      throw new Error(
        `サブコマンド "${subcommand}" には Step ID が必要です。`
      );
    }
    stepId = args[2];
    if (!stepId || stepId.trim() === '') {
      throw new Error(
        `Step ID が空です: "${args[2]}"`
      );
    }
  }

  return { statusPath, subcommand, stepId };
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
  if (!data.sourceFile || !data.graphFile || typeof data.currentStep !== 'string' || !data.steps) {
    throw new Error(
      `${statusPath} の形式が不正です。sourceFile / graphFile / currentStep（string）/ steps が必要です。`
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
  for (const stepId of STEP_ORDER) {
    steps[stepId] = STATUS_PENDING;
  }

  return {
    sourceFile,
    graphFile,
    currentStep: STEP_ORDER[0],
    steps,
  };
}

/**
 * Step ID が有効な識別子か検証する
 *
 * @param {string} stepId — 検証対象のStep ID
 * @returns {boolean} 有効なStep IDなら true
 */
function validateStepId(stepId) {
  return STEP_ORDER.includes(stepId);
}

/**
 * start-step <STEP_ID>: Step を開始状態に設定する
 *
 * @param {StatusData} status — 更新対象のステータスデータ
 * @param {string} stepId — 開始するStep ID
 */
function executeStartStep(status, stepId) {
  status.steps[stepId] = STATUS_RUNNING;
  status.currentStep = stepId;
  console.log(`[${stepId}] を開始しました。状態: ${STATUS_RUNNING}。`);
}

/**
 * end-step <STEP_ID>: Step を正常終了状態に設定する
 *
 * 完了後、currentStep は順序配列上の次の Step ID に進む。
 * 最終Step完了時は全Step完了を示す。
 *
 * @param {StatusData} status — 更新対象のステータスデータ
 * @param {string} stepId — 終了するStep ID
 */
function executeEndStep(status, stepId) {
  status.steps[stepId] = STATUS_DONE;
  const idx = STEP_ORDER.indexOf(stepId);
  if (idx === STEP_ORDER.length - 1) {
    status.currentStep = stepId;
    console.log(`[${stepId}] が完了しました。全Stepが完了しました。`);
  } else {
    const nextId = STEP_ORDER[idx + 1];
    status.currentStep = nextId;
    console.log(`[${stepId}] が完了しました。状態: ${STATUS_DONE}。次に [${nextId}] を実行してください。`);
  }
}

/**
 * fail-step <STEP_ID>: Step を異常終了状態に設定する
 *
 * currentStep は変更しない（現在位置を維持して再開可能にする）。
 *
 * @param {StatusData} status — 更新対象のステータスデータ
 * @param {string} stepId — 異常終了したStep ID
 */
function executeFailStep(status, stepId) {
  status.steps[stepId] = STATUS_ERROR;
  console.log(`[${stepId}] が異常終了しました。状態: ${STATUS_ERROR}。currentStep は ${status.currentStep} のままです。エラーメッセージを確認して修正した上で、reset-to-step ${stepId} で再実行してください。`);
}

/**
 * reset-to-step <STEP_ID>: 指定されたStepに復帰する
 *
 * 指定されたStepより後続の全Stepを pending に戻す。
 * 指定されたStep自身のステータスは変更しない（内容を保持したまま再実行可能にする）。
 *
 * @param {StatusData} status — 更新対象のステータスデータ
 * @param {string} stepId — 復帰先のStep ID
 */
function executeResetToStep(status, stepId) {
  const idx = STEP_ORDER.indexOf(stepId);
  for (let i = idx + 1; i < STEP_ORDER.length; i++) {
    status.steps[STEP_ORDER[i]] = STATUS_PENDING;
  }
  status.currentStep = stepId;
  console.log(`[${stepId}] に復帰しました。後続のStepを pending にリセットしました。[${stepId}] のコマンドを最初から再実行してください。`);
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

/**
 * prune-phases: 指定されたフェーズIDのStep状態エントリを status.steps から削除する。
 *
 * stdin から削除するフェーズIDのJSON配列を受け取る。
 * 例: ["P0", "P3"]
 *
 * @param {StatusData} status — 更新対象のステータスデータ
 */
function executePrunePhases(status) {
  let phaseIdsToRemove = [];
  try {
    const stdinData = fs.readFileSync(process.stdin.fd, 'utf8').trim();
    if (stdinData) {
      phaseIdsToRemove = JSON.parse(stdinData);
    }
  } catch (parseError) {
    exitWithError(
      'prune-phases: stdin のJSONパースに失敗しました',
      parseError.message,
      '削除するフェーズIDのJSON配列をstdinから入力してください。例: ["P0"]'
    );
  }

  if (!Array.isArray(phaseIdsToRemove) || phaseIdsToRemove.length === 0) {
    console.log('prune-phases: 削除対象のフェーズIDが指定されていません。');
    return;
  }

  let removedCount = 0;
  for (const key of Object.keys(status.steps)) {
    for (const phaseId of phaseIdsToRemove) {
      // "P0" または "P0-1" のようなキーにマッチ
      if (key === phaseId || key.startsWith(phaseId + '-')) {
        delete status.steps[key];
        removedCount++;
        break;
      }
    }
  }

  // currentStep が削除対象のフェーズIDを含む場合、最初の残存Stepに調整
  if (status.currentStep) {
    for (const phaseId of phaseIdsToRemove) {
      if (status.currentStep === phaseId || status.currentStep.startsWith(phaseId + '-')) {
        const remainingKeys = Object.keys(status.steps);
        status.currentStep = remainingKeys.length > 0 ? remainingKeys[0] : '';
        break;
      }
    }
  }

  console.log(`prune-phases: ${removedCount} 件のStep状態を削除しました。`);
}

/**
 * renumber-phases: status.steps のフェーズID接頭辞をリネームする。
 *
 * stdin から旧ID→新ID のマッピングオブジェクトを受け取る。
 * 例: {"0":"1", "3":"2"}
 *
 * @param {StatusData} status — 更新対象のステータスデータ
 */
function executeRenumberPhases(status) {
  let mapping = {};
  try {
    const stdinData = fs.readFileSync(process.stdin.fd, 'utf8').trim();
    if (stdinData) {
      mapping = JSON.parse(stdinData);
    }
  } catch (parseError) {
    exitWithError(
      'renumber-phases: stdin のJSONパースに失敗しました',
      parseError.message,
      'マッピングオブジェクトをstdinから入力してください。例: {"0":"1"}'
    );
  }

  const mappingKeys = Object.keys(mapping);
  if (mappingKeys.length === 0) {
    console.log('renumber-phases: マッピングが指定されていません。');
    return;
  }

  const newSteps = {};
  let updatedCount = 0;
  for (const [key, value] of Object.entries(status.steps)) {
    let newKey = key;
    for (const oldId of mappingKeys) {
      const prefix = 'P' + oldId;
      if (key === prefix || key.startsWith(prefix + '-')) {
        newKey = 'P' + mapping[oldId] + key.slice(prefix.length);
        updatedCount++;
        break;
      }
    }
    newSteps[newKey] = value;
  }
  status.steps = newSteps;

  // currentStep も変換
  if (status.currentStep) {
    for (const oldId of mappingKeys) {
      const prefix = 'P' + oldId;
      if (status.currentStep === prefix || status.currentStep.startsWith(prefix + '-')) {
        status.currentStep = 'P' + mapping[oldId] + status.currentStep.slice(prefix.length);
        break;
      }
    }
  }

  console.log(`renumber-phases: ${updatedCount} 件のキーを変換しました。`);
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
  node update-split-step-status.js --graphify-status=<path>|--status=<path> <subcommand> [STEP_ID]
  node update-split-step-status.js --help

フラグ:
  --graphify-status=<path>  GRAPHIFY-Status.json のパス（従来形式）
  --status=<path>           上記のエイリアス（split-to-tickets 等でも汎用的に使用）

サブコマンド:
  start-step <STEP_ID>    Step を開始（running, currentStep=STEP_ID）
  end-step <STEP_ID>      Step を正常終了（done, currentStep=次のStep）
  fail-step <STEP_ID>     Step を異常終了（error, currentStep 不変）
  reset-to-step <STEP_ID> 指定Stepに復帰（後続Stepを pending に戻す）
  status                  現在の状態を整形JSONで出力
  cleanup                 既知の一時ファイルを全て削除（冪等）
  backup                  graphFile の .bak ファイルを作成（退行チェック用）

Step ID（定義順）: ${STEP_ORDER.join(', ')}
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

  const { statusPath, subcommand, stepId } = parsed;

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
        if (!validateStepId(stepId)) {
          exitWithError(
            `未知のStep ID です: ${stepId}`,
            `有効なStep ID: ${STEP_ORDER.join(', ')}`,
            '有効なStep ID を指定して再実行してください。'
          );
        }
        executeStartStep(status, stepId);
        break;

      case 'end-step':
        if (!validateStepId(stepId)) {
          exitWithError(
            `未知のStep ID です: ${stepId}`,
            `有効なStep ID: ${STEP_ORDER.join(', ')}`,
            '有効なStep ID を指定して再実行してください。'
          );
        }
        executeEndStep(status, stepId);
        break;

      case 'fail-step':
        if (!validateStepId(stepId)) {
          exitWithError(
            `未知のStep ID です: ${stepId}`,
            `有効なStep ID: ${STEP_ORDER.join(', ')}`,
            '有効なStep ID を指定して再実行してください。'
          );
        }
        executeFailStep(status, stepId);
        break;

      case 'reset-to-step':
        if (!validateStepId(stepId)) {
          exitWithError(
            `未知のStep ID です: ${stepId}`,
            `有効なStep ID: ${STEP_ORDER.join(', ')}`,
            '有効なStep ID を指定して再実行してください。'
          );
        }
        executeResetToStep(status, stepId);
        break;

      case 'status':
        executeStatus(status);
        process.exit(0);

      case 'backup':
        executeBackup(status);
        process.exit(0);

      case 'cleanup':
        executeCleanup(status);
        process.exit(0);

      case 'prune-phases':
        executePrunePhases(status);
        break;

      case 'renumber-phases':
        executeRenumberPhases(status);
        break;

      default:
        exitWithError(
          `未知のサブコマンドです: ${subcommand}`,
          'start-step / end-step / fail-step / reset-to-step / status / cleanup / backup / prune-phases / renumber-phases のいずれかを指定してください。',
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
  validateStepId,
  executeStartStep,
  executeEndStep,
  executeFailStep,
  executeResetToStep,
  executeStatus,
  executeCleanup,
  executeBackup,
  executePrunePhases,
  executeRenumberPhases,
  atomicWrite,
  STEP_ORDER,
  ALLOWED_SUBCOMMANDS,
  FLAG_GRAPHIFY_STATUS,
  FLAG_ALIAS_STATUS,
  STATUS_PENDING,
  STATUS_RUNNING,
  STATUS_DONE,
  STATUS_ERROR,
};
