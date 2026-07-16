#!/usr/bin/env node

/**
 * update-split-step-status.js — SPLIT-Status.json management (7 subcommands)
 *
 * Manages the progress of the /split-to-tickets slash command.
 * Provides the following 7 operations on SPLIT-Status.json:
 * - start-step  <STEP_ID>  : Start a step
 * - end-step    <STEP_ID>  : Finish a step normally
 * - fail-step   <STEP_ID>  : Fail a step abnormally
 * - reset-to-step <STEP_ID>: Reset to a step (set subsequent steps to pending)
 * - status           : Output current state
 * - cleanup          : Delete all known temporary files (idempotent)
 * - backup           : Create a .bak file of graphFile
 *
 * All writes use atomic write (temp file + rename) via atomicWrite,
 * ensuring the original file is never corrupted on process crash.
 *
 * Step IDs use actual step identifiers ("0-1", "0-2", "1", "4-1", etc.) directly.
 * This script is specific to /split-to-tickets.
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// Constants
// ============================================================

/** Array of all Step IDs in definition order (index defines progression order) */
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

/** Array of allowed subcommand names */
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

/** Primary flag: specifies the path to GRAPHIFY-Status.json */
const FLAG_GRAPHIFY_STATUS = '--graphify-status=';

/** Alias flag: alias for --graphify-status=, also used generically by split-to-tickets */
const FLAG_ALIAS_STATUS = '--status=';

/** Step status: not started (pending) */
const STATUS_PENDING = 'pending';

/** Step status: running */
const STATUS_RUNNING = 'running';

/** Step status: done */
const STATUS_DONE = 'done';

/** Step status: error (abnormally terminated) */
const STATUS_ERROR = 'error';

// ============================================================
// Type: StatusData
// ============================================================

/**
 * Data structure of GRAPHIFY-Status.json
 *
 * @typedef {Object} StatusData
 * @property {string} sourceFile — Path to the source file to be graphed
 * @property {string} graphFile — Path to the output graph file
 * @property {string} currentStep — Current step ID (e.g. "0-1", "4-2")
 * @property {Object<string, string>} steps — Step status map (keys are step IDs)
 */

// ============================================================
// Core Functions
// ============================================================

/**
 * Parses command-line arguments
 *
 * @returns {{ statusPath: string, subcommand: string, stepId: string|null }}
 * @throws {Error} If arguments are invalid
 */
