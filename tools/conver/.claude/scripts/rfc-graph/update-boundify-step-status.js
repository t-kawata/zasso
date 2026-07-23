#!/usr/bin/env node

/**
 * update-boundify-step-status.js — BOUNDIFY-Status.json management (6 subcommands)
 *
 * Manages the progress of the /boundify-graph-to-dirs slash command.
 * Provides the following 6 operations on BOUNDIFY-Status.json:
 * - start-step  <N>  : Start Step N
 * - end-step    <N>  : Finish Step N normally
 * - fail-step   <N>  : Fail Step N abnormally
 * - reset-to-step <N>: Reset to Step N (set N+1 and later back to pending)
 * - status           : Output current status
 * - cleanup          : Delete all known temporary files (idempotent)
 * - backup           : Create a .bak file of graphFile
 *
 * All writes use atomic write (temp file + rename) via atomicWrite,
 * ensuring the original file is never corrupted on process crash.
 *
 * This script is specific to /boundify-graph-to-dirs. Step range is 0-3.
 */

const fs = require('fs');
const path = require('path');
const { toHomeRelative } = require('../lib/path-utils');

// ============================================================
// Constants
// ============================================================

/** Minimum step number (Step 0: heading deduplication) */
const MIN_STEP = 0;

/** Maximum step number (boundify-graph-to-dirs has Steps 0-3, 4 steps total) */
const MAX_STEP = 3;

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

/** Primary flag: specifies the path to GRAPHIFY-Status.json */
const FLAG_GRAPHIFY_STATUS = '--graphify-status=';

/** Alias flag: alias for --graphify-status=, also used generically by boundify */
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
 * @property {number} currentStep — Current step number in progress
 * @property {Object<string, string>} steps — Step 0-3 status map (keys are strings "0"-"3")
 */

// ============================================================
// Core Functions
// ============================================================

/**
 * Parses command-line arguments
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

  // Minimum args: --graphify-status=<path> subcommand [N]
  if (args.length < 2) {
    throw new Error(
      'Insufficient arguments.\n' +
      '  Usage: update-boundify-step-status.js --graphify-status=<path>|--status=<path> <subcommand> [N]'
    );
  }

  // Parse --graphify-status=<path> or --status=<path>
  const statusFlag = args[0];
  if (!statusFlag.startsWith(FLAG_GRAPHIFY_STATUS) && !statusFlag.startsWith(FLAG_ALIAS_STATUS)) {
    throw new Error(
      'First argument must be --graphify-status=<path> or --status=<path>.\n' +
      `  Actual value: ${statusFlag}`
    );
  }
  const statusPath = statusFlag.split('=', 2)[1];
  if (!statusPath) {
    throw new Error(
      'Path is empty. Specify a valid path for --graphify-status=<path> or --status=<path>.'
    );
  }

  const subcommand = args[1];

  // Validate subcommand
  if (!ALLOWED_SUBCOMMANDS.includes(subcommand)) {
    throw new Error(
      `Unknown subcommand: ${subcommand}`
    );
  }

  // Read step-number (required except for status/cleanup/backup)
  let stepNumber = null;
  if (subcommand !== 'status' && subcommand !== 'cleanup' && subcommand !== 'backup') {
    if (args.length < 3) {
      throw new Error(
        `Subcommand "${subcommand}" requires a step number.`
      );
    }
    stepNumber = parseInt(args[2], 10);
    if (isNaN(stepNumber)) {
      throw new Error(
        `Step number is not a number: ${args[2]}`
      );
    }
  }

  return { statusPath, subcommand, stepNumber };
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
  if (!data.sourceFile || !data.graphFile || typeof data.currentStep !== 'number' || !data.steps) {
    throw new Error(
      `${statusPath} has invalid format. sourceFile / graphFile / currentStep / steps are required.`
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
  const sourceFile = toHomeRelative(path.resolve(dir, basename + '.md'));
  const graphFile = toHomeRelative(path.resolve(dir, basename + '-GRAPH.json'));

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
 * Validate that the step number is within the range 0-3
 *
 * @param {number} n — Step number to validate
 * @returns {boolean} true if valid step number
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
  console.log(`Step ${n} started. Status: ${STATUS_RUNNING}.`);
}

/**
 * end-step <N>: Sets Step N to done state
 *
 * After completion, currentStep advances to N+1.
 * When Step 3 completes, currentStep becomes 4 (indicating all steps done).
 *
 * @param {StatusData} status — Status data to update
 * @param {number} n — Step number to finish
 */
function executeEndStep(status, n) {
  status.steps[String(n)] = STATUS_DONE;
  status.currentStep = n + 1;
  if (n >= MAX_STEP) {
    console.log(`Step ${n}  completed. All steps completed.`);
  } else {
    console.log(`Step ${n}  completed. Status: ${STATUS_DONE}. Next step: Step ${n + 1} .`);
  }
}

/**
 * fail-step <N>: Sets Step N to error state
 *
 * Does not change currentStep (keeps current position to allow resumption).
 *
 * @param {StatusData} status — Status data to update
 * @param {number} n — Step number that encountered an error
 */
function executeFailStep(status, n) {
  status.steps[String(n)] = STATUS_ERROR;
  // Does not change currentStep
  console.log(`Step ${n}  terminated abnormally. Status: ${STATUS_ERROR}. currentStep is ${status.currentStep}. Check the error message, fix the issue, then re-run with reset-to-step ${n}.`);
}

