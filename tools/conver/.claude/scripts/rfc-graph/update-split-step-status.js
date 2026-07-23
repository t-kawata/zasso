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
const { toHomeRelative } = require('../lib/path-utils');

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
      'Insufficient arguments.\n' +
      '  Usage: update-split-step-status.js --graphify-status=<path>|--status=<path> <subcommand> [STEP_ID]'
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

  // Read step-id (required except for status/cleanup/backup/prune-phases/renumber-phases)
  let stepId = null;
  if (subcommand !== 'status' && subcommand !== 'cleanup' && subcommand !== 'backup'
      && subcommand !== 'prune-phases' && subcommand !== 'renumber-phases') {
    if (args.length < 3) {
      throw new Error(
        `Subcommand "${subcommand}" requires a Step ID.`
      );
    }
    stepId = args[2];
    if (!stepId || stepId.trim() === '') {
      throw new Error(
        `Step ID is empty: "${args[2]}"`
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
      `${statusPath} has invalid format. sourceFile / graphFile / currentStep (string) / steps are required.`
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
  const sourceFile = toHomeRelative(path.resolve(dir, basename + '.md'));
  const graphFile = toHomeRelative(path.resolve(dir, basename + '-GRAPH.json'));

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
  console.log(`[${stepId}]  started. Status: ${STATUS_RUNNING}.`);
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
    console.log(`[${stepId}]  completed. All steps completed.`);
  } else {
    const nextId = STEP_ORDER[idx + 1];
    status.currentStep = nextId;
    console.log(`[${stepId}]  completed. Status: ${STATUS_DONE}. Next: [${nextId}].`);
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
  console.log(`[${stepId}]  terminated abnormally. Status: ${STATUS_ERROR}. currentStep is ${status.currentStep}. Check the error, fix the issue, then re-run with reset-to-step ${stepId}.`);
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
  console.log(`[${stepId}] . Reset subsequent steps to pending. [${stepId}]. Re-run the command from the beginning.`);
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
      'prune-phases: stdin JSON parse failed',
      parseError.message,
      'Input a JSON array of phase IDs to remove via stdin. Example: ["P0"]'
    );
  }

  if (!Array.isArray(phaseIdsToRemove) || phaseIdsToRemove.length === 0) {
    console.log('prune-phases: No phase IDs specified for removal.');
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

  console.log(`prune-phases: ${removedCount}  step status entries removed.`);
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
      'renumber-phases: stdin JSON parse failed',
      parseError.message,
      'Input a mapping object via stdin. Example: {"0":"1"}'
    );
  }

  const mappingKeys = Object.keys(mapping);
  if (mappingKeys.length === 0) {
    console.log('renumber-phases: No mapping specified.');
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

  console.log(`renumber-phases: ${updatedCount}  keys converted.`);
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
update-split-step-status.js — SPLIT-Status.json management

Usage:
  node update-split-step-status.js --graphify-status=<path>|--status=<path> <subcommand> [STEP_ID]
  node update-split-step-status.js --help

Flags:
  --graphify-status=<path>  Path to GRAPHIFY-Status.json (legacy format)
  --status=<path>           Alias for the above (used generically by split-to-tickets etc.)

Subcommands:
  start-step <STEP_ID>    Start step (running, currentStep=STEP_ID)
  end-step <STEP_ID>      Finish step normally (done, currentStep=next step)
  fail-step <STEP_ID>     Fail step abnormally (error, currentStep unchanged)
  reset-to-step <STEP_ID> Reset to specified step (subsequent steps set to pending)
  status                  Output current state as formatted JSON
  cleanup                 Delete all known temporary files (idempotent)
  backup                  Create .bak file of graphFile (for regression checking)

Step IDs (definition order): ${STEP_ORDER.join(', ')}
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

  const { statusPath, subcommand, stepId } = parsed;

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
        if (!validateStepId(stepId)) {
          exitWithError(
            `Unknown Step ID: ${stepId}`,
            `Valid Step IDs: ${STEP_ORDER.join(', ')}`,
            'Specify a valid Step ID and re-run.'
          );
        }
        executeStartStep(status, stepId);
        break;

      case 'end-step':
        if (!validateStepId(stepId)) {
          exitWithError(
            `Unknown Step ID: ${stepId}`,
            `Valid Step IDs: ${STEP_ORDER.join(', ')}`,
            'Specify a valid Step ID and re-run.'
          );
        }
        executeEndStep(status, stepId);
        break;

      case 'fail-step':
        if (!validateStepId(stepId)) {
          exitWithError(
            `Unknown Step ID: ${stepId}`,
            `Valid Step IDs: ${STEP_ORDER.join(', ')}`,
            'Specify a valid Step ID and re-run.'
          );
        }
        executeFailStep(status, stepId);
        break;

      case 'reset-to-step':
        if (!validateStepId(stepId)) {
          exitWithError(
            `Unknown Step ID: ${stepId}`,
            `Valid Step IDs: ${STEP_ORDER.join(', ')}`,
            'Specify a valid Step ID and re-run.'
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
          `Unknown subcommand: ${subcommand}`,
          'start-step / end-step / fail-step / reset-to-step / status / cleanup / backup / prune-phases / renumber-phases . Specify one of: ',
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