function parseArguments() {
  const args = process.argv.slice(2);

  // --help option
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    process.exit(0);
  }

  // Minimum args: --graphify-status=<path> subcommand [STEP_ID]
  if (args.length < 2) {
    throw new Error(
      '引数が不足しています。\n' +
      '  Usage: update-split-step-status.js --graphify-status=<path>|--status=<path> <subcommand> [STEP_ID]'
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

  // Read step-id (required except for status/cleanup/backup/prune-phases/renumber-phases)
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
 * Read GRAPHIFY-Status.json. Returns default state if the file does not exist.
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

  // Basic validation of read data (check required fields)
  if (!data.sourceFile || !data.graphFile || typeof data.currentStep !== 'string' || !data.steps) {
    throw new Error(
      `${statusPath} の形式が不正です。sourceFile / graphFile / currentStep（string）/ steps が必要です。`
    );
  }

  return data;
}

/**
 * Generate default status data
 *
 * Extracts basename from the filename suffix and reverse-calculates sourceFile (.md) and graphFile (-GRAPH.json).
 * Supported suffixes:
 *   - GRAPHIFY: *-GRAPHIFY-Status.json → -GRAPHIFY is NOT removed from basename (for correct reverse calculation)
 *   - SPLIT: *-SPLIT-Status.json → -SPLIT is NOT removed from basename
 *
 * @param {string} statusPath — Path to the status file
 * @returns {StatusData} Default status
 */
function createDefaultStatus(statusPath) {
  const dir = path.dirname(statusPath);
  const filename = path.basename(statusPath);

  // Remove known suffixes from filename to obtain basename
  const GRAPHIFY_SUFFIX = '-GRAPHIFY-Status.json';
  const SPLIT_SUFFIX = '-SPLIT-Status.json';
  let basename = filename;
  if (filename.endsWith(GRAPHIFY_SUFFIX)) {
    basename = filename.slice(0, -GRAPHIFY_SUFFIX.length);
  } else if (filename.endsWith(SPLIT_SUFFIX)) {
    basename = filename.slice(0, -SPLIT_SUFFIX.length);
  }

  // sourceFile: reverse-calculate original source file path from basename
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
 * Validate whether the Step ID is a valid identifier
 *
 * @param {string} stepId — Step ID to validate
 * @returns {boolean} true if valid Step ID
 */
function validateStepId(stepId) {
  return STEP_ORDER.includes(stepId);
}

/**
 * start-step <STEP_ID>: Set a step to running state
 *
 * @param {StatusData} status — Status data to update
 * @param {string} stepId — Step ID to start
 */
function executeStartStep(status, stepId) {
  status.steps[stepId] = STATUS_RUNNING;
  status.currentStep = stepId;
  console.log(`[${stepId}] を開始しました。状態: ${STATUS_RUNNING}。`);
}

/**
 * end-step <STEP_ID>: Set a step to done state
 *
 * After completion, currentStep advances to the next Step ID in order.
 * When the final step completes, indicates all steps are done.
 *
 * @param {StatusData} status — Status data to update
 * @param {string} stepId — Step ID to finish
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
 * fail-step <STEP_ID>: Set a step to error state
 *
 * Does not change currentStep (keeps current position to allow resumption).
 *
 * @param {StatusData} status — Status data to update
 * @param {string} stepId — Step ID that encountered an error
 */
function executeFailStep(status, stepId) {
  status.steps[stepId] = STATUS_ERROR;
  console.log(`[${stepId}] が異常終了しました。状態: ${STATUS_ERROR}。currentStep は ${status.currentStep} のままです。エラーメッセージを確認して修正した上で、reset-to-step ${stepId} で再実行してください。`);
}

/**
 * reset-to-step <STEP_ID>: Reset to the specified step
 *
 * Sets all steps after the specified step back to pending.
 * Does not change the specified step's own status (preserves content for re-execution).
 *
 * @param {StatusData} status — Status data to update
 * @param {string} stepId — Step ID to reset to
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
 * status: Output current status data as formatted JSON to stdout
 *
 * @param {StatusData} status — Status data to output
 */
function executeStatus(status) {
  console.log(JSON.stringify(status, null, 2));
}

/**
 * cleanup: Delete all known temporary files (idempotent)
 *
 * Deletion targets:
 * - $graphFile.bak (same directory as graphFile)
 * - _temp_nodes.json / _temp_edges.json / _patch.json
 *   / _remove_edges.json / _add_edges.json under CWD
 *
 * This function is idempotent. Safe to run multiple times.
 * If files do not exist, exits normally without deleting anything.
 *
 * @param {StatusData} status — Status data (used for graphFile)
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
  } catch (_) { /* Deletion race, etc. — ignore and continue */ }

  // CWD temp files
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
    } catch (_) { /* Same as above */ }
  }

  if (removed.length > 0) {
    console.log(`cleanup: ${removed.join(', ')} を削除しました。`);
  } else {
    console.log('cleanup: 削除対象の一時ファイルはありませんでした。');
  }
}

/**
 * backup: Create a backup of graphFile (idempotent)
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

/**
 * prune-phases: Remove step status entries for specified phase IDs from status.steps.
 *
 * Receives a JSON array of phase IDs to remove from stdin.
 * Example: ["P0", "P3"]
 *
 * @param {StatusData} status — Status data to update
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
      // Matches keys like "P0" or "P0-1"
      if (key === phaseId || key.startsWith(phaseId + '-')) {
        delete status.steps[key];
        removedCount++;
        break;
      }
    }
  }

  // If currentStep contains a phase ID being removed, adjust to the first remaining step
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
 * renumber-phases: Rename phase ID prefixes in status.steps.
 *
 * Receives a mapping object of old ID -> new ID from stdin.
 * Example: {"0":"1", "3":"2"}
 *
 * @param {StatusData} status — Status data to update
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

  // Also convert currentStep
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
 * Output error info in 3-section template to stderr and exit the process
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

  const { statusPath, subcommand, stepId } = parsed;

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

  // Step 4: Atomic write
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
