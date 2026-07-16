#!/usr/bin/env node

/**
 * update-step-status.js — GRAPHIFY-Status.json management (5 subcommands)
 *
 * Manages the progress of the /graphify-rfc slash command.
 * Provides the following 5 operations on GRAPHIFY-Status.json:
 * - start-step  <N>  : Start Step N
 * - end-step    <N>  : Finish Step N normally
 * - fail-step   <N>  : Fail Step N abnormally
 * - reset-to-step <N>: Reset to Step N (set N+1 and later back to pending)
 * - status           : Output current status
 *
 * All writes use atomic write (temp file + rename),
 * ensuring the original file is never corrupted on process crash.
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// Constants
// ============================================================

/** Minimum step number (Step 0: heading deduplication) */
const MIN_STEP = 0;

/** Maximum step number (graphify-rfc has 5 Steps + Step 0 = 6 Steps) */
const MAX_STEP = 5;

/** Array of allowed subcommand names */
const ALLOWED_SUBCOMMANDS = [
  'start-step',
  'end-step',
  'fail-step',
  'reset-to-step',
  'status',
  'cleanup',
  'backup',
];

/** Primary flag: path to GRAPHIFY-Status.json */
const FLAG_GRAPHIFY_STATUS = '--graphify-status=';

/** Alias flag: alias for --graphify-status=, used generically in boundify as well */
const FLAG_ALIAS_STATUS = '--status=';

/** Step status: not started */
const STATUS_PENDING = 'pending';

/** Step status: in progress */
const STATUS_RUNNING = 'running';

/** Step status: completed */
const STATUS_DONE = 'done';

/** Step status: abnormally terminated */
const STATUS_ERROR = 'error';

// ============================================================
// Type: StatusData
// ============================================================

/**
 * Data structure of GRAPHIFY-Status.json
 *
 * @typedef {Object} StatusData
 * @property {string} sourceFile — Source file path to be graphed
 * @property {string} graphFile — Output graph file path
 * @property {number} currentStep — Current step number
 * @property {Object<string, string>} steps — State map for Steps 0-5 (keys are strings "0"-"5")
 */

// ============================================================
// Core Functions
// ============================================================

/**
 * Parses command line arguments
 *
 * @returns {{ statusPath: string, subcommand: string, stepNumber: number|null }}
 * @throws {Error} If arguments are invalid
 */
function parseArguments() {
  const args = process.argv.slice(2);

  // --help option
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(0);
  }

  // Minimum arguments: --graphify-status=<path> subcommand [N]
  if (args.length < 2) {
    throw new Error(
      '引数が不足しています。\n' +
      '  Usage: update-step-status.js --graphify-status=<path>|--status=<path> <subcommand> [N]'
    );
  }

  // Parse --graphify-status=<path> or --status=<path>
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

  // Validate subcommand
  if (!ALLOWED_SUBCOMMANDS.includes(subcommand)) {
    throw new Error(
      `未知のサブコマンドです: ${subcommand}`
    );
  }

  // Read step-number (required for all subcommands except status/cleanup/backup)
  let stepNumber = null;
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
  }

  return { statusPath, subcommand, stepNumber };
}

/**
 * Reads GRAPHIFY-Status.json. Returns default state if file does not exist.
 *
 * @param {string} statusPath — Path to the status file
 * @returns {StatusData} Parsed status data
 */
function readStatus(statusPath) {
  if (!fs.existsSync(statusPath)) {
    return createDefaultStatus(statusPath);
  }

  const raw = fs.readFileSync(statusPath, 'utf8');
  const data = JSON.parse(raw);

  // Basic validation of loaded data (check required fields)
  if (!data.sourceFile || !data.graphFile || typeof data.currentStep !== 'number' || !data.steps) {
    throw new Error(
      `${statusPath} の形式が不正です。sourceFile / graphFile / currentStep / steps が必要です。`
    );
  }

  return data;
}

/**
 * Generates default status data
 *
 * Extracts basename from the filename suffix and reverse-calculates sourceFile (.md) and graphFile (-GRAPH.json).
 * Supported suffixes:
 *   - GRAPHIFY: *-GRAPHIFY-Status.json → -GRAPHIFY is NOT removed from basename (for correct reverse calculation)
 *   - BOUNDIFY: *-BOUNDIFY-Status.json → -BOUNDIFY is NOT removed from basename
 *
 * @param {string} statusPath — Path to the status file
 * @returns {StatusData} Default status
 */