/**
 * reset-to-step <N>: Resets to Step N
 *
 * Sets all steps greater than N (N+1 .. 3) back to pending.
 * Does not change the status of N itself (preserves N content for re-execution).
 *
 * @param {StatusData} status — Status data to update
 * @param {number} n — Step number to reset to
 */
function executeResetToStep(status, n) {
  for (let i = n + 1; i <= MAX_STEP; i++) {
    status.steps[String(i)] = STATUS_PENDING;
  }
  status.currentStep = n;
  console.log(`Step ${n} . Reset to Step ${n}. Steps after Step ${n}. Re-run the command for Step `);
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
    console.log(`cleanup: ${removed.join(', ')} deleted.`);
  } else {
    console.log('cleanup: No temporary files to delete.');
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
      `Backup creation failed: ${err.message}`,
      `graphFile=${status.graphFile}`,
      'Check disk space and write permissions.'
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
 * Output error info in 3-section template to stderr and exit the process
 *
 * @param {string} message — What happened
 * @param {string} reason — Why it happened
 * @param {string} action — Next action to take
 */
function exitWithError(message, reason, action) {
  console.error('[ERROR] ' + message);
  console.error('Cause: ' + reason);
  console.error('Action: ' + action);
  process.exit(1);
}

/**
 * Displays usage instructions
 */
function printUsage() {
  console.log(`
update-boundify-step-status.js — BOUNDIFY-Status.json management

Usage:
  node update-boundify-step-status.js --graphify-status=<path>|--status=<path> <subcommand> [N]
  node update-boundify-step-status.js --help

Flags:
  --graphify-status=<path>  Path to GRAPHIFY-Status.json (legacy format)
  --status=<path>           Alias for the above (used generically by boundify etc.)

Subcommands:
  start-step <N>    Start Step N (running, currentStep=N)
  end-step <N>      Finish Step N normally (done, currentStep=N+1)
  fail-step <N>     Fail Step N abnormally (error, currentStep unchanged)
  reset-to-step <N> Reset to Step N (set N+1 through 5 to pending)
  status            Output current state as formatted JSON
  cleanup           Delete all known temporary files (idempotent)
  backup            Create .bak file of graphFile (for regression checking)

Step numbers: ${MIN_STEP} to ${MAX_STEP}
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
      `Argument parse failed: ${parseError.message}`,
      'Command-line argument format is invalid.',
      'Use --help to check usage, then re-run with correct arguments.'
    );
  }

  const { statusPath, subcommand, stepNumber } = parsed;

  // Step 2: Read status file (or default state if not found)
  let status;
  try {
    status = readStatus(statusPath);
  } catch (readError) {
    exitWithError(
      `Failed to read status file: ${readError.message}`,
      `File path: ${statusPath}`,
      'Verify the file exists and is valid JSON.'
    );
  }

  // Step 3: Execute subcommand
  try {
    switch (subcommand) {
      case 'start-step':
        if (!validateStepNumber(stepNumber)) {
          exitWithError(
            `Step number out of range: ${stepNumber}`,
            `Step number must be an integer between ${MIN_STEP} and ${MAX_STEP}. `,
            `Specify an integer in the range ${MIN_STEP} to ${MAX_STEP}.`
          );
        }
        executeStartStep(status, stepNumber);
        break;

      case 'end-step':
        if (!validateStepNumber(stepNumber)) {
          exitWithError(
            `Step number out of range: ${stepNumber}`,
            `Step number must be an integer between ${MIN_STEP} and ${MAX_STEP}. `,
            `Specify an integer in the range ${MIN_STEP} to ${MAX_STEP}.`
          );
        }
        executeEndStep(status, stepNumber);
        break;

      case 'fail-step':
        if (!validateStepNumber(stepNumber)) {
          exitWithError(
            `Step number out of range: ${stepNumber}`,
            `Step number must be an integer between ${MIN_STEP} and ${MAX_STEP}. `,
            `Specify an integer in the range ${MIN_STEP} to ${MAX_STEP}.`
          );
        }
        executeFailStep(status, stepNumber);
        break;

      case 'reset-to-step':
        if (!validateStepNumber(stepNumber)) {
          exitWithError(
            `Step number out of range: ${stepNumber}`,
            `Step number must be an integer between ${MIN_STEP} and ${MAX_STEP}. `,
            `Specify an integer in the range ${MIN_STEP} to ${MAX_STEP}.`
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
          `Unknown subcommand: ${subcommand}`,
          'start-step / end-step / fail-step / reset-to-step / status / cleanup . Specify one of: ',
          'Re-run with a valid subcommand name.'
        );
    }
  } catch (execError) {
    exitWithError(
      `Error occurred during subcommand execution: ${execError.message}`,
      'Subcommand arguments are invalid or an internal error occurred.',
      'Check the error message and re-run with correct arguments.'
    );
  }

  // Step 4: Atomic write
  // Only subcommands other than "status" update the file
  try {
    atomicWrite(statusPath, JSON.stringify(status, null, 2));
  } catch (writeError) {
    exitWithError(
      `Failed to write status file: ${writeError.message}`,
      `File path: ${statusPath}`,
      'Check disk space and write permissions.'
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