function createDefaultStatus(statusPath) {
  const dir = path.dirname(statusPath);
  const filename = path.basename(statusPath);

  // Remove known suffixes from filename to obtain basename
  const GRAPHIFY_SUFFIX = '-GRAPHIFY-Status.json';
  const BOUNDIFY_SUFFIX = '-BOUNDIFY-Status.json';
  let basename = filename;
  if (filename.endsWith(GRAPHIFY_SUFFIX)) {
    basename = filename.slice(0, -GRAPHIFY_SUFFIX.length);
  } else if (filename.endsWith(BOUNDIFY_SUFFIX)) {
    basename = filename.slice(0, -BOUNDIFY_SUFFIX.length);
  }

  // sourceFile: reverse-calculate original source file path from basename
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
 * Validates that the step number is within the range 0-5
 *
 * @param {number} n — Step number to validate
 * @returns {boolean} true if the step number is valid
 */
function validateStepNumber(n) {
  return Number.isInteger(n) && n >= MIN_STEP && n <= MAX_STEP;
}

/**
 * start-step <N>: Sets Step N to running state
 *
 * @param {StatusData} status — Status data to update
 * @param {number} n — Step number to start
 */
function executeStartStep(status, n) {
  status.steps[String(n)] = STATUS_RUNNING;
  status.currentStep = n;
  console.log(`Step ${n} を開始しました。状態: ${STATUS_RUNNING}。`);
}

/**
 * end-step <N>: Sets Step N to completed state
 *
 * After completion, currentStep advances to N+1.
 * When Step 5 completes, currentStep becomes 6 (indicating all steps complete).
 *
 * @param {StatusData} status — Status data to update
 * @param {number} n — Step number to complete
 */
function executeEndStep(status, n) {
  status.steps[String(n)] = STATUS_DONE;
  status.currentStep = n + 1;
  if (n >= MAX_STEP) {
    console.log(`Step ${n} が完了しました。全Stepが完了しました。`);
  } else {
    console.log(`Step ${n} が完了しました。状態: ${STATUS_DONE}。次に Step ${n + 1} を実行してください。`);
  }
}

/**
 * fail-step <N>: Sets Step N to error state
 *
 * Does not change currentStep (keeps position to allow resumption).
 *
 * @param {StatusData} status — Status data to update
 * @param {number} n — Step number that encountered an error
 */
function executeFailStep(status, n) {
  status.steps[String(n)] = STATUS_ERROR;
  // Does not change currentStep
  console.log(`Step ${n} が異常終了しました。状態: ${STATUS_ERROR}。currentStep は ${status.currentStep} のままです。エラーメッセージを確認して修正した上で、reset-to-step ${n} で再実行してください。`);
}

/**
 * reset-to-step <N>: Resets to Step N
 *
 * Sets all steps greater than N (N+1 to 5) back to pending.
 * Does not change the status of N itself (allows re-execution while preserving N's content).
 *
 * @param {StatusData} status — Status data to update
 * @param {number} n — Step number to reset to
 */
function executeResetToStep(status, n) {
  for (let i = n + 1; i <= MAX_STEP; i++) {
    status.steps[String(i)] = STATUS_PENDING;
  }
  status.currentStep = n;
  console.log(`Step ${n} に復帰しました。Step ${n} より後のStepを pending にリセットしました。Step ${n} のコマンドを最初から再実行してください。`);
}

/**
 * status: Outputs current status data as formatted JSON to stdout
 *
 * @param {StatusData} status — Status data to output
 */
function executeStatus(status) {
  console.log(JSON.stringify(status, null, 2));
}

/**
 * cleanup: Removes all known temporary files (idempotent)
 *
 * Targets:
 * - $graphFile.bak (same directory as graphFile)
 * - CWD temp files: _temp_nodes.json / _temp_edges.json / _patch.json
 *   / _remove_edges.json / _add_edges.json / _fix_graph_hints.json
 *
 * This function is idempotent. It is safe to run multiple times; if files do not exist,
 * it completes normally without deleting anything.
 *
 * @param {StatusData} status — Status data (used to obtain graphFile)
 */
function executeCleanup(status) {
  const removed = [];

  // .bak file (same directory as graph file)
  const bakPath = status.graphFile + '.bak';
  try {
    if (fs.existsSync(bakPath)) {
      fs.unlinkSync(bakPath);
      removed.push(bakPath);
    }
  } catch (_) { /* Deletion race etc. — ignore and continue */ }

  // CWD temp files
  const cwd = process.cwd();
  const tempFiles = [
    '_temp_nodes.json',
    '_temp_edges.json',
    '_patch.json',
    '_remove_edges.json',
    '_add_edges.json',
    '_fix_graph_hints.json',
  ];
  for (const fileName of tempFiles) {
    const filePath = path.join(cwd, fileName);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        removed.push(fileName);
      }
    } catch (_) { /* Same as above */ }
  }

  if (removed.length > 0) {
    console.log(`cleanup: ${removed.join(', ')} を削除しました。`);
  } else {
    console.log('cleanup: 削除対象の一時ファイルはありませんでした。');
  }
}

/**
 * backup: Creates a backup of graphFile (idempotent)
 *
 * Removes old .bak file if it exists, then copies graphFile to graphFile.bak.
 * Used by verify-graph-integrity.js with the --graph-before argument for regression checking.
 *
 * @param {StatusData} status — Status data (used for graphFile)
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
// File I/O
// ============================================================

/**
 * Write file atomically using temp file + rename
 *
 * Even if the process crashes mid-write, the .tmp file is left behind
 * but the original file remains uncorrupted, because rename is an OS-level atomic operation.
 *
 * @param {string} targetPath — Path to the target file
 * @param {string} data — Data to write (UTF-8 string)
 */
function atomicWrite(targetPath, data) {
  const tmpPath = targetPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, data, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

// ============================================================
// Utilities
// ============================================================

/**
 * Outputs error info in 3-section template to stderr and exits the process
 *
 * @param {string} message — What happened
 * @param {string} reason — Why it happened
 * @param {string} action — Next action to take
 */
function exitWithError(message, reason, action) {
  console.error('[ERROR] ' + message);
  console.error('原因: ' + reason);
  console.error('対応: ' + action);
  process.exit(1);
}

/**
 * Displays usage instructions
 */
function printUsage() {
  console.log(`
update-step-status.js — GRAPHIFY-Status.json / BOUNDIFY-Status.json 管理

使用方法:
  node update-step-status.js --graphify-status=<path>|--status=<path> <subcommand> [N]
  node update-step-status.js --help

フラグ:
  --graphify-status=<path>  GRAPHIFY-Status.json のパス（従来形式）
  --status=<path>           上記のエイリアス（boundify 等でも汎用的に使用）

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
// Entry Point
// ============================================================

/**
 * Main processing: parse arguments, dispatch subcommand, write file
 */
function main() {
  let parsed;

  // Step 1: Parse arguments
  try {
    parsed = parseArguments();
  } catch (parseError) {
    exitWithError(
      `引数パースに失敗しました: ${parseError.message}`,
      'コマンドライン引数の形式が正しくありません。',
      '--help オプションで使用方法を確認し、正しい引数で再実行してください。'
    );
  }

  const { statusPath, subcommand, stepNumber } = parsed;

  // Step 2: Read status file (or default state if not found)
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

  // Step 3: Execute subcommand
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
        executeStartStep(status, stepNumber);
        break;

      case 'end-step':
        if (!validateStepNumber(stepNumber)) {
          exitWithError(
            `Step番号が範囲外です: ${stepNumber}`,
            `Step番号は ${MIN_STEP}〜${MAX_STEP} の整数である必要があります。`,
            `${MIN_STEP}〜${MAX_STEP} の範囲の整数を指定して再実行してください。`
          );
        }
        executeEndStep(status, stepNumber);
        break;

      case 'fail-step':
        if (!validateStepNumber(stepNumber)) {
          exitWithError(
            `Step番号が範囲外です: ${stepNumber}`,
            `Step番号は ${MIN_STEP}〜${MAX_STEP} の整数である必要があります。`,
            `${MIN_STEP}〜${MAX_STEP} の範囲の整数を指定して再実行してください。`
          );
        }
        executeFailStep(status, stepNumber);
        break;

      case 'reset-to-step':
        if (!validateStepNumber(stepNumber)) {
          exitWithError(
            `Step番号が範囲外です: ${stepNumber}`,
            `Step番号は ${MIN_STEP}〜${MAX_STEP} の整数である必要があります。`,
            `${MIN_STEP}〜${MAX_STEP} の範囲の整数を指定して再実行してください。`
          );
        }
        executeResetToStep(status, stepNumber);
        break;

      case 'status':
        executeStatus(status);
        process.exit(0);
        // status exits without writing to file

      case 'backup':
        executeBackup(status);
        process.exit(0);
        // backup exits without writing to file

      case 'cleanup':
        executeCleanup(status);
        process.exit(0);
        // cleanup exits without writing to file

      default:
        // Already validated in parseArguments, so this path should never be reached
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

  // Step 4: Atomic write
  // Only subcommands other than "status" update the file
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

// Only call main() when executed directly
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
